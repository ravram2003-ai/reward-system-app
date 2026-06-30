# Prompt for Codex — quiet log without posting (post-first Phase 3)

Branch: continue on `feat/post-first-flow`. Phase 2 (post composer) is done in `outputs/app.js`:
`openPostComposer` (~3909), `renderPostComposer`, `publishPostComposer` (~4361), the Share switch
(`pc-share-row`, `postComposer.isShared`), and the `+` FAB now opens the composer
(`els.createFab → openPostComposer`, ~3193). Follow `CLAUDE.md` (reuse existing functions,
always-dark theme, security in RLS, additive idempotent SQL only if needed, bump the cache-bust
tag, mobile ~390px, end with a local link + smoke test). Don't auto-commit.

## Goal

A user must be able to **just log something without turning it into a post**, as the fast
default. Phase 2 made the composer post-first, but two things still force friction onto a quiet
log. Fix them.

## What's wrong now (verified)

1. **Counter rules open the full composer to log.** On the world / "Your day" rows, a yes/no rule
   is one-tap `✓ Done` (`data-quick-log-rule`, ~9584), but a counter rule's `+ Log` routes to
   `data-cc-open-rule` (~9634) which opens the post composer "so the amount is yours to type."
   That means logging 8,000 steps drags you through the whole post UI. Too heavy.
2. **The old "Want to turn this into a post?" prompt still fires.** `coachOfferPost` (~14813) is
   still called from multiple flows (~12057, 13833, 13927, 14729, 15131). Posting is now
   intent-driven (compose via `+` or attach a photo/caption), so this post-hoc prompt is friction.

## Fixes

**A. Quiet inline amount entry for counter rules.** Replace the `+ Log` → composer jump with a
lightweight inline amount control on the row (small −/＋ stepper or number field, like the
existing manual quick-log control) that **logs silently**: writes the `community_entries` /
personal entry directly, updates points + streak + leaderboard, and **does not open the post
composer**. Reuse the existing entry-write + scoring path (the same one `publishPostComposer`
calls for the private case). Yes/no `✓ Done` stays one-tap and silent.

**B. The composer is opt-in only.** The post composer (`openPostComposer`) is reached **only**
via the `+` FAB, or when the user explicitly attaches a photo/caption. No inline rule log should
open it.

**C. A quiet log never prompts to post.** After any inline `✓ Done` / `+ Log`, do **not** call
`coachOfferPost` or show any share prompt. Retire `coachOfferPost` and its callers
(~12057, 13833, 13927, 14729, 15131) since the composer's Share switch now expresses post-vs-log
intent up front. If any caller is still needed, keep it and explain why.

**D. Confirm the composer's private path is counts-only.** With the Share switch OFF
(`postComposer.isShared === false`), `publishPostComposer` must write the scoring entries but
create **no** `post_targets` and **no** feed/profile exposure (it already branches on `isShared`
around ~4173/4420 — verify it end-to-end). Toast should read "Logged", not "Posted".

## Acceptance / smoke test (report pass/fail)

1. Counter rule (e.g. Steps) on a world row: tapping `+ Log` lets you enter an amount **inline**
   and logs it — points/leaderboard update, **no composer opens**, no share prompt; reload shows
   it persisted.
2. Yes/no rule: `✓ Done` is one-tap, silent, counts immediately, no composer, no prompt.
3. No "Want to turn this into a post?" appears anywhere in the app.
4. The `+` FAB still opens the full post composer; attaching a photo/caption still opens/uses it.
5. In the composer, Share OFF → nothing publishes to any feed (no `post_targets`), but the rule
   still counts; toast says "Logged".
6. In the composer, Share ON with a photo/caption → posts to the toggled-on worlds + profile as
   before (don't regress Phase 2).
7. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the 7 checks above; report what you checked and pass/fail.
