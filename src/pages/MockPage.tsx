import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Play,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import type { Question, SectionId } from "../types";
import { buildMock } from "../lib/adaptive";
import { formatClock } from "../lib/utils";
import { useApp } from "../store/appContext";
import { SECTIONS } from "../data/taxonomy";
import { Modal, Progress } from "../components/ui";
import { QuestionCard } from "../components/QuestionView";

type Phase = "setup" | "running" | "result";

export default function MockPage() {
  const { t, tList, lang, questions, user, recordAnswer, recordMock, notify } = useApp();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(25);
  const [minutes, setMinutes] = useState(15);
  const [selectedSections, setSelectedSections] = useState<Set<SectionId>>(
    () => new Set(SECTIONS.map((section) => section.id)),
  );
  const [negative, setNegative] = useState(true);

  const [paper, setPaper] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [timeUsedSec, setTimeUsedSec] = useState(0);
  const finishedRef = useRef(false);

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const current = paper[index];

  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const finalize = useCallback(
    (auto: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;

      const attempted = paper.filter((q) => answers[q.id] !== undefined);
      const correct = attempted.filter((q) => answers[q.id] === q.answer).length;
      const wrong = attempted.length - correct;
      const score = correct - (negative ? wrong * 0.5 : 0);
      const limitSec = minutes * 60;
      const used = Math.max(0, Math.min(limitSec, limitSec - remaining));
      const perQuestion = attempted.length ? Math.round((used / attempted.length) * 1000) : 0;

      for (const q of attempted) {
        recordAnswer(q, answers[q.id] === q.answer, perQuestion, "mock");
      }
      recordMock({
        total: paper.length,
        attempted: attempted.length,
        correct,
        wrong,
        score,
        maxScore: paper.length,
        timeUsedSec: used,
        scope:
          selectedSections.size === SECTIONS.length
            ? ""
            : SECTIONS.filter((section) => selectedSections.has(section.id))
                .map((section) => (lang === "hi" ? section.hi : section.short))
                .join(", "),
      });
      setTimeUsedSec(used);
      setAutoSubmitted(auto);
      setPhase("result");
      setConfirmOpen(false);
      setShowReview(false);
    },
    [answers, lang, minutes, negative, paper, recordAnswer, recordMock, remaining, selectedSections],
  );

  useEffect(() => {
    if (phase === "running" && deadline > 0 && now >= deadline) {
      finalize(true);
      notify(t("autoSubmitted"), "info");
    }
  }, [deadline, finalize, notify, now, phase, t]);

  const toggleSection = (id: SectionId) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = () => {
    if (!selectedSections.size) {
      notify(t("selectAtLeastOne"), "error");
      return;
    }
    if (count < 5 || count > 50) {
      notify(t("invalidCount"), "error");
      return;
    }
    if (minutes < 3 || minutes > 60) {
      notify(t("invalidTime"), "error");
      return;
    }
    const built = buildMock(questions, count, [...selectedSections]);
    if (built.length < 5) {
      notify(t("mockNoQuestions"), "error");
      return;
    }
    setPaper(built);
    setAnswers({});
    setMarked(new Set());
    setIndex(0);
    setDeadline(Date.now() + minutes * 60_000);
    setNow(Date.now());
    setPaletteOpen(true);
    setAutoSubmitted(false);
    finishedRef.current = false;
    setPhase("running");
  };

  const retake = () => {
    setPhase("setup");
    setAnswers({});
    setMarked(new Set());
    setShowReview(false);
  };

  /* ---------- Setup ---------- */

  if (phase === "setup") {
    return (
      <div className="page page-nonav">
        <div className="page-head">
          <div>
            <h1 className="page-title">{t("mockTest")}</h1>
            <p className="page-sub">{t("mockSub2")}</p>
          </div>
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("backHome")}>
            <ArrowLeft size={20} />
          </button>
        </div>

        <div className="card">
          <div className="card-title">{t("testConfig")}</div>
          <div className="field-row mt-12">
            <div className="field">
              <label>{t("chooseCount")}</label>
              <input
                className="input"
                type="number"
                min={5}
                max={50}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label>{t("chooseTime")}</label>
              <input
                className="input"
                type="number"
                min={3}
                max={60}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </div>
          </div>

          <div className="field mt-12">
            <label>{t("sections")}</label>
            <div className="stack-sm">
              {SECTIONS.map((section) => (
                <label key={section.id} className="check">
                  <input
                    type="checkbox"
                    checked={selectedSections.has(section.id)}
                    onChange={() => toggleSection(section.id)}
                  />
                  <span>
                    {section.emoji} {lang === "hi" ? section.hi : section.name}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="check mt-12">
            <input type="checkbox" checked={negative} onChange={(event) => setNegative(event.target.checked)} />
            <span>{t("negativeMarking")} (−0.5)</span>
          </label>

          <button className="btn btn-block mt-16" onClick={start}>
            <Play size={17} /> {t("startMock")}
          </button>
        </div>

        <div className="info-box mt-12">
          <b>{t("instructions")}:</b>
          <ul style={{ marginTop: 6, paddingLeft: 16, listStyle: "disc" }}>
            {tList("mockInstructions").map((line) => (
              <li key={line} className="small">
                {line}
              </li>
            ))}
          </ul>
          <p className="tiny mt-8">{t("mockTimerNote")}</p>
        </div>

        <div className="warn-box mt-12">{t("mockReviewNote")}</div>

        {user.mocks.length > 0 && (
          <div className="card mt-12">
            <div className="row-between mb-8">
              <span className="small bold">{t("mockHistory")}</span>
              <span className="tiny faint">
                {t("avgScore")}:{" "}
                {(user.mocks.reduce((sum, mock) => sum + mock.score, 0) / user.mocks.length).toFixed(1)}
              </span>
            </div>
            {user.mocks.slice(0, 3).map((mock) => (
              <div className="mock-row" key={mock.id}>
                <div>
                  <div className="small bold">
                    {mock.score.toFixed(1)} / {mock.maxScore}
                  </div>
                  <div className="tiny faint">
                    {mock.correct} {t("correctShort")} · {mock.wrong} {t("wrongShort")} · {mock.scope && mock.scope !== "All sections" ? mock.scope : t("allSectionsLabel")}
                  </div>
                </div>
                <span className="badge">{formatClock(mock.timeUsedSec)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ---------- Result ---------- */

  if (phase === "result") {
    const attempted = paper.filter((q) => answers[q.id] !== undefined);
    const correct = attempted.filter((q) => answers[q.id] === q.answer).length;
    const wrong = attempted.length - correct;
    const score = correct - (negative ? wrong * 0.5 : 0);
    const maxScore = paper.length;

    return (
      <div className="page page-nonav">
        <div className="result-hero card card-pad-lg">
          <div
            className="score-circle"
            style={{ "--p": `${maxScore ? Math.max(0, (score / maxScore) * 100) : 0}%` } as CSSProperties}
          >
            <div className="score-inner">
              <b>{score.toFixed(1)}</b>
              <span>/ {maxScore}</span>
            </div>
          </div>
          <h1 className="page-title">{t("testSummary")}</h1>
          <p className="page-sub">
            {t("score")}: {score.toFixed(1)} / {maxScore} · {t("accuracyLine", { n: attempted.length ? Math.round((correct / attempted.length) * 100) : 0 })}
          </p>
          <div className="result-stats">
            <div className="result-stat">
              <b style={{ color: "var(--success)" }}>{correct}</b>
              <span>{t("correctShort")}</span>
            </div>
            <div className="result-stat">
              <b style={{ color: "var(--danger)" }}>{wrong}</b>
              <span>{t("wrongShort")}</span>
            </div>
            <div className="result-stat">
              <b>{paper.length - attempted.length}</b>
              <span>{t("skippedShort")}</span>
            </div>
          </div>
          <div className="row wrap mt-16" style={{ justifyContent: "center", gap: 8 }}>
            <span className="badge">
              <Clock size={12} /> {formatClock(timeUsedSec)}
            </span>
            <span className="badge badge-amber">{t("negative")}: −0.5</span>
            {autoSubmitted && <span className="badge badge-red">{t("autoSubmitted")}</span>}
          </div>
        </div>

        <div className="btn-row mt-16">
          <button className="btn btn-outline" onClick={retake}>
            <RotateCcw size={17} /> {t("retake")}
          </button>
          <button className="btn" onClick={() => navigate("/")}>
            {t("backHome")}
          </button>
        </div>
        <button className="btn btn-soft btn-block mt-12" onClick={() => setShowReview((v) => !v)}>
          {showReview ? t("hideSolution") : t("viewSolutions")}
        </button>

        {showReview && (
          <div className="stack mt-16">
            {paper.map((question, idx) => {
              const selected = answers[question.id];
              const status = selected === undefined ? "skipped" : selected === question.answer ? "correct" : "wrong";
              return (
                <div key={question.id}>
                  <div className="row-between mb-8">
                    <span className="badge">{t("questionNo", { n: idx + 1 })}</span>
                    <span className={`badge ${status === "skipped" ? "" : status === "correct" ? "badge-green" : "badge-red"}`}>
                      {status === "skipped" ? t("skipped") : status === "correct" ? t("correctShort") : t("wrongShort")}
                    </span>
                  </div>
                  <QuestionCard
                    question={question}
                    selected={selected ?? null}
                    revealed
                    showBookmark={false}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  /* ---------- Running ---------- */

  const answeredCount = Object.keys(answers).length;
  const progress = paper.length ? (answeredCount / paper.length) * 100 : 0;

  return (
    <div className="page page-nonav" style={{ padding: 0 }}>
      <div className="mock-bar">
        <button
          className="icon-btn"
          onClick={() => setConfirmOpen(true)}
          aria-label={t("submit")}
        >
          <ArrowLeft size={19} />
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="quiz-title">{t("mockTest")}</div>
          <div className="quiz-subtitle">
            {answeredCount}/{paper.length} {t("answered")} · {marked.size} {t("markedForReview")}
          </div>
        </div>
        <div className={`timer-box${remaining <= 60 ? " warn" : ""}`}>
          <Clock size={14} /> {formatClock(remaining)}
        </div>
        <button className="btn btn-sm" onClick={() => setConfirmOpen(true)}>
          {t("submit")}
        </button>
      </div>

      <div className="mock-layout">
        <div className="card" style={{ padding: 12 }}>
          <button
            className="row-between"
            style={{ width: "100%", background: "none", border: "none" }}
            onClick={() => setPaletteOpen((v) => !v)}
          >
            <span className="small bold">{t("questionPalette")}</span>
            <span className="row tiny faint" style={{ gap: 8 }}>
              {t("answeredCount", { n: answeredCount })} · {t("markedCount", { n: marked.size })}
              <ChevronDown
                size={16}
                style={{ transform: paletteOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
              />
            </span>
          </button>
          {paletteOpen && (
            <>
              <div className="mt-8">
                <Progress value={progress} />
              </div>
              <div className="palette mt-12">
                {paper.map((question, idx) => {
                  const isAnswered = answers[question.id] !== undefined;
                  const isMarked = marked.has(question.id);
                  return (
                    <button
                      key={question.id}
                      className={`palette-btn${isAnswered ? " answered" : ""}${isMarked ? " marked" : ""}${
                        idx === index ? " current" : ""
                      }`}
                      onClick={() => setIndex(idx)}
                      aria-label={`${t("questionNo", { n: idx + 1 })}${isAnswered ? ` · ${t("answered")}` : ""}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {current && (
          <div className="mt-12">
            <QuestionCard
              question={current}
              index={index + 1}
              total={paper.length}
              selected={answers[current.id] ?? null}
              revealed={false}
              showBookmark={false}
              onSelect={(choice) =>
                setAnswers((prev) => {
                  const next = { ...prev };
                  if (next[current.id] === choice) delete next[current.id];
                  else next[current.id] = choice;
                  return next;
                })
              }
            />
          </div>
        )}

        <div className="card mt-12">
          <div className="row-between">
            <span className="tiny faint">{t("testInstructions")}</span>
            <button
              className={`btn btn-sm ${marked.has(current?.id ?? "") ? "btn-soft" : "btn-outline"}`}
              onClick={() => {
                if (!current) return;
                setMarked((prev) => {
                  const next = new Set(prev);
                  if (next.has(current.id)) next.delete(current.id);
                  else next.add(current.id);
                  return next;
                });
              }}
            >
              <Flag size={14} /> {t("markReview")}
            </button>
          </div>
          <div className="row-between mt-12">
            <span className="small bold">
              {t("remaining")}: {formatClock(remaining)}
            </span>
            <span className="badge">{t("testMode")}</span>
          </div>
        </div>
      </div>

      <div className="mock-footer">
        <div className="mock-footer-inner">
          <button
            className="btn btn-outline"
            disabled={index === 0}
            onClick={() => setIndex((n) => Math.max(0, n - 1))}
          >
            {t("prevShort")}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (!current) return;
              setAnswers((prev) => {
                const next = { ...prev };
                delete next[current.id];
                return next;
              });
            }}
          >
            {t("clear")}
          </button>
          <button
            className="btn"
            onClick={() => {
              if (index + 1 < paper.length) setIndex(index + 1);
              else setConfirmOpen(true);
            }}
          >
            {index + 1 < paper.length ? t("saveAndNext") : t("finishTest")}
            {index + 1 < paper.length ? <ArrowRight size={16} /> : <Check size={16} />}
          </button>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        title={t("finishTest")}
        onClose={() => setConfirmOpen(false)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setConfirmOpen(false)}>
              {t("goBack")}
            </button>
            <button className="btn" onClick={() => finalize(false)}>
              {answeredCount < paper.length ? t("submitAnyway") : t("submit")}
            </button>
          </>
        }
      >
        <p>
          {t("score")}: {t("answeredCount", { n: answeredCount })} ·{" "}
          {paper.length - answeredCount} {t("unanswered")}
        </p>
        <p className="tiny mt-8">{t("mockReviewNote")}</p>
        <div className="row mt-12" style={{ gap: 8 }}>
          <span className="badge badge-green">
            <Check size={11} /> {answeredCount}
          </span>
          <span className="badge badge-red">
            <X size={11} /> {paper.length - answeredCount} {t("unanswered")}
          </span>
          <span className="badge">
            <Trophy size={11} /> {count}
          </span>
        </div>
      </Modal>
    </div>
  );
}
