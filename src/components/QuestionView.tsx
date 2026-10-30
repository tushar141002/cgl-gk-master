import { Bookmark, Check, Lightbulb, X } from "lucide-react";
import type { Question } from "../types";
import { QUESTION_LETTERS } from "../lib/constants";
import { useApp } from "../store/appContext";
import { QuestionBadges } from "./ui";

export function QuestionCard({
  question,
  index,
  total,
  selected,
  revealed,
  onSelect,
  showBookmark = true,
  recovery = false,
}: {
  question: Question;
  index?: number;
  total?: number;
  selected: number | null;
  revealed: boolean;
  onSelect?: (choice: number) => void;
  showBookmark?: boolean;
  recovery?: boolean;
}) {
  const { t, user, toggleBookmark, notify, lang } = useApp();
  const hindi = lang === "hi" ? question.hindi : undefined;
  const questionText = hindi?.question ?? question.question;
  const options = hindi?.options && hindi.options.length === 4 ? hindi.options : question.options;
  const bookmarked = user.bookmarks.includes(question.id);
  const fallback = lang === "hi" && !hindi?.question;

  return (
    <article className="question-card">
      <div className="row-between" style={{ alignItems: "flex-start" }}>
        <div className="grow">
          <QuestionBadges question={question} />
        </div>
        {showBookmark && (
          <button
            className={`icon-btn${bookmarked ? " soft" : ""}`}
            aria-label={bookmarked ? t("removeBookmark") : t("bookmark")}
            title={bookmarked ? t("removeBookmark") : t("bookmark")}
            onClick={() => {
              toggleBookmark(question.id);
              notify(bookmarked ? t("removeBookmark") : t("bookmarkSaved"), "success");
            }}
            style={bookmarked ? { color: "var(--accent)" } : undefined}
          >
            <Bookmark size={18} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {typeof index === "number" && (
        <div className="row-between mt-12">
          <span className="tiny bold faint">{t("questionNo", { n: index })}</span>
          {typeof total === "number" && total > 0 && (
            <span className="tiny faint">
              {index} {t("of")} {total}
            </span>
          )}
        </div>
      )}

      {fallback && <div className="info-box mt-8 tiny">{t("languageFallback")}</div>}

      {question.image && (
        <img className="question-image mt-12" src={question.image} alt={t("questionImage")} loading="lazy" />
      )}

      <h2 className="question-text">{questionText}</h2>

      <div className="options">
        {options.map((option, choice) => {
          const isCorrect = revealed && choice === question.answer;
          const isWrong = revealed && choice === selected && choice !== question.answer;
          const isSelected = !revealed && choice === selected;
          const dim = revealed && !isCorrect && !isWrong;
          return (
            <button
              key={choice}
              className={`option${isCorrect ? " correct" : ""}${isWrong ? " wrong" : ""}${
                isSelected ? " selected" : ""
              }${dim ? " dim" : ""}`}
              disabled={revealed || !onSelect}
              onClick={() => onSelect?.(choice)}
              aria-pressed={selected === choice}
            >
              <span className="letter">{QUESTION_LETTERS[choice]}</span>
              <span className="grow">{option}</span>
              {isCorrect && <Check size={17} style={{ color: "var(--success)", marginTop: 3 }} />}
              {isWrong && <X size={17} style={{ color: "var(--danger)", marginTop: 3 }} />}
            </button>
          );
        })}
      </div>

      {revealed && (
        <AnswerFeedback
          question={question}
          selected={selected}
          recovery={recovery}
          explanation={hindi?.explanation ?? question.explanation}
          fallback={lang === "hi" && !hindi?.explanation}
        />
      )}
    </article>
  );
}

export function AnswerFeedback({
  question,
  selected,
  recovery = false,
  explanation,
  fallback = false,
}: {
  question: Question;
  selected: number | null;
  recovery?: boolean;
  explanation?: string;
  fallback?: boolean;
}) {
  const { t } = useApp();
  const correct = selected === question.answer;
  const tip = question.tip ?? question.fact;
  return (
    <div className={`feedback ${correct ? "good" : "bad"}`}>
      <div className="feedback-head">
        {correct ? <Check size={17} /> : <X size={17} />}
        {correct ? t("correct") : t("wrongAnswer")}
      </div>
      {!correct && selected !== null && (
        <p className="small">
          <b>{t("yourAnswer")}:</b> {question.options[selected]}
          <br />
          <b>{t("correctAnswer")}:</b> {question.options[question.answer]}
        </p>
      )}
      <p>{explanation ?? question.explanation}</p>
      {fallback && <p className="tiny faint">{t("explanationUnavailable")}</p>}
      {tip && (
        <div className="tip">
          <b>
            <Lightbulb size={12} style={{ display: "inline", verticalAlign: -1 }} /> {t("memoryTip")}:
          </b>{" "}
          {tip}
        </div>
      )}
      {recovery && <p className="tiny bold mt-8">{t("explanationTip")}</p>}
    </div>
  );
}
