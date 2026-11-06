-- The parts of Supabase the migrations rely on, for the PGlite test harness.
--
-- Supabase provides `auth.users`, `auth.uid()` and the three API roles. PGlite
-- is a bare Postgres, so the harness recreates just those pieces: no sessions,
-- no JWT, only the `request.jwt.claim.sub` setting that `auth.uid()` reads.
-- Keep this file in sync with Supabase's own definitions when they change.

create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;
