import type { DB } from '../db/index'
import * as repo from '../db/repo'
import { loadSettings, saveSettings } from '../settings'
import { RECIPES } from '../agent/policy'
import { deleteSignin, listSignins, saveSignin, type SecretsLike } from '../signins'
import { PROFILES, PROFILE_GROUPS, PROFILE_LIST, getProfile } from '../profiles/profiles'
import { detectProfile } from '../profiles/detect'
import { recentDetectInput } from '../profiles/auto'
import type { DesktopControl } from '../desktop/control'
import type { AccountConfig, AppSettings } from '../../shared/types'

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
}

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

export function buildOps(deps: OpsDeps): Op[] {
  const { db, secrets } = deps
  const publicSettings = (): Partial<AppSettings> => {
    const s = loadSettings(db)
    const out: Partial<AppSettings> = {}
    for (const k of SETTINGS_ALLOWLIST) (out as any)[k] = s[k]
    return out
  }
  return [
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
      description: `Run a shell command on the person's computer (PowerShell on Windows, /bin/sh elsewhere) in the home folder unless cwd is given. Returns {code, stdout, stderr, timedOut}; a non-zero code is returned, not thrown. Dangerous commands (delete, format, shutdown, sudo, payments…) always ask the person. ${POPUP_NOTE}`,
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
