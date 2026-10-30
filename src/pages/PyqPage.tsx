import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, FileText, Play, Target } from "lucide-react";
import { useApp } from "../store/appContext";
import { pyqCoverage } from "../lib/adaptive";
import { saveSession } from "../lib/session";
import { PageHead } from "../components/Layout";
import { EmptyState, Progress } from "../components/ui";

interface Paper {
  year: number;
  date: string;
  shift: string;
  ids: string[];
}

function paperLabel(paper: Paper): string {
  return paper.date ? `${paper.date} ${paper.year}` : String(paper.year);
}

export default function PyqPage() {
  const { t, tList, user, questions, notify } = useApp();
  const navigate = useNavigate();
  const [year, setYear] = useState("all");
  const [date, setDate] = useState("all");
  const [shift, setShift] = useState("all");

  const pyqs = useMemo(() => questions.filter((q) => q.source === "PYQ" && q.pyq), [questions]);
  const years = useMemo(() => [...new Set(pyqs.map((q) => q.pyq!.year))].sort((a, b) => b - a), [pyqs]);
  const dates = useMemo(
    () =>
      [...new Set(pyqs.filter((q) => year === "all" || String(q.pyq!.year) === year).map((q) => q.pyq!.date))]
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a)),
    [pyqs, year],
  );
  const shifts = useMemo(
    () => [...new Set(pyqs.filter((q) => (year === "all" || String(q.pyq!.year) === year) && (date === "all" || q.pyq!.date === date)).map((q) => q.pyq!.shift))].sort(),
    [pyqs, year, date],
  );

  const filtered = pyqs.filter(
    (q) =>
      (year === "all" || String(q.pyq!.year) === year) &&
      (date === "all" || q.pyq!.date === date) &&
      (shift === "all" || q.pyq!.shift === shift),
  );

  const papers = useMemo(() => {
    const map = new Map<string, Paper>();
    for (const q of filtered) {
      const key = `${q.pyq!.year}|${q.pyq!.date}|${q.pyq!.shift}`;
      const paper = map.get(key) ?? { year: q.pyq!.year, date: q.pyq!.date, shift: q.pyq!.shift, ids: [] };
      paper.ids.push(q.id);
      map.set(key, paper);
    }
    return [...map.values()].sort(
      (a, b) => b.year - a.year || b.date.localeCompare(a.date) || a.shift.localeCompare(b.shift),
    );
  }, [filtered]);

  const coverage = pyqCoverage(questions, user);

  const start = (ids: string[], title: string) => {
    if (!ids.length) {
      notify(t("notEnough"), "error");
      return;
    }
    saveSession({
      mode: "pyq",
      title,
      subtitle: t("pyqSub2"),
      questionIds: ids,
      length: ids.length,
      instantFeedback: true,
    });
    navigate("/session");
  };

  return (
    <div className="page">
      <PageHead title={t("pyq")} sub={t("pyqSub")} />

      <div className="card" style={{ background: "linear-gradient(135deg, var(--info-soft), var(--card))" }}>
        <div className="row">
          <div className="quick-icon" style={{ background: "var(--info)", color: "#fff" }}>
            <Target size={19} />
          </div>
          <div className="grow">
            <div className="card-title">{t("pyqPapers")}</div>
            <div className="tiny muted mt-8">
              {pyqs.length} {t("questions")} · {years.length} {t("year")} · {papers.length} {t("paper")}
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => start(filtered.map((q) => q.id), t("pyqModeTitle"))}>
            <Play size={14} /> {t("start")}
          </button>
        </div>
      </div>

      <div className="card mt-12">
        <div className="field">
          <label>{t("year")}</label>
          <select className="select" value={year} onChange={(event) => { setYear(event.target.value); setDate("all"); setShift("all"); }}>
            <option value="all">{t("anyYear")}</option>
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row mt-12">
          <div className="field">
            <label>{t("date")}</label>
            <select className="select" value={date} onChange={(event) => { setDate(event.target.value); setShift("all"); }}>
              <option value="all">{t("anyDate")}</option>
              {dates.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("shift")}</label>
            <select className="select" value={shift} onChange={(event) => setShift(event.target.value)}>
              <option value="all">{t("anyShift")}</option>
              {shifts.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row-between mt-12">
          <span className="tiny faint">{t("availableQ", { n: filtered.length })}</span>
          <button
            className="card-link"
            onClick={() => {
              setYear("all");
              setDate("all");
              setShift("all");
            }}
          >
            {t("resetFilters")}
          </button>
        </div>
      </div>

      {coverage.length > 0 && (
        <div className="card mt-12">
          <div className="row-between mb-8">
            <span className="small bold">{t("coverage")}</span>
            <span className="tiny faint">{t("coverageSub")}</span>
          </div>
          {coverage.map((row) => (
            <div className="coverage-row" key={row.year}>
              <div className="row-between small">
                <span className="bold">{row.year}</span>
                <span className="faint">
                  {row.done}/{row.total}
                </span>
              </div>
              <div className="mt-8">
                <Progress value={row.percent} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>{t("pyqPapers")}</h2>
        <span className="small">{filtered.length} {t("available")}</span>
      </div>

      {papers.length ? (
        <div className="stack-sm">
          {papers.map((paper) => (
            <button
              key={`${paper.year}-${paper.date}-${paper.shift}`}
              className="card row"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() =>
                start(
                  paper.ids,
                  `${t("pyqModeTitle")} · ${paperLabel(paper)}`,
                )
              }
            >
              <span className="quick-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                <FileText size={18} />
              </span>
              <span className="grow">
                <span className="lr-title" style={{ display: "block" }}>
                  {paperLabel(paper)}
                </span>
                <span className="lr-sub">
                  {paper.shift} · {paper.ids.length} {t("questions")} · {paper.year}
                </span>
              </span>
              <span className="badge badge-blue">{t("attemptPaper")}</span>
              <ChevronRight size={16} className="chev" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays size={22} />}
          title={t("pyqEmpty")}
          body={t("notEnough")}
          action={
            <button
              className="btn btn-outline"
              onClick={() => {
                setYear("all");
                setDate("all");
                setShift("all");
              }}
            >
              {t("resetFilters")}
            </button>
          }
        />
      )}

      <div className="info-box mt-16">
        <b>{t("instructions")}:</b>
        <ul style={{ marginTop: 6, paddingLeft: 16, listStyle: "disc" }}>
          {tList("pyqInstructions").map((line) => (
            <li key={line} className="small">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
