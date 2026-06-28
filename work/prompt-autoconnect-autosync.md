# Prompt for Claude Code — auto-connect device feeds + fix community autosync

Work on a branch. Follow the repo rules in `CLAUDE.md` (reuse existing code, always-dark
theme, security in RLS, additive idempotent SQL in a NEW `supabase/*.sql` file + update
`MIGRATIONS.md`, bump the cache-bust tag, mobile at ~390px, end with a local link + smoke
test). Don't auto-commit.

## What the user wants (two things, one change)

1. **Bug:** In the community **THE BOYS**, the **Steps** rule should auto-fill from Fitbit
   but shows `0/10000` with a `+ Log` button. It never syncs.
2. **Behavior:** Device feeds should **auto-connect with no "Connect" prompt**. The app
   should silently wire an obvious device metric to the matching rule and start syncing,
   and the **only** question it ever asks afterward is **"Want to turn this into a post?"**.

## Root cause (already verified in code + Supabase — don't re-litigate, just fix)

File: `outputs/app.js`.

- **Community autosync is gated OFF by default.** `autoSyncEligibleForTarget()` (~line 11274)
  returns `false` for a community target unless `community.allowDeviceAutosync === true`.
  Personal targets default ON (`state.profile.allowAutoSync !== false`). THE BOYS has
  `allow_device_autosync = false` in the DB, so its rules never auto-sync.
- **The rule isn't wired to a device in the data.** In Supabase, every rule in THE BOYS'
  `system` jsonb is stored as `dataSource: "manual"`, `dataSources: null`,
  `sourceMetric: "manual"` — including **Steps**. The "Google Health (Fitbit) / Steps"
  selection the user made in the rule editor **was not persisted**. So even with the gate
  open, there's no device source to pull from.
- **Today the app offers a manual "Connect a feed" card** instead of just connecting:
  `buildCatchUp()` (~11163) finds the match, then at ~11188 does
  `if (m.t.contextType !== "community" || !communityAllowsAutosync(m.t.contextId)) return;`
  and falls through to building a `d.connect` card rendered by `coachPostDeviceNudge()`
  (~13000: "…shows X — track it with your Y rule? [Not now] [Connect]"). The Connect
  handler `coachDeviceConnect()` (~13194) calls `coachConnectRuleFeed()` (~13160), which is
  exactly the wiring we want to do automatically: it sets
  `rule.dataSources = [source]`, `rule.dataSource = source`, `rule.sourceMetric = metric`.

Relevant existing pieces to REUSE (do not rebuild):
`buildCatchUp`, `ruleMatchScore` (~10972), `syncIncrementPreview` (~11122),
`applySyncIncrementForRule` (~11109), `coachConnectRuleFeed` (~13160),
`coachOfferPost` (~14125, the "turn into a post?" card), `coachDeclinePost` (~14197),
`communityFromDb` (~19605, `allowDeviceAutosync` read), `saveCommunitySettings` (~17658) /
`updateCommunityMedia` (signals.js) for persisting the community, and whatever existing
function saves a community's `system` jsonb after a rule edit.

## Changes to make

### 1. Default community autosync ON (keep the off-switch)
- Treat community autosync as **on unless the owner explicitly turned it off**. Update
  `autoSyncEligibleForTarget()` and `communityAllowsAutosync()` so a community with
  `allowDeviceAutosync !== false` is eligible (i.e. `null`/`undefined`/`true` all count as
  on; only an explicit `false` disables).
- Update `communityFromDb()` so a missing/`null` `allow_device_autosync` maps to `true`.
- New communities default to autosync on.
- Keep the existing owner toggle in community settings as the way to opt OUT (so control is
  preserved — it just defaults on now).
- **Migration (additive, idempotent):** new `supabase/NNNN_autosync_default_on.sql` that sets
  the `communities.allow_device_autosync` column DEFAULT to `true` and backfills existing
  rows that are `null` OR `false` to `true`. Update `supabase/MIGRATIONS.md` and remind me to
  run it in the Supabase SQL editor.

### 2. Auto-connect obvious matches instead of showing the "Connect" card
- In `buildCatchUp()`, when a device metric matches a rule with **high confidence**, call
  `coachConnectRuleFeed(...)` automatically (wiring the rule's `dataSources`/`dataSource`/
  `sourceMetric`), apply the increment via the existing sync path, and **do not** emit the
  `d.connect` "Connect a feed" card.
  - **High-confidence = either** an exact `sourceMetric` match (`ruleMatchScore` === 3) **or**
    a whole-word match of the device metric's canonical name in the rule's label/unit
    (e.g. `steps`→"Steps", `calories`→"Calories within target", `sleep`→"Sleep 7+ hours").
    Do **not** auto-link weak/ambiguous matches (e.g. don't link `steps` to "Cardio") — for
    those, just leave the rule manual (no card, no nag).
  - Multi-source is fine and preferred: `coachConnectRuleFeed` already ADDs the device source
    while keeping manual `+ Log` available — keep that behavior so manual entry still works.
- **Owner vs member (important for RLS):** wiring a community rule's data source edits the
  **shared** `communities.system` jsonb, which only the owner may write.
  - If the current user is the **community owner**, auto-wire the shared rule and **persist**
    it (use the existing community-system save path; confirm it writes `system` to the DB).
  - If the current user is a **member (not owner)**, do **not** attempt to rewrite the shared
    rule (it would fail RLS). Once the owner has wired the rule and autosync defaults on, the
    member's own device should auto-fill their own progress through the normal
    `applySyncIncrementForRule` path — verify that works for members with no extra prompt.
- Replace the Connect card with a **non-blocking confirmation** in the coach channel:
  e.g. `Now tracking Steps from Fitbit` with a small **Undo** (Undo reverts the wiring via the
  existing un-link/manual path). No buttons required to start syncing.
- Remove/retire the `d.connect` branch of `coachPostDeviceNudge()` (or stop setting
  `d.connect = true`) so the "[Connect]" card no longer appears anywhere.

### 3. Keep ONLY the "turn into a post?" prompt
- After an auto-sync or a log, the sole follow-up prompt should remain `coachOfferPost()`
  ("Want to turn this into a post?" → Yes/Not now). "Not now" still ends with
  `coachDeclinePost()` ("No problem — logged, not posted."). Don't add any other gating
  question.

### 4. Make the rule editor actually persist data source + metric (the silent save bug)
- The user set Steps → "Google Health (Fitbit) / Steps" in the community rule editor but the
  DB still shows `manual`. Find the community rule-edit save path and confirm that a rule's
  **Data source** and **Metric** selections are written into the `communities.system` jsonb
  (and personal systems for personal rules). Fix it if the dropdowns aren't being persisted.
  Add this to the smoke test below.

## Acceptance criteria / smoke test (do all of these and report pass/fail)

1. Open **THE BOYS → Your day** with Fitbit connected: **Steps auto-fills** today's Fitbit
   value (e.g. `8,000/10,000`) on load — no tap, no `0/10000`.
2. **No "Connect a feed" card** appears anywhere. Instead a subtle "Now tracking Steps from
   Fitbit · Undo" confirmation shows once, and syncing starts automatically.
3. The only follow-up prompt is **"Want to turn this into a post?"**; "Not now" →
   "No problem — logged, not posted."
4. In the community rule editor, set a rule's Data source = Google Health (Fitbit), Metric =
   Steps, save, **reload** → the selection persists (verify the `system` jsonb in Supabase).
5. Owner toggle: turning the community's auto-count **off** stops auto-sync; default is on.
6. Member (non-owner) account: with the owner's rule wired + autosync on, the member's own
   Fitbit fills their own Steps progress, no prompt, no RLS error in console.
7. `npm test` and `node --check outputs/app.js` pass.

## Wrap up (required by CLAUDE.md)
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css` includes.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test **plus** the 7 checks above; report what you checked and
  pass/fail.
- Remind me to run the new migration in the Supabase SQL editor before testing on real data.
