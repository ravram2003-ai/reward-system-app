# Supabase migrations — run order & status

All `.sql` files are idempotent (safe to re-run). Run each **in the Supabase SQL editor**,
in the order below — each depends on the ones above it. After running one, tick its box so
you know what's live in production.

> Common failure: a feature loads in the app but every action fails → the matching
> migration below hasn't been run yet. Check this list first.

## Run order

- [ ] **1. signals.sql** — base: creates `profiles`, the `signals` table (kudos/messages
  + in-app notifications), and the new-user trigger. *(no deps)*
- [ ] **2. search-onboarding.sql** — adds profile columns (`visibility`,
  `onboarding_completed`) + `search_profiles`. *(after signals)*
- [ ] **3. profile-pictures.sql** — profile avatar support (`avatar_url`). **Also create
  the `avatars` storage bucket** if not present. *(after signals)*
- [ ] **4. messaging.sql** — direct messages, blocks, reports. *(after signals)*
- [ ] **5. friends.sql** — friend requests/graph + `are_friends`, `profile_is_public`.
  *(after messaging + search-onboarding)*
- [ ] **6. communities.sql** — communities, memberships, community entries, RLS. *(base
  for everything community)*
- [ ] **7. community-discovery.sql** — name search, request-to-join tier, secret tier.
  *(after communities)*
- [ ] **8. friends-activity.sql** — friends' today activity helpers. *(after communities +
  search-onboarding + friends)*
- [ ] **9. feed-social.sql** — likes + comments on entries (`entry_likes`,
  `entry_comments`). *(after communities)*
- [ ] **10. discover-feed.sql** — `follows` table + the Discover feed function. *(after
  feed-social + friends + messaging)*
- [ ] **11. follower-count.sql** — follower/following counts. *(after discover-feed —
  needs `follows`)*
- [ ] **12. public-systems.sql** — public reward-system discovery/copy. *(after friends —
  needs `profile_is_public`)*
- [ ] **13. profile-view.sql** — profile page data (public communities + systems + recent
  posts) gated by `can_view_profile`. *(after feed-social + communities + follows)*
- [ ] **14. notifications.sql** — notifications table + triggers on likes/comments/friend
  requests (bell). *(after feed-social + friends)*
- [ ] **15. wearables.sql** — wearables (Fitbit/Whoop) tokens + RLS. *(independent — run
  anytime; pairs with the `wearables` edge function)*
- [x] **16. world-media.sql** — world cover photo + app icon: adds `cover_url`/`icon_url` to
  `communities` + `public_systems`, and a PRIVATE **`world-media` storage bucket** with
  owner-only write + visibility-gated read (`can_read_world_media`). *(after communities +
  community-discovery + public-systems + friends — needs `is_community_member`,
  `profile_is_public`, and the `request_to_join` visibility tier)*. **The upcoming world-detail
  cover/icon UI won't work until this is run and the bucket exists.**
- [x] **17. popular-communities.sql** — (re)creates the `popular_communities(lim)` SECURITY
  DEFINER function (public-only, ranked by member count) that onboarding's "Communities to
  join" fallback calls. It's defined in community-discovery.sql §3b but the live DB predates
  that block, so the RPC is missing and the fallback always renders empty. *(after
  community-discovery — needs `join_requests`, `community_members`, `is_community_member`)*.
  **Until this runs, `sb.rpc("popular_communities", …)` errors and the fallback stays empty.**
  ⚠ Re-running #7 community-discovery.sql later silently revokes anon's EXECUTE on this
  function (its §3b grants authenticated only) — re-run #17 afterward to restore it.
- [x] **18. profile-bio-connections.sql** — profile-redesign foundation: adds `profiles.bio`
  (text, ≤280 via CHECK) + SECURITY DEFINER `profile_followers(target)` / `profile_following(target)`
  returning `{id, display_name, handle, avatar_url, viewer_follows}`, privacy-gated by the existing
  `can_view_profile` (public/self/approved-follower; private → 0 rows; anon can't enumerate private
  connections). Granted anon + authenticated, read-only. *(after profile-view — needs
  `can_view_profile`; also `follows`, `profiles`, `profile_is_public`, `are_friends`)*.
- [x] **19. profile-bio-rpc.sql** — privacy-gated read of another profile's `bio`:
  SECURITY DEFINER `profile_bio(target)` returning the bio when `can_view_profile` (public/self/
  approved-follower), else NULL. Granted anon + authenticated, read-only. Powers the redesigned
  profile header. *(after #18 — needs `profiles.bio`; and profile-view's `can_view_profile`)*.
- [ ] **20. profile-cover.sql** — adds `profiles.cover_url` (text, nullable) for the profile cover
  banner. Own-profile field governed by the existing self-only `profiles` RLS (updateProfile path);
  intentionally NOT exposed via `get_profile_overview` (others see the default gradient). Storage
  REUSES the existing public **avatars** bucket + its path-based owner-only-write policies (from
  profile-pictures.sql) — no new bucket, no policy change. *(after #1 profile-pictures — reuses the
  avatars bucket)*.
- [x] **21. community-device-autosync.sql** — adds `communities.allow_device_autosync` (boolean,
  not null, default false). Owner opt-in to let members' connected-device totals auto-count toward
  the community leaderboard on login/sync. Owner-only write via the existing "communities update by
  owner" RLS (no new policy). *(after #N communities — adds a column to `communities`)*.
  Applied to the live project (ref `ejoccpqbozgzixrejlhd`) on 2026-06-25; verified column present
  (boolean / not null / default false).
- [x] **22. community-entry-delete.sql** — adds the author-only DELETE policy "entries delete own"
  on `community_entries` (`for delete using (user_id = auth.uid())`) so a member can delete only
  their own post via the feed ⋯ menu; anon + non-authors are blocked. Mirrors "members leave self".
  No schema change. *(after #6 communities — needs `community_entries`)*.
  Applied to the live project (ref `ejoccpqbozgzixrejlhd`) on 2026-06-25; verified policy present
  (`entries delete own` | DELETE | `(user_id = auth.uid())`).
- [x] **23. challenges.sql** — head-to-head (1v1) community challenges: a `challenges` table
  (community_id, challenger/opponent, metric, duration + start_at/end_at window, status, winner,
  forfeit) + a `is_community_owner` SECURITY DEFINER helper + RLS — a member INSERTs as the
  challenger in a community they belong to; the two participants + the community owner SELECT; the
  OPPONENT updates pending→active/declined; the OWNER (or service role) finalizes →done. anon can't
  read/write. Scores are computed in the app from `community_entries` over the window — NOT stored.
  *(after #6 communities — needs `communities`, `community_members`, `is_community_member`)*.
  Applied to the live project (ref `ejoccpqbozgzixrejlhd`) on 2026-06-26; verified 4 policies present
  (1 INSERT, 1 SELECT, 2 UPDATE) + `challenges` table.
- [ ] **24. profile-posts.sql** — PROFILE posts (personal posts on your profile + your followers'
  feed, independent of any community): a `profile_posts` table (`user_id`, `photo_path`, `message`,
  `created_at`; CHECK needs a photo OR message) + **parallel** `profile_post_likes` /
  `profile_post_comments` (same shape as the community like/comment tables, so the SAME feed UI is
  reused) + read RPCs `get_profile_posts_social` / `get_profile_post_comments`. RLS reuses the
  canonical profile gate: author-only write; SELECT is follow-gated — PUBLIC author readable by
  anyone incl. **signed-out/anon** (Discover), PRIVATE author readable only by the author +
  approved followers (`are_friends`); the anon key can't read a private author's posts or their
  likes/comments. Chose parallel tables over a polymorphic target because generalizing the live
  `entry_likes`/`entry_comments` (FK + PK + RLS hard-wired to community membership, authenticated-only)
  would be a risky rewrite of tables holding data. *(after #13 profile-view — needs `can_view_profile`;
  also friends.sql `profile_is_public`/`are_friends`, messaging.sql `is_blocked_between`, profiles)*.
  ⚠ This migration `grant execute ... to anon` on `profile_is_public(uuid)` (needed so the anon read
  policy can evaluate public-ness). Re-running **#5 friends.sql** later re-REVOKES that anon grant —
  re-run #24 afterward to restore signed-out reads of public profile posts. Profile-post photos reuse
  the existing **entry-photo** storage bucket (no new bucket). **Until this runs, profile-posts code
  loads but every read/write fails.**
- [ ] **25. autosync-default-on.sql** — make community device auto-count ON by default: flips
  `communities.allow_device_autosync` column DEFAULT to true and backfills existing rows that are
  null OR false to true (the old false was the wrong default, not a deliberate opt-out). The owner
  opt-OUT is preserved (client reads `allow_device_autosync !== false`; Settings can set it false).
  Idempotent. *(after #21 community-device-autosync — alters the same column)*. **Run this so THE
  BOYS' Steps (and every synced community rule) auto-fills instead of showing 0 with a manual + Log.**
- [ ] **26. post-first-feed.sql** — "one post, many feeds" (post-first composer, Phase 1: schema+RLS):
  `posts` (caption/photo/`activity` jsonb/`is_shared`) + `post_targets` (target_type profile|community,
  target_id, per-target points) + `post_likes`/`post_comments` (engagement on the POST → shared thread
  across every feed it appears in) + a nullable `community_entries.post_id` (links the per-rule scoring
  rows to their post; ON DELETE CASCADE so deleting a post removes its points; leaderboard sum
  unchanged). RLS: author-only write; a post is visible to the author, else only when SHARED and it has
  a target the viewer may see — a COMMUNITY target they're a member of, or a PROFILE target they may
  view (`can_view_profile`). ANON may read a shared post ONLY via a PUBLIC profile target (never a
  community target, never a private post) — `can_view_post` / `post_is_public_anon` helpers + read RPCs
  `get_posts_social` / `get_post_comments`. *(after #6 communities, #13 profile-view, #24 profile-posts
  — reuses is_community_member / can_view_profile / profile_is_public)*. Post photos reuse the existing
  **entry-photo** bucket. **Phases 2–4 (composer, read paths, delete) are app-only — no further SQL.**
- [ ] **27. compete-contests.sql** — Compete: generalized **contests** (Phase 2 = TEAM battles; Phase 3
  adds tournaments). Three tables — `contests` (community_id, creator_user, format team|tournament, metric,
  scoring_mode total|avg_active, start_at/end_at, status pending/active/done), `contest_teams`
  (contest_id, name, color), `contest_participants` (contest_id, user_id, team_id, seed, eliminated;
  unique per contest+user) — + `can_read_contest`/`can_manage_contest` SECURITY DEFINER helpers + RLS.
  RLS: any **member** of the contest's community reads it; the **creator** starts it (as themselves); the
  **creator or community owner** manages/cancels (teams + participants follow the same gate; an inserted
  participant must be a community member). Scores are NOT stored — team totals compute in the app from
  `community_entries` over the window. anon (null auth.uid()) is denied by every policy. Idempotent.
  *(after #6 communities + #23 challenges — reuses is_community_member / is_community_owner)*. 1v1 duels
  keep using `challenges`; the Compete hub shows both. **Until this runs, team contests can't be created/read.**
- [ ] **28. compete-tournaments.sql** — Compete Phase 3: single-elimination **tournament** matches.
  `contest_matches` (contest_id, round, slot, a_user/b_user, a_score/b_score, winner_user, window_start/end,
  status pending|active|done; unique per contest+round+slot) + RLS reusing the **#27** helpers — any
  community member reads (`can_read_contest`), the contest creator or community owner manages
  (`can_manage_contest`); anon denied. Each round has its own window; when a round's clock ends the app
  computes both scores from `community_entries` and persists the winner here, then advances. Idempotent.
  *(after #27 compete-contests — needs `contests` + can_read_contest/can_manage_contest)*. **Until this runs,
  tournaments can't be created/read.**

## Edge functions (deploy separately, not via SQL editor)
- `supabase functions deploy generate-rules` — AI rule generation (onboarding + Build).
  **Redeploy needed** for the "Yesterday, recapped" daily card: a new additive `mode:"recap"`
  branch returns a short prose recap (`{recap}`). Until redeployed, the client composes the recap
  locally (graceful fallback) — no errors, just no LLM phrasing. Deployed slug is `bright-api`.
- `supabase functions deploy wearables` — Fitbit/Whoop sync.
- `supabase functions deploy parse-log` — natural-language quick log *(if/when added)*.
- Each needs its LLM/provider secret set in Supabase project settings.

## Notes
- Storage buckets needed: **avatars** (profile pictures, public), an entry-photo bucket for
  post images, and **world-media** (world covers/icons, PRIVATE — created by world-media.sql)
  — confirm all exist with correct policies.
- When you add a new `.sql` file, append it here in dependency order with an unchecked box.
