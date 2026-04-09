-- Run in Supabase SQL Editor or via `supabase db push` if you use the CLI.
-- Waitlist signups: public anon INSERT only; no anonymous reads.

create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null,
  designation text not null,
  linkedin_url text not null,
  phone text,
  form_type text not null default 'waitlist'
);

create index waitlist_signups_email_idx on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

-- API roles: no table privileges until explicitly granted.
revoke all on public.waitlist_signups from public;
revoke all on public.waitlist_signups from anon;
revoke all on public.waitlist_signups from authenticated;

-- Anon may insert only these columns (id / created_at use defaults).
grant insert (
  full_name,
  email,
  designation,
  linkedin_url,
  phone,
  form_type
) on public.waitlist_signups to anon;

create policy "anon_insert_waitlist_signups"
on public.waitlist_signups
for insert
to anon
with check (true);

-- No select/update/delete policies for anon → anon cannot read or mutate rows via the API.
