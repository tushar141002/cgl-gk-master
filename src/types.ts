export type SectionId =
  | "history"
  | "geography"
  | "polity"
  | "economy"
  | "science"
  | "static";

export type Source = "PYQ" | "Practice" | "Current Affairs";

export type CAFlag =
  | "National"
  | "International"
  | "Sports"
  | "Awards"
  | "Science"
  | "Economy"
  | "Schemes";

export interface HindiContent {
  question?: string;
  options?: string[];
  explanation?: string;
}

export interface PyqInfo {
  year: number;
  date: string;
  shift: string;
}

export interface CaInfo {
  month: number; // 1-12
  year: number;
  category: CAFlag;
  /** Optional exact event date, enables the weekly quiz. ISO YYYY-MM-DD */
  eventDate?: string;
}

export interface Question {
  id: string;
  question: string;
  options: string[];
  answer: number; // 0..3
  explanation: string;
  section: SectionId;
  subtopic: string; // taxonomy sub-topic id
  difficulty: number; // 1..5
  source: Source;
  pyq?: PyqInfo;
  currentAffairs?: CaInfo;
  image?: string;
  hindi?: HindiContent;
  verified: boolean;
  tags: string[];
  /** Short flashcard fact for current-affairs one-liners */
  fact?: string;
  /** Optional memory hook shown with the explanation */
  tip?: string;
  seed?: boolean;
  createdAt: number;
}

export interface Attempt {
  id: string;
  questionId: string;
  section: SectionId;
  subtopic: string;
  correct: boolean;
  timeMs: number;
  at: number;
  mode: QuizMode;
}

export type QuizMode =
  | "practice"
  | "pyq"
  | "mock"
  | "current-affairs"
  | "daily"
  | "map"
  | "revise"
  | "challenge";

export interface SubtopicStat {
  rating: number;
  attempts: number;
  correct: number;
  timeMs: number;
  lastAt: number;
}

export interface RevisionItem {
  questionId: string;
  stage: 0 | 1 | 2;
  dueAt: number;
  addedAt: number;
  lastResult?: "correct" | "wrong";
}

export interface MockResult {
  id: string;
  at: number;
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  score: number;
  maxScore: number;
  timeUsedSec: number;
  scope: string;
}

export interface DailyRecord {
  day: string;
  score: number;
  total: number;
  at: number;
}

export interface UserSettings {
  theme: "system" | "light" | "dark";
  lang: "en" | "hi";
  haptics: boolean;
}

export interface UserData {
  version: number;
  createdAt: number;
  settings: UserSettings;
  adminPin: string;
  stats: Record<string, SubtopicStat>;
  attempts: Attempt[];
  bookmarks: string[];
  revisions: RevisionItem[];
  daily: Record<string, DailyRecord>;
  streak: { count: number; best: number; lastDay: string | null };
  activity: Record<string, number>;
  mocks: MockResult[];
  /** Full replacement objects for built-in questions, null means deleted. */
  overrides: Record<string, Question | null>;
  customTags: string[];
  lastPractice?: { section: SectionId; subtopic: string; at: number };
}

export interface SessionConfig {
  mode: QuizMode;
  title: string;
  subtitle?: string;
  section?: SectionId;
  subtopic?: string;
  tag?: string;
  /** Fixed list of question ids (mock / pyq / daily etc.) */
  questionIds?: string[];
  /** Adaptive session length. Infinity is represented by 0 */
  length?: number;
  timeLimitSec?: number;
  negativeMarking?: boolean;
  instantFeedback?: boolean;
}

export interface AnswerState {
  questionId: string;
  selected: number;
  correct: boolean;
  timeMs: number;
}
