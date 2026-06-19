-- Pointwell — Community discovery: name search + request-to-join + secret tier.
-- Run ONCE in the Supabase SQL editor, AFTER communities.sql. Idempotent.
--
-- KEY SAFETY: discovery + approval rules live HERE (RLS / SECURITY DEFINER), not
-- the UI. A 'private' community is NEVER returned by name search, even via a direct
-- query, and only a community's OWNER can approve a join request.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Three visibility tiers: public | request_to_join | private.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.communities'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%visibility%'
  loop
    execute format('alter table public.communities drop constraint %I', c);
  end loop;
end $$;
alter table public.communities drop constraint if exists communities_visibility_check;
alter table public.communities
  add constraint communities_visibility_check
  check (visibility in ('public', 'request_to_join', 'private'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. join_requests: a pending/accepted/declined request to join a community.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.join_requests (
  id             uuid primary key default gen_random_uuid(),
  community_id   uuid not null references public.communities(id) on delete cascade,
  requester_user uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);
-- No duplicate PENDING request from the same user to the same community.
create unique index if not exists join_requests_one_pending
  on public.join_requests (community_id, requester_user) where status = 'pending';
create index if not exists join_requests_community_idx on public.join_requests (community_id, status);

alter table public.join_requests enable row level security;

-- community_is_requestable(cid): is this community in the request-to-join tier?
-- SECURITY DEFINER so the insert policy can check visibility for a community the
-- requester can't yet read (they're not a member).
create or replace function public.community_is_requestable(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.communities where id = cid and visibility = 'request_to_join');
$$;
revoke all on function public.community_is_requestable(uuid) from public, anon;
grant execute on function public.community_is_requestable(uuid) to authenticated;

-- INSERT: you can create a PENDING request only as yourself, only when you're NOT
-- already a member, and only for a request_to_join community.
drop policy if exists "requests insert as self" on public.join_requests;
create policy "requests insert as self" on public.join_requests
  for insert with check (
    requester_user = auth.uid()
    and status = 'pending'
    and not public.is_community_member(community_id, auth.uid())
    and public.community_is_requestable(community_id)
  );

-- SELECT: you can read your OWN requests; a community OWNER can read requests for
-- their community; nobody else can.
drop policy if exists "requests read own or owner" on public.join_requests;
create policy "requests read own or owner" on public.join_requests
  for select using (
    requester_user = auth.uid()
    or exists (select 1 from public.communities c where c.id = community_id and c.owner_user = auth.uid())
  );

-- (No UPDATE/DELETE policies → responding happens ONLY through respond_to_join_request
--  below, which verifies ownership. Direct updates/deletes are denied for everyone.)

-- ───────────────────────────────────────────────────────────────────────────
-- 3. search_communities(q): name search. Returns ONLY public + request_to_join
--    communities (private is excluded at the DB level), with member count and the
--    caller's own membership / request status so the UI shows the right action.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.search_communities(q text)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  visibility text,
  member_count bigint,
  is_member boolean,
  request_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.category, c.description, c.visibility,
         (select count(*) from public.community_members m where m.community_id = c.id) as member_count,
         public.is_community_member(c.id, auth.uid()) as is_member,
         (select jr.status from public.join_requests jr
           where jr.community_id = c.id and jr.requester_user = auth.uid()
           order by jr.created_at desc limit 1) as request_status
  from public.communities c
  where c.visibility in ('public', 'request_to_join')
    and length(btrim(coalesce(q, ''))) >= 2
    and c.name ilike '%' || btrim(q) || '%'
  order by c.name
  limit 30;
$$;
revoke all on function public.search_communities(text) from public, anon;
grant execute on function public.search_communities(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. get_owner_join_requests(): pending requests for communities the caller OWNS,
--    with the requester's name (profiles RLS is self-only, so a definer is needed).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_owner_join_requests()
returns table (
  request_id uuid,
  community_id uuid,
  community_name text,
  requester_user uuid,
  requester_name text,
  requester_handle text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select jr.id, jr.community_id, c.name, jr.requester_user, p.display_name, p.handle, jr.created_at
  from public.join_requests jr
  join public.communities c on c.id = jr.community_id
  join public.profiles p on p.id = jr.requester_user
  where c.owner_user = auth.uid() and jr.status = 'pending'
  order by jr.created_at;
$$;
revoke all on function public.get_owner_join_requests() from public, anon;
grant execute on function public.get_owner_join_requests() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. get_my_join_requests(): the caller's own requests + community names + status
--    (the requester isn't a member yet, so they can't read the community via RLS).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_my_join_requests()
returns table (
  request_id uuid,
  community_id uuid,
  community_name text,
  status text,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select jr.id, jr.community_id, c.name, jr.status, jr.created_at, jr.responded_at
  from public.join_requests jr
  join public.communities c on c.id = jr.community_id
  where jr.requester_user = auth.uid()
  order by jr.created_at desc;
$$;
revoke all on function public.get_my_join_requests() from public, anon;
grant execute on function public.get_my_join_requests() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. respond_to_join_request(req_id, accept): OWNER-ONLY. Accept → creates the
--    membership row (bypassing the join-as-self policy, which is the point of a
--    definer here) and marks the request accepted; decline → marks it declined.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.respond_to_join_request(req_id uuid, accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.join_requests;
  owner uuid;
begin
  select * into r from public.join_requests where id = req_id;
  if not found then raise exception 'Request not found'; end if;

  select owner_user into owner from public.communities where id = r.community_id;
  if owner is null or owner <> auth.uid() then
    raise exception 'Only the community owner can respond to a request';
  end if;

  if r.status <> 'pending' then
    return r.status; -- already handled; idempotent
  end if;

  if accept then
    update public.join_requests set status = 'accepted', responded_at = now() where id = req_id;
    insert into public.community_members (community_id, user_id, role)
      values (r.community_id, r.requester_user, 'member')
      on conflict do nothing;
    return 'accepted';
  else
    update public.join_requests set status = 'declined', responded_at = now() where id = req_id;
    return 'declined';
  end if;
end;
$$;
revoke all on function public.respond_to_join_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_join_request(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional, accounts A=owner, B=requester):
--   -- A makes a request_to_join community in the app, or:
--   --   update public.communities set visibility='request_to_join' where name='RUN CLUB';
--   -- B name-searches:   select * from public.search_communities('run');   -- appears
--   -- B requests:        insert into public.join_requests (community_id, requester_user)
--   --                    values ('<id>', auth.uid());
--   -- A sees it:         select * from public.get_owner_join_requests();
--   -- A accepts:         select public.respond_to_join_request('<request id>', true);
--   -- Now B is a member: select * from public.community_members where community_id='<id>';
--   -- A 'private' community NEVER appears: select * from public.search_communities('<its name>'); -- 0 rows
