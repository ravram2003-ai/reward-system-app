-- Pointwell — Community device auto-sync opt-in.
-- Lets a community OWNER allow members' connected-device (Fitbit/Whoop) total metrics to
-- auto-count toward the community leaderboard on login/sync, without each member tapping
-- "log it". Default OFF — existing communities keep the manual-confirm behavior.
--
-- Safe to re-run (idempotent): the column ALTER is "if not exists". No new RLS — writes are
-- already gated owner-only by the existing "communities update by owner" policy
-- (communities.sql: for update using owner_user = auth.uid()); members never write this column.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor (or via the CLI).

alter table public.communities
  add column if not exists allow_device_autosync boolean not null default false;

-- VERIFY (run after applying):
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'communities'
--      and column_name = 'allow_device_autosync';
--   -- owner-only write is enforced by the existing policy:
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'communities' and cmd = 'UPDATE';
