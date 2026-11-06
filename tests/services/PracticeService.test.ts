import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { istDayKey, type Question, type QuestionCorrection } from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { CardRepository } from '../../src/data/repositories/CardRepository';
import { CorrectionRepository } from '../../src/data/repositories/CorrectionRepository';
import { DailyRepository } from '../../src/data/repositories/DailyRepository';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { SkillRepository } from '../../src/data/repositories/SkillRepository';
import { PracticeService } from '../../src/services/PracticeService';
import { ProgressService } from '../../src/services/ProgressService';

const SUBTOPIC = 'polity-fundamental-rights';
const AT = Date.UTC(2026, 10, 7, 6, 0, 0); // 2026-11-07 11:30 IST

let db: AppDatabase;
let clock: number;
let sequence: number;

beforeEach(async () => {
  db = await openDatabase(`cgl-practice-${crypto.randomUUID()}`);
  clock = AT;
  sequence = 0;
});

afterEach(async () => {
  await db.delete();
});

function question(id: string, eloSeed = 1200, answer: Question['answer'] = 0): Question {
  return {
    id,
    v: 1,
    packId: SUBTOPIC,
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

function service(rng: () => number = () => 0): PracticeService {
  return new PracticeService(db, {
    deviceId: 'device-test',
    now: () => clock,
    rng,
    newId: () => `attempt-${(sequence += 1)}`,
  });
}

async function seed(...questions: Question[]): Promise<void> {
  await new QuestionRepository(db).putMany(questions);
}

async function dueCard(qid: string, due: number): Promise<void> {
  await new CardRepository(db).put({
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
  });
}

describe('PracticeService.next (F3)', () => {
  it('serves the earliest due review before a new question', async () => {
    const a = question('polity-fr-0001');
    const b = question('polity-fr-0002');
    await seed(a, b);
    await dueCard(a.id, clock - 5_000);
    await dueCard(b.id, clock - 10_000);

    const pick = await service().next(SUBTOPIC);
    expect(pick?.question.id).toBe(b.id);
    expect(pick?.reason).toBe('review');
  });

  it('serves a new question inside the starting Elo band', async () => {
    await seed(question('polity-fr-0001', 1200));

    const pick = await service().next(SUBTOPIC);
    expect(pick?.question.id).toBe('polity-fr-0001');
    expect(pick?.reason).toBe('new');
  });

  it('widens the band until a question is found', async () => {
    await seed(question('polity-fr-0001', 2200));

    const pick = await service().next(SUBTOPIC);
    expect(pick?.question.id).toBe('polity-fr-0001');
  });

  it('does not re-serve a scheduled card that is not due yet', async () => {
    const q = question('polity-fr-0001');
    await seed(q);
    await dueCard(q.id, clock + 86_400_000);

    expect(await service().next(SUBTOPIC)).toBeNull();
  });

  it('returns null when the sub-topic has no questions', async () => {
    expect(await service().next(SUBTOPIC)).toBeNull();
  });
});

describe('PracticeService.answer (F2)', () => {
  it('writes the attempt, card, skill and daily counter in one answer', async () => {
    const q = question('polity-fr-0001', 1200, 1);
    await seed(q);

    const result = await service().answer(q, 1, 1_500);

    expect(result.correct).toBe(true);
    expect(result.skipped).toBe(false);
    expect(await db.attempts.count()).toBe(1);
    expect(await db.cardState.count()).toBe(1);
    expect(await db.skills.count()).toBe(1);
    expect(await db.dailySummary.get(istDayKey(AT))).toEqual({
      date: istDayKey(AT),
      attempted: 1,
      correct: 1,
      ms: 1_500,
    });

    const skill = await new SkillRepository(db).get(SUBTOPIC);
    expect(skill?.elo).toBeGreaterThan(1200);
    expect(skill?.attemptCount).toBe(1);

    const card = await new CardRepository(db).get(q.id);
    expect(card?.due).toBeGreaterThan(AT);
    expect(card?.reps).toBe(1);
  });

  it('moves the sub-topic rating down after a wrong answer', async () => {
    const q = question('polity-fr-0001', 1200, 1);
    await seed(q);

    const result = await service().answer(q, 0, 900);

    expect(result.correct).toBe(false);
    const skill = await new SkillRepository(db).get(SUBTOPIC);
    expect(skill?.elo).toBeLessThan(1200);
    expect((await new DailyRepository(db).get(istDayKey(AT)))?.correct).toBe(0);
  });

  it('grades against a published correction before the fixed pack arrives', async () => {
    const q = question('polity-fr-0001', 1200, 0);
    await seed(q);

    const correction: QuestionCorrection = {
      id: 'corr-1',
      qid: q.id,
      fromVersion: 1,
      toVersion: 2,
      oldAnswer: 0,
      newAnswer: 2,
      reason: 'wrong key',
      correctedAt: '2026-11-07T05:00:00.000Z',
    };
    await new CorrectionRepository(db).putMany([correction]);

    // The installed pack still says 0; choosing 2 is correct because the
    // correction is already stored (F6, D-071).
    const result = await service().answer(q, 2, 700);

    expect(result.correct).toBe(true);
    expect((await db.attempts.toArray())[0]?.correct).toBe(true);
    const skill = await new SkillRepository(db).get(SUBTOPIC);
    expect(skill?.elo).toBeGreaterThan(1200);
  });

  it('ignores a correction for a different question version', async () => {
    const q = question('polity-fr-0001', 1200, 0);
    await seed(q);

    await new CorrectionRepository(db).putMany([
      {
        id: 'corr-later',
        qid: q.id,
        fromVersion: 2,
        toVersion: 3,
        oldAnswer: 0,
        newAnswer: 2,
        reason: 'wrong key',
        correctedAt: '2026-11-07T05:00:00.000Z',
      },
    ]);

    const result = await service().answer(q, 2, 700);

    expect(result.correct).toBe(false);
  });

  it('caps the next due date at the exam deadline', async () => {
    const q = question('polity-fr-0001', 1200, 0);
    await seed(q);
    const deadline = AT + 60_000;

    await service().answer(q, 0, 500, deadline);

    const card = await new CardRepository(db).get(q.id);
    expect(card?.due).toBeGreaterThanOrEqual(AT);
    expect(card?.due).toBeLessThanOrEqual(deadline);
  });

  it('logs a skip without touching the card, skill or daily counters', async () => {
    const q = question('polity-fr-0001');
    await seed(q);

    const result = await service().answer(q, null, 400);

    expect(result.skipped).toBe(true);
    expect(result.correct).toBe(false);
    expect(await db.attempts.count()).toBe(1);
    expect(await db.cardState.count()).toBe(0);
    expect(await db.skills.count()).toBe(0);
    expect(await db.dailySummary.get(istDayKey(AT))).toEqual({
      date: istDayKey(AT),
      attempted: 0,
      correct: 0,
      ms: 0,
    });
  });
});

describe('ProgressService', () => {
  it('reports today, the streak and one row per installed sub-topic', async () => {
    const q = question('polity-fr-0001');
    await seed(q);
    await service().answer(q, 0, 1_000);

    const progress = new ProgressService(db, () => clock);
    const overview = await progress.overview();

    expect(overview).toMatchObject({
      attemptedToday: 1,
      correctToday: 1,
      streak: 1,
      doneToday: true,
      questionCount: 1,
      dueCount: 0,
    });
    expect(overview.averageElo).toBeGreaterThan(1200);

    const topics = await progress.topics();
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ subtopic: SUBTOPIC, section: 'polity', count: 1 });
    expect(topics[0]!.elo).toBeCloseTo(overview.averageElo, 0);
  });
});
