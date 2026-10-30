import { useMemo, useState } from "react";
import { CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Question, Source } from "../../types";
import { SECTIONS } from "../../data/taxonomy";
import { useApp } from "../../store/appContext";
import { Modal, QuestionBadges } from "../ui";

type StatusFilter = "" | "verified" | "unverified";

export function QuestionBrowser({ onEdit }: { onEdit: (question: Question | null) => void }) {
  const { t, lang, questions, user, setVerified, deleteQuestion, notify } = useApp();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [source, setSource] = useState<Source | "">("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [limit, setLimit] = useState(20);
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return questions
      .filter((question) => {
        if (section && question.section !== section) return false;
        if (source && question.source !== source) return false;
        if (status === "verified" && !question.verified) return false;
        if (status === "unverified" && question.verified) return false;
        if (!query) return true;
        return (
          question.question.toLowerCase().includes(query) ||
          question.id.toLowerCase().includes(query) ||
          question.explanation.toLowerCase().includes(query) ||
          question.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }, [questions, search, section, source, status]);

  const visible = filtered.slice(0, limit);

  const verifyFiltered = () => {
    const ids = filtered.filter((question) => !question.verified).map((question) => question.id);
    if (!ids.length) {
      notify(t("allVerified"), "info");
      return;
    }
    setVerified(ids, true);
    notify(`${t("verifySuccess")} · ${ids.length}`, "success");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    deleteQuestion(pendingDelete.id);
    setPendingDelete(null);
    notify(t("deleteSuccess"), "success");
  };

  return (
    <div>
      <div className="row-between mb-12">
        <span className="small bold">
          {filtered.length} {t("ofTotal")} {questions.length}
        </span>
        <button className="btn btn-sm" onClick={() => onEdit(null)}>
          <Plus size={15} /> {t("addQuestion")}
        </button>
      </div>

      <div className="search-box">
        <Search size={16} />
        <input
          className="input"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setLimit(20);
          }}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
        />
      </div>

      <div className="form-grid mt-12">
        <label className="field">
          <span>{t("sectionLabel")}</span>
          <select className="select" value={section} onChange={(event) => setSection(event.target.value)}>
            <option value="">{t("allSections")}</option>
            {SECTIONS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.emoji} {lang === "hi" ? entry.hi : entry.short}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t("sourceLabel")}</span>
          <select className="select" value={source} onChange={(event) => setSource(event.target.value as Source | "")}>
            <option value="">{t("allSources")}</option>
            <option value="PYQ">{t("sourcePyq")}</option>
            <option value="Practice">{t("sourcePractice")}</option>
            <option value="Current Affairs">{t("sourceCa")}</option>
          </select>
        </label>
        <label className="field">
          <span>{t("verifiedFilter")}</span>
          <select className="select" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            <option value="">{t("any")}</option>
            <option value="verified">{t("yesVerified")}</option>
            <option value="unverified">{t("noVerified")}</option>
          </select>
        </label>
        <div className="field">
          <span>&nbsp;</span>
          <button className="btn btn-soft btn-sm" onClick={verifyFiltered} disabled={!filtered.length}>
            <CheckCircle2 size={15} /> {t("verifyAll")}
          </button>
        </div>
      </div>

      <div className="mt-12">
        {visible.length ? (
          visible.map((question) => {
            const override = user.overrides[question.id];
            return (
              <div className="admin-q" key={question.id}>
                <div className="q-text">{question.question}</div>
                <div className="q-meta">
                  <QuestionBadges question={question} />
                  {!question.seed && <span className="badge badge-blue">{t("adminBadge")}</span>}
                  {question.seed && override && <span className="badge badge-amber">{t("overriddenBadge")}</span>}
                </div>
                <div className="row-between mt-8">
                  <span className="tiny faint">{question.id}</span>
                  <div className="q-actions" style={{ marginTop: 0 }}>
                    <button className="icon-btn soft" onClick={() => onEdit(question)} aria-label={t("edit")} title={t("edit")}>
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn soft"
                      onClick={() => {
                        setVerified([question.id], !question.verified);
                        notify(question.verified ? t("unverified") : t("verified"), "success");
                      }}
                      aria-label={question.verified ? t("unverify") : t("verify")}
                      title={question.verified ? t("unverify") : t("verify")}
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button
                      className="icon-btn soft"
                      onClick={() => setPendingDelete(question)}
                      aria-label={t("delete")}
                      title={t("delete")}
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <p className="small muted center" style={{ padding: 20 }}>{t("noResults")}</p>
        )}
      </div>

      {filtered.length > visible.length && (
        <button className="btn btn-ghost btn-block mt-12" onClick={() => setLimit((value) => value + 20)}>
          {t("showMore")} · {filtered.length - visible.length}
        </button>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        title={t("delete")}
        onClose={() => setPendingDelete(null)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setPendingDelete(null)}>{t("cancel")}</button>
            <button className="btn btn-danger" onClick={confirmDelete}>{t("delete")}</button>
          </>
        }
      >
        <p className="small muted">{t("confirmDelete")}</p>
        {pendingDelete && <p className="small mt-8">{pendingDelete.question}</p>}
      </Modal>
    </div>
  );
}
