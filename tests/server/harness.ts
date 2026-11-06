/**
 * A real Postgres for the sync backend tests.
 *
 * The migrations under `supabase/migrations/` are the deployed schema, so the
 * tests run them unchanged in PGlite (Postgres compiled to WASM) rather than
 * mocking SQL. Only Supabase's auth schema and API roles are shimmed, which is
 * what `tests/server/sql/auth-shim.sql` does.
 *
 * Everything here is test support: no behaviour lives in this file.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { PGlite } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('../../', import.meta.url));

export const MIGRATIONS_DIR = join(root, 'supabase', 'migrations');
const AUTH_SHIM = join(root, 'tests', 'server', 'sql', 'auth-shim.sql');

export type ApiRole = 'anon' | 'authenticated';

export interface TestDatabase {
  readonly db: PGlite;
  close(): Promise<void>;
}

/**
 * Boots an empty PGlite instance, applies the auth shim, then every migration in
 * filename order — exactly the order the Supabase CLI uses.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = new PGlite();

  await db.exec(readFileSync(AUTH_SHIM, 'utf8'));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    throw new Error(`no migrations found in ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  return {
    db,
    close: () => db.close(),
  };
}

/** Inserts an `auth.users` row, which also creates the profile via trigger. */
export async function createUser(db: PGlite, email: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  return id;
}

/**
 * Switches the session to an API role. `userId: null` keeps the role but clears
 * the JWT claim, which is how an expired or missing token looks to `auth.uid()`.
 */
export async function actAs(
  db: PGlite,
  userId: string | null,
  role: ApiRole = 'authenticated',
): Promise<void> {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.exec(`set role ${role}`);
}

/** Back to the migration owner: bypasses RLS, used to seed content and job runs. */
export async function actAsOwner(db: PGlite): Promise<void> {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", ['']);
}

/** Runs `body` as `userId` and always restores the owner role afterwards. */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  body: () => Promise<T>,
  role: ApiRole = 'authenticated',
): Promise<T> {
  await actAs(db, userId, role);
  try {
    return await body();
  } finally {
    await actAsOwner(db);
  }
}

/** The `code` of a thrown Postgres error, or `undefined` for a non-SQL failure. */
export function sqlState(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
