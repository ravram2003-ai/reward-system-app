# Prompt for Claude Code — post-first entry with AI-matched destinations

Visual reference (open it in a browser first — it shows all 4 stages):
`work/post-first-flow-reference.html`

Work on a branch. Follow `CLAUDE.md`: reuse existing code/flows, always-dark theme, **security
in RLS** (anon key must never read private data), **additive idempotent SQL in NEW
`supabase/*.sql` files** (never edit existing) + update `supabase/MIGRATIONS.md`, bump the
cache-bust tag, mobile at ~390px, end with a local link + the smoke test. Don't auto-commit.
This is a big feature — build it in the phase order below, in one branch.

## The idea

Logging IS posting. The Add Entry flow becomes a **post-first composer**: a post is photo +
caption + the activity the AI parsed from your words. The AI matches that activity to the
**worlds whose rules it fits** and pre-toggles them ON; you flip any off; one "Share to feeds"
switch keeps it private. The published post looks like every other post, with the activity +
points baked in as a tag. See the reference file for the exact look of all 4 stages
(composer → AI-matched destinations → share/private switch → result in feed).

This **replaces** today's "log, then ask 'Want to turn this into a post?'" flow — the question
becomes the inline Share switch.

## Current data model (verified — build ON this, don't rebuild blindly)

- `community_entries` (id, community_id, user_id, **rule_id**, **amount**, **entry_date**,
  updated_at, **message**, **photo_path**) — this is BOTH the community feed item AND the
  scoring ledger (leaderboards sum these). One row per rule logged.
- `entry_likes` (entry_id, user_id, created_at) and `entry_comments` (id, entry_id, user_id,
  body, created_at) — engagement keyed to a `community_entries` row.
- `profile_posts` (id, user_id, photo_path, message, created_at) + `profile_post_likes` /
  `profile_post_comments` — a parallel, currently-unused profile-post track.

Problem this causes: a "post" is tied to a single community_entry (one rule, one community),
and profile posts are a separate system. There is no way for one post (caption+photo+multiple
activities) to appear in several feeds with shared likes/comments.

## Target data model (one post, many feeds)

Add (idempotent migration, new file):

1. `posts` — the canonical social unit:
   `id uuid pk, author_user uuid, caption text, photo_path text, activity jsonb` (array of
   `{ruleLabel, emoji, amount, unit}` for the tag), `is_shared boolean default true,
   created_at timestamptz default now()`.
2. `post_targets` — the fan-out (one row per destination the post goes to):
   `id, post_id uuid fk, target_type text check in ('profile','community'),
   target_id uuid` (community id, or the author's user id for profile),
   `points numeric default 0`. Drives both feeds and the per-target point rollup.
3. `post_likes` (post_id, user_id, created_at) and `post_comments` (id, post_id, user_id,
   body, created_at) — engagement on the POST (so it's shared across every feed it appears in).
4. Add a nullable `post_id uuid` column to `community_entries` to link the per-rule scoring
   rows to their social post (keeps the existing leaderboard working unchanged).

RLS (must enforce in DB, not just JS):
- `posts`: insert only where `author_user = auth.uid()`; select if the post has a target the
  viewer may see (a `community` target the viewer is a member of, OR a `profile` target that is
  public / followed / the viewer's own); delete/update only by `author_user`.
- `post_targets`: insert only by the post's author AND only for a community the author belongs
  to (`community_members`) or the author's own profile. Select follows the parent post.
- `post_likes` / `post_comments`: insert by any authed user who can SELECT the post; delete own
  rows (comments: author or post author).
- Keep `community_entries` RLS as-is for scoring.

## Write path (composer → publish)

One publish action creates exactly **one `posts` row**, then fans out:
- For each community target toggled ON: insert a `post_targets` row, AND write the per-rule
  `community_entries` rows (rule_id, amount, entry_date, community_id, user_id, message,
  photo_path) **with `post_id` set** — this is the existing scoring path, now linked to the post.
  Compute `post_targets.points` from those rules' scoring (reuse existing scoring).
- For the profile target toggled ON: insert a `post_targets` row (`target_type='profile'`,
  `target_id = author`). No scoring.
- **Private mode** (`is_shared=false`, Share switch off): still write the `community_entries`
  scoring rows for any matched rules so it counts toward goals, but create NO feed-visible
  post_targets (or mark the post private and exclude it from all feed reads). Net effect: counts,
  but appears in no feed. This is the new home of the old "logged, not posted."

Reuse for the write: existing community-entry insert in `signals.js`, existing scoring in
`scoring.js`, existing photo upload + `resizeImageForUpload` + signed-URL cache.

## AI matching (the toggles)

- Reuse the existing parse + match logic (`buildCatchUp`, `ruleMatchScore`, the quick-log AI in
  `openAddEntryPage`) to turn the caption/quick-log text into matched rules, then determine
  which of the user's worlds contain a matching rule.
- Pre-toggle ON every community whose rule matches (high-confidence: exact metric or whole-word
  label match — same bar as the autosync prompt). Show the matched rule names + points as the
  reason line on each toggle (see reference). Leave non-matching worlds visible but OFF; "no
  match" worlds shown dimmed/disabled.
- Profile target defaults ON when there's a photo or caption (it's shareable content).
- All toggles are user-overridable; recompute the points total live as they toggle.

## Read paths

- **Community feed** (`renderCommunityDetail` feed tab): render from `posts` via `post_targets`
  where `target_type='community' and target_id=<community>` (show caption, photo, activity tag,
  points). For back-compat, also show legacy `community_entries` that have no `post_id`.
- **Profile** (`renderProfilePage`): photo posts = `posts` via `post_targets`
  (`target_type='profile'`, author=profile) that are shared. Replace the unused `profile_posts`
  reads with this.
- **Feed tab (Friends/Discover)**: shared `posts` from followed users (Friends) / public
  (Discover), deduped to ONE card per post even if it targets several of your worlds.
- **Leaderboards/scoring**: unchanged — keep summing `community_entries`.

## Engagement + delete

- Likes/comments read/write on `post_likes` / `post_comments` keyed to `post_id`, so the SAME
  thread shows wherever the post appears (THE BOYS, Daily Movement, your profile). For legacy
  entries with no post, keep the existing `entry_likes`/`entry_comments` path.
- Delete (author only, via the existing ⋯ menu): removes the `posts` row, its `post_targets`,
  `post_likes`, `post_comments`, AND the linked `community_entries` (so the points are removed
  too). Confirm copy stays honest: "removes the post and the points it logged."

## Acceptance / smoke test (do all; report pass/fail)

1. Compose a post "leg day with the boys, 8000 steps" + photo → AI attaches Lifting + Steps and
   pre-toggles THE BOYS (matches both) and Daily Movement (matches Steps) ON, Deep Work OFF.
2. Publish → ONE post appears in THE BOYS feed, Daily Movement's feed, and your profile, each
   with the activity tag + points; THE BOYS leaderboard goes up by the rule points.
3. Like the post in THE BOYS → the like count is identical when you open it from your profile
   (shared thread). Comment likewise.
4. Toggle Share OFF → publishing creates no feed post anywhere, but the matched rules still count
   toward goals (community_entries written; leaderboard updates).
5. Toggle a matched world OFF before posting → it does NOT appear in that world's feed and gets
   no points there.
6. Delete the post → it disappears from all feeds and the points are removed from every world.
7. RLS: signed out / as a non-member, the post in a private community is NOT readable via the
   anon key (test a direct query).
8. `npm test` and `node --check outputs/app.js` pass.

## Wrap up (required by CLAUDE.md)
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the 8 checks above; report what you checked and pass/fail.
- Remind me to run the new migration(s) in the Supabase SQL editor (and that any new storage
  needs already exist — reuse the current photo bucket).

If this is too large for one pass, split by phase (1: schema+RLS, 2: composer+AI toggles+write,
3: read paths+engagement, 4: delete) but keep them on the same branch and tell me the boundary.
