import type { CAFlag, Question } from "../types";
import { addDays, startOfDay } from "./utils";

export interface CaEdition {
  year: number;
  month: number;
  questions: Question[];
  count: number;
  datedCount: number;
  latestEvent?: string;
}

export function caQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => q.source === "Current Affairs" && q.currentAffairs);
}

export function caEditions(questions: Question[]): CaEdition[] {
  const map = new Map<string, CaEdition>();
  for (const q of caQuestions(questions)) {
    const info = q.currentAffairs!;
    const key = `${info.year}-${info.month}`;
    const entry =
      map.get(key) ??
      { year: info.year, month: info.month, questions: [], count: 0, datedCount: 0 };
    entry.questions.push(q);
    entry.count = entry.questions.length;
    if (info.eventDate) {
      entry.datedCount++;
      if (!entry.latestEvent || info.eventDate > entry.latestEvent) entry.latestEvent = info.eventDate;
    }
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

export function latestEventDate(questions: Question[]): string | null {
  let latest: string | null = null;
  for (const q of caQuestions(questions)) {
    const date = q.currentAffairs?.eventDate;
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

export function weeklyCaQuestions(questions: Question[], days = 7): { items: Question[]; start: string | null; end: string | null } {
  const end = latestEventDate(questions);
  if (!end) return { items: [], start: null, end: null };
  const endTs = new Date(`${end}T00:00:00`).getTime();
  const startTs = startOfDay(addDays(endTs, -(days - 1)));
  const start = new Date(startTs);
  const startIso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(
    start.getDate(),
  ).padStart(2, "0")}`;
  const items = caQuestions(questions)
    .filter((q) => {
      const date = q.currentAffairs?.eventDate;
      return Boolean(date && date >= startIso && date <= end);
    })
    .sort((a, b) => (b.currentAffairs?.eventDate ?? "").localeCompare(a.currentAffairs?.eventDate ?? ""));
  return { items, start: startIso, end };
}

const CA_CATEGORY_HI: Record<CAFlag, string> = {
  National: "राष्ट्रीय",
  International: "अंतर्राष्ट्रीय",
  Sports: "खेल",
  Awards: "पुरस्कार",
  Science: "विज्ञान",
  Economy: "अर्थव्यवस्था",
  Schemes: "योजनाएँ",
};

export function caCategoryLabel(category: CAFlag | undefined, lang: "en" | "hi"): string {
  if (!category) return "";
  return lang === "hi" ? CA_CATEGORY_HI[category] : category;
}

export function caCategories(questions: Question[]): { category: CAFlag; count: number }[] {
  const map = new Map<CAFlag, number>();
  for (const q of caQuestions(questions)) {
    const category = q.currentAffairs?.category;
    if (category) map.set(category, (map.get(category) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export function latestCaYear(questions: Question[]): number | null {
  const editions = caEditions(questions);
  if (!editions.length) return null;
  return editions[0].year;
}
