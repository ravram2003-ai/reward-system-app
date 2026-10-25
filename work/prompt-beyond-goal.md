Task: More effort = more points, and the tile shows it. A logged counter (study hours, miles, minutes) must stay addable from the Worlds tile. Show its progress against the goal, the points it has earned, and what the next point takes. No caps: don't add any. Rules that already have a maxDailyPoints keep it.

Reference (open it in a browser, tap the + buttons, match it):
work/beyond-goal-reference.html

Read CLAUDE.md first. Create `feat/beyond-goal` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

WHAT EXISTS (reuse it — no new scoring)
- scoring.js calculateRule(rule, value) already rewards past the goal for simpleStyle "every" (points per everyAmount) and "both" (that + goalPoints at dailyTarget). "goal" pays only at dailyTarget. extraThresholds and maxDailyPoints are applied there too. Use calculateRule for EVERY number shown; never re-implement scoring in the UI.
- Logging more: quickLogRule(ruleId, amount, system) / quickLogCommunityRule(community, ruleId, amount) STACK a new entry on today's total (that's why buildCheckinItems deliberately stops re-asking a logged counter). An "add more" tap is just another quiet log of the increment. checkinTypedAmount validates a typed amount against the per-entry range.
- Today's totals: todayValuesForSystem(sys) / communityValuesForMember(id, "me", day).
- Tile: renderWorldsTile, the `.wt-checkins` list (fixed-height tile, scrolls inside), the Done footer, the finished-world recap. Community "+N more" sheet with logged rows + Undo. Toast Undo via deleteQuickEntry / deleteCommunityEntry.

CHANGES
1. One shared "progress row" renderer, used by both the personal tile list and the community sheet. It's for a counter rule (not yes/no, not penalty) with today's value > 0:
   - Top line: label · "+<points>", where points = calculateRule(rule, value).rewardPoints.
   - Bar: fill up to dailyTarget in mint, the part past dailyTarget in amber (#e0c27f), and a small white goal tick. Scale = max(2 × target, value × 1.1).
   - Sub line: "2 hrs · goal 1.5" (singular units via formatMetricPhrase).
   - Hint. Take the smallest candidate value above today's total that raises calculateRule's rewardPoints. Candidates: dailyTarget if not reached, the next everyAmount multiple, any extraThreshold above it.
     - Below goal: "0.5 hrs to goal → +2".
     - Past goal: "Beyond goal · next pt at 2.5 hrs" (amber).
     - No candidate earns more: "Goal met. More won't add points". If a rule's own maxDailyPoints is hit: "Daily max reached".
   - Buttons: "+<step>", "+<2×step>" and ✎ (svgIcon "edit": type any amount to ADD). step = everyAmount for every/both rules, otherwise the rule's input step. Each tap is one quiet log of that increment, with a toast ("Study session · 2.5 hrs · +1 pts") and Undo. No composer.
   - Device-synced rules with manual logging off: show the bar, points and "⟳ synced", with no buttons.
2. Personal tile list (inside the fixed-height tile, scrolls):
   - The pending check-in rows first, unchanged.
   - Then a small "LOGGED · ADD MORE" label.
   - Then progress rows for logged counters, and compact "✓ Stretched +1" lines for logged yes/no rules.
   - This replaces the one-line Done footer (remove it so nothing is shown twice).
3. Recap (finished world): each counter chip shows "+<points>" and a + button that adds one step. The chip gets an amber border when it's past its goal. "Done" never means locked.
4. Tile header stat (personal): under "N left today" / "Complete today", add "<points> pts today". When any rule is past its goal, add "+<beyond> beyond goal" in amber.
   - points = the tile's existing today points (myPoints).
   - beyond = Σ over counters of calculateRule(v).rewardPoints − calculateRule(min(v, dailyTarget)).rewardPoints.
   - The ring is unchanged: it still counts check-ins done/total, never points.
5. Community "+N more" sheet: logged rows become the same progress row, with Undo kept. The community tile itself is unchanged; its rank/leaderboard update live as before.
6. Out of scope: rule styles, the AI rule generator, caps, the world page "Your day" rows. If Your day can reuse the progress row with a trivial change, tell me; don't do it.
7. Dark + mobile: rows must fit ~165px tiles at 390px. Tap targets ≥ 32px inside tiles (≥ 40px in the sheet). Amber passes contrast on near-black.
8. CLAUDE.md, under Worlds, add: "Counters can go past their goal: logged counters stay on the tile as progress rows (goal tick, amber past goal, points, next-point hint, + buttons; quiet logs). No caps unless a rule sets maxDailyPoints."
9. No SQL needed. Bump the cache-bust tag on app.js / styles.css.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- At 390px:
  - Log Study session, and it moves to a progress row with correct points.
  - +0.5 adds an entry, and the points and leaderboard/score update.
  - Past the goal, the bar turns amber and the header shows "+N beyond goal".
  - The hint matches calculateRule for every / both / goal-only rules.
  - ✎ adds a typed amount, and an invalid amount shows the error.
  - Undo removes just that increment.
  - The finished recap's + adds more.
  - The community sheet shows progress rows.
  - Nothing opens the composer.
  - The ring still counts check-ins.
  - Fixed tile height holds, with no clipping.
