import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  MockResult,
  Question,
  QuizMode,
  UserData,
  UserSettings,
} from "../types";
import { mergeBank, SEED_QUESTIONS } from "../data/bank";
import { topicKey } from "../data/taxonomy";
import { AppContext, type AppContextValue } from "./appContext";
import {
  dailyStreakAfterCompletion,
  nextRevisionStage,
  ratingChange,
  START_RATING,
} from "../lib/adaptive";
import { defaultUser, importUser, loadUser, saveUser } from "../lib/storage";
import { addDays, todayKey } from "../lib/utils";
import { translate, translateList, type I18nKey } from "../lib/i18n";

interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData>(() => loadUser());
  const [storageError, setStorageError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const saveTimer = useRef<number | null>(null);

  const notify = useCallback((message: string, kind: Toast["kind"] = "info") => {
    setToast({ id: Date.now(), message, kind });
  }, []);

  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        saveUser(user);
        setStorageError(null);
      } catch {
        setStorageError("Could not save. Device storage may be full.");
      }
    }, 180);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const lang = user.settings.lang;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        user.settings.theme === "system" ? (media.matches ? "dark" : "light") : user.settings.theme;
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#0b1120" : "#f6f7f2");
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [user.settings.theme]);

  const t = useCallback(
    (key: I18nKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
  const tList = useCallback((key: I18nKey) => translateList(lang, key), [lang]);

  const questions = useMemo(() => mergeBank(SEED_QUESTIONS, user.overrides), [user.overrides]);
  const questionMap = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const questionById = useCallback((id: string) => questionMap.get(id), [questionMap]);

  const recordAnswer = useCallback(
    (question: Question, correct: boolean, timeMs: number, mode: QuizMode) => {
      setUser((prev) => {
        const now = Date.now();
        const key = topicKey(question.section, question.subtopic);
        const stat = prev.stats[key];
        const current = stat?.rating ?? START_RATING;
        const change = ratingChange(current, correct, timeMs, question.difficulty);
        const nextStat = {
          rating: change.next,
          attempts: (stat?.attempts ?? 0) + 1,
          correct: (stat?.correct ?? 0) + (correct ? 1 : 0),
          timeMs: (stat?.timeMs ?? 0) + timeMs,
          lastAt: now,
        };
        const day = todayKey();
        const activity = { ...prev.activity, [day]: (prev.activity[day] ?? 0) + 1 };
        const attempts = [
          ...prev.attempts,
          {
            id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
            questionId: question.id,
            section: question.section,
            subtopic: question.subtopic,
            correct,
            timeMs,
            at: now,
            mode,
          },
        ].slice(-3000);

        let revisions = prev.revisions;
        const existing = prev.revisions.find((r) => r.questionId === question.id);
        if (mode === "revise" && existing) {
          const step = nextRevisionStage(existing.stage, correct);
          if (step.stage === 3) {
            revisions = prev.revisions.filter((r) => r.questionId !== question.id);
          } else {
            revisions = prev.revisions.map((r) =>
              r.questionId === question.id
                ? {
                    ...r,
                    stage: step.stage as 0 | 1 | 2,
                    dueAt: addDays(now, step.days),
                    lastResult: correct ? "correct" : "wrong",
                  }
                : r,
            );
          }
        } else if (!correct) {
          const item = {
            questionId: question.id,
            stage: 0 as const,
            dueAt: addDays(now, 1),
            addedAt: existing?.addedAt ?? now,
            lastResult: "wrong" as const,
          };
          revisions = existing
            ? prev.revisions.map((r) => (r.questionId === question.id ? item : r))
            : [...prev.revisions, item];
        } else if (mode === "revise" && !existing) {
          revisions = prev.revisions;
        }

        return {
          ...prev,
          stats: { ...prev.stats, [key]: nextStat },
          attempts,
          activity,
          revisions,
          lastPractice: {
            section: question.section,
            subtopic: question.subtopic,
            at: now,
          },
        };
      });
    },
    [],
  );

  const queueRevision = useCallback((questionId: string) => {
    setUser((prev) => {
      if (prev.revisions.some((r) => r.questionId === questionId)) return prev;
      return {
        ...prev,
        revisions: [
          ...prev.revisions,
          {
            questionId,
            stage: 0 as const,
            dueAt: addDays(Date.now(), 1),
            addedAt: Date.now(),
            lastResult: "wrong" as const,
          },
        ],
      };
    });
  }, []);

  const toggleBookmark = useCallback((questionId: string) => {
    setUser((prev) => {
      const has = prev.bookmarks.includes(questionId);
      return {
        ...prev,
        bookmarks: has ? prev.bookmarks.filter((id) => id !== questionId) : [...prev.bookmarks, questionId],
      };
    });
  }, []);

  const completeDaily = useCallback((score: number, total: number, questionIds: string[]) => {
    setUser((prev) => {
      const day = todayKey();
      const existing = prev.daily[day];
      const streak = existing ? prev.streak : dailyStreakAfterCompletion(prev, day);
      const record = {
        day,
        score: existing ? Math.max(existing.score, score) : score,
        total,
        at: Date.now(),
        questionIds,
      };
      return {
        ...prev,
        daily: { ...prev.daily, [day]: record },
        streak,
      };
    });
  }, []);

  const recordMock = useCallback((result: Omit<MockResult, "id" | "at">) => {
    setUser((prev) => ({
      ...prev,
      mocks: [
        {
          ...result,
          id: `mock-${Date.now()}`,
          at: Date.now(),
        },
        ...prev.mocks,
      ].slice(0, 40),
    }));
  }, []);

  const saveQuestion = useCallback((q: Question) => {
    setUser((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [q.id]: q },
      customTags: Array.from(new Set([...prev.customTags, ...q.tags])).slice(0, 100),
    }));
  }, []);

  const deleteQuestion = useCallback((id: string) => {
    setUser((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [id]: null },
    }));
  }, []);

  const setVerified = useCallback((ids: string[], verified: boolean) => {
    setUser((prev) => {
      const bank = new Map(mergeBank(SEED_QUESTIONS, prev.overrides).map((q) => [q.id, q]));
      const overrides = { ...prev.overrides };
      for (const id of ids) {
        const q = bank.get(id);
        if (!q) continue;
        const next = { ...q, verified };
        const seed = SEED_QUESTIONS.find((entry) => entry.id === id);
        // Drop the override when the toggle lands back on the shipped value.
        if (seed && JSON.stringify(next) === JSON.stringify(seed)) delete overrides[id];
        else overrides[id] = next;
      }
      return { ...prev, overrides };
    });
  }, []);

  const importQuestions = useCallback((incoming: Question[], verified: boolean) => {
    setUser((prev) => {
      const overrides = { ...prev.overrides };
      const tags = new Set(prev.customTags);
      for (const q of incoming) {
        overrides[q.id] = {
          ...q,
          verified,
          seed: false,
          createdAt: Date.now(),
        };
        q.tags.forEach((tag) => tags.add(tag));
      }
      return { ...prev, overrides, customTags: [...tags].slice(0, 100) };
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setUser((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const setAdminPin = useCallback((pin: string) => {
    setUser((prev) => ({ ...prev, adminPin: pin }));
  }, []);

  const resetProgress = useCallback(() => {
    setUser((prev) => ({
      ...defaultUser(),
      settings: prev.settings,
      adminPin: prev.adminPin,
      overrides: prev.overrides,
      customTags: prev.customTags,
      createdAt: prev.createdAt,
    }));
  }, []);

  const restore = useCallback((json: string) => {
    const data = importUser(json);
    setUser(data);
  }, []);

  const value: AppContextValue = {
    user,
    questions,
    lang,
    t,
    tList,
    questionById,
    recordAnswer,
    queueRevision,
    toggleBookmark,
    completeDaily,
    recordMock,
    saveQuestion,
    deleteQuestion,
    setVerified,
    importQuestions,
    updateSettings,
    setAdminPin,
    resetProgress,
    restore,
    notify,
    storageError,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
          {toast.message}
        </div>
      )}
      {storageError && (
        <div className="toast toast-error" role="alert">
          {storageError}
        </div>
      )}
    </AppContext.Provider>
  );
}
