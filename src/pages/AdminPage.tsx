import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  Database,
  LayoutDashboard,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { Question } from "../types";
import { SECTIONS } from "../data/taxonomy";
import { pct } from "../lib/utils";
import { useApp } from "../store/appContext";
import { PageHead } from "../components/Layout";
import { Segmented, StatCard } from "../components/ui";
import { QuestionBrowser } from "../components/admin/QuestionBrowser";
import { QuestionEditor } from "../components/admin/QuestionEditor";
import { ImportExportPanel } from "../components/admin/ImportExportPanel";

type AdminTab = "dashboard" | "questions" | "data" | "settings";
const UNLOCK_KEY = "cglgk.admin.unlocked";

function storedUnlock(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AdminPage() {
  const { t, user, questions, saveQuestion, setAdminPin, notify } = useApp();
  const [unlocked, setUnlocked] = useState(storedUnlock);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);

  const unlock = () => {
    if (pin.trim() === user.adminPin) {
      setUnlocked(true);
      setPin("");
      setPinError(false);
      try {
        sessionStorage.setItem(UNLOCK_KEY, "1");
      } catch {
        /* private mode */
      }
    } else {
      setPinError(true);
    }
  };

  const lock = () => {
    setUnlocked(false);
    setTab("dashboard");
    try {
      sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* private mode */
    }
  };

  const openEditor = (question: Question | null) => {
    setEditing(question);
    setEditorOpen(true);
  };

  const handleSaved = (question: Question) => {
    const exists = questions.some((entry) => entry.id === question.id);
    saveQuestion(question);
    notify(exists ? t("updateSuccess") : t("addSuccess"), "success");
    setEditorOpen(false);
    setEditing(null);
  };

  if (!unlocked) {
    return (
      <div className="page">
        <div className="pin-screen">
          <div className="pin-icon">
            <ShieldCheck size={30} />
          </div>
          <h1 className="page-title">{t("adminPanel")}</h1>
          <p className="page-sub">{t("pinRequired")}</p>
          <form
            className="mt-16"
            onSubmit={(event) => {
              event.preventDefault();
              unlock();
            }}
          >
            <input
              className="input"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setPinError(false);
              }}
              placeholder={t("adminPin")}
              aria-label={t("adminPin")}
            />
            {pinError && <p className="small mt-8" style={{ color: "var(--danger)" }}>{t("pinWrong")}</p>}
            <button className="btn btn-block mt-12" type="submit">
              <Lock size={16} /> {t("unlock")}
            </button>
          </form>
          <p className="tiny faint mt-12">{t("pinHint")}</p>
          <Link className="btn btn-ghost btn-sm mt-16" to="/">{t("backHome")}</Link>
        </div>
      </div>
    );
  }

  const verified = questions.filter((question) => question.verified).length;
  const adminAdded = questions.filter((question) => !question.seed).length;
  const topicsCovered = new Set(questions.map((question) => `${question.section}/${question.subtopic}`)).size;
  const totalTopics = SECTIONS.reduce((sum, section) => sum + section.subtopics.length, 0);
  const withImages = questions.filter((question) => question.image).length;

  return (
    <div className="page">
      <PageHead
        title={t("adminPanel")}
        sub={t("adminSub")}
        action={
          <Link className="btn btn-ghost btn-sm" to="/">
            {t("viewPublic")} <ChevronRight size={14} />
          </Link>
        }
      />

      <Segmented<AdminTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "dashboard", label: <><LayoutDashboard size={14} /> {t("dashboard")}</> },
          { value: "questions", label: <><Database size={14} /> {t("questionsTab")}</> },
          { value: "data", label: <><BarChart3 size={14} /> {t("data")}</> },
          { value: "settings", label: <><Settings size={14} /> {t("settings")}</> },
        ]}
      />

      <div className="mt-16">
        {tab === "dashboard" && (
          <>
            <div className="admin-stats">
              <div className="admin-stat">
                <b>{questions.length}</b>
                <span>{t("totalQuestions")}</span>
              </div>
              <div className="admin-stat">
                <b>{verified}</b>
                <span>{t("verifiedCount")}</span>
              </div>
              <div className="admin-stat">
                <b>{questions.length - verified}</b>
                <span>{t("unverifiedCount")}</span>
              </div>
              <div className="admin-stat">
                <b>{adminAdded}</b>
                <span>{t("customCount")}</span>
              </div>
            </div>

            <div className="card mt-12">
              <div className="card-title">{t("dataHealth")}</div>
              <div className="stat-grid mt-12">
                <StatCard label={t("topicsCovered")} value={`${topicsCovered} / ${totalTopics}`} />
                <StatCard label={t("verifiedPct")} value={`${pct(verified, questions.length)}%`} />
                <StatCard label={t("missingImages")} value={withImages} />
                <StatCard label={t("seedCount")} value={questions.filter((question) => question.seed).length} />
              </div>
            </div>

            <div className="warn-box mt-12">{t("sampleWarning")}</div>
            <div className="info-box mt-12">{t("adminNote")}</div>

            <div className="section-head">
              <h2>{t("quickActions")}</h2>
            </div>
            <div className="quick-grid">
              <button className="quick-card" onClick={() => openEditor(null)}>
                <span className="quick-icon"><Plus size={19} /></span>
                <b>{t("addQuestion")}</b>
                <span>{t("questionText")}</span>
              </button>
              <button className="quick-card" onClick={() => setTab("questions")}>
                <span className="quick-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                  <Database size={19} />
                </span>
                <b>{t("questionsTab")}</b>
                <span>{t("questionBankTitle")}</span>
              </button>
              <button className="quick-card" onClick={() => setTab("data")}>
                <span className="quick-icon" style={{ background: "var(--purple-soft)", color: "var(--purple)" }}>
                  <Upload size={19} />
                </span>
                <b>{t("importTab")}</b>
                <span>{t("bulkUpload")}</span>
              </button>
            </div>
          </>
        )}

        {tab === "questions" && <QuestionBrowser onEdit={openEditor} />}
        {tab === "data" && <ImportExportPanel />}
        {tab === "settings" && (
          <AdminSettings
            currentPin={user.adminPin}
            onSavePin={(value) => {
              setAdminPin(value);
              notify(t("pinSet"), "success");
            }}
            onLock={lock}
          />
        )}
      </div>

      <QuestionEditor
        open={editorOpen}
        question={editing}
        onClose={() => {
          setEditorOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

function AdminSettings({
  currentPin,
  onSavePin,
  onLock,
}: {
  currentPin: string;
  onSavePin: (pin: string) => void;
  onLock: () => void;
}) {
  const { t } = useApp();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");

  const save = () => {
    if (newPin.trim().length < 4) {
      setError("invalid");
      return;
    }
    if (newPin !== confirmPin) {
      setError("pinMismatch");
      return;
    }
    setError("");
    onSavePin(newPin.trim());
    setNewPin("");
    setConfirmPin("");
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">{t("changePin")}</div>
        <p className="small muted mt-8">{t("pinHint")}</p>
        <label className="field mt-12">
          <span>{t("newPin")}</span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(event) => {
              setNewPin(event.target.value);
              setError("");
            }}
          />
        </label>
        <label className="field mt-12">
          <span>{t("confirmPin")}</span>
          <input
            className="input"
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(event) => {
              setConfirmPin(event.target.value);
              setError("");
            }}
          />
        </label>
        {error && (
          <p className="small mt-8" style={{ color: "var(--danger)" }}>
            {t(error as "invalid" | "pinMismatch")}
          </p>
        )}
        <button className="btn btn-block mt-12" onClick={save}>{t("changePin")}</button>
        <p className="tiny faint mt-8">{t("adminNote")}</p>
      </div>

      <div className="card mt-12">
        <div className="card-title">{t("adminAccess")}</div>
        <p className="small muted mt-8">{t("pinHint")}</p>
        <p className="tiny faint mt-8">{t("adminPin")}: {currentPin.replace(/./g, "•")}</p>
        <button className="btn btn-danger-soft btn-block mt-12" onClick={onLock}>
          <Lock size={15} /> {t("logout")}
        </button>
      </div>

      <div className="info-box mt-12">{t("adminSaved")}</div>
    </div>
  );
}
