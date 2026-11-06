import { istDayKey, type AttemptRecord, type DailySummary } from '../../shared/contract';

const DAY_MS = 86_400_000;

/** What the home screen needs: the run length and whether today is already safe. */
export interface StreakStatus {
  /** Consecutive days with at least one graded answer, ending today or yesterday. */
  readonly current: number;
  readonly doneToday: boolean;
}

/**
 * Daily counters and streaks, in IST (D-041, D-042).
 *
 * A day counts for the streak when it has at least one graded answer. Skips do
 * not touch `attempted`, `correct` or `ms` (D-043), and `dailyGoal` is a
 * separate progress target used by the reminder, not the streak itself.
 *
 * Pure over plain data: the caller reads and writes `dailySummary` rows through
 * a repository, and the server can derive the same numbers from `daily_stats`.
 */
export class StreakTracker {
  private constructor() {}

  /**
   * Fold one answer into that day's summary. `null` starts a new day, so the
   * caller does not need to pre-create the row.
   *
   * The summary must belong to the attempt's IST day; a row from yesterday is a
   * caller bug, not something to silently merge across midnight.
   */
  static apply(attempt: AttemptRecord, summary: DailySummary | null): DailySummary {
    if (!Number.isFinite(attempt.ms) || attempt.ms < 0) {
      throw new RangeError(`ms must be a finite, non-negative number (got ${String(attempt.ms)})`);
    }

    const date = istDayKey(attempt.at);
    const base: DailySummary = summary ?? { date, attempted: 0, correct: 0, ms: 0 };
    if (base.date !== date) {
      throw new RangeError(`daily summary is for ${base.date}, attempt belongs to ${date}`);
    }

    if (attempt.chosen === null) return base;

    return {
      date,
      attempted: base.attempted + 1,
      correct: base.correct + (attempt.correct ? 1 : 0),
      ms: base.ms + attempt.ms,
    };
  }

  /**
   * Derive the current streak from the daily rows.
   *
   * If today already has a graded answer, the count includes today. If not, the
   * streak is still alive until midnight, so the count starts at yesterday —
   * `doneToday` is what the UI uses to show "at risk".
   */
  static evaluate(summaries: readonly DailySummary[], todayKey: string): StreakStatus {
    assertDayKey(todayKey);

    const byDate = new Map<string, DailySummary>();
    for (const summary of summaries) {
      assertDayKey(summary.date);
      if (byDate.has(summary.date)) {
        throw new RangeError(`duplicate daily summary for ${summary.date}`);
      }
      byDate.set(summary.date, summary);
    }

    const doneToday = (byDate.get(todayKey)?.attempted ?? 0) > 0;
    let current = 0;
    let day = doneToday ? todayKey : previousDay(todayKey);

    while ((byDate.get(day)?.attempted ?? 0) > 0) {
      current += 1;
      day = previousDay(day);
    }

    return { current, doneToday };
  }

  /** Whether today's practice target is met; drives the reminder (D-024). */
  static goalMet(summary: DailySummary | null, dailyGoal: number): boolean {
    if (!Number.isInteger(dailyGoal) || dailyGoal < 1) {
      throw new RangeError(`dailyGoal must be a positive integer (got ${String(dailyGoal)})`);
    }
    return (summary?.attempted ?? 0) >= dailyGoal;
  }
}

function previousDay(key: string): string {
  const midnight = Date.parse(`${key}T00:00:00.000Z`);
  return new Date(midnight - DAY_MS).toISOString().slice(0, 10);
}

/** Reject impossible dates such as `2026-02-30`, which `Date.parse` rolls over. */
function assertDayKey(key: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new RangeError(`invalid day key "${key}"; expected YYYY-MM-DD`);
  }
  const midnight = Date.parse(`${key}T00:00:00.000Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== key) {
    throw new RangeError(`invalid day key "${key}"`);
  }
}
