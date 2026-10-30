import { useRef, useState } from "react";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import type { CAFlag, Question, SectionId, Source } from "../../types";
import { SECTIONS, SECTION_MAP, DIFFICULTY_LABELS, DIFFICULTY_LABELS_HI } from "../../data/taxonomy";
import { QUESTION_LETTERS } from "../../lib/constants";
import { imageFileToDataUrl } from "../../lib/image";
import { uid } from "../../lib/utils";
import { useApp } from "../../store/appContext";
import { Modal } from "../ui";

interface QuestionForm {
  id?: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  tip: string;
  fact: string;
  section: SectionId;
  subtopic: string;
  difficulty: number;
  source: Source;
  verified: boolean;
  tags: string;
  image: string;
  pyqYear: string;
  pyqDate: string;
  pyqShift: string;
  caMonth: string;
  caYear: string;
  caCategory: CAFlag;
  caEventDate: string;
  hq: string;
  ho: string;
  he: string;
}

const SOURCES: { value: Source; key: "sourcePractice" | "sourcePyq" | "sourceCa" }[] = [
  { value: "Practice", key: "sourcePractice" },
  { value: "PYQ", key: "sourcePyq" },
  { value: "Current Affairs", key: "sourceCa" },
];

const CA_CATEGORIES: CAFlag[] = [
  "National",
  "International",
  "Sports",
  "Awards",
  "Science",
  "Economy",
  "Schemes",
];

function emptyForm(section: SectionId = "history"): QuestionForm {
  const first = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0];
  return {
    question: "",
    options: ["", "", "", ""],
    answer: 0,
    explanation: "",
    tip: "",
    fact: "",
    section: first.id,
    subtopic: first.subtopics[0].id,
    difficulty: 3,
    source: "Practice",
    verified: false,
    tags: "",
    image: "",
    pyqYear: String(new Date().getFullYear()),
    pyqDate: "",
    pyqShift: "Shift 1",
    caMonth: String(new Date().getMonth() + 1),
    caYear: String(new Date().getFullYear()),
    caCategory: "National",
    caEventDate: "",
    hq: "",
    ho: "",
    he: "",
  };
}

function formFromQuestion(question: Question): QuestionForm {
  return {
    id: question.id,
    question: question.question,
    options: [...question.options],
    answer: question.answer,
    explanation: question.explanation,
    tip: question.tip ?? "",
    fact: question.fact ?? "",
    section: question.section,
    subtopic: question.subtopic,
    difficulty: question.difficulty,
    source: question.source,
    verified: question.verified,
    tags: question.tags.join(", "),
    image: question.image ?? "",
    pyqYear: question.pyq ? String(question.pyq.year) : String(new Date().getFullYear()),
    pyqDate: question.pyq?.date ?? "",
    pyqShift: question.pyq?.shift ?? "Shift 1",
    caMonth: question.currentAffairs ? String(question.currentAffairs.month) : String(new Date().getMonth() + 1),
    caYear: question.currentAffairs ? String(question.currentAffairs.year) : String(new Date().getFullYear()),
    caCategory: question.currentAffairs?.category ?? "National",
    caEventDate: question.currentAffairs?.eventDate ?? "",
    hq: question.hindi?.question ?? "",
    ho: question.hindi?.options?.join(" | ") ?? "",
    he: question.hindi?.explanation ?? "",
  };
}

function buildQuestion(form: QuestionForm, existing: Question | null): Question {
  const question: Question = {
    id: existing?.id ?? form.id ?? uid("admin"),
    question: form.question.trim(),
    options: form.options.map((option) => option.trim()),
    answer: form.answer,
    explanation: form.explanation.trim(),
    section: form.section,
    subtopic: form.subtopic,
    difficulty: form.difficulty,
    source: form.source,
    verified: form.verified,
    tags: form.tags.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean),
    createdAt: existing?.createdAt ?? Date.now(),
    seed: existing?.seed ?? false,
  };
  if (form.tip.trim()) question.tip = form.tip.trim();
  if (form.fact.trim()) question.fact = form.fact.trim();
  if (form.image) question.image = form.image;
  if (form.source === "PYQ") {
    question.pyq = {
      year: Number(form.pyqYear),
      date: form.pyqDate,
      shift: form.pyqShift,
    };
  }
  if (form.source === "Current Affairs") {
    question.currentAffairs = {
      month: Number(form.caMonth),
      year: Number(form.caYear),
      category: form.caCategory,
      eventDate: form.caEventDate || undefined,
    };
  }
  if (form.hq.trim() || form.ho.trim() || form.he.trim()) {
    const hindiOptions = form.ho.split(/\s*[|,]\s*/).map((option) => option.trim()).filter(Boolean);
    question.hindi = {
      question: form.hq.trim() || undefined,
      options: hindiOptions.length ? hindiOptions : undefined,
      explanation: form.he.trim() || undefined,
    };
  }
  return question;
}

function validate(form: QuestionForm): string[] {
  const errors: string[] = [];
  if (!form.question.trim()) errors.push("invalidQuestion");
  if (form.options.some((option) => !option.trim())) errors.push("invalidOptions");
  if (!form.explanation.trim()) errors.push("invalidQuestion");
  if (form.answer < 0 || form.answer > 3) errors.push("invalidAnswer");
  if (form.difficulty < 1 || form.difficulty > 5) errors.push("invalidDifficulty");
  if (!SECTION_MAP[form.section]?.subtopics.some((topic) => topic.id === form.subtopic)) {
    errors.push("invalidSection");
  }
  if (form.source === "PYQ") {
    const year = Number(form.pyqYear);
    if (!Number.isFinite(year) || year < 1990 || year > 2100) errors.push("invalid");
  }
  if (form.source === "Current Affairs") {
    const month = Number(form.caMonth);
    const year = Number(form.caYear);
    if (month < 1 || month > 12 || !Number.isFinite(year) || year < 2000 || year > 2100) {
      errors.push("invalid");
    }
  }
  return Array.from(new Set(errors));
}

export function QuestionEditor(props: QuestionEditorProps) {
  if (!props.open) return null;
  return <QuestionEditorForm key={props.question?.id ?? "new"} {...props} />;
}

interface QuestionEditorProps {
  open: boolean;
  question: Question | null;
  defaultSection?: SectionId;
  onClose: () => void;
  onSaved: (question: Question) => void;
}

function QuestionEditorForm({
  question,
  defaultSection,
  onClose,
  onSaved,
}: Omit<QuestionEditorProps, "open">) {
  const { t, lang, user, notify } = useApp();
  const [form, setForm] = useState<QuestionForm>(() =>
    question ? formFromQuestion(question) : emptyForm(defaultSection),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const section = SECTIONS.find((entry) => entry.id === form.section) ?? SECTIONS[0];
  const topic = section.subtopics.find((entry) => entry.id === form.subtopic) ?? section.subtopics[0];

  const patch = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const changeSection = (value: SectionId) => {
    const next = SECTIONS.find((entry) => entry.id === value) ?? SECTIONS[0];
    setForm((prev) => ({ ...prev, section: next.id, subtopic: next.subtopics[0].id }));
  };

  const handleImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await imageFileToDataUrl(file);
      patch("image", url);
    } catch {
      notify(t("imageTooLarge"), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    const found = validate(form);
    if (found.length) {
      setErrors(found);
      return;
    }
    onSaved(buildQuestion(form, question));
  };

  return (
    <Modal
      open
      title={question ? t("editQuestion") : t("addQuestion")}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose}>{t("cancel")}</button>
          <button className="btn" onClick={save} disabled={uploading}>
            <Save size={16} /> {t("save")}
          </button>
        </>
      }
    >
      <div className="modal-editor">
        {errors.length > 0 && (
          <div className="warn-box mb-12">
            {errors.map((key) => (
              <div key={key}>{t(key as Parameters<typeof t>[0])}</div>
            ))}
          </div>
        )}

        <label className="field">
          <span>{t("questionText")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={form.question}
            onChange={(event) => patch("question", event.target.value)}
            placeholder={lang === "hi" ? "प्रश्न लिखें" : "Write the question"}
          />
        </label>

        <div className="form-grid mt-12">
          {form.options.map((option, index) => (
            <label className="field" key={index}>
              <span>{t("option")} {QUESTION_LETTERS[index]}</span>
              <input
                className="input"
                value={option}
                onChange={(event) => {
                  const options = [...form.options];
                  options[index] = event.target.value;
                  patch("options", options);
                }}
              />
            </label>
          ))}
        </div>

        <div className="form-grid mt-12">
          <label className="field">
            <span>{t("answerIndex")}</span>
            <select className="select" value={form.answer} onChange={(event) => patch("answer", Number(event.target.value))}>
              {QUESTION_LETTERS.map((letter, index) => (
                <option key={letter} value={index}>{letter}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("difficultyLabel")}</span>
            <select className="select" value={form.difficulty} onChange={(event) => patch("difficulty", Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level} · {(lang === "hi" ? DIFFICULTY_LABELS_HI : DIFFICULTY_LABELS)[level - 1]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field mt-12">
          <span>{t("explanationLabel")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={form.explanation}
            onChange={(event) => patch("explanation", event.target.value)}
          />
        </label>

        <div className="form-grid mt-12">
          <label className="field">
            <span>{t("memoryTip")}</span>
            <input className="input" value={form.tip} onChange={(event) => patch("tip", event.target.value)} />
          </label>
          <label className="field">
            <span>{t("factLabel")}</span>
            <input className="input" value={form.fact} onChange={(event) => patch("fact", event.target.value)} />
          </label>
        </div>

        <div className="form-grid mt-12">
          <label className="field">
            <span>{t("sectionLabel")}</span>
            <select className="select" value={form.section} onChange={(event) => changeSection(event.target.value as SectionId)}>
              {SECTIONS.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.emoji} {lang === "hi" ? entry.hi : entry.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("subtopicLabel")}</span>
            <select className="select" value={topic.id} onChange={(event) => patch("subtopic", event.target.value)}>
              {section.subtopics.map((entry) => (
                <option key={entry.id} value={entry.id}>{lang === "hi" ? entry.hi : entry.short}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-grid mt-12">
          <label className="field">
            <span>{t("sourceLabel")}</span>
            <select className="select" value={form.source} onChange={(event) => patch("source", event.target.value as Source)}>
              {SOURCES.map((source) => (
                <option key={source.value} value={source.value}>{t(source.key)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("tagsLabel")}</span>
            <input className="input" value={form.tags} onChange={(event) => patch("tags", event.target.value)} placeholder={t("tagPlaceholder")} />
          </label>
        </div>

        {form.source === "PYQ" && (
          <div className="form-section mt-16">
            <h3>{t("pyqDetails")}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{t("pyqYear")}</span>
                <input className="input" inputMode="numeric" value={form.pyqYear} onChange={(event) => patch("pyqYear", event.target.value)} />
              </label>
              <label className="field">
                <span>{t("pyqDate")}</span>
                <input className="input" type="date" value={form.pyqDate} onChange={(event) => patch("pyqDate", event.target.value)} />
              </label>
              <label className="field">
                <span>{t("pyqShift")}</span>
                <select className="select" value={form.pyqShift} onChange={(event) => patch("pyqShift", event.target.value)}>
                  {["Shift 1", "Shift 2", "Shift 3"].map((shift) => (
                    <option key={shift} value={shift}>{shift.replace("Shift", t("shift"))}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {form.source === "Current Affairs" && (
          <div className="form-section mt-16">
            <h3>{t("caDetails")}</h3>
            <div className="form-grid">
              <label className="field">
                <span>{t("caMonth")}</span>
                <select className="select" value={form.caMonth} onChange={(event) => patch("caMonth", event.target.value)}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <option key={index + 1} value={index + 1}>{index + 1}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("caYear")}</span>
                <input className="input" inputMode="numeric" value={form.caYear} onChange={(event) => patch("caYear", event.target.value)} />
              </label>
              <label className="field">
                <span>{t("caCategory")}</span>
                <select className="select" value={form.caCategory} onChange={(event) => patch("caCategory", event.target.value as CAFlag)}>
                  {CA_CATEGORIES.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("eventDate")}</span>
                <input className="input" type="date" value={form.caEventDate} onChange={(event) => patch("caEventDate", event.target.value)} />
              </label>
            </div>
          </div>
        )}

        <div className="form-section mt-16">
          <h3>{t("imageLabel")}</h3>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <ImagePlus size={15} /> {uploading ? t("loading") : t("uploadImage")}
            </button>
            {form.image && (
              <button className="btn btn-ghost btn-sm" onClick={() => patch("image", "")}>
                <Trash2 size={14} /> {t("removeImage")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => void handleImage(event.target.files?.[0])}
            />
          </div>
          {form.image && <img src={form.image} alt={t("questionImage")} className="question-image mt-12" />}
        </div>

        <details className="form-section mt-16">
          <summary className="small bold" style={{ cursor: "pointer" }}>
            {t("hindiVersion")}
          </summary>
          <div className="form-grid mt-12">
            <label className="field">
              <span>{t("hindiQuestion")}</span>
              <textarea className="textarea" rows={2} value={form.hq} onChange={(event) => patch("hq", event.target.value)} />
            </label>
            <label className="field">
              <span>{t("hindiOptions")}</span>
              <input className="input" value={form.ho} onChange={(event) => patch("ho", event.target.value)} />
            </label>
          </div>
          <label className="field mt-12">
            <span>{t("hindiExplanation")}</span>
            <textarea className="textarea" rows={2} value={form.he} onChange={(event) => patch("he", event.target.value)} />
          </label>
        </details>

        <label className="check mt-16">
          <input type="checkbox" checked={form.verified} onChange={(event) => patch("verified", event.target.checked)} />
          <span className="small">{t("verifiedCheck")}</span>
        </label>

        <div className="tiny faint mt-8">
          {t("tags")}: {user.customTags.slice(0, 12).join(", ") || "—"}
        </div>
      </div>
    </Modal>
  );
}
