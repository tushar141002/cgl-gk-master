-- 7E: live mocks (F8, D-012, D-029, D-090)
--
-- A live mock is the only source of leaderboard ranks, so everything that
-- matters for fairness happens here: the question draw, the start time, the
-- deadline, grading and ranking. The phone only displays questions and records
-- choices. Questions live in `mock_pool`, which no student can read; a student
-- sees the questions of their own session through `start_mock`, without
-- answers, and the answers only after the mock has closed (`mock_review`).
--
-- Mocks are created by an admin with SQL (service role); there is no admin
-- screen yet.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.mock_tests (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  title_en text not null check (length(title_en) between 1 and 120),
  title_hi text not null check (length(title_hi) between 1 and 120),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  duration_sec integer not null default 900 check (duration_sec between 60 and 10800),
  question_count integer not null default 25 check (question_count between 1 and 200),
  mark_correct numeric not null default 2 check (mark_correct > 0),
  mark_wrong numeric not null default 0.5 check (mark_wrong >= 0),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

-- The private question pool. `en`/`hi` are `{ q, options[4], explanation }`.
-- A pool larger than `question_count` gives students different draws (D-029).
create table public.mock_pool (
  mock_id text not null references public.mock_tests (id) on delete cascade,
  qid text not null,
  qv integer not null default 1 check (qv >= 1),
  en jsonb not null check (jsonb_typeof(en -> 'options') = 'array' and jsonb_array_length(en -> 'options') = 4),
  hi jsonb check (hi is null or (jsonb_typeof(hi -> 'options') = 'array' and jsonb_array_length(hi -> 'options') = 4)),
  answer smallint not null check (answer between 0 and 3),
  primary key (mock_id, qid)
);

-- One session per student per mock. `deadline_at` is fixed at start time from
-- the server clock, so the phone's clock cannot extend a test.
create table public.mock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mock_id text not null references public.mock_tests (id) on delete cascade,
  question_ids text[] not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'active' check (status in ('active', 'submitted')),
  score numeric,
  correct integer check (correct >= 0),
  wrong integer check (wrong >= 0),
  skipped integer check (skipped >= 0),
  time_ms bigint check (time_ms >= 0),
  -- Suspiciously fast; kept off the leaderboard but still shown to the student.
  flagged boolean not null default false,
  response jsonb,
  unique (user_id, mock_id),
  check (deadline_at > started_at)
);

create index mock_sessions_rank_idx
  on public.mock_sessions (mock_id, score desc, time_ms, submitted_at)
  where status = 'submitted' and not flagged;

create table public.mock_answers (
  session_id uuid not null references public.mock_sessions (id) on delete cascade,
  qid text not null,
  qv integer not null check (qv >= 1),
  chosen smallint check (chosen between 0 and 3),
  ms double precision not null check (ms >= 0),
  correct boolean not null,
  primary key (session_id, qid)
);

-- ---------------------------------------------------------------------------
-- Row-level security: students read mock definitions and their own sessions;
-- every write and every look at the pool goes through the functions below.
-- ---------------------------------------------------------------------------

alter table public.mock_tests enable row level security;
alter table public.mock_pool enable row level security;
alter table public.mock_sessions enable row level security;
alter table public.mock_answers enable row level security;

create policy mock_tests_read_all on public.mock_tests
  for select to authenticated using (true);

create policy mock_sessions_select_own on public.mock_sessions
  for select to authenticated using (user_id = auth.uid());

grant select on public.mock_tests to authenticated;
grant select on public.mock_sessions to authenticated;

-- Minutes after the deadline in which a submission is still accepted, so a
-- dropped 4G connection at the last second does not cost the attempt.
create or replace function public.mock_submit_grace()
returns interval
language sql
immutable
as $$ select interval '10 minutes' $$;

create or replace function public.epoch_ms(p_at timestamptz)
returns bigint
language sql
immutable
as $$ select (extract(epoch from p_at) * 1000)::bigint $$;

-- ---------------------------------------------------------------------------
-- list_mocks: recent and upcoming mocks with the caller's own status
-- ---------------------------------------------------------------------------

create or replace function public.list_mocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_mocks jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(item order by opens_at, id), '[]'::jsonb)
  into v_mocks
  from (
    select
      t.id,
      t.opens_at,
      jsonb_build_object(
        'id', t.id,
        'titleEn', t.title_en,
        'titleHi', t.title_hi,
        'opensAt', public.epoch_ms(t.opens_at),
        'closesAt', public.epoch_ms(t.closes_at),
        'durationSec', t.duration_sec,
        'questionCount', t.question_count,
        'markCorrect', t.mark_correct,
        'markWrong', t.mark_wrong,
        'session', case when s.id is null then null else jsonb_build_object(
          'id', s.id,
          'status', case
            when s.status = 'submitted' then 'submitted'
            when now() > s.deadline_at + public.mock_submit_grace() then 'expired'
            else 'active'
          end,
          'deadlineAt', public.epoch_ms(s.deadline_at),
          'score', s.score,
          'correct', s.correct,
          'wrong', s.wrong,
          'skipped', s.skipped
        ) end
      ) as item
    from public.mock_tests t
    left join public.mock_sessions s on s.mock_id = t.id and s.user_id = v_user
    where t.closes_at > now() - interval '14 days'
      and t.opens_at < now() + interval '14 days'
  ) rows;

  return jsonb_build_object(
    'ok', true,
    'serverTime', public.epoch_ms(now()),
    'mocks', v_mocks
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- start_mock: draw (or resume) the caller's questions, without answers
-- ---------------------------------------------------------------------------

create or replace function public.start_mock(p_mock_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_mock public.mock_tests;
  v_session public.mock_sessions;
  v_draw text[];
  v_questions jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_mock from public.mock_tests where id = p_mock_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_session
  from public.mock_sessions
  where user_id = v_user and mock_id = p_mock_id;

  if found then
    if v_session.status = 'submitted' then
      return jsonb_build_object('ok', false, 'error', 'already_submitted');
    end if;
    if now() > v_session.deadline_at + public.mock_submit_grace() then
      return jsonb_build_object('ok', false, 'error', 'expired');
    end if;
  else
    if now() < v_mock.opens_at then
      return jsonb_build_object('ok', false, 'error', 'not_open');
    end if;
    if now() >= v_mock.closes_at then
      return jsonb_build_object('ok', false, 'error', 'closed');
    end if;

    select array_agg(qid)
    into v_draw
    from (
      select qid from public.mock_pool
      where mock_id = p_mock_id
      order by random()
      limit v_mock.question_count
    ) drawn;

    if v_draw is null or cardinality(v_draw) < v_mock.question_count then
      return jsonb_build_object('ok', false, 'error', 'unavailable');
    end if;

    -- A concurrent first tap from a second request finds the row it lost to.
    insert into public.mock_sessions (user_id, mock_id, question_ids, deadline_at)
    values (
      v_user,
      p_mock_id,
      v_draw,
      least(now() + make_interval(secs => v_mock.duration_sec), v_mock.closes_at)
    )
    on conflict (user_id, mock_id) do nothing;

    select * into v_session
    from public.mock_sessions
    where user_id = v_user and mock_id = p_mock_id;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'qid', p.qid,
      'qv', p.qv,
      'en', jsonb_build_object('q', p.en -> 'q', 'options', p.en -> 'options'),
      'hi', case when p.hi is null then null
                 else jsonb_build_object('q', p.hi -> 'q', 'options', p.hi -> 'options') end
    )
    order by d.ord
  )
  into v_questions
  from unnest(v_session.question_ids) with ordinality as d (qid, ord)
  join public.mock_pool p on p.mock_id = p_mock_id and p.qid = d.qid;

  return jsonb_build_object(
    'ok', true,
    'serverTime', public.epoch_ms(now()),
    'sessionId', v_session.id,
    'mockId', p_mock_id,
    'startedAt', public.epoch_ms(v_session.started_at),
    'deadlineAt', public.epoch_ms(v_session.deadline_at),
    'questions', v_questions
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_mock: grade on the server, once (the spec's `grade_mock`)
-- ---------------------------------------------------------------------------

create or replace function public.submit_mock(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_session public.mock_sessions;
  v_mock public.mock_tests;
  v_item jsonb;
  v_qid text;
  v_chosen smallint;
  v_ms double precision;
  v_seen text[] := '{}';
  v_correct integer;
  v_wrong integer;
  v_answered integer;
  v_total integer;
  v_score numeric;
  v_end timestamptz;
  v_time_ms bigint;
  v_response jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_session
  from public.mock_sessions
  where id = p_session_id and user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A retried submit after a lost response gets the first answer back.
  if v_session.status = 'submitted' then
    return v_session.response;
  end if;

  if now() > v_session.deadline_at + public.mock_submit_grace() then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'answers must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_answers) > cardinality(v_session.question_ids) then
    raise exception 'more answers than questions' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'every answer must be a JSON object' using errcode = '22023';
    end if;

    v_qid := v_item ->> 'qid';
    if v_qid is null or not (v_qid = any (v_session.question_ids)) then
      raise exception 'answer for a question not in this session' using errcode = '22023';
    end if;
    if v_qid = any (v_seen) then
      raise exception 'question answered twice' using errcode = '22023';
    end if;
    v_seen := v_seen || v_qid;

    if v_item -> 'chosen' is null or jsonb_typeof(v_item -> 'chosen') = 'null' then
      v_chosen := null;
    elsif jsonb_typeof(v_item -> 'chosen') = 'number'
          and (v_item ->> 'chosen') in ('0', '1', '2', '3') then
      v_chosen := (v_item ->> 'chosen')::smallint;
    else
      raise exception 'chosen must be 0-3 or null' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'ms') is distinct from 'number' or (v_item ->> 'ms')::double precision < 0 then
      raise exception 'ms must be a non-negative number' using errcode = '22023';
    end if;
    v_ms := (v_item ->> 'ms')::double precision;

    insert into public.mock_answers (session_id, qid, qv, chosen, ms, correct)
    select v_session.id, p.qid, p.qv, v_chosen, v_ms, coalesce(v_chosen = p.answer, false)
    from public.mock_pool p
    where p.mock_id = v_session.mock_id and p.qid = v_qid;
  end loop;

  select * into v_mock from public.mock_tests where id = v_session.mock_id;

  select
    count(*) filter (where correct),
    count(*) filter (where chosen is not null and not correct),
    count(*) filter (where chosen is not null)
  into v_correct, v_wrong, v_answered
  from public.mock_answers
  where session_id = v_session.id;

  v_total := cardinality(v_session.question_ids);
  v_score := v_correct * v_mock.mark_correct - v_wrong * v_mock.mark_wrong;
  v_end := least(now(), v_session.deadline_at);
  v_time_ms := greatest(0, public.epoch_ms(v_end) - public.epoch_ms(v_session.started_at));

  v_response := jsonb_build_object(
    'ok', true,
    'sessionId', v_session.id,
    'mockId', v_session.mock_id,
    'score', v_score,
    'maxScore', v_total * v_mock.mark_correct,
    'correct', v_correct,
    'wrong', v_wrong,
    'skipped', v_total - v_correct - v_wrong,
    'timeMs', v_time_ms
  );

  update public.mock_sessions
  set status = 'submitted',
      submitted_at = now(),
      score = v_score,
      correct = v_correct,
      wrong = v_wrong,
      skipped = v_total - v_correct - v_wrong,
      time_ms = v_time_ms,
      -- Under two seconds per answered question is faster than reading it.
      flagged = v_answered > 0 and v_time_ms < v_answered * 2000,
      response = v_response
  where id = v_session.id;

  return v_response;
end;
$$;

-- ---------------------------------------------------------------------------
-- mock_leaderboard: score, then time taken, then submitted-at (D-029)
-- ---------------------------------------------------------------------------

create or replace function public.mock_leaderboard(p_mock_id text, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_top jsonb;
  v_me jsonb;
  v_total integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;

  with ranked as (
    select
      rank() over (order by s.score desc, s.time_ms asc, s.submitted_at asc) as rank,
      row_number() over (order by s.score desc, s.time_ms asc, s.submitted_at asc, s.id) as position,
      s.user_id,
      -- Only a name the student chose is shown; nobody's email ever is.
      coalesce(nullif(trim(pr.name), ''), 'Student') as name,
      s.score,
      s.time_ms
    from public.mock_sessions s
    left join public.profiles pr on pr.user_id = s.user_id
    where s.mock_id = p_mock_id and s.status = 'submitted' and not s.flagged
  )
  select
    (select count(*) from ranked),
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'rank', rank, 'name', name, 'score', score, 'timeMs', time_ms, 'isMe', user_id = v_user
       ) order by position)
       from ranked where position <= p_limit),
      '[]'::jsonb
    ),
    (select jsonb_build_object('rank', rank, 'name', name, 'score', score, 'timeMs', time_ms, 'isMe', true)
     from ranked where user_id = v_user)
  into v_total, v_top, v_me;

  return jsonb_build_object('ok', true, 'total', v_total, 'top', v_top, 'me', v_me);
end;
$$;

-- ---------------------------------------------------------------------------
-- mock_review: answers and explanations, only after the mock has closed
-- ---------------------------------------------------------------------------

create or replace function public.mock_review(p_mock_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_mock public.mock_tests;
  v_session public.mock_sessions;
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_mock from public.mock_tests where id = p_mock_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- Revealing answers while the window is open would let one student share
  -- the key with everyone who has not started yet.
  if now() < v_mock.closes_at then
    return jsonb_build_object('ok', false, 'error', 'not_closed', 'closesAt', public.epoch_ms(v_mock.closes_at));
  end if;

  select * into v_session
  from public.mock_sessions
  where user_id = v_user and mock_id = p_mock_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_session');
  end if;

  select jsonb_agg(jsonb_build_object(
    'qid', p.qid,
    'en', p.en,
    'hi', p.hi,
    'answer', p.answer,
    'chosen', a.chosen
  ) order by d.ord)
  into v_items
  from unnest(v_session.question_ids) with ordinality as d (qid, ord)
  join public.mock_pool p on p.mock_id = p_mock_id and p.qid = d.qid
  left join public.mock_answers a on a.session_id = v_session.id and a.qid = d.qid;

  return jsonb_build_object('ok', true, 'items', coalesce(v_items, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion now covers mock data too (D-086)
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

revoke all on function public.list_mocks() from public;
grant execute on function public.list_mocks() to authenticated;

revoke all on function public.start_mock(text) from public;
grant execute on function public.start_mock(text) to authenticated;

revoke all on function public.submit_mock(uuid, jsonb) from public;
grant execute on function public.submit_mock(uuid, jsonb) to authenticated;

revoke all on function public.mock_leaderboard(text, integer) from public;
grant execute on function public.mock_leaderboard(text, integer) to authenticated;

revoke all on function public.mock_review(text) from public;
grant execute on function public.mock_review(text) to authenticated;
