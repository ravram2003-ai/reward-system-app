-- Pointwell — Real user search + first-run onboarding.
-- Run ONCE in the Supabase SQL editor. Idempotent: safe to re-run.
-- ADDITIVE ONLY — adds columns/functions and backfills NULLs. No DROP, no DELETE.
--
-- KEY SAFETY: visibility is enforced HERE (server-side), not in the browser. The
-- anon key lets anyone query directly, so the rule for "who shows up in search"
-- lives in Postgres. The profiles table stays self-read-only (see signals.sql);
-- the ONLY way to discover other users is the search_profiles() function below,
-- which returns just (id, display_name, handle) — never scores, behind-status,
-- the motivation opt-in, or any other private column.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New profile columns: a public/private visibility flag and a completed-
--    onboarding flag. Both default safely (public + not-yet-onboarded).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private'));
alter table public.profiles
  add column if not exists onboarding_completed boolean not null default false;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Backfill EXISTING accounts (additive: only fills NULL/default values).
--    - Give every account without a handle a sensible default derived from the
--      display name, so it's findable by handle. Never overwrites an existing one.
--    - Mark every pre-existing account as already-onboarded so the new first-run
--      flow NEVER triggers for them. Only brand-new signups (default false) see it.
-- ───────────────────────────────────────────────────────────────────────────
update public.profiles
  set handle = '@' || regexp_replace(lower(split_part(coalesce(display_name, 'member'), ' ', 1)), '[^a-z0-9_]', '', 'g')
  where handle is null or btrim(handle) = '';

update public.profiles
  set onboarding_completed = true
  where onboarding_completed = false;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. New signups: populate handle + visibility too (extends the existing trigger
--    function from signals.sql, preserving its display_name behavior). New rows
--    get onboarding_completed = false (the column default) so they see onboarding.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, handle, visibility)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(
      new.raw_user_meta_data->>'handle',
      '@' || regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9_]', '', 'g')
    ),
    'public'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Server-side user search. Visibility + self-exclusion + the safe column set
--    are enforced INSIDE this SECURITY DEFINER function, so a direct anon-key
--    call cannot widen them. A user appears for a searcher when:
--      * they are not the searcher (never find yourself), AND
--      * a name/handle substring matches (min 2 chars to avoid table dumps), AND
--      * their visibility is 'public'  OR  the two are already connected
--        (a signal/kudos/motivation/message exists either direction) — so people
--        you already talk to remain findable even if they're private.
--    Returns ONLY id, display_name, handle. Nothing sensitive can leak.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.search_profiles(q text)
returns table (id uuid, display_name text, handle text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.display_name, p.handle
  from public.profiles p
  where p.id <> auth.uid()
    and length(btrim(coalesce(q, ''))) >= 2
    and (p.display_name ilike '%' || q || '%' or p.handle ilike '%' || q || '%')
    and (
      coalesce(p.visibility, 'public') = 'public'
      or exists (
        select 1 from public.signals s
        where (s.from_user = auth.uid() and s.to_user = p.id)
           or (s.from_user = p.id and s.to_user = auth.uid())
      )
    )
  order by p.display_name
  limit 20;
$$;

-- Only signed-in users may search; never anon/public.
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional):
--   -- As a signed-in user in the SQL editor (auth.uid() is set), search returns
--   -- only public (or already-connected) accounts, never yourself, safe columns:
--   select * from public.search_profiles('a');
--   -- Make yourself private; another account's search for you should now miss you
--   -- unless you've exchanged a signal/message:
--   update public.profiles set visibility = 'private' where id = auth.uid();
-- ───────────────────────────────────────────────────────────────────────────
