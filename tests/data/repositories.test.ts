import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord, CardState, OptionIndex, Question, SectionId } from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { AttemptRepository } from '../../src/data/repositories/AttemptRepository';
import { CardRepository } from '../../src/data/repositories/CardRepository';
import { DailyRepository } from '../../src/data/repositories/DailyRepository';
import { PackRepository } from '../../src/data/repositories/PackRepository';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { SettingsRepository } from '../../src/data/repositories/SettingsRepository';
import { SyncRepository } from '../../src/data/repositories/SyncRepository';

let db: AppDatabase;

beforeEach(async () => {
  db = await openDatabase(`cgl-test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

function question(
  id: string,
  section: SectionId,
  subtopic: string,
  eloSeed: number,
  answer: OptionIndex = 0,
): Question {
  return {
    id,
    v: 1,
    packId: 'pack-1',
    section,
    subtopic,
    source: { type: 'PYQ', exam: 'SSC CGL', year: 2023 },
    en: { q: `Question ${id}`, options: ['A', 'B', 'C', 'D'], explanation: 'Because.' },
    hi: { q: `प्रश्न ${id}`, options: ['अ', 'ब', 'स', 'द'], explanation: 'क्योंकि।' },
    answer,
    eloSeed,
    verifiedAt: '2026-11-01T00:00:00.000Z',
  };
}

function attempt(id: string, qid: string, at: number): AttemptRecord {
  return {
    id,
    qid,
    qv: 1,
    chosen: 0,
    correct: true,
    ms: 1_200,
    mode: 'practice',
    at,
    deviceId: 'device-test',
  };
}

function card(qid: string, due: number): CardState {
  return {
    qid,
    due,
    stability: 1,
    stabilityFast: 1,
    difficulty: 5,
    scheduledDays: 1,
    learningStep: 0,
    reps: 1,
    lapses: 0,
    lastReview: null,
    phase: 'review',
  };
}

describe('SettingsRepository', () => {
  it('creates defaults once and reports whether it created them', async () => {
    const repo = new SettingsRepository(db);

    const first = await repo.ensure(1_000);
    expect(first.created).toBe(true);
    expect(first.settings).toEqual({
      language: 'en',
      theme: 'light',
      dailyGoal: 10,
      examDate: null,
      reminderTime: null,
    });

    const second = await repo.ensure(2_000);
    expect(second.created).toBe(false);
    expect(second.settings).toEqual(first.settings);
  });

  it('merges a patch and keeps the other values', async () => {
    const repo = new SettingsRepository(db);
    await repo.ensure();

    const dark = await repo.update({ theme: 'dark' });
    expect(dark.theme).toBe('dark');
    expect(dark.language).toBe('en');

    const hindi = await repo.update({ language: 'hi' });
    expect(hindi).toEqual({ ...dark, language: 'hi' });
    expect(await repo.get()).toEqual(hindi);
  });

  it('can set a nullable field back to null', async () => {
    const repo = new SettingsRepository(db);
    await repo.update({ examDate: '2027-06-01' });
    const cleared = await repo.update({ examDate: null });
    expect(cleared.examDate).toBeNull();
  });

  it('keeps both changes when two updates overlap', async () => {
    const repo = new SettingsRepository(db);

    await Promise.all([repo.update({ theme: 'dark' }), repo.update({ language: 'hi' })]);

    expect(await repo.get()).toEqual({
      language: 'hi',
      theme: 'dark',
      dailyGoal: 10,
      examDate: null,
      reminderTime: null,
    });
  });
});

describe('SyncRepository', () => {
  it('mints one device id and returns the stored one afterwards', async () => {
    const repo = new SyncRepository(db);
    const deviceId = await repo.ensureDeviceId(() => 'device-fixed');
    expect(deviceId).toBe('device-fixed');

    const again = await repo.ensureDeviceId(() => 'device-other');
    expect(again).toBe('device-fixed');
  });

  it('records the server cursor', async () => {
    const repo = new SyncRepository(db);
    await repo.ensureDeviceId(() => 'device-fixed');

    await repo.setCursor('1700000000000:attempt-1', 1_700_000_100_000);
    expect(await repo.getMeta()).toEqual({
      id: 'device',
      deviceId: 'device-fixed',
      cursor: '1700000000000:attempt-1',
      lastSyncAt: 1_700_000_100_000,
    });
  });

  it('refuses a cursor before the device exists', async () => {
    await expect(new SyncRepository(db).setCursor('1:a', 1)).rejects.toThrow(/ensureDeviceId/);
  });
});

describe('AttemptRepository', () => {
  it('appends unsynced attempts and returns newest distinct qids', async () => {
    const repo = new AttemptRepository(db);
    await repo.append(attempt('a1', 'q1', 1_000));
    await repo.append(attempt('a2', 'q2', 2_000));
    await repo.append(attempt('a3', 'q1', 3_000));

    expect(await repo.count()).toBe(3);
    expect(await repo.recentQids(2)).toEqual(['q1', 'q2']);
  });

  it('returns unsynced attempts oldest first and marks a batch', async () => {
    const repo = new AttemptRepository(db);
    await repo.append(attempt('a2', 'q2', 2_000));
    await repo.append(attempt('a1', 'q1', 1_000));

    expect((await repo.unsynced(10)).map((row) => row.id)).toEqual(['a1', 'a2']);

    await repo.markSynced(['a1']);
    const remaining = await repo.unsynced(10);
    expect(remaining.map((row) => row.id)).toEqual(['a2']);
    expect(remaining[0]?.synced).toBe(0);
  });
});

describe('CardRepository', () => {
  it('returns due cards earliest first with a deterministic tie-break', async () => {
    const repo = new CardRepository(db);
    await repo.put(card('b', 100));
    await repo.put(card('a', 100));
    await repo.put(card('c', 500));
    await repo.put(card('later', 5_000));

    expect((await repo.dueCards(1_000)).map((row) => row.qid)).toEqual(['a', 'b', 'c']);
    expect((await repo.dueCards(10_000)).map((row) => row.qid)).toEqual(['a', 'b', 'c', 'later']);
  });
});

describe('DailyRepository', () => {
  it('stores one row per IST day and reads them in date order', async () => {
    const repo = new DailyRepository(db);
    await repo.put({ date: '2026-11-02', attempted: 12, correct: 8, ms: 60_000 });
    await repo.put({ date: '2026-11-01', attempted: 0, correct: 0, ms: 0 });

    expect((await repo.all()).map((row) => row.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(await repo.get('2026-11-02')).toEqual({
      date: '2026-11-02',
      attempted: 12,
      correct: 8,
      ms: 60_000,
    });
  });
});

describe('QuestionRepository', () => {
  it('filters by section, subtopic and Elo band', async () => {
    const repo = new QuestionRepository(db);
    await repo.putMany([
      question('q-pol-1', 'polity', 'fr', 1_100),
      question('q-pol-2', 'polity', 'fr', 1_200),
      question('q-pol-3', 'polity', 'fr', 1_500),
      question('q-hist', 'history', 'ancient', 1_150),
    ]);

    expect(await repo.count()).toBe(4);

    const inBand = await repo.candidates({
      section: 'polity',
      minElo: 1_000,
      maxElo: 1_250,
      limit: 10,
    });
    expect(inBand.map((row) => row.id).sort()).toEqual(['q-pol-1', 'q-pol-2']);

    const one = await repo.candidates({
      section: 'polity',
      minElo: 1_000,
      maxElo: 1_250,
      limit: 1,
    });
    expect(one).toHaveLength(1);

    const excluded = await repo.candidates({
      section: 'polity',
      minElo: 1_000,
      maxElo: 1_250,
      excludeIds: ['q-pol-1'],
      limit: 10,
    });
    expect(excluded.map((row) => row.id)).toEqual(['q-pol-2']);

    const subtopic = await repo.candidates({
      section: 'polity',
      subtopic: 'fr',
      minElo: 1_300,
      maxElo: 1_600,
      limit: 10,
    });
    expect(subtopic.map((row) => row.id)).toEqual(['q-pol-3']);
  });
});

describe('PackRepository', () => {
  it('stores installed pack versions', async () => {
    const repo = new PackRepository(db);
    const pack = {
      id: 'polity-fr',
      version: 3,
      sha256: 'a'.repeat(64),
      installedAt: 1_700_000_000_000,
    };
    await repo.put(pack);

    expect(await repo.get('polity-fr')).toEqual(pack);
    expect(await repo.all()).toEqual([pack]);
  });
});
