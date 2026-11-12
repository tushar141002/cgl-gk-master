// Supabase Edge Function: POST /sync (F4, D-064).
//
// Deno-only adapter, deliberately excluded from `tsconfig.json`. It does three
// things — check the method, cap the body and forward the signed-in request to
// `apply_sync_batch` — because the transaction, validation and idempotency all
// live in Postgres where they can be tested (see tests/server/SyncBackend.test.ts).

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/** Twice the largest legitimate batch: 200 attempts of ~1 KB plus overhead. */
const MAX_BODY_BYTES = 512 * 1024;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function failure(error: string, retryAfterMs?: number): Record<string, unknown> {
  return retryAfterMs === undefined ? { ok: false, error } : { ok: false, error, retryAfterMs };
}

/** Maps a Postgres SQLSTATE to the client contract; never leaks a message. */
function statusFor(code: string | undefined): [number, string] {
  switch (code) {
    case '28000':
      return [401, 'unauthenticated'];
    case '42501':
      return [403, 'forbidden'];
    case '22023':
    case '22P02':
    case '23502':
    case '23505':
    case '23514':
      return [400, 'invalid_batch'];
    case '57014':
      return [503, 'timeout'];
    default:
      return [500, 'sync_failed'];
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json(failure('method_not_allowed'), 405);
  }

  const authorization = request.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return json(failure('unauthenticated'), 401);
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(failure('batch_too_large'), 413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return json(failure('batch_too_large'), 413);
  }

  let batch: unknown;
  try {
    batch = JSON.parse(text);
  } catch {
    return json(failure('invalid_json'), 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('apply_sync_batch', { p_batch: batch });

  if (error !== null) {
    const [status, code] = statusFor(error.code);
    return json(failure(code), status);
  }

  if (typeof data === 'object' && data !== null && 'ok' in data && data.ok === false) {
    // `rate_limited` (D-088) is the student's own pace; the body's
    // `retryAfterMs` is what the client reads.
    if ('error' in data && data.error === 'rate_limited') return json(data, 429);
    // `batch_in_progress`: a concurrent retry is still committing.
    return json(data, 503);
  }

  return json(data, 200);
});
