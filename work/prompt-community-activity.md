# Two prompts — run in order, one branch each. Reference for both: work/community-activity-reference.html

---------------------------------------------------------------------------------------------------
PROMPT 1 — World "Activity" tab (members only): logs + messages/photos + likes/comments
---------------------------------------------------------------------------------------------------

Task: Inside a community world, the Feed tab becomes **Activity**. It holds everything: every member's logs (merged per person per day), plus messages, photos and notes, with likes and comments. Only members of that world can see any of it, and the database enforces that. Nothing in Activity appears in the main Feed. Sharing to the Feed is the next prompt; don't build it here.

Reference (open it, use screens 1–2, match them): work/community-activity-reference.html

Read CLAUDE.md first. Create `feat/community-activity` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

WHAT EXISTS (reuse it)
- supabase/post-first-feed.sql: posts / post_targets / post_likes / post_comments, with can_view_post(). A post whose ONLY target is a community is visible only to that community's members (+ its author), and never to anon. That IS Activity's privacy, so reuse it; don't invent a parallel table.
- signals.js: createPost, addPostTarget, fetchCommunityPosts, fetchPostById, likePost/unlikePost, getPostsSocial, addPostComment/getPostComments/deletePostComment, deletePost.
- feed-social.sql: legacy entry_likes / entry_comments on single community_entries rows (members only).
- Hub: COMMUNITY_HUB_TABS, applyCommunityHubTab, worldPostsPanel, renderCommunityComposer, renderCommunityFeedSort. Feed card helpers: renderFeedPost, buildFeedItemForPost, openPostOverlay. Photo upload/resize path → private entry-photos bucket. Finished community tile: worldsTileRecap (community branch).
- Quiet logging is deliberately independent of the posts table (an un-run migration once broke logging). Keep it that way.

DATABASE — new file `supabase/community-activity.sql`. It must be idempotent, additive, and must not edit existing .sql.
1. Add to `posts`:
   - `kind text not null default 'post'`, check in ('post', 'activity')
   - `activity_community uuid references communities(id) on delete cascade`
   - `activity_date date`
   - A unique partial index on (author_user, activity_community, activity_date) where kind = 'activity'. One "day anchor" per person, per world, per day.
2. `ensure_activity_post(p_community uuid, p_author uuid, p_date date) returns uuid` (SECURITY DEFINER, search_path public; revoke from public/anon; grant to authenticated):
   - The caller AND p_author must both be members of p_community (is_community_member).
   - p_author must have community_entries that day in that world, OR p_author = auth.uid().
   - It returns the existing anchor, or inserts one: author_user = p_author, kind 'activity', activity_community, activity_date, activity = a snapshot of that day's entries (so posts_has_content passes), plus ONE post_targets row (community, p_community). Make it race-safe (ON CONFLICT on the unique index).
   - Purpose: any member can like or comment on someone's bare-log day without that person ever creating a post.
3. A trigger on post_targets that rejects a 'profile' target for a post where kind = 'activity'. Anchors can never reach a profile or the Feed.
4. Anchors are never linked from community_entries.post_id. That FK cascades, and deleting an anchor must never delete points.
5. Storage: report the current read policy on the private entry-photos bucket. An Activity photo must be readable ONLY by members of that world (+ the author). If the policy is broader, tighten it here (e.g. a SECURITY DEFINER check that the object belongs to a post the caller can_view_post). List anything else that relies on the old behaviour.
6. Update supabase/MIGRATIONS.md and remind me to run it in the Supabase SQL editor. Until it's run, the Activity tab must still show logs (from community_entries), plus one clear notice: "Comments and photos need a database update". It must never fail silently.

APP
1. Tabs: rename the label "Feed" to **Activity** (keep the internal id "feed"). Order: Standings · Activity · Compete · Members. Under the tabs, one quiet line: "🔒 Only members of <world> can see this".
2. Message box at the top. Reuse or replace renderCommunityComposer; no second composer.
   - Placeholder "Say something to <world>". A Photo button (existing upload/resize path). An "Attach today's logs" toggle (default ON). Post.
   - It needs text or a photo; show an inline error otherwise.
   - ON → ensure_activity_post(world, me, today), then set/append the anchor's caption and photo_path (author update is already allowed).
   - OFF → a normal post with ONLY a community target for this world. Never a profile target from here.
   - It never changes points and never opens the + composer.
3. Stream (newest first, day headers):
   - One item per person per day: their logs as chips + points, plus the anchor's caption and photo if any.
   - Standalone messages are their own items.
   - Every item has a heart + count, a comment count, and an inline thread with an input.
   - The first like or comment on a day with no anchor calls ensure_activity_post first.
   - Batch the reads (getPostsSocial / getPostComments), and add a refresh after posting or commenting.
   - Legacy: fold that person-day's existing entry_likes / entry_comments into the item's counts and thread (read-only). New reactions go to the anchor. Don't migrate data.
   - Deleting: your own comment; the post author may delete comments on their item; your own message or photo (deletePost). Deleting an anchor never deletes entries.
4. Finished community tile (the empty space in worldsTileRecap, community branch):
   - Show the newest comment on your activity today (tap → that world's Activity).
   - Add a "Photo or note" button → Activity with the message box focused and attach ON.
   - It must stay within the fixed tile height.
5. Bell: likes and comments on your activity notify you (CLAUDE.md: bell = social activity about you). If post like/comment notifications are triggers on post_likes / post_comments, confirm they fire for anchors. Don't add DMs or Chats.
6. Main Feed / Discover / profile posts must NEVER show kind = 'activity' posts (filter them out wherever posts are read). The full Feed rules change in the next prompt.
7. Dark + 390px, tap targets ≥ 40px, `escapeHtml` on every caption, comment and name.
8. CLAUDE.md:
   - In the Worlds section, add: "World page tabs: Standings · Activity · Compete · Members. Activity = every member's logs merged per person per day + messages / photos / notes, with likes and comments. Members only (RLS). Logging never creates a post; the day 'anchor' post is created on demand (ensure_activity_post)."
   - Update the "Tiles are fixed height…" bullet: the finished community tile shows the newest comment + "Photo or note".
9. Bump the cache-bust tag.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- Flows:
  - Post with attach ON and OFF.
  - Photo upload.
  - Like and comment on someone else's bare-log day (creates the anchor).
  - Delete a comment and a message.
  - The tile shows the newest comment and "Photo or note".
  - The bell notifies.
  - Logging still works with the migration NOT yet run, and the notice shows.
- PRIVACY (actually test it):
  - As a user who is NOT in the world, and with the anon key: you can't read the anchor, the message posts, their likes/comments, or the photo object.
  - Leaving the world removes access straight away.
  - ensure_activity_post rejects non-members and non-member authors.
  - The trigger rejects a profile target on an activity post.
- Report the storage policy you found.


---------------------------------------------------------------------------------------------------
PROMPT 2 — Share to Feed + Feed = shared posts only
---------------------------------------------------------------------------------------------------

Task: The main Feed becomes deliberate posts only. You share from a world's Activity (or the finished tile) with "Share to Feed". A Feed post needs words and/or a photo; a bare log can never be shared. Sharing creates a NEW post with its own thread, so comments made inside the world never leak out.

Reference (screens 3–4): work/community-activity-reference.html

Read CLAUDE.md first. Create `feat/share-to-feed` from the latest commit, AFTER Prompt 1 is merged. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

DATABASE — new file `supabase/share-to-feed.sql`. It must be idempotent, additive, and must not edit existing .sql.
1. `posts.shared_from uuid references posts(id) on delete set null`, with a unique partial index on (author_user, shared_from) where shared_from is not null.
2. `share_to_feed(p_src uuid, p_caption text, p_photo_path text, p_snapshot jsonb) returns uuid` (SECURITY DEFINER; authenticated only):
   - The caller must be the author of p_src.
   - Require btrim(p_caption) <> '' OR p_photo_path is not null. A stat card alone is not a post.
   - Insert a NEW post: kind 'post', caption, photo_path, activity = p_src's items + p_snapshot (world name, check-ins %, streak, rank: the stat card data), shared_from = p_src. It gets exactly ONE target: profile (the author). No community target, so it doesn't duplicate inside Activity.
   - If this source was already shared, return the existing post.
3. Photos: an Activity photo is members-only. When you share it, copy the storage object to a new path for the Feed post (the client does the copy before calling the RPC) so the Activity original stays private. Confirm Feed viewers can load photos of posts they can see, the same way Feed photos load today.
4. Update MIGRATIONS.md and remind me to run it.

APP
1. "Share to Feed" on your own Activity items, plus "Share" on the finished community tile, opens a share sheet (reuse the post-overlay sheet pattern / existing post composer pieces). It's prefilled with:
   - The day's chips.
   - The caption from the activity text.
   - Your photo, OR an auto stat card. The card is rendered from the snapshot, not generated as an image. A toggle switches Stat card / Photo.
   - "Visible to: …" from your profile visibility: public → everyone + Discover; private → approved followers. No per-post audience picker.
2. Posting requires a caption or a real photo. Inline error: "Add a caption or a photo. A stat card alone isn't a post." The server enforces it too.
3. After sharing:
   - The Activity item shows "On Feed ✓" (tap → opens the Feed post via openPostOverlay).
   - No points change.
   - The Feed post has its own likes and comments; Activity comments are never copied.
4. Main Feed = shared posts only:
   - Friends = posts with a PROFILE target from people you follow + yourself. Remove community-target-based inclusion and bare-log activity lines/bundles from the main Feed.
   - Discover: unchanged (public profile targets), excluding kind = 'activity'.
   - Profile "Recent posts": unchanged, excluding anchors.
   - Empty Friends state: "Only shared posts show here. Share your day from any world's Activity."
5. The + composer: "Share as a post" becomes **"Also share to Feed"** (default OFF).
   - OFF + nothing added → quiet log exactly as now (no posts row).
   - OFF + photo/caption → it goes to the matched worlds' Activity (community targets only).
   - ON → requires a caption or photo; the post gets the profile target (+ its community targets as today). That's one public thread from the start, so its Activity item shows "On Feed · public" to make clear comments there are public.
6. CLAUDE.md:
   - Replace "Feed = Friends + Discover…" with: "Feed = deliberate shared posts only (a post needs a caption and/or photo; a bare log never reaches the Feed). Friends = shared posts from people you follow + you; Discover = public shared posts from accounts you don't follow (ranking unchanged)."
   - Replace "What counts as a post…" with: "Logs live in each world's Activity. A Feed post is a deliberate share (Share to Feed from Activity / the tile, or 'Also share to Feed' in the composer) with caption and/or photo; Share to Feed creates a new post with its own thread (Activity comments never leak). Profile 'Recent posts' = photo posts."
7. Bump the cache-bust tag.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- Flows:
  - A bare log can't be shared without a caption/photo (client AND server).
  - Share with a stat card + caption, then with a photo.
  - The Feed post appears in Friends for a follower and in Discover for a public profile.
  - The Activity item shows "On Feed ✓".
  - Sharing twice returns the same post.
  - No points change.
- Privacy:
  - Comments from Activity don't appear on the Feed post.
  - The Activity photo original is still members-only after sharing.
  - A private profile's shared post is visible only to approved followers.
- The main Feed no longer shows bare logs or community-only posts.
- The composer toggle behaves as described.
