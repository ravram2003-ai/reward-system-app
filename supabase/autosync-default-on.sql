-- Pointwell — make device auto-count ON by default for communities.
--
-- communities.allow_device_autosync (added in #21 community-device-autosync.sql) defaulted to
-- FALSE, so a community's synced rule (e.g. a "Steps" rule fed by Fitbit) showed 0 with a manual
-- "+ Log" until the owner hunted for a toggle — and the toggle/rule wiring wasn't even persisted
-- reliably. Auto-count is now the DEFAULT: flip the column default to true and backfill existing
-- rows (null, or the old default false) to true. An owner who genuinely wants it off can still set
-- it false again in community Settings (the opt-out is preserved client-side via `!== false`).
--
-- Idempotent / safe to re-run (set default is a no-op on re-run; the backfill matches nothing once
-- every row is true). Does NOT modify any existing .sql. Depends on: communities.sql + #21.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor.

alter table public.communities alter column allow_device_autosync set default true;

update public.communities
   set allow_device_autosync = true
 where allow_device_autosync is null
    or allow_device_autosync = false;
