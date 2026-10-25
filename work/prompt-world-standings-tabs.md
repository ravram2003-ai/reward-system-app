# Two prompts. Run them one at a time (one feature per branch, per CLAUDE.md).

Reference for both: work/world-standings-tabs-reference.html (open it in a browser; flip "4 members / Just you").

---------------------------------------------------------------------------------------------------
PROMPT 1 — Worlds first in the nav (small)
---------------------------------------------------------------------------------------------------

Task: Make Worlds the first bottom tab and the screen the app opens on. Feed moves to second.

Read CLAUDE.md first. Create `feat/worlds-first-nav` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

Today the code contradicts CLAUDE.md ("Worlds = the home screen"):
- index.html `.nav-tabs`: Feed is first and has the `active` class.
- app.js seed state `activeView: "feed"` (~line 156), and the invalid-view fallback `state.activeView = "feed"` (~line 3906).

Change:
1. Nav order: Worlds · Feed · (+) · People · Profile. Move the Worlds button before Feed and move `active` to Worlds. The center "+" stays centered.
2. Default view = "dashboard" (Worlds): in the seed state, in the invalid-view fallback, and on a fresh app load. A cold start always lands on Worlds, even if Feed was the last view saved. In-session navigation and hardware Back stay exactly as they are.
3. Check anything that depends on tab order or index: the animated nav icons/indicator, keyboard order, and any `nav-tab:nth-child` CSS. Leave every link that goes to Feed on purpose alone (the Coach "view feed", notifications, etc.).
4. CLAUDE.md: change the navigation line to "bottom tabs = **Worlds · Feed · (+ log) · People · Profile**".
5. Bump the cache-bust tag on app.js / styles.css / index.html includes.

Verify: npm test + node --check outputs/app.js. Then npm start, give me the local URL, and run the TESTING.md smoke test. Also check, at 390px:
- A fresh load opens on Worlds, even with Feed saved as the last view.
- The tab order is right and the nav animation still works.
- "+" is still centered and toggles closed.
- Back still steps through screens.
Report pass/fail for each.

---------------------------------------------------------------------------------------------------
PROMPT 2 — World page: Standings first (tabs)
---------------------------------------------------------------------------------------------------

Task: Inside a community world, lead with the competition. Tabs become **Standings · Feed · Compete · Members**, Standings is the default, and About moves to an ⓘ in the header. Polish Standings so it answers "where do I stand and where am I heading?"

Read CLAUDE.md first. Create `feat/world-standings-tab` from the latest commit. If there are uncommitted changes, stop and ask me. Don't commit or push unless I ask.

Reference: work/world-standings-tabs-reference.html. Match its layout, copy and behaviour.

WHAT EXISTS (reuse it; no new views or duplicated logic)
- Tabs: COMMUNITY_HUB_TABS (feed, leaderboard, members, compete, about), activeCommunityHubTab() (defaults to "feed"), renderCommunityHubTabs(), applyCommunityHubTab(analytics).
  - The "leaderboard" tab already shows communityLeaderboardPanel + worldTrendsPanel + communityYourDayPanel.
- Chips: renderWorldChips(world). The community branch shows members / group today / streak, and the labels get clipped ("GROUP TO…").
- Leaderboard:
  - renderCommunityLeaderboard(standings, metric, id): you-centred window + "Show all".
  - renderWorldLbRow (rows already tap through to the profile; keep that).
  - communityStandings(community, periodId, metric).
  - COMMUNITY_PERIODS: daily / weekly / monthly / all, labelled "Daily · Weekly · Monthly · All-time"; "All-ti" gets clipped.
- Trends: worldTrendsPanel is a collapsed "See trends & breakdown" toggle around communityAnalytics (renderCommunityAnalytics, COMMUNITY_TREND_DAYS = 14). It's gated by analytics.modules.groupTrends / individualTrends.
- Posting from the community composer sets communityHubTab = "feed" (~line 11741). Keep that.

CHANGES
1. Tabs and default.
   - Order: Standings · Feed · Compete · Members. Keep the internal ids (leaderboard / feed / compete / members) so saved state still works. Only the label "Leaderboard" becomes "Standings".
   - Remove About from the tab bar. Add an ⓘ icon button to the world header next to the existing ⋯. It opens the existing About panel (renderCommunityAbout / communityAboutPanel). While About is showing, no tab is selected; tapping any tab goes back.
   - Opening a world (from a tile, People, search…) always starts on Standings. Deep links that point at a post or comment still open Feed, and so does posting from the composer.
   - Four tabs must fit at 360–390px with no clipping.
2. Tab bar extras.
   - Feed badge: the number of posts in this world newer than the last time you opened its Feed tab. Track last-seen per world in client state; it's not sensitive. Opening Feed clears it, and over 9 shows "9+".
   - Compete: a small dot when a contest you're in is live. Use the data renderCompeteHub already loads.
   - The tab bar sticks under the app header while the page scrolls (position: sticky, opaque dark background, safe-area aware).
3. Chips are about you (community branch of renderWorldChips):
   - Rank "#1" with the label "of 4".
   - Points with the label "pts this week".
   - Streak with the label "day streak".
   - Tapping rank goes to Standings; tapping points scrolls to Your week.
   - Solo world: rank shows "—" with the label "solo".
4. Standings tab, top to bottom:
   a. Period pills, 4 equal: **Today · Week · Month · All**. Change only the pill labels; COMMUNITY_PERIODS ids and the `since` copy stay.
   b. The existing leaderboard, plus:
      - A ▲/▼ movement arrow per row (rank change vs the previous window: yesterday for Today, last week for Week, last month for Month, none for All). Get the previous window from communityStandings. If it can't take an offset, add an optional window/offset parameter to it; don't fork it.
      - A 🔥streak next to the name when > 0.
      - Under the list, a gap line: "1.5 pts ahead of Jacob · 1 day left" / "3 pts behind Jacob" / "Tied with Jacob". Days left only for Week.
   c. "Your week" card, always visible, built from the same data renderCommunityAnalytics uses:
      - Your points per day for the last 7 days as bars (today dimmer), with the group average as a dashed line.
      - Legend.
      - 3 stats: "on pace" (week so far ÷ days elapsed × 7, rounded), "vs last week" (± that projection vs last week's total) and the most consistent rule ("Lifting 4/7 days").
      - The existing communityAnalytics content moves behind a "Full breakdown ▾" toggle at the bottom of this card. The content itself is unchanged.
      - Still gated by analytics.modules.
   d. Your day (communityYourDayPanel), unchanged, at the bottom.
5. Empty states.
   - Solo world: the leaderboard becomes an invite card ("Invite someone to start a race" + the existing invite flow).
   - Your week shows only your bars, with "Group average appears when someone joins".
   - Fewer than 2 days of data: "Trends show up after a couple of days of logging."
6. Dark + mobile.
   - Reuse the existing segmented, chip and leaderboard classes and the dark tokens.
   - The chart uses the existing mint, with amber (#e0c27f) for the group line; check contrast on near-black.
   - No horizontal overflow at 390px. Tap targets ≥ 40px.
7. Personal worlds keep their current layout (hideCommunityHubChrome); this change is community-only.
8. CLAUDE.md: add under Worlds: "World page (community): tabs Standings (default) · Feed · Compete · Members; About under the header ⓘ. Standings = Today/Week/Month/All leaderboard with movement + gap line, Your week (you vs group avg, pace), then Your day."
9. No SQL / migration needed: everything comes from entries members can already read. Bump the cache-bust tag.

VERIFY (report pass/fail for each)
- npm test and node --check outputs/app.js, both clean.
- npm start, then give me the local URL.
- Smoke test from TESTING.md.
- At 390px, in THE BOYS:
  - It opens on Standings, and all 4 tabs and all 4 pills fit with no clipping.
  - The chips read "#1 of 4 · 8 pts this week · 2 day streak" style.
  - Switching pills updates rows, arrows and the gap line.
  - A row tap opens that profile.
  - Your week renders and "Full breakdown" opens the old analytics.
  - Your day still logs.
  - The Feed badge counts new posts and clears when Feed is opened.
  - The Compete dot shows during a live contest.
  - ⓘ opens About and a tab tap returns.
  - The tab bar stays stuck while scrolling.
  - Posting from the composer still lands on Feed.
  - A solo world shows the invite card.
  - Personal worlds are unchanged.
