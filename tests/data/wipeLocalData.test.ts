import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONTENT_TABLES,
  PERSONAL_TABLES,
  openDatabase,
  wipeLocalData,
  type AppDatabase,
} from '../../src/data/database';

let db: AppDatabase;

beforeEach(async () => {
  db = await openDatabase(`cgl-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

/**
 * One row per table. The shapes are minimal on purpose: these tests are about
 * which tables are cleared, not about the row types, which the repository
 * tests already cover.
 */
async function fillEveryTable(): Promise<void> {
  const rows: Record<string, unknown> = {
    questions: { id: 'q-1', v: 1, packId: 'p', section: 'polity', subtopic: 's', eloSeed: 1200 },
    packs: { id: 'p', version: 1, sha256: 'x', installedAt: 1 },
    corrections: { id: 'c-1', qid: 'q-1', toVersion: 2, seen: 0 },
    attempts: { id: 'a-1', qid: 'q-1', at: 1, synced: 0 },
    cardState: { qid: 'q-1', due: 1, phase: 'review' },
    skills: { subtopicId: 's', elo: 1200 },
    bookmarks: { qid: 'q-1', createdAt: 1 },
    dailySummary: { date: '2026-11-12', attempted: 1, correct: 1, ms: 1 },
    reports: { qid: 'q-1', qv: 1, reason: 'typo', at: 1, sent: 0 },
    settings: { id: 'app', language: 'hi', updatedAt: 1 },
    syncMeta: { id: 'device', deviceId: 'd-1', cursor: null, lastSyncAt: null, accountId: 'u-1' },
  };
  for (const table of db.tables) {
    const row = rows[table.name];
    if (row === undefined) throw new Error(`no test row for table ${table.name}`);
    await table.put(row);
  }
}

describe('wipeLocalData', () => {
  it('classifies every table as personal or content', () => {
    const classified = [...PERSONAL_TABLES, ...CONTENT_TABLES].sort();
    expect(db.tables.map((table) => table.name).sort()).toEqual(classified);
  });

  it('erases every personal table and keeps installed content', async () => {
    await fillEveryTable();

    await wipeLocalData(db);

    for (const name of PERSONAL_TABLES) {
      expect(await db.table(name).count(), name).toBe(0);
    }
    for (const name of CONTENT_TABLES) {
      expect(await db.table(name).count(), name).toBe(1);
    }
  });

  it('is a no-op on an empty database', async () => {
    await expect(wipeLocalData(db)).resolves.toBeUndefined();
  });
});
