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
import { classifyBatch, chunk, BATCH_SIZE } from '../ai/classify'
import { decideTracking, applyTrackingDecisions } from '../ai/track'
import { generateBrief } from '../ai/brief'
import { trackReplies } from './replies'
import { renderHtml, renderMarkdown } from '../reports/render'
import { getProfile } from '../profiles/profiles'
import { applyAutoProfile } from '../profiles/auto'
import { buildPeople, inferOwnerName, inferVipAddresses, summarizePeople } from '../people/engine'
import { buildSchedule, type ScheduleItem } from '../schedule/engine'
import { extractPromises } from './promises'
import { dedupeAcrossAccounts, summarizeInboxes } from './inboxes'
import { loadSettings, saveSettings } from '../settings'
import { SecretStore, accountSecretName, providerSecretName } from '../secrets'
import { resolveModel, DEFAULT_MODELS, LOCAL_PROVIDERS } from '../ai/provider'
import { classifyMessageHeuristically, deriveIssues, buildBasicBrief } from '../ai/builtin'
import type { MessageClassificationOutput } from '../ai/schemas'
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
import type { Category, Classification, MessageRecord, RunProgress } from '../../shared/types'

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
  opts: { skillsDir?: string } = {}
): Promise<PipelineResult> {
  let settings = loadSettings(db)
  let profile = getProfile(settings.profileId)
  let profileNotice: string | null = null
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  repo.insertRun(db, {
    id: runId,
    startedAt,
    finishedAt: null,
    status: 'running',
    trigger,
    messagesScanned: 0,
    error: null
  })

  try {
    const useBuiltin = settings.ai.provider === 'builtin'
    const apiKey = secrets.get(providerSecretName(settings.ai.provider)) ?? ''
    if (!apiKey && !LOCAL_PROVIDERS.includes(settings.ai.provider) && settings.ai.provider !== 'custom') {
      throw new Error(`No API key connected for provider "${settings.ai.provider}". Open Connect AI to add one.`)
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
          for (const m of result.messages) {
            if (repo.insertMessage(db, m)) newMessages.push(m)
          }
          if (result.historyId) repo.setMeta(db, `gmail-history:${account.id}`, result.historyId)
          repo.setSyncState(db, account.id, GMAIL_FOLDER, 1, Date.now())
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
            for (const m of result.messages) {
              if (repo.insertMessage(db, m)) newMessages.push(m)
            }
            repo.setSyncState(db, account.id, folder, 1, result.lastMs)
          }
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
          for (const m of result.messages) {
            if (repo.insertMessage(db, m)) newMessages.push(m)
          }
          repo.setSyncState(db, account.id, folder, result.uidValidity, result.lastUid)
        }
      } catch (err: any) {
        syncErrors.push(`${account.email}: ${String(err?.message ?? err)}`)
      }
    }
    const accountFailures = syncErrors.length - custom.errors.length
    if (accountFailures === accounts.length && newMessages.length === 0) {
      throw new Error(`Could not check any account. ${syncErrors.join(' | ')}`)
    }

    // 1a. Who is in this person's life (all inboxes). Inner circle counts as important automatically.
    const myAddresses = accounts.map((a) => a.email.trim().toLowerCase())
    const circleMessages = repo.messagesSince(db, 120)
    const categoryOfStored = (id: string): Category | undefined => repo.getClassifications(db, [id])[0]?.category
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

    // 2. Classify (skip our own sent mail)
    const toClassify = newMessages.filter((m) => !m.fromMe)
    onProgress({ phase: 'classify', detail: `Classifying ${toClassify.length} new messages…` })
    const corrections = repo.listCorrections(db, 10)
    const classifications: Classification[] = []
    const classifyChunk = async (batch: MessageRecord[]): Promise<Map<string, MessageClassificationOutput>> => {
      if (!model) {
        const map = new Map<string, MessageClassificationOutput>()
        for (const m of batch) map.set(m.id, classifyMessageHeuristically(m, profile))
        return map
      }
      return classifyBatch(model, profile, batch, corrections, promptHints)
    }
    for (const batch of chunk(toClassify, BATCH_SIZE)) {
      const results = await classifyChunk(batch)
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
          model: modelName,
          corrected: false
        }
        const c = applySkillEffects(m, raw, matches, skills, skillCtx)
        for (const sm of matches) repo.insertSkillMatch(db, sm, runId)
        allMatches.push(...matches)
        repo.upsertClassification(db, c)
        classifications.push(c)
      }
    }
    const messageById = new Map(toClassify.map((m) => [m.id, m]))
    const pair = (c: Classification) => ({ message: messageById.get(c.messageId)!, classification: c })

    // 3. Track work entities
    const workPairs = classifications.filter((c) => c.category === 'work' && messageById.has(c.messageId)).map(pair)
    if (workPairs.length > 0) {
      onProgress({ phase: 'track', detail: `Updating ${profile.pulseName}…` })
      if (!model) {
        for (const i of deriveIssues(repo.listIssues(db, false), workPairs, new Date().toISOString())) {
          repo.upsertIssue(db, i)
        }
      } else {
        const decisions = await decideTracking(model, profile, repo.listProjects(db), repo.listIssues(db, true), workPairs)
        const applied = applyTrackingDecisions(
          repo.listProjects(db),
          repo.listIssues(db),
          decisions,
          new Date().toISOString()
        )
        for (const p of applied.projects) repo.upsertProject(db, p)
        for (const i of applied.issues) repo.upsertIssue(db, i)
      }
    }

    // 4. Brief
    onProgress({ phase: 'brief', detail: 'Writing your brief…' })
    const replies = trackReplies(
      recentThreadMessages(db),
      (id) => repo.getClassifications(db, [id])[0]?.category,
      new Date()
    )
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
      resolvedRecently
    }
    const brief = model ? await generateBrief(model, briefInputs) : buildBasicBrief(briefInputs)

    // 4b. Quiet intelligence: circle, unified schedule, promises, per-inbox view. Computed always, shown only when useful.
    if (settings.insightsEnabled) {
      const nowDate = new Date()
      brief.people = summarizePeople(people, nowDate)
      const promises = extractPromises({ messages: circleMessages, myAddresses, now: nowDate })
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

    saveSettings(db, { ...settings, lastRunAt: now.toISOString() })
    repo.finishRun(db, runId, 'succeeded', newMessages.length, null)

    // 6. Deliver (to you only) and export - never fatal.
    const notices: string[] = profileNotice ? [profileNotice] : []
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
            await sendMail(outbox, outboxPassword, sms, '', `<p>${text}</p>`, text)
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
    onProgress({ phase: 'error', detail: message })
    return { runId, reportId: null, messagesScanned: 0, issueCount: 0, error: message, notices: [] }
  }
}

function recentThreadMessages(db: DB): MessageRecord[] {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  return repo.getMessages(
    db,
    (db.prepare('SELECT id FROM messages WHERE date >= ?').all(cutoff) as any[]).map((r) => r.id)
  )
}
