import type { CAFlag, Question, SectionId, Source } from "../types";
import { SECTION_MAP, SECTIONS, getSubtopic } from "../data/taxonomy";
import { parseCsv, toCsv, uid } from "./utils";

export interface QuestionParseResult {
  questions: Question[];
  errors: string[];
}

const CA_CATEGORIES: CAFlag[] = [
  "National",
  "International",
  "Sports",
  "Awards",
  "Science",
  "Economy",
  "Schemes",
];

const SOURCE_ALIASES: Record<string, Source> = {
  pyq: "PYQ",
  y: "PYQ",
  "previous year": "PYQ",
  "previous year question": "PYQ",
  practice: "Practice",
  p: "Practice",
  ca: "Current Affairs",
  c: "Current Affairs",
  "current affairs": "Current Affairs",
  "current affair": "Current Affairs",
};

const SECTION_ALIASES = new Map<string, SectionId>();
for (const section of SECTIONS) {
  for (const value of [section.id, section.name, section.short, section.hi]) {
    SECTION_ALIASES.set(normalizeKey(value), section.id);
  }
}

export const CSV_HEADERS = [
  "id",
  "question",
  "option1",
  "option2",
  "option3",
  "option4",
  "answer",
  "explanation",
  "section",
  "subtopic",
  "difficulty",
  "source",
  "year",
  "date",
  "shift",
  "month",
  "ca_year",
  "category",
  "event_date",
  "fact",
  "tip",
  "tags",
  "image",
  "verified",
  "hq",
  "ho",
  "he",
] as const;

export function questionsToCsv(questions: Question[]): string {
  const rows = questions.map((q) => ({
    id: q.id,
    question: q.question,
    option1: q.options[0] ?? "",
    option2: q.options[1] ?? "",
    option3: q.options[2] ?? "",
    option4: q.options[3] ?? "",
    answer: q.answer + 1,
    explanation: q.explanation,
    section: q.section,
    subtopic: q.subtopic,
    difficulty: q.difficulty,
    source: q.source,
    year: q.pyq?.year ?? "",
    date: q.pyq?.date ?? "",
    shift: q.pyq?.shift ?? "",
    month: q.currentAffairs?.month ?? "",
    ca_year: q.currentAffairs?.year ?? "",
    category: q.currentAffairs?.category ?? "",
    event_date: q.currentAffairs?.eventDate ?? "",
    fact: q.fact ?? "",
    tip: q.tip ?? "",
    tags: q.tags.join("; "),
    image: q.image ?? "",
    verified: q.verified ? "true" : "false",
    hq: q.hindi?.question ?? "",
    ho: q.hindi?.options?.join(" | ") ?? "",
    he: q.hindi?.explanation ?? "",
  }));
  return toCsv(rows, [...CSV_HEADERS]);
}

export function csvTemplate(): string {
  const sample: Question = {
    id: "admin-example-01",
    question: "Which river is known as the Sorrow of Bihar?",
    options: ["Ganga", "Kosi", "Son", "Gandak"],
    answer: 1,
    explanation: "The Kosi river frequently changes course and floods north Bihar.",
    section: "geography",
    subtopic: "physical-features",
    difficulty: 2,
    source: "Practice",
    verified: false,
    tags: ["rivers"],
    createdAt: Date.now(),
    seed: false,
  };
  return questionsToCsv([sample]);
}

export function questionsToJson(questions: Question[]): string {
  return JSON.stringify(questions, null, 2);
}

export function parseQuestionFile(text: string): QuestionParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { questions: [], errors: ["The file is empty."] };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonQuestions(trimmed);
  }
  return parseCsvQuestions(text);
}

function parseJsonQuestions(text: string): QuestionParseResult {
  try {
    const parsed = JSON.parse(text) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.questions)
        ? parsed.questions
        : null;
    if (!rows) return { questions: [], errors: ["Expected a JSON array of questions."] };
    return normalizeRows(rows.map((row) => (isRecord(row) ? row : {})), false);
  } catch {
    return { questions: [], errors: ["Could not parse the JSON file."] };
  }
}

function parseCsvQuestions(text: string): QuestionParseResult {
  const rows = parseCsv(text);
  if (!rows.length) return { questions: [], errors: ["No data rows found in the CSV."] };
  return normalizeRows(rows, true);
}

function normalizeRows(rows: Record<string, unknown>[], oneBasedAnswer: boolean): QuestionParseResult {
  const questions: Question[] = [];
  const errors: string[] = [];
  rows.forEach((row, index) => {
    const result = normalizeQuestion(row, index, oneBasedAnswer);
    if (result.question) questions.push(result.question);
    else errors.push(result.error ?? `Question ${index + 1} is invalid.`);
  });
  return { questions, errors };
}

function normalizeQuestion(
  raw: Record<string, unknown>,
  index: number,
  oneBasedAnswer: boolean,
): { question?: Question; error?: string } {
  const label = `Question ${index + 1}`;
  const question = getText(raw, ["question", "text"]);
  const explanation = getText(raw, ["explanation", "solution"]);
  if (!question) return { error: `${label}: question text is required.` };
  if (!explanation) return { error: `${label}: explanation is required.` };

  const options = getOptions(raw);
  if (options.length !== 4 || options.some((option) => !option)) {
    return { error: `${label}: exactly four non-empty options are required.` };
  }

  const answer = getAnswer(raw, oneBasedAnswer);
  if (answer === null) return { error: `${label}: answer must point to option 1–4.` };

  const section = getSection(raw);
  if (!section) return { error: `${label}: section is not recognised.` };

  const subtopic = getSubtopicValue(section, raw);
  if (!subtopic) return { error: `${label}: sub-topic is not recognised for ${section}.` };

  const source = getSource(raw) ?? "Practice";
  const difficulty = clampDifficulty(getNumber(raw, ["difficulty"]));

  const result: Question = {
    id: getText(raw, ["id"]) || uid("admin"),
    question,
    options,
    answer,
    explanation,
    section,
    subtopic,
    difficulty,
    source,
    verified: getBoolean(raw, ["verified"]),
    tags: getTags(raw),
    createdAt: getNumber(raw, ["createdAt", "created_at"]) ?? Date.now(),
    seed: false,
  };

  const tip = getText(raw, ["tip", "memory_tip", "memoryTip"]);
  if (tip) result.tip = tip;
  const fact = getText(raw, ["fact", "one_liner", "oneLiner"]);
  if (fact) result.fact = fact;
  const image = getText(raw, ["image"]);
  if (image) result.image = image;

  const hindiQuestion = getText(raw, ["hq", "hindi_question"]);
  const hindiOptions = getText(raw, ["ho", "hindi_options"]);
  const hindiExplanation = getText(raw, ["he", "hindi_explanation"]);
  const hindiObject = isRecord(raw.hindi) ? raw.hindi : undefined;
  if (hindiQuestion || hindiOptions || hindiExplanation || hindiObject) {
    const parsedOptions = hindiOptions
      ? hindiOptions.split(/\s*[|,]\s*/).filter(Boolean)
      : undefined;
    result.hindi = {
      question: hindiQuestion || (typeof hindiObject?.question === "string" ? hindiObject.question : undefined),
      options: parsedOptions ?? (Array.isArray(hindiObject?.options) ? (hindiObject.options as string[]) : undefined),
      explanation:
        hindiExplanation ||
        (typeof hindiObject?.explanation === "string" ? hindiObject.explanation : undefined),
    };
  }

  if (source === "PYQ") {
    const year = getNumber(raw, ["year", "pyq_year"]);
    if (year) {
      result.pyq = {
        year,
        date: getText(raw, ["date", "pyq_date"]),
        shift: getText(raw, ["shift", "pyq_shift"]) || "Shift 1",
      };
    }
  }

  if (source === "Current Affairs") {
    const month = getMonth(raw);
    const year = getNumber(raw, ["ca_year", "year"]);
    if (!month || !year) return { error: `${label}: current affairs needs a month and year.` };
    result.currentAffairs = {
      month,
      year,
      category: getCategory(raw),
      eventDate: getText(raw, ["event_date", "eventDate"]) || undefined,
    };
  }

  return { question: result };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getText(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function getNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getBoolean(raw: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && ["true", "1", "yes", "y", "verified"].includes(value.trim().toLowerCase())) {
      return true;
    }
  }
  return false;
}

function getOptions(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.options) && raw.options.length === 4) {
    return raw.options.map((option) => (typeof option === "string" ? option.trim() : ""));
  }
  return ["option1", "option2", "option3", "option4"].map((key) => getText(raw, [key, key.replace("option", "o")]));
}

function getAnswer(raw: Record<string, unknown>, oneBased: boolean): number | null {
  const value = raw.answer ?? raw.answerIndex ?? raw.correct;
  if (typeof value === "string") {
    const letter = value.trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(letter)) return letter.charCodeAt(0) - 65;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  const index = oneBased ? parsed - 1 : parsed;
  return index >= 0 && index <= 3 ? index : null;
}

function getSection(raw: Record<string, unknown>): SectionId | null {
  const value = getText(raw, ["section", "s"]);
  if (!value) return null;
  const direct = SECTION_ALIASES.get(normalizeKey(value));
  if (direct) return direct;
  return SECTION_MAP[value as SectionId]?.id ?? null;
}

function getSubtopicValue(section: SectionId, raw: Record<string, unknown>): string | null {
  const value = getText(raw, ["subtopic", "sub_topic", "topic", "t"]);
  if (!value) return null;
  const key = normalizeKey(value);
  const topic = SECTION_MAP[section].subtopics.find((item) =>
    [item.id, item.name, item.short, item.hi].some((candidate) => normalizeKey(candidate) === key),
  );
  if (topic) return topic.id;
  const global = SECTIONS.flatMap((entry) =>
    entry.subtopics.map((item) => ({ section: entry.id, topic: item })),
  ).find((entry) =>
    [entry.topic.id, entry.topic.name, entry.topic.short, entry.topic.hi].some(
      (candidate) => normalizeKey(candidate) === key,
    ),
  );
  return global?.topic.id ?? null;
}

function getSource(raw: Record<string, unknown>): Source | null {
  const value = getText(raw, ["source"]);
  if (!value) return null;
  return SOURCE_ALIASES[normalizeKey(value)] ?? null;
}

function getTags(raw: Record<string, unknown>): string[] {
  if (Array.isArray(raw.tags)) {
    return raw.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
  }
  const value = getText(raw, ["tags"]);
  return value ? value.split(/[,;|]/).map((tag) => tag.trim()).filter(Boolean) : [];
}

function getMonth(raw: Record<string, unknown>): number | null {
  const numeric = getNumber(raw, ["month", "ca_month"]);
  if (numeric && numeric >= 1 && numeric <= 12) return Math.round(numeric);
  const value = getText(raw, ["month", "ca_month"]);
  if (!value) return null;
  const names = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const index = names.findIndex((name) => name.startsWith(value.toLowerCase().slice(0, 3)));
  return index >= 0 ? index + 1 : null;
}

function getCategory(raw: Record<string, unknown>): CAFlag {
  const value = normalizeKey(getText(raw, ["category", "ca_category"]));
  const found = CA_CATEGORIES.find((category) => normalizeKey(category) === value);
  return found ?? "National";
}

function clampDifficulty(value: number | null): number {
  if (!value || value < 1) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function isKnownSubtopic(section: SectionId, subtopic: string): boolean {
  return Boolean(getSubtopic(section, subtopic));
}
