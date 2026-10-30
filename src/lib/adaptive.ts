import type { Question, SectionId, UserData } from "../types";
import { SECTION_MAP, SECTIONS, topicKey } from "../data/taxonomy";
import { clamp, hashString, seededShuffle, startOfDay, todayKey, daysBetween } from "./utils";

export const FAST_ANSWER_MS = 18_000;
export const START_RATING = 3;

export const RATING_DELTA = {
  correctFast: 0.34,
  correctSlow: 0.16,
  wrong: -0.3,
  challengeBonus: 0.08,
};

export interface RatingChange {
  delta: number;
  next: number;
  fast: boolean;
}

export function ratingFor(
  user: Pick<UserData, "stats">,
  section: SectionId,
  subtopic: string,
): number {
  return user.stats[topicKey(section, subtopic)]?.rating ?? START_RATING;
}

export function ratingChange(
  current: number,
  correct: boolean,
  timeMs: number,
  difficulty: number,
): RatingChange {
  const fast = timeMs <= FAST_ANSWER_MS;
  let delta = 0;
  if (correct) {
    delta = fast ? RATING_DELTA.correctFast : RATING_DELTA.correctSlow;
    if (difficulty >= Math.round(current) + 1) delta += RATING_DELTA.challengeBonus;
  } else {
    delta = RATING_DELTA.wrong;
  }
  return { delta, next: clamp(current + delta, 1, 5), fast };
}

export interface PickOptions {
  pool: Question[];
  user: Pick<UserData, "stats">;
  section?: SectionId;
  subtopic?: string;
  excludeIds?: string[];
  challenge?: boolean;
  recovery?: boolean;
}

/**
 * Weighted adaptive pick: questions close to the learner's rating win,
 * unseen questions get a nudge, and a little randomness keeps it fresh.
 */
export function pickAdaptive({
  pool,
  user,
  section,
  subtopic,
  excludeIds = [],
  challenge = false,
  recovery = false,
}: PickOptions): Question | null {
  if (!pool.length) return null;
  const baseRating = section && subtopic ? ratingFor(user, section, subtopic) : overallRating(user);
  let target = baseRating;
  if (challenge) target = 5;
  if (recovery) target = Math.max(1, baseRating - 1.15);

  let candidates = pool;
  const excluded = new Set(excludeIds);
  const unseen = pool.filter((q) => !excluded.has(q.id));
  if (unseen.length) candidates = unseen;
  if (challenge) {
    const five = candidates.filter((q) => q.difficulty >= 5);
    if (five.length) candidates = five;
  }
  if (recovery) {
    const easier = candidates.filter((q) => q.difficulty <= Math.max(2, Math.round(target)));
    if (easier.length) candidates = easier;
  }

  let best: Question | null = null;
  let bestScore = -Infinity;
  for (const q of candidates) {
    const distance = Math.abs(q.difficulty - target);
    const fresh = 1 / (1 + q.difficulty) * 0.08;
    const score = -distance * 1.35 + fresh + Math.random() * 0.32;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }
  return best;
}

export function overallRating(user: Pick<UserData, "stats">): number {
  const values = Object.values(user.stats);
  if (!values.length) return START_RATING;
  return values.reduce((sum, s) => sum + s.rating, 0) / values.length;
}

export function filterPool(
  questions: Question[],
  opts: { section?: SectionId; subtopic?: string; tag?: string; difficulty?: number; source?: string },
): Question[] {
  return questions.filter((q) => {
    if (opts.section && q.section !== opts.section) return false;
    if (opts.subtopic && q.subtopic !== opts.subtopic) return false;
    if (opts.tag && !q.tags.includes(opts.tag)) return false;
    if (opts.difficulty && q.difficulty !== opts.difficulty) return false;
    if (opts.source && q.source !== opts.source) return false;
    return true;
  });
}

/** Build a mock test with broad section coverage and a balanced difficulty mix. */
export function buildMock(questions: Question[], count: number, sections?: SectionId[]): Question[] {
  const activeSections = sections?.length ? sections : SECTIONS.map((s) => s.id);
  const pool = questions.filter((q) => activeSections.includes(q.section));
  if (!pool.length) return [];
  const n = Math.min(count, pool.length);

  const bySection = new Map<SectionId, Question[]>();
  for (const s of activeSections) {
    bySection.set(
      s,
      seededShuffle(
        pool.filter((q) => q.section === s),
        hashString(`mock-${s}-${n}-${Date.now() % 100000}`),
      ),
    );
  }

  const targetDifficulty = [2, 3, 2, 3, 4, 3, 1, 3, 4, 2, 3, 5, 2, 3, 4, 1, 3, 2, 4, 3, 2, 5, 3, 2, 4];
  const selected: Question[] = [];
  const used = new Set<string>();
  let sectionIdx = 0;

  for (let slot = 0; slot < n; slot++) {
    const desired = targetDifficulty[slot % targetDifficulty.length];
    let chosen: Question | undefined;
    // Try each section in rotation so every section is represented.
    for (let attempt = 0; attempt < activeSections.length * 2 && !chosen; attempt++) {
      const sectionId = activeSections[sectionIdx % activeSections.length];
      sectionIdx++;
      const list = bySection.get(sectionId) ?? [];
      const candidate = list.find((q) => !used.has(q.id) && q.difficulty === desired);
      chosen = candidate ?? list.find((q) => !used.has(q.id));
    }
    if (!chosen) {
      chosen = pool.find((q) => !used.has(q.id));
    }
    if (chosen) {
      used.add(chosen.id);
      selected.push(chosen);
    }
  }
  return seededShuffle(selected, hashString(`mock-order-${Date.now()}`));
}

/** Daily quiz: same 10 questions for everyone on a given day (until the bank changes). */
export function buildDaily(questions: Question[], day = todayKey(), count = 10): Question[] {
  if (!questions.length) return [];
  const seed = hashString(`cglgk-daily-${day}`);
  const shuffled = seededShuffle(questions, seed);
  const picked: Question[] = [];
  const topicSeen = new Set<string>();
  const sectionSeen = new Map<SectionId, number>();

  // First pass: broad coverage and at least two current-affairs questions.
  const ca = shuffled.filter((q) => q.source === "Current Affairs");
  for (const q of ca.slice(0, Math.min(2, Math.max(1, Math.floor(count / 5))))) {
    picked.push(q);
    topicSeen.add(topicKey(q.section, q.subtopic));
    sectionSeen.set(q.section, (sectionSeen.get(q.section) ?? 0) + 1);
  }

  for (const q of shuffled) {
    if (picked.length >= count) break;
    if (picked.some((p) => p.id === q.id)) continue;
    const key = topicKey(q.section, q.subtopic);
    const sectionCount = sectionSeen.get(q.section) ?? 0;
    if (topicSeen.has(key) || sectionCount >= 2) continue;
    if (q.difficulty === 5 && picked.length < count - 1) continue;
    picked.push(q);
    topicSeen.add(key);
    sectionSeen.set(q.section, sectionCount + 1);
  }

  // Second pass: fill remaining slots without coverage constraints.
  for (const q of shuffled) {
    if (picked.length >= count) break;
    if (!picked.some((p) => p.id === q.id)) picked.push(q);
  }
  return seededShuffle(picked, seed + 7);
}

export interface TopicSummary {
  section: SectionId;
  subtopic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  rating: number;
  avgMs: number;
  lastAt: number;
}

export function topicSummaries(
  user: Pick<UserData, "attempts" | "stats">,
): TopicSummary[] {
  const map = new Map<string, TopicSummary>();
  for (const section of SECTIONS) {
    for (const t of section.subtopics) {
      const key = topicKey(section.id, t.id);
      const stat = user.stats[key];
      map.set(key, {
        section: section.id,
        subtopic: t.id,
        attempts: stat?.attempts ?? 0,
        correct: stat?.correct ?? 0,
        accuracy: stat && stat.attempts ? Math.round((stat.correct / stat.attempts) * 100) : 0,
        rating: stat?.rating ?? START_RATING,
        avgMs: stat && stat.attempts ? stat.timeMs / stat.attempts : 0,
        lastAt: stat?.lastAt ?? 0,
      });
    }
  }
  return [...map.values()];
}

export function weakTopics(user: Pick<UserData, "attempts" | "stats">, limit = 4): TopicSummary[] {
  return topicSummaries(user)
    .filter((t) => t.attempts >= 4)
    .sort((a, b) => a.accuracy - b.accuracy || a.rating - b.rating)
    .filter((t) => t.accuracy < 65 || t.rating < 2.9)
    .slice(0, limit);
}

export function strongTopics(user: Pick<UserData, "attempts" | "stats">, limit = 3): TopicSummary[] {
  return topicSummaries(user)
    .filter((t) => t.attempts >= 4)
    .sort((a, b) => b.accuracy - a.accuracy || b.rating - a.rating)
    .slice(0, limit);
}

export function sectionAccuracy(user: Pick<UserData, "attempts">): Record<SectionId, { correct: number; total: number; accuracy: number }> {
  const out = {} as Record<SectionId, { correct: number; total: number; accuracy: number }>;
  for (const s of SECTIONS) out[s.id] = { correct: 0, total: 0, accuracy: 0 };
  for (const a of user.attempts) {
    const entry = out[a.section];
    if (!entry) continue;
    entry.total++;
    if (a.correct) entry.correct++;
  }
  for (const s of SECTIONS) {
    out[s.id].accuracy = out[s.id].total ? Math.round((out[s.id].correct / out[s.id].total) * 100) : 0;
  }
  return out;
}

export function pyqCoverage(questions: Question[], user: Pick<UserData, "attempts">) {
  const totals = new Map<number, number>();
  for (const q of questions) {
    if (q.source === "PYQ" && q.pyq) totals.set(q.pyq.year, (totals.get(q.pyq.year) ?? 0) + 1);
  }
  const attempted = new Map<number, Set<string>>();
  const yearById = new Map(questions.filter((q) => q.pyq).map((q) => [q.id, q.pyq!.year]));
  for (const a of user.attempts) {
    const year = yearById.get(a.questionId);
    if (!year) continue;
    if (!attempted.has(year)) attempted.set(year, new Set());
    attempted.get(year)!.add(a.questionId);
  }
  return [...totals.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, total]) => {
      const done = attempted.get(year)?.size ?? 0;
      return { year, total, done, percent: total ? Math.round((done / total) * 100) : 0 };
    });
}

export function dailyStreakAfterCompletion(user: UserData, day = todayKey()): { count: number; best: number; lastDay: string } {
  const last = user.streak.lastDay;
  if (last === day) return { count: Math.max(1, user.streak.count), best: user.streak.best, lastDay: day };
  const yesterday = todayKey(new Date(Date.now() - 86_400_000));
  const count = last === yesterday ? user.streak.count + 1 : 1;
  return { count, best: Math.max(count, user.streak.best), lastDay: day };
}

export function studyStreak(user: Pick<UserData, "activity">): number {
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = todayKey(d);
    if ((user.activity[key] ?? 0) > 0) streak++;
    else if (i === 0) continue;
    else break;
  }
  return streak;
}

export function nextRevisionStage(stage: 0 | 1 | 2, correct: boolean): { stage: 0 | 1 | 2 | 3; days: number } {
  if (!correct) return { stage: 0, days: 1 };
  if (stage === 0) return { stage: 1, days: 3 };
  if (stage === 1) return { stage: 2, days: 7 };
  return { stage: 3, days: 0 };
}

export function startOfToday(): number {
  return startOfDay();
}

export function daysSince(ts: number): number {
  return daysBetween(ts, Date.now());
}

export function sectionLabel(id: SectionId): string {
  return SECTION_MAP[id]?.name ?? id;
}
