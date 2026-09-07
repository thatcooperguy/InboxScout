# Adaptive UI — one app for a grandparent and a CEO

*Design spec, September 2026. Written against commit `e3bba14` ("Evolving UI foundation"). Companion to
[`UX-AUDIT.md`](UX-AUDIT.md), which audits the screens; this document specifies the evolving-UI system. No code is
changed by this document.*

*Status (September 2026): implemented in v1.0 except these items, which were not built: `views/today/pickCards.ts`,
`level-anchors.test.tsx` / `today-cards.test.ts`, the `describe_settings` bridge op, and `scripts/gen-settings-doc.ts` →
`docs/SETTINGS.md`.*

**Goal (owner's words):** "UI and product must be something so simple a child or grandparent could use, AND as
intuitive and automatic yet feature-rich that a business owner or CEO can use. A user-based evolving UI with
overrides in settings for deep-dive customization, with clear info on what each setting does."

**The shape of the answer.** Three *experience levels* — Simple, Standard, Pro — drawn from one component tree.
A small pure engine reads behavior we already record locally and picks the level, slowly and visibly, with a
one-tap undo. A handful of things never move, whatever the level. Every card can say why it is there, and every
setting can say what it does, why its default is what it is, who it is for, and who set it.

Contents

1. [What shipped in `e3bba14` and what this spec adds](#1-what-shipped-in-e3bba14-and-what-this-spec-adds)
2. [Principles and the research behind them](#2-principles-and-the-research-behind-them)
3. [The three levels — exact contents](#3-the-three-levels--exact-contents)
4. [Signals and the adaptation engine](#4-signals-and-the-adaptation-engine)
5. [Stable anchors](#5-stable-anchors)
6. [Explainability: cards and settings](#6-explainability-cards-and-settings)
7. [Copy guidelines per level](#7-copy-guidelines-per-level)
8. [Rollout in three PRs](#8-rollout-in-three-prs)
9. [Open questions and non-goals](#9-open-questions-and-non-goals)

---

## 1. What shipped in `e3bba14` and what this spec adds

The foundation is in. This spec uses its names and fills its gaps. Paths are relative to the repo root.

| Requirement | Shipped (baseline) | Gap this spec closes |
|---|---|---|
| Level type and setting | `UiLevel`, `UiLevelSetting` in `src/shared/adapt.ts`; `AppSettings.uiLevel: 'auto' \| UiLevel` (default `'auto'`) | `simpleMode` still coexists (§3.6); `uiLevel` missing from the bridge `SETTINGS_ALLOWLIST` |
| Scoring | `scoreLevel(signals) → { level, score, reasons[] }`: Pro at score ≥ 4, Simple at ≤ −3, plain-language reasons | Single thresholds flip-flop around ±3/±4; add a dead band, a streak, and a two-level-jump guard (§4.3) |
| Restraint | `nextLevelState(prev, decision, signals)`: first pick immediate; later changes need ≥ 3 sessions and ≥ 7 days since `since`; sets `announce` and `previous` | **Changes can still land mid-session** — `evaluateLevel` persists on every `ui:level` call, and the renderer calls `uiLevel()` from `loadSettings()`, i.e. at mount *and after every Preferences save*. Evaluate-and-apply must move to launch only (§4.4) |
| Signals | `src/main/usage.ts`: `usage` meta row with lifetime `sessions`, `tabVisits`, `features` (search, correct, export, voice, done, assistant), last 14 `runs` (`newMessages`, `openIssues`), `installedAt`; `currentSignals()` adds `textSize`, `accounts`, `profileGroup`/`profileId`, `bridgeEnabled` | Lifetime counters never forget (one curious week at install reads as "opens advanced tabs" forever); no dismissal, voice-setting, delivery, custom-skill, webhook, keyboard, or "show me more" signals (§4.1–4.2) |
| Override and undo | `ui:setLevel` (explicit choice wins via `resolveLevel`); banner in `App.tsx` with **Sounds good** / **Keep it the way it was** (`ui:ackLevel`, `ui:revertLevel` pins the previous level as an explicit choice) | Keep-it is not fed back as a signal; banner copy is Standard-only; not spoken at Simple (§4.3 rule 7, §7) |
| Tabs by level | `App.tsx`: Simple = Today, My briefs, Setup; Standard = 4 (+ Details, Inbox review when `simpleMode === false`); Pro = all 6; `.layout.level-{level}` class | Stable-anchor test; Standard "More ▸" disclosure so the reveal is measurable (§3.1, §5) |
| Today by level | `Today.tsx` `level` prop: Simple caps items (3 needs-you, 3 waiting, 2 overdue promises, today/tomorrow only, 2 skill cards, no pulse/others/done/personal/new-faces), big Read it to me; Pro dense grid + **Copy for my assistant** | Simple caps *items*, not *cards* (up to 8 can still appear); no "Show me everything", no "Explain this screen"; Pro lacks Decide today, inbox filter chips, trends, delegation, keyboard (§3.2–3.5) |
| Card "Why?" | `Why` component in `Today.tsx`: static sentence per card, ⓘ toggle | No level reason, no actions, not spoken, missing on skill cards (§6.1) |
| Settings registry | `src/shared/settingsRegistry.ts`: `SettingDesc { key, group, label, what, why, who?, kind, options?, minLevel?, showWhen?, managed? }`; groups Basics / Looks & comfort / What I get / Helpers & other agents / Advanced; `visibleAt`, `getSetting`/`setSetting` (dotted keys, virtual `schedule.time`), `searchSettings`; tests enforce every plain key is explained | Provenance is *inferred* (`isDefault` + `managed`), so a value set by auto-profile or an agent shows "you set this"; **Back to automatic** restores `DEFAULT_SETTINGS`, not the level-derived value; keys "handled elsewhere" have no row (§6.2–6.3) |
| Preferences UI | `Settings.tsx` generated from the registry: search, **Show everything** at non-Pro, badges *chosen for you / default / you set this*, per-row **Why?**, per-row **Back to automatic**, profile card kept | Level-specific copy; source line for agents (§6.2) |
| Tests | `tests/adapt.test.ts` (scoring personas, weekly hold, explicit choice), `tests/settingsRegistry.test.ts` (coverage, dotted keys, search) | Hysteresis invariants, launch-only invariant, anchor render test, copy lint (§4.5, §7, §8) |

Where this spec and the audit differ on a number, the owner's brief wins: the audit's P1-5 asks for "≤ 4 cards +
Show more" at Simple; the brief says *at most three*. This spec uses three plus "Show me everything", which
satisfies both.

**In flight on the working tree at the time of writing** (uncommitted, so treat as names to reuse, not as
baseline): `src/renderer/src/copy.ts` (`COPY`, `t(key, level)`, `lastChecked(when, level)`, `SIMPLE_JARGON`),
`src/renderer/src/useLevel.ts` (`useLevel()` hook, `speak(text)`), `tests/copy.test.ts` (Flesch–Kincaid and
jargon lint over every `simple` variant), a level-aware `views/Setup.tsx` (tiles named by outcome — Email
accounts, What to watch for, Preferences / Text & voice, Smarter sorting (AI), Web chores / Help me with a
website, Sign-in setup — with a one-line state each, three up front at Simple and **Show more setup**), and the
sibling guide [`HUMAN-FACTORS.md`](HUMAN-FACTORS.md). §3.1, §3.4, §7 and PR 2 build on those files rather than
re-creating them.

## 2. Principles and the research behind them

1. **Progressive disclosure, not feature removal.** Every level is the same app with fewer things *on screen*.
   Nothing is unavailable at Simple; it is one deliberate step away. (Nielsen, *Progressive Disclosure*,
   NN/g — <https://www.nngroup.com/articles/progressive-disclosure/>.)
2. **Adaptive is dangerous unless it is slow, predictable, and reversible.** Office 2000's "smart menus" are the
   canonical failure. Findlater & McGrenere (CHI 2004) found users preferred *adaptable* (user-controlled) menus
   over *adaptive* ones — <https://doi.org/10.1145/985692.985704>. Gajos et al. found that adaptive UIs which
   *add* an accelerated copy while leaving the original in place ("split" interfaces) beat ones that *move*
   things (AVI 2006 — <https://doi.org/10.1145/1133265.1133306>), and that predictability matters as much as
   accuracy (CHI 2008 — <https://doi.org/10.1145/1357054.1357252>). Hence: stable anchors (§5), a change budget
   of once a week, never mid-session, one announcement, one-tap undo, and a manual override that always wins.
3. **Easy reversal of actions** is one of Shneiderman's eight golden rules —
   <https://www.cs.umd.edu/~ben/goldenrules.html>. Every automatic choice has a "Keep it the way it was" or
   "Back to automatic" within one tap.
4. **Calm technology.** The app should demand attention only when something needs the person, and move to the
   periphery otherwise (Weiser & Brown; Amber Case, *Calm Technology*, 2015 — <https://calmtech.com/>). This
   is why Simple leans on spoken and delivered briefs rather than on opening the app, and why the all-clear
   state is a full card, not an empty list.
5. **Accessibility floor for all levels, higher ceiling for Simple.** WCAG 2.2 AA throughout —
   <https://www.w3.org/TR/WCAG22/>. The criteria that shape this spec directly:
   - 2.5.8 Target Size (Minimum), 24×24 CSS px — <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>.
     We use 44 px (Apple HIG minimum, <https://developer.apple.com/design/human-interface-guidelines/accessibility>;
     the audit's P0-8 asks for 40/44) at Standard/Pro and 56 px for the primary actions at Simple.
   - 3.2.3 Consistent Navigation and 3.2.4 Consistent Identification —
     <https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html>. Levels may hide tabs; they may
     never reorder or rename the ones that remain (§5).
   - 3.2.6 Consistent Help (new in 2.2) — <https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html>.
     The help affordance ("Explain this screen" / "Why?") sits in the same place on every screen.
   - 1.4.4 Resize Text and 1.4.10 Reflow: the `body.style.zoom` approach in `App.tsx` satisfies these as long as
     the layout reflows at 1.4× — Simple's single-column grid (`.level-simple .today-grid`) guarantees it.
   - 2.1.4 Character Key Shortcuts: Pro's single-key shortcuts need an off switch (§3.5).
   - Microsoft's inclusive-design guidance, "solve for one, extend to many" —
     <https://inclusive.microsoft.design/> — is the reason Simple is a *level*, not a separate accessibility mode.
6. **Working memory is about four items.** Cowan (2001) — <https://doi.org/10.1017/S0140525X01003922>. Simple
   shows at most three cards with at most three lines each. NN/g's findings on older adults (slower scanning,
   penalised by small targets and jargon — <https://www.nngroup.com/articles/usability-for-senior-citizens/>)
   and on children (literal reading of labels, no tolerance for hidden affordances —
   <https://www.nngroup.com/articles/childrens-websites-usability-issues/>) set the same constraints.
7. **Executives want the decision, then the evidence.** BLUF — bottom line up front —
   <https://en.wikipedia.org/wiki/BLUF_(communication)>; Minto's pyramid principle
   (<https://www.barbaraminto.com/>); Few's dashboard rules — one screen, no scrolling for the headline numbers,
   preattentive encoding for change (<https://www.perceptualedge.com/>; NN/g —
   <https://www.nngroup.com/articles/dashboards-preattentive/>). Pro's Today opens with a "Decide today" card
   and a row of four numbers with week-over-week deltas.
8. **Plain language is for everyone, including experts.** NN/g —
   <https://www.nngroup.com/articles/plain-language-experts/>; US federal guidelines —
   <https://www.plainlanguage.gov/guidelines/>. Pro copy is *terser*, not more technical.

## 3. The three levels — exact contents

```ts
// src/shared/adapt.ts (exists)
export type UiLevel = 'simple' | 'standard' | 'pro'
export type UiLevelSetting = 'auto' | UiLevel
```

Personas the levels are tuned for:

- **Simple** — a grandparent, a child with their first inbox, anyone who wants "tell me if something needs me".
  One big button, at most three cards, huge type, the app talks, no jargon.
- **Standard** — the v0.9 default: a working person with one or two inboxes who reads the brief in the morning.
- **Pro** — an owner, executive, or anyone running several inboxes: glanceable density, decisions first,
  multi-inbox chips, delegation, keyboard, weekly trends.

### 3.1 Level × surface matrix

"Shipped" marks what `e3bba14` already does; everything else is new.

| Surface | Simple | Standard | Pro |
|---|---|---|---|
| **Sidebar tabs** (order fixed) | Today · My briefs · Setup *(shipped)* | Today · My briefs · People · Setup *(shipped)*; **More ▸** disclosure reveals Details, Inbox review (replaces the silent `simpleMode` gate; the reveal is a signal) | Today · Briefs · People · Inbox · Details · Setup *(shipped as 6 tabs)*; numbered `1`–`6` |
| **Sidebar** | 240 px, 20 px labels, 56 px rows; status line also spoken when a run finishes | as today (200 px, 14 px) | 184 px, 13 px labels; status shows last-run time and scan count |
| **Check my email** | Sidebar button stays (anchor); hero `big-btn` 64 px tall, 22 px text, full hero width | as today | as today; `R` key (never while typing); sidebar label "Check now" |
| **Today hero** | `h1` 34 px *(shipped)*; headline 20 px *(shipped)*; last-checked coarse ("Checked this morning") | as today | headline 15 px; exact last-checked; inbox chips become **filter chips** (`All` first) |
| **Today: max cards** | **3** (§3.2), single column *(grid shipped)*, 17 px body *(shipped)*, 3 items per card + "and N more" | unlimited, `auto-fit minmax(300px,1fr)` | unlimited, `auto-fit minmax(260px,1fr)` *(shipped)*, 14 px body *(shipped)* |
| **Today: cards shown** | Top 3 by §3.2 | all cards with content, code order (audit P1-5 asks for Needs you full-width first) | **Decide today** (new, first) → **This week in numbers** (new) → Needs you → Waiting for your reply → Promises → This week → per-skill → Pulse → Others owe you → Circle → Done recently → Personal → Sensitive |
| **Today: hidden at this level** | Pulse, Others owe you, Done recently, Personal, new faces *(shipped)*; **Sensitive** folds into one line under the third card (currently still a card) | Sensitive collapsed to one line with disclosure | nothing |
| **Today: per-item actions** | Done ✓, Draft reply — 56 px targets | Done ✓, Draft reply, Follow up *(as today)* | Done, Reply, **Delegate…**, **Snooze** (1 d / 3 d / next week); `j/k/d/e/f/s` |
| **Today: hero buttons** | **Read it to me** big *(shipped)*; **Explain this screen** (new) | Read it to me · Add dates to calendar *(shipped)*; Export list (CSV) returns here (audit: "Save as spreadsheet") | Read it to me · Calendar · CSV · **Copy for my assistant** *(shipped)* · `?` |
| **All-clear state** | Full-width card; "All good. Nothing needs you today."; spoken on open | as today | one-line banner "Clear · 0 need you · 0 waiting · next check 7:30" above the numbers row |
| **My briefs** | Entries read "Today", "Yesterday", weekday names; Save as PDF only | as today | daily/weekly chips; Save PDF, Copy Markdown, Open folder |
| **People** | not a tab *(shipped)*; going-quiet lines surface in Today's Circle card when it ranks | as today | + **Delegates** section (feeds Delegate…) and role chips |
| **Setup hub tiles** (in-flight `Setup.tsx` implements this row; tile order is fixed at every level) | 3 up front: **Email accounts**, **Text & voice** (Preferences), **Help me with a website** (Web chores); **Show more setup** reveals What to watch for and Smarter sorting (audit §3.5 agrees on three) | 5: Email accounts, What to watch for, Preferences, Smarter sorting (AI), Web chores; **Sign-in setup** only when a provider is unconfigured | 6 (Sign-in setup always) + **Agent bridge** and **Custom watchers** tiles |
| **Preferences** | Basics, Looks & comfort, What I get at `minLevel: 'simple'` *(shipped)*; **Show everything** *(shipped)* | all five groups *(shipped)*, Advanced collapsed | all five expanded *(shipped)*; search autofocused, answers `/` |
| **Notifications** (scheduled runs, `src/main/index.ts`) | "Your summary is ready. Two things need you." | as today | "Brief ready · 4 need you (▲1) · 3 waiting · 212 scanned" |
| **Voice** | `speakBriefs` **on** by level-derived default (source *chosen for you*, §6.2) | off | off |
| **Type scale** (before `textSize` zoom) | base 17–18 px *(shipped for cards)*; extend to sidebar, Setup tiles, Preferences rows | 14 px | 13–14 px *(shipped for cards)* |
| **Default `textSize`** | `large` (level-derived, §6.2) | `normal` | `normal` |
| **Keyboard** | none | `/` and `?` | full map (§3.5) |
| **Onboarding** | unchanged three steps; after the first brief at Simple: "Want me to read it to you each morning?" | as today | step 3 nudge "Connect another inbox?" when a business profile was detected |

### 3.2 Simple: choosing the three cards

Replace the per-card `simple ?` guards in `Today.tsx` with one `pickCards(brief, level)` in
`src/renderer/src/views/today/pickCards.ts`. Cards are ranked in this fixed order; the first three with content are
shown; every other card with content is counted into one link at the bottom, **"Show me everything (4 more)"**,
which expands to the Standard layout *for this session only* — not a level change, but counted as
`features.expand` (§4.1).

1. Needs you (`topIssues`)
2. Waiting for your reply (`waitingOnYou`)
3. This week (`schedule`, today and tomorrow only, as shipped) — or Coming up (`deadlines`) when empty
4. Bills & invoices skill section (`skillSections` where `skillId === 'bills'`)
5. Promises you made (overdue only, as shipped)
6. Appointments skill section
7. Your circle (`people.goingQuiet` only, as shipped)
8. Remaining skill sections, in their existing order
9. Personal

Inside a card: at most three items, then "and 2 more" which opens that card in the Standard layout. Overdue and
urgent items sort first. Sensitive notices become one line under the third card ("One message contains private
details — nothing is hidden.") rather than a fourth card.

### 3.3 Pro: the decisions-first brief

**Decide today** is synthesized in the renderer from the existing `Brief` (no pipeline change):

| Row source | Rule | Line format |
|---|---|---|
| `topIssues` | `severity` in `urgent`, `high` | **{title}** — {nextStep} · {sources[0]} |
| `schedule.days[].events`, `deadlines` | within 48 h, or `conflict === true` | **{title}** — {time or 'by ' + day} · {person} |
| `promises` | `overdue === true` | **You promised {to}** — "{text}" |
| `waitingOnYouDetails` | counterpart in the inner circle (`people` tier) or `vipSenders` | **Reply to {counterpart}** — {subject} |

Each row carries `[Done] [Reply] [Delegate…] [Snooze]`. Cap 8 rows, then "+3 more in Needs you".

**This week in numbers** — four stat tiles with week-over-week deltas and 7-day sparklines: *Need you*
(open issues), *Waiting on you*, *Mail per day*, *Resolved this week*. Source: `reports.brief_json` (last run
of each day) and `runs.messages_scanned`, via one new repo query `briefHistory(db, days)`. Deltas use `▲ ▼ ▬`
plus the number, never colour alone (WCAG 1.4.1; audit P1 on trend glyphs).

**Multi-inbox chips.** The hero chips (`brief.inboxes`, shipped, hidden at Simple) become toggles. Selecting one
filters every card's items by `accountId` where the data carries one (`ScheduleEvent.accountId`,
`InboxSummary`), and dims cards that cannot be filtered rather than hiding them.

**Delegate…** opens the person's mail app via `mailto:` (the `replyMailto` mechanism in `src/shared/mailto.ts`)
to a delegate from a small popover, subject `Fwd: {subject}`, body "Could you take this? {nextStep}\n\n{snippet}".
Delegates come from a new setting `delegates: string[]`, defaulting to the three colleagues with the highest
`replied_to_me` in `people`. InboxScout stays read-only; the person's mail app sends.

**Snooze** hides an issue until a date: `meta` key `snooze:{issueId}` → ISO date; `Today.tsx` filters snoozed
issues the way it already filters `doneIds`.

### 3.4 Simple: spoken help

- **Read it to me** is shipped and big at Simple; the `speakBriefs` level default (§6.2) covers scheduled runs.
- **Explain this screen** (new; on every tab at Simple, in the `?` sheet elsewhere) speaks and shows two sentences
  from a `screenHelp[level][tab]` table, e.g. Today: "This is your summary. The top card shows what needs you.
  Press the big blue button any time to check again."
- **Why?** on every card (§6.1) speaks its explanation at Simple.
- Speech uses `window.speechSynthesis` in the renderer through the in-flight `speak(text)` in
  `src/renderer/src/useLevel.ts` (same mechanism as `Today.readAloud`); the OS voice (`src/main/voice.ts`)
  remains for scheduled runs with the window closed. Views read the level with `useLevel()` from the same file
  (it wraps `window.inboxScout.uiLevel()`), so no prop-drilling from `App.tsx` is needed.

### 3.5 Pro keyboard map

| Key | Action | Where |
|---|---|---|
| `1`–`6` | switch tab | anywhere, no input focused |
| `R` | Check my email | anywhere, no input focused (the in-flight `copy.ts` already says "Press R to run") |
| `j` / `k` | move selection | Today (Decide today, Needs you), Inbox |
| `d` / `e` / `f` / `s` | Done / Draft reply / Delegate… / Snooze | selected row |
| `/` | focus search | Inbox, People, Preferences |
| `?` | shortcut sheet | anywhere |
| `Esc` | close sheet or popover, clear selection | anywhere |

Single printable keys are disabled while any input, select, or textarea has focus; the whole map is off at Simple
and Standard and behind a new `keyboardShortcuts` setting at Pro (WCAG 2.1.4). Every use increments
`features.keys`.

### 3.6 `simpleMode` and `uiLevel`

Both exist today. Rule: `uiLevel` decides the level; `simpleMode` survives only as the Standard-level "Show
advanced tools" toggle (registry key `simpleMode`, `minLevel: 'standard'`, as shipped) and is ignored at Simple
(always hidden) and Pro (always shown). `App.tsx` already implements this. Add `uiLevel` to the bridge
`SETTINGS_ALLOWLIST` and `publicSettings()`; an agent write sets source `agent` (§6.2). Retire `simpleMode` from
the allowlist in a later release, not here.

## 4. Signals and the adaptation engine

### 4.1 Signals we can observe with zero setup

All local; nothing leaves the machine. The shipped store (`src/main/usage.ts`, `meta` key `usage`) keeps
lifetime counters. Change it to **per-day buckets kept 60 days**, so windows can be computed and old habits fade:

```json
{ "installedAt": "2026-09-01T…", "days": { "2026-09-06": { "sessions": 1, "tabs": { "today": 3, "review": 1 }, "features": { "search": 2, "expand": 1, "voice": 1 } } }, "runs": [ … last 14 … ] }
```

`recordSession`, `recordTab`, `recordFeature`, `recordRun` keep their signatures; `currentSignals` gains the
windowed fields. Renderer events go through the existing `usage:track`; main-side events are counted inside
their own `ipcMain.handle` bodies so they cannot be missed.

| Signal | `UsageSignals` field | Source | Suggests |
|---|---|---|---|
| Profile group and id | `profileGroup`, `profileId` *(shipped)* | `PROFILES[s.profileId].group` | Weak hint. Shipped lists: `PRO_PROFILES`, `SIMPLE_PROFILES`. Behavior must dominate — a retired CEO exists. |
| Number of accounts | `accounts` *(shipped)* | `repo.listAccounts(db).length` | more → Pro |
| Daily mail volume | `dailyVolume` *(shipped: mean new messages per scan over ≤ 14 runs)* | `usage.runs` | high → Pro; very low → Simple |
| Issues per day | `issuesPerDay` *(shipped: mean open issues per brief)* | `usage.runs` | high → Pro |
| Sessions | `sessions14d`, `onlyTodaySessions14d` (new) | day buckets; a session with only `today` tab visits | mostly Today-only → Simple |
| Opens advanced tabs | `advancedTabOpens14d` (new; replaces lifetime `tabVisits`) | `tabs.dashboard + tabs.review` + Standard "More ▸" reveals | → Pro |
| Search | `searches14d` (new) | `features.search` *(tracked in `Review.tsx`)* | → Pro |
| Corrections | `corrections30d` (new) | `corrections` table `created_at` (exists) | → Pro |
| Exports | `exports30d` (new) | `features.export` *(tracked in `Today.tsx`)* | → Pro |
| Assistant | `assistantCustomTasks30d` (new; shipped `features.assistant` counts every start) | `agent:start` with a `goal` — recipe runs are not counted; grandparents use recipes to get app passwords | → Pro |
| Text size | `textSize` *(shipped)* | `AppSettings.textSize` | `xlarge` strongly Simple; `large` Simple |
| Voice | `readAloudTaps30d` (new; shipped `features.voice`), `speakBriefsByUser` (new) | day buckets; `speakBriefs` only when its source is `user` (§6.2) | → Simple |
| Delivery elsewhere | `deliveryOn` (new) | `deliverEmailTo`, `smsPhone` non-empty | with few sessions → Simple |
| Integrations | `integrations.bridge` *(shipped as `bridgeEnabled`)*, `.webhook`, `.customSkills` (new) | `bridgeEnabled`, `agentWebhookUrl`, custom skills count | → strongly Pro |
| AI provider | `aiProvider` (new) | `ai.provider !== 'builtin'` | mild Pro |
| Time since install | `installedAt` *(shipped)* | `usage.installedAt` | eligibility gate, not a score input |
| Expansion taps | `expandTaps14d` (new) | "Show me everything" at Simple, "More ▸" at Standard | → up one level |
| Shortcut use | `shortcutUses14d` (new) | `features.keys` | → Pro |
| Dismissals | `keepIt` (new, lifetime, by direction), `moreDismissals14d` (new) | `ui:revertLevel` increments; "Not now" on expansion nudges | dampen the refused direction |

### 4.2 Scoring rule

Keep `scoreLevel`'s shape (weights with a reason each); replace its table with the one below and make reasons
structured (`{ code, weight, text }`) while still exposing `reasons: string[]` for the shipped banner and tests.

| Signal | Contribution |
|---|---|
| `textSize === 'xlarge'` / `'large'` | −3 / −2 *(shipped)* |
| `readAloudTaps30d ≥ 3` or `speakBriefsByUser` | −2 |
| `onlyTodaySessions14d / sessions14d ≥ 0.8` with `sessions14d ≥ 5` | −2 |
| `deliveryOn` and `sessions14d ≤ 1` | −1 |
| `dailyVolume < 15` | −1 *(shipped)* |
| `SIMPLE_PROFILES` / `profileGroup === 'life'` | −2 / −1 *(shipped)* |
| `PRO_PROFILES` / `profileGroup === 'business'` | +1 / +2 *(shipped)* |
| `accounts ≥ 3` / `= 2` | +3 / +2 *(shipped)* |
| `dailyVolume ≥ 60` | +2 *(shipped)* |
| `issuesPerDay ≥ 6` | +1 *(shipped)* |
| `advancedTabOpens14d ≥ 5` / `≥ 2` | +2 / +1 |
| `searches14d ≥ 5` | +1 |
| `corrections30d ≥ 5` / `≥ 1` | +2 / +1 |
| `exports30d ≥ 2` | +1 |
| `assistantCustomTasks30d ≥ 2` | +1 |
| `shortcutUses14d ≥ 5` | +2 |
| `expandTaps14d ≥ 3` | +2 |
| any `integrations.*` | +3 (shipped: bridge +1) |
| `aiProvider !== 'builtin'` | +1 |
| each `keepIt.againstSimple` / `keepIt.againstPro` | +1 / −1 |

Candidate from the score with a Schmitt-trigger dead band (<https://en.wikipedia.org/wiki/Schmitt_trigger>) —
the shipped single thresholds (≥ 4 Pro, ≤ −3 Simple) become *entry* thresholds, and leaving a level needs the
score to come well back:

| Currently | Becomes Simple when | Becomes Standard when | Becomes Pro when |
|---|---|---|---|
| Standard | score ≤ −3 | — | score ≥ +4 |
| Simple | — | score ≥ 0 | never directly (goes through Standard) |
| Pro | never directly | score ≤ +1 | — |

### 4.3 Hysteresis and safety rules

The engine may *compute* whenever it likes (the shipped `ui:level` may keep returning `suggested`); it may
*apply* a change only when all of these hold:

1. **Never during a session.** Apply only in `bootstrap()` right after `recordSession(db)`, and on window show
   after ≥ 8 h hidden. `ui:level` becomes read-only (compute, do not persist a level change). The pure function
   takes `context: 'launch' | 'session'` and refuses to change in `'session'`, so the rule is testable.
2. **One evaluation per calendar day** (`lastEvaluatedOn`), and a change needs the **same candidate on three
   consecutive evaluations** (`streak.count ≥ 3`).
3. **Change budget.** First automatic change no earlier than **3 days** after `installedAt` (the shipped
   "first pick immediate" stays: it sets the initial level before anyone has seen another); later changes
   ≥ **7 days** apart *(shipped)*.
4. **Not enough data → no change.** `sessions14d < 5` or fewer than 3 runs: report, do not apply (shipped:
   ≥ 3 sessions lifetime).
5. **Manual override wins** *(shipped: `resolveLevel`)*. With an explicit `uiLevel`, Preferences shows
   "InboxScout would pick {suggested} — Switch" *(shipped in the uiLevel row's Why?)*.
6. **Announce once, undo in one tap** *(shipped banner)*. Spoken once at Simple. Cleared on tap or at the next
   session start.
7. **"Keep it the way it was"** *(shipped: pins `uiLevel = previous`)* additionally increments
   `keepIt.against{Simple|Pro}` so the refused direction is dampened for good.
8. **Two-level jumps never happen in one change**; Simple → Pro passes through Standard a week later.
9. **Level-derived defaults never overwrite a user choice** (`textSize`, `speakBriefs`; §6.2).

### 4.4 TypeScript shape — pure engine

Extend `src/shared/adapt.ts` in place. Exists / new is marked; nothing shipped is renamed.

```ts
export type UiLevel = 'simple' | 'standard' | 'pro'          // exists
export type UiLevelSetting = 'auto' | UiLevel                 // exists

export interface UsageSignals {                               // exists — fields added
  installedAt: string | null
  sessions: number
  tabVisits: Record<string, number>
  features: Record<string, number>
  textSize: 'normal' | 'large' | 'xlarge'
  accounts: number
  dailyVolume: number
  issuesPerDay: number
  profileGroup: ProfileGroup | null
  profileId: string | null
  bridgeEnabled: boolean
  now: string
  // new — windowed and intent signals (§4.1)
  runsTotal: number
  sessions14d: number
  onlyTodaySessions14d: number
  advancedTabOpens14d: number
  searches14d: number
  corrections30d: number
  exports30d: number
  assistantCustomTasks30d: number
  readAloudTaps30d: number
  expandTaps14d: number
  shortcutUses14d: number
  moreDismissals14d: number
  speakBriefsByUser: boolean
  deliveryOn: boolean
  aiProvider: ProviderId
  integrations: { bridge: boolean; webhook: boolean; customSkills: number }
  keepIt: { againstSimple: number; againstPro: number }
}

export interface Reason { code: string; weight: number; text: string }   // new

export interface LevelDecision {                              // exists — `parts` added
  level: UiLevel        // now the *candidate* for the current level (dead band applied)
  score: number
  reasons: string[]     // kept for the banner and existing tests
  parts: Reason[]       // new — every non-zero contribution, |weight| desc
}

export interface LevelState {                                 // exists — fields added
  level: UiLevel
  since: string
  announce: boolean
  reasons: string[]
  previous?: UiLevel
  // new
  lastEvaluatedOn: string | null            // YYYY-MM-DD
  streak: { candidate: UiLevel; count: number }
  keepIt: { againstSimple: number; againstPro: number }
}

export interface Rules {                                      // new; DEFAULT_RULES exported
  enterSimple: number; leaveSimple: number; enterPro: number; leavePro: number   // −3, 0, +4, +1
  streak: number; minDaysFirst: number; minDaysBetween: number                    // 3, 3, 7
  minSessions14d: number; minRuns: number                                         // 5, 3
}

export type Block = 'session' | 'too-soon' | 'streak' | 'no-data' | 'two-level-jump'   // new

/** exists — signature widened. Pure; `current` lets the dead band apply. */
export function scoreLevel(s: UsageSignals, current?: UiLevel, rules?: Partial<Rules>): LevelDecision

/** exists — `context` added. Pure; returns the state to persist plus why it did or did not move. */
export function nextLevelState(
  prev: LevelState | null,
  decision: LevelDecision,
  signals: UsageSignals,
  context: 'launch' | 'session',
  rules?: Partial<Rules>
): LevelState & { changed: boolean; blockedBy: Block[]; nextEligibleAt: string | null }

export function resolveLevel(setting: UiLevelSetting, state: LevelState | null): UiLevel   // exists

/** new — "Keep it the way it was", pure. Caller also sets uiLevel = previous (shipped behavior). */
export function keepPrevious(state: LevelState): LevelState
```

`src/main/usage.ts` changes: `evaluateLevel(db)` splits into `peekLevel(db)` (compute only; backs `ui:level`) and
`adaptLevel(db, context)` (compute + `nextLevelState` + persist; called from `bootstrap()` and the ≥ 8 h show
hook). `UiLevelInfo` gains `blockedBy` and `nextEligibleAt` for the Preferences why-line.

### 4.5 Tests to add (`tests/adapt.test.ts`)

- `nextLevelState(…, 'session')` never returns `changed: true`.
- Over a simulated 120-day history with daily launches and random scores, no two changes are < 7 days apart.
- Scores alternating −4, −2, −4, −2 from Standard produce at most one change (into Simple) and never leave it.
- No single change moves two levels.
- After two Keep-its against Simple, an otherwise Simple-scoring person stays Standard.
- Every `Reason.code` has a copy entry at all three levels (§7).

## 5. Stable anchors

Identical in label, position, and behavior at every level, forever. Adaptive interfaces earn trust by what they
refuse to touch (Gajos 2006/2008; WCAG 3.2.3, 3.2.4, 3.2.6).

| Anchor | Rule |
|---|---|
| **Check my email** | Always the bottom item of the sidebar (`run-btn`), always blue, always "✉ Check my email" / "Checking…", disabled only while running. At Simple the hero `big-btn` is a second, larger copy — two ways to do the one thing is fine; a moved button is not. |
| **Today first** | Always the first tab and the tab the app opens on. Never renamed. |
| **Setup entry** | Always the last tab, always "Setup". Its hub may show fewer tiles, but **Email accounts** is always the first tile and **Preferences** is always reachable (directly, or via "Show more setup" at Simple). |
| **Tab order** | Today, My briefs, People, Inbox review, Details, Setup. Levels remove items from this list; they never reorder or insert. A future tab is appended before Setup. |
| **Read it to me** | Present whenever a brief exists, hero, same position, same label. |
| **Help affordance** | "Explain this screen" / "Why?" top-right of the content area on every screen (3.2.6). |
| **Card names and icons** | A card is called the same thing at every level ("Needs you" is never "Action items"); only body copy and density change. |
| **Save** | Preferences saves the same way at every level: one Save button at the bottom *(shipped)* plus per-row Back to automatic *(shipped)*. |
| **Change etiquette** | Announced once, undoable in one tap, never mid-session. |

Rendering rule: a level may pass `hidden`, `dense`, or `spoken` to a component. It may not pass `order`.
`tests/level-anchors.test.tsx` asserts, for each level: tab ids are a subsequence of the master list, `today` is
first, `setup` is last, and the `run-btn` renders.

## 6. Explainability: cards and settings

### 6.1 "Why am I seeing this?" per card

The shipped `Why` component (static sentence, ⓘ toggle) becomes a registry-driven popover — 44 px hit area,
56 px at Simple, labeled **Why?** — with three parts:

1. **What produced it**, from `CARD_EXPLANATIONS` (the shipped sentences move here; skill cards get one built from
   `Skill.description` and the profile that switched the skill on).
2. **Why at this level**, only when visibility depends on level: "Shown because you are on the Pro view." /
   "Hidden at Simple — tap Show me everything."
3. **Actions**: *Hide this kind of card* (new setting `hiddenCards: string[]`, source `user`), *Show fewer /
   more* for skill cards (→ Setup → What to watch for), *Not important* for circle lines (`markPerson`).

Spoken at Simple.

```ts
// src/renderer/src/views/today/cardExplanations.ts (new)
export type CardId =
  | 'needs_you' | 'waiting_on_you' | 'waiting_on_them' | 'promises' | 'this_week' | 'coming_up'
  | 'circle' | 'pulse' | 'done_recently' | 'personal' | 'sensitive' | 'all_clear'
  | 'decide_today' | 'trends' | `skill:${string}`

export interface CardExplanation {
  id: CardId
  /** Plain sentence(s); {profile} and {skill} filled at render time. */
  whatProducedIt: string
  copy?: Partial<Record<UiLevel, string>>
  /** Lowest level at which the card can appear on Today. */
  minLevel: UiLevel
  fixIn: { view: 'skills' | 'people' | 'prefs' | 'review'; label: string } | null
  hideable: boolean
}
export const CARD_EXPLANATIONS: Record<Exclude<CardId, `skill:${string}`>, CardExplanation>
export function explainCard(id: CardId, ctx: { level: UiLevel; profileName: string; skill?: { name: string; description: string } }): string
```

### 6.2 Settings model

The shipped registry already gives every plain setting a label, what it does, why the default, who changes it, a
group, level visibility, a search box, badges, and Back to automatic. Three things are missing, and they are the
difference between "looks explained" and "is explained":

**(a) Stored provenance.** Today the badge is inferred: `managed` → *chosen for you*, `isDefault` → *default*,
otherwise *you set this*. So `profileId` switched by `applyAutoProfile`, or `speakBriefs` switched by an agent
through `update_settings`, both read "you set this". Store it instead:

- `meta` key `settings:sources` → `SettingSources` (below). Kept beside settings, not inside `AppSettings`, so the
  bridge's `publicSettings()` and the DB migration story are untouched.
- `settings:set` from Preferences diffs old vs new and marks changed keys `user`.
- `applyAutoProfile` marks `profileId` `auto`; `profiles:choose` marks `user` (or `auto` for `'auto'`).
- The level engine marks `textSize` and `speakBriefs` `auto` when it derives them — **only if** the current source
  is `default` or `auto`.
- Bridge `update_settings` marks `agent` with `by` (token label or `'agent'`).
- Missing entry = `default`.

The badge then reads *chosen for you* (`auto`), *default*, *you set this* (`user`), or *set by Hermes* (`agent`).

**(b) Automatic ≠ default.** The shipped Back to automatic writes `defaultOf(key)`. Add `auto(ctx)` per
descriptor — what InboxScout would choose *now* for this level and profile — and have Back to automatic write that
and set the source to `auto`. For most keys `auto` is the default; the exceptions are the level-derived ones:

| Key | Simple | Standard | Pro |
|---|---|---|---|
| `textSize` | `large` | `normal` | `normal` |
| `speakBriefs` | `true` | `false` | `false` |
| `simpleMode` (advanced tabs) | ignored | `true` | ignored |
| `keyboardShortcuts` (new) | ignored | ignored | `true` |

**(c) Rows for the keys "handled elsewhere".** The registry test exempts `profileId`, `ai.provider`,
`ai.customBaseUrl`, `enabledSkillIds`, `vipSenders`, `mutedSenders`, `quietPeople`. Give each a `kind: 'link'`
row so search finds them ("important people" → People; "AI" → Smarter sorting) and they show a value and a source line;
the richer editors stay where they are.

Per-row content stays as shipped (label · what · why · who · badge · Why? · Back to automatic), with the badge
now showing the stored source and, for `agent`, who. Group ids and names stay as shipped: `basics` Basics,
`looks` Looks & comfort, `get` What I get, `helpers` Helpers & other agents, `advanced` Advanced. Risky settings
gain a `caution` line rendered as a red `.hint`: `bridgeAccess: 'full'`, `assistantAutonomy: 'full'`,
`storeFullBodies: false`.

### 6.3 TypeScript shape — settings registry

Extend `SettingDesc` in `src/shared/settingsRegistry.ts`; nothing shipped is renamed.

```ts
export type SettingGroupId = 'basics' | 'looks' | 'get' | 'helpers' | 'advanced'   // exists
export type SettingSource = 'default' | 'auto' | 'user' | 'agent'                   // new

export interface AutoContext {                                                     // new
  level: UiLevel
  profile: { id: string; name: string; group: string }
  settings: AppSettings
  baked: { google: boolean; microsoft: boolean }
}

export interface SettingDesc {                      // exists — fields added
  key: string
  group: SettingGroupId
  label: string
  what: string
  why: string
  who?: string
  kind: 'select' | 'toggle' | 'text' | 'password' | 'number' | 'time' | 'list' | 'folder' | 'link'   // 'link' new
  options?: SettingOption[]
  placeholder?: string
  minLevel?: UiLevel
  showWhen?: (s: AppSettings) => boolean
  managed?: boolean
  // new
  auto?: (ctx: AutoContext) => unknown         // default: () => defaultOf(key)
  format?: (value: unknown, ctx: AutoContext) => string
  caution?: string
  keywords?: string[]
  link?: { view: 'accounts' | 'skills' | 'ai' | 'assistant' | 'helper' | 'people'; cta: string }
  copy?: Partial<Record<UiLevel, Partial<Pick<SettingDesc, 'label' | 'what'>>>>
  agentWritable?: boolean                       // mirrors SETTINGS_ALLOWLIST; test enforces
}

export interface SettingSourceRecord { source: SettingSource; at: string; by?: string }   // new
export type SettingSources = Record<string, SettingSourceRecord>                          // new; key = dotted path

export interface SettingView extends SettingDesc {   // new — what Preferences renders
  value: unknown
  valueText: string
  sourceRecord: SettingSourceRecord
  autoValue: unknown
  isAutomatic: boolean      // value === autoValue and source in default/auto → hide Back to automatic
}

export function describeSettings(settings: AppSettings, sources: SettingSources, ctx: AutoContext, level: UiLevel): SettingView[]   // new
export function autoOf(key: string, ctx: AutoContext): unknown                                                                     // new
// existing: visibleAt, getSetting, setSetting, defaultOf, isDefault, searchSettings (now also matches keywords)
```

New IPC: `settings:describe()` → `SettingView[]`; `settings:resetAuto(key)`. New bridge op `describe_settings`
(read-only, secrets omitted) so an agent can explain a setting in its own words. Add `keywords` to the search
haystack (shipped search already covers label, what, why, who, key, option labels).

## 7. Copy guidelines per level

At `e3bba14` every string is shared across levels. The in-flight `src/renderer/src/copy.ts` introduces
`COPY: Record<string, { simple?; standard; pro? }>` and `t(key, level)` with fallback to Standard, plus
`lastChecked(when, level)` and the `SIMPLE_JARGON` deny-list; keep those names. Every string in §3, every
`Reason.text`, and the notification bodies in `src/main/index.ts` go through `t()`. Because `copy.ts` lives in the
renderer, main-process strings (notifications, spoken summaries) need the table moved to `src/shared/copy.ts`
with the renderer re-exporting it.

| Rule | Simple | Standard | Pro |
|---|---|---|---|
| Reading level (Flesch–Kincaid) | grade 5 or below | grade 8 | any, but shorter than Standard |
| Sentence length | ≤ 12 words | ≤ 20 words | fragments allowed; numbers first |
| Person | "you" and "I" ("I checked your email") | "you" and "InboxScout" | "you"; the app is not a character |
| Jargon | none. Never: sync, scan, run, IMAP, OAuth, API, provider, model, classification, profile, issue, bridge, webhook. Say: check, email, helper, kind of work, thing that needs you | product terms with a gloss on first use | product terms without gloss; abbreviations fine |
| Numbers | words to three ("two things need you"), digits above | digits | digits with deltas ("4, ▲1") |
| Time | coarse and relative ("this morning", "in two days") | relative with clock time | absolute ("Tue 2:00 pm") |
| Buttons | verb + object, ≤ 3 words, never a bare icon | as today | verb only where the row makes the object obvious |
| Empty states | reassure, then one action | explain, then one action | one line |
| Errors | what happened, what to press, never a code | as today plus "Show details" | one line, detail inline |
| Voice | every string must read well aloud; no symbols or parentheticals | — | — |

The same strings at each level:

| Key | Simple | Standard | Pro |
|---|---|---|---|
| `tab.reports` | My briefs | My briefs | Briefs |
| `tab.review` | — | Inbox review | Inbox |
| `hero.run` | Check my email | Check my email now | Check now |
| `hero.empty.noAccount` | First, tell me where your email is. Press **Setup**. | Connect an email account in Setup, then check your email to get your first brief. | No inbox connected. Setup → Email accounts. |
| `hero.empty.noBrief` | Press the big blue button and I will check your email. | Press the button to check your email and get your first brief. | No brief yet. Press R to run. |
| `hero.lastChecked` | I checked this morning. | Last checked today at 7:30 am | 7:30 am · 212 msgs · 2 inboxes |
| `card.needs_you.item` | **Pay the electric bill.** It is due Friday. | **Electric bill due** → Pay $142 by Fri Sep 12 (City Power) | **Electric bill** $142 · Fri 12 · City Power |
| `card.waiting_on_you.hint` | These people wrote to you and are waiting to hear back. | Draft reply opens your own mail app with a starter message — you review and send. | Reply opens your mail app. |
| `card.all_clear` | All good. Nothing needs you today. | You're all caught up. Nothing needs your attention right now. | Clear · 0 need you · 0 waiting |
| `card.circle.quiet` | You usually hear from Mom every week. It has been three weeks. | You usually hear from Mom every week; it's been 3 weeks. | Mom: quiet 3 wk (usual: weekly) |
| `notif.ready` | Your summary is ready. Two things need you. | InboxScout — brief ready: 212 new messages scanned, 2 issues need attention. | Brief ready · 2 need you (▲1) · 3 waiting · 212 scanned |
| `adapt.banner.toSimple` | I made things simpler, because you mostly listen to your summary. | InboxScout switched to the Simple layout — extra-large text, you like it read aloud. One big button, big text, only what needs you today. *(shipped shape)* | Switched to Simple: xlarge text, voice ×4. |
| `adapt.banner.toPro` | — | InboxScout switched to the Pro layout — 3 inboxes connected, you open the Details and Inbox review tabs. | Switched to Pro: 3 inboxes, 9 review opens, 6 corrections. |
| `adapt.ok` / `adapt.keep` | OK / Keep it the way it was | Sounds good / Keep it the way it was *(shipped)* | OK / Keep previous |
| `settings.source.auto` | I chose this for you | chosen for you *(shipped)* | auto |
| `settings.source.user` | You chose this | you set this *(shipped)* | user |
| `settings.source.agent` | Your helper chose this | set by {agent} | agent: {agent} |
| `settings.backToAuto` | Let InboxScout choose | ↺ Back to automatic *(shipped)* | Auto |
| `why.button` | Why? | Why am I seeing this? | Why? |
| `explain.today` | This is your summary. The top card shows what needs you. Press the big blue button any time to check again. | Today shows what needs you, who is waiting on a reply, and what is coming up, from every inbox. | Decisions first, evidence below. R to run, 1–6 for tabs, / to search, ? for keys. |
| `error.noKey` | Your smart helper is not connected. Press **Setup**, then **Smarter sorting**. | No API key connected for "gemini". Open Setup → Smarter sorting (AI) to add one. | No key for gemini — Setup → Smarter sorting. |

Reason texts follow the same table by `Reason.code`, e.g. `text-size-xlarge`: Simple "You use extra-large
text." · Standard "extra-large text" *(shipped)* · Pro "textSize=xlarge (−3)".

Lint: the in-flight `tests/copy.test.ts` already runs every `simple` variant through a small Flesch–Kincaid
function (<https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests>) with a grade ≤ 7 and
≤ 14-word-sentence rule and the `SIMPLE_JARGON` deny-list, and checks registry labels for `oauth`/`imap`/
`webhook`/`api`. Extend it to `Reason.text` variants and to `screenHelp`.

## 8. Rollout in three PRs

Each PR is usable and revertible on its own. Ordered by risk: the engine fix first because it is a correctness
bug in shipped code; layouts second; explainability third.

### PR 1 — Make the engine safe (small, high value)

*"Automatic changes happen only at launch, only after a streak, only across a dead band."*

- `src/shared/adapt.ts`: `Rules`/`DEFAULT_RULES`; `scoreLevel(s, current?)` with the §4.2 table and dead band;
  structured `parts`; `nextLevelState(prev, decision, signals, context)` with streak, daily gate, 3-day first
  change, no-data gate, two-level guard, `blockedBy`, `nextEligibleAt`; `keepPrevious`.
- `src/main/usage.ts`: per-day buckets with 60-day prune (migrate the lifetime blob: fold `sessions`,
  `tabVisits`, `features` into a synthetic bucket dated `installedAt`); windowed fields in `currentSignals`;
  `peekLevel` vs `adaptLevel(db, context)`; `keepIt` counters; `assistantCustomTasks` counted in `agent:start`
  only when `input.goal` is set; corrections from the `corrections` table.
- `src/main/ipc.ts`: `ui:level` → `peekLevel`; `ui:revertLevel` increments `keepIt`; `usage:track` accepts
  `expand`, `keys`, `moreDismiss`.
- `src/main/index.ts`: `adaptLevel(db, 'launch')` after `recordSession`; `browser-window-focus` after ≥ 8 h
  hidden → `adaptLevel(db, 'launch')`.
- `src/main/api/ops.ts`: `uiLevel` in `SETTINGS_ALLOWLIST`.
- Tests: the §4.5 invariants; the shipped `adapt.test.ts` personas keep their outcomes once `base()` gains the
  new fields (under the new table: grandparent xlarge −3, retiree −2, life −1, light inbox −1, voice −2 = −9 →
  Simple; CEO 3 inboxes +3, volume +2, issues +1, business +2, owner +1, 7 advanced opens +2 = +11 → Pro).
- `docs/INSIGHTS.md`: a "What InboxScout counts" paragraph and the **Forget usage** button (Preferences →
  Advanced) that clears `usage`.

Acceptance: a seeded grandparent DB lands on Simple on the fourth launch after day 3 and not before; a seeded
owner DB lands on Pro; saving Preferences mid-session never changes the level; Keep-it reverts, pins, and dampens.

### PR 2 — Finish the three layouts

*"Three cards and a voice at Simple; decisions, chips, numbers, and keys at Pro; anchors under test."*

- `views/today/pickCards.ts` + card components extracted from `Today.tsx` (`CardId` per card); Simple 3-card cap,
  "and N more", **Show me everything**, sensitive one-liner; **Explain this screen** with `screenHelp`.
- Pro: `DecideToday.tsx`, `TrendsRow.tsx` (new repo query `briefHistory`), inbox filter chips, Delegate… (new
  `delegates` setting + People section), Snooze (`snooze:{issueId}` meta), keyboard map + `?` sheet behind
  `keyboardShortcuts`.
- `App.tsx`: Standard "More ▸" disclosure (counts `expand`); sidebar/type scale per level in `styles.css`
  (`.level-simple` sidebar, tiles, Preferences rows; `.level-pro` sidebar); 56 px primary targets at Simple.
- Land the in-flight level-aware `views/Setup.tsx` (tiles per level, state lines, "Show more setup", Sign-in
  setup only when needed); add the Pro-only Agent bridge and Custom watchers tiles.
- `src/main/index.ts`: notification body by level; `speakBriefs` level default applied through `autoOf` (needs
  only the `auto` function from §6.2 (b), which lands here as a minimal `autoOf` for `textSize`/`speakBriefs`).
- Land the in-flight `copy.ts` / `useLevel.ts` / `tests/copy.test.ts`; complete the §7 table; route existing
  strings and notification bodies through `t()` (table moved to `src/shared/copy.ts`).
- Tests: `today-cards.test.ts` (cap, order, overdue-first), `level-anchors.test.tsx`, `copy.test.ts` lint.

Acceptance: §3.1 holds on every tab at every level; Simple never shows a fourth card; every Pro row is reachable
by keyboard; anchors test green.

### PR 3 — Explain everything, properly

*"Stored provenance, automatic ≠ default, every key has a row, every card has a reason and an action."*

- `src/main/settings.ts` + `ipc.ts`: `settings:sources` store and the §6.2 (a) marking rules; `settings:describe`,
  `settings:resetAuto`; `applyAutoProfile` / `profiles:choose` / bridge `update_settings` mark sources.
- `src/shared/settingsRegistry.ts`: `auto`, `format`, `caution`, `keywords`, `link`, `copy`, `agentWritable`;
  `describeSettings`, `autoOf`; link rows for the exempted keys; test that `agentWritable` mirrors
  `SETTINGS_ALLOWLIST` and that every leaf of `DEFAULT_SETTINGS` now has a row (drop the exemption list).
- `views/Settings.tsx`: badges from stored sources (incl. *set by {agent}*), Back to automatic → `autoValue`,
  cautions, level copy.
- `views/today/cardExplanations.ts` + `WhyButton.tsx`: registry, level reason, actions, spoken at Simple,
  `hiddenCards`.
- Bridge `describe_settings`; `scripts/gen-settings-doc.ts` → `docs/SETTINGS.md` generated from the registry
  (same pattern as `scripts/gen-profiles-doc.ts`) so docs cannot drift.

Acceptance: pick any setting — label, what, why, who, current value and *who set it*; Back to automatic appears
only when it would change something; an agent-set value says so; every Today card answers Why? with an action.

## 9. Open questions and non-goals

- **Children.** Simple covers a child's first inbox on reading level and target size, but a child's account is a
  parent's decision; no parental layer is proposed.
- **Shared computers.** Levels are per install, like everything else. Two people on one login get one level; the
  manual choice is the escape hatch.
- **A window that is never hidden** never re-evaluates (rule 1). Acceptable — Preferences is one tap — but worth
  revisiting if tray users report it.
- **Migration of lifetime counters** (PR 1) is lossy by design: old habits fade after 60 days.
- **Two owner decisions where the sources disagree.** (1) *Cold start:* `HUMAN-FACTORS.md` Part 4 makes Simple
  the default; the shipped `resolveLevel` starts at Standard. This spec keeps Standard (a CEO's first screen
  should not look like a toy; Simple is reached within days by the engine, and the text-size and profile signals
  fire on the first run). (2) *Switch vs suggest:* the guide says "suggested by the system, never switched by
  it"; the brief asks for automatic switching with an announcement and a one-tap keep. This spec follows the
  brief, and the restraint rules in §4.3 (launch-only, streak, weekly budget, announce once, one-tap pin) are
  what make an automatic switch behave like a suggestion. Either decision can be flipped with a one-line change
  (`resolveLevel` default; `nextLevelState` writing a suggestion instead of a level). The guide's other §3.6
  triggers (shortcut nudge, split work brief, schedule suggestion) are compatible and belong in a later PR.
- **Simple tabs:** the guide keeps People at Simple; the shipped `App.tsx` removes it. This spec keeps it
  removed (three tabs) and surfaces going-quiet lines through the Circle card instead.
- **Non-goals:** theming, a mobile layout, drag-to-arrange layouts (adaptable ≠ freeform), any telemetry leaving
  the machine, and any change to what the pipeline computes. This spec only changes what is shown, how densely,
  in which words, and how the app explains itself.
