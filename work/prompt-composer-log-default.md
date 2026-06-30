# Prompt for Codex — composer logs by default; post is opt-in; only matching worlds

Branch: continue on `feat/post-first-flow` (Phase 2 composer is in place). Anchors in
`outputs/app.js`: `openPostComposer` (~3909), `renderPostComposer` (~4150–4230), the composer
state default `isShared: true` (~3897), the share toggle handler (~4314), `publishPostComposer`
(~4361, already branches on `isShared` at ~4378/4420 for the counts-only path). Follow
`CLAUDE.md` (reuse existing functions, always-dark theme, security in RLS, additive idempotent
SQL only if needed, bump the cache-bust tag, mobile ~390px, end with a local link + smoke test).
Don't auto-commit.

## Three changes

### 1. Default to a LOG, not a post
- Change the composer default to **not shared**: `postComposer.isShared` should default to
  `false` (currently `true` at ~3897).
- In **log mode** (default): hide the Photo attach and the profile/feed framing. Show only the
  activity (parsed rules + amounts) and the **matched worlds where it counts**. Primary button
  reads **"Log · +N pts"** (not "Post"). `publishPostComposer` with `isShared === false` already
  writes the scoring entries and creates no `post_targets` — keep that; toast says **"Logged"**.
- A bare log needs no caption or photo. The "what did you do" AI input stays (it's the log
  parser); it just isn't a caption yet.

### 2. "Turn into a post" is opt-in and reveals caption + photo
- The share control (relabel it e.g. **"Share as a post"**) is **OFF by default**. Turning it ON
  switches to **post mode**:
  - reveal the **Photo attach** and a **caption field** (the "what did you do" text becomes the
    editable caption — exactly like any other post),
  - enable the **Your profile** target and feed posting to the selected worlds,
  - primary button becomes **"Post to N · +N pts"**.
- Turning it back OFF hides the photo/caption and returns to log mode.
- A post created here must look and behave like every other post (same caption + photo + activity
  tag), so it's consistent across feeds.

### 3. Destinations = only worlds that have the matched rule
- In `renderPostComposer`'s destinations list, show **only worlds whose rules match the entered
  activity** (e.g. only worlds that contain a **Steps** rule when you logged steps). **Remove the
  "no match · tap to also post" rows** for worlds with no matching rule — right now it lists every
  world you're in (hi, j, Work on App, Run build…), which is noise.
- Log mode: show only matching worlds, pre-toggled ON (you can toggle which ones count). You can't
  count in a world that doesn't have the rule, so non-matching worlds never appear here.
- Post mode: matching worlds pre-on, **plus** a single explicit **"+ Post to another world"**
  picker/dropdown for the rare pure-social share to a non-matching world. Do not list all worlds
  inline by default.

## Acceptance / smoke test (report pass/fail)
1. Open the composer and enter "8000 steps": only worlds containing a Steps rule appear (no
   "no match" rows); the default state is **log** (share OFF), button reads "Log · +N", no
   photo/caption shown; submitting counts in the toggled worlds with **no feed post**; toast
   "Logged"; reload persists.
2. Toggle "Share as a post" ON: the Photo attach + caption field appear, the Your-profile target
   appears, the button becomes "Post to N · +N pts"; publishing posts to the selected worlds'
   feeds + your profile with the caption/photo — like a normal post.
3. In log mode the destinations never list worlds without a matching rule; in post mode, adding a
   non-matching world is only possible via the explicit "+ Post to another world" picker.
4. Toggle back to log mode → photo/caption hidden, no `post_targets` written on submit.
5. `npm test` and `node --check outputs/app.js` pass.

## Wrap up
- Bump the cache-bust tag on `app.js`/`index.html`/`styles.css`.
- Start the local preview (`npm start`) and give me the clickable local URL.
- Run the `TESTING.md` smoke test + the 5 checks above; report what you checked and pass/fail.
