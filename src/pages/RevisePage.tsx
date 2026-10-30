import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { Question } from "../types";
import { useApp } from "../store/appContext";
import { SECTION_MAP } from "../data/taxonomy";
import { saveSession } from "../lib/session";
import { daysBetween, formatDate, uniqueBy } from "../lib/utils";
import { PageHead } from "../components/Layout";
import { EmptyState, Modal } from "../components/ui";
import { QuestionCard } from "../components/QuestionView";

export default function RevisePage() {
  const { t, lang, user, questionById, notify, toggleBookmark } = useApp();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Question | null>(null);
  // oxlint-disable-next-line react/purity -- current time is needed to match due revisions
  const now = Date.now();

  const due = useMemo(
    () =>
      user.revisions
        .filter((item) => item.dueAt <= now)
        .map((item) => ({ item, question: questionById(item.questionId) }))
        .filter((entry): entry is { item: (typeof user.revisions)[number]; question: Question } =>
          Boolean(entry.question),
        ),
    [user.revisions, questionById, now],
  );

  const upcoming = useMemo(
    () =>
      user.revisions
        .filter((item) => item.dueAt > now)
        .map((item) => ({ item, question: questionById(item.questionId) }))
        .filter((entry): entry is { item: (typeof user.revisions)[number]; question: Question } =>
          Boolean(entry.question),
        )
        .sort((a, b) => a.item.dueAt - b.item.dueAt)
        .slice(0, 8),
    [user.revisions, questionById, now],
  );

  const bookmarks = useMemo(
    () =>
      user.bookmarks
        .map((id) => questionById(id))
        .filter((q): q is Question => Boolean(q)),
    [user.bookmarks, questionById],
  );

  const recentMistakes = useMemo(
    () =>
      uniqueBy(
        [...user.attempts].reverse().filter((attempt) => !attempt.correct),
        (attempt) => attempt.questionId,
      )
        .map((attempt) => questionById(attempt.questionId))
        .filter((q): q is Question => Boolean(q))
        .slice(0, 8),
    [user.attempts, questionById],
  );

  const start = (ids: string[], title: string, subtitle: string) => {
    if (!ids.length) {
      notify(t("notEnough"), "error");
      return;
    }
    saveSession({
      mode: "revise",
      title,
      subtitle,
      questionIds: ids,
      length: ids.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  return (
    <div className="page">
      <PageHead
        title={t("navRevise")}
        sub={t("reviseSub")}
        action={
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("backHome")}>
            <ArrowLeft size={19} />
          </button>
        }
      />

      <div className="card">
        <div className="row-between">
          <div className="row">
            <div className="quick-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
              <CalendarClock size={19} />
            </div>
            <div>
              <div className="card-title">{t("revisionQueueTitle")}</div>
              <div className="tiny muted mt-8">{t("spacedNote")}</div>
            </div>
          </div>
          <span className={`badge ${due.length ? "badge-red" : "badge-green"}`}>
            {t("dueCount", { n: due.length })}
          </span>
        </div>
        <div className="mt-12">
          <button
            className="btn btn-block"
            disabled={!due.length}
            onClick={() => start(due.map((entry) => entry.question.id), t("revisionQueueTitle"), t("reviseSub"))}
          >
            <Play size={16} /> {t("startDue")}
          </button>
        </div>
      </div>

      {due.length ? (
        <>
          <div className="section-head">
            <h2>{t("dueToday")}</h2>
            <span className="small">{due.length} {t("questions")}</span>
          </div>
          <div className="card">
            {due.map(({ item, question }) => (
              <button
                className="list-row"
                key={question.id}
                onClick={() => setPreview(question)}
                style={{ width: "100%" }}
              >
                <span className="topic-avatar" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                  <RotateCcw size={16} />
                </span>
                <span className="grow">
                  <span className="lr-title">{question.question}</span>
                  <span className="lr-sub">
                    {t("stage")} {item.stage + 1} · {t("reviewQueue")}
                  </span>
                </span>
                <span className="badge badge-red">{t("dueNow")}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="card mt-12">
          <EmptyState
            icon={<CheckCircle2 size={22} />}
            title={t("allCaughtUp")}
            body={t("allCaughtUpSub")}
            action={
              recentMistakes.length ? (
                <button
                  className="btn btn-soft btn-sm"
                  onClick={() => start(recentMistakes.map((q) => q.id), t("recentMistakes"), t("reviseSub"))}
                >
                  {t("reviewAll")}
                </button>
              ) : undefined
            }
          />
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t("upcoming")}</h2>
            <span className="small">{t("spacedNote")}</span>
          </div>
          <div className="card">
            {upcoming.map(({ item, question }) => (
              <button
                className="list-row"
                key={question.id}
                onClick={() => setPreview(question)}
                style={{ width: "100%" }}
              >
                <span className="topic-avatar">
                  <Clock size={16} />
                </span>
                <span className="grow">
                  <span className="lr-title">{question.question}</span>
                  <span className="lr-sub">
                    {t("stage")} {item.stage + 1} · {t("nextDue")} {formatDate(item.dueAt, lang)}
                  </span>
                </span>
                <span className="badge">{Math.max(0, daysBetween(now, item.dueAt))}{lang === "hi" ? ` ${t("day")}` : "d"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-head">
        <h2>{t("recentMistakes")}</h2>
        <span className="small">{recentMistakes.length} {t("questions")}</span>
      </div>
      {recentMistakes.length ? (
        <div className="card">
          {recentMistakes.map((question) => (
            <button
              className="list-row"
              key={question.id}
              onClick={() => setPreview(question)}
              style={{ width: "100%" }}
            >
              <span className="topic-avatar" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                <XCircle size={16} />
              </span>
              <span className="grow">
                <span className="lr-title">{question.question}</span>
                <span className="lr-sub">{question.explanation.slice(0, 70)}…</span>
              </span>
              <span className="badge badge-red">{t("wrongShort")}</span>
            </button>
          ))}
          <button
            className="btn btn-outline btn-block mt-12"
            onClick={() => start(recentMistakes.map((q) => q.id), t("recentMistakes"), t("reviseSub"))}
          >
            <RotateCcw size={16} /> {t("reviewAll")}
          </button>
        </div>
      ) : (
        <div className="card">
          <p className="small muted center">{t("noRevision")}</p>
        </div>
      )}

      <div className="section-head">
        <h2>{t("bookmarkedTitle")}</h2>
        <span className="small">{bookmarks.length}</span>
      </div>
      {bookmarks.length ? (
        <div className="card">
          {bookmarks.map((question) => (
            <div className="list-row" key={question.id}>
              <button
                className="topic-avatar"
                style={{ border: "none", background: "var(--accent-soft)", color: "var(--accent)" }}
                onClick={() => toggleBookmark(question.id)}
                aria-label={t("removeBookmark")}
              >
                <Bookmark size={16} fill="currentColor" />
              </button>
              <button
                className="grow"
                onClick={() => setPreview(question)}
                style={{ background: "none", border: "none", textAlign: "left" }}
              >
                <span className="lr-title" style={{ display: "block" }}>
                  {question.question}
                </span>
                <span className="lr-sub">
                  {t("difficulty")} {question.difficulty}/5 · {lang === "hi" ? SECTION_MAP[question.section].hi : SECTION_MAP[question.section].name}
                </span>
              </button>
              <span className="badge">{t("bookmark")}</span>
            </div>
          ))}
          <button
            className="btn btn-outline btn-block mt-12"
            onClick={() => start(bookmarks.map((q) => q.id), t("bookmarks"), t("bookmarkList"))}
          >
            <Play size={16} /> {t("startQuiz")}
          </button>
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={<Bookmark size={22} />} title={t("bookmarkEmpty")} body={t("noBookmarks")} />
        </div>
      )}

      <div className="info-box mt-16 row" style={{ alignItems: "flex-start", gap: 8 }}>
        <Sparkles size={16} style={{ marginTop: 2 }} />
        <span className="small">{t("reviseExtra")}</span>
      </div>

      <Modal open={Boolean(preview)} title={t("reviewAnswer")} onClose={() => setPreview(null)}>
        {preview && (
          <QuestionCard
            question={preview}
            selected={null}
            revealed
            showBookmark={false}
          />
        )}
        {preview && (
          <button
            className="btn btn-block mt-12"
            onClick={() => start([preview.id], t("reviewAnswer"), t("reviseSub"))}
          >
            <Play size={16} /> {t("startRevision")}
          </button>
        )}
      </Modal>
    </div>
  );
}
