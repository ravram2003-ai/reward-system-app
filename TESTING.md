# TESTING.md — 2-minute smoke test

Run this after every merge / before promoting to the live site. `npm test` only checks
syntax + a few units, so these manual checks catch the UI/runtime bugs that slip through.
Do it once at desktop width and once at ~390px (phone).

## Setup
- [ ] `npm test` passes and `node --check outputs/app.js` is clean.
- [ ] Migrations in `supabase/MIGRATIONS.md` are all applied to the env you're testing.

## Onboarding (reset `profiles.onboarding_completed = false` to re-trigger)
- [ ] New account sees the NEW flow: Welcome → Create profile → interests → AI picks
      (NOT the old "Build my own / Join a community" fork).
- [ ] Interests include popular + niche + "add your own"; AI picks generates a system.
- [ ] "Public systems to copy" and "Communities to join" are never empty (popular fallback).
- [ ] Skip works at every step; finishing lands on Today and only shows once.

## Core daily loop
- [ ] Today: context switcher lists Communities then Personal; switching works.
- [ ] "+" FAB opens log-an-entry (not a create-system sheet).
- [ ] Add Entry: fields render; submit button is at the BOTTOM and reads "Post <rule>".
- [ ] Logging an entry updates the score/standings and creates a feed post.

## Feed
- [ ] Friends tab shows friends'/community posts; like + comment work inline.
- [ ] Discover tab loads (may be empty if no eligible public posts — that's expected).
- [ ] Tapping a post author opens their profile.

## Profile
- [ ] Tapping someone in the feed/search opens their profile (public = full; private =
      locked "request to follow").
- [ ] Follower/following counts show; "you might like" + recent posts render.
- [ ] Tapping YOUR OWN avatar opens your public self-view with a Settings button
      (Follow/Message hidden); Settings opens the edit form; Back returns.

## Communities
- [ ] List shows active first, inactive collapsed behind a dropdown.
- [ ] Open a community → leaderboard/feed; Settings has a working Leave (member) / disabled
      (owner) option.

## Notifications
- [ ] Bell shows likes/comments on your posts + friend requests — NOT direct messages.
- [ ] Direct messages appear only in Chats (with the unread badge).

## Mobile (~390px) — overflow has bitten us repeatedly
- [ ] No element runs off the left/right edge; the "+ Add entry" bar isn't clipped at top.
- [ ] The notification dropdown stays within the viewport (text not cut off).
- [ ] Bottom nav + top-right cluster fit without overlap.

## Regressions to watch
- [ ] No feed card is leaking the Today/dashboard markup.
- [ ] Schedule blocks open their post on tap.
- [ ] Cache-bust tag was bumped so new app.js/styles.css actually load.
