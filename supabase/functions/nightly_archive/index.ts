// Supabase Edge Function: nightly archive (F9, D-027, D-091).
//
// Deno-only adapter, excluded from `tsconfig.json` like `sync/index.ts`. It
// wires the service-role client and the Storage bucket into `runArchive`; all
// logic and its tests live in `_shared/archiveJob.ts`.
//
// Schedule it once a night (e.g. 21:00 UTC, 02:30 IST) with Supabase Cron, and
// call it with the header `x-cron-secret: <ARCHIVE_CRON_SECRET>`. The bucket
// `attempt-archive` must exist and be private.

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import type { ArchivedAttempt } from '../_shared/archiveCodec.ts';
import { runArchive, type PendingGroup } from '../_shared/archiveJob.ts';

const BUCKET = 'attempt-archive';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('ARCHIVE_CRON_SECRET') ?? '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (CRON_SECRET.length < 32 || request.headers.get('x-cron-secret') !== CRON_SECRET) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(name, args);
    if (error !== null) throw new Error(`${name}: ${error.message}`);
    return data as T;
  }

  const summary = await runArchive({
    pending: (limit) => rpc<PendingGroup[]>('archive_pending', { p_limit: limit }),
    attempts: (userId, day) => rpc<ArchivedAttempt[]>('archive_attempts', { p_user: userId, p_day: day }),
    async upload(path, data) {
      const { error } = await admin.storage.from(BUCKET).upload(path, data, {
        contentType: 'application/gzip',
        upsert: false,
      });
      if (error !== null) throw new Error(`upload ${path}: ${error.message}`);
    },
    async record(input) {
      await rpc('record_archive', {
        p_user: input.userId,
        p_day: input.day,
        p_part: input.part,
        p_path: input.path,
        p_attempt_ids: input.attemptIds,
        p_bytes: input.bytes,
        p_sha256: input.sha256,
      });
    },
    async listUserFolders() {
      const { data, error } = await admin.storage.from(BUCKET).list('users', { limit: 10000 });
      if (error !== null) throw new Error(`list users: ${error.message}`);
      return (data ?? []).map((entry) => entry.name);
    },
    orphans: (userIds) => rpc<string[]>('archive_orphans', { p_user_ids: userIds }),
    async removeFolder(userId) {
      const prefix = `users/${userId}`;
      const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 10000 });
      if (error !== null) throw new Error(`list ${prefix}: ${error.message}`);
      const paths = (data ?? []).map((entry) => `${prefix}/${entry.name}`);
      if (paths.length === 0) return 0;
      const removed = await admin.storage.from(BUCKET).remove(paths);
      if (removed.error !== null) throw new Error(`remove ${prefix}: ${removed.error.message}`);
      return paths.length;
    },
    compact: () => rpc('compact_sync_inbox', {}),
    log: (message) => console.warn(message),
  });

  return json({ ok: true, ...summary });
});
