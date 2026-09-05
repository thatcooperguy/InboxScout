import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { syncFolder } from '../mail/imap'
import { classifyBatch, chunk, BATCH_SIZE } from '../ai/classify'
import { decideTracking, applyTrackingDecisions } from '../ai/track'
import { generateBrief } from '../ai/brief'
import { trackReplies } from './replies'
import { renderHtml, renderMarkdown } from '../reports/render'
import { getProfile } from '../profiles/profiles'
import { loadSettings, saveSettings } from '../settings'
import { SecretStore, accountSecretName, providerSecretName } from '../secrets'
import { resolveModel, DEFAULT_MODELS } from '../ai/provider'
import type { Classification, MessageRecord, RunProgress } from '../../shared/types'

export interface PipelineResult {
  runId: string
  reportId: string | null
  messagesScanned: number
  issueCount: number
  error: string | null
}

export async function runPipeline(
  db: DB,
  secrets: SecretStore,
  trigger: 'manual' | 'scheduled' | 'catchup' | 'cli',
  onProgress: (p: RunProgress) => void = () => {}
): Promise<PipelineResult> {
  const settings = loadSettings(db)
  const profile = getProfile(settings.profileId)
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
    const apiKey = secrets.get(providerSecretName(settings.ai.provider)) ?? ''
    if (!apiKey && settings.ai.provider !== 'ollama') {
      throw new Error(`No API key connected for provider "${settings.ai.provider}". Open AI settings to connect one.`)
    }
    const model = resolveModel(settings.ai, apiKey)
    const modelName = settings.ai.model || DEFAULT_MODELS[settings.ai.provider]

    // 1. Fetch
    onProgress({ phase: 'fetch', detail: 'Checking mail accounts…' })
    const accounts = repo.listAccounts(db)
    if (accounts.length === 0) throw new Error('No email accounts connected yet.')
    const newMessages: MessageRecord[] = []
    for (const account of accounts) {
      const password = secrets.get(accountSecretName(account.id))
      if (!password) continue
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
    }

    // 2. Classify (skip our own sent mail)
    const toClassify = newMessages.filter((m) => !m.fromMe)
    onProgress({ phase: 'classify', detail: `Classifying ${toClassify.length} new messages…` })
    const corrections = repo.listCorrections(db, 10)
    const classifications: Classification[] = []
    for (const batch of chunk(toClassify, BATCH_SIZE)) {
      const results = await classifyBatch(model, profile, batch, corrections)
      for (const m of batch) {
        const r = results.get(m.id)
        if (!r) continue
        const c: Classification = {
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
    const periodType = settings.schedule.frequency === 'weekly' ? 'weekly' : 'daily'
    const brief = await generateBrief(model, {
      profile,
      periodType,
      projects: repo.listProjects(db, true),
      openIssues: repo.listIssues(db, true),
      personalMessages: personalPairs,
      sensitiveMessages: sensitivePairs,
      deadlines,
      replies
    })

    // 5. Render & save
    onProgress({ phase: 'save', detail: 'Saving report…' })
    const now = new Date()
    const markdown = renderMarkdown(brief, profile, periodType, now)
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
    repo.insertReport(db, {
      id: reportId,
      runId,
      periodType,
      createdAt: now.toISOString(),
      markdown,
      html,
      filePath
    })

    saveSettings(db, { ...settings, lastRunAt: now.toISOString() })
    repo.finishRun(db, runId, 'succeeded', newMessages.length, null)
    onProgress({ phase: 'done', detail: 'Brief ready.' })
    return {
      runId,
      reportId,
      messagesScanned: newMessages.length,
      issueCount: brief.topIssues.length,
      error: null
    }
  } catch (err: any) {
    const message = String(err?.message ?? err)
    repo.finishRun(db, runId, 'failed', 0, message)
    onProgress({ phase: 'error', detail: message })
    return { runId, reportId: null, messagesScanned: 0, issueCount: 0, error: message }
  }
}

function recentThreadMessages(db: DB): MessageRecord[] {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString()
  return repo.getMessages(
    db,
    (db.prepare('SELECT id FROM messages WHERE date >= ?').all(cutoff) as any[]).map((r) => r.id)
  )
}
