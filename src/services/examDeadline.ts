import { IST_OFFSET_MINUTES } from '../../shared/contract';

/**
 * The exam date as an epoch-millisecond cap for FSRS (D-037).
 *
 * `examDate` is an IST calendar day (`YYYY-MM-DD`). The deadline is the start
 * of that day in IST: a revision scheduled for exam morning is still useful,
 * one scheduled after the paper is not.
 *
 * Returns `undefined` when no exam date is set, which leaves the due date
 * uncapped.
 */
export function examDeadlineFrom(examDate: string | null): number | undefined {
  if (examDate === null) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    throw new RangeError(`examDate must be YYYY-MM-DD (got "${examDate}")`);
  }

  const dayStartUtc = Date.parse(`${examDate}T00:00:00.000Z`);
  if (!Number.isFinite(dayStartUtc) || new Date(dayStartUtc).toISOString().slice(0, 10) !== examDate) {
    throw new RangeError(`examDate is not a real date (got "${examDate}")`);
  }

  return dayStartUtc - IST_OFFSET_MINUTES * 60_000;
}
