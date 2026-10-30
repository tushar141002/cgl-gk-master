import { createContext, useContext } from "react";
import type { MockResult, Question, QuizMode, UserData, UserSettings } from "../types";
import type { I18nKey, Lang } from "../lib/i18n";

export interface AppContextValue {
  user: UserData;
  questions: Question[];
  lang: Lang;
  t: (key: I18nKey, vars?: Record<string, string | number>) => string;
  tList: (key: I18nKey) => readonly string[];
  questionById: (id: string) => Question | undefined;
  recordAnswer: (
    question: Question,
    correct: boolean,
    timeMs: number,
    mode: QuizMode,
  ) => void;
  queueRevision: (questionId: string) => void;
  toggleBookmark: (questionId: string) => void;
  completeDaily: (score: number, total: number, questionIds: string[]) => void;
  recordMock: (result: Omit<MockResult, "id" | "at">) => void;
  saveQuestion: (q: Question) => void;
  deleteQuestion: (id: string) => void;
  setVerified: (ids: string[], verified: boolean) => void;
  importQuestions: (questions: Question[], verified: boolean) => void;
  updateSettings: (patch: Partial<UserSettings>) => void;
  setAdminPin: (pin: string) => void;
  resetProgress: () => void;
  restore: (json: string) => void;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
  storageError: string | null;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
