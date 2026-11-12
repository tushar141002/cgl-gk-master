-- 7D: per-user rate limit on sync (PROJECT_SPEC.md §9, D-088)
--
-- The batch size cap (200 attempts) bounds one request; nothing bounded how many
-- requests a student, or a modified APK with a stolen token, could send. A real
-- phone sends one batch every five minutes, plus a short burst after sign-in
-- while a guest log uploads (200 attempts per batch). The limit counts new
-- batches per user per minute and refuses the rest with a retry hint, which the
-- client's backoff already honours (D-070).
--
-- The original function is kept, renamed and no longer callable by students;
-- `apply_sync_batch` becomes a thin wrapper that checks the limit and calls it.
-- A retried batch id is always let through, so a lost response can be replayed
-- even while the student is over the limit (D-067).

alter function public.apply_sync_batch(jsonb) rename to apply_sync_batch_unthrottled;

revoke all on function public.apply_sync_batch_unthrottled(jsonb) from public;
revoke all on function public.apply_sync_batch_unthrottled(jsonb) from authenticated;

-- New batches allowed per user in any 60-second window.
create or replace function public.sync_rate_limit()
returns integer
language sql
immutable
as $$ select 30 $$;

create or replace function public.apply_sync_batch(p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_batch_id text;
  v_recent integer;
  v_oldest timestamptz;
  v_wait_ms bigint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(p_batch) = 'object' then
    v_batch_id := p_batch ->> 'batchId';
  end if;

  -- A batch already stored is a replay: answer it whatever the rate.
  if v_batch_id is null or not exists (
    select 1 from public.sync_batches
    where user_id = v_user and batch_id = v_batch_id
  ) then
    select count(*), min(received_at)
    into v_recent, v_oldest
    from public.sync_batches
    where user_id = v_user and received_at > now() - interval '60 seconds';

    if v_recent >= public.sync_rate_limit() then
      v_wait_ms := greatest(
        1000,
        ceil(extract(epoch from (v_oldest + interval '60 seconds' - now())) * 1000)::bigint
      );
      return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retryAfterMs', v_wait_ms);
    end if;
  end if;

  return public.apply_sync_batch_unthrottled(p_batch);
end;
$$;

revoke all on function public.apply_sync_batch(jsonb) from public;
grant execute on function public.apply_sync_batch(jsonb) to authenticated;
