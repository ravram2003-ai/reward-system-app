Task: Log EVERY check-in from the Worlds home tiles, not just the next one.
Personal tiles = an in-tile scrolling list (3 visible + peek, scroll for more).
Community tiles = keep the mini leaderboard + "✓ next" button, add "+N more" → a bottom sheet with all check-ins.
Also fix the tile ring (it shows decimal points like "5.5/7.5" that overflow and look half-empty when the world is complete).

Reference (open it in a browser and match it — layout, copy, behaviour):
work/tile-multi-checkin-reference.html
(Personal segment = Option A tiles, Communities segment = Option B tiles + sheet. Tap everything: lead buttons, ⌄, ⌨, Skip/No, "↓ N more", "+N more", inline Undo, toast Undo.)

Read CLAUDE.md first and follow it. One feature, one branch: create `feat/tile-multi-checkin` from the latest commit of the Personal/Communities work. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

WHAT EXISTS (reuse it — don't build a second check-in renderer)
- Pager tiles: renderWorldsTile(p). Today's single action = worldsTileAction(t, key) → worldsTileLog(key, ruleId, amount) → checkinLog(world, ruleId, amount) → quickLogRule / quickLogCommunityRule (the quiet path: no composer, no post prompt).
- Full check-in rows already exist: checkinCardHtml(world, { compact }) + wireQuickCheckin(host, world): qc-chip amounts, ⌄ qc-more, ⌨ qc-type (validated by checkinTypedAmount), Skip/No via skipCheckinRule, Yes, and the narrow @container variant (qc-lead + ⌄) for ~165px tiles.
- Counts: worldCheckinCounts(t) → { total, done, left, ask }. worldsSegmentSummary uses it for the hero + segment badges.
- Ring: renderWorldRing(t, size) labels myPoints/target — the bug.
- Bottom sheet pattern: openWorldBgPicker → .post-overlay-backdrop / .post-overlay-sheet / .post-overlay-bar / .post-overlay-grab / .post-overlay-close / .post-overlay-scroll.
- Toast with action: showToast(msg, { label: "Undo", onClick }).
- Deleting an entry: deleteQuickEntry(entryId) (personal), deleteCommunityEntry(entryId, toastMsg) (community).

CHANGES
1. Ring = check-ins, not points (pager tiles only; leave legacy renderWorldTile alone).
   - Label `${done}/${total}`, fill = done/total, from worldCheckinCounts. Points stay in the leaderboard and the world detail (one tap away).
   - A rule skipped today ("not today") drops out of today's total in worldCheckinCounts, so a skip never leaves the ring stuck short. Ring, "N left", segment badge and hero must all agree.

2. Personal tiles → Option A (in-tile list).
   - Replace the single ✓ button with all of today's rows from checkinCardHtml(world, { compact: true }), inside a `.wt-checkins` scroll container. In the tile, show the rows only (hide qc-head, intro and foot).
   - Height: 3 full rows + ~24px peek of the 4th. Measure the 4th row's offsetTop after render; no fixed px. Bottom fade mask while there's more below.
   - Under the list: "↓ N more" (N = rows not fully visible) scrolls down one viewport. At the end it becomes "↑ Back to top". Hidden when everything fits.
   - Medium = the list. Large = the same list, up to 5 rows visible, then the existing sections.
   - A logged or skipped row slides out (~170ms; instant with reduced motion). When nothing is left, show the existing "✓ All done today".
   - Every log shows a toast via showToast(..., { label: "Undo" }). Undo deletes that entry through deleteQuickEntry / deleteCommunityEntry. If the quiet path doesn't hand back the new entry id, make the smallest change so it does. Never write a new delete.

3. Community tiles → Option B (sheet).
   - Keep the header, mini leaderboard (worldMiniLbBody) and the existing ✓ next button (worldsTileAction).
   - When left > 1, add a "+N more" button under it. It opens a sheet built on the post-overlay pattern.
   - Sheet title: "Log for <WORLD>". Subtitle: "<left> left · #<rank> · <gap>", where gap is "1 pt behind Jacob" / "2 pts ahead of Mom" / "tied with X". Use the same member points as worldMyRank. It updates live as you log.
   - Sheet body: every check-in as full (non-compact) qc rows: 3 chips with the usual one highlighted, plus ⌨, Yes/No and Skip.
   - Rules already logged today stay in the list as "✓ Cardio · 25 min  +1.5  Undo". Skipped ones show "– not today  Undo". Derive both from the same today-values worldCheckinCounts reads.
   - Close with Done, a backdrop tap, Escape, or hardware Back (match openWorldBgPicker's Back behaviour). Focus returns to "+N more".
   - Re-render the open sheet whenever renderWorldGrid re-renders (the async saves), so it never shows stale counts.
   - A large community tile gets the same thing, with the full leaderboard module below.

4. wireQuickCheckin: add an optional re-render callback. Its Skip handler currently calls renderQuickCheckin(world), which only redraws the detail card. The tile list and the sheet pass their own callback. The world detail page must behave exactly as before.

5. Interaction safety.
   - Taps in the list or sheet never open the world (stopPropagation, as now). The header stays the only open target.
   - List CSS: overflow-y auto, overscroll-behavior-y contain, touch-action pan-y, so horizontal pager swipes still work.
   - Keep each tile's list scrollTop across renderWorldGrid re-renders (map by tile key).
   - In edit mode the list is inert (pointer-events none) so drag still works, and "+N more" is hidden.

6. Mobile + dark.
   - Test at 390px. Tiles are ~165–175px wide, so the rows rely on the existing narrow @container variant.
   - Tap targets ≥ 40px. No horizontal overflow.
   - Sheet max-height ~82vh, with the bottom safe-area inset.
   - Reuse the existing qc-* / post-overlay-* classes and dark tokens. No new light colours.

7. CLAUDE.md: replace "every tile's one action is '✓ next check-in' (quiet log, no composer)" with: "Personal tiles list every check-in (3 visible, scroll for more); community tiles keep their mini leaderboard with '✓ next check-in' + '+N more' → a sheet of every check-in. All quiet logs, no composer. Tile rings show check-ins done/total, never points."

8. No SQL / migration needed. Bump the cache tag on app.js + styles.css (currently 20261024-pc1).

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- At 390px, Personal:
  - The ring reads like "2/6" and never overflows.
  - A world with 5+ check-ins shows 3 rows + a peek, and "↓ N more" works.
  - Lead tap logs and the row slides out. ⌄ shows other amounts. ⌨ validates (0 → "Enter an amount").
  - Skip/No removes the row and shrinks the total.
  - Toast Undo restores the row, the ring and the points.
  - The list keeps its scroll position after a log.
  - Swiping the pager still changes pages. Edit mode still drags.
- Communities:
  - "✓ next" logs, and the rank toast fires on a climb.
  - "+N more" opens the sheet with the right count and gap line.
  - Logging in the sheet turns the row into ✓ with Undo, and the tile's ring and leaderboard update behind the sheet.
  - Backdrop, Escape and Back each close the sheet.
- Nothing opens the composer or a post prompt. The world detail page check-in still works unchanged.
