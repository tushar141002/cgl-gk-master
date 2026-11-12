-- 7A-2: daily archive files, phone-written checkpoints, safe pruning
-- (D-026, D-027, D-066, D-091)
--
-- The inbox may only shrink once every attempt it drops is safe twice over:
-- stored in an immutable archive file, and folded into a checkpoint that a new
-- device can replay from. This migration adds both halves and tightens
-- `compact_sync_inbox` to require them.
--
-- Archive files live in Supabase Storage (private bucket `attempt-archive`).
-- Postgres cannot write objects, so the nightly Edge function
-- (supabase/functions/nightly_archive) reads attempts through the
-- service-role functions below, uploads the file, then records it here.
--
-- Checkpoints are written by the phone (D-091): computing FSRS and Elo state
-- needs the replay engine and the question bank, which live in the app.

-- ---------------------------------------------------------------------------
-- Cursor comparison, shared by checkpoints and compaction
-- ---------------------------------------------------------------------------

-- `<at>:<id>` ordering: by time, then by id in byte order (D-040).
create or replace function public.cursor_le(p_a text, p_b text)
returns boolean
language sql
immutable
as $$
  select split_part(p_a, ':', 1)::bigint < split_part(p_b, ':', 1)::bigint
      or (
        split_part(p_a, ':', 1)::bigint = split_part(p_b, ':', 1)::bigint
        and substr(p_a, position(':' in p_a) + 1) collate "C"
            <= substr(p_b, position(':' in p_b) + 1) collate "C"
      );
$$;

-- ---------------------------------------------------------------------------
-- Archive manifest (D-027)
-- ---------------------------------------------------------------------------

alter table public.attempt_inbox add column archived_at timestamptz;

create index attempt_inbox_unarchived_idx
  on public.attempt_inbox (day, user_id)
  where archived_at is null;

-- One row per immutable file. A day normally has one part; an attempt that
-- arrives late for a day already archived goes into the next part, so no file
-- is ever rewritten.
create table public.attempt_archive (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  part integer not null check (part >= 1),
  path text not null unique,
  attempt_count integer not null check (attempt_count > 0),
  bytes integer not null check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz not null default now(),
  primary key (user_id, day, part)
);

alter table public.attempt_archive enable row level security;

create policy attempt_archive_select_own on public.attempt_archive
  for select to authenticated using (user_id = auth.uid());

grant select on public.attempt_archive to authenticated;

-- (user, IST day) groups with attempts not yet in a file, for days that have
-- ended in India. Service role only.
create or replace function public.archive_pending(p_limit integer default 500)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', g.user_id,
    'day', g.day,
    'nextPart', coalesce((
      select max(a.part) from public.attempt_archive a
      where a.user_id = g.user_id and a.day = g.day
    ), 0) + 1
  ) order by g.day, g.user_id), '[]'::jsonb)
  from (
    select distinct ai.user_id, ai.day
    from public.attempt_inbox ai
    where ai.archived_at is null
      and ai.day < (now() at time zone 'Asia/Kolkata')::date
    order by ai.day, ai.user_id
    limit greatest(1, least(p_limit, 5000))
  ) g;
$$;

-- The unarchived attempts of one (user, day), in replay order, as
-- `AttemptRecord` JSON. Service role only.
create or replace function public.archive_attempts(p_user uuid, p_day date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', ai.attempt_id,
      'qid', ai.qid,
      'qv', ai.qv,
      'chosen', ai.chosen,
      'correct', ai.correct,
      'ms', ai.ms,
      'mode', ai.mode,
      'mockId', ai.mock_id,
      'at', ai.at_ms,
      'deviceId', ai.device_id
    )) || jsonb_build_object('chosen', ai.chosen)
    order by ai.at_ms, ai.attempt_id collate "C"
  ), '[]'::jsonb)
  from public.attempt_inbox ai
  where ai.user_id = p_user and ai.day = p_day and ai.archived_at is null;
$$;

-- Records an uploaded file and marks exactly its attempts archived, in one
-- transaction. A repeat of the same path is a no-op; a count mismatch rolls
-- back so the next run reads the day again. Service role only.
create or replace function public.record_archive(
  p_user uuid,
  p_day date,
  p_part integer,
  p_path text,
  p_attempt_ids text[],
  p_bytes integer,
  p_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marked integer;
begin
  if exists (select 1 from public.attempt_archive where path = p_path) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if p_attempt_ids is null or cardinality(p_attempt_ids) = 0 then
    raise exception 'an archive file holds at least one attempt' using errcode = '22023';
  end if;

  insert into public.attempt_archive (user_id, day, part, path, attempt_count, bytes, sha256)
  values (p_user, p_day, p_part, p_path, cardinality(p_attempt_ids), p_bytes, p_sha256);

  update public.attempt_inbox
  set archived_at = now()
  where user_id = p_user
    and day = p_day
    and archived_at is null
    and attempt_id = any (p_attempt_ids);

  get diagnostics v_marked = row_count;
  if v_marked <> cardinality(p_attempt_ids) then
    raise exception 'archive lists % attempts but % were waiting', cardinality(p_attempt_ids), v_marked
      using errcode = '22023';
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'marked', v_marked);
end;
$$;

-- Of the given ids, those with no account any more; the nightly job removes
-- their Storage folders, completing account deletion (D-086). Service role only.
create or replace function public.archive_orphans(p_user_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(id), '{}')
  from unnest(p_user_ids) as candidate(id)
  where not exists (select 1 from auth.users u where u.id = candidate.id);
$$;

-- ---------------------------------------------------------------------------
-- Checkpoints written by the phone (D-026, D-091)
-- ---------------------------------------------------------------------------

-- The largest checkpoint accepted, in bytes of JSON text.
create or replace function public.checkpoint_max_bytes()
returns integer
language sql
immutable
as $$ select 2000000 $$;

create or replace function public.put_checkpoint(p_checkpoint jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_cursor text;
  v_last text;
  v_newest text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(p_checkpoint) is distinct from 'object' then
    raise exception 'checkpoint must be a JSON object' using errcode = '22023';
  end if;
  if length(p_checkpoint::text) > public.checkpoint_max_bytes() then
    raise exception 'checkpoint too large' using errcode = '22023';
  end if;

  v_cursor := p_checkpoint ->> 'cursor';
  if v_cursor is null or v_cursor !~ '^[0-9]+:[^:]+$' then
    raise exception 'cursor must look like "<at>:<id>"' using errcode = '22023';
  end if;
  if jsonb_typeof(p_checkpoint -> 'cardStates') is distinct from 'array'
     or jsonb_typeof(p_checkpoint -> 'skills') is distinct from 'array'
     or jsonb_typeof(p_checkpoint -> 'istDailyTotals') is distinct from 'array' then
    raise exception 'cardStates, skills and istDailyTotals must be arrays' using errcode = '22023';
  end if;

  -- A checkpoint may only cover attempts the server already holds, so a new
  -- device never replays from a state it cannot reach (D-026).
  select last_cursor into v_last from public.sync_state where user_id = v_user;
  if v_last is null or not public.cursor_le(v_cursor, v_last) then
    return jsonb_build_object('ok', false, 'error', 'ahead_of_server');
  end if;

  -- Checkpoints only move forward; an older one would undo progress elsewhere.
  select cursor into v_newest
  from public.checkpoints
  where user_id = v_user
  order by created_at desc, id desc
  limit 1;
  if v_newest is not null and public.cursor_le(v_cursor, v_newest) then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  insert into public.checkpoints (user_id, cursor, card_states, skills, ist_daily_totals)
  values (
    v_user,
    v_cursor,
    p_checkpoint -> 'cardStates',
    p_checkpoint -> 'skills',
    p_checkpoint -> 'istDailyTotals'
  );

  -- Keep the newest two: one to replay from, one in case the newest is bad.
  delete from public.checkpoints
  where user_id = v_user
    and id not in (
      select id from public.checkpoints
      where user_id = v_user
      order by created_at desc, id desc
      limit 2
    );

  return jsonb_build_object('ok', true, 'cursor', v_cursor);
end;
$$;

create or replace function public.latest_checkpoint()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row public.checkpoints;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_row
  from public.checkpoints
  where user_id = v_user
  order by created_at desc, id desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'checkpoint', null);
  end if;

  return jsonb_build_object('ok', true, 'checkpoint', jsonb_build_object(
    'cursor', v_row.cursor,
    'cardStates', v_row.card_states,
    'skills', v_row.skills,
    'istDailyTotals', v_row.ist_daily_totals,
    'createdAt', to_char(v_row.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- Compaction: prune only what is archived, checkpointed and old (D-066)
-- ---------------------------------------------------------------------------

drop function public.compact_sync_inbox(interval);

create or replace function public.compact_sync_inbox(
  p_batch_retention interval default interval '90 days',
  p_attempt_retention interval default interval '30 days'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer := 0;
  v_batches integer := 0;
begin
  if p_batch_retention < interval '1 day' or p_attempt_retention < interval '1 day' then
    raise exception 'retention must be at least one day' using errcode = '22023';
  end if;

  -- All three, or the attempt stays: it is in a file (D-027), a new device can
  -- replay past it (D-026), and the recent tail stays pullable for a while.
  with newest as (
    select distinct on (c.user_id) c.user_id, c.cursor
    from public.checkpoints c
    order by c.user_id, c.created_at desc, c.id desc
  )
  delete from public.attempt_inbox ai
  using newest n
  where ai.user_id = n.user_id
    and ai.archived_at is not null
    and ai.received_at < now() - p_attempt_retention
    and public.cursor_le(ai.at_ms::text || ':' || ai.attempt_id, n.cursor);

  get diagnostics v_attempts = row_count;

  delete from public.sync_batches b
  where b.received_at < now() - p_batch_retention
    and not exists (
      select 1 from public.attempt_inbox ai
      where ai.user_id = b.user_id and ai.batch_id = b.batch_id
    );

  get diagnostics v_batches = row_count;

  return jsonb_build_object(
    'ok', true,
    'attemptsPruned', v_attempts,
    'batchesPruned', v_batches
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion covers the manifest too (D-086). Storage objects are
-- removed by the nightly job through `archive_orphans`.
-- ---------------------------------------------------------------------------

create or replace function public.delete_user()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.mock_answers
  where session_id in (select id from public.mock_sessions where user_id = v_user);
  delete from public.mock_sessions where user_id = v_user;
  delete from public.attempt_archive where user_id = v_user;
  delete from public.question_reports where user_id = v_user;
  delete from public.daily_stats where user_id = v_user;
  delete from public.checkpoints where user_id = v_user;
  delete from public.attempt_inbox where user_id = v_user;
  delete from public.sync_batches where user_id = v_user;
  delete from public.sync_state where user_id = v_user;
  delete from public.profiles where user_id = v_user;
  delete from auth.users where id = v_user;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.archive_pending(integer) from public;
grant execute on function public.archive_pending(integer) to service_role;

revoke all on function public.archive_attempts(uuid, date) from public;
grant execute on function public.archive_attempts(uuid, date) to service_role;

revoke all on function public.record_archive(uuid, date, integer, text, text[], integer, text) from public;
grant execute on function public.record_archive(uuid, date, integer, text, text[], integer, text) to service_role;

revoke all on function public.archive_orphans(uuid[]) from public;
grant execute on function public.archive_orphans(uuid[]) to service_role;

revoke all on function public.put_checkpoint(jsonb) from public;
grant execute on function public.put_checkpoint(jsonb) to authenticated;

revoke all on function public.latest_checkpoint() from public;
grant execute on function public.latest_checkpoint() to authenticated;

revoke all on function public.compact_sync_inbox(interval, interval) from public;
grant execute on function public.compact_sync_inbox(interval, interval) to service_role;
