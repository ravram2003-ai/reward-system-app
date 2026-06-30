# Prompt for Codex — Compete: 1v1 · tournaments · teams (phased)

Visual reference (open it first — all 4 screens): `work/compete-reference.html`

Work on a new branch `feat/compete`. Follow `CLAUDE.md`: reuse existing code/flows, always-dark
theme, **security in RLS** (anon key never reads private data), **additive idempotent SQL in NEW
`supabase/*.sql` files** (one per phase) + update `supabase/MIGRATIONS.md`, bump the cache-bust
tag, mobile ~390px, end with a local link + smoke test. Don't auto-commit. **Build in the 3
phases below, in order, on this branch** — ship/verify each before the next.

## The idea

1v1, tournaments, and teams are the same thing: a **time-boxed contest over points inside a
community**. Build ONE "Compete" hub (the challenge feed) that lists every contest you're in, a
single "+ New contest" that picks the format, and a detail view per format. Everything scores off
the community points you already compute — no new scoring math.

## Current data (verified — build ON this)
- `challenges` (id, community_id, challenger_user, opponent_user, metric, duration, start_at,
  end_at, status, winner_user, forfeit, created_at) — the existing **1v1** model.
- `community_members` (community_id, user_id, role, joined_at) — roster + `role` (owner) for RLS.
- `community_entries` — the points ledger; sum these over a contest's window for every score.
- Community detail tabs today: Feed · Leaderboard · Members · About (in `renderCommunityDetail`).

## Generalized model (introduce when teams need it, Phase 2)
- `contests`: id, community_id, creator_user, `format text check ('tournament','team')`,
  metric text, `scoring_mode text check ('total','avg_active') default 'total'`, start_at, end_at,
  `status text` (pending/active/done), created_at. (1v1 duels keep using `challenges` for now; the
  hub shows both uniformly.)
- `contest_teams`: id, contest_id, name, color.
- `contest_participants`: id, contest_id, user_id, team_id (nullable), seed int (nullable),
  eliminated bool default false.
- `contest_matches` (tournament): id, contest_id, round int, slot int, a_user, b_user,
  a_score numeric, b_score numeric, winner_user, window_start, window_end, status.
- RLS: only `community_members` of the contest's community can read it or be participants; only the
  creator or community owner (role) can create/manage; scores are computed read-only.

---

## Phase 1 — Compete hub (the challenge feed)
- Replace the community **Members** tab with a **Compete** tab (keep the member roster reachable as
  a collapsible "Members" section at the top of Compete, since challenging people needs it; keep
  the per-member ⚔️ Challenge button there).
- Build the hub feed per render #1: sections **Live now** (active contests), **Waiting on you**
  (pending challenges where you're the opponent → Accept/Decline), and **Past** (finished, with
  result). For Phase 1, populate it from the existing `challenges` rows (active/pending/past for
  the current user in this community). Each card shows opponent, who's ahead, time left, "View ›".
- "+ New contest" opens the format picker (render #2). Wire **1v1** to the existing
  challenge-create flow. Show **Tournament** and **Teams** as options that say "coming soon" until
  Phases 2–3 (or disable). Window + "what counts" config is shared.
- No schema change required in Phase 1 (reuse `challenges`). Acceptance below.

## Phase 2 — Teams
- Add the `contests` + `contest_teams` + `contest_participants` tables (migration #1) with RLS.
- Create flow (render #4 top): pick split — 2×N, 4×N, or Captains — auto-draft members into teams
  (Captains = two members pick). Enforce a **minimum roster** per split (e.g. need ≥8 for 2×4);
  adapt options to the community size.
- Team battle view (render #4): each team's score = sum of its members' `community_entries` points
  over the window (or **avg per active member** when `scoring_mode='avg_active'` — offer this so a
  dead-weight member doesn't sink a team). Show each member's contribution, team totals, a
  head-to-head bar, time left. Surface it as a card in the hub.

## Phase 3 — Tournament
- Add `contest_matches` (migration #2) with RLS.
- Create flow: seed the entrants into a single-elimination bracket; handle non-power-of-2 with
  byes. Each round has its own window; when a round's clock ends, compute both scores from
  `community_entries`, set the winner, and advance them into the next round's match.
- Bracket view (render #3): rounds as columns, your current match highlighted, scores per match, a
  champion slot. Surface "your next match" as a hub card.
- Reuse the coach for nudges in all phases ("your semi's live, you're down 3", "you won 🏆").

## Acceptance / smoke test (run the phase you built; report pass/fail)
Phase 1: Members tab is now Compete; the hub lists your real 1v1s (live/pending/past) from
`challenges`; Accept/Decline works on a pending one; "+ New contest" → picker → 1v1 creates a
challenge as today; roster still reachable + Challenge button works.
Phase 2: create a 2×4 team battle → members split into Reds/Blues; each team's total = summed
member points over the window; logging points updates the right team live; avg-active mode works;
min-roster guard blocks an impossible split.
Phase 3: create an 8-player tournament → bracket seeds; when a round window ends the winner
advances; your match is highlighted; champion resolves on the final.
All phases: RLS — a non-member cannot read the contest via the anon key; `npm test` and
`node --check outputs/app.js` pass.

## Wrap up (each phase)
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the phase's checks; report pass/fail.
- Remind me to run that phase's migration in the Supabase SQL editor before testing on real data.
