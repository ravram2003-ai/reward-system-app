Task: Stop finished worlds from breaking the Worlds grid. Use the widget rule: a tile's size never changes, only its content does. A finished world keeps its slot and becomes a recap, with a one-time celebration. Fix three small tile bugs in the same pass.

Reference (open it in a browser, tap through to finish a world, match it):
work/world-tile-fixed-height-reference.html

Read CLAUDE.md first. Create `fix/world-tile-fixed-height` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

WHY IT BREAKS NOW
styles.css (~13110–13116) makes tiles content-sized in both segments:
`.world-grid[data-worlds-segment=…] .worlds-page { grid-auto-rows: auto; align-items: start }` and `.worlds-tile { height: auto }`.
A finished world shrinks to one "✓ All done today" line, but its grid row stays as tall as the neighbour, which leaves a hole. Everything below drops.

WHAT EXISTS (reuse it)
- Pager and slots: `.worlds-page { grid-auto-rows: var(--worlds-row) }` (--worlds-row ~12387). Medium spans 1 row, large spans 2 (worldSlotCost). Pages are already built on fixed slots.
- Tile: renderWorldsTile(p) (~6164). The personal check-in list is `.wt-checkins` (sized to 3 rows + peek, "↓ N more"). worldsTileAction renders the "All done today" line.
- Logging: worldsTileLog, which already toasts "<world> complete for today 🎉". Flash: worldsFlashKey / `.is-flash` / @keyframes worldsFlash. Undo: the toast Undo from the multi-check-in work.
- Counts: worldCheckinCounts(t). Ring: renderWorldRing(t, size, counts) (~7071).
- Today's values: todayValuesForSystem(sys) / communityValuesForMember(id, "me", day). Amounts: checkinAmountsForRule. Ordering: buildCheckinItems / checkinRuleAffinity.
- Streaks: worldPersonalStreak(system) (personal), coachContextStreak(...) (community).
- Icons: svgIcon(name, cls); ICONS already has `edit`.

CHANGES
1. Fixed height (the fix).
   - Remove the content-sized override above. Tiles go back to fixed grid rows: medium = 1 row, large = 2 rows + gap.
   - Set --worlds-row PER SEGMENT, measured at 390px, not guessed:
     - Personal medium = header + 3 check-in rows + a ~24px peek + the "↓ N more" line + the Done footer.
     - Communities medium = header + mini leaderboard + "✓ next" + "+N more".
   - Every tile in a segment is exactly the same height.
   - Inside a tile: header and footer are flex: 0 0 auto, and the `.wt-checkins` list is flex: 1 1 auto; min-height: 0; overflow-y: auto. It fills whatever space is left instead of measuring 3 rows. Keep the fade mask, "↓ N more" / "↑ Back to top", touch-action pan-y, and scroll restore.
   - Nothing may ever overflow or clip outside the tile.
2. "Done" footer (personal, partly done). Under the list, one line: "Done" + chips of what's already logged today ("Water · 6 cups", "Stretched"), from today's values. One line only; extra chips are clipped and there's no wrap. Hidden when nothing is logged yet. This way a nearly-finished tile is never blank.
3. Finished state = recap, filling the same tile. It replaces the "✓ All done today" line, for personal tiles:
   - "✓ All done today" title, mint.
   - Chips of everything logged today (wrap allowed).
   - 🔥 "N-day streak" (worldPersonalStreak).
   - At the bottom, a "Tomorrow · Run · 5 km" line: the first rule the check-in would ask about, in buildCheckinItems' order but ignoring today's values, with its usual amount from checkinAmountsForRule. Yes/no rules show just the label.
   - The tile background shifts to the done tint (#0f1a15, border #2a5a45).
   - Community tiles keep their mini leaderboard. Their done line becomes "✓ You're done today" + the same Tomorrow line, all inside the fixed height.
   - Large tiles: the recap, then the existing sections below.
4. Celebration, once, at the moment the last check-in lands (not on later re-renders or page loads):
   - The ring animates to full.
   - The tile pulses once (reuse worldsFlash / .is-flash).
   - The recap fades up, and the existing "complete for today 🎉" toast shows.
   - Reduced motion: no animation, just the final state.
   - Undo from the toast reverses it, and the tile returns to its list.
5. Bug: ring track missing.
   - `.tile-personal .score-ring-bg { stroke: var(--inset) }` (~9673), and the tile-community equivalents, make the track invisible on tiles. Give `.world-ring.is-checkins .score-ring-bg` a visible track (≈ #26352e) on both tile types.
   - In renderWorldRing's counts branch, don't render the fill circle when the percentage is 0. The round linecap draws a stray dot (seen on "0/3").
6. Bug: the ⌨ "type an amount" glyph renders as a tiny dash. In checkinCardHtml's `qc-keyboard` button, swap the "⌨" text for svgIcon("edit", "icon-sm"). Keep its aria-label. This covers tiles, the community sheet and the world page.
7. Bug: amount copy.
   - "usually 1 blocks": formatMetricPhrase should singularize word units when the value is exactly 1 ("1 block", "1 session", "1 hr"). Leave compact units (g/kg/oz/lb) alone. Check that feed and post text still read right.
   - "usually 30 sessions" on "Study session": look at that rule's stored unit and goal. If a time goal got paired with a count unit (e.g. by the AI rule generator), tell me what you found and fix the mapping at the source. Don't silently rewrite my saved rules.
8. Unchanged: Arrange/edit mode, drag between pages, sizes, backgrounds, hide/undo, segment toggle, community "+N more" sheet.
9. CLAUDE.md, under Worlds, add: "Tiles are fixed height per size (widget rule): content adapts, the grid never reflows. A finished world keeps its slot and shows a recap (logged today, streak, tomorrow's first check-in) after a one-time celebration."
10. No SQL needed. Bump the cache-bust tag on app.js / styles.css.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- At 390px and on desktop:
  - All medium tiles in a segment are the same height.
  - Finishing a world leaves no hole and nothing moves.
  - The list scrolls inside the tile with "↓ N more".
  - The Done footer shows on partly-done tiles.
  - The last check-in plays the celebration once, then shows the recap with chips, streak and Tomorrow.
  - Toast Undo restores the list.
  - Reload: the recap shows with no animation.
  - Large tiles span exactly two rows.
  - Arrange drag still works.
  - Community tiles fit their content.
  - The 0/3 ring shows its grey track and no dot.
  - ✎ shows instead of the dash.
  - "1 block" is singular.
  - Report what you found on "Study session".
