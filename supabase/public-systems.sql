-- Pointwell — Public reward systems: a PUBLIC profile's PUBLIC systems become copyable
-- by anyone. This powers the "Public systems you can copy" surfaces (onboarding's AI
-- picks + the Build "Reward Systems" search). Mirrors the communities-discovery model:
-- the owner mirrors their public systems into this table; visibility is enforced INSIDE
-- RLS + SECURITY DEFINER functions (the anon role is never granted execute, so the anon
-- key can never read them).
--
-- A row is exposed only when the owner's profile is public AND there is no block. A
-- system is present here ONLY because its owner marked it public locally and synced it;
-- a system turned private or deleted is pruned on the next sync. A private profile
-- exposes nothing. Idempotent / safe to re-run. Does NOT modify any existing .sql.
-- Depends on: public.profiles, public.profile_is_public (friends.sql),
-- public.is_blocked_between (messaging.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table — one row per (owner, local system id). payload holds the full client
--    system (rules + calculated totals) so a copier can clone it verbatim.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.public_systems (
  id               uuid primary key default gen_random_uuid(),
  owner_user       uuid not null references auth.users(id) on delete cascade,
  client_system_id text not null,            -- the owner's local system id (for upsert/prune)
  title            text not null default 'Reward system',
  category         text,
  description      text,
  payload          jsonb not null,           -- full client system: { title, category, description, rules, calculatedTotals }
  copy_count       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (owner_user, client_system_id)
);
create index if not exists public_systems_owner_idx on public.public_systems (owner_user);
create index if not exists public_systems_popular_idx on public.public_systems (copy_count desc, created_at desc);

alter table public.public_systems enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — the visibility gate.
-- SELECT: the owner always; everyone else only when the owner's profile is public and
-- there is no block between the two. (System-level public-ness is implicit: only public
-- systems are ever inserted here by sync_public_systems below.)
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "public_systems read" on public.public_systems;
create policy "public_systems read" on public.public_systems
  for select using (
    owner_user = auth.uid()
    or (public.profile_is_public(owner_user) and not public.is_blocked_between(auth.uid(), owner_user))
  );

-- INSERT/UPDATE/DELETE: owner only. (Writes normally go through sync_public_systems, a
-- definer, but this also lets an owner's direct PostgREST writes work.)
drop policy if exists "public_systems write own" on public.public_systems;
create policy "public_systems write own" on public.public_systems
  for all using (owner_user = auth.uid()) with check (owner_user = auth.uid());

-- Bound the stored payload + text so an authenticated owner can't bloat their own rows
-- (storage/bandwidth abuse). Added idempotently so re-runs on an existing table apply it.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'public_systems_size_bounds') then
    alter table public.public_systems add constraint public_systems_size_bounds check (
      octet_length(payload::text) <= 65536
      and length(title) <= 120
      and length(coalesce(category, '')) <= 80
      and length(coalesce(description, '')) <= 600
    );
  end if;
end $$;

-- public_system_copies: one row per (viewer, system) so a copy is counted at most once
-- per viewer — the dedup that keeps copy_count (the discovery ranking key) honest.
-- Written ONLY by the increment definer below; readable self-only.
create table if not exists public.public_system_copies (
  viewer_user uuid not null references auth.users(id) on delete cascade,
  system_id   uuid not null references public.public_systems(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (viewer_user, system_id)
);
alter table public.public_system_copies enable row level security;
drop policy if exists "public_system_copies read own" on public.public_system_copies;
create policy "public_system_copies read own" on public.public_system_copies
  for select using (viewer_user = auth.uid());
-- No write policies → only increment_public_system_copy (SECURITY DEFINER) inserts.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sync_public_systems(systems): the owner mirrors their CURRENT set of public
--    systems in one call. Upserts each by (owner_user, client_system_id) — preserving
--    copy_count — and prunes any of the caller's rows no longer in the set (a system
--    that went private or was deleted). An empty array clears all the caller's rows
--    (e.g. the profile turned private). systems is a jsonb array of
--    { client_id, title, category, description, payload }.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_public_systems(systems jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  keep text[];
begin
  if uid is null then return; end if;
  systems := coalesce(systems, '[]'::jsonb);

  -- The set we keep: entries with a client id, capped at 50, dropping any whose payload
  -- exceeds 64KB. The same filter drives the prune + the upsert so they stay consistent.
  select coalesce(array_agg(t.cid), '{}') into keep
  from (
    select e.s->>'client_id' as cid
    from jsonb_array_elements(systems) with ordinality as e(s, ord)
    where coalesce(e.s->>'client_id', '') <> ''
      and e.ord <= 50
      and octet_length(coalesce(e.s->'payload', '{}'::jsonb)::text) <= 65536
  ) t;

  -- Prune rows the caller no longer publishes (or that fell outside the cap).
  delete from public.public_systems
  where owner_user = uid and not (client_system_id = any(keep));

  -- Upsert the kept set, truncating text to the table's bounds so a long field can't
  -- abort the whole sync.
  insert into public.public_systems (owner_user, client_system_id, title, category, description, payload, updated_at)
  select uid,
         e.s->>'client_id',
         coalesce(nullif(btrim(left(e.s->>'title', 120)), ''), 'Reward system'),
         left(e.s->>'category', 80),
         left(e.s->>'description', 600),
         coalesce(e.s->'payload', '{}'::jsonb),
         now()
  from jsonb_array_elements(systems) with ordinality as e(s, ord)
  where coalesce(e.s->>'client_id', '') <> ''
    and e.ord <= 50
    and octet_length(coalesce(e.s->'payload', '{}'::jsonb)::text) <= 65536
  on conflict (owner_user, client_system_id) do update
    set title       = excluded.title,
        category    = excluded.category,
        description = excluded.description,
        payload     = excluded.payload,
        updated_at  = now();
end;
$$;
revoke all on function public.sync_public_systems(jsonb) from public, anon;
grant execute on function public.sync_public_systems(jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. search_public_systems(q): title/category/description search across PUBLIC
--    profiles' public systems (excludes the caller's own + blocked). Returns owner
--    display info (profiles RLS is self-only → definer) + copy_count. Ranked by copies.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.search_public_systems(q text)
returns table (
  id uuid,
  owner_user uuid,
  owner_name text,
  owner_handle text,
  title text,
  category text,
  description text,
  payload jsonb,
  copy_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select ps.id, ps.owner_user, p.display_name, p.handle,
         ps.title, ps.category, ps.description, ps.payload, ps.copy_count
  from public.public_systems ps
  join public.profiles p on p.id = ps.owner_user
  where public.profile_is_public(ps.owner_user)
    and ps.owner_user <> auth.uid()
    and not public.is_blocked_between(auth.uid(), ps.owner_user)
    and length(btrim(coalesce(q, ''))) >= 2
    and (
      ps.title ilike '%' || btrim(q) || '%'
      or coalesce(ps.category, '')    ilike '%' || btrim(q) || '%'
      or coalesce(ps.description, '') ilike '%' || btrim(q) || '%'
    )
  order by ps.copy_count desc, ps.created_at desc
  limit 30;
$$;
revoke all on function public.search_public_systems(text) from public, anon;
grant execute on function public.search_public_systems(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. popular_public_systems(lim): the fallback set — public profiles' public systems
--    ranked by copy count (the "Popular" picks when interest matches are thin). Same
--    exclusions as search. lim is clamped to [1, 100].
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.popular_public_systems(lim integer default 24)
returns table (
  id uuid,
  owner_user uuid,
  owner_name text,
  owner_handle text,
  title text,
  category text,
  description text,
  payload jsonb,
  copy_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select ps.id, ps.owner_user, p.display_name, p.handle,
         ps.title, ps.category, ps.description, ps.payload, ps.copy_count
  from public.public_systems ps
  join public.profiles p on p.id = ps.owner_user
  where public.profile_is_public(ps.owner_user)
    and ps.owner_user <> auth.uid()
    and not public.is_blocked_between(auth.uid(), ps.owner_user)
  order by ps.copy_count desc, ps.created_at desc
  limit greatest(1, least(coalesce(lim, 24), 100));
$$;
revoke all on function public.popular_public_systems(integer) from public, anon;
grant execute on function public.popular_public_systems(integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. increment_public_system_copy(sid): bump copy_count when someone copies a system
--    (best-effort popularity signal). Counts a row the caller is allowed to see, and
--    AT MOST ONCE per viewer (the public_system_copies dedup) so the ranking key can't
--    be inflated by repeated calls.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.increment_public_system_copy(sid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  -- Only a visible, someone-else's row counts.
  if not exists (
    select 1 from public.public_systems ps
    where ps.id = sid
      and ps.owner_user <> uid
      and public.profile_is_public(ps.owner_user)
      and not public.is_blocked_between(uid, ps.owner_user)
  ) then
    return;
  end if;
  -- First copy by this viewer? Then (and only then) bump the counter.
  insert into public.public_system_copies (viewer_user, system_id)
    values (uid, sid)
    on conflict do nothing;
  if found then
    update public.public_systems set copy_count = copy_count + 1 where id = sid;
  end if;
end;
$$;
revoke all on function public.increment_public_system_copy(uuid) from public, anon;
grant execute on function public.increment_public_system_copy(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (optional, accounts A=public owner, B=viewer):
--   -- A (public profile) marks a system public in the app → client calls
--   --   select public.sync_public_systems('[{"client_id":"sys1","title":"Marathon Base",
--   --     "category":"Running","description":"...","payload":{"rules":[]}}]'::jsonb);
--   -- B sees it:           select * from public.search_public_systems('marathon');   -- 1 row
--   -- B sees popular:      select * from public.popular_public_systems(24);          -- includes it
--   -- A turns profile private → B sees nothing:
--   --   update public.profiles set visibility='private' where id='<A>';
--   --   select * from public.search_public_systems('marathon');                      -- 0 rows
--   -- A never exposes a PRIVATE system: it's simply never synced into public_systems.
