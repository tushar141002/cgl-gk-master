import type {
  AttemptId,
  AttemptMode,
  AttemptRecord,
  DeviceId,
  MockId,
  OptionIndex,
  Question,
} from '../../shared/contract';

const ATTEMPT_MODES: readonly AttemptMode[] = ['practice', 'pyq', 'mock', 'daily', 'revise'];

/** Everything an attempt needs that does not come from the question itself. */
export interface AttemptContext {
  readonly id: AttemptId;
  readonly deviceId: DeviceId;
  readonly mode: AttemptMode;
  /** Epoch milliseconds, UTC. Stored as-is; the server assigns the IST day. */
  readonly at: number;
  readonly mockId?: MockId;
}

/**
 * An immutable value object over `AttemptRecord`.
 *
 * The record shape lives once, in `shared/contract.ts`; this class adds the
 * three things the app needs — creating an attempt from a tap, re-grading after
 * a published correction, and refusing malformed input — and nothing else. It
 * performs no I/O, so it is testable without a database (D-030).
 *
 * Option order is canonical: the app does not shuffle options in v1 (D-032),
 * so `chosen` is directly comparable to `Question.answer`.
 */
export class Attempt {
  private constructor(private readonly data: AttemptRecord) {}

  /** Build an attempt from a tap. `chosen === null` means the student skipped. */
  static create(question: Question, chosen: OptionIndex | null, ms: number, ctx: AttemptContext): Attempt {
    assertDuration(ms);
    assertOption(chosen, 'chosen');
    assertTimestamp(ctx.at, 'at');
    if (!ATTEMPT_MODES.includes(ctx.mode)) {
      throw new RangeError(`unknown attempt mode "${ctx.mode}"`);
    }
    if (ctx.id.length === 0) {
      throw new RangeError('attempt id must not be empty');
    }
    if (ctx.deviceId.length === 0) {
      throw new RangeError('deviceId must not be empty');
    }

    return new Attempt({
      id: ctx.id,
      qid: question.id,
      qv: question.v,
      chosen,
      correct: chosen !== null && chosen === question.answer,
      ms,
      mode: ctx.mode,
      ...(ctx.mockId === undefined ? {} : { mockId: ctx.mockId }),
      at: ctx.at,
      deviceId: ctx.deviceId,
    });
  }

  /** Rehydrate from IndexedDB or the sync payload, validating on the way in. */
  static from(record: AttemptRecord): Attempt {
    assertOption(record.chosen, 'chosen');
    assertDuration(record.ms);
    assertTimestamp(record.at, 'at');
    if (!Number.isInteger(record.qv) || record.qv < 1) {
      throw new RangeError(`qv must be a positive integer (got ${record.qv})`);
    }
    if (!ATTEMPT_MODES.includes(record.mode)) {
      throw new RangeError(`unknown attempt mode "${record.mode}"`);
    }
    if (record.id.length === 0) {
      throw new RangeError('attempt id must not be empty');
    }
    if (record.deviceId.length === 0) {
      throw new RangeError('deviceId must not be empty');
    }
    return new Attempt(record);
  }

  get record(): AttemptRecord {
    return this.data;
  }

  get isSkip(): boolean {
    return this.data.chosen === null;
  }

  /**
   * Re-grade after a correction (F6, D-022). The attempt keeps its id, time and
   * question version — the log is append-only, only the interpretation changes.
   * A skipped attempt stays skipped and stays `correct: false`.
   */
  regrade(newAnswer: OptionIndex): Attempt {
    assertOption(newAnswer, 'newAnswer');
    const { chosen } = this.data;
    if (chosen === null) return this;
    return new Attempt({ ...this.data, correct: chosen === newAnswer });
  }

  toJSON(): AttemptRecord {
    return this.data;
  }
}

function assertOption(value: OptionIndex | null, field: string): void {
  if (value === null) return;
  if (value !== 0 && value !== 1 && value !== 2 && value !== 3) {
    throw new RangeError(`${field} must be 0-3 or null (got ${String(value)})`);
  }
}

function assertDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new RangeError(`ms must be a finite, non-negative number (got ${String(ms)})`);
  }
}

function assertTimestamp(at: number, field: string): void {
  if (!Number.isFinite(at) || at < 0) {
    throw new RangeError(`${field} must be a finite epoch-millisecond timestamp (got ${String(at)})`);
  }
}
