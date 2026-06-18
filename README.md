# Reward System App

Pointwell is a static prototype for building personalized goal reward systems. Users can define scoring rules, log daily activity, see daily point totals, copy public systems, and explore accountability community ideas.

## Project Type

This is a static HTML/CSS/JavaScript app. It is not React, Vite, Next.js, or another framework.

The app source lives in:

```text
outputs/
```

The helper scripts and local tests live in:

```text
work/
```

## Requirements

- Node.js 18 or newer
- npm, included with Node.js
- A modern browser

There are no runtime dependencies and no required environment variables.

## Install

```bash
npm install
```

This project currently has no external dependencies, but running install is harmless and keeps the workflow familiar across computers.

## Run Locally

```bash
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

You can also open the prototype directly from:

```text
outputs/index.html
```

## Test

```bash
npm test
```

This runs JavaScript syntax checks and the lightweight scoring tests.

## Supabase setup (auth + positive signals)

Accounts and the member-to-member **positive signals** feature (kudos / motivation +
in-app notifications) use Supabase. Frontend config lives in
`outputs/supabase-config.js` and uses **only the anon/public key** — never the
service-role key. All security is enforced by Row Level Security in the database.

The signals feature needs a one-time schema migration. In the Supabase dashboard
open **SQL Editor** and run the contents of:

```text
supabase/signals.sql
```

It is idempotent (safe to re-run). It adds the opt-in + behind columns to
`profiles`, creates the `signals` table, and installs the RLS policies, the
consent gate (`is_member_nudgeable`), the daily rate-limit, and realtime. A
`-- VERIFY` block at the bottom shows how to confirm each rule.

### Direct messaging (free text)

For the member-to-member messaging feature (free text + block + report), run
`supabase/messaging.sql` **after** `signals.sql` (also idempotent). It allows
`type='text'` on `signals`, adds the `blocks` and `reports` tables, and enforces —
in the database — the block (both directions), the per-hour message rate limit, and
the report rules.

There is no admin UI for reports. To review reported messages, run this in the
Supabase SQL editor (service role bypasses RLS):

```sql
select r.created_at, r.reason, r.reporter_user,
       s.from_user as reported_sender, s.to_user as reported_recipient,
       s.type as reported_type, s.body as reported_message
from public.reports r
left join public.signals s on s.id = r.reported_message_id
order by r.created_at desc;
```

## Build

No build step is required. The app is already served directly from the static files in `outputs/`.

## Environment Variables

No environment variables are used. There is no `.env.example` file because the app does not require any API keys or configuration secrets.

## Clone Onto Another Computer

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/reward-system-app.git
cd reward-system-app
npm install
npm start
```

Then open `http://127.0.0.1:4173`.
