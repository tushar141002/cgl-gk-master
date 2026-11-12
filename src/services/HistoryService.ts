import {
  MAX_PULL_ATTEMPTS,
  compareCursor,
  type AttemptRecord,
  type Checkpoint,
  type Cursor,
} from '../../shared/contract';
import type { AppDatabase } from '../data/database';
import { SyncRepository } from '../data/repositories/SyncRepository';
import type { CheckpointTransport } from '../sync/CheckpointTransport';
import { buildReplayIndex, replaceDerived } from '../sync/derived';
import type { PullTransport } from '../sync/SyncTransport';

/** Page ceiling: 500 × 200 attempts matches the upload ceiling (D-074). */
export const MAX_PULL_PAGES = MAX_PULL_ATTEMPTS;

export const DEFAULT_PULL_PAGE_SIZE = 200;

export type HistoryErrorCode = 'unauthenticated' | 'network' | 'sync_failed';

/** A pull that cannot finish; the scheduler decides when to try again. */
export class HistoryError extends Error {
  constructor(
    readonly code: HistoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HistoryError';
  }
}

export interface HistoryServiceOptions {
  readonly transport: PullTransport;
  /** Caps rebuilt FSRS due dates the same way live play does (D-037). */
  readonly examDeadline?: number;
  /** 1..`MAX_PULL_ATTEMPTS`; the server caps it at 500 anyway. */
  readonly pageSize?: number;
  /**
   * Where a full pull fetches the newest server checkpoint first (D-091).
   * Without it, a full pull replays the whole log as before 7A-2.
   */
  readonly checkpoints?: CheckpointTransport;
}

export interface PullSummary {
  readonly pages: number;
  /** Attempts returned by the server across every page. */
  readonly received: number;
  /** Attempts this device did not already have. */
  readonly inserted: number;
  readonly rebuilt: boolean;
  /** The new pull position; null only for an entirely empty history. */
  readonly cursor: Cursor | null;
}

/**
 * History download for a new or second device (F7, D-074).
 *
 * Pages `sync_pull` from `syncMeta.historyCursor` until `hasMore` is false,
 * merges by attempt id and rebuilds derived state once. The position is only
 * advanced after the last page: a failure halfway leaves the old position in
 * place, but the pages that did arrive are still folded in, so a retry makes
 * progress instead of starting over.
 *
 * Upload first is the caller's job (`SyncManager.uploadAll`), so a guest's log
 * is on the server before the first full pull returns it.
 */
export class HistoryService {
  private readonly sync: SyncRepository;
  private readonly transport: PullTransport;
  private readonly pageSize: number;
  private readonly examDeadline: number | undefined;
  private readonly checkpoints: CheckpointTransport | undefined;

  constructor(
    private readonly db: AppDatabase,
    options: HistoryServiceOptions,
  ) {
    const pageSize = options.pageSize ?? DEFAULT_PULL_PAGE_SIZE;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PULL_ATTEMPTS) {
      throw new RangeError(`pageSize must be between 1 and ${MAX_PULL_ATTEMPTS} (got ${String(pageSize)})`);
    }

    this.sync = new SyncRepository(db);
    this.transport = options.transport;
    this.pageSize = pageSize;
    this.examDeadline = options.examDeadline;
    this.checkpoints = options.checkpoints;
  }

  async pull(): Promise<PullSummary> {
    const meta = await this.sync.getMeta();
    if (meta === undefined) throw new HistoryError('sync_failed', 'sync is not bootstrapped');

    const start = meta.historyCursor ?? null;
    let after = start;
    let pages = 0;

    // A full pull starts from the newest checkpoint: once the server has
    // pruned (D-066, D-091), attempts before it exist only in that snapshot.
    const adopted = start === null ? await this.adoptCheckpoint(meta.checkpoint ?? null) : false;

    const collected = new Map<string, AttemptRecord>();

    while (pages < MAX_PULL_PAGES) {
      let response;
      try {
        response = await this.transport.pull(after, this.pageSize);
      } catch {
        await this.commit(collected, null, false, adopted);
        throw new HistoryError('network', 'could not reach the history service');
      }

      if (!response.ok) {
        await this.commit(collected, null, false, adopted);
        throw errorFor(response.error);
      }

      pages += 1;
      for (const attempt of response.attempts) collected.set(attempt.id, attempt);

      if (!response.hasMore) {
        const inserted = await this.commit(collected, response.nextCursor, true, adopted);
        return {
          pages,
          received: collected.size,
          inserted,
          rebuilt: inserted > 0 || adopted,
          cursor: response.nextCursor,
        };
      }

      if (response.nextCursor === null || response.nextCursor === after) {
        await this.commit(collected, null, false, adopted);
        throw new HistoryError('sync_failed', 'history service did not advance');
      }
      after = response.nextCursor;
    }

    await this.commit(collected, null, false, adopted);
    throw new HistoryError('sync_failed', 'history is too large for one download');
  }

  /**
   * Stores the server's newest checkpoint when it is ahead of the one this
   * phone already uses. A failed fetch stops the pull: replaying without a
   * checkpoint the server relies on would silently lose pruned history.
   */
  private async adoptCheckpoint(current: Checkpoint | null): Promise<boolean> {
    if (this.checkpoints === undefined) return false;

    let response;
    try {
      response = await this.checkpoints.latest();
    } catch {
      throw new HistoryError('network', 'could not reach the history service');
    }
    if (!response.ok) throw errorFor(response.error);

    const latest = response.checkpoint;
    if (latest === null) return false;
    if (current !== null && compareCursor(latest.cursor, current.cursor) <= 0) return false;

    await this.sync.setCheckpoint(latest);
    return true;
  }

  /**
   * Folds the pages received so far into the log and, when `advance` is true,
   * moves the pull position. Runs as one transaction so a crash cannot leave
   * derived state half-written.
   */
  private async commit(
    collected: ReadonlyMap<string, AttemptRecord>,
    cursor: Cursor | null,
    advance: boolean,
    forceRebuild = false,
  ): Promise<number> {
    if (collected.size === 0 && !forceRebuild) {
      if (advance) await this.sync.setHistoryCursor(cursor);
      return 0;
    }

    const incoming = [...collected.values()];

    return this.db.transaction(
      'rw',
      [
        this.db.attempts,
        this.db.questions,
        this.db.corrections,
        this.db.cardState,
        this.db.skills,
        this.db.dailySummary,
        this.db.syncMeta,
      ],
      async (): Promise<number> => {
        const existing = await this.db.attempts.bulkGet(incoming.map((attempt) => attempt.id));
        const missing = incoming.filter((_, index) => existing[index] === undefined);

        // Pulled rows are already on the server, so they are marked synced and
        // never uploaded again. Rows that already exist are left untouched:
        // a local unsynced copy may carry the same id and will be de-duped by
        // the server's primary key.
        if (missing.length > 0 || forceRebuild) {
          await this.db.attempts.bulkPut(missing.map((attempt) => ({ ...attempt, synced: 1 as const })));

          const attempts = await this.db.attempts.toArray();
          const questions = await this.db.questions.toArray();
          const corrections = await this.db.corrections.toArray();
          const index = buildReplayIndex(questions, corrections);
          await replaceDerived(
            this.db,
            attempts,
            index,
            this.examDeadline === undefined ? {} : { examDeadline: this.examDeadline },
          );
        }

        if (advance) await this.sync.setHistoryCursor(cursor);
        return missing.length;
      },
    );
  }
}

function errorFor(error: string): HistoryError {
  if (error === 'unauthenticated') {
    return new HistoryError('unauthenticated', 'sign in to download history');
  }
  if (error === 'network') return new HistoryError('network', 'could not reach the history service');
  return new HistoryError('sync_failed', error);
}
