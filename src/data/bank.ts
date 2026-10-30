import type { CAFlag, Question, SectionId, Source } from "../types";
import { ALL_SUBTOPICS, SECTION_MAP } from "./taxonomy";

/**
 * Compact seed format. One entry per sub-topic keeps the JSON easy to extend:
 * [question, [4 options], answerIndex, explanation, difficulty, source, meta?]
 * source: Y = PYQ, P = Practice, C = Current Affairs
 */
export type SeedQuestion = [
  string,
  string[],
  number,
  string,
  number,
  "Y" | "P" | "C",
  SeedMeta?,
];

export interface SeedMeta {
  year?: number;
  date?: string;
  shift?: string;
  month?: number;
  caYear?: number;
  category?: CAFlag;
  eventDate?: string;
  image?: string;
  fact?: string;
  tip?: string;
  tags?: string[];
  hq?: string;
  ho?: string[];
  he?: string;
}

export interface SeedGroup {
  s: SectionId;
  t: string;
  q: SeedQuestion[];
}

type SeedModule = { default: SeedGroup[] };

const modules = import.meta.glob<SeedModule>("./seed/*.json", { eager: true });

const SOURCE_MAP: Record<"Y" | "P" | "C", Source> = {
  Y: "PYQ",
  P: "Practice",
  C: "Current Affairs",
};

export function expandSeed(): Question[] {
  const out: Question[] = [];
  // Several seed files can extend the same sub-topic, so keep ids unique.
  const usedIds = new Set<string>();
  for (const mod of Object.values(modules)) {
    const raw = Array.isArray(mod) ? mod : (mod as SeedModule | undefined)?.default;
    if (!Array.isArray(raw)) continue;
    const groups = raw as unknown as SeedGroup[];
    for (const group of groups) {
      const section = group.s;
      if (!SECTION_MAP[section]) continue;
      const topic = group.t;
      group.q.forEach((row, i) => {
        const [question, options, answer, explanation, difficulty, code, meta = {}] = row;
        if (!question || !Array.isArray(options) || options.length !== 4) return;
        const source = SOURCE_MAP[code] ?? "Practice";
        let id = `${section}-${topic}-${String(i + 1).padStart(2, "0")}`;
        if (usedIds.has(id)) {
          let suffix = 2;
          while (usedIds.has(`${id}-${suffix}`)) suffix++;
          id = `${id}-${suffix}`;
        }
        usedIds.add(id);
        const q: Question = {
          id,
          question,
          options,
          answer,
          explanation,
          section,
          subtopic: topic,
          difficulty,
          source,
          verified: false,
          tags: meta.tags ?? [],
          seed: true,
          createdAt: 1700000000000,
        };
        if (source === "PYQ" && meta.year) {
          q.pyq = { year: meta.year, date: meta.date ?? "", shift: meta.shift ?? "Shift 1" };
        }
        if (source === "Current Affairs" && meta.month && meta.caYear && meta.category) {
          q.currentAffairs = {
            month: meta.month,
            year: meta.caYear,
            category: meta.category,
            eventDate: meta.eventDate,
          };
        }
        if (meta.image) q.image = meta.image;
        if (meta.fact) q.fact = meta.fact;
        if (meta.tip) q.tip = meta.tip;
        if (meta.hq || meta.ho || meta.he) {
          q.hindi = { question: meta.hq, options: meta.ho, explanation: meta.he };
        }
        out.push(q);
      });
    }
  }
  return out;
}

export const SEED_QUESTIONS = expandSeed();

export function mergeBank(
  seeds: Question[],
  overrides: Record<string, Question | null>,
): Question[] {
  const seen = new Set<string>();
  const out: Question[] = [];
  for (const q of seeds) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    const override = overrides[q.id];
    if (override === null) continue;
    out.push(override ? { ...override, seed: true } : q);
  }
  for (const [id, q] of Object.entries(overrides)) {
    if (q && !seen.has(id)) out.push({ ...q, seed: false });
  }
  return out;
}

export function seedCountByTopic(): Record<string, number> {
  const map: Record<string, number> = {};
  for (const q of SEED_QUESTIONS) {
    const key = `${q.section}/${q.subtopic}`;
    map[key] = (map[key] ?? 0) + 1;
  }
  return map;
}

export function missingSeedTopics(): string[] {
  return ALL_SUBTOPICS.filter((t) => {
    const count = SEED_QUESTIONS.filter(
      (q) => q.section === t.section && q.subtopic === t.id,
    ).length;
    return count < 15;
  }).map((t) => `${t.section}/${t.id}`);
}
