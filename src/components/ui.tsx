import type { ReactNode } from "react";
import { useEffect } from "react";
import { X } from "lucide-react";
import type { Question, SectionId } from "../types";
import { SECTION_MAP, DIFFICULTY_LABELS, DIFFICULTY_LABELS_HI } from "../data/taxonomy";
import { useApp } from "../store/appContext";
import { monthName } from "../lib/i18n";

export function Progress({ value, tone }: { value: number; tone?: "accent" | "danger" }) {
  const pctValue = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress${tone ? ` ${tone}` : ""}`} role="progressbar" aria-valuenow={Math.round(pctValue)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pctValue}%` }} />
    </div>
  );
}

export function DifficultyDots({ value }: { value: number }) {
  return (
    <span className="diff-dots" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`diff-dot${n <= value ? (value >= 4 ? " hard" : value === 3 ? " mid" : " on") : ""}`}
        />
      ))}
    </span>
  );
}

export function QuestionBadges({ question, compact = false }: { question: Question; compact?: boolean }) {
  const { t, lang } = useApp();
  const labels = lang === "hi" ? DIFFICULTY_LABELS_HI : DIFFICULTY_LABELS;
  const section = SECTION_MAP[question.section];
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {!compact && (
        <span className="badge" title={section?.name}>
          {section?.emoji} {lang === "hi" ? section?.hi : section?.short}
        </span>
      )}
      {question.source === "PYQ" && question.pyq && (
        <span className="badge badge-blue">
          PYQ {question.pyq.year}
          {question.pyq.shift ? ` · ${question.pyq.shift.replace("Shift", t("shift"))}` : ""}
        </span>
      )}
      {question.source === "Current Affairs" && question.currentAffairs && (
        <span className="badge badge-purple">
          {monthName(lang, question.currentAffairs.month, true)} {question.currentAffairs.year}
        </span>
      )}
      {question.source === "Practice" && <span className="badge">{t("sourcePractice")}</span>}
      <span className="badge">
        <DifficultyDots value={question.difficulty} /> {labels[question.difficulty - 1] ?? question.difficulty}
      </span>
      {question.verified ? (
        <span className="badge badge-verified">{t("verified")}</span>
      ) : (
        <span className="badge badge-sample">{t("sampleBadge")}</span>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
  actions,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row-between">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="mt-8">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function SectionPill({
  section,
  subtopic,
}: {
  section: SectionId;
  subtopic?: string;
}) {
  const { lang } = useApp();
  const data = SECTION_MAP[section];
  const topic = subtopic ? data?.subtopics.find((item) => item.id === subtopic) : undefined;
  return (
    <span className="badge">
      {data?.emoji} {lang === "hi" ? topic?.hi ?? data?.hi : topic?.short ?? data?.short}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
