-- 7A: sync backend core (D-063..D-067)
--
-- The phone owns the attempt log; the server stores what arrives in an inbox,
-- derives the small aggregates the app needs, and keeps the idempotency key for
-- retries. Nothing here is client-computed: `daily_stats` and `question_stats`
-- are rebuilt from accepted attempts only (D-028, D-065).
--
-- Migrations are applied in filename order by the Supabase CLI and by the
-- PGlite test harness (tests/server/harness.ts). Every statement must therefore
-- be safe to run once against an empty schema.

-- ---------------------------------------------------------------------------
-- Account profile
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text,
  language text not null default 'en' check (language in ('en', 'hi')),
  exam_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

-- Supabase creates auth.users on sign-in; the profile row is created once here
-- so the app never needs a client-side insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sync bookkeeping
-- ---------------------------------------------------------------------------

-- Latest accepted replay position and correction watermark for a user. Kept
-- separately from the inbox so `newCursor` does not regress when old inbox rows
-- are compacted (D-066). `last_corrections_at` is a delivery watermark, not a
-- replay position: corrections are cheap to resend, attempts are not.
create table public.sync_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_cursor text check (last_cursor is null or last_cursor ~ '^[0-9]+:[^:]+$'),
  last_corrections_at timestamptz,
  last_batch_at timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per client batch. `(user_id, batch_id)` is the idempotency key and
-- `response` is the exact JSON the first attempt returned, so a retried batch
-- repeats its answer instead of writing twice or losing the corrections it
-- already handed out (D-009, D-063, D-067).
create table public.sync_batches (
  user_id uuid not null references auth.users (id) on delete cascade,
  batch_id text not null,
  received_at timestamptz not null default now(),
  attempt_count integer not null check (attempt_count >= 0),
  report_count integer not null check (report_count >= 0),
  response jsonb not null default '{}'::jsonb,
  primary key (user_id, batch_id)
);

create index sync_batches_user_received_idx
  on public.sync_batches (user_id, received_at desc);

create index sync_batches_received_idx
  on public.sync_batches (received_at);

-- Exactly one row per attempt (D-063). The primary key is also the duplicate
-- guard: a batch that resends an attempt already in the inbox inserts nothing.
create table public.attempt_inbox (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempt_id text not null,
  batch_id text not null,
  qid text not null,
  qv integer not null check (qv >= 1),
  chosen smallint check (chosen between 0 and 3),
  correct boolean not null,
  ms double precision not null check (ms >= 0),
  mode text not null check (mode in ('practice', 'pyq', 'mock', 'daily', 'revise')),
  mock_id text,
  at_ms bigint not null check (at_ms >= 0),
  device_id text not null,
  -- The IST day decided once, when the batch arrived (PROJECT_SPEC.md §7), so a
  -- later recomputation cannot move an old attempt to a different day.
  day date not null,
  received_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  constraint attempt_inbox_batch_fk
    foreign key (user_id, batch_id)
    references public.sync_batches (user_id, batch_id)
    on delete cascade,
  constraint attempt_inbox_skip_not_correct
    check (chosen is not null or correct = false)
);

create index attempt_inbox_user_at_idx
  on public.attempt_inbox (user_id, at_ms desc, attempt_id desc);

create index attempt_inbox_user_batch_idx
  on public.attempt_inbox (user_id, batch_id);

create index attempt_inbox_user_day_idx
  on public.attempt_inbox (user_id, day);

create index attempt_inbox_received_idx
  on public.attempt_inbox (received_at);

-- ---------------------------------------------------------------------------
-- Derived aggregates
-- ---------------------------------------------------------------------------

-- IST day totals, derived from attempts at sync time (D-065). A skip writes a
-- zero row for the day but changes no counter (D-043).
create table public.daily_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  attempted integer not null default 0 check (attempted >= 0),
  correct integer not null default 0 check (correct >= 0),
  ms double precision not null default 0 check (ms >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Difficulty calibration is a later job; 7A fills attempts, correct and timing
-- and leaves `elo` null until the calibration pass exists.
create table public.question_stats (
  qid text primary key,
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  total_ms double precision not null default 0 check (total_ms >= 0),
  avg_ms double precision,
  elo double precision,
  updated_at timestamptz not null default now()
);

-- Replay start point. The table exists now; writing checkpoints is 7A-2, once
-- the retention boundary and archive format exist (D-026, D-027).
create table public.checkpoints (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  cursor text not null check (cursor ~ '^[0-9]+:[^:]+$'),
  card_states jsonb not null,
  skills jsonb not null,
  ist_daily_totals jsonb not null,
  created_at timestamptz not null default now()
);

create index checkpoints_user_created_idx
  on public.checkpoints (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Corrections and reports
-- ---------------------------------------------------------------------------

create table public.question_corrections (
  id text primary key,
  qid text not null,
  from_version integer not null check (from_version >= 1),
  to_version integer not null check (to_version > from_version),
  old_answer smallint not null check (old_answer between 0 and 3),
  new_answer smallint not null check (new_answer between 0 and 3),
  reason text not null,
  corrected_at timestamptz not null default now()
);

create index question_corrections_corrected_at_idx
  on public.question_corrections (corrected_at);

create table public.question_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  qid text not null,
  qv integer not null check (qv >= 1),
  reason text not null check (reason in ('wrong-key', 'typo', 'wrong-translation', 'unclear', 'other')),
  at_ms bigint not null check (at_ms >= 0),
  received_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'fixed', 'rejected')),
  unique (user_id, qid, qv, reason)
);

create index question_reports_status_idx
  on public.question_reports (status, received_at);
