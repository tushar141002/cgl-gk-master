import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Flame, RotateCcw, Trophy, X, Zap } from "lucide-react";
import type { AnswerState, Question, QuizMode, SessionConfig } from "../types";
import { filterPool, pickAdaptive } from "../lib/adaptive";
import { readSession } from "../lib/session";
import { useApp } from "../store/appContext";
import { formatDuration } from "../lib/utils";
import { EmptyState, Modal, Progress } from "../components/ui";
import { QuestionCard } from "../components/QuestionView";

interface ReviewEntry extends AnswerState {
  question: Question;
}

function longestCorrectRun(entries: ReviewEntry[]): number {
  let best = 0;
  let run = 0;
  for (const entry of entries) {
    run = entry.correct ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

function backRoute(mode: QuizMode): string {
  switch (mode) {
    case "pyq":
      return "/pyq";
    case "current-affairs":
      return "/current-affairs";
    case "map":
      return "/map";
    case "revise":
      return "/revise";
    default:
      return "/practice";
  }
}

export default function SessionPage() {
  const config = useMemo(() => readSession(), []);
  if (!config) return <Navigate to="/" replace />;
  return <SessionRunner config={config} />;
}

function SessionRunner({ config }: { config: SessionConfig }) {
  const { t, lang, questions, user, questionById, recordAnswer, completeDaily, notify } = useApp();
  const navigate = useNavigate();
  const isFixed = Boolean(config.questionIds?.length);
  const sessionLength = config.length ?? 10;
  const isEndless = !isFixed && sessionLength === 0;

  const fixedQueue = useMemo(
    () => (config.questionIds ?? []).map((id) => questionById(id)).filter((q): q is Question => Boolean(q)),
    [config.questionIds, questionById],
  );

  const basePool = useMemo(
    () =>
      filterPool(questions, {
        section: config.section,
        subtopic: config.subtopic,
        tag: config.tag,
      }),
    [questions, config.section, config.subtopic, config.tag],
  );

  const recentRef = useRef<string[]>([]);
  const startRef = useRef(Date.now());
  const dailyDoneRef = useRef(false);

  const firstAdaptive = useMemo(() => {
    if (isFixed) return fixedQueue[0] ?? null;
    return pickAdaptive({
      pool: basePool,
      user,
      section: config.section,
      subtopic: config.subtopic,
      challenge: config.mode === "challenge",
    });
    // The first question is intentionally frozen for the life of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [current, setCurrent] = useState<Question | null>(firstAdaptive);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<ReviewEntry[]>([]);
  const [finished, setFinished] = useState(false);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [wrongStreak, setWrongStreak] = useState(0);
  const [pending, setPending] = useState<"challenge" | "recovery" | null>(null);
  const [banner, setBanner] = useState<"challenge" | "recovery" | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const total = isFixed ? fixedQueue.length : isEndless ? 0 : sessionLength;
  const attempted = results.length;
  const correctCount = results.filter((r) => r.correct).length;
  const wrongCount = attempted - correctCount;

  const finish = (entries = results) => {
    if (finished) return;
    if (config.mode === "daily" && !dailyDoneRef.current) {
      dailyDoneRef.current = true;
      completeDaily(
        entries.filter((entry) => entry.correct).length,
        isFixed ? fixedQueue.length : entries.length,
        (config.questionIds ?? []).slice(0, isFixed ? undefined : entries.length),
      );
    }
    setFinished(true);
  };

  const pickNext = (kind: "challenge" | "recovery" | null): Question | null => {
    const excluded = [...recentRef.current, ...results.map((r) => r.questionId)];
    if (current) excluded.push(current.id);
    let next = pickAdaptive({
      pool: basePool,
      user,
      section: config.section,
      subtopic: config.subtopic,
      excludeIds: excluded,
      challenge: kind === "challenge" || config.mode === "challenge",
      recovery: kind === "recovery",
    });
    if (!next) {
      next = pickAdaptive({
        pool: basePool,
        user,
        section: config.section,
        subtopic: config.subtopic,
        excludeIds: current ? [current.id] : [],
        challenge: kind === "challenge" || config.mode === "challenge",
        recovery: kind === "recovery",
      });
    }
    return next;
  };

  const handleSelect = (choice: number) => {
    if (!current || revealed) return;
    const timeMs = Date.now() - startRef.current;
    const correct = choice === current.answer;
    recordAnswer(current, correct, timeMs, config.mode);
    setSelected(choice);
    setRevealed(true);
    recentRef.current = [...recentRef.current.slice(-14), current.id];
    setResults((prev) => [
      ...prev,
      { questionId: current.id, question: current, selected: choice, correct, timeMs },
    ]);
    if (user.settings.haptics && "vibrate" in navigator) navigator.vibrate?.(correct ? 12 : [20, 40, 20]);

    if (correct) {
      const next = correctStreak + 1;
      setCorrectStreak(next);
      setWrongStreak(0);
      if (next >= 5) setPending("challenge");
    } else {
      const next = wrongStreak + 1;
      setWrongStreak(next);
      setCorrectStreak(0);
      if (next >= 3) setPending("recovery");
    }
  };

  const handleNext = () => {
    const entries = results;
    if (isFixed) {
      const nextIndex = index + 1;
      if (nextIndex >= fixedQueue.length) {
        finish(entries);
        return;
      }
      setIndex(nextIndex);
      setCurrent(fixedQueue[nextIndex] ?? null);
      setSelected(null);
      setRevealed(false);
      startRef.current = Date.now();
      return;
    }

    if (!isEndless && entries.length >= sessionLength) {
      finish(entries);
      return;
    }

    const kind = pending;
    const next = pickNext(kind);
    if (!next) {
      finish(entries);
      notify(t("notEnough"), "info");
      return;
    }
    setBanner(kind);
    if (kind === "challenge") {
      setCorrectStreak(0);
      setPending(null);
    } else if (kind === "recovery") {
      setWrongStreak(0);
      setPending(null);
    }
    setCurrent(next);
    setIndex((n) => n + 1);
    setSelected(null);
    setRevealed(false);
    startRef.current = Date.now();
  };

  const restart = () => {
    if (isFixed) {
      setCurrent(fixedQueue[0] ?? null);
    } else {
      recentRef.current = [];
      const next = pickAdaptive({
        pool: basePool,
        user,
        section: config.section,
        subtopic: config.subtopic,
        challenge: config.mode === "challenge",
      });
      setCurrent(next);
    }
    setIndex(0);
    setSelected(null);
    setRevealed(false);
    setResults([]);
    setFinished(false);
    setCorrectStreak(0);
    setWrongStreak(0);
    setPending(null);
    setBanner(null);
    setShowReview(false);
    dailyDoneRef.current = false;
    startRef.current = Date.now();
  };

  const reviewEntries: ReviewEntry[] = isFixed
    ? fixedQueue.map((question, idx) => {
        const entry = results[idx];
        return (
          entry ?? {
            questionId: question.id,
            question,
            selected: -1,
            correct: false,
            timeMs: 0,
          }
        );
      })
    : results;

  if (!current && !finished) {
    return (
      <div className="page page-nonav">
        <EmptyState
          icon={<Zap size={22} />}
          title={t("noQuestions")}
          body={t("notEnough")}
          action={
            <button className="btn" onClick={() => navigate(backRoute(config.mode))}>
              {t("backToSetup")}
            </button>
          }
        />
      </div>
    );
  }

  if (finished) {
    const reviewList = showReview ? (
      <div className="stack mt-16">
        {reviewEntries.map((entry, idx) => (
          <div key={`${entry.questionId}-${idx}`}>
            <div className="row-between mb-8">
              <span className="badge">{t("questionNo", { n: idx + 1 })}</span>
              <span className={`badge ${entry.selected === -1 ? "" : entry.correct ? "badge-green" : "badge-red"}`}>
                {entry.selected === -1 ? t("skipped") : entry.correct ? t("correctShort") : t("wrongShort")}
              </span>
            </div>
            <QuestionCard
              question={entry.question}
              selected={entry.selected >= 0 ? entry.selected : null}
              revealed
              showBookmark={false}
            />
          </div>
        ))}
      </div>
    ) : null;

    return (
      <div className="page page-nonav">
        <div className="card card-pad-lg result-hero">
          <div
            className="score-circle"
            style={{ "--p": `${total ? Math.round((correctCount / total) * 100) : 0}%` } as CSSProperties}
          >
            <div className="score-inner">
              <b>
                {correctCount}/{isFixed ? total : attempted}
              </b>
              <span>{t("accuracy")}</span>
            </div>
          </div>
          <h1 className="page-title">{t("quizComplete")}</h1>
          <p className="page-sub">
            {t("correctOf", { c: correctCount, n: isFixed ? total : attempted })}
          </p>
          <div className="result-stats">
            <div className="result-stat">
              <b style={{ color: "var(--success)" }}>{correctCount}</b>
              <span>{t("correctShort")}</span>
            </div>
            <div className="result-stat">
              <b style={{ color: "var(--danger)" }}>{wrongCount}</b>
              <span>{t("wrongShort")}</span>
            </div>
            <div className="result-stat">
              <b>{attempted ? Math.round((correctCount / attempted) * 100) : 0}%</b>
              <span>{t("accuracy")}</span>
            </div>
          </div>
          <div className="row wrap mt-16" style={{ justifyContent: "center", gap: 8 }}>
            <span className="badge">
              <Flame size={12} /> {t("answerStreak")}: {longestCorrectRun(results)}
            </span>
            <span className="badge">
              {t("time")}: {formatDuration(results.reduce((sum, entry) => sum + entry.timeMs, 0), lang)}
            </span>
          </div>
        </div>

        <div className="stack mt-16">
          <button className="btn btn-block" onClick={() => setShowReview((v) => !v)}>
            {showReview ? t("hideSolution") : t("viewSolutions")}
          </button>
          <div className="btn-row">
            <button className="btn btn-outline" onClick={restart}>
              <RotateCcw size={17} /> {t("retake")}
            </button>
            <button className="btn" onClick={() => navigate("/")}>
              {t("backHome")}
            </button>
          </div>
        </div>
        {reviewList}
      </div>
    );
  }

  const progress = isEndless
    ? Math.min(100, (attempted % 10) * 10 || (attempted ? 100 : 0))
    : total
      ? (Math.min(attempted, total) / total) * 100
      : 0;

  return (
    <div className="page page-nonav" style={{ paddingTop: 0, paddingLeft: 0, paddingRight: 0 }}>
      <header className="quiz-top">
        <div className="quiz-top-inner">
          <button className="icon-btn" onClick={() => setExitOpen(true)} aria-label={t("exit")}>
            <ArrowLeft size={20} />
          </button>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="quiz-title">{config.title}</div>
            <div className="quiz-subtitle">{config.subtitle ?? config.mode}</div>
          </div>
          {isEndless ? (
            <button className="btn btn-outline btn-sm" onClick={() => finish()}>
              {t("finish")}
            </button>
          ) : (
            <span className="badge">
              {attempted}/{total}
            </span>
          )}
        </div>
        <div className="quiz-progress">
          <Progress value={progress} />
          <div className="row-between mt-8">
            <span className="tiny faint">
              {isEndless
                ? t("answeredCount", { n: attempted })
                : `${t("question")} ${Math.min(index + 1, total || index + 1)} ${t("of")} ${total}`}
            </span>
            <span className="row tiny faint" style={{ gap: 5 }}>
              {correctStreak > 0 && (
                <span className="badge badge-green">
                  <Flame size={10} /> {correctStreak}
                </span>
              )}
              {wrongStreak > 0 && (
                <span className="badge badge-red">
                  <X size={10} /> {wrongStreak}
                </span>
              )}
            </span>
          </div>
        </div>
      </header>

      <div style={{ padding: "12px 16px 20px" }}>
        {banner === "challenge" && (
          <div className="streak-banner challenge">
            <Trophy size={16} /> {t("challengeUnlocked")}
          </div>
        )}
        {banner === "recovery" && (
          <div className="streak-banner recovery">
            <Zap size={16} /> {t("recoveryMode")}
          </div>
        )}

        {current && (
          <QuestionCard
            question={current}
            index={index + 1}
            total={total || undefined}
            selected={selected}
            revealed={revealed}
            onSelect={handleSelect}
            recovery={revealed && banner === "recovery"}
          />
        )}

        {revealed && (
          <div className="answer-actions">
            <button className="btn" onClick={handleNext}>
              {isFixed
                ? index + 1 >= fixedQueue.length
                  ? t("seeResults")
                  : t("next")
                : isEndless || results.length < sessionLength
                  ? t("next")
                  : t("seeResults")}
              <ArrowRight size={17} />
            </button>
          </div>
        )}

        {!revealed && (
          <div className="row center mt-12 tiny faint" style={{ justifyContent: "center", gap: 6 }}>
            <Check size={14} /> {t("statsNote")}
          </div>
        )}
      </div>

      <Modal
        open={exitOpen}
        title={t("exit")}
        onClose={() => setExitOpen(false)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setExitOpen(false)}>
              {t("goBack")}
            </button>
            <button className="btn btn-danger-soft" onClick={() => navigate(backRoute(config.mode))}>
              {t("exit")}
            </button>
          </>
        }
      >
        <p>{t("exitConfirm")}</p>
      </Modal>
    </div>
  );
}

