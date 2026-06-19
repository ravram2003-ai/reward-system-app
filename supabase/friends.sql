-- Pointwell — Friends system + visibility-gated messaging.
-- Run ONCE in the Supabase SQL editor, AFTER messaging.sql + search-onboarding.sql. Idempotent.
--
-- KEY SAFETY: every rule is enforced HERE (RLS / SECURITY DEFINER), not the UI.
--   * A DM (type='text') A→B is allowed ONLY if B is public OR A & B are accepted
--     friends, AND neither has blocked the other.
--   * Friend requests: create only as yourself; see only requests you're part of;
--     accept/decline only requests addressed to you (via the definer below).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. friend_requests: pending | accepted | declined. An 'accepted' row IS a
--    (symmetric) friendship between the pair.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.friend_requests (
  id             uuid primary key default gen_random_uuid(),
  requester_user uuid not null references auth.users(id) on delete cascade,
  addressee_user uuid not null references auth.users(id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  constraint friend_requests_no_self check (requester_user <> addressee_user)
);
-- No duplicate PENDING request between a pair (either direction).
create unique index if not exists friend_requests_one_pending
  on public.friend_requests (least(requester_user, addressee_user), greatest(requester_user, addressee_user))
  where status = 'pending';
create index if not exists friend_requests_addressee_idx on public.friend_requests (addressee_user, status);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_user, status);

alter table public.friend_requests enable row level security;

-- are_friends(a,b): true if an ACCEPTED friendship exists between the pair (either
-- direction). SECURITY DEFINER so the messaging gate can check it for any pair.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((requester_user = a and addressee_user = b) or (requester_user = b and addressee_user = a))
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- profile_is_public(uid): the recipient's messaging gate. Default public.
create or replace function public.profile_is_public(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select visibility from public.profiles where id = uid), 'public') = 'public';
$$;
revoke all on function public.profile_is_public(uuid) from public, anon;
grant execute on function public.profile_is_public(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. friend_requests RLS
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT: you can read a request only if you're the requester or the addressee.
drop policy if exists "friend_requests read own" on public.friend_requests;
create policy "friend_requests read own" on public.friend_requests
  for select using (requester_user = auth.uid() or addressee_user = auth.uid());

-- INSERT: you can create a PENDING request only as YOURSELF, not to yourself, only
-- if not already friends, and only if neither party has blocked the other.
drop policy if exists "friend_requests insert as self" on public.friend_requests;
create policy "friend_requests insert as self" on public.friend_requests
  for insert with check (
    requester_user = auth.uid()
    and requester_user <> addressee_user
    and status = 'pending'
    and not public.are_friends(requester_user, addressee_user)
    and not public.is_blocked_between(requester_user, addressee_user)
  );

-- (No UPDATE/DELETE policy → accept/decline happens ONLY through
--  respond_to_friend_request below, which verifies you're the addressee.)

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Messaging gate — REPLACES the signals insert policy. A DM (type='text') is
--    allowed only if the recipient is public OR you're accepted friends; kudos and
--    motivation keep their existing rules; a block still stops everything.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "signals insert as self" on public.signals;
create policy "signals insert as self" on public.signals
  for insert with check (
    auth.uid() = from_user
    and from_user <> to_user
    and not public.is_blocked_between(from_user, to_user)
    and (
      type = 'kudos'
      or (type = 'motivation' and public.is_member_nudgeable(to_user))
      or (type = 'text' and (public.profile_is_public(to_user) or public.are_friends(from_user, to_user)))
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 4. People search for "New message": people I'm ALLOWED to message — public
--    profiles OR my accepted friends, never blocked, never me. Returns safe columns.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.search_messageable_profiles(q text)
returns table (id uuid, display_name text, handle text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.handle
  from public.profiles p
  where p.id <> auth.uid()
    and length(btrim(coalesce(q, ''))) >= 2
    and (p.display_name ilike '%' || q || '%' or p.handle ilike '%' || q || '%')
    and (public.profile_is_public(p.id) or public.are_friends(auth.uid(), p.id))
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.display_name
  limit 20;
$$;
revoke all on function public.search_messageable_profiles(text) from public, anon;
grant execute on function public.search_messageable_profiles(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Friend list / request reads (profiles RLS is self-only, so definers return
--    the other party's name).
-- ───────────────────────────────────────────────────────────────────────────
-- My accepted friends.
create or replace function public.get_friends()
returns table (user_id uuid, display_name text, handle text, since timestamptz)
language sql stable security definer set search_path = public
as $$
  select (case when fr.requester_user = auth.uid() then fr.addressee_user else fr.requester_user end) as user_id,
         p.display_name, p.handle, fr.responded_at as since
  from public.friend_requests fr
  join public.profiles p
    on p.id = (case when fr.requester_user = auth.uid() then fr.addressee_user else fr.requester_user end)
  where fr.status = 'accepted' and (fr.requester_user = auth.uid() or fr.addressee_user = auth.uid());
$$;
revoke all on function public.get_friends() from public, anon;
grant execute on function public.get_friends() to authenticated;

-- Pending requests addressed to me (for the Accept/Decline view + badge).
create or replace function public.get_incoming_friend_requests()
returns table (request_id uuid, requester_user uuid, requester_name text, requester_handle text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select fr.id, fr.requester_user, p.display_name, p.handle, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.requester_user
  where fr.addressee_user = auth.uid() and fr.status = 'pending'
  order by fr.created_at;
$$;
revoke all on function public.get_incoming_friend_requests() from public, anon;
grant execute on function public.get_incoming_friend_requests() to authenticated;

-- The relationship between me and another user, for the Add-friend search UI:
-- 'friends' | 'pending_out' | 'pending_in' | 'none'.
create or replace function public.get_friendship_status(other uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
             when status = 'accepted' then 'friends'
             when status = 'pending' and requester_user = auth.uid() then 'pending_out'
             when status = 'pending' and addressee_user = auth.uid() then 'pending_in'
             else status
           end
    from public.friend_requests
    where (requester_user = auth.uid() and addressee_user = other)
       or (requester_user = other and addressee_user = auth.uid())
    order by created_at desc limit 1
  ), 'none');
$$;
revoke all on function public.get_friendship_status(uuid) from public, anon;
grant execute on function public.get_friendship_status(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. respond_to_friend_request(req_id, accept): ADDRESSEE-ONLY accept/decline.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.respond_to_friend_request(req_id uuid, accept boolean)
returns text
language plpgsql security definer set search_path = public
as $$
declare r public.friend_requests;
begin
  select * into r from public.friend_requests where id = req_id;
  if not found then raise exception 'Request not found'; end if;
  if r.addressee_user <> auth.uid() then raise exception 'Only the addressee can respond to this request'; end if;
  if r.status <> 'pending' then return r.status; end if;  -- idempotent
  -- A block placed AFTER the request was created must still win ("a block stops
  -- everything") — never let an accepted friendship form across a block.
  if accept and public.is_blocked_between(r.requester_user, r.addressee_user) then
    update public.friend_requests set status = 'declined', responded_at = now() where id = req_id;
    return 'declined';
  end if;
  update public.friend_requests
    set status = case when accept then 'accepted' else 'declined' end, responded_at = now()
    where id = req_id;
  return case when accept then 'accepted' else 'declined' end;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. GRANDFATHER existing conversations: auto-friend every pair that already has a
--    text DM between them, so pre-existing threads stay in Main (not Requests).
--    Idempotent — skips pairs that already have any friend_requests row.
-- ───────────────────────────────────────────────────────────────────────────
with pairs as (
  select distinct least(from_user, to_user) as a, greatest(from_user, to_user) as b
  from public.signals
  where type = 'text' and from_user is not null and to_user is not null and from_user <> to_user
)
insert into public.friend_requests (requester_user, addressee_user, status, responded_at)
select pairs.a, pairs.b, 'accepted', now()
from pairs
where not exists (
  select 1 from public.friend_requests fr
  where (fr.requester_user = pairs.a and fr.addressee_user = pairs.b)
     or (fr.requester_user = pairs.b and fr.addressee_user = pairs.a)
);

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional, accounts A and B):
--   -- A requests B:  insert into public.friend_requests (requester_user, addressee_user) values (auth.uid(),'<B>');
--   -- B sees it:     select * from public.get_incoming_friend_requests();
--   -- B accepts:     select public.respond_to_friend_request('<request id>', true);
--   -- Both friends:  select public.are_friends('<A>','<B>');   -- true
--   -- DM to a PRIVATE non-friend is rejected by the insert policy even via a direct
--   -- insert into public.signals (... type='text' ...).
-- ───────────────────────────────────────────────────────────────────────────
