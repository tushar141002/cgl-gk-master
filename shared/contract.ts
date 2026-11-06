/**
 * CGL GK Master — data contract.
 *
 * Every type here is plain data that crosses a boundary: IndexedDB, the /sync
 * endpoint, a signed pack file, or the admin site. There is no behaviour and no
 * imports in this file, so it can be used unchanged by the phone app, the admin
 * bundle and the server functions.
 *
 * Shapes mirror PROJECT_SPEC.md §6 (data model) and §7 (data contract). If a
 * field changes here it changes everywhere at once — that is the point of the
 * file. Behaviour belongs in src/core/, not here.
 */

/** Four options is a product decision, not an implementation detail. */
export const OPTION_COUNT = 4;

/** Probability of a correct answer from guessing alone. Elo is corrected for it. */
export const GUESSING_FLOOR = 1 / OPTION_COUNT;

/** Contract limits for a single sync batch (PROJECT_SPEC.md §7). */
export const MAX_ATTEMPTS_PER_BATCH = 200;
export const MAX_REPORTS_PER_BATCH = 20;

/** India Standard Time is UTC+05:30, year round. No daylight saving. */
export const IST_OFFSET_MINUTES = 330;

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/**
 * All identifiers are strings at every boundary. The device mints attempt IDs
 * as UUID v7 (D-011); question IDs come from the signed pack.
 */
export type QuestionId = string;
export type SubtopicId = string;
export type PackId = string;
export type DeviceId = string;
export type AttemptId = string;
export type BatchId = string;
export type MockId = string;

// ---------------------------------------------------------------------------
// Questions and packs
// ---------------------------------------------------------------------------

/** The seven sections in PROJECT_SPEC.md §2. v1 ships the first three. */
export type SectionId =
  'history' | 'geography' | 'polity' | 'economy' | 'science' | 'static-gk' | 'current-affairs';

export type OptionIndex = 0 | 1 | 2 | 3;

/** Where a question came from. Every question must carry one. */
export interface QuestionSource {
  readonly type: 'PYQ' | 'CA' | 'practice';
  readonly exam?: string;
  readonly year?: number;
  readonly shift?: string;
  /** ISO date of the paper or the PIB release, whichever applies. */
  readonly date?: string;
  /** `YYYY-MM` for current-affairs questions. */
  readonly caMonth?: string;
}

/** The same question in one language. */
export interface LocalizedText {
  readonly q: string;
  readonly options: readonly [string, string, string, string];
  readonly explanation: string;
}

/**
 * A practisable question at one version. `v` is bumped on any correction
 * (D-022); an attempt records the `qv` it was graded against.
 */
export interface Question {
  readonly id: QuestionId;
  readonly v: number;
  readonly packId: PackId;
  readonly section: SectionId;
  readonly subtopic: SubtopicId;
  readonly source: QuestionSource;
  readonly en: LocalizedText;
  /** Bilingual from day one, so publish requires this; `null` only while drafting. */
  readonly hi: LocalizedText | null;
  readonly answer: OptionIndex;
  /** Starting difficulty for adaptive practice. Server calibration overrides it later. */
  readonly eloSeed: number;
  readonly image?: string;
  readonly verifiedAt: string;
}

export interface PackEntry {
  readonly id: PackId;
  readonly section: SectionId;
  readonly subtopic: SubtopicId;
  readonly kind: 'evergreen' | 'current-affairs';
  readonly version: number;
  readonly sha256: string;
  readonly url: string;
  readonly count: number;
  readonly bytes: number;
}

/**
 * `manifest.json`, fetched first on every content check. `signature` is Ed25519
 * over the canonical JSON of every other field (D-025). The app holds only the
 * public key.
 */
export interface Manifest {
  readonly version: number;
  readonly generatedAt: string;
  readonly signature: string;
  readonly packs: readonly PackEntry[];
}

// ---------------------------------------------------------------------------
// Attempts — the source of truth
// ---------------------------------------------------------------------------

export type AttemptMode = 'practice' | 'pyq' | 'mock' | 'daily' | 'revise';

/**
 * One answer, as recorded on the phone. Append-only: a correction never edits
 * an attempt, it changes how later attempts are graded and how the attempt is
 * re-interpreted by the replayer (D-022).
 *
 * `chosen === null` means skipped. Option order is canonical — the app does not
 * shuffle options in v1 (D-032) — so `chosen` is directly comparable to
 * `Question.answer`.
 */
export interface AttemptRecord {
  readonly id: AttemptId;
  readonly qid: QuestionId;
  /** The question version this was graded against. */
  readonly qv: number;
  readonly chosen: OptionIndex | null;
  readonly correct: boolean;
  readonly ms: number;
  readonly mode: AttemptMode;
  readonly mockId?: MockId;
  /** Epoch milliseconds, UTC. The server decides the IST day from it. */
  readonly at: number;
  readonly deviceId: DeviceId;
}

// ---------------------------------------------------------------------------
// Derived state — rebuilt by replay, never synced per attempt (D-016, D-026)
// ---------------------------------------------------------------------------

export type CardPhase = 'new' | 'learning' | 'review' | 'relearning';

/**
 * FSRS-7 state for one question. Derived from attempts, never synced per
 * attempt (D-016). The field names and semantics mirror the `ts-fsrs` v6 card
 * so the nightly rebuild and the phone run the same scheduler (D-037).
 */
export interface CardState {
  readonly qid: QuestionId;
  /** Epoch milliseconds, UTC. */
  readonly due: number;
  /** Memory stability in days. */
  readonly stability: number;
  /** FSRS-7's fast stability component. Fed back into the next review. */
  readonly stabilityFast: number;
  /** Item difficulty on the FSRS scale. */
  readonly difficulty: number;
  /** The interval FSRS chose, in fractional days. */
  readonly scheduledDays: number;
  /** Index into the learning or relearning step list; 0 when in review. */
  readonly learningStep: number;
  readonly reps: number;
  readonly lapses: number;
  /** Epoch milliseconds, UTC, or null when the card has never been reviewed. */
  readonly lastReview: number | null;
  readonly phase: CardPhase;
}

/** Ability estimate for one sub-topic. Derived from attempts. */
export interface Skill {
  readonly subtopicId: SubtopicId;
  readonly elo: number;
  readonly attemptCount: number;
}

export interface DailySummary {
  /** IST calendar day, `YYYY-MM-DD`. */
  readonly date: string;
  readonly attempted: number;
  readonly correct: number;
  readonly ms: number;
}

/**
 * Replay start point, written by the nightly job before any prune (D-026).
 * A device rebuilds FSRS and Elo from the newest checkpoint plus the attempts
 * recorded after `cursor`.
 */
export interface Checkpoint {
  readonly cursor: string;
  readonly cardStates: readonly CardState[];
  readonly skills: readonly Skill[];
  readonly istDailyTotals: readonly DailySummary[];
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Corrections and reports
// ---------------------------------------------------------------------------

/** Appended when a published answer key turns out to be wrong (D-022). */
export interface QuestionCorrection {
  readonly id: string;
  readonly qid: QuestionId;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly oldAnswer: OptionIndex;
  readonly newAnswer: OptionIndex;
  readonly reason: string;
  readonly correctedAt: string;
}

export type ReportReason = 'wrong-key' | 'typo' | 'wrong-translation' | 'unclear' | 'other';

/** A student's "Report error" tap (F11). */
export interface QuestionReport {
  readonly qid: QuestionId;
  readonly qv: number;
  readonly reason: ReportReason;
  /** Epoch milliseconds, UTC. */
  readonly at: number;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/**
 * POST /sync body. There is no client `daily` field: the server derives
 * `daily_stats` from `attempts` alone (D-028).
 */
export interface SyncBatch {
  readonly batchId: BatchId;
  readonly deviceId: DeviceId;
  readonly cursor: string | null;
  readonly attempts: readonly AttemptRecord[];
  readonly reports: readonly QuestionReport[];
}

export type SyncResponse =
  | {
      readonly ok: true;
      readonly serverTime: number;
      readonly newCursor: string;
      readonly corrections: readonly QuestionCorrection[];
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly retryAfterMs?: number;
    };

// ---------------------------------------------------------------------------
// Pure helpers shared by the app and the server
// ---------------------------------------------------------------------------

/**
 * The IST calendar day for a moment in time, as `YYYY-MM-DD`.
 *
 * Streaks are counted in IST (PROJECT_SPEC.md §8), so this is the only
 * definition of "today" in the codebase.
 */
export function istDayKey(at: number): string {
  return new Date(at + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}
