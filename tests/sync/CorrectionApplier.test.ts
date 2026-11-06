import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord, OptionIndex, Question, QuestionCorrection } from '../../shared/contract';
import { newSkill, updateSkill } from '../../src/core/EloRating';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { AttemptRepository } from '../../src/data/repositories/AttemptRepository';
import { CardRepository } from '../../src/data/repositories/CardRepository';
import { CorrectionRepository } from '../../src/data/repositories/CorrectionRepository';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { SkillRepository } from '../../src/data/repositories/SkillRepository';
import { CorrectionApplier } from '../../src/sync/CorrectionApplier';

const SUBTOPIC = 'polity-fundamental-rights';
const AT = Date.UTC(2026, 11, 7, 6, 0, 0);

let db: AppDatabase;

beforeEach(async () => {
  db = await openDatabase(`cgl-corrections-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

function question(id: string, answer: OptionIndex = 0, eloSeed = 1200): Question {
  return {
    id,
    v: 1,
    packId: 'pack-1',
    section: 'polity',
    subtopic: SUBTOPIC,
    source: { type: 'practice' },
    en: { q: `Question ${id}`, options: ['A', 'B', 'C', 'D'], explanation: 'Because.' },
    hi: { q: `प्रश्न ${id}`, options: ['अ', 'ब', 'स', 'द'], explanation: 'क्योंकि।' },
    answer,
    eloSeed,
    verifiedAt: '2026-11-07T00:00:00.000Z',
  };
}

function attempt(qid: string, chosen: OptionIndex, correct: boolean, at = AT, qv = 1): AttemptRecord {
  return {
    id: `attempt-${qid}-${at}`,
    qid,
    qv,
    chosen,
    correct,
    ms: 1_000,
    mode: 'practice',
    at,
    deviceId: 'device-test',
  };
}

function correction(overrides: Partial<QuestionCorrection> = {}): QuestionCorrection {
  return {
    id: 'corr-1',
    qid: 'q-1',
    fromVersion: 1,
    toVersion: 2,
    oldAnswer: 0,
    newAnswer: 2,
    reason: 'wrong key',
    correctedAt: '2026-11-07T05:00:00.000Z',
    ...overrides,
  };
}

async function card(qid: string): Promise<void> {
  await new CardRepository(db).put({
    qid,
    due: AT + 86_400_000,
    stability: 1,
    stabilityFast: 1,
    difficulty: 5,
    scheduledDays: 1,
    learningStep: 0,
    reps: 1,
    lapses: 0,
    lastReview: null,
    phase: 'review',
  });
}

describe('CorrectionApplier (F6, D-071)', () => {
  it('stores the correction, counts the attempts it flips and rebuilds the derived state', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true));

    const result = await new CorrectionApplier(db).apply([correction()]);

    expect(result).toEqual({ applied: 1, changed: 1, rebuilt: true });

    const stored = await new CorrectionRepository(db).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'corr-1', seen: 1 });

    // The replay now sees answer 2, so the chosen 0 is wrong.
    const skills = await new SkillRepository(db).all();
    expect(skills).toEqual([updateSkill(newSkill(SUBTOPIC), 1200, 'wrong')]);
    expect(await new CardRepository(db).count()).toBe(1);
  });

  it('leaves the attempt log untouched', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true));

    await new CorrectionApplier(db).apply([correction()]);

    const rows = await new AttemptRepository(db).all();
    expect(rows).toEqual([{ ...attempt('q-1', 0, true), synced: 0 }]);
  });

  it('treats a repeated correction id as a no-op', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true));

    const applier = new CorrectionApplier(db);
    await applier.apply([correction()]);
    const cards = await new CardRepository(db).all();

    const again = await applier.apply([correction()]);

    expect(again).toEqual({ applied: 0, changed: 0, rebuilt: false });
    expect(await new CardRepository(db).all()).toEqual(cards);
  });

  it('replaces derived stores instead of merging stale rows', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true));
    await card('q-stale');

    await new CorrectionApplier(db).apply([correction()]);

    expect(await new CardRepository(db).get('q-stale')).toBeUndefined();
  });

  it('stores a correction for a question that is not installed yet', async () => {
    const result = await new CorrectionApplier(db).apply([
      correction({ id: 'corr-ghost', qid: 'q-missing' }),
    ]);

    expect(result).toEqual({ applied: 1, changed: 0, rebuilt: true });
    expect(await new CorrectionRepository(db).answerFor('q-missing', 1)).toBe(2);
  });

  it('counts a chained correction once per question', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true));

    const result = await new CorrectionApplier(db).apply([
      correction({ id: 'corr-a', toVersion: 2, newAnswer: 3, correctedAt: '2026-11-07T05:00:00.000Z' }),
      correction({
        id: 'corr-b',
        fromVersion: 2,
        toVersion: 3,
        newAnswer: 2,
        correctedAt: '2026-11-07T06:00:00.000Z',
      }),
    ]);

    expect(result.applied).toBe(2);
    expect(result.changed).toBe(1);
    // Version 1 is covered by the first correction, version 2 by the newest.
    expect(await new CorrectionRepository(db).answerFor('q-1', 1)).toBe(3);
    expect(await new CorrectionRepository(db).answerFor('q-1', 2)).toBe(2);
  });

  it('judges each attempt against the correction that covers its version', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true, AT, 1));
    await new AttemptRepository(db).append(attempt('q-1', 0, true, AT + 1_000, 2));

    const result = await new CorrectionApplier(db).apply([
      correction({
        id: 'corr-a',
        fromVersion: 1,
        toVersion: 2,
        newAnswer: 3,
        correctedAt: '2026-11-07T05:00:00.000Z',
      }),
      correction({
        id: 'corr-b',
        fromVersion: 2,
        toVersion: 3,
        newAnswer: 0,
        correctedAt: '2026-11-07T06:00:00.000Z',
      }),
    ]);

    // Version 1 now grades 0 as wrong; version 2 still grades 0 as right.
    expect(result.changed).toBe(1);
    expect(await new CorrectionRepository(db).answerFor('q-1', 1)).toBe(3);
    expect(await new CorrectionRepository(db).answerFor('q-1', 2)).toBe(0);
  });

  it('counts a flipped question once, not once per attempt', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true, AT));
    await new AttemptRepository(db).append(attempt('q-1', 0, true, AT + 1_000));

    const result = await new CorrectionApplier(db).apply([correction()]);

    expect(result.changed).toBe(1);
  });

  it('leaves other questions alone', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0), question('q-2', 1)]);
    await new AttemptRepository(db).append(attempt('q-1', 0, true, AT));
    await new AttemptRepository(db).append(attempt('q-2', 1, true, AT + 1_000));

    const result = await new CorrectionApplier(db).apply([correction()]);

    expect(result.changed).toBe(1);
    expect(await new CorrectionRepository(db).answerFor('q-2', 1)).toBeNull();
  });
});
