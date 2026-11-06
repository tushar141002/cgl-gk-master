-- 7A: row-level security, grants and the sync RPCs (D-064..D-067)
--
-- The client never writes these tables directly. It may read its own rows and
-- call two SECURITY DEFINER functions; everything else is denied. `anon` gets
-- nothing at all: every sync needs a signed-in student.

-- ---------------------------------------------------------------------------
-- Helper: the IST day an attempt belongs to
-- ---------------------------------------------------------------------------

-- `AttemptRecord.at` is trusted as the IST day when it is plausible (not in the
-- future, not older than 30 days); otherwise the day comes from the moment the
-- server accepted it. PROJECT_SPEC.md §7, D-028.
create or replace function public.ist_day(
  p_at_ms bigint,
  p_received_at timestamptz,
  p_now_ms bigint
) returns date
language sql
immutable
as $$
  select case
    when p_at_ms between p_now_ms - 2592000000 and p_now_ms
      then (to_timestamp(p_at_ms / 1000.0) at time zone 'Asia/Kolkata')::date
    else (p_received_at at time zone 'Asia/Kolkata')::date
  end;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.sync_state enable row level security;
alter table public.sync_batches enable row level security;
alter table public.attempt_inbox enable row level security;
alter table public.daily_stats enable row level security;
alter table public.question_stats enable row level security;
alter table public.checkpoints enable row level security;
alter table public.question_corrections enable row level security;
alter table public.question_reports enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy sync_state_select_own on public.sync_state
  for select to authenticated using (user_id = auth.uid());

create policy sync_batches_select_own on public.sync_batches
  for select to authenticated using (user_id = auth.uid());

create policy attempt_inbox_select_own on public.attempt_inbox
  for select to authenticated using (user_id = auth.uid());

create policy daily_stats_select_own on public.daily_stats
  for select to authenticated using (user_id = auth.uid());

create policy checkpoints_select_own on public.checkpoints
  for select to authenticated using (user_id = auth.uid());

create policy question_reports_select_own on public.question_reports
  for select to authenticated using (user_id = auth.uid());

-- Corrections and question statistics are global content, not student data.
create policy question_corrections_read_all on public.question_corrections
  for select to authenticated using (true);

create policy question_stats_read_all on public.question_stats
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update (name, language, exam_date) on public.profiles to authenticated;

grant select on public.sync_state to authenticated;
grant select on public.sync_batches to authenticated;
grant select on public.attempt_inbox to authenticated;
grant select on public.daily_stats to authenticated;
grant select on public.checkpoints to authenticated;
grant select on public.question_stats to authenticated;
grant select on public.question_corrections to authenticated;
grant select on public.question_reports to authenticated;

-- ---------------------------------------------------------------------------
-- apply_sync_batch: the only write path for attempts
-- ---------------------------------------------------------------------------

-- Accepts one client batch and returns `SyncResponse`. Everything below runs in
-- the caller's transaction, so the batch is accepted whole or not at all
-- (D-064). A repeated `batchId` returns the JSON the first call produced, so a
-- lost response can be retried without double counting (D-067).
create or replace function public.apply_sync_batch(p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch_id text;
  v_device_id text;
  v_cursor text;
  v_attempts jsonb;
  v_reports jsonb;
  v_attempt_count integer;
  v_report_count integer;
  v_stored jsonb;
  v_server_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  v_since timestamptz;
  v_corrections jsonb;
  v_max_at bigint;
  v_max_id text;
  v_prev_cursor text;
  v_prev_at bigint;
  v_prev_id text;
  v_new_cursor text;
  v_response jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_batch is null or jsonb_typeof(p_batch) <> 'object' then
    raise exception 'sync batch must be a JSON object' using errcode = '22023';
  end if;

  v_batch_id := p_batch ->> 'batchId';
  v_device_id := p_batch ->> 'deviceId';
  v_cursor := p_batch ->> 'cursor';
  v_attempts := p_batch -> 'attempts';
  v_reports := p_batch -> 'reports';

  if v_batch_id is null or v_batch_id = '' or length(v_batch_id) > 64 then
    raise exception 'batchId must be 1-64 characters' using errcode = '22023';
  end if;

  if v_device_id is null or v_device_id = '' or length(v_device_id) > 64 then
    raise exception 'deviceId must be 1-64 characters' using errcode = '22023';
  end if;

  if v_cursor is not null and v_cursor !~ '^[0-9]+:[^:]+$' then
    raise exception 'cursor must look like "<at>:<id>"' using errcode = '22023';
  end if;

  if v_attempts is null or jsonb_typeof(v_attempts) <> 'array' then
    raise exception 'attempts must be an array' using errcode = '22023';
  end if;

  if v_reports is null or jsonb_typeof(v_reports) <> 'array' then
    raise exception 'reports must be an array' using errcode = '22023';
  end if;

  v_attempt_count := jsonb_array_length(v_attempts);
  v_report_count := jsonb_array_length(v_reports);

  -- MAX_ATTEMPTS_PER_BATCH / MAX_REPORTS_PER_BATCH in shared/contract.ts.
  if v_attempt_count > 200 then
    raise exception 'at most 200 attempts per batch' using errcode = '22023';
  end if;

  if v_report_count > 20 then
    raise exception 'at most 20 reports per batch' using errcode = '22023';
  end if;

  if jsonb_typeof(v_attempts) = 'array' and exists (
    select 1 from jsonb_array_elements(v_attempts) as e where jsonb_typeof(e) <> 'object'
  ) then
    raise exception 'every attempt must be a JSON object' using errcode = '22023';
  end if;

  if jsonb_typeof(v_reports) = 'array' and exists (
    select 1 from jsonb_array_elements(v_reports) as e where jsonb_typeof(e) <> 'object'
  ) then
    raise exception 'every report must be a JSON object' using errcode = '22023';
  end if;

  -- Idempotency: the insert is both the lock and the duplicate check. A second
  -- call with the same batchId blocks until the first commits, finds the row
  -- and returns the stored response unchanged.
  insert into public.sync_batches (user_id, batch_id, attempt_count, report_count)
  values (v_user, v_batch_id, v_attempt_count, v_report_count)
  on conflict (user_id, batch_id) do nothing;

  if not found then
    select b.response into v_stored
    from public.sync_batches b
    where b.user_id = v_user and b.batch_id = v_batch_id;

    if v_stored is not null and v_stored <> '{}'::jsonb then
      return v_stored;
    end if;

    return jsonb_build_object('ok', false, 'error', 'batch_in_progress', 'retryAfterMs', 1000);
  end if;

  -- Store every attempt once. `accepted` yields only the rows this batch really
  -- inserted, so the global question statistics can be incremented exactly
  -- once even when a retry resends attempts under a new batchId.
  with accepted as (
    insert into public.attempt_inbox (
      user_id, attempt_id, batch_id, qid, qv, chosen, correct, ms, mode, mock_id, at_ms, device_id, day
    )
    select
      v_user,
      a.id,
      v_batch_id,
      a.qid,
      a.qv,
      a.chosen,
      a.correct,
      a.ms,
      a.mode,
      a."mockId",
      a.at,
      coalesce(nullif(a."deviceId", ''), v_device_id),
      public.ist_day(a.at, now(), v_server_ms)
    from jsonb_to_recordset(v_attempts) as a(
      id text, qid text, qv integer, chosen smallint, correct boolean,
      ms double precision, mode text, "mockId" text, at bigint, "deviceId" text
    )
    on conflict (user_id, attempt_id) do nothing
    returning qid, chosen, correct, ms
  ),
  totals as (
    select
      accepted.qid,
      count(*) filter (where accepted.chosen is not null) as attempts,
      count(*) filter (where accepted.chosen is not null and accepted.correct) as correct,
      coalesce(sum(accepted.ms) filter (where accepted.chosen is not null), 0) as total_ms
    from accepted
    group by accepted.qid
  )
  insert into public.question_stats (qid, attempts, correct, total_ms, avg_ms)
  select
    totals.qid,
    totals.attempts,
    totals.correct,
    totals.total_ms,
    case when totals.attempts = 0 then null else totals.total_ms / totals.attempts end
  from totals
  on conflict (qid) do update
    set attempts = question_stats.attempts + excluded.attempts,
        correct = question_stats.correct + excluded.correct,
        total_ms = question_stats.total_ms + excluded.total_ms,
        avg_ms = case
          when question_stats.attempts + excluded.attempts = 0 then null
          else (question_stats.total_ms + excluded.total_ms)
               / (question_stats.attempts + excluded.attempts)
        end,
        updated_at = now();

  -- Rebuild the per-day rows this batch can have changed, from the inbox itself
  -- (D-065). Recomputation, not incrementing, is what makes a resend and a
  -- correction-free retry harmless. The stored `day` is used for rows already
  -- in the inbox so a later clock does not move an old attempt to another day.
  with incoming as (
    select a.id, a.at
    from jsonb_to_recordset(v_attempts) as a(id text, at bigint)
  ),
  touched as (
    select public.ist_day(incoming.at, now(), v_server_ms) as day
    from incoming
    union
    select ai.day
    from public.attempt_inbox ai
    join incoming on incoming.id = ai.attempt_id
    where ai.user_id = v_user
  ),
  totals as (
    select
      ai.day,
      count(*) filter (where ai.chosen is not null) as attempted,
      count(*) filter (where ai.chosen is not null and ai.correct) as correct,
      coalesce(sum(ai.ms) filter (where ai.chosen is not null), 0) as ms
    from public.attempt_inbox ai
    where ai.user_id = v_user
      and ai.day in (select touched.day from touched)
    group by ai.day
  )
  insert into public.daily_stats (user_id, date, attempted, correct, ms)
  select v_user, totals.day, totals.attempted, totals.correct, totals.ms
  from totals
  on conflict (user_id, date) do update
    set attempted = excluded.attempted,
        correct = excluded.correct,
        ms = excluded.ms,
        updated_at = now();

  -- Reports are queued offline and collapsed on the device, so a duplicate is
  -- ignored rather than an error (F11).
  insert into public.question_reports (user_id, qid, qv, reason, at_ms)
  select v_user, r.qid, r.qv, r.reason, r.at
  from jsonb_to_recordset(v_reports) as r(qid text, qv integer, reason text, at bigint)
  on conflict (user_id, qid, qv, reason) do nothing;

  -- Corrections are delivered from a watermark with one hour of overlap. Both
  -- sides dedupe by correction id; the overlap covers a correction committed
  -- between our read and our watermark update (D-067).
  select s.last_corrections_at into v_since
  from public.sync_state s
  where s.user_id = v_user;

  v_since := coalesce(v_since, '-infinity'::timestamptz);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'qid', c.qid,
        'fromVersion', c.from_version,
        'toVersion', c.to_version,
        'oldAnswer', c.old_answer,
        'newAnswer', c.new_answer,
        'reason', c.reason,
        'correctedAt', to_char(c.corrected_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
      order by c.corrected_at, c.id
    ),
    '[]'::jsonb
  )
  into v_corrections
  from public.question_corrections c
  where c.corrected_at > v_since - interval '1 hour';

  -- `newCursor` is the newest position the server holds for this student, from
  -- any device. It only ever moves forward (D-040, D-066).
  select ai.at_ms, ai.attempt_id
  into v_max_at, v_max_id
  from public.attempt_inbox ai
  where ai.user_id = v_user
  order by ai.at_ms desc, ai.attempt_id collate "C" desc
  limit 1;

  select s.last_cursor into v_prev_cursor
  from public.sync_state s
  where s.user_id = v_user;

  if v_prev_cursor is not null then
    v_prev_at := split_part(v_prev_cursor, ':', 1)::bigint;
    v_prev_id := substr(v_prev_cursor, position(':' in v_prev_cursor) + 1);

    if v_max_at is null
      or v_max_at < v_prev_at
      or (v_max_at = v_prev_at and v_max_id collate "C" <= v_prev_id collate "C")
    then
      v_max_at := v_prev_at;
      v_max_id := v_prev_id;
    end if;
  end if;

  if v_max_at is not null then
    v_new_cursor := v_max_at::text || ':' || v_max_id;
  end if;

  insert into public.sync_state (user_id, last_cursor, last_corrections_at, last_batch_at)
  values (v_user, v_new_cursor, now(), now())
  on conflict (user_id) do update
    set last_cursor = excluded.last_cursor,
        last_corrections_at = excluded.last_corrections_at,
        last_batch_at = excluded.last_batch_at,
        updated_at = now();

  v_response := jsonb_build_object(
    'ok', true,
    'serverTime', v_server_ms,
    'newCursor', v_new_cursor,
    'corrections', v_corrections
  );

  update public.sync_batches
  set response = v_response
  where user_id = v_user and batch_id = v_batch_id;

  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- sync_pull: history download for a new or second device (F7)
-- ---------------------------------------------------------------------------

create or replace function public.sync_pull(
  p_after text default null,
  p_limit integer default 200
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_at bigint;
  v_id text;
  v_found integer;
  v_attempts jsonb;
  v_has_more boolean;
  v_next_cursor text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'limit must be between 1 and 500' using errcode = '22023';
  end if;

  if p_after is not null then
    if p_after !~ '^[0-9]+:[^:]+$' then
      raise exception 'cursor must look like "<at>:<id>"' using errcode = '22023';
    end if;
    v_at := split_part(p_after, ':', 1)::bigint;
    v_id := substr(p_after, position(':' in p_after) + 1);
  end if;

  select count(*) into v_found
  from (
    select 1
    from public.attempt_inbox ai
    where ai.user_id = v_user
      and (
        p_after is null
        or ai.at_ms > v_at
        or (ai.at_ms = v_at and ai.attempt_id collate "C" > v_id collate "C")
      )
    order by ai.at_ms, ai.attempt_id collate "C"
    limit p_limit + 1
  ) page;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.attempt_id,
        'qid', page.qid,
        'qv', page.qv,
        'chosen', page.chosen,
        'correct', page.correct,
        'ms', page.ms,
        'mode', page.mode,
        'at', page.at_ms,
        'deviceId', page.device_id
      ) || case
        when page.mock_id is null then '{}'::jsonb
        else jsonb_build_object('mockId', page.mock_id)
      end
      order by page.at_ms, page.attempt_id collate "C"
    ),
    '[]'::jsonb
  )
  into v_attempts
  from (
    select ai.*
    from public.attempt_inbox ai
    where ai.user_id = v_user
      and (
        p_after is null
        or ai.at_ms > v_at
        or (ai.at_ms = v_at and ai.attempt_id collate "C" > v_id collate "C")
      )
    order by ai.at_ms, ai.attempt_id collate "C"
    limit p_limit
  ) page;

  v_has_more := v_found > p_limit;
  v_next_cursor := p_after;

  if jsonb_array_length(v_attempts) > 0 then
    v_next_cursor := (v_attempts -> -1 ->> 'at') || ':' || (v_attempts -> -1 ->> 'id');
  end if;

  return jsonb_build_object(
    'ok', true,
    'serverTime', (extract(epoch from now()) * 1000)::bigint,
    'attempts', v_attempts,
    'nextCursor', v_next_cursor,
    'hasMore', v_has_more
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- compact_sync_inbox: nightly maintenance (F9, D-066)
-- ---------------------------------------------------------------------------

-- Deletes only attempts already folded into the newest checkpoint, and only
-- forgets a batch idempotency key once it has no inbox rows left. 7A writes no
-- checkpoints yet, so the month-boundary job is safe to schedule now and will
-- start reclaiming space when checkpoint writing lands in 7A-2.
create or replace function public.compact_sync_inbox(
  p_batch_retention interval default interval '90 days'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer := 0;
  v_batches integer := 0;
begin
  if p_batch_retention < interval '1 day' then
    raise exception 'retention must be at least one day' using errcode = '22023';
  end if;

  with newest as (
    select distinct on (c.user_id) c.user_id, c.cursor
    from public.checkpoints c
    order by c.user_id, c.created_at desc, c.id desc
  )
  delete from public.attempt_inbox ai
  using newest n
  where ai.user_id = n.user_id
    and (
      ai.at_ms < split_part(n.cursor, ':', 1)::bigint
      or (
        ai.at_ms = split_part(n.cursor, ':', 1)::bigint
        and ai.attempt_id collate "C"
            <= substr(n.cursor, position(':' in n.cursor) + 1) collate "C"
      )
    );

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
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.apply_sync_batch(jsonb) from public;
grant execute on function public.apply_sync_batch(jsonb) to authenticated;

revoke all on function public.sync_pull(text, integer) from public;
grant execute on function public.sync_pull(text, integer) to authenticated;

revoke all on function public.compact_sync_inbox(interval) from public;
grant execute on function public.compact_sync_inbox(interval) to service_role;
