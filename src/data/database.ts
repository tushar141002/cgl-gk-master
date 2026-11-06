import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  AttemptId,
  AttemptRecord,
  BatchId,
  CardState,
  Cursor,
  DailySummary,
  DeviceId,
  Question,
  QuestionCorrection,
  QuestionReport,
  ReportReason,
  Settings,
  Skill,
} from '../../shared/contract';

/**
 * The phone database (PROJECT_SPEC.md §6).
 *
 * The attempt log is the source of truth; `cardState`, `skills` and
 * `dailySummary` are derived and can be rebuilt by replay. Rows are plain data
 * so a future export/import does not depend on Dexie classes.
 */

/** A question as stored after a pack is installed. */
export type QuestionRow = Question;

/** Bookkeeping for one installed pack. */
export interface PackRow {
  readonly id: string;
  readonly version: number;
  readonly sha256: string;
  /** Epoch milliseconds, UTC. */
  readonly installedAt: number;
}

/** The append-only log row. `synced` is local bookkeeping, never uploaded. */
export type AttemptRow = AttemptRecord & { readonly synced: 0 | 1 };

export type CardStateRow = CardState;

export type SkillRow = Skill;

/** A correction the device has not yet folded into its own copy. */
export type CorrectionRow = QuestionCorrection & { readonly seen: 0 | 1 };

export interface BookmarkRow {
  readonly qid: string;
  /** Epoch milliseconds, UTC. */
  readonly createdAt: number;
}

export type DailySummaryRow = DailySummary;

/**
 * One queued error report (F11), collapsed by `(qid, qv, reason)` so a student
 * who taps the same reason twice sends one row. `sent` is local bookkeeping.
 */
export interface ReportRow extends QuestionReport {
  readonly sent: 0 | 1;
}

export interface SettingsRow extends Settings {
  readonly id: 'app';
  /** Epoch milliseconds, UTC. */
  readonly updatedAt: number;
}

/**
 * A batch that may already have reached the server. It is written before the
 * request and cleared only after a reply, so a retry resends exactly the same
 * set under the same id and the server can replay its stored response (D-067,
 * D-070). Without the pinned ids a retry could carry a newer attempt under an
 * old batch id, and the server would answer with the old batch's response.
 */
export interface PendingBatch {
  readonly batchId: BatchId;
  readonly attemptIds: readonly AttemptId[];
  readonly reports: readonly QuestionReport[];
}

export interface SyncMetaRow {
  readonly id: 'device';
  readonly deviceId: DeviceId;
  readonly cursor: Cursor | null;
  /** Epoch milliseconds, UTC. */
  readonly lastSyncAt: number | null;
  /** Absent on rows written before Step 7B; read as null. */
  readonly pendingBatch?: PendingBatch | null;
}

export class AppDatabase extends Dexie {
  questions!: EntityTable<QuestionRow, 'id'>;
  packs!: EntityTable<PackRow, 'id'>;
  attempts!: EntityTable<AttemptRow, 'id'>;
  cardState!: EntityTable<CardStateRow, 'qid'>;
  skills!: EntityTable<SkillRow, 'subtopicId'>;
  corrections!: EntityTable<CorrectionRow, 'id'>;
  bookmarks!: EntityTable<BookmarkRow, 'qid'>;
  dailySummary!: EntityTable<DailySummaryRow, 'date'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  syncMeta!: EntityTable<SyncMetaRow, 'id'>;
  reports!: Table<ReportRow, [string, number, ReportReason]>;

  constructor(name: string = DATABASE_NAME) {
    super(name);

    // Version 1 mirrors the spec table. A schema change adds `version(2)` and a
    // migration; existing rows are never dropped without one.
    this.version(1).stores({
      questions:
        'id, v, packId, section, subtopic, eloSeed, [section+subtopic], [section+eloSeed], [section+subtopic+eloSeed]',
      packs: 'id, version',
      attempts: 'id, qid, at, [at+id], [qid+at], synced',
      cardState: 'qid, due, phase',
      skills: 'subtopicId',
      corrections: 'id, qid, seen, [qid+toVersion]',
      bookmarks: 'qid, createdAt',
      dailySummary: 'date',
      settings: 'id',
      syncMeta: 'id',
    });

    // Step 7B: the offline queue for "Report an error" taps (F11). Additive:
    // version 1 databases upgrade in place and keep every row.
    this.version(2).stores({
      reports: '[qid+qv+reason], sent, at',
    });
  }
}

export const DATABASE_NAME = 'cgl-gk-master';

/**
 * Opens the database or rejects with the original error. A closed handle is
 * never returned, and the caller owns the resulting connection (F1).
 */
export function openDatabase(name: string = DATABASE_NAME): Promise<AppDatabase> {
  const db = new AppDatabase(name);
  return db.open().then(
    () => db,
    (error: unknown) => {
      db.close();
      throw error;
    },
  );
}
