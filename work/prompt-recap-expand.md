Task: A finished world never locks. On the recap, tapping a chip opens it in place into the full progress row, with quick adds, a typed amount, and today's entries with ✕ to fix mistakes. The existing "+" keeps adding one step instantly.

Reference (open it in a browser, tap chips / + / ✎ / ✕, match it):
work/recap-expand-reference.html

Read CLAUDE.md first. Create `feat/recap-expand` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

WHAT EXISTS (reuse it; no new row renderer, no new delete logic)
- worldsTileRecap(t, counts, community, key) → worldsLoggedChips(c, key): one chip per logged rule. Counter chips carry `.wt-chip-add` (data-wt-add = one step).
- worldsProgressRowHtml(world, rule, value, { key, tail }): THE progress row (bar + goal tick + amber past goal, points, hint, +step / +2×step, ✎ via data-wt-addtype). `tail` = extra markup under it.
- worldsTodayEntriesFor(world, ruleId): today's entries for a rule, viaSource excluded. The community sheet already deletes a bare quiet log through the `data-wt-undo-entry` / `data-wt-kind` handler (deleteQuickEntry / deleteCommunityEntry). Posts (postId / photoPath / message) are never deleted here: they show "posted" and keep their own delete flow in the feed.

CHANGES
1. Chips become two-line, and expandable (personal recap):
   - Each chip = [chip body button: name on line 1, amount on line 2] + points + the existing "+" button. These are SIBLING buttons, never nested.
   - Two lines fix the cut-off "Study session · 10 sessi…". Keep the existing rule that drops a label that only repeats the unit ("12,110 steps").
   - Tapping the chip body toggles it open/closed (aria-expanded). It works like an accordion: one open chip per tile, and opening another closes the first. Escape closes.
   - The open state lives in memory, keyed by tile key → rule id. It must survive the grid re-renders that follow every log/async save, so the open chip stays open after an add. Reset it on reload or segment switch.
   - Yes/no chips aren't expandable. Synced-only rules expand but show "⟳ synced", with no buttons and no ✕.
2. Expanded content = worldsProgressRowHtml(...) rendered directly under the chip (joined visually: open chip border mint, panel attached below), with `tail` = an entries list:
   - One line per entry from worldsTodayEntriesFor: time (from createdAt, "h:mm AM") · amount (formatMetricPhrase, singular units).
   - Bare quiet logs get a ✕ (≥ 28px, aria-label "Delete 40 min logged at 6:15 PM") that deletes THAT entry by id through the existing undo-entry path. Generalize it from "last" to "any id"; don't write a new delete.
   - Posts show "posted" with no ✕.
   - Device-synced contribution: a "⟳ synced" line with no ✕.
3. After a delete: show a toast "Removed 40 min from Lifting" with Undo, where Undo re-logs the same amount through the quiet path.
   - If that was the rule's ONLY entry, the check-in reopens. The tile leaves the recap and goes back to its list, and the toast says "… · check-in reopened".
   - No celebration replays when it's completed again the same day.
4. Fixed-height tile:
   - The recap's chip area becomes the flex: 1 / min-height: 0 / overflow-y: auto region, with the same fade and scroll restore as the list.
   - Title, header, streak and Tomorrow stay pinned.
   - An expanded chip scrolls into view if it's cut off. Nothing clips outside the tile.
5. Community sheet: give its counter progress rows the same entries tail (✕ per bare entry, "posted" for posts), replacing the single "Undo last". Personal and community then fix mistakes the same way.
6. Edit mode: chips don't expand and "+" is hidden (drag owns the tile).
7. Investigate and report (don't fix silently): my "Lifestyle baseline" showed "123,110 steps · +24" today. Tell me whether that's one manual entry (a typo; the new ✕ fixes it), several entries, or a device sync being counted on top of manual logs. If it's a sync double count, describe the cause and stop; that's its own fix.
8. CLAUDE.md, in the "Tiles are fixed height…" bullet, add: "Recap chips expand in place (tap) into the progress row: + / ✎ to add, today's entries with ✕ (bare logs only; posts keep their feed delete). Deleting the only entry reopens the check-in."
9. No SQL needed. Bump the cache-bust tag on app.js / styles.css.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- At 390px, on a finished personal world:
  - "+" on a closed chip adds one step and doesn't expand it.
  - Tapping a chip expands it; tapping another switches; Escape closes.
  - +step / ✎ add, and the chip stays open after the re-render.
  - ✎ with 0 shows the error.
  - ✕ deletes exactly that entry, and points/ring/leaderboard update. Toast Undo restores it.
  - Deleting the only entry reopens the check-in, with no second celebration.
  - Posted entries show "posted" with no ✕.
  - The tile height never changes and the expanded area scrolls inside the tile.
  - Edit mode disables expanding.
  - The community sheet rows show the entries list.
- Plus the 123,110-steps finding.
