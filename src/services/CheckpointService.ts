import { compareCursor, encodeCursor, type AttemptRecord } from '../../shared/contract';
import { Replayer } from '../core/Replayer';
import type { AppDatabase } from '../data/database';
import { SyncRepository } from '../data/repositories/SyncRepository';
import type { CheckpointTransport } from '../sync/CheckpointTransport';
import { buildReplayIndex, foldDailySummaries } from '../sync/derived';

/** Only attempts at least this old go into a checkpoint (D-091). */
export const CHECKPOINT_MIN_AGE_MS = 30 * 24 * 60 * 60_000;

/** At most one upload attempt per this interval. */
export const CHECKPOINT_EVERY_MS = 7 * 24 * 60 * 60_000;

export type CheckpointWriteResult =
  | 'written'
  /** Too soon since the last try, nothing old enough, or nothing new. */
  | 'skipped'
  /** An old attempt has not reached the server yet; the server would refuse. */
  | 'unsynced'
  /** The server refused (`stale`, `ahead_of_server`) or did not answer. */
  | 'refused';

export interface CheckpointServiceOptions {
  readonly transport: CheckpointTransport;
  readonly now?: () => number;
  /** Caps FSRS due dates exactly as a rebuild does (D-037). */
  readonly examDeadline?: number | undefined;
}

/**
 * Writes this phone's checkpoints to the server (D-026, D-091).
 *
 * The server cannot compute FSRS and Elo state, so the phone that holds the
 * log does: it folds every synced attempt older than 30 days into one
 * checkpoint and uploads it, at most once a week. The 30-day margin keeps a
 * checkpoint behind attempts that a second, offline device may still upload.
 * The writing phone keeps rebuilding from its own full log, so a later answer
 * key correction still re-grades its old attempts.
 */
export class CheckpointService {
  private readonly db: AppDatabase;
  private readonly sync: SyncRepository;
  private readonly transport: CheckpointTransport;
  private readonly now: () => number;
  private readonly examDeadline: number | undefined;
  private running: Promise<CheckpointWriteResult> | null = null;

  constructor(db: AppDatabase, options: CheckpointServiceOptions) {
    this.db = db;
    this.sync = new SyncRepository(db);
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.examDeadline = options.examDeadline;
  }

  /** One run at a time; a second caller shares the first. */
  maybeWrite(): Promise<CheckpointWriteResult> {
    this.running ??= this.write().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async write(): Promise<CheckpointWriteResult> {
    const now = this.now();
    const meta = await this.sync.getMeta();
    if (meta === undefined) return 'skipped';
    const triedAt = meta.checkpointTriedAt ?? null;
    if (triedAt !== null && now - triedAt < CHECKPOINT_EVERY_MS) return 'skipped';

    const boundary = now - CHECKPOINT_MIN_AGE_MS;
    const eligible = (await this.db.attempts.where('at').belowOrEqual(boundary).toArray()).sort(byCursor);
    const last = eligible.at(-1);
    if (last === undefined) return 'skipped';
    if (eligible.some((attempt) => attempt.synced === 0)) return 'unsynced';

    const cursor = encodeCursor(last.at, last.id);
    const adopted = meta.checkpoint ?? null;
    if (adopted !== null && compareCursor(cursor, adopted.cursor) <= 0) return 'skipped';

    const [questions, corrections] = await Promise.all([
      this.db.questions.toArray(),
      this.db.corrections.toArray(),
    ]);
    const rebuilt = Replayer.rebuild(
      eligible,
      adopted,
      buildReplayIndex(questions, corrections),
      this.examDeadline === undefined ? {} : { examDeadline: this.examDeadline },
    );

    let response;
    try {
      response = await this.transport.put({
        cursor,
        cardStates: rebuilt.cards,
        skills: rebuilt.skills,
        istDailyTotals: foldDailySummaries(eligible, adopted),
      });
    } catch (error) {
      // No answer: try again on the next sync rather than next week.
      console.warn('checkpoint upload did not reach the server', error);
      return 'refused';
    }
    await this.sync.setCheckpointTriedAt(now);
    return response.ok ? 'written' : 'refused';
  }
}

function byCursor(a: AttemptRecord, b: AttemptRecord): number {
  return compareCursor(encodeCursor(a.at, a.id), encodeCursor(b.at, b.id));
}
