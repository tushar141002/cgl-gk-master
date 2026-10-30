import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Download,
  Info,
  Languages,
  Monitor,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Smartphone,
  Upload,
} from "lucide-react";
import { useApp } from "../store/appContext";
import { exportUser, storageBytes } from "../lib/storage";
import { downloadFile, todayKey } from "../lib/utils";
import { PageHead } from "../components/Layout";
import { Modal, Segmented } from "../components/ui";
import type { UserSettings } from "../types";

export default function SettingsPage() {
  const { t, user, updateSettings, resetProgress, restore, notify } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const storage = storageBytes();
  const storageLabel = storage > 1024 * 1024
    ? `${(storage / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.max(1, Math.round(storage / 1024))} KB`;

  const handleExport = () => {
    downloadFile(`cglgk-progress-${todayKey()}.json`, exportUser(user));
    notify(t("exportSuccess"), "success");
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      restore(text);
      notify(t("restoreSuccess"), "success");
    } catch {
      notify(t("importError"), "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = () => {
    resetProgress();
    setConfirmReset(false);
    notify(t("resetDone"), "success");
  };

  return (
    <div className="page">
      <PageHead title={t("settings")} sub={t("dataNote")} />

      <div className="section-head">
        <h2>{t("appearance")}</h2>
      </div>
      <div className="card">
        <div className="field-label">{t("theme")}</div>
        <Segmented<UserSettings["theme"]>
          value={user.settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: "system", label: <><Monitor size={15} /> {t("system")}</> },
            { value: "light", label: <><Sun size={15} /> {t("light")}</> },
            { value: "dark", label: <><Moon size={15} /> {t("dark")}</> },
          ]}
        />
        <div className="divider" />
        <div className="field-label">{t("language")}</div>
        <Segmented<UserSettings["lang"]>
          value={user.settings.lang}
          onChange={(lang) => updateSettings({ lang })}
          options={[
            { value: "en", label: t("english") },
            { value: "hi", label: <><Languages size={15} /> {t("hindi")}</> },
          ]}
        />
        <div className="divider" />
        <label className="check row-between" style={{ cursor: "pointer" }}>
          <span className="row" style={{ gap: 9 }}>
            <Smartphone size={17} />
            <span>
              <span className="small bold">{t("haptics")}</span>
              <span className="tiny muted" style={{ display: "block" }}>{t("hapticsSub")}</span>
            </span>
          </span>
          <input
            type="checkbox"
            checked={user.settings.haptics}
            onChange={(event) => updateSettings({ haptics: event.target.checked })}
          />
        </label>
      </div>

      <div className="section-head">
        <h2>{t("data")}</h2>
        <span className="small">{storageLabel}</span>
      </div>
      <div className="card">
        <p className="small muted">{t("dataNote")}</p>
        <div className="btn-row mt-12">
          <button className="btn btn-soft" onClick={handleExport}>
            <Download size={16} /> {t("downloadData")}
          </button>
          <button className="btn btn-soft" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {t("importData")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => void handleImport(event.target.files?.[0])}
        />
        <div className="divider" />
        <div className="row-between">
          <span className="small bold" style={{ color: "var(--danger)" }}>{t("reset")}</span>
          <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> {t("reset")}
          </button>
        </div>
        <p className="tiny faint mt-8">{t("resetWarning")}</p>
      </div>

      <div className="section-head">
        <h2>{t("adminAccess")}</h2>
      </div>
      <Link to="/admin" className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <span className="quick-icon" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
          <ShieldCheck size={19} />
        </span>
        <span className="grow">
          <span className="lr-title">{t("admin")}</span>
          <span className="lr-sub">{t("adminSub")}</span>
        </span>
        <ChevronRight size={17} className="chev" />
      </Link>
      <p className="tiny faint" style={{ marginTop: -4 }}>{t("pinHint")}</p>

      <div className="section-head">
        <h2>{t("about")}</h2>
      </div>
      <div className="card">
        <div className="row" style={{ gap: 10 }}>
          <span className="quick-icon" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
            <Info size={18} />
          </span>
          <div className="grow">
            <div className="small bold">{t("appName")}</div>
            <div className="tiny muted">{t("version")} 1.0 · {t("offlineReady")}</div>
          </div>
        </div>
        <p className="small muted mt-12">{t("appInfo")}</p>
        <p className="tiny faint mt-8">{t("builtFor")}</p>
        <div className="divider" />
        <p className="tiny faint">{t("disclaimer")}</p>
      </div>

      <Modal
        open={confirmReset}
        title={t("reset")}
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>{t("cancel")}</button>
            <button className="btn btn-danger" onClick={handleReset}>{t("confirm")}</button>
          </>
        }
      >
        <p className="small muted">{t("resetConfirm")}</p>
        <p className="tiny faint mt-8">{t("resetWarning")}</p>
      </Modal>
    </div>
  );
}
