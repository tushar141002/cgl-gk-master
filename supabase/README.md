# `supabase/` — sync backend (Step 7A)

Postgres migrations and one Edge Function. The client half of sync is 7B; the
nightly archive and checkpoint writer are 7A-2. Decisions live in `design.md`
(D-063…D-068); execution flow is F4 and F9 in `flow.md`.

## Layout

| Path | Purpose |
|---|---|
| `migrations/20261107090000_sync_core.sql` | Tables, constraints, indexes, profile trigger |
| `migrations/20261107090100_sync_rpc.sql` | RLS, grants, `ist_day`, `apply_sync_batch`, `sync_pull`, `compact_sync_inbox` |
| `functions/sync/index.ts` | `POST /sync`: method, bearer header, body cap, one RPC call |
| `../tests/server/` | PGlite harness, auth shim and the migration test suite |

`apply_sync_batch` owns every rule: validation, idempotency, attempt dedupe,
aggregate derivation, corrections, reports and the cursor. Keep the Edge
Function thin; anything that needs a test belongs in SQL.

## Apply the migrations

With the Supabase CLI and a linked project:

```sh
supabase link --project-ref <ref>
supabase db push
```

`supabase db push` applies files in filename order. Never edit an applied
migration: add a new one.

## Deploy the function

```sh
supabase functions deploy sync --no-verify-jwt
```

`--no-verify-jwt` is required because the function authenticates from the
`Authorization` header itself and forwards it to PostgREST; the RPC still sees
the student's JWT and `auth.uid()` is never bypassed.

## Schedule compaction

`compact_sync_inbox()` is executable only by `service_role`. Schedule it from
`pg_cron` (or a scheduled Edge Function using the service key) once a night:

```sql
select cron.schedule(
  'compact-sync-inbox',
  '30 20 * * *',            -- 02:00 IST
  $$select public.compact_sync_inbox(interval '90 days')$$
);
```

On a 7A database no checkpoints exist yet, so the job deletes only stale batch
keys. It starts removing attempts when 7A-2 writes checkpoints.

## Run the backend tests

```sh
npm test -- tests/server
```

`tests/server/harness.ts` boots `@electric-sql/pglite`, applies
`tests/server/sql/auth-shim.sql` (only `auth.users`, `auth.uid()` and the three
API roles) and then every migration. Tests act as `authenticated` or `anon`
with `set role`, so policies are exercised as a non-owner. PGlite is Postgres,
not Supabase: PostgREST, auth and storage are not covered.

## Response codes

| SQLSTATE / state | HTTP | Body `error` |
|---|---|---|
| — | 200 | `{ ok: true, … }` |
| `28000` | 401 | `unauthenticated` |
| `42501` | 403 | `forbidden` |
| `22023`, `22P02`, `23502`, `23505`, `23514` | 400 | `invalid_batch` |
| `57014` | 503 | `timeout` |
| anything else | 500 | `sync_failed` |
| `batch_in_progress` result | 503 | `{ ok: false, error: "batch_in_progress", retryAfterMs: 1000 }` |
