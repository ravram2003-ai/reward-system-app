# Prompt for Claude Code — "Log doesn't work" (composer aborts on missing posts table)

Branch: `feat/post-first-flow`. Follow `CLAUDE.md` (reuse code, always-dark theme, security in
RLS, additive idempotent SQL, bump cache-bust, local link + smoke test). Don't auto-commit.

## Root cause (verified — don't re-investigate from scratch)
The post-first tables **don't exist in the Supabase database**: `posts`, `post_targets`,
`post_likes`, `post_comments` are all absent. The migration `supabase/post-first-feed.sql`
(Phase 1: those tables + RLS + the nullable `community_entries.post_id` column) was **never run**.

`publishPostComposer()` (outputs/app.js ~4531) calls
`window.PointwellSignals.createPost(...)` **unconditionally at ~4564** — even for a quiet log
(`isShared === false`) — and then at ~4565–4569:
```
if (created.error || !created.post || !created.post.id) { ...showToast...; return; }
```
Because `posts` doesn't exist, `createPost` errors, this returns early, and **no
`community_entries` are ever written** — so pressing "Log" does nothing. (Even the per-rule entry
writes at ~4606–4608 pass `post_id`, a column that also doesn't exist yet.)

## Fix

1. **The immediate unblock: run the migration.** Verify `supabase/post-first-feed.sql` is correct,
   idempotent, and has proper RLS (anon denied; members read; author writes/deletes own), and that
   it adds the nullable `community_entries.post_id` column. If anything's off, fix it. Then
   **remind me to run `supabase/post-first-feed.sql` in the Supabase SQL editor** — that's what
   makes logging AND posting work. If you have Supabase access, apply it and confirm the tables +
   the `post_id` column exist.

2. **Decouple quiet logging from the posts layer (so this can never silently break again).** In
   `publishPostComposer`, when `isShared === false` (quiet log): do **not** call `createPost` and do
   **not** create a `posts` row. Write the `community_entries` (and personal `quickEntries`)
   directly with `postId = null`, update points/streak/leaderboard, and finish with the "Logged"
   toast. Only call `createPost` / write `post_targets` when `isShared === true` (a real post).
   Make sure the entry-write path omits `post_id` when it's null so it never references a
   possibly-absent column.

3. **Surface failures; never abort into silence.** If `createPost` (share mode) or any entry write
   fails, re-enable the composer, `console.error` the real error, and show a clear toast. If the
   error looks like the tables are missing (PostgREST `42P01`, "relation ... does not exist",
   "Could not find the table"), show: "Posting isn't set up yet — run the post-first migration."

## Acceptance / smoke test (report pass/fail)
1. Quiet log (Share OFF): tapping "Log · +N pts" writes the entries and updates points +
   leaderboard for every ON world, with **no dependency on the posts table**; toast "Logged";
   reload persists. (This must pass even before the migration, since a log no longer touches
   `posts`.)
2. After running the migration: turning Share ON and posting creates a `posts` row + `post_targets`
   and the post appears in the feeds/profile; entries link via `post_id`.
3. If posting fails (e.g. tables missing), a clear toast appears and the composer re-enables — never
   a silent no-op.
4. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the checks above; report pass/fail.
- Remind me to run `supabase/post-first-feed.sql` in the Supabase SQL editor.
