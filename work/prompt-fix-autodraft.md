# Prompt for Claude Code — fix "Auto-draft does nothing" (team battle)

Branch: `feat/compete`. Follow `CLAUDE.md` (reuse code, always-dark theme, security in RLS,
additive idempotent SQL, bump cache-bust, local link + smoke test). Don't auto-commit.

## Root cause (verified — don't re-investigate from scratch)
The contest tables **do not exist in the Supabase database**. The migration files exist in the
repo but were never applied:
- `supabase/compete-contests.sql` (creates `contests`, `contest_teams`, `contest_participants`
  + RLS helpers `can_read_contest` / `can_manage_contest`)
- `supabase/compete-tournaments.sql` (creates `contest_matches`)

`MIGRATIONS.md` documents them. Because the tables are missing, `createTeamContest()`
(app.js ~20973) → `S.createContest()` (signals.js ~1187, inserts into `contests` /
`contest_teams` / `contest_participants`) fails, and the failure isn't clearly surfaced — so
pressing **Auto-draft** appears to do nothing.

## Do this

1. **The actual unblock is running the migration.** Verify `compete-contests.sql` and
   `compete-tournaments.sql` are correct, idempotent, and have proper RLS (anon denied; community
   members read; creator or community owner manages). If anything's off, fix it. Then **remind me
   to run `compete-contests.sql` (and `compete-tournaments.sql` for tournaments) in the Supabase
   SQL editor** — that is what fixes the bug. If you have Supabase access, apply them yourself and
   confirm the tables exist.

2. **Make the create path fail loudly, never silently.** In `createTeamContest()` (and
   `createTournamentContest()` ~21206), wrap the `S.createContest(...)` call in try/catch; on ANY
   error or missing result: re-enable + restore the button label, `console.error` the real error,
   and show a clear toast. If the error looks like the tables are missing (PostgREST `42P01`,
   "relation ... does not exist", or "Could not find the table"), show a specific message:
   "Team battles aren't set up yet — run the compete migration." No code path may leave the user
   with no feedback.

3. **Verify end-to-end once the tables exist:** Auto-draft → rows created in `contests`,
   `contest_teams`, `contest_participants` → `openContestBattle()` renders the battle → it shows
   as a card in the Compete hub → reload persists it.

4. **Fix the Captains label/flow mismatch.** The button label is set by split at app.js ~20934
   (`captains` → "Draft & start", else "Auto-draft N teams"), but the screenshot shows **Captains
   selected** with the button reading "Auto-draft teams" and subtitle "Drafts 8 members into 2
   teams". Make the button label, the subtitle, and the behavior all match the selected split:
   - `2×N` / `4×N` → "Auto-draft N teams", auto-distribute members.
   - `captains` → "Draft & start"; the two picked captains seed the two teams and the remaining
     members are distributed (or captains pick). Don't show "auto-draft" copy in captains mode.

## Acceptance / smoke test (report pass/fail)
1. With the tables still missing, pressing Auto-draft shows a clear toast (not silent nothing) and
   the button returns to normal.
2. After running the migration: Auto-draft creates the battle and opens it; it appears in the
   Compete hub; reload shows it persisted.
3. Captains mode: the button reads "Draft & start" and the picked captains seed the teams; 2×N/4×N
   reads "Auto-draft N teams".
4. RLS: a non-member cannot read the contest via the anon key.
5. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the checks above; report pass/fail.
- Remind me to run `compete-contests.sql` (and `compete-tournaments.sql`) in the Supabase SQL
  editor — the feature stays broken until that's done.
