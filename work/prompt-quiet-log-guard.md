# Prompt for Codex — guarantee the "just log, don't post" path

Branch: work on the existing `feat/post-first-flow` (Phase 1 schema committed; Phase 2 composer
in progress in `outputs/app.js`). Follow `CLAUDE.md` (reuse existing functions, always-dark
theme, security in RLS, additive idempotent SQL only if truly needed, bump the cache-bust tag,
mobile ~390px, end with a local link + smoke test). Don't auto-commit.

## Requirement

We're moving Add Entry to a **post-first** model (composer = photo/caption + AI-matched
destination toggles + a Share switch). A user must STILL be able to **log something without
turning it into a post**, and that quiet path must stay the **fast default** — never routed
through the composer, never showing a "share?" prompt.

Three speeds (must all hold):
1. **Quiet log (default, fast):** the inline `Done` / `+ Log` on a rule (Today and a community's
   "Your day") logs instantly — counts toward goals + leaderboard, no composer, no caption, no
   prompt. A bare log (no photo, no caption) is "activity," not a post (consistent with
   `CLAUDE.md`).
2. **Post:** the composer opens ONLY via the `+` FAB, or when the user attaches a photo/caption.
   Destinations + Share toggle live there.
3. **Private:** in the composer, Share OFF → counts only, no feed exposure, not even an activity
   line.

## Tasks

**A. Audit (make sure it's possible).** After the Phase-2 composer changes, confirm the inline
`Done`/`+ Log` still logs silently without opening the composer or asking anything. Report
(function names + line numbers): the inline log handler(s) on the dashboard / community
"Your day", the composer entry (`openAddEntryPage` and the new post composer), and whether any
new code forces logging through the composer or shows a post prompt.

**B. Guard / fix.** Ensure the inline `Done` / `+ Log` path:
- writes the `community_entries` (scoring) directly and updates points / streak / leaderboard,
- does NOT open the composer,
- does NOT show "Want to turn this into a post?" or any share prompt,
- yields at most a compact activity line, not a full post card.
The composer is reachable ONLY via the `+` FAB or by attaching a photo/caption.

**C. Verify the Share switch.** In the composer, "Just log it" / Share OFF must produce a
counts-only result (writes `community_entries`, creates no feed-visible `post_targets` / marks
the post private) — no card in any feed.

**D. Retire the old post-hoc prompt.** Remove the old "Want to turn this into a post?" coach
prompt (`coachOfferPost`) since posting is now intent-driven (compose or attach), not asked after
the fact. If you find a flow that still needs it, keep it and explain why.

## Acceptance / smoke test (report pass/fail)

1. On Today / a community "Your day", tap `Done` / `+ Log` on a rule → points + leaderboard
   update instantly; no composer opens; no share prompt; reload shows it persisted.
2. A bare log shows as a compact activity line (or nothing) — NOT a full post card.
3. Tapping the `+` FAB (or attaching a photo/caption) opens the composer with destinations +
   Share toggle.
4. In the composer, Share OFF → nothing publishes to any feed, but the rule still counts
   (`community_entries` written; leaderboard updates).
5. No "Want to turn this into a post?" prompt appears anywhere.
6. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag if you touch `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the 6 checks above; report what you checked and pass/fail.
