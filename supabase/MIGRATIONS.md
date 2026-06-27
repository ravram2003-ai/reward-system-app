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
