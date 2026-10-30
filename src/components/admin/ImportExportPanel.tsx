import { useRef, useState } from "react";
import { Download, FileText, Upload } from "lucide-react";
import type { Question } from "../../types";
import type { QuestionParseResult } from "../../lib/questionIo";
import {
  csvTemplate,
  parseQuestionFile,
  questionsToCsv,
  questionsToJson,
} from "../../lib/questionIo";
import { downloadFile } from "../../lib/utils";
import { useApp } from "../../store/appContext";
import { SectionPill } from "../ui";

export function ImportExportPanel() {
  const { t, questions, importQuestions, notify } = useApp();
  const [verifiedImport, setVerifiedImport] = useState(false);
  const [parsed, setParsed] = useState<QuestionParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      notify(t("noFile"), "error");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      setParsed(parseQuestionFile(text));
    } catch {
      setParsed({ questions: [], errors: [t("parseError")] });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmImport = () => {
    if (!parsed?.questions.length) {
      notify(t("importNothing"), "error");
      return;
    }
    importQuestions(parsed.questions, verifiedImport);
    notify(`${t("imported")} ${parsed.questions.length} ${t("questions")}`, "success");
    setParsed(null);
    setFileName("");
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">{t("export")}</div>
        <p className="small muted mt-8">{t("dataExportNote")}</p>
        <div className="btn-row mt-12">
          <button
            className="btn btn-soft"
            onClick={() => downloadFile("cglgk-questions.json", questionsToJson(questions))}
          >
            <Download size={16} /> {t("exportJson")}
          </button>
          <button
            className="btn btn-soft"
            onClick={() => downloadFile("cglgk-questions.csv", questionsToCsv(questions), "text/csv")}
          >
            <Download size={16} /> {t("exportCsv")}
          </button>
        </div>
        <button
          className="btn btn-ghost btn-sm mt-12"
          onClick={() => {
            downloadFile("cglgk-template.csv", csvTemplate(), "text/csv");
            notify(t("csvDownloaded"), "success");
          }}
        >
          <FileText size={15} /> {t("downloadTemplate")}
        </button>
        <p className="tiny faint mt-8">{t("csvHelp")}</p>
      </div>

      <div className="card mt-12">
        <div className="card-title">{t("importJsonCsv")}</div>
        <p className="small muted mt-8">{t("importHelp")}</p>
        <div className="btn-row mt-12">
          <button className="btn btn-soft" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {t("importJsonCsv")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          hidden
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <label className="check mt-12">
          <input
            type="checkbox"
            checked={verifiedImport}
            onChange={(event) => setVerifiedImport(event.target.checked)}
          />
          <span className="small">{t("importVerified")}</span>
        </label>

        {parsed && (
          <div className="mt-16">
            <div className="row-between">
              <span className="small bold">
                {fileName || t("importPreview")} · {parsed.questions.length} {t("questions")}
              </span>
              <span className={`badge ${parsed.errors.length ? "badge-amber" : "badge-green"}`}>
                {parsed.errors.length} {t("errors")}
              </span>
            </div>

            {parsed.questions.length > 0 && (
              <div className="stack-sm mt-12">
                {parsed.questions.slice(0, 4).map((question) => (
                  <PreviewRow key={question.id} question={question} />
                ))}
                {parsed.questions.length > 4 && (
                  <span className="tiny faint">+{parsed.questions.length - 4} {t("questions")}</span>
                )}
              </div>
            )}

            {parsed.errors.length > 0 && (
              <div className="import-preview mt-12">
                {parsed.errors.slice(0, 8).map((error) => (
                  <div key={error}>{error}</div>
                ))}
                {parsed.errors.length > 8 && <div>… +{parsed.errors.length - 8}</div>}
              </div>
            )}

            <button
              className="btn btn-block mt-12"
              onClick={confirmImport}
              disabled={!parsed.questions.length}
            >
              {t("confirmImport", { n: parsed.questions.length })}
            </button>
          </div>
        )}
      </div>

      <div className="warn-box mt-16">{t("publishNote")}</div>
    </div>
  );
}

function PreviewRow({ question }: { question: Question }) {
  return (
    <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
      <SectionPill section={question.section} subtopic={question.subtopic} />
      <span className="small grow muted" style={{ lineHeight: 1.35 }}>
        {question.question}
      </span>
    </div>
  );
}
