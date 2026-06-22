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
