-- Pointwell — Positive Signals between community members (Kudos + Motivation).
-- Run ONCE in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- KEY SAFETY: this is server-side schema + Row Level Security. The frontend ships
-- only the anon/public key. Security is enforced by the RLS policies below — NOT by
-- hiding keys. The anon key lets anyone call the database directly, so every rule
-- (who can read, who can insert, the motivation consent gate, the daily rate limit)
-- lives here in Postgres, not just in the UI.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. profiles table (created here if it doesn't already exist) + auto-create a
--    profile row on sign-up + backfill existing accounts. Everything below
--    assumes public.profiles exists. Safe to re-run.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  handle       text,
  created_at   timestamptz not null default now()
);

-- Create a profile row automatically whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill rows for accounts that already existed before this table (e.g. yours).
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
on conflict (id) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Profile columns: the per-user opt-in + a self-reported "currently behind".
--    The recipient's own client computes "behind" with the single definition in
--    outputs/insight.js (a real weekly average exists AND today < 0.7 * average)
--    and writes the boolean here. No score is ever stored or exposed.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists allow_motivation_when_behind boolean not null default false;
alter table public.profiles
  add column if not exists is_behind boolean not null default false;
alter table public.profiles
  add column if not exists behind_updated_at timestamptz;

-- Profiles RLS: a user may read & update ONLY their own row.
alter table public.profiles enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Self-insert: harmless if profile rows are created by a sign-up trigger; required
-- if they're created client-side. Either way a user can only insert their OWN row.
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

-- Stamp behind_updated_at SERVER-SIDE whenever is_behind is set true, so the
-- "currently behind" freshness can't be forged with a client timestamp.
create or replace function public.profiles_stamp_behind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_behind then
    new.behind_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_stamp_behind_trg on public.profiles;
create trigger profiles_stamp_behind_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_stamp_behind();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. is_member_nudgeable(target): the ONLY thing a sender may learn about another
--    member — a single boolean (opted-in AND currently behind AND fresh). It never
--    exposes scores or raw "behind" status. SECURITY DEFINER so it can read the
--    target's own flags without granting senders read access to other profiles.
--    A user who has NOT opted in always returns false (never shown as nudgeable).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.is_member_nudgeable(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.allow_motivation_when_behind
       and p.is_behind
       and p.behind_updated_at is not null
       and p.behind_updated_at > (now() - interval '6 hours')
    from public.profiles p
    where p.id = target
  ), false);
$$;

revoke all on function public.is_member_nudgeable(uuid) from public;
grant execute on function public.is_member_nudgeable(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. signals table.
--    from_name is a denormalized sender label so the inbox can say "Maya sent
--    you kudos" WITHOUT granting cross-profile reads — only the recipient can read
--    the row (RLS below), so it stays private.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.signals (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users(id) on delete cascade,
  to_user      uuid not null references auth.users(id) on delete cascade,
  community_id text,
  type         text not null check (type in ('kudos','motivation')),
  body         text not null check (char_length(body) between 1 and 280),
  from_name    text,
  created_at   timestamptz not null default now(),
  read         boolean not null default false,
  -- rule (e): rate-limit key — one of each type per recipient per UTC day.
  created_date date generated always as ((created_at at time zone 'UTC')::date) stored,
  -- rule (d): no signaling yourself.
  constraint signals_no_self check (from_user <> to_user)
);

-- rule (e): the same sender may send at most one of each type to the same
-- recipient per day. Enforced by a UNIQUE index, not the UI.
create unique index if not exists signals_one_per_type_per_day
  on public.signals (from_user, to_user, type, created_date);

-- fast inbox reads (newest first).
create index if not exists signals_inbox_idx
  on public.signals (to_user, created_at desc);

alter table public.signals enable row level security;

-- rule (a) + (c): you can SELECT only signals addressed to you; never anyone else's.
drop policy if exists "signals read own inbox" on public.signals;
create policy "signals read own inbox" on public.signals
  for select using (auth.uid() = to_user);

-- rule (b) + (d) + (f): you can INSERT only as yourself, not to yourself, and a
-- 'motivation' insert is allowed only when the recipient is nudgeable (opted-in
-- AND currently behind) — validated HERE at insert time, not only in the UI.
drop policy if exists "signals insert as self" on public.signals;
create policy "signals insert as self" on public.signals
  for insert with check (
    auth.uid() = from_user
    and from_user <> to_user
    and (
      type = 'kudos'
      or (type = 'motivation' and public.is_member_nudgeable(to_user))
    )
  );

-- recipient may UPDATE only their own received rows (used for mark-as-read).
drop policy if exists "signals recipient update" on public.signals;
create policy "signals recipient update" on public.signals
  for update using (auth.uid() = to_user) with check (auth.uid() = to_user);

-- Harden the update: the recipient may change ONLY the `read` flag, nothing else.
create or replace function public.signals_lock_columns()
returns trigger
language plpgsql
as $$
begin
  if new.from_user    is distinct from old.from_user
     or new.to_user   is distinct from old.to_user
     or new.community_id is distinct from old.community_id
     or new.type      is distinct from old.type
     or new.body      is distinct from old.body
     or new.from_name is distinct from old.from_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the read flag may be updated on a signal';
  end if;
  return new;
end;
$$;

drop trigger if exists signals_lock_columns_trg on public.signals;
create trigger signals_lock_columns_trg
  before update on public.signals
  for each row execute function public.signals_lock_columns();

-- Force server-controlled values on INSERT so a direct anon-key/PostgREST call
-- can't bypass the rules:
--   * created_at := now()  → an attacker can't spoof the date to dodge the
--     per-day rate-limit unique index (rule e), or poison inbox ordering.
--   * read := false        → can't pre-mark a signal as read.
--   * from_name            → forced to the sender's real profile name when they
--     have one (prevents impersonation); falls back to the supplied label only
--     when the sender has no display_name on file.
create or replace function public.signals_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.created_at := now();
  new.read := false;
  new.from_name := coalesce(
    (select display_name from public.profiles where id = new.from_user),
    new.from_name
  );
  return new;
end;
$$;

drop trigger if exists signals_before_insert_trg on public.signals;
create trigger signals_before_insert_trg
  before insert on public.signals
  for each row execute function public.signals_before_insert();

-- (No DELETE policy is created → deletes are denied for everyone via RLS.)

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Realtime: let the inbox receive live inserts/updates. RLS still applies, so a
--    subscriber only receives rows where they are the recipient.
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'signals'
  ) then
    alter publication supabase_realtime add table public.signals;
  end if;
end $$;

-- Carry full row data on UPDATE/DELETE so realtime filtering on to_user works for
-- mark-as-read events (RLS still limits each subscriber to their own rows).
alter table public.signals replica identity full;

-- ───────────────────────────────────────────────────────────────────────────
-- NOTE on the nudgeable bit: any authenticated user who already knows a target's
-- user id can call is_member_nudgeable(target) and learn ONE boolean (opted-in
-- AND currently behind). This is intended — the affordance presence IS that bit —
-- and it's only ever true for users who opted in (default OFF). Communities are
-- not modeled in the DB in this prototype, so the function can't be scoped to
-- shared-community membership; if/when communities move server-side, add that.
--
-- VERIFY (optional). Run as two real accounts, or simulate a peer with service
-- role in the SQL editor. Replace the UUIDs with real auth.users ids. Note
-- created_at / read / from_name are forced server-side, so don't bother sending
-- them — they're overridden.
--   -- A sends kudos to B  → succeeds
--   insert into public.signals (from_user, to_user, type, body)
--     values ('<A>', '<B>', 'kudos', 'Proud of you');
--   -- A sends a 2nd kudos to B same day → blocked by signals_one_per_type_per_day
--   --    (even if you pass a different created_at — the trigger forces now()).
--   -- A signals themselves → blocked by signals_no_self
--   -- A sends motivation to B while B is NOT opted-in/behind → blocked by RLS (f)
--   -- Make B nudgeable (the trigger stamps behind_updated_at = now() for you):
--   update public.profiles set allow_motivation_when_behind = true, is_behind = true
--     where id = '<B>';
--   -- Now A sends motivation to B → succeeds.
--   -- Seed a received signal so it shows in YOUR inbox immediately (from_name will
--   -- become the peer's profile display_name if they have one):
--   insert into public.signals (from_user, to_user, type, body)
--     values ('<peer>', '<you>', 'kudos', 'Keep it up');
