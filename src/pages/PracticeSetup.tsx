import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, ChevronDown, ChevronRight, Flame, Layers, Play, Zap } from "lucide-react";
import { SECTIONS, topicKey } from "../data/taxonomy";
import { filterPool, topicSummaries, weakTopics } from "../lib/adaptive";
import { saveSession } from "../lib/session";
import { shuffle } from "../lib/utils";
import { useApp } from "../store/appContext";
import { PageHead } from "../components/Layout";
import { SectionPill } from "../components/ui";

type SessionLength = 10 | 20 | 0;

export default function PracticeSetup() {
  const { t, lang, user, questions, notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [length, setLength] = useState<SessionLength>(10);
  const [expanded, setExpanded] = useState<string | null>(
    params.get("section") ?? SECTIONS[0].id,
  );

  const summaries = useMemo(() => topicSummaries(user), [user]);
  const summaryMap = useMemo(
    () => new Map(summaries.map((s) => [topicKey(s.section, s.subtopic), s])),
    [summaries],
  );
  const weak = weakTopics(user, 4);

  const start = (section?: (typeof SECTIONS)[number]["id"], subtopic?: string) => {
    const sectionData = section ? SECTIONS.find((s) => s.id === section) : undefined;
    const topicData = sectionData?.subtopics.find((s) => s.id === subtopic);
    const pool = filterPool(questions, { section, subtopic });
    if (!pool.length) {
      notify(t("notEnough"), "error");
      return;
    }
    saveSession({
      mode: "practice",
      title: topicData ? (lang === "hi" ? topicData.hi : topicData.short) : sectionData ? (lang === "hi" ? sectionData.hi : sectionData.name) : t("mixedTest"),
      subtitle: t("adaptiveSub"),
      section,
      subtopic,
      length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  const startWeakMix = () => {
    if (!weak.length) {
      notify(t("noWeak"), "info");
      return;
    }
    const picked = weak.flatMap((topic) =>
      shuffle(filterPool(questions, { section: topic.section, subtopic: topic.subtopic })).slice(0, 4),
    );
    saveSession({
      mode: "practice",
      title: t("weakPractice"),
      subtitle: t("adaptiveSub"),
      questionIds: shuffle(picked).slice(0, 12).map((q) => q.id),
      length: Math.min(12, picked.length),
      instantFeedback: true,
    });
    navigate("/session");
  };

  return (
    <div className="page">
      <PageHead title={t("practice")} sub={t("adaptiveSub")} />

      <div className="card">
        <div className="row-between">
          <div>
            <div className="card-title">{t("sessionLength")}</div>
            <div className="tiny muted mt-8">{t("statsNote")}</div>
          </div>
          <Zap size={20} style={{ color: "var(--accent)" }} />
        </div>
        <div className="pill-row mt-12">
          {([10, 20, 0] as SessionLength[]).map((value) => (
            <button
              key={value}
              className={`pill${length === value ? " active" : ""}`}
              onClick={() => setLength(value)}
            >
              {value === 10 ? t("tenQ") : value === 20 ? t("twentyQ") : t("endless")}
            </button>
          ))}
        </div>
        <button className="btn btn-block mt-12" onClick={() => start()}>
          <Play size={17} /> {t("startMixed")}
        </button>
        <p className="tiny muted center mt-8">{t("mixedDesc")}</p>
      </div>

      {weak.length > 0 && (
        <button className="quick-card mt-12" style={{ width: "100%", minHeight: 0 }} onClick={startWeakMix}>
          <div className="row">
            <span className="quick-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <Flame size={19} />
            </span>
            <div className="grow" style={{ textAlign: "left" }}>
              <div className="card-title">{t("weakPractice")}</div>
              <div className="tiny muted mt-8">
                {weak
                  .map((topic) => {
                    const section = SECTIONS.find((s) => s.id === topic.section);
                    const sub = section?.subtopics.find((s) => s.id === topic.subtopic);
                    return lang === "hi" ? sub?.hi : sub?.short;
                  })
                  .join(" · ")}
              </div>
            </div>
            <ArrowRight size={18} className="chev" />
          </div>
        </button>
      )}

      <div className="section-head">
        <h2>{t("chooseSection")}</h2>
        <span className="small">{t("topics")}</span>
      </div>

      <div className="stack-sm">
        {SECTIONS.map((section) => {
          const isOpen = expanded === section.id;
          const sectionQuestions = questions.filter((q) => q.section === section.id);
          const selectedSection = params.get("section") === section.id;
          return (
            <div key={section.id} className="section-block">
              <button
                className="section-block-head"
                onClick={() => setExpanded(isOpen ? null : section.id)}
                aria-expanded={isOpen}
              >
                <span className="section-emoji" style={{ background: `${section.accent}18`, color: section.accent }}>
                  {section.emoji}
                </span>
                <span className="grow">
                  <b>{lang === "hi" ? section.hi : section.name}</b>
                  <span>
                    {sectionQuestions.length} {t("questions")} · {section.subtopics.length} {t("subtopics")}
                  </span>
                </span>
                {selectedSection && <span className="badge badge-green">{t("recommended")}</span>}
                <ChevronDown
                  size={18}
                  className="chev"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
                />
              </button>
              {isOpen && (
                <div className="section-body">
                  <button
                    className="list-row"
                    onClick={() => start(section.id)}
                    style={{ width: "100%" }}
                  >
                    <span className="topic-avatar" style={{ background: `${section.accent}14`, color: section.accent }}>
                      <Layers size={17} />
                    </span>
                    <span className="grow">
                      <span className="lr-title">{t("allTopics")}</span>
                      <span className="lr-sub">{sectionQuestions.length} {t("questions")}</span>
                    </span>
                    <ChevronRight size={16} className="chev" />
                  </button>
                  {section.subtopics.map((topic) => {
                    const summary = summaryMap.get(topicKey(section.id, topic.id));
                    const topicQuestions = sectionQuestions.filter((q) => q.subtopic === topic.id);
                    const highlighted = params.get("subtopic") === topic.id;
                    return (
                      <button
                        key={topic.id}
                        className="subtopic-row"
                        style={{ width: "100%", background: highlighted ? "var(--primary-soft)" : "none", border: "none", borderBottom: "1px solid var(--border)", textAlign: "left" }}
                        onClick={() => start(section.id, topic.id)}
                      >
                        <span className="grow">
                          <span className="name" style={{ display: "block" }}>
                            {lang === "hi" ? topic.hi : topic.short}
                          </span>
                          <span className="tiny muted">
                            {topicQuestions.length} {t("questions")} · {t("rating")} {(summary?.rating ?? 3).toFixed(1)}
                          </span>
                        </span>
                        <span className="skill-dots">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span
                              key={n}
                              className={`skill-dot${n <= Math.round(summary?.rating ?? 3) ? " on" : ""}`}
                            />
                          ))}
                        </span>
                        <ChevronRight size={16} className="chev" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card mt-16">
        <div className="row-between">
          <SectionPill section="geography" subtopic="map-static" />
          <button className="card-link" onClick={() => navigate("/map")}>
            {t("mapPractice")} <ArrowRight size={14} />
          </button>
        </div>
        <div className="row-between mt-12">
          <span className="badge badge-blue">{t("pyq")}</span>
          <button className="card-link" onClick={() => navigate("/pyq")}>
            {t("pyqSub2")} <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
