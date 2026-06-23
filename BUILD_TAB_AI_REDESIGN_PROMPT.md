# Claude Code task — New AI-first Build flow for Pointwell (Build tab)

## 0. Mission
Rebuild the **Build tab** as a two-screen, AI-first experience that matches the two attached screenshots exactly:

- **Screen 1 (Intent home)** = the "What do you want to build?" page. This is the new default Build screen.
- **Screen 2 (AI draft editor)** = appears **after** the user submits an intent. The AI generates a reward system rendered as editable plain-English sentence cards with drag-to-scrub point/goal pills and tap-to-fix AI blanks.

Flow: open Build → Screen 1 → user types a goal (or taps a chip) and presses "Build it" → AI runs → land on Screen 2 with the generated, editable draft → user tweaks → creates a personal system OR a community.

**This is a UI/UX layer on top of the existing app.** It must reuse the current AI, rule-building, scoring, and persistence code. Nothing else in the app may break, and anything created through the new flow must behave **identically** to things created the old way.

---

## 1. COMPATIBILITY — the #1 requirement (do not compromise this)
Everything that works today must keep working. Anything the new flow creates must be indistinguishable, at the data level, from something made with the current builder.

1. **Same data shape.** A reward system or community created via the new AI flow must produce the **exact same object/rule shape** the current builder produces. Funnel every rule through the existing `buildRuleFromForm` (or the already-normalized shape `buildAiDraftFromAiSystem` returns) and save through the **existing** system/community save paths. Do NOT invent a parallel rule or system format.
2. **Full round-trip editability.** Anything created in the new flow must open in the existing 4-step editor (`#systemEditorPanel`) with **every field intact**, and be editable, duplicatable, and deletable exactly as before. After building via the new flow, opening "Edit advanced" and saving from the old editor must not corrupt or drop anything.
3. **Scoring unchanged.** Do not modify `scoring.js` or how points are computed. A system built in the new flow must score, rank, and total correctly on Today and in community leaderboards.
4. **Don't touch the backend contract.** Do not change the data model, persistence, Supabase tables, or RLS. You MAY add **optional, defaulted** fields to the AI Edge Function response (see §6), but old responses and old code paths must still work unchanged with no migration required to keep current features functional.
5. **Other tabs/flows keep working.** Today, logging via the center "+" FAB, Feed (Friends + Discover), Communities, Profile, notifications/bell, Chats, search, and onboarding must all still function. Do a verification pass on each after your change.
6. **Reuse over rewrite.** If something can't be reused cleanly, adapt the new UI to fit the existing code rather than changing the existing code. Prefer additive code; remove only dead code you yourself orphan.

If any acceptance test in §11 fails because existing behavior changed, the task is not done.

---

## 2. Project ground rules (from CLAUDE.md — obey these)
- **Static HTML/CSS/JS app. No framework, no build step.** Source is in `outputs/`: `index.html`, `app.js`, `styles.css`, plus `signals.js`, `scoring.js`. It is an IIFE module that uses `render*` functions, template strings, and `escapeHtml()` on ALL user/AI-supplied content. Match this style; do not add a framework, bundler, or npm runtime dependency.
- **Always-dark theme.** Reuse existing CSS variables/classes. Any new color must be dark-mode-safe (readable on near-black) and contrast-checked.
- **Security in the database.** Frontend holds only the anon key. Don't gate sensitive data in JS alone. (This task is mostly client UI.)
- **SQL is additive & idempotent.** You almost certainly need NO new SQL. If you genuinely do, add a NEW idempotent `supabase/*.sql` file (never edit an existing one), update `supabase/MIGRATIONS.md`, and tell the user to run it.
- **Bump the cache-bust tag.** After editing `app.js`/`index.html`/`styles.css`, bump the `?v=...` version on the script/style includes in `index.html` (e.g. `styles.css?v=20260625-rulebuilder` → a new value) so users get the new files.
- **Mobile matters.** Test at ~390px. No horizontal overflow (use `max-width`, `calc(100vw - …)`, safe-area insets). The new scrub pills and chip rows are prime overflow risks.
- **Branch + focused diff.** Work on a branch (suggested `build-tab-ai-intent`). Don't auto-commit or push unless asked.
- **Always verify.** Run `npm test` and `node --check outputs/app.js` and fix everything, then manually walk §11.
- **Don't reintroduce removed decisions.** The "+" FAB logs an entry only — creating systems/communities lives in Build. Don't bring back the old "Build my own / Join a community" fork. A community = a shared reward system + members.

---

## 3. Where things live today (your exact anchors)
Build tab markup is in `outputs/index.html` under `<section class="view" id="systemsView">` (nav tab labeled "Build", `data-view="systems"`). Logic is in `outputs/app.js`.

**Current entry panels (these are what Screens 1–2 replace as the default, but keep them reachable):**
- `#buildStartPanel` — three `.build-option-card` buttons: `data-build-start="search" | "ai" | "scratch"`.
- `#buildAudiencePanel` — the "Who's this for?" gate: `data-build-audience="personal" | "community"`. (We defer this to the end now.)
- `#buildSearchPanel` — `#buildPublicSearchInput`, results in `#buildPublicSearchResults`. (Keep — wired to "Find a public template".)
- `#buildAiPanel` — `<form id="buildAiForm">` with textareas `#aiGoalsInput`, `#aiRewardHabitsInput`, `#aiTargetsInput`; draft renders into `#aiDraftReview`. (Its logic is reused; its UI is superseded by Screen 2.)
- `#systemEditorPanel` — the 4-step editor: stepper `#systemSetupStepper`, panels `.setup-step-panel[data-setup-step="0..3"]` (Basic Info / Scoring Rules / Advanced Options / Review & Complete); nav `#setupBackButton`, `#setupSkipButton`, `#setupNextButton`, `#setupCompleteButton`. (Keep — this is "start from scratch" and "Edit advanced".)
- Saved lists: `#systemList` (reward systems) and `#buildCommunityList` (in `#buildCommunitiesWrap`).

**Basic Info form (`#systemForm`):** `#systemTitleInput`, `#systemCategoryInput` (+ `#categoryOptions` datalist), `#systemDescriptionInput`, `#systemVisibilityInput` (private/public).

**Rule builder (`#ruleForm`):** `#ruleLabelInput`, `#ruleUnitInput`, `#ruleDailyTargetSlider`/`#ruleDailyTargetInput`, `#ruleSimpleStyleInput` (`goal|every|both|yesNo|penalty`), conditional blocks `#goalPointsFields`/`#everyPointsFields`/`#yesNoPointsFields`, penalty toggle `#rulePenaltyEnabledInput` + `#penaltyFields` (`#ruleMinimumInput`, `#rulePenaltyPointsInput`, `#rulePenaltyModeInput`), `#extraThresholdList` + `#addThresholdButton`, `#ruleInputMethodInput`, `#ruleDataSourceInput`, `#ruleSourceMetricInput`, `#ruleManualOverrideInput`, live `#rulePreviewText`, and Advanced `<details>` (`#ruleCategoryInput`, `#ruleMaxDailyPointsInput`, `#ruleInputMaxInput`, `#ruleInputStepInput`).

**JS functions to REUSE (do not duplicate their logic):**
- Build nav/state: `setBuildMode`, `chooseBuildStart`, `startBuildForAudience(audience)`, `openBuildOptions`, `resetBuildHome`, `resetSavedBuildSubpage`.
- Lists/search: `getBuildPublicSystems`, `renderBuildSearchResults`, `renderBuildCommunities`, `openBuildCommunity`, `runBuildCommunitySearch`.
- Rules/persist: `buildRuleFromForm`, `bindRuleBuilderEvents`, `handleRuleBuilderChange`, `updateRuleBuilderVisibility`.
- AI (personal): `generateAiDraftSystem(event)`, `regenerateAiDraft`, `aiGenerateDraft(inputs, adjustments, kind)`, `readAiFormInputs`, `buildAiDraftFromAiSystem(aiSystem, inputs, adjustments)`, `aiSystemName`, `blankAiAdjustments`.
- AI (community): `generateCommunityAiRules`, `setCommunityDraftMethod`, `buildCommunityDraftRuleFromForm`, `updateCcRuleBuilderVisibility`, `saveCommunityDraftRule` (community draft state: `communityDraft`, `communityDraftStep`, `communityDraftMethod`, `state.communityDraftInputs`).
- Utilities: `showToast(msg)`, `escapeHtml(str)`.

**AI Edge Function (the substrate):**
- Call it ONLY through the existing wrapper `window.PointwellSignals.generateRules(inputs)` in `outputs/signals.js` — it does `sb.functions.invoke(<the existing function name>, { body: inputs })` and returns `{ error, system }`. Do NOT hardcode the function name or call `fetch` directly.
- Source: `supabase/functions/generate-rules/index.ts`. Key is the `ANTHROPIC_API_KEY` Supabase secret — never on the frontend.
- Generate contract: `POST { goals, rewards, penalties, categories, strictness, targets, adjust, kind } → { system: { title, category, description, explanation, rules:[...] } }`.
- Rule spec: `{ label, category, unit, style:"goal"|"every"|"yesNo", goal, every, points, tier:"core"|"extra"|"bonus"|"penalty" }`. Penalty = **negative `points`**, `goal` = daily minimum.
- `kind:"community"` already nudges the model toward fair/shared rules.
- A **refine mode** already exists (`REFINE_SYSTEM_PROMPT`, `buildRefineMessage`) accepting `{ current, instruction, history }` and returning the FULL updated system — reuse it for "Tweak with AI" and per-slot fills (§6).

---

## 4. SCREEN 1 — Intent home (`#buildIntentHome`) — match screenshot 1
Add `<section class="build-panel" id="buildIntentHome">` as the **default-visible** panel inside `#systemsView`. Route the Build tab to show this first (update `resetBuildHome` / tab-activation so this is the landing screen; "Back" from any sub-screen returns here). Keep `#buildStartPanel`/`#buildAudiencePanel` either removed-and-rewired or hidden, but every reference must still resolve.

**Contents (top to bottom), centered hero:**
1. Eyebrow text `BUILDER`.
2. `<h1>` "What do you want to build?" (large, bold).
3. Sub-line: "Tell us a goal in your own words. We'll spin up a reward system, find a public one that fits, or start you from scratch."
4. **Intent input row** `<form id="buildIntentForm">`:
   - `#buildIntentInput` — a prominent text input inside a softly outlined "well" with a green focus ring (reuse the Pointwell green/teal accent already in `styles.css`), a sparkles icon on the left.
   - Placeholder rotates every ~4s via `setInterval` (pause on focus; respect `prefers-reduced-motion`): "e.g. Run 3 times a week with the boys…", "e.g. Gym 4x a week + hit 170g protein", "e.g. Study for finals, no phone after 10pm".
   - `#buildIntentSubmit` — the green **"Build it →"** button. Enter also submits.
5. **Quick-start chips** `#buildIntentChips` — tappable pills that set `#buildIntentInput` AND immediately submit: `🏃 Run 3x a week`, `📚 Study for finals`, `😴 Sleep before midnight`, `🪜 10k steps daily`, `💪 Gym 4x a week`. (If the app already standardizes on an icon font/inline SVG instead of emoji, match that convention.)
6. **Three links** `#buildIntentLinks` (centered row):
   - **AI builds it for you** → focuses `#buildIntentInput` (this IS the default AI path).
   - **Find a public template** → opens the existing `#buildSearchPanel` (reuse `setBuildMode`/`renderBuildSearchResults`).
   - **Or start from scratch** → opens the existing 4-step `#systemEditorPanel` with an empty draft (reuse the current scratch path, default audience = personal, chosen later).
7. **"Your builds"** `#buildYourBuilds` — heading with a small count badge, then the user's existing reward systems AND communities as rows: icon, name, optional `DRAFT` badge, meta (`category · N rules · streak` or `· N members`), a `Private/Public` indicator, an `Edit` button, and an overflow `⋮`. **Reuse the existing list renderers** (`#systemList`'s current render path and `renderBuildCommunities`) — do not duplicate their data-loading. One combined list or two labeled groups is fine.

**Styling:** match screenshot 1 — centered, large bold headline, the outlined input well, hairline-bordered chips on near-black. New classes prefixed `build-intent-…`; reuse existing variables. No new heavy gradients beyond what the app already uses.

**Submit handler (`#buildIntentForm` / chip tap):**
1. Read the raw sentence from `#buildIntentInput`.
2. Build the Edge Function inputs: put the sentence into `goals` (and also `rewards`, mirroring the existing onboarding pattern around `buildOnboardingAiInputs`); leave `penalties`/`categories`/`targets` empty unless trivially parseable; `strictness:"balanced"`; `kind` per §8.
3. Call `aiGenerateDraft(inputs, blankAiAdjustments(), kind)` (which internally calls `window.PointwellSignals.generateRules`). Show a friendly loading state in place of the hero (spinner + rotating status: "Reading your goal…", "Drafting your rules…").
4. On success it returns the draft via `buildAiDraftFromAiSystem`; store it as the active draft and transition to **Screen 2**.
5. On failure: stay on Screen 1, `showToast` the clean error, never crash or apply broken data (mirror the existing guard near `app.js` ~5220–5278).

---

## 5. SCREEN 2 — AI draft editor (`#buildDraftEditor`) — match screenshot 2
Add `<section class="build-panel" id="buildDraftEditor" hidden>`. Shown after a successful generate. The existing `#systemEditorPanel` stays available as "Edit advanced".

### 5.1 Header
- `✦ AI drafted · tap any blank to fix it` badge line.
- Editable system name (default = AI `title` via `aiSystemName`); click to edit inline, writing back to the draft. A pencil/edit affordance on the right (as in the screenshot).
- An "Edit advanced ▸" link → opens `#systemEditorPanel` **pre-filled from this exact draft** (so the old editor and new editor are two views of the same draft).

### 5.2 Rule cards (sentence model) — `renderDraftRuleCard(rule, index)`
For each draft rule, a card with:
- Header row: an icon (map `rule.category`/`label` keyword → icon, generic fallback), the rule label (click to edit inline), and a remove `✕`.
- A **sentence** assembled from `rule.style`/`tier`:
  - `yesNo` reward → `Give me <PTS> when I <CONDITION>.`
  - `goal` reward → `Give me <PTS> when I hit <GOAL><UNIT>.`
  - `every` reward → `Give me <PTS> every <EVERY><UNIT>.`
  - penalty (tier `penalty` or negative points) → `Take away <PTS> when I <CONDITION or fall below GOAL UNIT>.`
- Tokens inside the sentence:
  - `<PTS>` → scrub-dial **point pill** (§5.3).
  - `<GOAL>`/`<EVERY>` → scrub-dial **number pill** (§5.4).
  - `<UNIT>` → small editable word token (tap to edit; writes `rule.unit`).
  - `<CONDITION>` → a filled word token if confident, else a **tap-to-fix AI blank** (§5.5).
- Below the stack: a live **points total** `#buildDraftTotal` = sum of positive `points` (round to 0.5/integer); tint amber if any penalties exist. A `+ Add a habit` button appends a blank rule card.

### 5.3 Scrub-dial point pill (`data-dial="points"`)
- **Display:** `+2 pts` / `−1 pt` / `0 pts` (singular at |1|), tabular-nums.
- **Colors:** positive = green family (reward), negative = red family (penalty), zero = neutral gray — reuse existing dark-safe green/red variables from `styles.css`, don't invent hex.
- **Gestures (all required):** pointer drag up = increase / down = decrease (Pointer Events + `setPointerCapture`, ~1 step per 14–16px, `touch-action:none`); mouse wheel ±1; keyboard focusable (`tabindex="0"`, `role="spinbutton"`, `aria-valuenow`) with Arrow Up/Down ±1.
- **Range/step:** clamp −10…+10, step **0.5** (matches existing point sliders). Round all displayed values.
- **Semantics:** crossing zero flips the verb "Give me" ↔ "Take away" and switches the rule between the normal and penalty path (§7). Update `#buildDraftTotal` on every change.

### 5.4 Scrub-dial number pill (goal / every)
- Same interaction as 5.3 but for the numeric value.
- Unit-aware step (derive from `rule.unit`, honoring the existing `#ruleInputStepInput` idea): steps → 500, minutes/hours → 1, grams → 5, dollars → 1, generic → sensible default.
- Clamp ≥ 0 and a sane max (reuse `#ruleInputMaxInput` default 20000 where relevant). Display `value + unit` with thousands separators via `toLocaleString()` (e.g. `10,000 steps`, `170g`, `6 hrs`).

### 5.5 Tap-to-fix AI blank (the key idea: AI fills what it's sure about, leaves the rest tappable)
- **Look:** a dashed, amber token reading `______` with a small ✦ icon — clearly "needs you" (match screenshot 2's Gym blank). Once filled it becomes a solid word token with a pencil affordance and is re-editable.
- **Which slots:** primarily the `<CONDITION>` ("when I ___") of `yesNo`/penalty rules, plus any field the AI flags low-confidence (§6). If no confidence data, fall back to a heuristic: blank when the condition/label is generic/empty or the rule is `yesNo` with no specific verb.
- **On tap:** open an inline helper **directly beneath that rule** in normal flow (NEVER `position:fixed`; the card grows). Helper contains:
  - A slot-scoped title derived from the label, e.g. "What should count as a gym day?".
  - **Suggestion chips** (2–4) of concrete fills for THIS slot. Use `rule.suggestions[field]` from the Edge Function if present (§6); else fetch via a scoped refine/suggest call (§6.3); else a tiny hardcoded fallback. Tapping a chip fills the blank and collapses the helper.
  - A **free-text "Ask AI for this part"** input + send button. On submit, call the AI scoped to this slot (§6.3), set the resolved phrase, collapse.
- Filling updates the underlying rule field(s) and re-renders the sentence. `escapeHtml` all user/AI text before injecting.

### 5.6 "Tweak with AI" bar (`#buildDraftRefine`)
- Label `✦ Tweak with AI`.
- Quick chips: `Make it harder`, `Make it easier`, `Fewer rules`, `Add a penalty`.
- Free-text box: "Ask AI to change anything…".
- On submit, call **refine mode** via `window.PointwellSignals.generateRules` with `{ current: <draft in the Edge Function's system JSON shape>, instruction: <text>, history: <last ~6 refine turns> }` (the wrapper forwards arbitrary `body` fields). Replace the draft with the returned full system, re-render, and flash "Updated by AI" on changed cards. The refine prompt already preserves untouched rules; keep the user's prior dial edits where the instruction didn't touch them if feasible. Keep an in-memory `refineHistory`.

### 5.7 Footer — choose audience LAST, encourage community
Sticky, mobile-safe footer:
- System name (mirrors header) + category.
- A segmented toggle: **🔒 Just me** ↔ **👥 Community**. Default **Just me**, EXCEPT when the intent implies a group (§8) → default **Community** with hint "Sounds like a group goal — make it a community so others can join." Always show a gentle one-liner nudge under the toggle: "Communities keep everyone accountable — invite people after you create it."
- Primary CTA: **"Create system"** (or **"Create community"** when toggled). On click:
  - **Personal:** persist via the **existing** save path used by `#setupCompleteButton`; convert each draft rule through `buildRuleFromForm`'s shape (or the normalized shape `buildAiDraftFromAiSystem` already produces). Then route to the system (Today / systems list) and `showToast("System created")`.
  - **Community:** route the same draft through the **existing** community creation/save path (`saveCommunityDraftRule` + the flow used by `generateCommunityAiRules`/`setCommunityDraftMethod`); set `kind:"community"` when (re)generating; surface the existing invite affordance; `showToast("Community created — invite people")`.
- Secondary: "Edit advanced" (opens `#systemEditorPanel` from this draft) and "Back" (to Screen 1; lightweight confirm if there are unsaved edits).

---

## 6. AI changes (additive only — old paths must still work)
### 6.1 Optional confidence fields
To power the blanks, extend `supabase/functions/generate-rules/index.ts` **without breaking the current shape**: in `SYSTEM_PROMPT` add OPTIONAL per-rule fields — `"condition"` (human phrase for the "when I ___" trigger), `"uncertain"` (array of field names the model is unsure about, e.g. `["condition"]`), and `"suggestions"` (object mapping an uncertain field → up to 4 short candidate strings). Document them as optional/defaulted so old responses and old clients still parse. The frontend treats missing `uncertain`/`suggestions` as "nothing uncertain" and uses the §5.5 heuristic. Keep `MODEL` as-is (Haiku is fine). Token cost is not a concern.

### 6.2 Frontend parsing
In `buildAiDraftFromAiSystem` (and wherever a rule spec is normalized, ~`app.js` 5107+), carry the optional `condition`/`uncertain`/`suggestions` onto the in-memory draft rule objects so the renderer can choose blank vs filled. Keep all existing normalization untouched.

### 6.3 Per-slot AI
- **Suggestions:** use `rule.suggestions[field]` if present; else call refine mode: "For the rule '<label>', propose 3 short, concrete options for the <field> (the trigger). Return the system unchanged except add them under that rule's suggestions," then read them back; else a tiny hardcoded fallback.
- **Free-text fill:** call refine mode with `{ current, instruction: "For the rule '<label>', set the <field> to express: '<user text>'. Keep everything else identical.", history }`; apply the returned field. Guard against malformed responses (reuse the Edge Function's `extractJson` and the client "never apply broken data" guard).

---

## 7. Mapping sentences/dials back to the rule engine (must round-trip)
- **Point pill → `points` + `style`/`tier`:** `points>0` = reward (`style` from sentence kind: `yesNo`/`goal`/`every`; tier `core`). `points<0` = penalty: `tier:"penalty"`, negative `points`, `goal` = minimum (from the goal pill), routed through the existing penalty path (`#rulePenaltyEnabledInput`/`#ruleMinimumInput`/`#rulePenaltyPointsInput`/`#rulePenaltyModeInput`) so editor + `scoring.js` treat it identically. `points===0` = incomplete: block "Create" until nonzero or removed.
- **Goal/every pill → `goal`/`every`.** **Unit token → `unit`.** **Condition/blank text → `label`/`condition`** (check-off rules key off `label`).
- **"Edit advanced" must fully round-trip:** the draft populates `#systemForm` + `#ruleForm` exactly (so `buildRuleFromForm`, `updateRuleBuilderVisibility`, `handleRuleBuilderChange` keep working), and edits there reflect back into the sentence view. Verify both directions.
- **Saving** uses existing persistence only (personal: the `#setupCompleteButton` save path; community: `saveCommunityDraftRule` + community creation). Trace and reuse — write no new persistence. You should need **no new SQL**.

---

## 8. Personal vs community detection
- Default `kind="personal"`.
- If the intent matches group signals — `/\b(we|us|our|team|crew|squad|group|club|friends|the boys|the girls|together|each other|everyone)\b/i` or "with <name(s)>" — set `kind="community"` for generation AND default the footer toggle to Community with the encouraging hint (§5.7).
- Always show the gentle community nudge even for personal builds. Never force it; the toggle is one tap.

---

## 9. Accessibility & mobile
- Dials: focusable, `role="spinbutton"`, `aria-valuenow/min/max`, arrow-key support, `aria-label` naming the rule.
- Blanks: `role="button"`, `aria-expanded`, Enter/Space activatable, helper keyboard-reachable.
- Reward vs penalty is conveyed by the `+`/`−` sign and the verb too, not color alone (color-blind safe).
- At 390px: sentences wrap (tokens `inline-flex; vertical-align:middle`), chip rows wrap, sticky footer respects safe-area insets, no horizontal scroll, per-slot helper expands in flow (no fixed overlays).
- Respect `prefers-reduced-motion` for placeholder rotation, "updated" flashes, loading status cycling.

---

## 10. Cache-bust, deploy, tests
- Bump the `?v=` tags on the `app.js`/`styles.css` includes in `index.html`.
- If you extended the Edge Function (§6.1): tell the user to redeploy it, AND ensure the frontend still works with the OLD function (graceful fallback) so nothing breaks before redeploy.
- Only add SQL if truly required (then additive/idempotent + update `MIGRATIONS.md` + tell the user to run it). This task should need none.
- Run `npm test` and `node --check outputs/app.js`; fix everything.

---

## 11. Acceptance / smoke test (desktop + ~390px)
1. Build tab opens on **Screen 1** matching screenshot 1 (headline, intent input, chips, three links, "Your builds" list).
2. Typing a goal and pressing Enter / "Build it →" shows a loading state, then **Screen 2** matching screenshot 2.
3. Tapping a quick-start chip pre-fills the input and runs the same flow.
4. Point pills scrub by drag/wheel/arrows; dragging below zero turns red, flips to "Take away"; total updates live; values clamp and round.
5. Goal/every pills scrub with unit-aware steps and thousands separators.
6. A "when I ___" blank opens an in-flow helper with suggestion chips + free-text "ask AI"; choosing/typing fills it (escaped) and re-renders; no overflow at 390px.
7. "Tweak with AI" (chip or text) refines the whole draft and re-renders, preserving untouched rules.
8. Footer toggle defaults to Community when the intent implies a group (e.g. "…with the boys"), else Just me with a nudge.
9. **Create system** persists a personal system; **Create community** persists a community via the existing path with the invite affordance. Open each and confirm rules + points **score correctly** in the real engine.
10. **Round-trip:** something created in the new flow opens in the old 4-step editor with every field intact; editing/saving there works; coming back reflects the edits.
11. AI/network failure → clean `showToast`, no crash, no broken data applied.
12. **No regressions anywhere else:** Today, "+" logging, Feed (Friends + Discover), Communities, Profile, bell vs Chats, search, onboarding all still work. Old systems/communities still open and edit normally. "Find a public template" and "Or start from scratch" still work. Cache-bust bumped. `npm test` + `node --check` clean.

---

## 12. Do NOT
- Rewrite `scoring.js`, the data model, or persistence.
- Add a framework/bundler/runtime dependency.
- Remove the existing 4-step editor or public search (they become fallbacks/advanced).
- Reintroduce the old "Build my own / Join a community" fork.
- Put the AI key on the frontend; only call through `window.PointwellSignals.generateRules`.
- Break the always-dark theme or introduce light-mode-only colors.

## 13. Suggested order (each step shippable & non-breaking)
1. Branch. Add `#buildIntentHome` + styles; route Build to it; wire the three links to existing panels; render "Your builds" by reusing existing renderers.
2. Build the scrub-dial pill (points + number) as standalone inline components.
3. Build `#buildDraftEditor` rendering `buildAiDraftFromAiSystem` output as sentences with dials + live total; wire **Create (personal)** through the existing save path.
4. Add tap-to-fix blanks (heuristic first, then suggestions/refine).
5. Add the "Tweak with AI" bar.
6. Add the footer toggle + community detection; wire **Create (community)**.
7. Extend the Edge Function additively for confidence/suggestions with graceful fallback.
8. Cache-bust, 390px pass, a11y pass, `npm test` + `node --check`, full §11 smoke test — confirming nothing else regressed.
