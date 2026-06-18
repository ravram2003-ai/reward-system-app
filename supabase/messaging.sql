-- Pointwell — Free-text direct messaging + block + report.
-- Extends the signals feature. Run ONCE, AFTER supabase/signals.sql. Idempotent.
--
-- KEY SAFETY: server-side schema + RLS. The frontend ships only the anon/public
-- key. Free text between people is risky, so block, report, a length cap, and a
-- rate limit are ALL enforced here in Postgres — not just the UI.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Allow type 'text' on the existing signals table (free-text DMs).
--    The body length cap (1..280) is already enforced by the signals body CHECK.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare c text;
begin
  -- Drop whatever check currently restricts the `type` column (its name is
  -- auto-generated). Matching on the column (not on a literal like 'kudos') makes
  -- this robust to however the old constraint was rendered.
  for c in
    select conname from pg_constraint
    where conrelid = 'public.signals'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%'
  loop
    execute format('alter table public.signals drop constraint %I', c);
  end loop;
end $$;
-- Re-runnable: drop the new name too before re-adding (ADD CONSTRAINT has no IF NOT EXISTS).
alter table public.signals drop constraint if exists signals_type_check;
alter table public.signals
  add constraint signals_type_check check (type in ('kudos','motivation','text'));

-- The per-day "one of each type" limit is for kudos/motivation only. Messages are
-- rate-limited per hour instead (function below), so make that unique index PARTIAL.
drop index if exists public.signals_one_per_type_per_day;
create unique index if not exists signals_one_per_type_per_day
  on public.signals (from_user, to_user, type, created_date)
  where type in ('kudos','motivation');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. blocks: who has blocked whom.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.blocks (
  blocker_user uuid not null references auth.users(id) on delete cascade,
  blocked_user uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (blocker_user, blocked_user),
  constraint blocks_no_self check (blocker_user <> blocked_user)
);

alter table public.blocks enable row level security;

-- You can see, create, and remove ONLY blocks where you are the blocker. (You can
-- never see who has blocked you — that block status stays private.)
drop policy if exists "blocks own select" on public.blocks;
create policy "blocks own select" on public.blocks
  for select using (auth.uid() = blocker_user);
drop policy if exists "blocks own insert" on public.blocks;
create policy "blocks own insert" on public.blocks
  for insert with check (auth.uid() = blocker_user);
drop policy if exists "blocks own delete" on public.blocks;
create policy "blocks own delete" on public.blocks
  for delete using (auth.uid() = blocker_user);

-- is_blocked_between: true if EITHER user blocked the other. SECURITY DEFINER so
-- the insert check below can see the RECIPIENT's blocks (which the sender's own
-- RLS would otherwise hide).
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Only answer truthfully when the CALLER is one of the two parties, so this
  -- can't be used as an oracle to probe whether two strangers blocked each other.
  -- (The insert policy always calls it with from_user = auth.uid(), so enforcement
  -- still works in both directions.)
  select case when auth.uid() = a or auth.uid() = b then exists (
    select 1 from public.blocks
    where (blocker_user = a and blocked_user = b)
       or (blocker_user = b and blocked_user = a)
  ) else false end;
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Per-hour message rate limit, enforced in a BEFORE INSERT trigger (NOT a WITH
-- CHECK count, which concurrent inserts could race past). A transaction-level
-- advisory lock on the (sender → recipient) pair serializes concurrent sends so
-- the count is always accurate. 10 text messages per hour per recipient.
create or replace function public.signals_text_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'text' then
    perform pg_advisory_xact_lock(hashtextextended(new.from_user::text || '>' || new.to_user::text, 0));
    if (
      select count(*) from public.signals
      where from_user = new.from_user
        and to_user = new.to_user
        and type = 'text'
        and created_at > (now() - interval '1 hour')
    ) >= 10 then
      raise exception 'Message rate limit reached (max 10 per hour to a member)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists signals_text_rate_limit_trg on public.signals;
create trigger signals_text_rate_limit_trg
  before insert on public.signals
  for each row execute function public.signals_text_rate_limit();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Broaden signals SELECT so you can read your OWN sent messages too — needed
--    to render a two-way conversation. You still can NEVER read a row where you
--    are neither the sender nor the recipient.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "signals read own inbox" on public.signals;
create policy "signals read own inbox" on public.signals
  for select using (auth.uid() = to_user or auth.uid() = from_user);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Extend the signals INSERT policy:
--    * block check applies to ALL signal types (a block stops all contact);
--    * 'text' is additionally gated by the per-hour rate limit.
--    (This REPLACES the policy created in signals.sql.)
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
      or type = 'text'   -- per-hour rate limit enforced by signals_text_rate_limit trigger
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 5. reports: a user flags a received message for later HUMAN review (no
--    automated moderation yet).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_user       uuid not null references auth.users(id) on delete cascade,
  reported_message_id uuid references public.signals(id) on delete set null,
  reason              text,
  created_at          timestamptz not null default now()
);

alter table public.reports enable row level security;

-- Only the reporter may file a report, only as themselves, only for a message they
-- actually RECEIVED (the EXISTS is RLS-checked, so you can't report — or probe the
-- existence of — messages you aren't the recipient of), with a bounded reason.
drop policy if exists "reports own insert" on public.reports;
create policy "reports own insert" on public.reports
  for insert with check (
    auth.uid() = reporter_user
    and reported_message_id is not null
    and char_length(coalesce(reason, '')) <= 280
    and exists (
      select 1 from public.signals s
      where s.id = reported_message_id and s.to_user = auth.uid()
    )
  );

-- One report per message per reporter (stops duplicate-report spam).
create unique index if not exists reports_one_per_message_per_reporter
  on public.reports (reporter_user, reported_message_id);

-- A reporter can read only their OWN reports; no other user can read any report.
-- (You — the admin — read them via the SQL editor / service role, which bypasses
-- RLS. See the query at the bottom.)
drop policy if exists "reports own select" on public.reports;
create policy "reports own select" on public.reports
  for select using (auth.uid() = reporter_user);

-- (No update/delete policies → denied for everyone via RLS.)

-- ───────────────────────────────────────────────────────────────────────────
-- VIEW REPORTS (run in the Supabase SQL editor as admin — bypasses RLS):
--   select r.created_at, r.reason, r.reporter_user,
--          s.from_user as reported_sender, s.to_user as reported_recipient,
--          s.type as reported_type, s.body as reported_message
--   from public.reports r
--   left join public.signals s on s.id = r.reported_message_id
--   order by r.created_at desc;
--
-- VERIFY (optional, two real accounts A and B):
--   -- A messages B → succeeds:
--   insert into public.signals (from_user, to_user, type, body) values ('<A>','<B>','text','hi');
--   -- A messages themselves → blocked by signals_no_self
--   -- B blocks A:
--   insert into public.blocks (blocker_user, blocked_user) values ('<B>','<A>');
--   -- A messages B again → REJECTED by the insert policy (is_blocked_between)
--   -- Send 11 messages within an hour → the 11th is REJECTED (text_quota_ok)
