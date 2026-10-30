import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, ChevronRight, Clock3, Flame, Target, Trophy } from "lucide-react";
import { SECTIONS, getSubtopic, SECTION_MAP } from "../data/taxonomy";
import type { MockResult } from "../types";
import { useApp } from "../store/appContext";
import {
  overallRating,
  pyqCoverage,
  sectionAccuracy,
  strongTopics,
  studyStreak,
  topicSummaries,
  weakTopics,
  type TopicSummary,
} from "../lib/adaptive";
import { formatDate, formatDuration, pct, todayKey } from "../lib/utils";
import { PageHead } from "../components/Layout";
import { EmptyState, Progress, StatCard } from "../components/ui";

const DAY_MS = 86_400_000;
const ACTIVITY_DAYS = 14;

export default function AnalyticsPage() {
  const { t, lang, user, questions } = useApp();
  const navigate = useNavigate();

  const attempted = user.attempts.length;
  const correct = user.attempts.filter((attempt) => attempt.correct).length;
  const accuracy = pct(correct, attempted);
  const avgMs = attempted ? user.attempts.reduce((sum, attempt) => sum + attempt.timeMs, 0) / attempted : 0;
  const totalMs = user.attempts.reduce((sum, attempt) => sum + attempt.timeMs, 0);
  const streak = studyStreak(user);
  const rating = overallRating(user);

  const sections = useMemo(() => {
    const accuracyBySection = sectionAccuracy(user);
    return SECTIONS.map((section) => ({
      section,
      ...accuracyBySection[section.id],
    }));
  }, [user]);

  const weak = useMemo(() => weakTopics(user, 4), [user]);
  const strong = useMemo(() => strongTopics(user, 3), [user]);
  const summaries = useMemo(() => topicSummaries(user), [user]);
  const coverage = useMemo(() => pyqCoverage(questions, user), [questions, user]);

  const activity = useMemo(() => {
    return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
      // oxlint-disable-next-line react/purity -- activity window is anchored to today
      const date = new Date(Date.now() - (ACTIVITY_DAYS - 1 - index) * DAY_MS);
      const key = todayKey(date);
      return {
        key,
        count: user.activity[key] ?? 0,
        label: String(date.getDate()),
        full: formatDate(date.getTime(), lang),
      };
    });
  }, [user.activity, lang]);

  const peak = Math.max(...activity.map((day) => day.count), 1);
  const mocks = useMemo(() => [...user.mocks].sort((a, b) => b.at - a.at).slice(0, 6), [user.mocks]);

  if (!attempted) {
    return (
      <div className="page">
        <PageHead title={t("analytics")} sub={t("statsNote")} />
        <EmptyState
          icon={<BarChart3 size={24} />}
          title={t("noHistory")}
          action={
            <button className="btn" onClick={() => navigate("/practice")}>
              {t("startPractice")} <ChevronRight size={15} />
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHead title={t("analytics")} sub={t("statsNote")} />

      <div className="stat-grid">
        <StatCard
          label={t("totalAttempted")}
          value={attempted}
          hint={t("correctOf", { c: correct, n: attempted })}
        />
        <StatCard
          label={t("accuracy")}
          value={`${accuracy}%`}
          hint={correct + " " + t("correctShort")}
        />
        <StatCard
          label={t("avgTime")}
          value={formatDuration(avgMs, lang)}
          hint={`${t("totalTime")}: ${formatDuration(totalMs, lang)}`}
        />
        <StatCard
          label={t("skillLevel")}
          value={rating.toFixed(1)}
          hint={`${t("studyStreak")}: ${streak} ${streak === 1 ? t("day") : t("days")}`}
        />
      </div>

      <div className="section-head">
        <h2>{t("radar")}</h2>
        <span className="small">{t("attemptsLabel")}</span>
      </div>
      <div className="card">
        {sections.map(({ section, total, accuracy: sectionAcc }) => (
          <div className="bar-row" key={section.id}>
            <span className="label">
              {section.emoji} {lang === "hi" ? section.hi : section.name}
            </span>
            <Progress value={sectionAcc} tone={sectionAcc < 50 ? "danger" : undefined} />
            <span className="value">{total ? `${sectionAcc}%` : "—"}</span>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>{t("recentActivity")}</h2>
        <span className="small">{t("attemptsPerDay")}</span>
      </div>
      <div className="card">
        <div className="chart-bars">
          {activity.map((day) => (
            <div className="chart-bar" key={day.key} title={`${day.full} · ${day.count}`}>
              <div
                className="bar"
                style={{
                  height: `${Math.max(4, Math.round((day.count / peak) * 100))}%`,
                  opacity: day.count ? 0.9 : 0.25,
                }}
              />
              <span className="lbl">{day.label}</span>
            </div>
          ))}
        </div>
        <div className="row-between mt-12">
          <span className="tiny muted">
            {t("totalAttempted")}: {activity.reduce((sum, day) => sum + day.count, 0)}
          </span>
          <span className="badge badge-green">
            <Flame size={12} /> {streak} {streak === 1 ? t("day") : t("days")}
          </span>
        </div>
      </div>

      <div className="section-head">
        <h2>{t("weakAreas")}</h2>
        <button className="card-link" onClick={() => navigate("/practice")}>
          {t("startMixed")} <ChevronRight size={14} />
        </button>
      </div>
      <div className="card">
        {weak.length ? (
          weak.map((topic) => (
            <TopicRow
              key={`${topic.section}-${topic.subtopic}`}
              topic={topic}
              badge={<span className="badge badge-red">{t("weak")}</span>}
              onOpen={() => navigate(`/practice?section=${topic.section}&subtopic=${topic.subtopic}`)}
              lang={lang}
            />
          ))
        ) : (
          <p className="small muted">{attempted < 5 ? t("attemptToSee") : t("allGood")}</p>
        )}
      </div>

      {strong.length > 0 && (
        <>
          <div className="section-head">
            <h2>{t("strongAreas")}</h2>
            <span className="small">{t("topicSkill")}</span>
          </div>
          <div className="card">
            {strong.map((topic) => (
              <TopicRow
                key={`${topic.section}-${topic.subtopic}`}
                topic={topic}
                badge={<span className="badge badge-green">{t("strong")}</span>}
                onOpen={() => navigate(`/practice?section=${topic.section}&subtopic=${topic.subtopic}`)}
                lang={lang}
              />
            ))}
          </div>
        </>
      )}

      {summaries.some((summary) => summary.attempts > 0) && (
        <>
          <div className="section-head">
            <h2>{t("topicBreakdown")}</h2>
            <span className="small">{t("accuracy")}</span>
          </div>
          <div className="card">
            <TopicTable topics={summaries} lang={lang} onOpen={(section, subtopic) => navigate(`/practice?section=${section}&subtopic=${subtopic}`)} />
          </div>
        </>
      )}

      <div className="section-head">
        <h2>{t("coverage")}</h2>
        <span className="small">{t("allTime")}</span>
      </div>
      <div className="card">
        {coverage.length ? (
          coverage.map((row) => (
            <div className="coverage-row" key={row.year}>
              <div className="row-between">
                <span className="small bold">{row.year}</span>
                <span className="tiny muted">
                  {row.done} / {row.total} · {row.percent}%
                </span>
              </div>
              <Progress value={row.percent} />
            </div>
          ))
        ) : (
          <p className="small muted">{t("coverageSub")}</p>
        )}
      </div>

      <div className="section-head">
        <h2>{t("mockHistory")}</h2>
        <button className="card-link" onClick={() => navigate("/mock")}>
          {t("startTest")} <ChevronRight size={14} />
        </button>
      </div>
      <div className="card">
        {mocks.length ? (
          mocks.map((mock) => <MockRow key={mock.id} mock={mock} lang={lang} />)
        ) : (
          <EmptyState
            icon={<Trophy size={22} />}
            title={t("noMocks")}
            action={
              <button className="btn btn-sm" onClick={() => navigate("/mock")}>
                {t("startTest")}
              </button>
            }
          />
        )}
      </div>

      <div className="info-box mt-16">
        <Target size={15} /> {t("practiceTip")}
      </div>
      <div className="tiny faint center mt-12">
        <Clock3 size={12} /> {t("dataNote")}
      </div>
    </div>
  );
}

function TopicRow({
  topic,
  badge,
  onOpen,
  lang,
}: {
  topic: TopicSummary;
  badge: ReactNode;
  onOpen: () => void;
  lang: "en" | "hi";
}) {
  const { t } = useApp();
  const section = SECTION_MAP[topic.section];
  const subtopic = getSubtopic(topic.section, topic.subtopic);
  return (
    <button
      className="weak-item"
      style={{ width: "100%", background: "none", border: "none", textAlign: "left" }}
      onClick={onOpen}
    >
      <span className="topic-avatar" style={{ background: `${section.accent}18`, color: section.accent }}>
        {section.emoji}
      </span>
      <span className="grow">
        <span className="topic-name">{lang === "hi" ? subtopic?.hi : subtopic?.short}</span>
        <span className="topic-meta">
          {topic.accuracy}% · {topic.attempts} {t("attempts")} · {t("skill")} {topic.rating.toFixed(1)}
        </span>
      </span>
      {badge}
      <ChevronRight size={16} className="chev" />
    </button>
  );
}

function TopicTable({
  topics,
  lang,
  onOpen,
}: {
  topics: TopicSummary[];
  lang: "en" | "hi";
  onOpen: (section: TopicSummary["section"], subtopic: string) => void;
}) {
  const { t } = useApp();
  const active = topics
    .filter((topic) => topic.attempts > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);

  return (
    <table className="topic-table">
      <tbody>
        {active.map((topic) => {
          const subtopic = getSubtopic(topic.section, topic.subtopic);
          return (
            <tr key={`${topic.section}-${topic.subtopic}`} onClick={() => onOpen(topic.section, topic.subtopic)} style={{ cursor: "pointer" }}>
              <td className="t-name">
                {lang === "hi" ? subtopic?.hi : subtopic?.short}
                <div className="tiny faint">
                  {topic.attempts} {t("attempts")} · {t("skill")} {topic.rating.toFixed(1)}
                </div>
              </td>
              <td style={{ width: 90 }}>
                <Progress value={topic.accuracy} tone={topic.accuracy < 50 ? "danger" : undefined} />
              </td>
              <td className="t-acc">{topic.accuracy}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MockRow({ mock, lang }: { mock: MockResult; lang: "en" | "hi" }) {
  const { t } = useApp();
  const scope = !mock.scope || mock.scope === "All sections" ? t("allSectionsLabel") : mock.scope;
  return (
    <div className="mock-row">
      <div className="grow">
        <div className="small bold">
          {mock.correct} / {mock.total} · {mock.correct + mock.wrong} {t("attempted")}
        </div>
        <div className="tiny muted">
          {formatDate(mock.at, lang)} · {formatDuration(mock.timeUsedSec * 1000, lang)} · {scope}
        </div>
      </div>
      <span className="badge badge-blue">{mock.score} / {mock.maxScore}</span>
    </div>
  );
}
