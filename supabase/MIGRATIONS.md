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

## Edge functions (deploy separately, not via SQL editor)
- `supabase functions deploy generate-rules` — AI rule generation (onboarding + Build).
- `supabase functions deploy wearables` — Fitbit/Whoop sync.
- `supabase functions deploy parse-log` — natural-language quick log *(if/when added)*.
- Each needs its LLM/provider secret set in Supabase project settings.

## Notes
- Storage buckets needed: **avatars** (profile pictures, public), an entry-photo bucket for
  post images, and **world-media** (world covers/icons, PRIVATE — created by world-media.sql)
  — confirm all exist with correct policies.
- When you add a new `.sql` file, append it here in dependency order with an unchecked box.
