-- Harden waitlist signups: disallow direct anon inserts.
-- The Edge Function uses the service role key, which bypasses RLS.

revoke insert on public.waitlist_signups from anon;

drop policy if exists "anon_insert_waitlist_signups" on public.waitlist_signups;

