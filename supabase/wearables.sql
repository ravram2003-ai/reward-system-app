-- Pointwell — Wearables (Fitbit + Whoop) live sync, data layer.
--
-- This migration backs the `wearables` Edge Function (supabase/functions/wearables).
-- It stores each user's OAuth tokens and the latest synced metric snapshot.
--
-- SECURITY MODEL
--   * These tables hold OAuth access/refresh tokens. They must NEVER be readable by
--     the browser. Both tables have RLS ENABLED with NO policies, so the anon and
--     authenticated roles get ZERO access. Only the Edge Function — which uses the
--     service_role key (server-side only) — can read or write them, because
--     service_role bypasses RLS.
--   * The browser never queries these tables directly. It only calls the Edge
--     Function endpoints (authorize / callback / sync / status / disconnect), and
--     the function returns only safe data (status + numeric metrics, never tokens).
--
-- Idempotent: safe to re-run. Run this in the Supabase SQL Editor.

-- ── Connections: one row per (user, provider) holding tokens + last snapshot ──
create table if not exists public.wearable_connections (
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider        text not null check (provider in ('google-health', 'whoop')),
  access_token    text,
  refresh_token   text,
  token_type      text,
  scope           text,
  expires_at      timestamptz,
  last_synced_at  timestamptz,
  last_metrics    jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ── Short-lived OAuth handshake state (CSRF state + PKCE verifier) ────────────
-- Rows are created at "authorize" and deleted at "callback". The function also
-- prunes anything older than 15 minutes on each authorize call.
create table if not exists public.wearable_oauth_states (
  state         text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('google-health', 'whoop')),
  code_verifier text,
  redirect_uri  text,
  created_at    timestamptz not null default now()
);

create index if not exists wearable_oauth_states_user_idx
  on public.wearable_oauth_states (user_id);
create index if not exists wearable_oauth_states_created_idx
  on public.wearable_oauth_states (created_at);

-- ── Lock both tables down completely to client roles ─────────────────────────
-- RLS on + no policies = anon/authenticated cannot select/insert/update/delete.
-- The Edge Function's service_role connection bypasses RLS and is the only writer.
alter table public.wearable_connections  enable row level security;
alter table public.wearable_oauth_states enable row level security;

-- Defensively revoke any inherited table grants from the API roles.
revoke all on public.wearable_connections  from anon, authenticated;
revoke all on public.wearable_oauth_states from anon, authenticated;

-- keep updated_at fresh on connections
create or replace function public.wearables_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wearable_connections_touch on public.wearable_connections;
create trigger wearable_connections_touch
  before update on public.wearable_connections
  for each row execute function public.wearables_touch_updated_at();

-- ── VERIFY ───────────────────────────────────────────────────────────────────
-- After running, confirm RLS is on and there are no client policies:
--
--   select relname, relrowsecurity
--   from pg_class
--   where relname in ('wearable_connections', 'wearable_oauth_states');
--   -- relrowsecurity should be true for both.
--
--   select tablename, count(*) as policy_count
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('wearable_connections', 'wearable_oauth_states')
--   group by tablename;
--   -- expect 0 rows (no policies) → fully locked to client roles, function-only.
