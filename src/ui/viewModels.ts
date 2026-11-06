import type { OptionIndex, SectionId, SubtopicId } from '../../shared/contract';

/**
 * Plain shapes passed into screens. They live in `ui/` so a screen never needs
 * to import a service or a repository (flow.md import matrix).
 */

export interface HomeStats {
  readonly attemptedToday: number;
  readonly correctToday: number;
  readonly streak: number;
  readonly doneToday: boolean;
  readonly averageElo: number;
  readonly dueCount: number;
  readonly questionCount: number;
}

export interface TopicRow {
  readonly subtopic: SubtopicId;
  readonly section: SectionId;
  readonly count: number;
  readonly elo: number;
}

export type PickReasonView = 'review' | 'new';

/** The parts of a graded answer the feedback card needs. */
export interface FeedbackView {
  readonly chosen: OptionIndex | null;
  readonly correct: boolean;
  readonly skipped: boolean;
}
