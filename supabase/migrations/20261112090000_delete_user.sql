-- 7D: account deletion (F12, D-086)
--
-- The DPDP Act and the feature list promise that a student can delete their
-- account from the app. Deleting only the auth user would leave the attempt log
-- and aggregates behind, so this function removes every row the student owns,
-- then the auth user, in one transaction.
--
-- What stays: `question_stats` and `question_corrections` hold no user id; they
-- are anonymous per-question aggregates and published content. When 7A-2 adds
-- the Storage archive (users/<id>/...), its objects must be removed through the
-- Storage API before this function runs; Postgres cannot delete them here.

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

  -- Explicit deletes, children first, so a future table whose foreign key
  -- forgets `on delete cascade` fails loudly in tests instead of keeping data.
  delete from public.question_reports where user_id = v_user;
  delete from public.daily_stats where user_id = v_user;
  delete from public.checkpoints where user_id = v_user;
  delete from public.attempt_inbox where user_id = v_user;
  delete from public.sync_batches where user_id = v_user;
  delete from public.sync_state where user_id = v_user;
  delete from public.profiles where user_id = v_user;

  -- Supabase also removes the user's sessions and refresh tokens with this row.
  -- The access token in the caller's hand stays valid until it expires (at most
  -- an hour) but owns nothing, so a retried call is harmless and returns ok.
  delete from auth.users where id = v_user;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
