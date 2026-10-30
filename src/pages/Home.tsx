import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Flame,
  Map,
  Newspaper,
  Play,
  RotateCcw,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { useApp } from "../store/appContext";
import { buildDaily, overallRating, weakTopics } from "../lib/adaptive";
import { caCategoryLabel, caEditions } from "../lib/ca";
import { saveSession } from "../lib/session";
import { formatDate, pct, todayKey } from "../lib/utils";
import { monthName } from "../lib/i18n";
import { getSubtopic, SECTION_MAP, SECTIONS } from "../data/taxonomy";
import { Progress } from "../components/ui";

export default function Home() {
  const { t, lang, user, questions, notify } = useApp();
  const navigate = useNavigate();

  const attempted = user.attempts.length;
  const correct = user.attempts.filter((a) => a.correct).length;
  const accuracy = pct(correct, attempted);
  const rating = overallRating(user);
  const topics = weakTopics(user, 3);
  const daily = buildDaily(questions, todayKey(), 10);
  const today = user.daily[todayKey()];
  const editions = caEditions(questions);
  const latest = editions[0];
  const latestQuestions = latest?.questions.slice(0, 4) ?? [];

  const startDaily = () => {
    if (!daily.length) {
      notify(t("notEnough"), "error");
      return;
    }
    saveSession({
      mode: "daily",
      title: t("dailyQuiz"),
      subtitle: t("dailyQuizSub"),
      questionIds: daily.map((q) => q.id),
      length: daily.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  const startLatestCa = () => {
    if (!latest) return;
    saveSession({
      mode: "current-affairs",
      title: `${monthName(lang, latest.month)} ${latest.year}`,
      subtitle: t("monthlySub"),
      questionIds: latest.questions.map((q) => q.id),
      length: latest.questions.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  return (
    <div className="page">
      <section className="hero">
        <div className="eyebrow">
          {/* oxlint-disable-next-line react/purity -- today's date for the header */}
          <Flame size={13} /> {formatDate(Date.now(), lang)}
        </div>
        <h1>
          {t("hello")} 👋
        </h1>
        <p>{t("homeSub")}</p>
        <div className="hero-actions">
          <button className="btn btn-light" onClick={startDaily}>
            <Play size={17} /> {today ? t("doneForToday") : t("doDaily")}
          </button>
          <button className="btn btn-outline" style={{ color: "#f4fff6", borderColor: "rgba(255,255,255,.25)" }} onClick={() => navigate("/mock")}>
            {t("mockTest")}
          </button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <b>{attempted}</b>
            <span>{t("attempted")}</span>
          </div>
          <div className="hero-stat">
            <b>{accuracy}%</b>
            <span>{t("accuracy")}</span>
          </div>
          <div className="hero-stat">
            <b>{user.streak.count}</b>
            <span>{t("streak")}</span>
          </div>
          <div className="hero-stat">
            <b>{rating.toFixed(1)}</b>
            <span>{t("skillLevel")}</span>
          </div>
        </div>
      </section>

      {today ? (
        <div className="card mt-12 row" style={{ borderColor: "color-mix(in srgb, var(--primary) 30%, var(--border))" }}>
          <div className="quick-icon" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
            <Trophy size={19} />
          </div>
          <div className="grow">
            <div className="card-title">{t("dailyDone")}</div>
            <div className="small muted mt-8">{t("todayQuizDone", { c: today.score, n: today.total })}</div>
          </div>
          <span className="badge badge-green">{t("keepStreak")}</span>
        </div>
      ) : (
        <div className="card mt-12 row">
          <div className="quick-icon">
            <CalendarDays size={19} />
          </div>
          <div className="grow">
            <div className="card-title">{t("dailyQuiz")}</div>
            <div className="small muted mt-8">{t("dailySub")}</div>
          </div>
          <button className="icon-btn soft" onClick={startDaily} aria-label={t("startQuiz")}>
            <ArrowRight size={18} />
          </button>
        </div>
      )}

      <div className="section-head">
        <h2>{t("quickActions")}</h2>
        <span className="small">{t("sections")}</span>
      </div>

      <div className="quick-grid">
        <button className="quick-card" onClick={() => navigate("/practice")}>
          <span className="quick-icon">
            <BookOpen size={19} />
          </span>
          <b>{t("practice")}</b>
          <span>{t("adaptiveSub")}</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/pyq")}>
          <span className="quick-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
            <Target size={19} />
          </span>
          <b>{t("pyq")}</b>
          <span>{t("pyqSub")}</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/mock")}>
          <span className="quick-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Trophy size={19} />
          </span>
          <b>{t("mockTest")}</b>
          <span>{t("mockSub")}</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/current-affairs")}>
          <span className="quick-icon" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
            <Newspaper size={19} />
          </span>
          <b>{t("currentAffairs")}</b>
          <span>{t("currentAffairsSub")}</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/map")}>
          <span className="quick-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <Map size={19} />
          </span>
          <b>{t("mapPractice")}</b>
          <span>{t("mapSub")}</span>
        </button>
        <button className="quick-card" onClick={() => navigate("/revise")}>
          <span className="quick-icon">
            <RotateCcw size={19} />
          </span>
          <b>{t("navRevise")}</b>
          <span>{t("reviseSub")}</span>
        </button>
      </div>

      <div className="section-head">
        <h2>{t("weakTopics")}</h2>
        <button className="card-link" onClick={() => navigate("/analytics")}>
          {t("viewAll")} <ChevronRight size={14} />
        </button>
      </div>

      <div className="card">
        {topics.length ? (
          topics.map((topic) => {
            const section = SECTION_MAP[topic.section];
            const sub = getSubtopic(topic.section, topic.subtopic);
            return (
              <button
                key={`${topic.section}-${topic.subtopic}`}
                className="weak-item"
                style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border)", textAlign: "left" }}
                onClick={() => navigate(`/practice?section=${topic.section}&subtopic=${topic.subtopic}`)}
              >
                <span className="topic-avatar" style={{ background: `${section.accent}18`, color: section.accent }}>
                  {section.emoji}
                </span>
                <span className="grow">
                  <span className="topic-name">{lang === "hi" ? sub?.hi : sub?.short}</span>
                  <span className="topic-meta">
                    {topic.accuracy}% · {topic.attempts} {t("attempts")} · {t("skill")} {topic.rating.toFixed(1)}
                  </span>
                </span>
                <span className="badge badge-red">{t("weak")}</span>
                <ChevronRight size={16} className="chev" />
              </button>
            );
          })
        ) : (
          <div className="center" style={{ padding: "10px 4px" }}>
            <Zap size={22} style={{ color: "var(--accent)", margin: "0 auto 8px" }} />
            <p className="small muted">{t("noWeak")}</p>
            <button className="btn btn-soft btn-sm mt-12" onClick={() => navigate("/practice")}>
              {t("startMixed")}
            </button>
          </div>
        )}
      </div>

      {latest && (
        <>
          <div className="section-head">
            <h2>{t("thisWeekCA")}</h2>
            <button className="card-link" onClick={() => navigate("/current-affairs")}>
              {t("viewAll")} <ChevronRight size={14} />
            </button>
          </div>
          <div className="card">
            <div className="row-between">
              <div>
                <div className="card-title">
                  {monthName(lang, latest.month)} {latest.year}
                </div>
                <div className="tiny muted mt-8">
                  {latest.count} {t("questions")} · {latest.latestEvent ? t("lastUpdated") : t("sampleEdition")}
                </div>
              </div>
              <button className="btn btn-sm" onClick={startLatestCa}>
                {t("start")} <ArrowRight size={14} />
              </button>
            </div>
            <div className="stack-sm mt-12">
              {latestQuestions.map((q) => (
                <div className="row" key={q.id}>
                  <span className="badge badge-purple">{caCategoryLabel(q.currentAffairs?.category, lang)}</span>
                  <span className="small grow" style={{ lineHeight: 1.35 }}>
                    {q.fact ?? q.question}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="section-head">
        <h2>{t("myProgress")}</h2>
        <button className="card-link" onClick={() => navigate("/analytics")}>
          {t("viewAll")} <ChevronRight size={14} />
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">{t("totalAttempted")}</div>
          <div className="stat-value">{attempted}</div>
          <Progress value={Math.min(100, attempted / 5)} />
        </div>
        <div className="stat-card">
          <div className="stat-label">{t("accuracy")}</div>
          <div className="stat-value">{accuracy}%</div>
          <Progress value={accuracy} tone={accuracy < 50 ? "danger" : undefined} />
        </div>
      </div>

      <div className="card mt-12">
        <div className="row-between">
          <span className="small bold">{t("sectionsCovered")}</span>
          <span className="badge badge-green">{SECTIONS.length} {t("sections")}</span>
        </div>
        <div className="stack-sm mt-12">
          {SECTIONS.map((section) => {
            const sectionAttempts = user.attempts.filter((a) => a.section === section.id);
            const sectionAcc = pct(sectionAttempts.filter((a) => a.correct).length, sectionAttempts.length);
            return (
              <div key={section.id} className="row" style={{ gap: 9 }}>
                <span style={{ fontSize: "0.95rem" }}>{section.emoji}</span>
                <span className="small grow">{lang === "hi" ? section.hi : section.short}</span>
                <span className="tiny faint">{sectionAttempts.length ? `${sectionAcc}%` : "—"}</span>
                <div style={{ width: 70 }}>
                  <Progress value={sectionAcc} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="warn-box mt-16">
        <b>{t("sampleTitle")}:</b> {t("sampleBody", { n: questions.length })}
      </div>
    </div>
  );
}
