import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings, saveSettings } from '../settings'
import { RECIPES } from '../agent/policy'
import { deleteSignin, listSignins, saveSignin, type SecretsLike } from '../signins'
import { PROFILES, PROFILE_GROUPS, PROFILE_LIST, getProfile } from '../profiles/profiles'
import { detectProfile } from '../profiles/detect'
import { recentDetectInput } from '../profiles/auto'
import type { DesktopControl } from '../desktop/control'
import type { AccountConfig, Answer, AppSettings, HealthReport } from '../../shared/types'
import { askAndWait } from '../ask/index'
// Reads attachments (v1.5)
import { attachmentText, attachmentsFor } from '../attachments/index'
import { findAttachment, publicAttachment } from '../pipeline/attachments'
// Trusted helpers (v1.4, A5)
import { addHelper, cancelAsk, listHelperLog, listHelpers, maskHelper, pauseAll, removeHelper, scheduleAsk, updateHelper, type HelperDeps } from '../helpers/index'

/**
 * Everything another agent may do with InboxScout, as one list of named
 * operations. The REST bridge and the MCP server both dispatch here, so
 * Hermes gets the same abilities whichever door it comes in through.
 *
 * Electron-free so it can be unit-tested.
 */

export interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string; items?: unknown; enum?: string[] }>
  required?: string[]
}

export interface Op {
  name: string
  description: string
  /** Changes state or acts in the world → blocked when bridge access is read-only. */
  write: boolean
  input: JsonSchema
  run: (args: Record<string, any>) => Promise<unknown> | unknown
}

export interface OpsDeps {
  db: DB
  secrets: SecretsLike
  agent: {
    getStatus: () => unknown
    answer: (text: string) => void
    continueAfterHandoff: () => void
    stop: () => void
    isBusy: () => boolean
  }
  startAgent: (input: { recipeId?: string; params?: Record<string, string>; goal?: string; startUrl?: string; allowedDomains?: string[]; signinEmail?: string }) => { ok: boolean; summary?: string }
  runNow: () => Promise<unknown>
  isRunning: () => boolean
  /** Connect a mailbox with an app password (IMAP providers). */
  connectAccount: (input: { email: string; provider: string; password: string; host?: string; port?: number; label?: string }) => Promise<AccountConfig>
  notify: (title: string, body: string) => void
  speak: (text: string) => void
  listSkills: () => { id: string; name: string; description: string; enabled: boolean; builtin: boolean }[]
  setEnabledSkills: (ids: string[]) => void
  /** Full system control (screen, mouse/keyboard, apps, commands, home-folder files). Each kind may pop up a question for the person. */
  desktop: DesktopControl
  /** Self-healing: check the app's health / apply the safe automatic repairs. Optional so lean hosts (tests) can skip it. */
  health?: {
    status: () => HealthReport | Promise<HealthReport>
    repair: () => Promise<HealthReport>
  }
  /** Trusted helpers (v1.4): overrides for the sender, the Ask delay, and the clock (tests). */
  helpers?: Partial<Pick<HelperDeps, 'send' | 'askDelayMs' | 'now' | 'personName' | 'log'>>
  /**
   * Conversation (v1.4, Part B): answer a question about the mail — local engine, then the AI within its
   * 8-second budget. Optional: without it the op answers with the local engine alone (lean hosts, tests).
   */
  ask?: (q: string) => Promise<Answer>
  /**
   * Reads attachments (v1.5): open a stored attachment file with the computer's default app (shell.openPath).
   * Desktop only — absent on lean hosts, and never offered to the phone.
   */
  openPath?: (path: string) => Promise<string>
}

/** read_attachment returns at most this much text; the full text stays searchable in the database. */
export const READ_ATTACHMENT_MAX_CHARS = 20000

/** Shown in the consent popup so the person knows who is asking. */
const BRIDGE_REQUESTER = 'Another agent (bridge)'
const POPUP_NOTE = "A popup may appear on the person's screen asking them to allow it. A 'consent_denied' error means the person said no — tell them and do not retry."

/** Preference keys an agent may read and change. Secrets and app IDs are never exposed. */
export const SETTINGS_ALLOWLIST: (keyof AppSettings)[] = [
  'profileId',
  'profileAuto',
  'schedule',
  'simpleMode',
  'storeFullBodies',
  'launchAtLogin',
  'enabledSkillIds',
  'vipSenders',
  'mutedSenders',
  'textSize',
  'deliverEmailTo',
  'smsPhone',
  'smsCarrier',
  'googleDriveExport',
  'speakBriefs',
  'insightsEnabled',
  'quietPeople',
  'assistantAutonomy',
  'agentWebhookUrl'
]

const obj = (properties: JsonSchema['properties'], required: string[] = []): JsonSchema => ({ type: 'object', properties, required })
const emptyHealth = (): HealthReport => ({ checkedAt: new Date().toISOString(), ok: true, items: [], recentFixes: [] })

export function buildOps(deps: OpsDeps): Op[] {
  const { db, secrets } = deps
  const publicSettings = (): Partial<AppSettings> => {
    const s = loadSettings(db)
    const out: Partial<AppSettings> = {}
    for (const k of SETTINGS_ALLOWLIST) (out as any)[k] = s[k]
    return out
  }
  // Conversation (v1.4, Part B): one question in flight per client (each server builds its own ops, so the
  // bridge and the phone each get their own slot). Read-only: the answer can only ever open a draft.
  let askBusy = false
  const askOp = async (q: string): Promise<Answer> => {
    if (askBusy) {
      const e = new Error('One question at a time — the last one is still being answered.')
      ;(e as any).status = 429
      throw e
    }
    askBusy = true
    try {
      return deps.ask
        ? await deps.ask(q)
        : await askAndWait({ db, settings: () => loadSettings(db), getModel: () => null, healthStatus: deps.health ? () => deps.health!.status() : undefined }, q)
    } finally {
      askBusy = false
    }
  }
  return [
    {
      name: 'ask',
      description:
        'Ask a question about the mail in plain words ("Who is waiting on me?", "Did the dentist write back?", "What do I owe this month?"). Returns {text, sources, actions, engine, unsure}. Read-only: it can open a reply draft in the person\'s mail app (an open_draft action with a mailto:) but never sends anything.',
      write: false,
      input: obj({ q: { type: 'string', description: 'The question' } }, ['q']),
      run: (a) => askOp(String(a.q ?? '').slice(0, 500))
    },
    {
      name: 'get_brief',
      description: "The latest InboxScout brief: headline, top issues with next steps, who is waiting on the person, deadlines, project pulse, personal items, skill sections. Null if no scan has run yet.",
      write: false,
      input: obj({}),
      run: () => repo.latestBrief(db)
    },
    {
      name: 'list_issues',
      description: 'Open (or all) tracked issues with severity, next step, and deadline.',
      write: false,
      input: obj({ includeResolved: { type: 'boolean', description: 'Also return resolved issues (default false)' } }),
      run: (a) => repo.listIssues(db, !a.includeResolved)
    },
    {
      name: 'resolve_issue',
      description: 'Mark an issue as done.',
      write: true,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => {
        repo.resolveIssue(db, String(a.id))
        return { ok: true }
      }
    },
    {
      name: 'list_projects',
      description: 'Projects / deals / cases InboxScout is tracking, with status and trend.',
      write: false,
      input: obj({ activeOnly: { type: 'boolean' } }),
      run: (a) => repo.listProjects(db, !!a.activeOnly)
    },
    {
      name: 'search_mail',
      description: 'Full-text search over synced mail (subject, sender, body). Returns id, subject, from, date, snippet.',
      write: false,
      input: obj({ q: { type: 'string', description: 'Search words' }, limit: { type: 'number' } }, ['q']),
      run: (a) => {
        const q = String(a.q ?? '').trim()
        if (!q) throw new Error('q is required')
        try {
          return repo.searchMessages(db, q, Math.min(100, Number(a.limit) || 30))
        } catch {
          return []
        }
      }
    },
    {
      name: 'recent_mail',
      description: 'Most recent messages with their classification (personal/work/noise, importance, action summary).',
      write: false,
      input: obj({ limit: { type: 'number' } }),
      run: (a) => repo.recentMessagesWithClassification(db, Math.min(200, Number(a.limit) || 40))
    },
    {
      name: 'read_message',
      description: 'Read one message in full by id (from search_mail or recent_mail).',
      write: false,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => repo.getMessages(db, [String(a.id)])[0] ?? null
    },
    // ---- Reads attachments and photos (v1.5) ----
    {
      name: 'list_attachments',
      description: 'Files attached to one message (from search_mail, recent_mail, or read_message): id, filename, kind, summary, facts (amounts, dates, people, documentType), status. Never the file path.',
      write: false,
      input: obj({ messageId: { type: 'string' } }, ['messageId']),
      run: (a) => {
        try {
          return attachmentsFor(db, String(a.messageId)).map(publicAttachment)
        } catch {
          return []
        }
      }
    },
    {
      name: 'read_attachment',
      description: `What an attached file said, by attachment id: {id, filename, summary, facts, text} with text capped at ${READ_ATTACHMENT_MAX_CHARS} characters. Null when unknown.`,
      write: false,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => {
        const id = String(a.id)
        const att = findAttachment(db, id, { attachmentsFor })
        if (!att) return null
        let text = ''
        try {
          text = attachmentText(db, id, READ_ATTACHMENT_MAX_CHARS) ?? ''
        } catch {
          text = ''
        }
        return { id: att.id, messageId: att.messageId, filename: att.filename, kind: att.kind, summary: att.summary, facts: att.facts, status: att.status, text: text.slice(0, READ_ATTACHMENT_MAX_CHARS) }
      }
    },
    {
      name: 'open_attachment',
      description: "Open an attached file on the person's computer with the default app for it (desktop only; the file must still be kept — files are cleared after the keep-days setting).",
      write: true,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: async (a) => {
        if (!deps.openPath) throw new Error('Opening files is only available on the computer InboxScout runs on.')
        const att = findAttachment(db, String(a.id), { attachmentsFor })
        if (!att) throw new Error('No such attachment.')
        if (!att.path) throw new Error('That file was cleared to save space; what it said is still searchable (read_attachment).')
        const problem = await deps.openPath(att.path)
        if (problem) throw new Error(problem)
        return { ok: true, filename: att.filename }
      }
    },
    {
      name: 'list_reports',
      description: 'Past briefs (id, date, period).',
      write: false,
      input: obj({ limit: { type: 'number' } }),
      run: (a) => repo.listReports(db, Math.min(100, Number(a.limit) || 20))
    },
    {
      name: 'read_report',
      description: 'A past brief as Markdown.',
      write: false,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => {
        const r = repo.getReport(db, String(a.id))
        return r ? { id: r.id, createdAt: r.createdAt, periodType: r.periodType, markdown: r.markdown } : null
      }
    },
    {
      name: 'run_scan',
      description: 'Check email now and build a fresh brief. Returns immediately; poll get_brief or listen to events.',
      write: true,
      input: obj({}),
      run: () => {
        if (deps.isRunning()) return { started: false, reason: 'already running' }
        void deps.runNow()
        return { started: true }
      }
    },
    {
      name: 'scan_status',
      description: 'Whether a scan is running right now.',
      write: false,
      input: obj({}),
      run: () => ({ running: deps.isRunning(), lastRunAt: loadSettings(db).lastRunAt })
    },
    {
      name: 'health_check',
      description: 'Is anything wrong with InboxScout? Runs its self-checks (database, reports folder, account syncing, AI helper, schedule, bridge, disk). Items with status warn/fail need attention; "fixed" items were repaired automatically; recentFixes lists what it fixed on its own lately.',
      write: false,
      input: obj({}),
      run: async () => (deps.health ? await deps.health.status() : emptyHealth())
    },
    {
      name: 'health_repair',
      description: 'Fix what can be fixed automatically (move a blocked reports folder, pick a free bridge port, reset a stale sync, reconnect an account through the Assistant) and re-check. Returns the same shape as health_check.',
      write: true,
      input: obj({}),
      run: async () => (deps.health ? await deps.health.repair() : emptyHealth())
    },
    {
      name: 'list_accounts',
      description: 'Connected mailboxes (never their passwords).',
      write: false,
      input: obj({}),
      run: () => repo.listAccounts(db).map((a) => ({ id: a.id, label: a.label, email: a.email, provider: a.provider }))
    },
    {
      name: 'connect_account',
      description: 'Connect a mailbox with an app password (gmail, yahoo, icloud, or imap with host/port). For Outlook.com or Sign in with Google use the app.',
      write: true,
      input: obj(
        {
          email: { type: 'string' },
          provider: { type: 'string', enum: ['gmail', 'yahoo', 'icloud', 'imap'] },
          password: { type: 'string', description: 'The app password (not the normal password)' },
          host: { type: 'string' },
          port: { type: 'number' },
          label: { type: 'string' }
        },
        ['email', 'provider', 'password']
      ),
      run: async (a) => {
        const acc = await deps.connectAccount({ email: String(a.email), provider: String(a.provider), password: String(a.password), host: a.host, port: a.port, label: a.label })
        return { id: acc.id, email: acc.email, provider: acc.provider }
      }
    },
    {
      name: 'remove_account',
      description: 'Disconnect a mailbox by id.',
      write: true,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => {
        repo.deleteAccount(db, String(a.id))
        secrets.delete(`account:${String(a.id)}`)
        return { ok: true }
      }
    },
    {
      name: 'list_signins',
      description: 'Emails with a saved sign-in the Assistant may use to log in (passwords are never returned).',
      write: false,
      input: obj({}),
      run: () => listSignins(db)
    },
    {
      name: 'save_signin',
      description: "Save a website sign-in (the person's normal email password) so the Assistant can log in for them. Stored encrypted on this computer.",
      write: true,
      input: obj({ email: { type: 'string' }, password: { type: 'string' } }, ['email', 'password']),
      run: (a) => ({ signins: saveSignin(db, secrets, String(a.email), String(a.password)) })
    },
    {
      name: 'delete_signin',
      description: 'Forget a saved sign-in.',
      write: true,
      input: obj({ email: { type: 'string' } }, ['email']),
      run: (a) => ({ signins: deleteSignin(db, secrets, String(a.email)) })
    },
    {
      name: 'list_recipes',
      description: 'Jobs the Assistant browser knows how to do (app passwords, app registrations) and the params each needs.',
      write: false,
      input: obj({}),
      run: () => RECIPES.map((r) => ({ id: r.id, name: r.name, description: r.description, params: r.params }))
    },
    {
      name: 'assistant_start',
      description: 'Start the Assistant browser on a recipe (recipeId + params) or a custom goal (goal + startUrl). Opens a visible window. Optional signinEmail picks a saved sign-in.',
      write: true,
      input: obj({
        recipeId: { type: 'string' },
        params: { type: 'object', description: 'e.g. {"email":"mom@gmail.com"}' },
        goal: { type: 'string' },
        startUrl: { type: 'string' },
        allowedDomains: { type: 'array', items: { type: 'string' } },
        signinEmail: { type: 'string' }
      }),
      run: (a) => deps.startAgent(a as any)
    },
    {
      name: 'assistant_status',
      description: 'Assistant status (idle, running, waiting_user, waiting_answer, done, failed, stopped), recent log, and captured values.',
      write: false,
      input: obj({}),
      run: () => deps.agent.getStatus()
    },
    {
      name: 'assistant_answer',
      description: "Answer the Assistant's question (when status is waiting_answer).",
      write: true,
      input: obj({ text: { type: 'string' } }, ['text']),
      run: (a) => {
        deps.agent.answer(String(a.text ?? ''))
        return { ok: true }
      }
    },
    {
      name: 'assistant_continue',
      description: 'Resume after the person signed in / verified / approved (when status is waiting_user).',
      write: true,
      input: obj({}),
      run: () => {
        deps.agent.continueAfterHandoff()
        return { ok: true }
      }
    },
    {
      name: 'assistant_stop',
      description: 'Stop the Assistant.',
      write: true,
      input: obj({}),
      run: () => {
        deps.agent.stop()
        return { ok: true }
      }
    },
    {
      name: 'notify',
      description: "Show a desktop notification on the person's computer.",
      write: true,
      input: obj({ title: { type: 'string' }, body: { type: 'string' } }, ['body']),
      run: (a) => {
        deps.notify(String(a.title ?? 'InboxScout'), String(a.body ?? ''))
        return { ok: true }
      }
    },
    {
      name: 'speak',
      description: "Read text aloud with the computer's voice.",
      write: true,
      input: obj({ text: { type: 'string' } }, ['text']),
      run: (a) => {
        deps.speak(String(a.text ?? ''))
        return { ok: true }
      }
    },
    {
      name: 'list_people',
      description: "The person's circle learned from mail across every inbox: name, addresses, role (family/friend/colleague/client/vendor/service/automated), tier (inner/regular/occasional), counts, last seen, going-quiet flag.",
      write: false,
      input: obj({ tier: { type: 'string', enum: ['inner', 'regular', 'occasional'] }, limit: { type: 'number' } }),
      run: (a) => repo.listPeople(db, Math.min(500, Number(a.limit) || 100)).filter((p) => !a.tier || p.tier === a.tier)
    },
    {
      name: 'get_schedule',
      description: "The unified schedule from the latest brief: days with events across every inbox, overlaps, overdue items, and recurring patterns.",
      write: false,
      input: obj({}),
      run: () => repo.latestBrief(db)?.brief?.schedule ?? null
    },
    {
      name: 'list_promises',
      description: 'Commitments the person made in their own sent mail ("I will send it by Friday"), with due dates and whether they are overdue.',
      write: false,
      input: obj({}),
      run: () => repo.latestBrief(db)?.brief?.promises ?? []
    },
    {
      name: 'list_profiles',
      description: 'The 50+ work/life profiles InboxScout can tune itself to (id, name, group, tagline), plus the current one and whether "choose for me" is on.',
      write: false,
      input: obj({}),
      run: () => {
        const s = loadSettings(db)
        return {
          current: s.profileId,
          auto: s.profileAuto,
          groups: PROFILE_GROUPS,
          profiles: PROFILE_LIST.map((p) => ({ id: p.id, name: p.name, group: p.group, icon: p.icon, tagline: p.tagline, pulseName: p.pulseName }))
        }
      }
    },
    {
      name: 'detect_profile',
      description: 'Look at recent mail and say which profile fits best (null when unclear). Does not change anything.',
      write: false,
      input: obj({}),
      run: () => {
        const d = detectProfile(recentDetectInput(db), PROFILE_LIST)
        return d ? { ...d, name: getProfile(d.id).name } : null
      }
    },
    {
      name: 'set_profile',
      description: 'Choose a profile by id, or "auto" to let InboxScout pick from the mail after each scan.',
      write: true,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => {
        const s = loadSettings(db)
        const id = String(a.id)
        if (id === 'auto') saveSettings(db, { ...s, profileAuto: true })
        else if (PROFILES[id]) saveSettings(db, { ...s, profileId: id, profileAuto: false, enabledSkillIds: null })
        else throw new Error(`Unknown profile "${id}" — see list_profiles`)
        const n = loadSettings(db)
        return { ok: true, profileId: n.profileId, auto: n.profileAuto }
      }
    },
    {
      name: 'list_skills',
      description: 'Skills (watchers for bills, appointments, deals...) and whether each is on.',
      write: false,
      input: obj({}),
      run: () => deps.listSkills()
    },
    {
      name: 'set_skills',
      description: 'Turn skills on/off by id (full list replaces the current one).',
      write: true,
      input: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']),
      run: (a) => {
        deps.setEnabledSkills(Array.isArray(a.ids) ? a.ids.map(String) : [])
        return { ok: true }
      }
    },
    {
      name: 'get_settings',
      description: 'Preferences an agent may see (profile, schedule, delivery, autonomy...). Never secrets.',
      write: false,
      input: obj({}),
      run: () => publicSettings()
    },
    {
      name: 'update_settings',
      description: `Change preferences. Only these keys: ${SETTINGS_ALLOWLIST.join(', ')}.`,
      write: true,
      input: obj({ patch: { type: 'object' } }, ['patch']),
      run: (a) => {
        const patch = (a.patch ?? {}) as Record<string, unknown>
        const s = loadSettings(db)
        const next: AppSettings = { ...s }
        const changed: string[] = []
        for (const k of SETTINGS_ALLOWLIST) {
          if (k in patch) {
            ;(next as any)[k] = k === 'schedule' && patch[k] && typeof patch[k] === 'object' ? { ...s.schedule, ...(patch[k] as object) } : patch[k]
            changed.push(k)
          }
        }
        saveSettings(db, next)
        return { ok: true, changed, settings: publicSettings() }
      }
    },
    {
      name: 'desktop_screenshot',
      description: `Take a picture of the person's primary screen. Returns {dataUrl (PNG), width, height, screenWidth, screenHeight}; scale picture coordinates by screenWidth/width before clicking. ${POPUP_NOTE}`,
      write: true,
      input: obj({}),
      run: () => deps.desktop.screenshot(BRIDGE_REQUESTER)
    },
    {
      name: 'desktop_click',
      description: `Click on the person's desktop at screen coordinates (top-left origin). ${POPUP_NOTE}`,
      write: true,
      input: obj(
        {
          x: { type: 'number' },
          y: { type: 'number' },
          button: { type: 'string', enum: ['left', 'right'] },
          double: { type: 'boolean', description: 'Double-click (default false)' }
        },
        ['x', 'y']
      ),
      run: (a) => deps.desktop.click(Number(a.x), Number(a.y), BRIDGE_REQUESTER, { button: a.button === 'right' ? 'right' : 'left', double: !!a.double })
    },
    {
      name: 'desktop_type',
      description: `Type text at whatever has keyboard focus on the person's desktop. ${POPUP_NOTE}`,
      write: true,
      input: obj({ text: { type: 'string' } }, ['text']),
      run: (a) => deps.desktop.type(String(a.text ?? ''), BRIDGE_REQUESTER)
    },
    {
      name: 'desktop_key',
      description: `Press a key or combo on the person's desktop, e.g. "enter", "ctrl+s", "cmd+shift+4". ${POPUP_NOTE}`,
      write: true,
      input: obj({ combo: { type: 'string' } }, ['combo']),
      run: (a) => deps.desktop.key(String(a.combo ?? ''), BRIDGE_REQUESTER)
    },
    {
      name: 'desktop_open',
      description: `Open an app by name, a file or folder under the home folder, or a web URL with the OS default. ${POPUP_NOTE}`,
      write: true,
      input: obj({ target: { type: 'string', description: 'App name, path (~ allowed), or http(s) URL' } }, ['target']),
      run: (a) => deps.desktop.open(String(a.target ?? ''), BRIDGE_REQUESTER)
    },
    {
      name: 'desktop_run',
      description: `Run a shell command on the person's computer (PowerShell on Windows, /bin/sh elsewhere) in the home folder unless cwd is given. Returns {code, stdout, stderr, timedOut}; a non-zero code is returned, not thrown. Dangerous commands (delete, format, shutdown, sudo, payments…) run without asking while the person's Full autonomy choice is on (the default); otherwise they ask every time. ${POPUP_NOTE}`,
      write: true,
      input: obj(
        {
          command: { type: 'string' },
          cwd: { type: 'string', description: 'Folder to run in (must be under the home folder)' },
          timeoutMs: { type: 'number', description: 'Default 60000' }
        },
        ['command']
      ),
      run: (a) => deps.desktop.run(String(a.command ?? ''), BRIDGE_REQUESTER, { cwd: a.cwd ? String(a.cwd) : undefined, timeoutMs: Number(a.timeoutMs) || undefined })
    },
    {
      name: 'files_read',
      description: `Read a text file under the person's home folder (first 200 KB). Secret folders like ~/.ssh are never readable. ${POPUP_NOTE}`,
      write: true,
      input: obj({ path: { type: 'string', description: 'Path, ~ allowed' } }, ['path']),
      run: async (a) => ({ text: await deps.desktop.readFile(String(a.path ?? ''), BRIDGE_REQUESTER) })
    },
    {
      name: 'files_write',
      description: `Write (replace) a text file under the person's home folder, creating parent folders. ${POPUP_NOTE}`,
      write: true,
      input: obj({ path: { type: 'string', description: 'Path, ~ allowed' }, text: { type: 'string', description: 'File contents (empty allowed)' } }, ['path']),
      run: async (a) => {
        await deps.desktop.writeFile(String(a.path ?? ''), String(a.text ?? ''), BRIDGE_REQUESTER)
        return { ok: true }
      }
    },
    {
      name: 'files_list',
      description: `List a folder under the person's home folder: [{name, dir, size}], folders first. ${POPUP_NOTE}`,
      write: true,
      input: obj({ path: { type: 'string', description: 'Folder path, ~ allowed' } }, ['path']),
      run: (a) => deps.desktop.listDir(String(a.path ?? ''), BRIDGE_REQUESTER)
    },
    ...helperOps(deps)
  ]
}

// ---- Trusted helpers (v1.4, A5): the only way helpers change, so every path logs and sends the hello ----

function helperOps(deps: OpsDeps): Op[] {
  const hd: HelperDeps = { db: deps.db, secrets: deps.secrets, ...(deps.helpers ?? {}) }
  return [
    {
      name: 'helper_list',
      description: "The person's trusted helpers (family or friends who get a plain-words slice of the brief): name, relationship, sharing level (ask/schedule/needs/all), cadence, paused. Contact details are masked (s***@gmail.com).",
      write: false,
      input: obj({}),
      run: () => ({ paused: loadSettings(deps.db).helpersPaused, helpers: listHelpers(hd).map(maskHelper) })
    },
    {
      name: 'helper_add',
      description:
        "Add a trusted helper (needs Full access). Sends the helper one hello message saying what they will get, and shows the person a notice on Today for seven days. level: ask (only when the person presses Ask for help), schedule (appointments only), needs (what needs the person + heads-ups), all (the full brief). cadence: each_brief | weekly | off.",
      write: true,
      input: obj(
        {
          name: { type: 'string' },
          relationship: { type: 'string', description: 'e.g. daughter, neighbour, friend' },
          email: { type: 'string' },
          phone: { type: 'string', description: '10-digit US number for texts (needs carrier)' },
          carrier: { type: 'string', description: 'att, verizon, tmobile, …' },
          level: { type: 'string', enum: ['ask', 'schedule', 'needs', 'all'] },
          cadence: { type: 'string', enum: ['each_brief', 'weekly', 'off'] }
        },
        ['name', 'level']
      ),
      run: async (a) => maskHelper(await addHelper(hd, a as any, 'bridge'))
    },
    {
      name: 'helper_update',
      description: 'Change a helper: patch may hold level, cadence, weekday (0–6), paused.',
      write: true,
      input: obj({ id: { type: 'string' }, patch: { type: 'object' } }, ['id', 'patch']),
      run: (a) => {
        const p = (a.patch ?? {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const k of ['level', 'cadence', 'weekday', 'paused']) if (k in p) patch[k] = p[k]
        return maskHelper(updateHelper(hd, String(a.id), patch))
      }
    },
    {
      name: 'helper_remove',
      description: 'Remove a helper. They get nothing further.',
      write: true,
      input: obj({ id: { type: 'string' } }, ['id']),
      run: (a) => removeHelper(hd, String(a.id))
    },
    {
      name: 'helper_ask',
      description: 'Ask a helper for a hand with one item (title, next step, why now, optional note — never the email itself). Waits 10 seconds before sending; helper_cancel with the returned sendId stops it.',
      write: true,
      input: obj(
        {
          helperId: { type: 'string' },
          title: { type: 'string' },
          nextStep: { type: 'string' },
          whyNow: { type: 'string' },
          note: { type: 'string', description: 'One line from the person' }
        },
        ['helperId', 'title']
      ),
      run: (a) => {
        const r = scheduleAsk(hd, { helperId: String(a.helperId), title: String(a.title), nextStep: a.nextStep ? String(a.nextStep) : undefined, whyNow: a.whyNow ? String(a.whyNow) : undefined, note: a.note ? String(a.note) : undefined })
        return { sendId: r.sendId, sendsAt: r.sendsAt, helperName: r.helperName, outboxMissing: r.outboxMissing }
      }
    },
    {
      name: 'helper_cancel',
      description: 'Stop a queued Ask for help before its 10 seconds are up.',
      write: true,
      input: obj({ sendId: { type: 'string' } }, ['sendId']),
      run: (a) => cancelAsk(hd, String(a.sendId))
    },
    {
      name: 'helper_log',
      description: 'Everything ever sent to helpers, verbatim, newest first: kind (hello/ask/digest/headsup), channel, status (sent/failed/cancelled), the full text.',
      write: false,
      input: obj({ limit: { type: 'number' }, helperId: { type: 'string' } }),
      run: (a) => listHelperLog(hd, { helperId: a.helperId ? String(a.helperId) : undefined, limit: Math.min(500, Number(a.limit) || 50) })
    },
    {
      name: 'helper_pause_all',
      description: 'Pause (or resume) every helper in one go: no digests, no heads-ups, no Ask for help while paused.',
      write: true,
      input: obj({ paused: { type: 'boolean' } }, ['paused']),
      run: (a) => pauseAll(hd, a.paused === true || a.paused === 'true')
    }
  ]
}

export function findOp(ops: Op[], name: string): Op | undefined {
  return ops.find((o) => o.name === name)
}

/** Run an op, enforcing read-only access. Throws on unknown op or forbidden write. */
export async function runOp(ops: Op[], name: string, args: Record<string, any>, readOnly: boolean): Promise<unknown> {
  const op = findOp(ops, name)
  if (!op) throw new Error(`Unknown operation: ${name}`)
  if (readOnly && op.write) {
    const e = new Error(`"${name}" changes things, and the bridge is set to read-only. Switch Setup → Preferences → Agent bridge to Full.`)
    ;(e as any).status = 403
    throw e
  }
  for (const req of op.input.required ?? []) {
    if (args[req] === undefined || args[req] === null || args[req] === '') {
      const e = new Error(`Missing required argument "${req}" for ${name}`)
      ;(e as any).status = 400
      throw e
    }
  }
  return op.run(args ?? {})
}
