# Pointwell — Ideas & Backlog

A running list of future ideas. Not yet built.

## Subcommunities (nested communities)

**Idea:** Let a community contain more specialized subcommunities, so a large
organization can have focused groups inside it.

**Example:** A "University of Michigan" community that requires a `@umich.edu`
email to join. Inside it are subcommunities like Lifting, Studying, Running,
etc. Members of the parent can browse and join the subcommunities relevant to
them.

**Key pieces to design later:**
- **Parent ↔ child structure:** a community can have a `parent_community_id`;
  subcommunities belong to one parent. (Likely just one level deep to start.)
- **Domain-gated joining:** parent communities can require a verified email
  domain (e.g. `umich.edu`) to join — verify the user's email domain server-side
  before allowing membership.
- **Membership rules:** must you be in the parent to join a subcommunity?
  (Probably yes — parent membership gates the children.)
- **Discovery/UX:** opening the parent community shows its subcommunities (with
  member counts / activity), each joinable like a normal community.
- **Leaderboards/feeds:** each subcommunity has its own leaderboard + feed; the
  parent could optionally show an aggregate or a "top across subcommunities" view.
- **Reuse existing model:** subcommunities are still just communities (a shared
  system + members), so most of the current community code applies — the new
  parts are the parent link, the domain gate, and the nested browse UI.

**Why it's good:** turns big real-world orgs (schools, companies, gyms, clubs)
into a home with focused accountability groups inside — strong for growth and
retention.

## Adaptive coach nudges (personalized motivation per user)

**Idea:** When you open a community (and elsewhere), the AI Coach picks the ONE
nudge framing that would motivate *you* most, based on your past behavior — not a
generic message. e.g. "you're behind your usual," vs "Jacob has 12, you have 4,"
vs "your streak ends tonight," vs "4 of THE BOYS already logged."

**Why it's feasible:** the coach already records which nudge types you act on vs.
dismiss (`coachLearnRecord` → `byType` / `byRule` in `coachLearning`). So it
already has the signal to know whether you respond to competition, streaks,
social FOMO, or encouragement.

**Key pieces to design later:**
- **Per-user motivator profile:** from `coachLearning.byType`, rank which nudge
  framings this user acts on most; weight recent behavior.
- **Context-aware selection:** on entering a community, compute the candidate
  nudges (behind-usual, friend-overtook, group-momentum, streak-at-risk, almost-
  there) and choose the one whose *type* this user responds to best AND that's
  true right now.
- **Stay in the Coach channel** (global FAB peek + thread), one nudge, throttled
  — just smarter about *which* one.
- **Cold start:** before there's enough history, rotate / default to streak-at-
  risk + social, then adapt as the user reacts.

**Why it's good:** makes the coach feel like it actually knows you — personalized
motivation is far stickier than a fixed nudge, and it leans on data already
collected.

## Head-to-head challenges (in a community)

**Idea:** Challenge another community member to a time-boxed, 1v1 duel — most
points wins over a window (Today / 3 days / 1 week). Reuses existing points: a
challenge is just a 2-person leaderboard over a date range.

**Flow:** invite (pick member + window) → other person accepts → a LIVE duel
screen (both racing progress bars, scores, countdown, who's ahead) → win moment
(celebration, a "challenge win" badge, share / rematch).

**Key pieces to design later:**
- **Data:** a `challenges` row (creator, opponent, community_id, metric/"points",
  start, end, status: pending/active/done, winner). Scores computed from existing
  community_entries over the window — no new scoring.
- **Accept/decline:** challenge is sent → opponent accepts to start the clock.
- **Live duel screen:** both avatars + racing bars + countdown + "you're up by X."
- **Nudges (reuse the coach):** "Jacob challenged you," "you're down by 2, 4 hrs
  left," "you won 🏆." Ties directly into the nudge system.
- **Win moment:** celebration + a win-count badge; optional friendly forfeit
  (loser posts an embarrassing pic) for stakes WITHOUT a coin economy.
- **Scope:** 1v1 first; group challenges later. Keep it friendly/optional so it
  motivates rather than discourages less-active members.

**Why it's good:** directly amplifies Pointwell's competition-with-friends hook,
creates real urgency + personal stakes (drives daily logging), is naturally viral
(challenging a friend pulls them in), and reuses points + nudges + leaderboard.

## Coins / currency — PARKED (probably skip for now)

**Idea (raised, deferred):** an earnable coin currency (from streaks/challenge
wins) you could spend or wager.

**Why parked:** points already ARE the currency — a second one muddles the model,
adds an economy to balance, and risks a dead feature if there's no meaningful
sink. If pursued later: scope it tiny (cosmetics only — cover frames, badges,
themes; no purchasing; zero core-loop impact). Better near-term alternative for
"stakes": challenge FORFEITS / bragging rights, which give the fun for free.
