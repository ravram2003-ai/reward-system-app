# Prompt for Claude Code — Pointwell visual refresh

Copy everything below the line into Claude Code.

---

Do a full visual/UX refresh of the Pointwell app (static HTML/CSS/JS in `outputs/`). Follow CLAUDE.md house rules strictly (work on a branch, reuse existing code, dark-only theme, bump cache tags, mobile at 390px, `npm test` + `node --check outputs/app.js`, end with local link + smoke test). Reference mockups in `work/design-refresh/`: `after-today.png`, `after-detail.png`, `after-desktop.png`, `after-profile.png`, and `mockup.html` (open with `?p=today|detail|desktop|profile`) — match their direction, not necessarily pixel-for-pixel.

## 1. One color identity (highest priority)
Teal (`--accent`) is the ONLY data/progress color. Remove every purple/violet hardcoded color from world tiles, stat chips, streak card, progress bars, and week-trend charts — replace with the teal token ladder. Purple may survive only inside user-uploaded cover images. Key metric numbers render in `--accent-bright`, WHOOP-style.

## 2. Typography
- Actually load Inter (self-hosted woff2 in `outputs/`, `@font-face` with `font-display: swap`) — it's declared in `font-family` but never loaded.
- Add `font-variant-numeric: tabular-nums` to all scores, counters, stats.
- Add type-scale tokens (`--t-xs` … `--t-xl`) and sweep the worst font-size inconsistencies onto them.

## 3. One SVG icon set
Replace ALL emoji and text-glyph icons (⌂ ☰ ◎, 🔥, 👟 etc.) with inline stroke SVGs matching the existing header icons (1.8 stroke, round caps — Lucide/Feather style). Includes nav tabs, streak flame, rule icons, tile icons, and any JS-rendered emoji. Emoji render inconsistently across platforms.

## 4. Floating buttons
- The "+" FAB is the only floating action. Move the AI coach sparkle out of its floating bottom-left spot (into the header cluster or quick-log input).
- Add `padding-bottom: calc(96px + env(safe-area-inset-bottom))` to scroll containers so FAB/tabbar never cover content (checkboxes, "New" tile, empty states).

## 5. Radius + header consistency
- Radius tokens: `--r-sm/md/lg/full`; apply consistently.
- One page-header pattern (title left, actions right, same size) across Today/Feed/Profile. Build keeps its big hero as the one intentional exception.

## 6. Desktop layout
- Fill the sidebar's dead space with modules: streak, today's schedule mini-checklist, mini leaderboard (see `after-desktop.png`).
- Main column `max-width: ~860px`, centered. On desktop the hero world card lays out schedule + week trend side by side.

## 7. Mobile profile form
Sticky bottom Cancel/Save bar (blurred, bordered top) instead of the broken header Save button. See `after-profile.png`.

## 8. Numbers & copy
- Format: "3,400 / 10,000", never "0/10000". Name the unit once ("pts").
- Streak: "5 days to your 7-day milestone" + 7 day-dots labeled F S S M T W T; today's dot outlined in teal.
- Replace the permanent "tap = open · hold = move & resize" hint with an "Edit layout" pill button (long-press still works).

## 9. Empty states
Every empty state gets one line of copy + one CTA button (Feed → "Find friends"; Recent posts → "Log with a photo" opening the composer with photo mode on). No bare dashed boxes.

## 10. Add Entry
Hide "ATTACHED FROM YOUR LOG" and "COUNTS TOWARD" sections until they have content.

## 11. Power features (small)
Desktop keyboard shortcuts: `1–4` tabs, `n` new entry, `/` or `⌘K` opens the AI quick-log as a global command palette (reuse the existing quick-log parser). Show subtle kbd hints on desktop Today.

## Creative license
Where you see opportunities to make it more beautiful, take them — you have taste, use it. Ideas welcome (not required): subtle micro-interactions (progress bars animating on load, ring fill easing, log-button success tick), a soft teal glow on "hot" trend bars, hover lift on cards, skeleton shimmer while data loads, a satisfying streak-milestone moment, tasteful gradients on tile covers, better visual rhythm/spacing anywhere it feels cramped or uneven. Constraints: stay dark, stay teal, no new fonts beyond Inter, no layout thrash of flows described in CLAUDE.md product decisions, keep everything fast (CSS transitions, no heavy JS animation libs), respect `prefers-reduced-motion`.

## Verify
Screenshot-level self-review at 390px and 1440px for: Today, world detail, Feed, Build, Profile, Add Entry. No purple remnants, no emoji icons, no FAB overlapping content, no viewport overflow. Then the CLAUDE.md rule-9 smoke test + local link.
