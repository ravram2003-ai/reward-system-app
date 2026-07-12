# AGENTS.md — house rules for working on Pointwell

Read this before making changes. These are standing rules so prompts don't have to
repeat them and the app stays consistent.

## What this project is
- **Pointwell** — a static **HTML / CSS / JS** app. No framework, no build step.
- App source lives in `outputs/` (`index.html`, `app.js`, `styles.css`, plus helpers).
- Local tests/scripts live in `work/`. Backend is **Supabase** (Postgres + RLS + edge
  functions in `supabase/functions/`). SQL migrations live in `supabase/*.sql`.

## Engineering rules (apply to every change)
1. **Reuse existing code.** Don't rebuild views or flows or duplicate logic. Find the
   existing function/component and reuse it. Match the existing style (IIFE module,
   `render*` functions, template strings, `escapeHtml` on all user content).
2. **Always-dark theme.** Reuse existing CSS classes. Any hardcoded light color needs a
   dark-mode override (see the dark block in `styles.css`). Verify contrast on a
   near-black surface. The app is always dark — never assume a light background.
3. **Security lives in the database.** Every visibility/permission rule is enforced in
   Supabase **RLS / SECURITY DEFINER**, never only in the client. The anon key must not
   be able to read private data. Don't gate sensitive data in JS alone.
4. **SQL is additive.** New database objects go in a **new** `supabase/*.sql` file that
   is **idempotent** (safe to re-run) and **never modifies existing .sql**. After adding
   one, update `supabase/MIGRATIONS.md`, and remind the user it must be run in the
   Supabase SQL editor (and any storage bucket created) — code that references a
   not-yet-run migration will load but every action fails.
5. **Bump the cache-bust tag.** When changing `app.js` / `index.html` / `styles.css`,
   bump the version/cache tag on the script/style includes so the new files actually
   load for users.
6. **Mobile matters.** Test at ~390px width. Avoid viewport overflow (use `max-width`,
   `calc(100vw - …)`, safe-area insets). Several past bugs were mobile overflow.
7. **Keep diffs focused.** One feature/fix per branch. Remove dead code and leftover
   references. Don't auto-commit or push unless asked. Work on a branch.
8. **Always verify.** Run `npm test` and `node --check outputs/app.js`; fix all errors.
   `npm test` only checks syntax + a few units, so also sanity-check the actual flow.
9. **Always end with a local link + smoke test.** After every change, start the local
   preview (`npm start`, which runs `node work/serve-app.cjs`) and give me the clickable
   local URL it prints (e.g. `http://localhost:<port>`). Then run the smoke test in
   `TESTING.md` — plus the specific flow you just changed — and report what you checked
   and pass/fail. Never finish a task without (a) the local link and (b) smoke-test
   results. If the server is already running, just re-share the link.

## Product decisions (keep consistent with these — don't reintroduce removed things)
- **Navigation:** bottom tabs = **Today · Feed · Communities · Build**. Top-right header
  cluster = **Alerts (bell) · Friends · Chats · Profile avatar**, each with its own
  badge. The center **"+" FAB logs an entry only** (creating systems/communities lives in
  the Build tab).
- **A community = a shared reward system + members.** Inviting people turns a personal
  system into a community. Build creates and edits both.
- **Profile visibility = request-to-follow.** Public profiles are open: feed, communities,
  systems, and follower/following counts are visible, and anyone can follow instantly.
  Private profiles are **fully locked** (only name/avatar + "Request to follow") until the
  owner approves. Follower/following counts may show on both.
- **Own profile** opens the public self-view ("what others see") with a **Settings**
  button top-right (→ the Profile & privacy edit form). Follow/Message are hidden on your
  own profile.
- **Feed = Friends + Discover.** Friends = people you follow/are friends with + your
  communities. Discover = recent **public** posts from accounts you do NOT follow, ranked
  by overlap with your tracked categories. (Onboarding suggestions fall back to popular
  when nothing matches; the main Discover feed stays strict.)
- **Bell vs Chats:** the bell is for social activity ABOUT you (likes, comments, friend
  requests/accepts, kudos). **Direct messages go to Chats only — never the bell.**
- **Add Entry:** the submit button sits at the **bottom** of the form and reads
  **"Post <rule>"**. Entries can include an optional photo + caption.
- **What counts as a post / where text posts appear:** A post needs a photo OR a caption. Profile
  "Recent posts" shows PHOTO posts only. The Feed and community feeds show photo + caption text
  posts; a bare log (no photo, no caption) is activity — it updates points and shows as a compact
  activity line, not a full post.
- **Onboarding (4 steps, shown once via `profiles.onboarding_completed`):** Welcome →
  Create profile (name, photo, public/private) → interests (popular + niche + add-your-own
  + level + how-you-stay-on-track) → AI picks (a generated personal system + public
  systems to copy + communities to join). **The old "Build my own / Join a community"
  fork is removed — do not bring it back.** To re-test, reset `onboarding_completed`.
- **"Default daily target" was removed** — targets are per system/community now.

## Ideas / backlog
Future ideas (not yet built) are tracked in `IDEAS.md` (e.g. subcommunities). Add new
ones there.
