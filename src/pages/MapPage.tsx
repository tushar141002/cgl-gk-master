import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, Map, Play } from "lucide-react";
import { useApp } from "../store/appContext";
import { saveSession } from "../lib/session";
import { PageHead } from "../components/Layout";
import { EmptyState } from "../components/ui";
import type { I18nKey } from "../lib/i18n";

const MAP_CATEGORIES: { id: string; label: I18nKey }[] = [
  { id: "river", label: "river" },
  { id: "mountain", label: "mountain" },
  { id: "park", label: "park" },
  { id: "state", label: "state" },
  { id: "country", label: "country" },
];

/** Seed map questions share one generic prompt per category, so translate it in the UI. */
const MAP_PROMPT_HI: Record<string, string> = {
  river: "मानचित्र पर कौन-सी नदी चिह्नित है?",
  mountain: "मानचित्र पर कौन-सी पर्वत श्रृंखला चिह्नित है?",
  park: "मानचित्र पर कौन-सा राष्ट्रीय उद्यान चिह्नित है?",
  state: "मानचित्र पर कौन-सा राज्य चिह्नित है?",
  country: "मानचित्र पर कौन-सा देश चिह्नित है?",
};

function mapPrompt(question: { question: string; tags: string[] }, lang: "en" | "hi"): string {
  if (lang !== "hi") return question.question;
  const tag = MAP_CATEGORIES.find((category) => question.tags.includes(category.id));
  return (tag && MAP_PROMPT_HI[tag.id]) || question.question;
}

export default function MapPage() {
  const { t, lang, questions, notify } = useApp();
  const navigate = useNavigate();

  const mapQuestions = useMemo(() => questions.filter((q) => Boolean(q.image)), [questions]);
  const groups = useMemo(
    () =>
      MAP_CATEGORIES.map((category) => {
        const items = mapQuestions.filter((q) => q.tags.includes(category.id));
        const seen = new Set<string>();
        const images = items.filter((q) => {
          if (seen.has(q.image ?? "")) return false;
          seen.add(q.image ?? "");
          return true;
        });
        return { ...category, items, images };
      }).filter((group) => group.items.length > 0),
    [mapQuestions],
  );

  const start = (ids: string[], title: string) => {
    if (!ids.length) {
      notify(t("mapEmpty"), "error");
      return;
    }
    saveSession({
      mode: "map",
      title,
      subtitle: t("mapSub2"),
      questionIds: ids,
      length: ids.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  return (
    <div className="page">
      <PageHead
        title={t("mapPractice")}
        sub={t("mapSub2")}
        action={
          <button className="icon-btn" onClick={() => navigate("/")} aria-label={t("backHome")}>
            <ArrowLeft size={19} />
          </button>
        }
      />

      <div className="card" style={{ background: "linear-gradient(135deg, var(--danger-soft), var(--card))" }}>
        <div className="row">
          <div className="quick-icon" style={{ background: "var(--danger)", color: "#fff" }}>
            <Map size={19} />
          </div>
          <div className="grow">
            <div className="card-title">{t("mapCategories")}</div>
            <div className="tiny muted mt-8">
              {t("mapCount", { n: mapQuestions.length })} · {groups.length} {t("category")}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => start(mapQuestions.map((q) => q.id), t("mapPractice"))}>
            <Play size={14} /> {t("start")}
          </button>
        </div>
        <div className="pill-row mt-12">
          {groups.map((group) => (
            <button
              key={group.id}
              className="pill"
              onClick={() => start(group.items.map((q) => q.id), `${t("mapPractice")} · ${t(group.label)}`)}
            >
              {t(group.label)} <span className="badge">{group.items.length}</span>
            </button>
          ))}
        </div>
        <p className="tiny muted mt-8">{t("mapHint")}</p>
      </div>

      {groups.length ? (
        groups.map((group) => (
          <div key={group.id}>
            <div className="section-head">
              <h2>{t(group.label)}</h2>
              <span className="small">
                {group.items.length} {t("questions")}
              </span>
            </div>
            <div className="map-grid">
              {group.images.map((question) => {
                const prompt = mapPrompt(question, lang);
                return (
                  <button
                    key={question.id}
                    className="map-card"
                    onClick={() => start([question.id], prompt)}
                  >
                    <div className="map-preview">
                      <img src={question.image} alt={prompt} loading="lazy" />
                    </div>
                    <div className="map-meta">
                      <b>{prompt}</b>
                      <span>
                        {t("difficulty")} {question.difficulty}/5 · {t("start")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <EmptyState icon={<Compass size={22} />} title={t("mapEmpty")} body={t("mapHint")} />
      )}

      <div className="info-box mt-16">
        <b>{t("sampleData")}:</b> {t("sampleNote")}
      </div>
    </div>
  );
}
