# InboxScout human-factors guide

What the research and the major design guidelines say about three things the owner asked for — an app a child or grandparent can use, an app a CEO wants to use, and an interface that evolves with the person — and exactly what that means for InboxScout's screens.

Scope: the renderer as it exists today (`src/renderer/src/App.tsx`, `views/*.tsx`, `styles.css`, `src/shared/types.ts`). No code was changed. Every principle below has three parts: **the rule**, **the evidence** (with a link), and **what it means for InboxScout** by screen. Part 5 is the ranked top-20 list.

Screens referred to by name: **Today** (`Today.tsx`), **Setup hub** (`Setup.tsx` and its sub-screens Accounts, AI helper, Skills, Connect helper, Assistant, Preferences), **Settings** (`Settings.tsx`, shown as "Preferences"), **Onboarding** (`Onboarding.tsx`), **People** (`People.tsx`), **Assistant** (`Assistant.tsx`).

---

## 0. Where InboxScout stands today (audit facts the rest of the guide refers to)

These are measured from the source, not impressions. Contrast ratios use the WCAG formula; verify with the [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) before shipping.

| Area | Current state (file) | Verdict |
|---|---|---|
| Base text | `body` 14px; `.hint` 12px; `.tiny` buttons 11px; `th` 11px uppercase; `td`/tables 13px (`styles.css`) | Below the 16px floor most guidance uses for older adults. Hints are the most common secondary text and are the smallest. |
| Secondary text contrast | `.hint` uses `--ink-faint #7b8494` on `--paper #fbfbf8` or white cards: about **3.7:1** | **Fails WCAG 1.4.3 (4.5:1)** at 12px. `--ink-soft #4a5261` passes (~7.9:1); `--blue #2456a6` on white passes (~7:1). |
| Sidebar status line | `.status` `#828b9c` on `#1e2430`, 12px: about 4.5:1 | Borderline pass; 12px is too small for the one line that tells you what the app is doing. |
| Text size setting | `textSize` normal/large/xlarge = body zoom 1 / 1.2 / 1.4 (`App.tsx`) | Max is 140%, i.e. 19.6px body. WCAG 1.4.4 asks for 200% without loss. OS text scaling is not consulted. |
| Target sizes | `.tiny` ≈ 19px tall (11px font, 2px vertical padding); `.ghost` ≈ 29px; inputs/selects ≈ 34px; sidebar tabs ≈ 36px; `.big-btn` ≈ 53px; skill checkboxes 22px | `.tiny` **fails WCAG 2.5.8 (24×24 min)**; it is used for "Disconnect & forget password", People's Important/Not important, Review's filter chips, step jumps in Connect helper. |
| Keyboard focus | `input:focus, select:focus { outline: 2px solid var(--blue-soft) }` — `#e8eef8` on white | Effectively invisible. **Fails 2.4.7 Focus Visible / 1.4.11 Non-text Contrast.** Buttons fall back to the browser default ring (acceptable). |
| Keyboard shortcuts | None. `onKeyDown` only handles Enter in two inputs. No ARIA attributes anywhere; tabs are plain `<button>`s without `aria-current`. | Executives and keyboard users have nothing; screen-reader users cannot tell which tab is active. |
| Motion | Only `scrollIntoView({behavior:'smooth'})` in the Assistant log. No `prefers-reduced-motion` handling. | Nearly motion-free — good. One easy fix. |
| Destructive actions | `Accounts.tsx` "Disconnect & forget password" removes instantly; `Today.tsx` "Done ✓" resolves instantly; `Assistant.tsx` "Forget" sign-in removes instantly. No `confirm()` and no undo anywhere except People's "· undo". | No safety net for slips. |
| Explanations | `BriefIssue` carries `whyNow` and `sources` (`types.ts`) but `Today.tsx` renders only `title` and `nextStep`. | "Why am I seeing this" is already computed and simply not shown. |
| Settings model | Preferences has a **Save settings** button, but profile choice, agent bridge, and skill checkboxes apply immediately. VIP/muted lists need "Save people lists". | Mixed model — exactly what the toggle research warns against. |
| Settings help | Each field has a label; some options carry "(recommended)". No per-setting default shown, no reset, no search, no "changed" marker. Advanced card mixes model override with OAuth client IDs. | Partly meets "clear info on what each setting does"; the missing half is defaults, reset, and findability. |
| Run feedback | Sidebar shows phase text ("Classifying 42 new messages…"); no bar, no step count, no time estimate. Pipeline emits 5 phases (`fetch → classify → track → brief → save`). | Runs can exceed 10 s; NN/G says show percent-done at that point. |
| Assistant autonomy | `DEFAULT_SETTINGS.assistantAutonomy = 'full'` (`types.ts`); Assistant screen labels Full "(recommended)". Stop is a `.ghost` button; Start is `.big-btn`. | Wrong default for a grandparent; wrong visual weight for the emergency exit. |
| Onboarding | 3 steps; step 2 asks for a "16-character app password" for Gmail/Yahoo/iCloud; OAuth sign-in (Google/Microsoft) exists in Accounts but not in the wizard; step 3 references "Setup → AI helper" and "Assistant" by name. | The hardest step is first-contact, and the wizard makes people memorise where to go later. |
| Layout stability | Today uses `grid-template-columns: repeat(auto-fit, minmax(300px,1fr))`; cards reflow as the window or zoom changes. Section order is fixed in JSX (good). | Reflow breaks spatial memory; zoom changes column count. |
| Voice | `readAloud` speaks the whole `briefToSpeech` script at rate 0.95; no speed control, no "just the top 3", no visual follow-along. `speakBriefs` speaks a short summary after scheduled runs. | Good foundation; missing the controls older adults ask for. |
| Trust signals present | "Last checked {time}", "Read-only, always", per-inbox chips, "Draft reply opens your own mail app — you review and send". | Good. Missing: message counts, which engine read the mail, sources per item. |

---

## Part 1 — Older adults and children

Design for both groups at once by designing for the weaker case on each dimension: the grandparent has the harder time with small type, precision pointing and jargon; the child has the harder time with reading, memory and abstract instructions. Microsoft's inclusive-design principle, "solve for one, extend to many", is the reason this pays off for everyone — a large target helps a shaky hand, a gloved hand, and a hurried CEO ([Microsoft Inclusive Design](https://inclusive.microsoft.design/)).

### 1.1 Reading level

**Rule.** Write UI text at grade 6–8. Sentences of 15–20 words or fewer. One idea per sentence. Define any technical word the first time it appears, in place, not in a glossary.

**Evidence.** NN/G recommends an 8th-grade reading level for broad consumer audiences and shows that plain language helps experts too — lower reading levels are processed faster by everyone ([Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/); [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/)). NN/G's senior studies (123 participants aged 65+ across three rounds) list undefined "techy words" as a top failure and recommend defining them inline ([Define Techy Terms for Older Users](https://www.nngroup.com/articles/define-techy-words-old-users/); [Usability for Older Adults](https://www.nngroup.com/articles/usability-for-senior-citizens/)). For children 6–8, NN/G finds reading is still effortful and instructions must be concrete, short, and leverage what the child already knows ([Designing for Kids: Cognitive Considerations](https://www.nngroup.com/articles/kids-cognition/)).

**InboxScout.**
- **Onboarding step 2**: "App password" and "IMAP server" are undefined jargon at the exact moment a newcomer is most anxious. Define inline: *"An app password is a special password your email provider makes just for apps like this one. It is not your normal password. We'll open the page where you get it."* Better still, remove the word from the first path (see 1.7).
- **Setup hub**: "AI helper", "Assistant", and "Connect helper" are three cards with overlapping meanings. A grandparent cannot tell which one to press. Rename by outcome: *"Connect my email"*, *"What to watch for"*, *"Make it smarter (optional)"*, *"Let it do web chores for me"*, *"Preferences"*. Fold "Connect helper" into the Accounts flow where it is needed.
- **Settings**: labels like "Keep full email text on this computer" are good. "AI model override (blank = recommended default)" and "Google OAuth client ID" belong behind an Advanced disclosure with a one-line plain definition each.
- **Today**: card titles ("Needs you", "Waiting for your reply", "Promises you made") are already grade-school plain. Keep that voice in every new section. Run copy through a readability check (Hemingway or `textstat`) in CI: fail the build above grade 8 for any string in `views/` that a Simple-mode user can see.
- **Assistant**: the autonomy options are 20–30-word sentences packed into `<option>` elements. Break into a radio group with a 4-word title and a one-line body each.

### 1.2 Type size and contrast

**Rule.** Body text 16px minimum (18px in Simple mode); nothing interactive below 14px; secondary text no smaller than 13px and never below 4.5:1 contrast; line height 1.5; support 200% text scaling without clipping or horizontal scrolling; respect the OS text-size setting.

**Evidence.** WCAG 2.2 [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) requires 4.5:1 for normal text; [1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) requires 200% without loss; [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) requires 3:1 for control boundaries and focus rings; [1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) requires the layout to survive 1.5 line height. NN/G reports readability as the persistent number-one problem for seniors across two decades of studies ([UX Design for Seniors report](https://www.nngroup.com/reports/senior-citizens-on-the-web/)). For short text read at a glance, bigger wins outright; regular width beats condensed ([Typography for Glanceable Reading](https://www.nngroup.com/articles/glanceable-fonts/)). Apple's HIG sets the iOS body style at 17pt and asks apps to scale with Dynamic Type ([Apple HIG Typography](https://developer.apple.com/design/human-interface-guidelines/typography)); Microsoft asks apps to test at 200% text scaling ([Accessible text requirements](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessible-text-requirements)).

**InboxScout.**
- `styles.css`: raise `body` to 15px (Standard) and let Simple mode start at 17px; raise `.hint` to 13px and change `--ink-faint` to about `#5f6875` (≈5.6:1 on white). Retire `.tiny` (11px) — see 1.3. Raise `th` from 11px to 12px and drop the uppercase tracking or accept it only for the 3-word column headers in advanced tables.
- `App.tsx` zoom table: add `huge: '2'` and make the choice a segmented control with live preview text ("Aa Aa Aa"), not a `<select>`. Test Today, Settings and Onboarding at 2.0: the fixed 200px sidebar and `minmax(300px)` cards must collapse to one column, not overflow. Also read the OS preference at startup (Windows text scale, macOS Larger Text) and use it as the default rather than 'normal'.
- Focus ring: replace `outline: 2px solid var(--blue-soft)` with `outline: 3px solid var(--blue); outline-offset: 2px` on every focusable element (`:focus-visible`). This one line fixes 2.4.7 and 1.4.11 for the whole app.
- **Today** hero headline (17px) and card bullets (15px) are the right scale for Simple mode; hints under them (13.5px `.next`) are fine at 15px body. The `.hint` "Last checked …" line under the headline is the most important trust line on the screen and is currently the smallest text on it.
- **People**: the address line is `fontSize: 12.5` in `--ink-faint` — smallest and lowest-contrast text in the app, and the only place the actual email address is shown.

### 1.3 Target sizes and pointing

**Rule.** Every click target at least 24×24 CSS px (WCAG AA), aim for 44×44 (Apple, WCAG AAA) on anything a Simple-mode user touches. Space adjacent targets by at least 8px. Never require double-click, hover-only reveals, drag, or precise timing.

**Evidence.** WCAG 2.2 [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — 24×24 at AA; [2.5.5 (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) — 44×44 at AAA; Apple HIG asks for 44×44pt hit targets ([Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)). Older adults make more sub-movements, slower and longer cursor paths, and fail more on double-click and small targets ([Smith, Sharit & Czaja 1999, *Human Factors*](https://journals.sagepub.com/doi/10.1518/001872099779611102); [Hertzum & Hornbæk 2010](https://mortenhertzum.dk/publ/IJHCI2010b.pdf)). NN/G's senior studies repeatedly flag small buttons, dropdowns and links ([Usability for Older Adults](https://www.nngroup.com/articles/usability-for-senior-citizens/)); for children, NN/G recommends large targets and no reliance on hover ([Design for Kids Based on Their Stage of Physical Development](https://www.nngroup.com/articles/children-ux-physical-development/)).

**InboxScout.**
- Delete `.tiny` from `styles.css`. Every place it is used becomes a `.ghost` at `min-height: 36px; padding: 8px 14px` (Simple) — the "Disconnect & forget password" button in Accounts, "Always important / Not important" in People, filter chips in Review, "Open again / Go to this step" in Connect helper, "Show / New token" in the bridge card.
- `.today-card li` row actions ("Done ✓", "Draft reply", "Follow up") are `.ghost` at ~29px. Set `min-height: 40px` and give the whole list row a 12px vertical padding so neighbouring actions are separated.
- Sidebar tabs: 36px tall is fine; make the whole row the hit area (it already is) and add `min-height: 44px` in Simple mode.
- Skill checkboxes are 22px; keep them but make the entire `.skill-row` the click target (it already is a `<label>` — good) and add `min-height: 48px`.
- Nothing in the app requires hover to reveal a control — keep it that way. Do not add hover-only "…" menus to Today cards.

### 1.4 Motion

**Rule.** No motion that is not feedback for the user's own action; keep transitions ≤ 200 ms; nothing auto-plays or auto-scrolls; honour `prefers-reduced-motion`.

**Evidence.** WCAG 2.2 [2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) (AAA, but cheap): motion triggered by interaction can be disabled unless essential; the recommended technique is the [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) media query, which Chromium (and so Electron) maps directly from the OS "reduce motion / show animations" setting. NN/G on attention-grabbing motion: auto-playing motion is more often problematic than impressive ([Five Mistakes in Designing Mobile Push Notifications](https://www.nngroup.com/articles/push-notification/); [The Attention Economy](https://www.nngroup.com/articles/attention-economy/)).

**InboxScout.**
- Add once to `styles.css`: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }`.
- **Assistant** log: `scrollIntoView({ behavior: 'smooth' })` becomes `'auto'` under reduced motion, and should not auto-scroll at all if the person has scrolled up to read (track a "pinned to bottom" flag).
- Any future "Checking…" spinner: use a determinate bar (1.5 below), not a looping animation, when the phase count is known. A calm pulse on the sidebar status is acceptable at 1 Hz or slower.
- Do not animate card entry on Today. A brief that "flies in" is the opposite of calm.

### 1.5 Error tolerance and feedback timing

**Rule.** Accept input in any reasonable form; say what went wrong in plain words, what to do next, and never blame the person; show progress for anything over 1 s and percent/steps for anything over 10 s; never time out a person.

**Evidence.** NN/G error-message guidelines: polite, precise, constructive; plain language; placed where the problem is; educate rather than scold ([Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/); [Hostile Patterns in Error Messages](https://www.nngroup.com/articles/hostile-error-messages/); [10 Design Guidelines for Reporting Errors in Forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)). Seniors: "interfaces … inflexible and unforgiving of errors, accepting input in only one form" ([Usability for Older Adults](https://www.nngroup.com/articles/usability-for-senior-citizens/)). Response times: 0.1 s feels instant, 1 s keeps flow, 10 s is the attention limit; use percent-done indicators beyond 10 s ([Response Times: 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/); [Progress Indicators](https://www.nngroup.com/articles/progress-indicators/)). WCAG 2.2 [3.3.7 Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html): don't make people re-type what they already gave you; [3.3.8 Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html): allow paste and password managers in credential fields.

**InboxScout.**
- **Onboarding / Accounts**: trim and normalise input — strip spaces from pasted app passwords (Google shows them as `abcd efgh ijkl mnop`; a pasted value with spaces fails today), lowercase and trim the email, tolerate "gmail.com" typed into the provider field. Never clear the password field on failure.
- Error copy today is the raw provider message with "Error invoking remote method" stripped. Map the common IMAP failures to three sentences: *what happened* → *most likely reason* → *the button that fixes it*. Example for auth failure: *"Gmail didn't accept that password. This usually means it was your normal password instead of an app password. → Open the page to make an app password"*.
- **Run progress**: the pipeline already emits phases. Show a 5-segment bar under the sidebar button ("Step 2 of 5 · Sorting 42 new messages") and, after the first run, a time estimate from the last run's duration. On Today, replace the disabled "Checking…" button with the same bar so the primary action doesn't just go grey.
- **Assistant**: the log is the feedback channel; add a heartbeat line every 15 s of silence ("Still working — reading the page…") so a slow AI call is not mistaken for a hang.
- Never disable the Connect button with no explanation. If email or password is blank, say so under the field on blur.

### 1.6 Memory load

**Rule.** Never require remembering something from one screen to use another. Working memory holds about 4 chunks, fewer for older adults; recognition beats recall. Show the current state (what is connected, what is chosen, what will happen next) on the screen where the decision is made.

**Evidence.** Cowan's working-memory limit of about 4±1 chunks ([The Magical Mystery Four](https://journals.sagepub.com/doi/abs/10.1177/0963721409359277)); older adults recall fewer chunks ([Gilchrist, Cowan & Naveh-Benjamin 2008, *Memory*](https://www.tandfonline.com/doi/abs/10.1080/09658210802261124)). Nielsen's heuristic #6, recognition rather than recall ([10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)). For children, NN/G: don't rely on multi-tier navigation; kids focus on one thing at a time ([Designing for Kids: Cognitive Considerations](https://www.nngroup.com/articles/kids-cognition/)).

**InboxScout.**
- **Onboarding step 3** tells the person to "visit Setup → AI helper anytime" and mentions "the Assistant". That is two locations and two names to remember. Instead put a persistent, dismissible card at the bottom of Today: *"Want smarter briefs? Connect a free AI (2 minutes)"* → one click lands on the right screen.
- **Setup hub** cards should show current state on the card: "Email accounts — 2 connected (mom@…, work@…)", "AI helper — Built-in engine (free)", "What to watch for — 6 on". Today's cards describe features, not state, so a person must open each to know where things stand.
- **Today** empty state already tells you exactly what to do next ("Connect an email account in Setup, then check…"). Make the sentence itself the button.
- **Settings**: show the effective value next to abstract ones — "Schedule: Every day at 7:30 (next: tomorrow 7:30)"; "Reports folder: Documents/InboxScout" with an *Open folder* button.
- **Assistant**: when it asks a question, repeat what it is doing above the question ("While creating your Gmail app password, it asks: …") so the person doesn't need to remember the job.

### 1.7 One-primary-action screens

**Rule.** Each screen has one obvious next thing. Secondary actions look secondary. Multi-step tasks get one question per page.

**Evidence.** GOV.UK's "one thing per page" pattern, validated on Register to Vote and Verify: easier for low-confidence users, better error handling, easier branching ([GOV.UK Question pages](https://design-system.service.gov.uk/patterns/question-pages/); [One thing per page](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/)). NN/G on visual hierarchy: a clear starting point and one emphasised task ([Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/); [Homepage Design Principles](https://www.nngroup.com/articles/homepage-design-principles/)). NN/G on onboarding: skip it when possible; tutorials don't improve task performance ([Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/); [Mobile Tutorials: Wasted Effort?](https://www.nngroup.com/articles/mobile-tutorials/)).

**InboxScout.**
- **Today** already has the right shape: one `.big-btn`. But three ghost buttons (Read it to me, Add dates to calendar, Export CSV) sit right beside it. In Simple mode show only *Read it to me*; move exports into a "More" disclosure or into My briefs.
- **Onboarding step 2** should offer one big button per provider — *Sign in with Google*, *Sign in with Microsoft* — and put "I have an app password" as a text link. OAuth already exists in `Accounts.tsx` (`signInGoogle`, `signInOutlook`) but the wizard never offers it. When the Google client isn't configured, offer *Let the assistant get an app password for me* first, and the manual field last. Split step 2 into two pages: "Where is your email?" then "Sign in".
- **Onboarding step 1** (profile picker with 50+ cards and a search box) is a heavy first screen. Keep the single "Let InboxScout figure it out (recommended)" card and collapse the rest under "Choose myself". It is already the default; make it the only thing on the page.
- **Setup hub**: six equal cards, no hierarchy. Order by likelihood and show the "not done yet" one first with a coloured left edge: Email accounts (if none connected) → What to watch for → Preferences → the rest under "More".
- **Assistant**: Start is big; Stop is small. When running, *Stop* must be the big red button — it is the emergency exit (heuristic #3, [User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/)).

### 1.8 Voice

**Rule.** Offer read-aloud with a visible, coarse speed control, a "just the important part" mode, pause/stop, and follow-along highlighting. Default speed slower than average conversation for older listeners.

**Evidence.** Older adults prefer slower feedback speech from voice interfaces than they use themselves, and most products ignore this ([Talk like me: speech-rate regulation for elderly VUI users, 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10132265/)). Voice removes the motor barrier of keyboard/mouse input for older adults and people with disabilities ([Accessible Voice Interfaces, CSCW 2018](https://dl.acm.org/doi/10.1145/3272973.3273006)). Average spoken English is about 140–160 wpm; a two-minute listen is roughly 300 words.

**InboxScout.**
- **Today** "Read it to me": add *Slower / Normal* (rate 0.8 / 0.95) as a two-way toggle next to the button, persisted in settings. Add *Read just the top 3* (use `briefToSpeech(brief, { short: true })`, already implemented). Highlight the card being read (`onboundary` event → set an `aria-current` on the card).
- Speak the section name before its items ("Needs you. Two things.") — `briefToSpeech` does this for issues; extend to every section.
- `speakBriefs` (Settings → Comfort) should say how long it will talk: "Reads a 30-second summary out loud when a scheduled brief is ready."
- Reading order should match visual order on Today so the person can follow with their eyes.
- Voice *input* is not a priority: the app's core loop needs no typing. Do not add a voice command surface until the read-aloud path is polished.

### 1.9 Confirmation wording and undo

**Rule.** Prefer undo over confirmation. When you must confirm, name the object and the consequence in the question, and label buttons with the verb, never "OK/Cancel" or "Yes/No". Reserve friction (typing a word) for irreversible, high-cost actions.

**Evidence.** NN/G: generic "Are you sure?" becomes automatic and protects no one; name the action on the button; consider no default; and "go to great lengths to provide undo" because some errors survive every dialog ([Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/); [Preventing User Errors: Avoiding Conscious Mistakes](https://www.nngroup.com/articles/user-mistakes/)). Gmail's Undo Send is the reference pattern: act immediately, offer undo for a window.

**InboxScout.** Copy bank, ready to use:

| Action (today) | Recommended pattern | Copy |
|---|---|---|
| Accounts → "Disconnect & forget password" (instant) | Confirm, because re-connecting costs the person a password hunt | *Disconnect mom@gmail.com?* InboxScout will forget its password. Your email itself is not touched. **[Disconnect]** [Keep it connected] |
| Today → "Done ✓" (instant) | Undo toast, 8 s | *Marked "Renew car insurance" as done.* **[Undo]** |
| People → Not important / Always important | Already has inline "· undo" — keep, but make the toast pattern consistent with Today | *Mail from Dr. Patel will always be important.* **[Undo]** |
| Assistant → "Forget" sign-in | Confirm (the password is gone) | *Forget the saved sign-in for you@site.com?* The assistant will ask you to sign in yourself next time. **[Forget it]** [Keep] |
| Bridge → "New token" | Confirm with consequence | *Make a new token?* Anything using the old one (Hermes, scripts) will stop until you paste the new one. **[Make new token]** [Keep current] |
| Settings → Show advanced tools: Yes | No confirm; notify with reverse path | *Two more tabs added: Details, Inbox review.* **[Put them away]** |
| Profile auto-switch | Notify + undo on Today (see 3.5) | *Your brief now uses the "Landlord" profile because your mail mentions leases and tenants.* **[Switch back]** [Lock a choice] |

Never use "Are you sure?" alone; never "OK".

### 1.10 Children specifically

A child will not be InboxScout's owner, but "a child could use it" is a useful bar: it forces concrete words, one action per screen, and no reliance on prior software knowledge.

**Evidence.** NN/G children's research (156 guidelines): distinguish 3–5, 6–8, 9–12; use clear specific instructions; don't assume web conventions; use the child's mental models; feedback must be immediate and obvious ([UX Design for Children report](https://www.nngroup.com/reports/children-on-the-web/); [Children's UX: Usability Issues](https://www.nngroup.com/articles/childrens-websites-usability-issues/)).

**InboxScout.** The test is: could a 9-year-old, handed the app for a parent, press "Check my email now", understand "Needs you" and "Read it to me", and get out of any screen with one visible button? Today's blockers are the Setup hub naming (1.1), the invisible focus/target sizes (1.2–1.3), and the lack of a *Back to Today* affordance from deep Setup sub-screens (the "← Back to Setup" link exists, but it is 14px text, not a button, and only goes one level).

---

## Part 2 — Executives and business owners

The executive wants the same app, not a different one. What changes is density, speed and delegation. NN/G's complex-application research says to serve three user types — the occasional user, the day-to-day user, and the "legend" expert — from one interface by layering accelerators the novice can ignore ([Supporting "Power Users" Isn't Enough](https://www.nngroup.com/articles/complex-apps-users/); [8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)).

### 2.1 Glanceability

**Rule.** The first screen answers "is anything on fire, and what do I do about it" in under five seconds, from the top-left, using size and position (pre-attentive features), not colour alone or reading.

**Evidence.** NN/G on dashboards: at-a-glance information the person can act on with minimal interaction, built on pre-attentive features (length, 2-D position) rather than charts that must be decoded ([Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/)); for glanceable text, bigger and regular-width beats smaller and condensed ([Typography for Glanceable Reading](https://www.nngroup.com/articles/glanceable-fonts/)). Endsley's situation-awareness model — perceive → comprehend → project — is the standard framing for command dashboards: the screen must support all three, not just show data ([Endsley, *Designing for Situation Awareness*](https://www.amazon.com/Designing-Situation-Awareness-Approach-User-Centered/dp/1420063553)).

**InboxScout.**
- **Today** hero: the headline is already a one-sentence comprehension layer. Add a three-number strip under it in 22px numerals: **3 need you · 2 owe replies · 1 promise overdue**, each a link that scrolls to the card. That is the perceive layer.
- The "projection" layer is *This week* — move it to the second position (after Needs you) for business profiles; today it sits fourth.
- Cap the grid to two columns (see 3.3) so the top-left card is always *Needs you* and the top-right is always the next most urgent. With `auto-fit` at wide widths, three or four columns spread the urgent items across the screen.
- Severity is in the data (`BriefIssue.severity`) but not shown. Show it as position (urgent first) plus a short left border in red for `urgent`/`high` only. Do not add a rainbow of pills — the `.pill` classes from Details are fine there, not on Today.

### 2.2 Decision-first briefs (BLUF / inverted pyramid)

**Rule.** Every item leads with the decision or action, then the reason, then the evidence. The brief as a whole leads with the one sentence the reader would act on if they read nothing else.

**Evidence.** NN/G: inverted pyramid — front-load the conclusion; readers stop early ([Inverted Pyramid: Writing for Comprehension](https://www.nngroup.com/articles/inverted-pyramid/)). Military BLUF and Amazon's narrative memo both open with the recommendation and position data as support ([BLUF](https://en.wikipedia.org/wiki/BLUF_(communication)); [Amazon 6-pager](https://slab.com/blog/jeff-bezos-writing-management-strategy/)). NN/G on confirmations and AI: make clear what the system did and why ([Explainable AI in Chat Interfaces](https://www.nngroup.com/articles/explainable-ai/)).

**InboxScout.** Each *Needs you* item should read as four lines, in this order, with the first two always visible and the last two behind a `▸` disclosure:

1. **Do:** `nextStep` (verb first — "Reply to Sam about the invoice")
2. **Because:** `whyNow` ("due Friday; he has asked twice")
3. **From:** `sources` ("2 emails · Sam Reyes · last Tue")
4. **Actions:** Draft reply · Done · Snooze until…

`whyNow` and `sources` are already in `BriefIssue`; `Today.tsx` just never renders them. The same shape applies to *Promises you made* (Do: follow up · Because: you said "by Friday" · From: your email on Sep 2).

The emailed/SMS brief (`deliverEmailTo`, `smsPhone`) should be the same first two lines per item, top three items only, so the executive can act from a phone lock screen.

### 2.3 Delegation

**Rule.** Any item the reader would hand to someone else should be hand-off-able in one click, with the context attached, without leaving the screen.

**Evidence.** NN/G "accelerators": frequent multi-step tasks become one action for experts; contextual menus keep the action where the object is ([Accelerators Maximize Efficiency](https://www.nngroup.com/articles/ui-accelerators/); [Designing Effective Contextual Menus](https://www.nngroup.com/articles/contextual-menus-guidelines/)). Nielsen's heuristic #7, flexibility and efficiency ([Flexibility and Efficiency of Use](https://www.nngroup.com/articles/flexibility-efficiency-heuristic/)).

**InboxScout.** Add a per-item *Send to…* action on Today (Standard/Pro levels): opens the person's mail app with a forward-style draft ("Can you handle this? — [item title], [whyNow], [source subject]") via the existing `replyMailto` helper, or *Copy as text*, or *Send to my agent* when `agentWebhookUrl` / bridge is on. The app never sends mail itself, so this keeps the read-only promise. Also add *Snooze until [date]* so the item leaves *Needs you* without being lied to as "done".

### 2.4 Time-boxed summaries

**Rule.** Tell the reader how long this will take, and make a two-minute version available at all times.

**Evidence.** Adults read silently at roughly 238 wpm for non-fiction ([Brysbaert 2019, *J. Memory & Language*](https://doi.org/10.1016/j.jml.2019.104047)), so a 2-minute brief is ≈ 450 words on screen, ≈ 300 spoken. Nielsen's 10-second attention limit applies to the *decision* whether to keep reading ([Response Times](https://www.nngroup.com/articles/response-times-3-important-limits/)). Calm-technology principle: convey information with the least attention, and let it move between periphery and centre ([Calm Tech principles](https://www.calmtech.institute/calm-tech-principles)).

**InboxScout.**
- Add "**2-minute read**" (computed from word count / 230) next to the "Last checked" line on Today, and a *Short brief* toggle (top 3 in each card, hide *Done recently*, *Personal*, *How things are going* unless something changed). Persist the choice; it is the executive's natural default.
- Weekly brief in My briefs: lead with *What changed since last week* (the `resolvedRecently` and pulse `whatChanged` fields), capped at five lines.
- SMS headline is already the right idea; keep it under 160 characters.

### 2.5 Trust signals

**Rule.** Show freshness, coverage, provenance and the system's own confidence. Disclose what is automated, but disclose it as capability ("read by the built-in engine") rather than as a warning label.

**Evidence.** NN/G's four trustworthiness factors: design quality, up-front disclosure, comprehensive and current content, connection to the rest of the web ([Trustworthiness in Web Design: 4 Credibility Factors](https://www.nngroup.com/articles/trustworthy-design/)). Microsoft's Human-AI guidelines G1/G2: make clear what the system can do and how well ([Amershi et al., CHI 2019](https://dl.acm.org/doi/10.1145/3290605.3300233); [HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)). Google PAIR: explain data sources and confidence in plain terms; give control when the AI is uncertain ([PAIR: Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/)). Caution: blanket "AI-generated" labels measurably reduce trust in otherwise accurate content ([AI labeling reduces perceived accuracy, 2025](https://arxiv.org/abs/2506.16202); [AI disclosures and trust in ads, 2025](https://www.tandfonline.com/doi/full/10.1080/15252019.2025.2554149)) — so disclose *specifically* ("sorted by Gemini Flash · 41 of 42 messages classified"), not generically.

**InboxScout.**
- Turn the "Last checked" hint into a **trust strip** on Today: *Checked 7:31 today · 2 inboxes · 42 new messages · sorted by built-in engine · read-only*. Each token links: inboxes → Accounts; engine → AI helper; read-only → a one-paragraph explainer.
- Per item, show sources (2.2). The `Classification.corrected` flag exists — surface "you corrected this" when a category was fixed in Inbox review, so the executive sees the system learning (Amershi G13).
- When the built-in engine is in use, say what that means for quality once, in Settings and on the AI helper screen: "Good at bills, dates and replies; weaker at judging tone. Connect a free AI to improve."
- Never show a confidence percentage to Simple-mode users. Show it to Pro users as a word: *likely / unsure*.

### 2.6 Keyboard and speed

**Rule.** Every action reachable by keyboard; single-key accelerators for the top ten actions; a command palette for everything else; shortcuts shown in tooltips and menus so they are learned by exposure.

**Evidence.** NN/G on keyboard-only navigation and accelerators; shortcuts are learned through repeated exposure in menus and tooltips; expert-only features should be invisible to novices ([Keyboard-Only Navigation](https://www.nngroup.com/articles/keyboard-accessibility/); [UI Copy: Command Names and Keyboard Shortcuts](https://www.nngroup.com/articles/ui-copy/); [Accelerators](https://www.nngroup.com/articles/ui-accelerators/)). Microsoft: every interaction available from the keyboard with a visible focus indicator ([Keyboard accessibility](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility)).

**InboxScout.** Proposed map (Standard and Pro levels; also works in Simple but is not advertised there):

| Key | Action |
|---|---|
| `R` | Check my email now |
| `1`–`4` (`5`–`6` when advanced tabs on) | Switch tab |
| `J` / `K` | Next / previous item on Today |
| `D` | Mark focused item done (undo toast) |
| `Enter` | Primary action of focused item (Draft reply / Follow up) |
| `S` | Snooze focused item |
| `L` | Read it to me / stop |
| `/` | Focus search (People, Inbox review) |
| `Ctrl/Cmd+K` | Command palette: every action and every setting by name |
| `?` | Shortcut sheet |
| `Esc` | Back / close / stop reading |

Also: `aria-current="page"` on the active sidebar tab, `role="tablist"`, and a skip link to the main content. These are a day's work and unlock screen readers as a side effect.

### 2.7 Multi-account and multi-context

**Rule.** Make it obvious which accounts are in play, let the person filter by one in a single click, and never mix a personal and a work item without a visible marker.

**Evidence.** Account-switcher pattern reviews converge on: show which is active, show which are connected, one-click switch, always visible ([UX Power Tools: account switchers](https://medium.com/ux-power-tools/ways-to-design-account-switchers-app-switchers-743e05372ede)). NN/G on tabs/filters: keep filter state visible and internally consistent ([Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/)).

**InboxScout.**
- **Today** already shows per-inbox chips (`brief.inboxes`) but they are inert. Make them filter chips: click *💼 Work* → every card filters to that inbox (`accountId` is on schedule events and can be added to issues); the active chip stays highlighted; "All inboxes" resets.
- Mark each item with a subtle 🏠/💼 glyph when more than one inbox is connected — the roles are already inferred (`InboxSummary.role`).
- **Accounts**: show role next to each account ("work · Gmail · 41 msgs/day") with a way to override the inferred role — the only account-level setting an executive will actually want.
- **Settings → Send me my brief**: allow a different delivery target per role (personal brief to phone, work brief to work email). Keep it behind Pro.

### 2.8 Density as a level, not a mode

Executives want more on screen; grandparents want less. Treat density as one more dimension of the level system in Part 4 rather than a separate toggle: Simple = 17px, one column, top 3 per card; Standard = 15px, two columns, top 6; Pro = 14px, two columns, everything, tables allowed. Never change the *order* or *names* of things between levels (3.3).

---

## Part 3 — Adaptive and evolving interfaces

The owner wants "a user-based evolving UI with overrides in settings". The research is clear on how to do that without confusing people: **suggest, don't switch; keep anchors fixed; explain every automatic choice; make every automatic choice reversible.**

### 3.1 Progressive disclosure

**Rule.** Show the few most important options first; put the rest one click away, labelled by what they contain. Disclose in at most two stages.

**Evidence.** Nielsen's original progressive-disclosure article: defers advanced or rarely used features to a secondary screen; improves learnability and reduces errors; works only if the first-level selection is right (the "frequency" test) and the disclosure control is clearly labelled ([Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).

**InboxScout.**
- Already applied: Simple Mode hides Details and Inbox review; the Setup hub hides sub-screens; Weekly options appear only when frequency is weekly. Good.
- Apply it to **Settings**: the Advanced card (model override, OAuth IDs, Ollama URL) and the Agent bridge card should be collapsed by default with a labelled disclosure: *"Advanced — for developers and agents (5 settings)"*. The Comfort card stays open.
- Apply it to **Today** items (2.2): first two lines visible, *because/from/actions* behind `▸`.
- Apply it to **Assistant**: saved sign-ins and autonomy are shown before the person has picked a job. Show the job cards first; show autonomy and sign-ins as a second stage on the job's card, defaulted.
- Apply it to **ProfilePicker**: one recommended card, then "Choose myself" reveals the groups.

### 3.2 Adaptive vs adaptable: when adaptation helps and when it confuses

**Rule.** Let the *system* recommend and the *person* decide. Automatic adaptation is worth it only when (a) the prediction is highly accurate, (b) the change is infrequent and gradual, (c) the person can see what changed and undo it, and (d) screen space is genuinely scarce. Otherwise, adaptable (user-controlled) wins on satisfaction and static wins on speed.

**Evidence.**
- Findlater & McGrenere, CHI 2004: static menus were faster than adaptive; adaptable was faster than adaptive under some conditions; most participants *preferred adaptable* — control beats cleverness ([A comparison of static, adaptive, and adaptable menus](https://dl.acm.org/doi/10.1145/985692.985704)).
- Gajos et al., CHI 2008: accuracy of the adaptation matters more than predictability for performance and use; low-accuracy adaptation is worse than none ([Predictability and accuracy in adaptive user interfaces](https://dx.doi.org/10.1145/1357054.1357252)); design-space analysis in [Gajos et al. 2006](http://aiweb.cs.washington.edu/ai/puirg/papers/kgajos-avi06.pdf).
- Findlater & McGrenere, CHI 2008: adaptation helps most when space is constrained (small screens); on large screens the benefit shrinks ([Impact of screen size on adaptive GUIs](https://www.cs.ubc.ca/~joanna/papers/CHI2008_Findlater.pdf)).
- Findlater et al., CHI 2009: *ephemeral adaptation* — predicted items appear at once, the rest fade in — is faster than static when accurate and not slower when wrong, because it never moves anything ([Ephemeral adaptation](https://dl.acm.org/doi/10.1145/1518701.1518956)).
- Lavie & Meyer 2010: slow-paced adaptation helps; fast-paced adaptation hurts ([Benefits and costs of adaptive user interfaces](https://www.sciencedirect.com/science/article/abs/pii/S1071581910000145)).
- Microsoft G14 "update and adapt cautiously", G18 "notify users about changes" ([Amershi et al. 2019](https://dl.acm.org/doi/10.1145/3290605.3300233)).
- NN/G: customization (user-driven) and personalization (system-driven) both work only when the person can see and override them ([Customization vs. Personalization](https://www.nngroup.com/articles/customization-personalization/); [6 Tips for Successful Personalization](https://www.nngroup.com/articles/personalization/)).

**InboxScout.** The model that follows from this:

| The system may… | The system may not… |
|---|---|
| Choose which *content* sections appear in a brief (they already appear "only when there is something to say") | Add, remove or reorder *navigation* (sidebar tabs, Setup hub cards) on its own |
| Suggest a level change once, with a reason, after evidence (3.6) | Switch levels, density or text size without a click |
| Auto-detect the profile and say so (existing `profileAuto`) | Change the profile silently between two runs — it must announce and offer undo |
| Emphasise a section that is new or urgent (ephemeral emphasis: a "New" tag, a stronger border) | Move a section to a different position because it is urgent |
| Pre-fill and default | Re-default a setting the person has explicitly set |

Concretely: keep `profileAuto` (it is the one adaptation with high accuracy and real value), gate it with a notice (3.5), and build everything else as *suggestions* with a `Dismiss` and a `Don't suggest this again`.

### 3.3 Stable anchors

**Rule.** Fixed positions for navigation, the primary action, and section order. New things are appended and labelled; nothing moves.

**Evidence.** NN/G on spatial memory: clearly bounded control areas let people build spatial memory; reflowing layouts (masonry/auto-fit) destroy it; scale rather than reflow ([Spatial Memory: Why It Matters for UX Design](https://www.nngroup.com/articles/spatial-memory/)); heuristic #4 consistency ([Maintain Consistency and Adhere to Standards](https://www.nngroup.com/articles/consistency-and-standards/)).

**InboxScout.**
- **Today**: replace `repeat(auto-fit, minmax(300px, 1fr))` with a fixed two-column grid (one column under 760px or at ≥1.4 zoom) and assign each section a fixed slot: left column = Needs you, Waiting for your reply, Promises; right column = This week, Your circle, then skill sections. Empty sections collapse in place rather than letting others slide up — or render a one-line "Nothing waiting" so the slot stays.
- **Sidebar**: order is fixed; when advanced tabs are enabled they are *appended* — good. Keep the "Check my email" button at the bottom in all levels.
- **Setup hub**: fixed order regardless of state; the state indicator (1.6) changes, the position does not.
- Level changes (Part 4) change sizes and what is *inside* cards, never where the cards are.

### 3.4 Explainability of automatic choices

**Rule.** Every automatic decision that affects what the person sees must be able to answer "why?" in one plain sentence, and that sentence must be reachable from the thing it explains.

**Evidence.** Microsoft G11 "make clear why the system did what it did" ([Amershi et al. 2019](https://dl.acm.org/doi/10.1145/3290605.3300233)). Google PAIR: explanations should be specific and actionable, and paired with a way to correct ([Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/); [Feedback + Control](https://pair.withgoogle.com/chapter/feedback-controls/)). NN/G on recommendations: explain *why* an item is recommended, let people dismiss, and let them adjust the inputs ([UX Guidelines for Recommended Content](https://www.nngroup.com/articles/recommendation-guidelines/)). "Why" justifications raise perceived transparency and willingness to rely on the system ([IBM: justification styles in recommenders](https://research.ibm.com/publications/why-or-why-not-the-effect-of-justification-styles-on-chatbot-recommendations)).

**InboxScout.** The automatic choices, and their one-sentence "why":

| Automatic choice | Where it's visible today | "Why" sentence to add |
|---|---|---|
| Profile auto-detected | Settings only ("chosen automatically") | *"Landlord — because your mail mentions leases, tenants and repairs more than anything else."* Show on Today the first time it changes and in Settings always. `profileStatus().suggestion.why` already exists. |
| An item is in *Needs you* | Not shown | `whyNow` + `sources` (2.2) |
| A sender is *Inner circle* | People shows counts | *"Inner circle: writes every week, and you reply within a day."* (`PersonLine.note` already has this text) |
| Mail classified as noise / work / personal | Inbox review pills | Add a "why" tooltip: *"Noise — bulk newsletter (List-Unsubscribe header)"*, *"Work — from your work inbox and mentions an invoice"*. The classifier's `topics` and `providerHints` give the words. |
| A section is hidden | Nothing | Footer line on Today in Standard/Pro: *"Hidden because empty: Personal, Done recently."* |
| Inbox role inferred (work/personal) | Chip icon | Tooltip: *"Looks like work: mostly weekday mail from company domains."* |
| Skill defaults from profile | Skills list | *"On because the Landlord profile turns it on"* next to each default-enabled skill |

### 3.5 "Why am I seeing this" and notify-on-change

**Rule.** When the interface changes because of something the system learned, say so where the change is visible, at the moment it is visible, with an undo.

**Evidence.** Microsoft G18 "notify users about changes"; G12 "remember recent interactions"; G16 "convey the consequences of user actions" ([HAX Toolkit guidelines](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)). NN/G on recommendations: label recommended content as such and let people dismiss it ([Recommended Content guidelines](https://www.nngroup.com/articles/recommendation-guidelines/)).

**InboxScout.** A single *Changes* card on Today, shown only when there is something to say, one line per change, each with undo:
- *"Profile switched to Landlord (was General). Why · Switch back · Lock a choice"*
- *"New section: Deliveries — turned on by the Landlord profile. Hide it"*
- *"Two tabs added: Details, Inbox review. Put them away"*
- *"Mom marked quiet: 3 weeks without mail (you usually hear weekly)."* (already in *Your circle* — good)

Cap at three lines; older ones live under *My briefs*.

### 3.6 Adaptation pacing and the level-suggestion rule

**Rule.** Suggest at most one interface change per week, only after repeated evidence, only in one fixed place, always dismissable for good.

**Evidence.** Lavie & Meyer 2010 (slow-paced adaptation helps, fast-paced hurts); Gajos 2008 (accuracy first); NN/G on personalization (needs enough data before acting; be transparent) ([6 Tips for Successful Personalization](https://www.nngroup.com/articles/personalization/)).

**InboxScout.** Triggers worth building (each fires once, at most one suggestion per 7 days, shown as the *Changes* card, never as a modal):

| Evidence | Suggestion | Undo |
|---|---|---|
| Opened Details or Inbox review ≥ 5 times in Simple mode (only possible via Settings today; count Settings visits to that toggle instead) | *"You keep checking the details. Want them as tabs?"* | The tab-removal line |
| Used keyboard `?` or a shortcut ≥ 3 times | *"Show shortcuts in menus?"* | Toggle in Comfort |
| Text size raised to xlarge and window maximised | *"Switch to Simple layout (one column, bigger buttons)?"* | Level control |
| Two inboxes with different roles, Standard level | *"Want a separate work brief at a different time?"* | Delivery settings |
| Ran "Check my email" manually at ~the same time 5 days running | *"Schedule it for 8:05 every day?"* | Schedule setting |

### 3.7 Undo everywhere

**Rule.** Every state change the person makes in one click can be reverted in one click within a visible window; every state change the *system* makes has a visible reverse path.

**Evidence.** Heuristic #3 ([User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/)); NN/G "go to great lengths to provide undo" ([Preventing User Errors](https://www.nngroup.com/articles/user-mistakes/)); Microsoft G8/G9 support efficient dismissal and correction.

**InboxScout.** One shared `<UndoToast>` component used by Today (Done), People (Important/Quiet), Accounts (Disconnect — after confirm), Settings (every change), Skills (toggle), and the *Changes* card. Toast text names the object; 8-second window; `Esc` dismisses. Back-end needs `unresolveIssue` (there is `resolveIssue` only) and a `removeAccount` that keeps the encrypted credential for the window.

### 3.8 Settings design: every setting explained, defaults chosen for you, searchable

**Rule.** A setting is a sentence, not a knob: what it does, what the default is and why, what it affects, and how to reset it. Controls that act immediately look different from ones that need saving — better, make everything immediate. Provide search over labels, help text and synonyms.

**Evidence.** NN/G on defaults: most people never change them, so the default *is* the design; choose the one that serves the most people and say so ([The Power of Defaults](https://www.nngroup.com/articles/the-power-of-defaults/)). NN/G toggle guidelines: switches must take effect immediately; if a Save button is needed, use checkboxes/radios instead; never mix the two on one form ([Toggle-Switch Guidelines](https://www.nngroup.com/articles/toggle-switch-guidelines/)). NN/G customization: place customization controls near what they affect, and name them clearly ([7 Tips for Successful Customization](https://www.nngroup.com/articles/customization/)). Tooltips for icon-only or short-label controls; contextual help beats up-front tutorials ([Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/); [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)). WCAG 2.2 [3.2.6 Consistent Help](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html): put the help entry point in the same place on every screen.

**InboxScout.** A `<Setting>` row component with five slots, and every entry in `AppSettings` mapped to one:

```
[Label]                                   [Control]
What it does, one sentence.               Default: X — why.   Changed ● Reset
Affects: Today · Briefs · Delivery
```

Rules for the screen:
1. **Remove "Save settings".** Apply on change (selects, toggles) or on blur (text fields), show "Saved ✓" as an undo toast. This also fixes the mixed model with the bridge card and profile picker.
2. **Search box at the top** ("Find a setting… e.g. text size, phone, Ollama") that filters rows across every card, matching label, help text and a synonym list (`phone` → SMS; `bigger` → text size; `voice` → speak briefs). `Ctrl/Cmd+K` from anywhere opens the same search.
3. **Groups by question, not by subsystem**: *How it looks* (text size, level, reduced motion) · *What's in my brief* (profile, skills, insights, VIPs, muted) · *When it runs* (schedule, launch at login) · *Where it goes* (email, text, Drive, speak) · *Privacy* (store bodies, reports folder, sensitive notices) · *Connections* (accounts, AI) · *For agents & developers* (bridge, webhook, model override, OAuth IDs, Ollama).
4. **Defaults shown for every row**, with the reason: "Default: Every day at 7:30 — before most people start work." "Default: Full email text kept — so search and re-analysis work; turn off to keep only previews."
5. **Reset**: per row (`↺` next to changed rows) and per group ("Reset this section").
6. **Changed marker** (●) on any non-default value, so the person can see what they customised months ago.
7. **Risky settings** get a consequence line, not a confirm: bridge access *Full* — "Other programs on this PC could check mail, connect accounts and run the Assistant as you."
8. **Help in one place**: a `?` in the top-right of every screen opens the same help panel (3.2.6).

Copy for the hardest existing rows:

| Setting | What it does | Default and why |
|---|---|---|
| `textSize` | Makes everything in InboxScout bigger or smaller. | Normal — or your computer's text-size setting if you changed it. |
| `simpleMode` (becomes *Level*, Part 4) | Simple shows just Today, My briefs, People, Setup. Standard adds Details and Inbox review. Pro adds shortcuts and developer tools. | Simple — you can always move up. |
| `profileAuto` | Lets InboxScout pick which kind of person your mail looks like, so it knows what counts as urgent. | On — it is usually right; lock a choice if it isn't. |
| `storeFullBodies` | Keeps the full text of your mail on this computer so you can search it and get better briefs. Nothing leaves this computer. | On — off keeps only short previews. |
| `insightsEnabled` | Adds *Your circle*, *This week*, *Promises you made* and per-inbox counts when there is something to say. | On — they only appear when useful. |
| `assistantAutonomy` | How much the Assistant does without asking you. | *Sign in for me, ask before paying or deleting* — see Part 5, item 4. |
| `bridgeAccess` | What other AI programs on this PC may do through InboxScout. | Read only — upgrade to Full only for an agent you trust. |
| `ai.model` | Overrides which model your AI provider uses. Leave blank unless you know a model name. | Blank — the provider's recommended model. |

### 3.9 Feedback and correction loops

**Rule.** Make correcting the system as easy as consuming it, and show that the correction took.

**Evidence.** Microsoft G9 (efficient correction), G13 (learn from behaviour), G15 (granular feedback); PAIR Feedback + Control; NN/G recommendation guidelines (dismiss and adjust).

**InboxScout.** Inbox review already has *Fix* buttons and says corrections teach it. Add a *Not important* / *Wrong section* action to every Today item (Standard/Pro), which writes the same correction and shows "Got it — fewer like this" in the toast. Corrections should show up in the *Changes* card the next day: *"You corrected 3 items yesterday; 2 similar messages were filed as noise."* This closes the loop the executive needs to keep trusting the system.

---

## Part 4 — One model for the "evolving UI"

Three **levels**, chosen by the person, suggested by the system, never switched by it.

| | Simple (default) | Standard | Pro |
|---|---|---|---|
| Who | Grandparent, child, anyone new | Most daily users | CEO, developer, agent operator |
| Tabs | Today · My briefs · People · Setup | + Details · Inbox review | same |
| Today | 17px, one column, top 3 per card, *Read it to me* only, big buttons | 15px, two fixed columns, top 6, per-item why/sources disclosure, Send to…, Snooze, inbox filter chips | 14px, everything, confidence words, tables, keyboard hints inline |
| Setup hub | 3 cards first, "More" disclosure | all 6 with state | all 6 + developer card |
| Settings | Search + groups; Advanced and Agents collapsed | same, Advanced open on demand | Advanced and Agents expanded |
| Shortcuts | work, not advertised | `?` sheet and tooltips | shown in menus, command palette |
| Confirmations | confirm + undo on destructive | undo toasts | undo toasts |
| Assistant | Careful by default; Stop is huge | Sign-in-for-me | Full available, consequence shown |

Invariants across levels (the anchors): sidebar order; primary button position; card names and card order on Today; the *Changes* card position; `Esc` always goes back; `?` always opens help; every automatic change is announced with an undo.

This replaces the boolean `simpleMode` with `level: 'simple' | 'standard' | 'pro'`; `simpleMode === true` maps to `simple`, `false` to `standard`. The system may propose a level once per week via the *Changes* card (3.6).

---

## Part 5 — Top 20 changes, ranked by impact ÷ effort

Effort: XS = under half a day, S = a day, M = 2–4 days, L = a week or more. Impact considers all three audiences.

| # | Change | Screens | Evidence | Impact | Effort |
|---|---|---|---|---|---|
| 1 | Fix contrast and minimum sizes: `.hint` → 13px and `--ink-faint` → `#5f6875`; `body` 14→15px; `th` 11→12px; `.status` 12→13px | All | WCAG 1.4.3; NN/G seniors | High | XS |
| 2 | Visible focus ring (`:focus-visible` 3px `--blue`, 2px offset) on every control; `aria-current` on the active tab; skip link | All | WCAG 2.4.7, 1.4.11; Microsoft keyboard guidance | High | XS |
| 3 | Retire `.tiny`; minimum 36px tall controls in Simple, 32px elsewhere; 40px row actions on Today | Accounts, People, Review, Today, Connect helper, Bridge | WCAG 2.5.8; Apple 44pt; Smith et al. 1999 | High | S |
| 4 | Assistant autonomy default → `signin` (Careful in Simple level); Stop becomes the big button while running; option labels shortened to title + one line | Assistant, Accounts, `types.ts` defaults | NN/G power of defaults; heuristic #3; PAIR control | High | XS |
| 5 | Render `whyNow` and `sources` on *Needs you* and *Promises* as "Because / From" lines (disclosure in Simple, visible in Standard+) | Today | Amershi G11; NN/G recommendation guidelines; inverted pyramid | High | S |
| 6 | Undo toast component; wire to Done ✓, Important/Quiet, Skills toggles, Settings changes; confirm-with-verb on Disconnect account, Forget sign-in, New token | Today, People, Skills, Settings, Accounts, Assistant, Bridge | NN/G confirmation dialogs; heuristic #3 | High | S |
| 7 | Settings: apply-on-change (drop *Save settings*), per-row help/default/reset/changed marker, search box, question-based groups, Advanced/Agents collapsed | Settings | NN/G toggles, defaults, customization; WCAG 3.2.6 | High | M |
| 8 | Onboarding step 2 leads with *Sign in with Google / Microsoft* (already implemented in Accounts), then *Let the assistant get a password*, manual app password last; define "app password" inline; strip spaces from pasted passwords; step 3 loses the "Setup → AI helper" memory chore in favour of a Today card | Onboarding, Accounts, Today | GOV.UK one thing per page; NN/G techy words; WCAG 3.3.7/3.3.8 | High | M |
| 9 | Text size: add 200% option, segmented control with live preview, read the OS text scale as the default; verify layouts at 2.0 | Settings, `App.tsx`, `styles.css` | WCAG 1.4.4; Apple Dynamic Type; Microsoft 200% test | High | S |
| 10 | Run progress: 5-step bar with phase name and time estimate, in the sidebar and in place of the greyed Today button | `App.tsx`, Today | NN/G response-time limits, progress indicators | Medium | S |
| 11 | Trust strip on Today: checked time · inboxes · new messages · engine · read-only, each linked | Today | NN/G trustworthiness factors; Amershi G1/G2 | Medium | S |
| 12 | Fixed two-column Today layout with assigned slots; empty slots collapse in place; severity by position and a red edge only for urgent | Today | NN/G spatial memory; dashboards pre-attentive | Medium | S |
| 13 | Setup hub: rename cards by outcome, show state on each card, order with the incomplete one first, merge Connect helper into Accounts | Setup hub | NN/G recognition vs recall; techy words | Medium | S |
| 14 | *Changes* card on Today with why + undo for profile switches, new sections, added tabs; profile auto-switch never silent | Today, Settings | Amershi G14/G18; NN/G personalization | Medium | M |
| 15 | Keyboard map (`R`, `1–6`, `J/K`, `D`, `Enter`, `S`, `L`, `/`, `?`, `Esc`) and `Ctrl/Cmd+K` command palette that also searches settings | All | NN/G accelerators, keyboard accessibility; heuristic #7 | Medium (high for executives) | M |
| 16 | Short-brief mode: "2-minute read" label, top 3 per card, hidden quiet sections; same shape for email/SMS delivery | Today, delivery | Brysbaert reading rate; calm tech; BLUF | Medium | S |
| 17 | Inbox chips on Today become filters; 🏠/💼 glyph per item when >1 inbox; editable inbox role in Accounts | Today, Accounts | Account-switcher pattern; NN/G tabs | Medium | M |
| 18 | Voice controls: Slower/Normal, *Read just the top 3* (uses existing `short` mode), highlight the card being read, section names announced | Today | Speech-rate study for older adults; CSCW accessible VUI | Medium | S |
| 19 | Level system (`simple/standard/pro`) replacing `simpleMode`, with one-suggestion-per-week rule and fixed anchors | `types.ts`, App, Settings, Today | Findlater & McGrenere 2004; Gajos 2008; Lavie & Meyer 2010 | Medium | M |
| 20 | Reduced-motion media query; Assistant log stops auto-scrolling when the person scrolls up; heartbeat line during silence; error copy rewritten as what/why/fix for IMAP and AI-key failures | Assistant, Accounts, AI helper, `styles.css` | WCAG 2.3.3; NN/G error-message guidelines | Low–Medium | XS–S |

Items 1–6 are a single sprint and move the app from "fails AA in three places" to "passes AA, safe to hand to a grandparent". Items 7–9 are the onboarding-and-settings sprint the owner's brief is really about. Items 10–20 are the executive and evolving-UI layer and can be taken in any order after that.

---

## Sources

Standards and platform guidelines
- WCAG 2.2 (W3C Recommendation, Oct 2023): [spec](https://www.w3.org/TR/WCAG22/); Understanding pages for [1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html), [3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html), [3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html); [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/)
- Apple Human Interface Guidelines: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- Microsoft: [Accessible text requirements](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/accessible-text-requirements), [Keyboard accessibility](https://learn.microsoft.com/en-us/windows/apps/design/accessibility/keyboard-accessibility), [Inclusive Design toolkit](https://inclusive.microsoft.design/), [Fluent 2 accessibility](https://fluent2.microsoft.design/accessibility)
- GOV.UK Design System: [Question pages / one thing per page](https://design-system.service.gov.uk/patterns/question-pages/); [design note, 2015](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/)
- MDN: [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

Nielsen Norman Group
- [Usability for Older Adults: Challenges and Changes](https://www.nngroup.com/articles/usability-for-senior-citizens/) · [UX Design for Seniors (report)](https://www.nngroup.com/reports/senior-citizens-on-the-web/) · [Define Techy Terms for Older Users](https://www.nngroup.com/articles/define-techy-words-old-users/)
- [Designing for Kids: Cognitive Considerations](https://www.nngroup.com/articles/kids-cognition/) · [Physical Development](https://www.nngroup.com/articles/children-ux-physical-development/) · [Children's UX: Usability Issues](https://www.nngroup.com/articles/childrens-websites-usability-issues/) · [UX Design for Children (report)](https://www.nngroup.com/reports/children-on-the-web/)
- [Plain Language Is for Everyone, Even Experts](https://www.nngroup.com/articles/plain-language-experts/) · [Legibility, Readability, and Comprehension](https://www.nngroup.com/articles/legibility-readability-comprehension/) · [Typography for Glanceable Reading](https://www.nngroup.com/articles/glanceable-fonts/)
- [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [User Control and Freedom](https://www.nngroup.com/articles/user-control-and-freedom/) · [Consistency and Standards](https://www.nngroup.com/articles/consistency-and-standards/) · [Flexibility and Efficiency of Use](https://www.nngroup.com/articles/flexibility-efficiency-heuristic/)
- [Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/) · [Preventing User Errors: Avoiding Conscious Mistakes](https://www.nngroup.com/articles/user-mistakes/) · [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) · [Hostile Patterns in Error Messages](https://www.nngroup.com/articles/hostile-error-messages/) · [Reporting Errors in Forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- [Response Times: 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) · [Progress Indicators](https://www.nngroup.com/articles/progress-indicators/)
- [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) · [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) · [Mobile Tutorials: Wasted Effort or Efficiency Boost?](https://www.nngroup.com/articles/mobile-tutorials/) · [Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/)
- [The Power of Defaults](https://www.nngroup.com/articles/the-power-of-defaults/) · [Toggle-Switch Guidelines](https://www.nngroup.com/articles/toggle-switch-guidelines/) · [7 Tips for Successful Customization](https://www.nngroup.com/articles/customization/) · [Customization vs. Personalization](https://www.nngroup.com/articles/customization-personalization/) · [6 Tips for Successful Personalization](https://www.nngroup.com/articles/personalization/) · [UX Guidelines for Recommended Content](https://www.nngroup.com/articles/recommendation-guidelines/)
- [Spatial Memory: Why It Matters for UX Design](https://www.nngroup.com/articles/spatial-memory/) · [Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) · [Visual Hierarchy in UX](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/) · [Homepage Design Principles](https://www.nngroup.com/articles/homepage-design-principles/)
- [Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/) · [Inverted Pyramid](https://www.nngroup.com/articles/inverted-pyramid/) · [Trustworthiness in Web Design: 4 Credibility Factors](https://www.nngroup.com/articles/trustworthy-design/) · [Explainable AI in Chat Interfaces](https://www.nngroup.com/articles/explainable-ai/)
- [Accelerators Maximize Efficiency](https://www.nngroup.com/articles/ui-accelerators/) · [Keyboard-Only Navigation](https://www.nngroup.com/articles/keyboard-accessibility/) · [UI Copy: Command Names and Keyboard Shortcuts](https://www.nngroup.com/articles/ui-copy/) · [Contextual Menus](https://www.nngroup.com/articles/contextual-menus-guidelines/) · [Supporting "Power Users" Isn't Enough](https://www.nngroup.com/articles/complex-apps-users/) · [8 Design Guidelines for Complex Applications](https://www.nngroup.com/articles/complex-application-design/)
- [Five Mistakes in Designing Mobile Push Notifications](https://www.nngroup.com/articles/push-notification/) · [The Attention Economy](https://www.nngroup.com/articles/attention-economy/)

Adaptive-interface and human-AI research
- Findlater & McGrenere, [A comparison of static, adaptive, and adaptable menus](https://dl.acm.org/doi/10.1145/985692.985704), CHI 2004
- Findlater & McGrenere, [Impact of screen size on performance, awareness, and user satisfaction with adaptive GUIs](https://www.cs.ubc.ca/~joanna/papers/CHI2008_Findlater.pdf), CHI 2008
- Findlater, Moffatt, McGrenere & Dawson, [Ephemeral adaptation](https://dl.acm.org/doi/10.1145/1518701.1518956), CHI 2009
- Gajos, Everitt, Tan, Czerwinski & Weld, [Predictability and accuracy in adaptive user interfaces](https://dx.doi.org/10.1145/1357054.1357252), CHI 2008; Gajos et al., [Exploring the design space for adaptive GUIs](http://aiweb.cs.washington.edu/ai/puirg/papers/kgajos-avi06.pdf), AVI 2006
- Lavie & Meyer, [Benefits and costs of adaptive user interfaces](https://www.sciencedirect.com/science/article/abs/pii/S1071581910000145), IJHCS 2010
- Amershi et al., [Guidelines for Human-AI Interaction](https://dl.acm.org/doi/10.1145/3290605.3300233), CHI 2019; [Microsoft HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/)
- Google PAIR Guidebook: [Explainability + Trust](https://pair.withgoogle.com/chapter/explainability-trust/), [Feedback + Control](https://pair.withgoogle.com/chapter/feedback-controls/)
- IBM Research, [Why or why not? Justification styles in chatbot recommendations](https://research.ibm.com/publications/why-or-why-not-the-effect-of-justification-styles-on-chatbot-recommendations)
- AI-label effects on trust: [AI labeling reduces perceived accuracy (2025)](https://arxiv.org/abs/2506.16202); [AI disclosures and trust in advertising (2025)](https://www.tandfonline.com/doi/full/10.1080/15252019.2025.2554149)

Cognition, motor control, reading and voice
- Cowan, [The Magical Mystery Four](https://journals.sagepub.com/doi/abs/10.1177/0963721409359277), 2010; Gilchrist, Cowan & Naveh-Benjamin, [Working memory for spoken sentences decreases with ageing](https://www.tandfonline.com/doi/abs/10.1080/09658210802261124), 2008
- Smith, Sharit & Czaja, [Aging, motor control, and the performance of computer mouse tasks](https://journals.sagepub.com/doi/10.1518/001872099779611102), 1999; Hertzum & Hornbæk, [How age affects pointing with mouse and touchpad](https://mortenhertzum.dk/publ/IJHCI2010b.pdf), 2010
- Brysbaert, [How many words do we read per minute?](https://doi.org/10.1016/j.jml.2019.104047), 2019
- [Talk like me: feedback speech-rate regulation for elderly VUI users](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10132265/), 2023; [Accessible Voice Interfaces](https://dl.acm.org/doi/10.1145/3272973.3273006), CSCW 2018
- Endsley, [Designing for Situation Awareness](https://www.amazon.com/Designing-Situation-Awareness-Approach-User-Centered/dp/1420063553); [BLUF](https://en.wikipedia.org/wiki/BLUF_(communication)); [Amazon narrative memos](https://slab.com/blog/jeff-bezos-writing-management-strategy/)
- Case, [Calm Technology principles](https://www.calmtech.institute/calm-tech-principles)
