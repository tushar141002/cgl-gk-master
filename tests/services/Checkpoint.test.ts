import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  compareCursor,
  encodeCursor,
  type AttemptRecord,
  type Checkpoint,
  type Cursor,
  type OptionIndex,
  type PullResponse,
  type Question,
} from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { SyncRepository } from '../../src/data/repositories/SyncRepository';
import {
  CHECKPOINT_EVERY_MS,
  CHECKPOINT_MIN_AGE_MS,
  CheckpointService,
} from '../../src/services/CheckpointService';
import { HistoryError, HistoryService } from '../../src/services/HistoryService';
import type {
  CheckpointTransport,
  CheckpointUpload,
  LatestCheckpointResponse,
  PutCheckpointResponse,
} from '../../src/sync/CheckpointTransport';
import { buildReplayIndex, replaceDerived } from '../../src/sync/derived';
import type { PullTransport } from '../../src/sync/SyncTransport';

const DAY = 24 * 60 * 60_000;
const NOW = Date.UTC(2026, 10, 14, 6, 0, 0);

const opened: AppDatabase[] = [];

async function freshDb(): Promise<AppDatabase> {
  const db = await openDatabase(`cgl-checkpoint-${crypto.randomUUID()}`);
  await new SyncRepository(db).ensureDeviceId(() => 'device-test');
  await new QuestionRepository(db).putMany(['q-1', 'q-2', 'q-3'].map(question));
  opened.push(db);
  return db;
}

let db: AppDatabase;

beforeEach(async () => {
  db = await freshDb();
});

afterEach(async () => {
  for (const each of opened.splice(0)) await each.delete();
});

function question(id: string): Question {
  return {
    id,
    v: 1,
    packId: 'pack-1',
    section: 'polity',
    subtopic: id === 'q-3' ? 'polity-parliament' : 'polity-fundamental-rights',
    source: { type: 'practice' },
    en: { q: `Question ${id}`, options: ['A', 'B', 'C', 'D'], explanation: 'Because.' },
    hi: null,
    answer: 0,
    eloSeed: 1200,
    verifiedAt: '2026-11-07T00:00:00.000Z',
  };
}

/** About two attempts a day for 80 days, a mix of right, wrong and skipped. */
function history(): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  for (let i = 0; i < 160; i += 1) {
    const at = NOW - 80 * DAY + i * 12 * 60 * 60_000 + (i % 7) * 60_000;
    const chosen: OptionIndex | null = i % 9 === 0 ? null : ((i % 3) as OptionIndex);
    out.push({
      id: `a-${String(i).padStart(4, '0')}`,
      qid: ['q-1', 'q-2', 'q-3'][i % 3]!,
      qv: 1,
      chosen,
      correct: chosen === 0,
      ms: 2_000 + i,
      mode: 'practice',
      at,
      deviceId: 'device-test',
    });
  }
  return out;
}

async function seedLog(
  target: AppDatabase,
  attempts: readonly AttemptRecord[],
  synced: 0 | 1 = 1,
): Promise<void> {
  await target.attempts.bulkPut(attempts.map((attempt) => ({ ...attempt, synced })));
}

async function rebuild(target: AppDatabase): Promise<void> {
  await target.transaction(
    'rw',
    [
      target.attempts,
      target.questions,
      target.corrections,
      target.cardState,
      target.skills,
      target.dailySummary,
      target.syncMeta,
    ],
    async () => {
      const index = buildReplayIndex(await target.questions.toArray(), await target.corrections.toArray());
      await replaceDerived(target, await target.attempts.toArray(), index);
    },
  );
}

async function derived(target: AppDatabase): Promise<unknown> {
  return {
    cards: await target.cardState.orderBy('qid').toArray(),
    skills: await target.skills.orderBy('subtopicId').toArray(),
    daily: await target.dailySummary.orderBy('date').toArray(),
  };
}

class FakeCheckpoints implements CheckpointTransport {
  uploads: CheckpointUpload[] = [];
  putReply: () => PutCheckpointResponse = () => ({ ok: true });
  latestReply: () => LatestCheckpointResponse = () => ({ ok: true, checkpoint: null });
  latestCalls = 0;

  async put(checkpoint: CheckpointUpload): Promise<PutCheckpointResponse> {
    this.uploads.push(checkpoint);
    return this.putReply();
  }
  async latest(): Promise<LatestCheckpointResponse> {
    this.latestCalls += 1;
    return this.latestReply();
  }
}

class FakePull implements PullTransport {
  calls: (Cursor | null)[] = [];
  constructor(private readonly attempts: readonly AttemptRecord[]) {}
  async pull(after: Cursor | null): Promise<PullResponse> {
    this.calls.push(after);
    const last = this.attempts.at(-1);
    return {
      ok: true,
      serverTime: NOW,
      attempts: this.attempts,
      nextCursor: last === undefined ? after : encodeCursor(last.at, last.id),
      hasMore: false,
    };
  }
}

function writer(target: AppDatabase, transport: CheckpointTransport, now = NOW): CheckpointService {
  return new CheckpointService(target, { transport, now: () => now });
}

describe('CheckpointService', () => {
  it('uploads a checkpoint of synced attempts at least 30 days old', async () => {
    const log = history();
    await seedLog(db, log);
    const transport = new FakeCheckpoints();

    expect(await writer(db, transport).maybeWrite()).toBe('written');

    const [upload] = transport.uploads;
    const covered = log.filter((attempt) => attempt.at <= NOW - CHECKPOINT_MIN_AGE_MS);
    const last = covered.at(-1)!;
    expect(upload!.cursor).toBe(encodeCursor(last.at, last.id));
    expect(upload!.cardStates.map((card) => card.qid)).toEqual(['q-1', 'q-2', 'q-3']);
    expect(upload!.skills.map((skill) => skill.subtopicId)).toEqual([
      'polity-fundamental-rights',
      'polity-parliament',
    ]);
    expect(
      upload!.istDailyTotals.at(-1)!.date <= new Date(last.at + 5.5 * 3_600_000).toISOString().slice(0, 10),
    ).toBe(true);
  });

  it('waits a week between uploads', async () => {
    await seedLog(db, history());
    const transport = new FakeCheckpoints();

    await writer(db, transport).maybeWrite();
    expect(await writer(db, transport, NOW + CHECKPOINT_EVERY_MS - 1).maybeWrite()).toBe('skipped');
    expect(await writer(db, transport, NOW + CHECKPOINT_EVERY_MS).maybeWrite()).toBe('written');
    expect(transport.uploads).toHaveLength(2);
  });

  it('does not upload while an old attempt is unsynced', async () => {
    const log = history();
    await seedLog(db, log);
    await db.attempts.update(log[3]!.id, { synced: 0 });
    const transport = new FakeCheckpoints();

    expect(await writer(db, transport).maybeWrite()).toBe('unsynced');
    expect(transport.uploads).toHaveLength(0);
  });

  it('skips when nothing is old enough', async () => {
    await seedLog(
      db,
      history().filter((attempt) => attempt.at > NOW - CHECKPOINT_MIN_AGE_MS),
    );

    expect(await writer(db, new FakeCheckpoints()).maybeWrite()).toBe('skipped');
  });

  it('tries again on the next sync when the upload got no answer', async () => {
    await seedLog(db, history());
    const transport = new FakeCheckpoints();
    transport.putReply = () => {
      throw new TypeError('offline');
    };

    expect(await writer(db, transport).maybeWrite()).toBe('refused');
    transport.putReply = () => ({ ok: true });
    expect(await writer(db, transport, NOW + 60_000).maybeWrite()).toBe('written');
  });

  it('keeps rebuilding the writing phone from its own full log', async () => {
    await seedLog(db, history());
    await writer(db, new FakeCheckpoints()).maybeWrite();

    expect((await new SyncRepository(db).getMeta())?.checkpoint ?? null).toBeNull();
  });
});

describe('a new phone that starts from a checkpoint (D-026, D-091)', () => {
  it('ends up with exactly the same cards, skills and streak days as a full replay', async () => {
    const log = history();
    await seedLog(db, log);
    await rebuild(db);
    const full = await derived(db);

    const transport = new FakeCheckpoints();
    await writer(db, transport).maybeWrite();
    const upload = transport.uploads[0]!;
    const checkpoint: Checkpoint = { ...upload, createdAt: new Date(NOW).toISOString() };

    // The server has pruned everything the checkpoint covers.
    const tail = log.filter(
      (attempt) => compareCursor(encodeCursor(attempt.at, attempt.id), checkpoint.cursor) > 0,
    );
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.length).toBeLessThan(log.length);

    const phone = await freshDb();
    transport.latestReply = () => ({ ok: true, checkpoint });
    const summary = await new HistoryService(phone, {
      transport: new FakePull(tail),
      checkpoints: transport,
    }).pull();

    expect(summary.rebuilt).toBe(true);
    expect((await new SyncRepository(phone).getMeta())?.checkpoint?.cursor).toBe(checkpoint.cursor);
    expect(await phone.attempts.count()).toBe(tail.length);
    expect(await derived(phone)).toEqual(full);
  });

  it('keeps the checkpoint for later rebuilds, such as a correction', async () => {
    const log = history();
    await seedLog(db, log);
    const transport = new FakeCheckpoints();
    await writer(db, transport).maybeWrite();
    const checkpoint: Checkpoint = { ...transport.uploads[0]!, createdAt: new Date(NOW).toISOString() };
    const tail = log.filter(
      (attempt) => compareCursor(encodeCursor(attempt.at, attempt.id), checkpoint.cursor) > 0,
    );

    const phone = await freshDb();
    transport.latestReply = () => ({ ok: true, checkpoint });
    await new HistoryService(phone, { transport: new FakePull(tail), checkpoints: transport }).pull();
    const afterPull = await derived(phone);

    await rebuild(phone);
    expect(await derived(phone)).toEqual(afterPull);
  });

  it('stops the pull when the checkpoint cannot be fetched', async () => {
    const transport = new FakeCheckpoints();
    transport.latestReply = () => {
      throw new TypeError('offline');
    };
    const pull = new FakePull(history());

    await expect(
      new HistoryService(db, { transport: pull, checkpoints: transport }).pull(),
    ).rejects.toBeInstanceOf(HistoryError);
    expect(pull.calls).toHaveLength(0);
  });

  it('does not ask for a checkpoint on an incremental pull', async () => {
    await new SyncRepository(db).setHistoryCursor(encodeCursor(NOW - DAY, 'a-0001'));
    const transport = new FakeCheckpoints();

    await new HistoryService(db, { transport: new FakePull([]), checkpoints: transport }).pull();

    expect(transport.latestCalls).toBe(0);
  });
});
