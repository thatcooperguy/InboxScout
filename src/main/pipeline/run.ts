import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { syncFolder } from '../mail/imap'
import { getAccessToken, syncGraphFolder } from '../mail/graph'
import { ensureAccessToken, syncGmail, GMAIL_FOLDER, type GoogleTokens } from '../mail/gmail'
import { googleClient, microsoftClientId } from '../config'
import { pickOutbox, sendMail, smsAddress, smsText } from '../delivery/email'
import { appendTrackerRows, uploadBriefAsDoc } from '../mail/drive'
import { classifyBatch, chunk, isObviousNoise, mapConcurrent, withTransientRetry, BATCH_SIZE, CLASSIFY_CONCURRENCY } from '../ai/classify'
import { decideTracking, applyTrackingDecisions } from '../ai/track'
import { generateBrief } from '../ai/brief'
import { trackReplies } from './replies'
import { renderHtml, renderMarkdown } from '../reports/render'
import { getProfile } from '../profiles/profiles'
import { applyAutoProfile } from '../profiles/auto'
import { buildPeople, inferOwnerName, inferVipAddresses, summarizePeople } from '../people/engine'
import { buildSchedule, type ScheduleItem } from '../schedule/engine'
import { extractPromises } from './promises'
import { detectScams, trustedSendersFrom } from './scams'
import { dedupeAcrossAccounts, summarizeInboxes } from './inboxes'
import { loadSettings, markLastRunAt } from '../settings'
import { afterRun as helpersAfterRun, findHelperNotes } from '../helpers/index'
import { failingAccounts } from '../health/checks'
import { invalidateAskCache } from '../ask/local'
import { META_LAST_ATTEMPT_AT } from '../scheduler'
import { SecretStore, accountSecretName, providerSecretName } from '../secrets'
import { resolveModel, DEFAULT_MODELS, LOCAL_PROVIDERS } from '../ai/provider'
import { classifyMessageHeuristically, deriveIssues, buildBasicBrief } from '../ai/builtin'
import type { ClassifiableMessage, MessageClassificationOutput } from '../ai/schemas'
// Reads attachments and photos (v1.5): the store (Agent 1's module) and the pipeline's plumbing around it.
import * as attachmentStore from '../attachments/index'
import type { FetchedMessage } from '../mail/types'
import { attachmentNotes, buildVision, ingestAttachments, readNewAttachments, supportsVision } from './attachments'
import {
  applySkillEffects,
  buildSkillSections,
  dispatchAgents,
  loadCustomSkills,
  matchSkills,
  resolveSkills,
  skillPromptHints
} from '../skills/engine'
import type { SkillMatch } from '../skills/types'
import {
  FAIL_THRESHOLD,
  META_AI_ERROR,
  META_AI_FAILS,
  isAuthError,
  isStaleSyncError,
  metaReauthAt,
  metaResyncAt,
  metaSyncError,
  metaSyncFails,
  withAiFallback
} from '../health/checks'
import type { Category, Classification, MessageRecord, RunProgress } from '../../shared/types'

export { withAiFallback }

export interface PipelineOptions {
  skillsDir?: string
  /** Self-healing: mint a fresh app password for an account whose sign-in stopped working (wired by ipc.ts). */
  reauthAccount?: (accountId: string) => Promise<{ ok: boolean; message: string }>
  /** Diagnostics log (wired by index.ts; silent in tests). */
  log?: (level: 'info' | 'warn' | 'error', area: string, message: string, extra?: unknown) => void
  /** Reads attachments (v1.5): where attachment files live (`userData/attachments`). Without it, files are listed but never kept or read. */
  userDataDir?: string
}

/** Repairs are attempted once a day per account, so a bad night never turns into a loop. */
const REPAIR_COOLDOWN_MS = 24 * 60 * 60 * 1000

export interface PipelineResult {
  runId: string
  reportId: string | null
  messagesScanned: number
  issueCount: number
  error: string | null
  /** Non-fatal problems after the brief was saved (delivery, Drive export). */
  notices: string[]
}

export async function runPipeline(
  db: DB,
  secrets: SecretStore,
  trigger: 'manual' | 'scheduled' | 'catchup' | 'cli',
  onProgress: (p: RunProgress) => void = () => {},
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  let settings = loadSettings(db)
  let profile = getProfile(settings.profileId)
  let profileNotice: string | null = null
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const log = opts.log ?? (() => {})
  /** Plain-language notes collected during the run ("Fixed on its own: …", "AI helper unavailable…"). */
  const runNotices: string[] = []
  // AI resilience: the first failure of the AI helper switches the rest of this run to the built-in engine.
  let aiDown = false
  const aiFailed = (step: string, reason: string): void => {
    log('warn', 'ai', `${step} failed; using the built-in engine for the rest of this run`, { reason })
    if (aiDown) return
    aiDown = true
    repo.bumpCounter(db, META_AI_FAILS)
    repo.setMeta(db, META_AI_ERROR, reason)
    runNotices.push(`AI helper unavailable this time (${reason}) — used the built-in engine`)
  }
  repo.insertRun(db, {
    id: runId,
    startedAt,
    finishedAt: null,
    status: 'running',
    trigger,
    messagesScanned: 0,
    error: null
  })
  // The scheduler backs off catch-up retries from this stamp; `lastRunAt` only moves when a run succeeds.
  repo.setMeta(db, META_LAST_ATTEMPT_AT, startedAt)

  try {
    const useBuiltin = settings.ai.provider === 'builtin'
    const apiKey = secrets.get(providerSecretName(settings.ai.provider)) ?? ''
    if (!apiKey && !LOCAL_PROVIDERS.includes(settings.ai.provider) && settings.ai.provider !== 'custom') {
      throw new Error(`No API key connected for provider "${settings.ai.provider}". Open Setup → AI helper to add one.`)
    }
    const model = useBuiltin ? null : resolveModel(settings.ai, apiKey)
    const modelName = useBuiltin ? 'builtin/rules-v1' : settings.ai.model || DEFAULT_MODELS[settings.ai.provider]

    // Skills: built-in watchers plus any custom JSON skills the user dropped in.
    const custom = opts.skillsDir ? loadCustomSkills(opts.skillsDir) : { skills: [], errors: [] }
    let { enabled: skills } = resolveSkills(settings.profileId, settings.enabledSkillIds, custom.skills)
    const skillCtx = { vipSenders: [...settings.vipSenders], mutedSenders: settings.mutedSenders }
    let promptHints = skillPromptHints(skills)
    const allMatches: SkillMatch[] = []

    // 1. Fetch
    onProgress({ phase: 'fetch', detail: 'Checking mail accounts…' })
    const accounts = repo.listAccounts(db)
    if (accounts.length === 0) throw new Error('No email accounts connected yet.')
    const newMessages: MessageRecord[] = []
    const syncErrors: string[] = custom.errors.map((e) => `Custom skill problem: ${e}`)
    const accountFailed: { account: (typeof accounts)[number]; message: string; count: number }[] = []
    // Reads attachments (v1.5): keep the bytes of a new message's files, then drop them from memory.
    const keepAttachments = settings.readAttachments !== 'off' && !!opts.userDataDir
    let attachmentsSaved = 0
    const accept = (fetched: FetchedMessage[]): void => {
      for (const f of fetched) {
        const { attachments, ...m } = f
        if (!repo.insertMessage(db, m)) continue
        newMessages.push(m)
        if (keepAttachments && attachments?.length) attachmentsSaved += ingestAttachments(db, opts.userDataDir!, m, attachments, attachmentStore)
      }
    }
    for (const account of accounts) {
      // One broken account must never block the others.
      try {
        if (account.provider === 'gmailapi') {
          const raw = secrets.get(accountSecretName(account.id))
          if (!raw) throw new Error('Google sign-in missing — reconnect this account.')
          const g = googleClient(settings)
          const tokens = await ensureAccessToken(g.clientId, g.clientSecret, JSON.parse(raw) as GoogleTokens)
          if (tokens.accessToken !== (JSON.parse(raw) as GoogleTokens).accessToken) {
            secrets.set(accountSecretName(account.id), JSON.stringify(tokens))
          }
          onProgress({ phase: 'fetch', detail: `${account.email} — Gmail` })
          const historyId = repo.getMeta(db, `gmail-history:${account.id}`)
          const result = await syncGmail(tokens.accessToken, account, historyId || null, settings.storeFullBodies)
          accept(result.messages)
          if (result.historyId) repo.setMeta(db, `gmail-history:${account.id}`, result.historyId)
          repo.setSyncState(db, account.id, GMAIL_FOLDER, 1, Date.now())
          repo.setMeta(db, metaSyncFails(account.id), '0')
          continue
        }
        if (account.provider === 'outlook') {
          const homeAccountId = repo.getMeta(db, `graph-home:${account.id}`) ?? ''
          const clientId = microsoftClientId(settings)
          const store = {
            load: () => secrets.get(accountSecretName(account.id)),
            save: (v: string) => secrets.set(accountSecretName(account.id), v)
          }
          const token = await getAccessToken(clientId, store, homeAccountId)
          for (const folder of account.folders) {
            onProgress({ phase: 'fetch', detail: `${account.email} — ${folder}` })
            const state = repo.getSyncState(db, account.id, folder)
            const result = await syncGraphFolder(token, account, folder, state.lastUid, settings.storeFullBodies)
            accept(result.messages)
            repo.setSyncState(db, account.id, folder, 1, result.lastMs)
          }
          repo.setMeta(db, metaSyncFails(account.id), '0')
          continue
        }
        const password = secrets.get(accountSecretName(account.id))
        if (!password) throw new Error('no saved password — reconnect this account.')
        for (const folder of account.folders) {
          onProgress({ phase: 'fetch', detail: `${account.email} — ${folder}` })
          const state = repo.getSyncState(db, account.id, folder)
          const result = await syncFolder(
            account,
            password,
            folder,
            state.uidValidity,
            state.lastUid,
            settings.storeFullBodies
          )
          accept(result.messages)
          repo.setSyncState(db, account.id, folder, result.uidValidity, result.lastUid)
        }
        repo.setMeta(db, metaSyncFails(account.id), '0')
      } catch (err: any) {
        const message = String(err?.message ?? err)
        syncErrors.push(`${account.email}: ${message}`)
        const count = repo.bumpCounter(db, metaSyncFails(account.id))
        repo.setMeta(db, metaSyncError(account.id), message)
        log('error', 'sync', `${account.email} failed (${count} in a row)`, { message })
        accountFailed.push({ account, message, count })
      }
    }
    // Self-healing: after a couple of failures in a row, fix what can be fixed without the person.
    const nowMs = Date.now()
    const coolingDown = (key: string): boolean => {
      const last = repo.getMeta(db, key)
      return !!last && nowMs - new Date(last).getTime() < REPAIR_COOLDOWN_MS
    }
    for (const f of accountFailed) {
      if (f.count < FAIL_THRESHOLD) continue
      if (isAuthError(f.message)) {
        if (!opts.reauthAccount || coolingDown(metaReauthAt(f.account.id))) continue
        repo.setMeta(db, metaReauthAt(f.account.id), new Date(nowMs).toISOString())
        try {
          const r = await opts.reauthAccount(f.account.id)
          runNotices.push(r.ok ? r.message : `${f.account.email}: ${r.message}`)
        } catch (err: any) {
          log('warn', 'health', 'reauth failed to start', { accountId: f.account.id, error: String(err?.message ?? err) })
        }
      } else if (isStaleSyncError(f.message)) {
        if (coolingDown(metaResyncAt(f.account.id))) continue
        repo.setMeta(db, metaResyncAt(f.account.id), new Date(nowMs).toISOString())
        repo.resetSyncState(db, f.account.id)
        log('info', 'health', 'sync state reset after stale-bookmark errors', { accountId: f.account.id })
        runNotices.push(`Fixed on its own: reset the sync bookmark for ${f.account.email}; the next scan starts fresh.`)
      }
    }
    const accountFailures = syncErrors.length - custom.errors.length
    if (accountFailures === accounts.length && newMessages.length === 0) {
      throw new Error(`Could not check any account. ${syncErrors.join(' | ')}`)
    }

    // 1c. Reads attachments and photos (v1.5): read what is inside the new files before anything is classified,
    // so an invoice in a PDF or a bill in a photo counts like the email itself. Documents are read on this
    // computer; images go to the AI helper only when it can see them, otherwise the built-in reader (OCR).
    let attachmentContext = new Map<string, string>()
    let attachmentFiles = new Map<string, string[]>()
    if (keepAttachments && (attachmentsSaved > 0 || newMessages.some((m) => m.hasAttachments))) {
      onProgress({ phase: 'classify', detail: attachmentsSaved > 0 ? `Reading ${attachmentsSaved} attachment${attachmentsSaved === 1 ? '' : 's'}…` : 'Reading attachments…' })
      const vision = model && !aiDown && supportsVision(settings.ai.provider) ? buildVision(model, log) : null
      const read = await readNewAttachments(db, attachmentStore, { messageIds: newMessages.map((m) => m.id), vision, log, limit: 40 })
      attachmentContext = read.context
      attachmentFiles = read.files
      log('info', 'attachments', `read ${read.done} attachment${read.done === 1 ? '' : 's'}${read.failed ? ` (${read.failed} could not be read)` : ''}`, {
        saved: attachmentsSaved,
        withFindings: read.context.size,
        vision: !!vision
      })
    }

    // 1a. Who is in this person's life (all inboxes). Inner circle counts as important automatically.
    const myAddresses = accounts.map((a) => a.email.trim().toLowerCase())
    // Bodies clipped to the 2000 characters the people engine actually reads (item 6): a mature
    // database no longer materialises ~80 MB of message text for every run.
    const circleMessages = repo.messagesSinceLite(db, 120, 4000, 2000)
    // One IN (…) query per 500 ids instead of one query per message (item 7); refreshed after classification.
    const categories = repo.categoryMap(
      db,
      circleMessages.map((m) => m.id)
    )
    const categoryOfStored = (id: string): Category | undefined => categories.get(id)
    const people = settings.insightsEnabled
      ? buildPeople({
          messages: circleMessages,
          categoryOf: categoryOfStored,
          myAddresses,
          now: new Date(),
          ownerName: inferOwnerName(circleMessages, myAddresses),
          quietPeople: settings.quietPeople
        })
      : []
    if (people.length) {
      repo.replacePeople(db, people)
      for (const a of inferVipAddresses(people)) if (!skillCtx.vipSenders.includes(a)) skillCtx.vipSenders.push(a)
    }

    // 1b. "Choose for me": pick the profile that fits this mail, then re-resolve skills if it changed.
    {
      // Fetching can take a minute; reload first so a profile switch is saved on top of any preference
      // the person changed meanwhile, not on top of the copy this run loaded at start.
      settings = { ...loadSettings(db), ai: settings.ai }
      const auto = applyAutoProfile(db, settings)
      profileNotice = auto.notice
      if (auto.changed) {
        settings = auto.settings
        profile = auto.profile
        skills = resolveSkills(settings.profileId, settings.enabledSkillIds, custom.skills).enabled
        promptHints = skillPromptHints(skills)
        onProgress({ phase: 'classify', detail: `Using the "${profile.name}" profile…` })
      }
    }

    // 2. Classify (skip our own sent mail). What the attached files said rides along as plain text (v1.5).
    const toClassify: ClassifiableMessage[] = newMessages
      .filter((m) => !m.fromMe)
      .map((m) => (attachmentContext.has(m.id) ? { ...m, attachments: attachmentContext.get(m.id) } : m))
    onProgress({ phase: 'classify', detail: `Sorting ${toClassify.length} new messages…` })
    const corrections = repo.listCorrections(db, 10)
    const classifications: Classification[] = []
    const heuristicBatch = (batch: ClassifiableMessage[]): Map<string, MessageClassificationOutput> => {
      const map = new Map<string, MessageClassificationOutput>()
      for (const m of batch) map.set(m.id, classifyMessageHeuristically(m, profile))
      return map
    }
    // Item 4: obvious noise keeps the built-in verdict and never costs an AI call.
    const obviousNoise = new Set(model ? toClassify.filter(isObviousNoise).map((m) => m.id) : [])
    const forAi = toClassify.filter((m) => !obviousNoise.has(m.id))
    type ChunkResult = { results: Map<string, MessageClassificationOutput>; byRules: boolean }
    const classifyChunk = async (batch: ClassifiableMessage[]): Promise<ChunkResult> => {
      if (!model || aiDown) return { results: heuristicBatch(batch), byRules: true }
      let byRules = false
      const results = await withAiFallback(
        () => withTransientRetry(() => classifyBatch(model, profile, batch, corrections, promptHints)),
        () => {
          byRules = true
          return heuristicBatch(batch)
        },
        (reason) => aiFailed('Classifying', reason)
      )
      return { results, byRules }
    }
    // Item 3: a few chunks in flight at once; results are applied in input order below.
    const batches = [...chunk(toClassify.filter((m) => obviousNoise.has(m.id)), BATCH_SIZE), ...chunk(forAi, BATCH_SIZE)]
    const batchResults = await mapConcurrent(batches, CLASSIFY_CONCURRENCY, async (batch): Promise<ChunkResult> =>
      obviousNoise.has(batch[0].id) ? { results: heuristicBatch(batch), byRules: true } : classifyChunk(batch)
    )
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      const { results, byRules } = batchResults[b]
      for (const m of batch) {
        const r = results.get(m.id)
        if (!r) continue
        const matches = matchSkills(m, skills, skillCtx)
        const raw: Classification = {
          messageId: m.id,
          category: r.category,
          importance: r.importance,
          screening: r.screening,
          isActionable: r.isActionable,
          actionSummary: r.actionSummary,
          deadline: r.deadline,
          topics: r.topics,
          projectHint: r.projectHint,
          people: r.people,
          sensitivity: r.sensitivity,
          runId,
          model: byRules ? 'builtin/rules-v1' : modelName,
          corrected: false
        }
        const c = applySkillEffects(m, raw, matches, skills, skillCtx)
        for (const sm of matches) repo.insertSkillMatch(db, sm, runId)
        allMatches.push(...matches)
        repo.upsertClassification(db, c)
        classifications.push(c)
      }
    }
    // 2b. Scam guard (v1.6): rules only, so it protects every install. A likely scam is filed as noise and
    // never becomes a "Needs you" item or a reply owed; the warning itself rides on the brief.
    const scamWarnings = detectScams(toClassify, { trustedSenders: trustedSendersFrom(people) })
    const likelyScam = new Set(scamWarnings.filter((w) => w.level === 'likely').map((w) => w.messageId))
    for (const c of classifications) {
      if (!likelyScam.has(c.messageId)) continue
      c.category = 'promotions_noise'
      c.screening = 'other'
      c.isActionable = false
      c.actionSummary = null
      c.deadline = null
      c.importance = Math.min(c.importance, 1)
      repo.upsertClassification(db, c)
    }
    const messageById = new Map(toClassify.map((m) => [m.id, m]))
    const pair = (c: Classification) => ({ message: messageById.get(c.messageId)!, classification: c })

    // 3. Track work entities
    const workPairs = classifications.filter((c) => c.category === 'work' && messageById.has(c.messageId)).map(pair)
    if (workPairs.length > 0) {
      onProgress({ phase: 'track', detail: `Updating ${profile.pulseName}…` })
      const trackHeuristically = (): void => {
        for (const i of deriveIssues(repo.listIssues(db, false), workPairs, new Date().toISOString())) {
          repo.upsertIssue(db, i)
        }
      }
      if (!model || aiDown) {
        trackHeuristically()
      } else {
        await withAiFallback(
          async () => {
            const decisions = await withTransientRetry(() => decideTracking(model, profile, repo.listProjects(db), repo.listIssues(db, true), workPairs))
            const applied = applyTrackingDecisions(repo.listProjects(db), repo.listIssues(db), decisions, new Date().toISOString())
            for (const p of applied.projects) repo.upsertProject(db, p)
            for (const i of applied.issues) repo.upsertIssue(db, i)
          },
          trackHeuristically,
          (reason) => aiFailed('Tracking', reason)
        )
      }
    }

    // 4. Brief
    onProgress({ phase: 'brief', detail: 'Writing your brief…' })
    for (const c of classifications) categories.set(c.messageId, c.category)
    const threadMessages = recentThreadMessages(db)
    for (const [id, cat] of repo.categoryMap(
      db,
      threadMessages.filter((m) => !categories.has(m.id)).map((m) => m.id)
    )) {
      categories.set(id, cat)
    }
    const replies = trackReplies(threadMessages, categoryOfStored, new Date())
    const personalPairs = classifications
      .filter((c) => c.category === 'personal' && messageById.has(c.messageId))
      .map(pair)
    const sensitivePairs = classifications
      .filter((c) => c.sensitivity.length > 0 && messageById.has(c.messageId))
      .map(pair)
    const deadlines = classifications
      .filter((c) => c.deadline && messageById.has(c.messageId))
      .map((c) => `${c.deadline} — ${messageById.get(c.messageId)!.subject}`)
    const periodType = settings.schedule.frequency === 'weekly' ? ('weekly' as const) : ('daily' as const)
    const skillSections = buildSkillSections(allMatches, messageById, skills)
    const recapWindowMs = periodType === 'weekly' ? 7 * 86400000 : 86400000
    const resolvedRecently = repo.resolvedSince(db, new Date(Date.now() - recapWindowMs).toISOString())
    // Hand matched items to any custom agents before writing the brief so failures are visible in it.
    syncErrors.push(...(await dispatchAgents(allMatches, messageById, skills)))
    const briefInputs = {
      profile,
      periodType,
      projects: repo.listProjects(db, true),
      openIssues: repo.listIssues(db, true),
      personalMessages: personalPairs,
      sensitiveMessages: sensitivePairs,
      deadlines,
      replies,
      skillSections,
      promptHints,
      resolvedRecently,
      // Reads attachments (v1.5): lets an issue say "from the attached invoice.pdf".
      attachmentNotes: attachmentNotes(toClassify, attachmentFiles)
    }
    const brief =
      model && !aiDown
        ? await withAiFallback(
            () => withTransientRetry(() => generateBrief(model, briefInputs)),
            () => buildBasicBrief(briefInputs),
            (reason) => aiFailed('Writing the brief', reason)
          )
        : buildBasicBrief(briefInputs)
    // The AI helper answered every time this run: its failure streak is over.
    if (model && !aiDown) repo.setMeta(db, META_AI_FAILS, '0')
    if (scamWarnings.length) brief.scamWarnings = scamWarnings

    // 4b. Quiet intelligence: circle, unified schedule, promises, per-inbox view. Computed always, shown only when useful.
    if (settings.insightsEnabled) {
      const nowDate = new Date()
      brief.people = summarizePeople(people, nowDate)
      const promises = extractPromises({ messages: ownMessagesWithBodies(db, circleMessages, myAddresses, nowDate), myAddresses, now: nowDate })
      brief.promises = promises
      const items: ScheduleItem[] = []
      for (const d of repo.recentDeadlines(db, 45)) {
        items.push({ title: d.subject, dateText: d.deadline, source: 'deadline', sourceLabel: 'Deadline', person: d.fromName || d.fromAddress, accountId: d.accountId, messageId: d.messageId, seenOn: d.date })
      }
      const skillName = new Map(skills.map((s) => [s.id, s]))
      for (const sm of repo.recentSkillMatches(db, 90)) {
        const when = sm.extracted['when'] || sm.extracted['dueDate'] || sm.extracted['date']
        if (!when) continue
        const skill = skillName.get(sm.skillId)
        const isTravel = sm.skillId === 'travel'
        const isAppt = sm.skillId === 'appointments' || /booking|session|shift|activit|class/i.test(sm.skillId)
        items.push({
          title: sm.subject,
          dateText: when,
          source: isTravel ? 'travel' : isAppt ? 'appointment' : 'skill',
          sourceLabel: skill?.name ?? sm.skillId,
          person: sm.fromName || sm.fromAddress,
          accountId: sm.accountId,
          messageId: sm.messageId,
          seenOn: sm.date
        })
      }
      for (const p of promises) if (p.due) items.push({ title: `Promise to ${p.to}: ${p.text}`, dateText: p.due, source: 'promise', sourceLabel: 'Promise', person: p.to, messageId: p.messageId, seenOn: p.madeOn })
      const schedule = buildSchedule(items, nowDate)
      brief.schedule = { days: schedule.days, recurring: schedule.recurring, conflicts: schedule.conflicts, overdue: schedule.overdue }
      const newIds = new Set(newMessages.map((m) => m.id))
      brief.inboxes = summarizeInboxes(accounts, dedupeAcrossAccounts(circleMessages), categoryOfStored, replies, newIds)
    }

    // 4c. Trusted helpers (v1.4): replies helpers sent to InboxScout mail, found in the person's own inbox.
    if (settings.helpers.length > 0) {
      brief.helperNotes = findHelperNotes(circleMessages, settings.helpers, { now: new Date() })
    }

    // 5. Render & save
    onProgress({ phase: 'save', detail: 'Saving report…' })
    const now = new Date()
    const markdown = renderMarkdown(brief, profile, periodType, now, syncErrors)
    const html = renderHtml(markdown)
    let filePath: string | null = null
    if (settings.reportsDir) {
      try {
        mkdirSync(settings.reportsDir, { recursive: true })
        const stamp = now.toISOString().slice(0, 10)
        filePath = join(settings.reportsDir, `brief-${stamp}-${runId.slice(0, 8)}.html`)
        writeFileSync(filePath, html, 'utf8')
        writeFileSync(filePath.replace(/\.html$/, '.md'), markdown, 'utf8')
      } catch {
        filePath = null
      }
    }
    const reportId = randomUUID()
    repo.insertReport(
      db,
      { id: reportId, runId, periodType, createdAt: now.toISOString(), markdown, html, filePath },
      JSON.stringify(brief)
    )

    markLastRunAt(db, now.toISOString())
    repo.finishRun(db, runId, 'succeeded', newMessages.length, null)

    // A new brief exists: "Ask about your mail" must answer from it, not the previous one.
    invalidateAskCache()

    // 6. Deliver (to you and the helpers you named) and export - never fatal.
    const notices: string[] = [...(profileNotice ? [profileNotice] : []), ...runNotices]
    if ((trigger === 'scheduled' || trigger === 'catchup') && !settings.helpersPaused && settings.helpers.length > 0) {
      onProgress({ phase: 'save', detail: 'Telling your helpers…' })
      notices.push(
        ...(await helpersAfterRun(
          { db, secrets, log },
          {
            brief,
            trigger,
            newClassifications: classifications,
            messages: toClassify,
            people,
            failingAccounts: failingAccounts({ accounts: () => accounts, getMeta: (k) => repo.getMeta(db, k) }),
            now,
            markdown,
            runStartedAt: startedAt
          }
        ))
      )
    }
    const outbox = pickOutbox(accounts, null)
    const outboxPassword = outbox ? secrets.get(accountSecretName(outbox.id)) : null
    const topTitles = brief.topIssues.map((i) => i.title)
    if (settings.deliverEmailTo || (settings.smsPhone && settings.smsCarrier)) {
      if (!outbox || !outboxPassword) {
        notices.push('Delivery skipped: connect a Gmail, Yahoo, or iCloud account with an app password to use as the outbox.')
      } else {
        onProgress({ phase: 'save', detail: 'Sending your brief…' })
        if (settings.deliverEmailTo) {
          try {
            await sendMail(outbox, outboxPassword, settings.deliverEmailTo, `InboxScout brief — ${now.toDateString()}`, html, markdown)
          } catch (err: any) {
            notices.push(`Email delivery failed: ${String(err?.message ?? err)}`)
          }
        }
        const sms = settings.smsPhone && settings.smsCarrier ? smsAddress(settings.smsPhone, settings.smsCarrier) : null
        if (settings.smsPhone && settings.smsCarrier && !sms) notices.push('Text delivery skipped: check the phone number and carrier.')
        if (sms) {
          try {
            const text = smsText(brief.headline, topTitles)
            // Plain text only (item 14): carrier gateways render a multipart HTML part as an attachment or drop it.
            await sendMail(outbox, outboxPassword, sms, '', undefined, text)
          } catch (err: any) {
            notices.push(`Text delivery failed: ${String(err?.message ?? err)}`)
          }
        }
      }
    }
    if (settings.googleDriveExport) {
      const gAccount = accounts.find((a) => a.provider === 'gmailapi')
      const raw = gAccount ? secrets.get(accountSecretName(gAccount.id)) : null
      if (!gAccount || !raw) {
        notices.push('Google Drive export skipped: sign in with Google first (Setup → Email accounts).')
      } else {
        try {
          const g = googleClient(settings)
          const tokens = await ensureAccessToken(g.clientId, g.clientSecret, JSON.parse(raw) as GoogleTokens)
          secrets.set(accountSecretName(gAccount.id), JSON.stringify(tokens))
          await uploadBriefAsDoc(tokens.accessToken, `InboxScout brief ${now.toISOString().slice(0, 10)}`, html)
          const sheetId = repo.getMeta(db, 'drive-tracker-sheet')
          const rows = repo
            .listIssues(db, true)
            .map((i) => [now.toISOString().slice(0, 10), 'Issue', i.title, `${i.state}/${i.severity}`, i.ownerAction ?? '', i.deadline ?? ''])
          const newId = await appendTrackerRows(tokens.accessToken, sheetId, rows)
          if (newId !== sheetId) repo.setMeta(db, 'drive-tracker-sheet', newId)
        } catch (err: any) {
          notices.push(`Google Drive export failed: ${String(err?.message ?? err)} (you may need to sign in with Google again to allow Drive access)`)
        }
      }
    }

    // 7. Hand the brief to an agent (Hermes webhook) so it can act on it with its own tools.
    if (settings.agentWebhookUrl) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const res = await fetch(settings.agentWebhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(settings.agentWebhookToken ? { authorization: `Bearer ${settings.agentWebhookToken}` } : {})
          },
          body: JSON.stringify({
            event: 'brief',
            source: 'inboxscout',
            createdAt: now.toISOString(),
            reportId,
            periodType,
            headline: brief.headline,
            brief,
            markdown,
            messagesScanned: newMessages.length,
            notices
          }),
          signal: controller.signal
        })
        clearTimeout(timer)
        if (!res.ok) notices.push(`Agent webhook returned HTTP ${res.status}`)
      } catch (err: any) {
        notices.push(`Agent webhook failed: ${String(err?.message ?? err)}`)
      }
    }

    onProgress({ phase: 'done', detail: 'Brief ready.' })
    return {
      runId,
      reportId,
      messagesScanned: newMessages.length,
      issueCount: brief.topIssues.length,
      error: null,
      notices
    }
  } catch (err: any) {
    const message = String(err?.message ?? err)
    repo.finishRun(db, runId, 'failed', 0, message)
    log('error', 'pipeline', 'run failed', { runId, trigger, message })
    onProgress({ phase: 'error', detail: message })
    return { runId, reportId: null, messagesScanned: 0, issueCount: 0, error: message, notices: runNotices }
  }
}

/** The reply tracker reads who spoke last in each thread — never a body — so the 30-day window loads none. */
function recentThreadMessages(db: DB): MessageRecord[] {
  return repo.messagesSinceLite(db, 30, 50000, 0)
}

/** Promise window: the owner's own mail from the last 21 days, with full bodies (the only rows that need them). */
const PROMISE_WINDOW_DAYS = 21
function ownMessagesWithBodies(db: DB, messages: MessageRecord[], myAddresses: string[], now: Date): MessageRecord[] {
  const mine = new Set(myAddresses)
  const cutoff = now.getTime() - PROMISE_WINDOW_DAYS * 86400000
  const ids = messages
    .filter((m) => (m.fromMe || mine.has(m.fromAddress.trim().toLowerCase())) && Date.parse(m.date) >= cutoff)
    .map((m) => m.id)
  return repo.getMessages(db, ids)
}
