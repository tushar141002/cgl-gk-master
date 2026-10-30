import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Play,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useApp } from "../store/appContext";
import {
  caCategories,
  caCategoryLabel,
  caEditions,
  caQuestions,
  latestCaYear,
  latestEventDate,
  weeklyCaQuestions,
} from "../lib/ca";
import { saveSession } from "../lib/session";
import { formatEventDate } from "../lib/utils";
import { monthName } from "../lib/i18n";
import { PageHead } from "../components/Layout";
import { EmptyState, Progress } from "../components/ui";

type Tab = "monthly" | "weekly" | "one-liners" | "year";

export default function CurrentAffairsPage() {
  const { t, lang, questions, notify } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("monthly");
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const editions = useMemo(() => caEditions(questions), [questions]);
  const weekly = useMemo(() => weeklyCaQuestions(questions), [questions]);
  const categories = useMemo(() => caCategories(questions), [questions]);
  const year = latestCaYear(questions);
  const yearQuestions = useMemo(
    () =>
      caQuestions(questions)
        .filter((q) => q.currentAffairs?.year === year)
        .sort((a, b) => (b.currentAffairs?.eventDate ?? "").localeCompare(a.currentAffairs?.eventDate ?? "")),
    [questions, year],
  );
  const oneLiners = useMemo(
    () =>
      caQuestions(questions)
        .filter((q) => q.fact)
        .sort((a, b) => (b.currentAffairs?.eventDate ?? "").localeCompare(a.currentAffairs?.eventDate ?? "")),
    [questions],
  );
  const latestEvent = latestEventDate(questions);
  const card = oneLiners[cardIndex];

  const start = (ids: string[], title: string, subtitle: string) => {
    if (!ids.length) {
      notify(t("notEnough"), "error");
      return;
    }
    saveSession({
      mode: "current-affairs",
      title,
      subtitle,
      questionIds: ids,
      length: ids.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  const moveCard = (delta: number) => {
    if (!oneLiners.length) return;
    setCardIndex((prev) => (prev + delta + oneLiners.length) % oneLiners.length);
    setRevealed(false);
  };

  return (
    <div className="page">
      <PageHead
        title={t("currentAffairs")}
        sub={t("currentAffairsSub")}
        action={
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("backHome")}>
            <ArrowLeft size={19} />
          </button>
        }
      />

      <section className="ca-hero">
        <div className="row-between">
          <span className="badge" style={{ background: "rgba(255,255,255,.12)", color: "#e2e8f0", borderColor: "rgba(255,255,255,.16)" }}>
            <Sparkles size={11} /> {t("sampleData")}
          </span>
          {latestEvent && <span className="tiny" style={{ color: "#cbd5e1" }}>{t("lastUpdated")}: {formatEventDate(latestEvent, lang)}</span>}
        </div>
        <h2>{t("latestNews")}</h2>
        <p>
          {editions.length} {t("months")} · {caQuestions(questions).length} {t("totalCa")} · {categories.length}{" "}
          {t("category")}
        </p>
        <div className="row mt-12" style={{ gap: 8 }}>
          <button
            className="btn btn-light btn-sm"
            onClick={() =>
              weekly.items.length
                ? start(weekly.items.map((q) => q.id), t("weekly"), t("weeklySub"))
                : notify(t("oneLinerEmpty"), "info")
            }
          >
            <Play size={14} /> {t("weekly")}
          </button>
          <button
            className="btn btn-sm btn-outline"
            style={{ color: "#f8fafc", borderColor: "rgba(255,255,255,.25)" }}
            onClick={() => start(yearQuestions.map((q) => q.id), t("yearInReview"), t("yearInReviewSub"))}
          >
            {t("yearReview")}
          </button>
        </div>
      </section>

      <div className="tabs mt-12">
        {(
          [
            ["monthly", t("monthly")],
            ["weekly", t("weekly")],
            ["one-liners", t("oneLiners")],
            ["year", t("yearReview")],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "monthly" && (
        <>
          <div className="section-head">
            <h2>{t("chooseMonth")}</h2>
            <span className="small">{t("monthlySub")}</span>
          </div>
          <div className="month-grid">
            {editions.map((edition) => (
              <button
                key={`${edition.year}-${edition.month}`}
                className="month-card"
                onClick={() =>
                  start(
                    edition.questions.map((q) => q.id),
                    `${monthName(lang, edition.month)} ${edition.year}`,
                    t("monthlySub"),
                  )
                }
              >
                <div>
                  <b>{monthName(lang, edition.month, true)}</b>
                  <span style={{ display: "block" }}>{edition.year}</span>
                </div>
                <div className="row-between">
                  <span className="count">{edition.count}</span>
                  <span>{edition.datedCount}/{edition.count} {t("events")}</span>
                </div>
              </button>
            ))}
          </div>
          {editions.length === 0 && (
            <EmptyState icon={<CalendarDays size={22} />} title={t("caEmpty")} body={t("caUpdateHint")} />
          )}
          <div className="info-box mt-12">
            <b>{t("atLeastFive")}</b>
            <p className="tiny mt-8">{t("caUpdateHint")}</p>
          </div>
        </>
      )}

      {tab === "weekly" && (
        <>
          <div className="card mt-12">
            <div className="row-between">
              <div>
                <div className="card-title">{t("weeklyWindow")}</div>
                <div className="tiny muted mt-8">
                  {weekly.start ? formatEventDate(weekly.start, lang) : "—"} → {weekly.end ? formatEventDate(weekly.end, lang) : "—"}
                </div>
              </div>
              <span className="badge badge-purple">{weekly.items.length} {t("events")}</span>
            </div>
            <div className="mt-12">
              <Progress value={Math.min(100, weekly.items.length * 10)} />
            </div>
            <button
              className="btn btn-block mt-12"
              disabled={!weekly.items.length}
              onClick={() => start(weekly.items.map((q) => q.id), t("weekly"), t("weeklySub"))}
            >
              <Play size={16} /> {t("weekly")}
            </button>
          </div>

          {weekly.items.length ? (
            <div className="card mt-12">
              <div className="small bold mb-8">{t("latestNews")}</div>
              {weekly.items.map((q) => (
                <div className="list-row" key={q.id}>
                  <span className="topic-avatar">📰</span>
                  <span className="grow">
                    <span className="lr-title">{q.fact ?? q.question}</span>
                    <span className="lr-sub">
                      {formatEventDate(q.currentAffairs?.eventDate, lang)} · {caCategoryLabel(q.currentAffairs?.category, lang)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Clock size={22} />}
              title={t("oneLinerEmpty")}
              body={t("caUpdateHint")}
            />
          )}
        </>
      )}

      {tab === "one-liners" &&
        (card ? (
          <>
            <div className="section-head">
              <h2>{t("oneLiners")}</h2>
              <span className="small">{t("oneLinerProgress", { i: cardIndex + 1, n: oneLiners.length })}</span>
            </div>
            <div
              className="card flashcard"
              role="button"
              tabIndex={0}
              onClick={() => setRevealed((v) => !v)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") setRevealed((v) => !v);
              }}
            >
              <div>
                <div className="row-between">
                  <span className="badge badge-purple">{caCategoryLabel(card.currentAffairs?.category, lang)}</span>
                  <span className="tiny faint">{formatEventDate(card.currentAffairs?.eventDate, lang)}</span>
                </div>
                <p className="fact-question mt-12">{card.question}</p>
                <p
                  className="fact-text mt-12"
                  style={{
                    filter: revealed ? "none" : "blur(6px)",
                    transition: "filter .18s",
                    userSelect: revealed ? "auto" : "none",
                  }}
                >
                  {card.fact}
                </p>
              </div>
              <div>
                <div className="row-between">
                  <span className="one-liner-index">
                    {cardIndex + 1} / {oneLiners.length}
                  </span>
                  <span className="tiny faint">{revealed ? t("markRead") : t("showFact")}</span>
                </div>
                <div className="flashcard-controls mt-12">
                  <button
                    className="icon-btn soft"
                    onClick={(event) => {
                      event.stopPropagation();
                      moveCard(-1);
                    }}
                    aria-label={t("prev")}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRevealed((v) => !v);
                    }}
                  >
                    {revealed ? t("flip") : t("showFact")}
                  </button>
                  <button
                    className="icon-btn soft"
                    onClick={(event) => {
                      event.stopPropagation();
                      moveCard(1);
                    }}
                    aria-label={t("nextFact")}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
            <button
              className="btn btn-outline btn-block mt-12"
              onClick={() =>
                start(oneLiners.slice(0, 10).map((q) => q.id), t("oneLiners"), t("oneLinerSub"))
              }
            >
              <Layers size={16} /> {t("startQuiz")}
            </button>
          </>
        ) : (
          <EmptyState icon={<Sparkles size={22} />} title={t("oneLinerEmpty")} body={t("caUpdateHint")} />
        ))}

      {tab === "year" && (
        <>
          <div className="card mt-12">
            <div className="row">
              <div className="quick-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Trophy size={19} />
              </div>
              <div className="grow">
                <div className="card-title">
                  {t("yearInReview")} {year ?? ""}
                </div>
                <div className="tiny muted mt-8">
                  {yearQuestions.length} {t("events")} · {yearQuestions.filter((q) => q.currentAffairs?.eventDate).length}{" "}
                  {t("totalCa")}
                </div>
              </div>
            </div>
            <div className="mt-12">
              <Progress value={Math.min(100, yearQuestions.length * 2)} />
            </div>
            <button
              className="btn btn-block mt-12"
              disabled={!yearQuestions.length}
              onClick={() => start(yearQuestions.map((q) => q.id), t("yearInReview"), t("yearInReviewSub"))}
            >
              <Play size={16} /> {t("startQuiz")}
            </button>
          </div>

          <div className="card mt-12">
            <div className="small bold mb-8">{t("byCategory")}</div>
            {categories.map((row) => (
              <div className="bar-row" key={row.category}>
                <span className="label">{caCategoryLabel(row.category, lang)}</span>
                <Progress value={Math.min(100, (row.count / Math.max(1, categories[0].count)) * 100)} />
                <span className="value">{row.count}</span>
              </div>
            ))}
          </div>

          <div className="card mt-12">
            <div className="small bold mb-8">{t("latestNews")}</div>
            {yearQuestions.slice(0, 8).map((q) => (
              <div className="list-row" key={q.id}>
                <span className="badge badge-purple">{monthName(lang, q.currentAffairs?.month ?? 1, true)}</span>
                <span className="grow">
                  <span className="lr-title">{q.fact ?? q.question}</span>
                  <span className="lr-sub">{formatEventDate(q.currentAffairs?.eventDate, lang)}</span>
                </span>
                <ArrowRight size={14} className="chev" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
