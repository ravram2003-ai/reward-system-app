# Wearables live sync (Fitbit + Whoop) — setup

This connects your **real** Fitbit and WHOOP data to Pointwell over the web — no App
Store, no native app. It works for **your own account immediately** (developer mode);
letting other people connect later needs Fitbit's/WHOOP's app review.

There are 4 one-time steps. Steps 1–2 give you the client IDs/secrets; steps 3–4
put the secure connector on your Supabase project. Everything in the app code is
already written — these steps just supply the credentials and deploy the connector.

**Your two redirect URLs** (used in every step below):

| Where | Redirect / Callback URL |
|-------|--------------------------|
| Local testing | `http://127.0.0.1:4173/wearable-callback.html` |
| Live (GitHub Pages) | `https://ravram2003-ai.github.io/reward-system-app/wearable-callback.html` |

Register **both** at each provider if the field allows multiple; otherwise register
the one you're testing with and add the other when you go live.

---

## 1. Register a Fitbit app  → Client ID (+ secret)

1. Go to <https://dev.fitbit.com/apps/new> (sign in with your Fitbit account).
2. Fill in name/description/website (any valid values).
3. **OAuth 2.0 Application Type:** `Personal` — this lets you read your own
   intraday data right away.
4. **Redirect URL / Callback URL:** paste the callback URL(s) from the table above.
5. **Default Access Type:** `Read-Only`.
6. Agree to terms and register.
7. Copy the **OAuth 2.0 Client ID** and **Client Secret**.

## 2. Register a WHOOP app  → Client ID + Client Secret

1. Go to <https://developer.whoop.com/> and sign in (needs a WHOOP membership).
2. Create a team if prompted, then **Create New App**.
3. **Redirect URIs:** add the callback URL(s) from the table above.
4. **Scopes:** enable `read:recovery`, `read:sleep`, `read:cycles`,
   `read:workout`, `read:profile`, and `offline` (offline is required to keep the
   sync working without re-logging in).
5. Save, then copy the **Client ID** and **Client Secret**.

## 3. Create the database tables

In the Supabase dashboard → **SQL Editor**, paste and run the contents of
[`supabase/wearables.sql`](./wearables.sql). It's idempotent (safe to re-run) and
creates two RLS-locked tables that only the connector can touch.

## 4. Deploy the connector (Edge Function) + set the secrets

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from the repo
root:

```bash
supabase login
supabase link --project-ref ejoccpqbozgzixrejlhd

# Store the credentials from steps 1–2 as function secrets (never in the repo):
supabase secrets set \
  FITBIT_CLIENT_ID=xxxx \
  FITBIT_CLIENT_SECRET=xxxx \
  WHOOP_CLIENT_ID=xxxx \
  WHOOP_CLIENT_SECRET=xxxx

# Deploy the function:
supabase functions deploy wearables
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected by
the platform automatically — you do **not** set those.

> The connector only allows redirects back to `localhost`, `127.0.0.1`, and
> `*.github.io` by default. To allow another host, set
> `WEARABLE_ALLOWED_REDIRECTS` (comma-separated) as an extra secret.

---

## Try it

1. Run the app (`npm start`) or open the live Pages URL, and **sign in** (the
   connector needs your account — it stores tokens per user).
2. Go to **Profile → Integrations**, click **Connect** on Fitbit or Whoop.
3. You'll be sent to Fitbit/WHOOP to approve read-only access, then bounced back.
   The card flips to **Connected** and pulls your data.
4. Add a rule whose **Data source** is Fitbit or Whoop and pick a **Synced metric**
   (e.g. Fitbit → Steps, Whoop → Recovery %). Today's value fills in from your real
   data, and the **Sync now** button on the integration card refreshes it.

## How it stays secure

- The browser never sees a token. It only calls the Edge Function, which holds the
  secrets and does the OAuth exchange + all provider API calls server-side.
- Tokens live in `wearable_connections`, an RLS-locked table with **no** client
  policies — only the function's service-role connection can read/write it.
- **Disconnect** deletes the stored tokens for that provider.

## Notes / limits

- "Live" = your latest data **after your band syncs** to the Fitbit/WHOOP phone app
  — it's current, not second-by-second.
- In developer mode this works for **your** account. Public multi-user access needs
  each provider's app-review process (a launch-time step).
- WHOOP exposes recovery/sleep/strain/HRV; Fitbit exposes steps/sleep/resting
  HR/calories/active minutes/distance. The rule "Synced metric" dropdown lists what
  each device provides.
