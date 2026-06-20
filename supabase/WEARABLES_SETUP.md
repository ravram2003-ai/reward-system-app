# Wearables live sync — deploy guide (Google Health API → Fitbit)

Real **Fitbit** data reaches the web app through the **Google Health API** (Google's
replacement for the now-closed Fitbit Web API). It works for **you + up to 100 test
users you add by email** while the app stays in *Testing* mode — no App Store, no
public verification. Letting *anyone* connect later needs Google verification + a
paid health-data security assessment (a launch-stage step, not this).

## ✅ Already done (Google Cloud Console)

Set up under **jacobavram6@gmail.com** in project **`pointwell`**:
- Google Health API **enabled**
- OAuth consent screen: **External / Testing**, test user **jacobavram6@gmail.com**
- OAuth **Web** client created
  - **Client ID:** `807906791184-gvpp7jao35cbqvdm2slvtcco8aaj7n1f.apps.googleusercontent.com`
  - **Redirect URI:** `https://ravram2003-ai.github.io/reward-system-app/wearable-callback.html`
- Scopes (read-only): `googlehealth.activity_and_fitness.readonly`, `googlehealth.health_metrics_and_measurements.readonly`

## What's left — 3 steps

### 1. Get the Client Secret
Google Cloud Console → **APIs & Services / Google Auth Platform → Clients** → click the
Web client → copy the **Client Secret**. (Keep it private — it goes into Supabase, step 3.)

### 2. Create the database tables
Supabase dashboard → **SQL Editor** → paste & run
[`supabase/wearables.sql`](./wearables.sql). Idempotent; creates two RLS-locked token
tables only the connector can touch.

### 3. Deploy the connector + set secrets
With the [Supabase CLI](https://supabase.com/docs/guides/cli), from the repo root:

```bash
supabase login
supabase link --project-ref ejoccpqbozgzixrejlhd

supabase secrets set \
  GOOGLE_CLIENT_ID=807906791184-gvpp7jao35cbqvdm2slvtcco8aaj7n1f.apps.googleusercontent.com \
  GOOGLE_CLIENT_SECRET=<paste-the-secret-from-step-1>

supabase functions deploy wearables
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — don't set those.

> (Whoop is also supported by the same connector — set `WHOOP_CLIENT_ID` /
> `WHOOP_CLIENT_SECRET` too if you ever want it.)

## Try it

1. Deploy the app (merge this branch to `main` and push → GitHub Pages rebuilds), then
   open `https://ravram2003-ai.github.io/reward-system-app/` and **sign in**.
2. **Profile → Integrations → Connect** on **Google Health (Fitbit)**.
3. Approve on Google. You'll see a one-time **"Google hasn't verified this app"** notice
   (expected in Testing mode) → **Advanced → Go to Pointwell (unsafe) → Continue**.
4. Back in the app it flips to **Connected** and pulls your data. Add a rule with **Data
   source = Google Health (Fitbit)** and a **Synced metric** (Steps, Sleep hours, Resting
   heart rate, Active calories) to see today's real numbers. **Sync now** refreshes.

## Notes / limits

- ⏱️ Google warns a brand-new OAuth client can take **5 minutes to a few hours** to take
  effect — if the first connect errors, wait and retry.
- "Live" = your latest data **after your band syncs** to Fitbit/Google — current, not
  second-by-second.
- The Google Health API is new; if a metric reads 0 after a successful connect, the data
  may not have synced yet, or that data type's field mapping in
  `supabase/functions/wearables/index.ts` (`fetchGoogleHealth`) may need a small tweak —
  steps is the most reliable to verify first.
- Security: the browser never sees a token. The Edge Function holds the secret and does
  all OAuth + API calls; tokens live in the RLS-locked `wearable_connections` table.
