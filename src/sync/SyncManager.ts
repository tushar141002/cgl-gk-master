import {
  MAX_ATTEMPTS_PER_BATCH,
  MAX_REPORTS_PER_BATCH,
  type AttemptRecord,
  type BatchId,
  type Cursor,
  type DeviceId,
  type QuestionReport,
  type SyncBatch,
  type SyncResponse,
} from '../../shared/contract';
import { uuidV7 } from '../../shared/uuid';
import type { AppDatabase, AttemptRow, PendingBatch, ReportRow } from '../data/database';
import { AttemptRepository } from '../data/repositories/AttemptRepository';
import { ReportRepository } from '../data/repositories/ReportRepository';
import { SyncRepository } from '../data/repositories/SyncRepository';
import { retryDelay } from './backoff';
import { CorrectionApplier } from './CorrectionApplier';
import type { SyncTransport } from './SyncTransport';

/** Five hundred batches is 100,000 attempts: a guest's whole history. */
export const MAX_UPLOAD_BATCHES = 500;

/** Failures the server itself says are temporary (F4). */
const RETRYABLE_ERRORS: ReadonlySet<string> = new Set(['timeout', 'sync_failed', 'batch_in_progress']);

/** A batch the server will never accept; keeping it pinned would wedge sync. */
const POISON_ERRORS: ReadonlySet<string> = new Set(['invalid_batch', 'invalid_json']);

export interface SyncManagerOptions {
  readonly deviceId: DeviceId;
  readonly transport: SyncTransport;
  /** Injected in tests. */
  readonly now?: () => number;
  readonly newBatchId?: (at: number) => BatchId;
  /** Passed to the correction rebuild (D-037). */
  readonly examDeadline?: number;
}

export interface SyncRunOptions {
  /**
   * Send an empty batch to collect corrections and advance the cursor. Used on
   * app open (F4); a timer tick with nothing to say can skip the request.
   */
  readonly allowEmpty?: boolean;
}

export type SyncRunResult =
  | { readonly status: 'idle' }
  | {
      readonly status: 'ok';
      readonly attempts: number;
      readonly reports: number;
      readonly corrections: number;
      readonly changed: number;
      readonly cursor: Cursor | null;
    }
  | { readonly status: 'retry'; readonly error: string; readonly retryInMs: number }
  | { readonly status: 'failed'; readonly error: string };

export interface UploadSummary {
  readonly batches: number;
  readonly attempts: number;
  readonly reports: number;
  readonly corrections: number;
  readonly changed: number;
  readonly last: SyncRunResult;
}

/**
 * The client half of sync (F4, F7, D-069, D-070).
 *
 * One `runOnce` sends at most 200 attempts and 20 reports, marks exactly what
 * it sent, records the server cursor and folds in any corrections. The batch is
 * pinned in `syncMeta` before the request, so a network failure or a crash
 * retries the same id with the same contents and the server replays its stored
 * response instead of losing corrections (D-067).
 *
 * The caller owns the timer and the backoff: `runOnce` reports `retry` with a
 * delay and keeps the batch for the next call.
 */
export class SyncManager {
  private readonly sync: SyncRepository;
  private readonly attempts: AttemptRepository;
  private readonly reports: ReportRepository;
  private readonly applier: CorrectionApplier;
  private readonly transport: SyncTransport;
  private readonly deviceId: DeviceId;
  private readonly now: () => number;
  private readonly newBatchId: (at: number) => BatchId;

  /** Consecutive retryable failures, for the backoff curve. */
  private failures = 0;
  /** One run at a time: a timer and a manual refresh must not send twice. */
  private running: Promise<SyncRunResult> | null = null;

  constructor(
    private readonly db: AppDatabase,
    options: SyncManagerOptions,
  ) {
    this.sync = new SyncRepository(db);
    this.attempts = new AttemptRepository(db);
    this.reports = new ReportRepository(db);
    this.transport = options.transport;
    this.deviceId = options.deviceId;
    this.now = options.now ?? Date.now;
    this.newBatchId = options.newBatchId ?? ((at) => uuidV7(at));
    this.applier = new CorrectionApplier(
      db,
      options.examDeadline === undefined ? {} : { examDeadline: options.examDeadline },
    );
  }

  /** Sends one batch. Concurrent calls share the run already in flight. */
  runOnce(options: SyncRunOptions = {}): Promise<SyncRunResult> {
    if (this.running !== null) return this.running;

    const run = this.execute(options).finally(() => {
      this.running = null;
    });
    this.running = run;
    return run;
  }

  /**
   * Drains the log, one batch at a time, until it is empty or a non-ok result
   * stops the loop. Used for a guest's first sync after signing in (F7).
   */
  async uploadAll(options: SyncRunOptions = {}): Promise<UploadSummary> {
    let batches = 0;
    let attempts = 0;
    let reports = 0;
    let corrections = 0;
    let changed = 0;
    let last: SyncRunResult = { status: 'idle' };

    while (batches < MAX_UPLOAD_BATCHES) {
      last = await this.runOnce(options);
      if (last.status !== 'ok') break;

      batches += 1;
      attempts += last.attempts;
      reports += last.reports;
      corrections += last.corrections;
      changed += last.changed;

      if (last.attempts === 0 && last.reports === 0) break;
    }

    return { batches, attempts, reports, corrections, changed, last };
  }

  private async execute(options: SyncRunOptions): Promise<SyncRunResult> {
    const meta = await this.sync.getMeta();
    if (meta === undefined) {
      throw new Error('sync manager requires a bootstrapped database');
    }

    const pinned = await this.pinnedBatch(meta.pendingBatch ?? null, meta.cursor);
    const batch = pinned ?? (await this.freshBatch(meta.cursor, options.allowEmpty === true));
    if (batch === null) return { status: 'idle' };

    // Written before the request so a crash keeps the exact contents, not just
    // the id. A pinned batch is already stored and must not be rewritten.
    if (pinned === null) await this.sync.setPending(toPending(batch));

    let response: SyncResponse;
    try {
      response = await this.transport.send(batch);
    } catch {
      return this.retry('network');
    }

    if (!response.ok) {
      if (this.isRetryable(response)) {
        return this.retry(response.error, response.retryAfterMs);
      }
      if (POISON_ERRORS.has(response.error)) await this.sync.setPending(null);
      return { status: 'failed', error: response.error };
    }

    this.failures = 0;

    // Corrections are folded in before the pin is cleared. If the app dies
    // after a reply but before the pin write, the retry replays the stored
    // response and `CorrectionApplier` de-dupes by id, so nothing is lost
    // (D-067, D-072).
    const correction = await this.applier.apply(response.corrections);

    await this.db.transaction('rw', this.db.attempts, this.db.reports, this.db.syncMeta, async () => {
      await this.attempts.markSynced(batch.attempts.map((attempt) => attempt.id));
      await this.reports.markSent(batch.reports);
      await this.sync.setPending(null);
      await this.sync.setCursor(response.newCursor, response.serverTime);
    });

    return {
      status: 'ok',
      attempts: batch.attempts.length,
      reports: batch.reports.length,
      corrections: correction.applied,
      changed: correction.changed,
      cursor: response.newCursor,
    };
  }

  /**
   * Rebuilds the pinned batch from the stored ids. If none of it survives, the
   * pin is dropped and the caller builds a fresh batch.
   */
  private async pinnedBatch(pending: PendingBatch | null, cursor: Cursor | null): Promise<SyncBatch | null> {
    if (pending === null) return null;

    const rows = await this.attempts.byIds(pending.attemptIds);
    if (rows.length === 0 && pending.reports.length === 0) {
      await this.sync.setPending(null);
      return null;
    }

    return {
      batchId: pending.batchId,
      deviceId: this.deviceId,
      cursor,
      attempts: rows.map(toAttemptRecord),
      reports: pending.reports,
    };
  }

  private async freshBatch(cursor: Cursor | null, allowEmpty: boolean): Promise<SyncBatch | null> {
    const attempts = await this.attempts.unsynced(MAX_ATTEMPTS_PER_BATCH);
    const reports = await this.reports.pending(MAX_REPORTS_PER_BATCH);
    if (attempts.length === 0 && reports.length === 0 && !allowEmpty) return null;

    return {
      batchId: this.newBatchId(this.now()),
      deviceId: this.deviceId,
      cursor,
      attempts: attempts.map(toAttemptRecord),
      reports: reports.map(toReport),
    };
  }

  private retry(error: string, retryAfterMs?: number): SyncRunResult {
    this.failures += 1;
    return {
      status: 'retry',
      error,
      retryInMs: retryDelay(this.failures, retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }

  private isRetryable(response: { readonly error: string; readonly retryAfterMs?: number }): boolean {
    return response.retryAfterMs !== undefined || RETRYABLE_ERRORS.has(response.error);
  }
}

function toPending(batch: SyncBatch): PendingBatch {
  return {
    batchId: batch.batchId,
    attemptIds: batch.attempts.map((attempt) => attempt.id),
    reports: batch.reports,
  };
}

/** Drops the local `synced` flag: it is bookkeeping, never uploaded. */
function toAttemptRecord(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    qid: row.qid,
    qv: row.qv,
    chosen: row.chosen,
    correct: row.correct,
    ms: row.ms,
    mode: row.mode,
    ...(row.mockId === undefined ? {} : { mockId: row.mockId }),
    at: row.at,
    deviceId: row.deviceId,
  };
}

/** Drops the local `sent` flag for the same reason. */
function toReport(row: ReportRow): QuestionReport {
  return { qid: row.qid, qv: row.qv, reason: row.reason, at: row.at };
}
