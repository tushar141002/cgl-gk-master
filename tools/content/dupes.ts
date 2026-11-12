import type { CsvTable } from './csv';
import { ContentError } from './master';

/**
 * Offline duplicate-fact candidates (D-083).
 *
 * `validateMaster` catches an exact duplicate English question. It cannot catch
 * the same fact asked in different words, which is the more common repeat. This
 * report compares token sets with Jaccard similarity inside one section and
 * prints the pairs above a threshold. It is advisory: a candidate is a reason
 * to look, not proof, and the reviewer decides whether to reject or rewrite it.
 */
export interface DuplicateOptions {
  /** Jaccard threshold in (0, 1]; default 0.55. */
  readonly threshold?: number;
  /** Show only pairs where at least one side is in this sub-topic. */
  readonly subtopic?: string;
  /** Rejected rows are hidden by default; they are no longer shipping. */
  readonly includeRejected?: boolean;
}

export interface DuplicateCandidate {
  readonly leftId: string;
  readonly rightId: string;
  readonly leftLine: number;
  readonly rightLine: number;
  readonly score: number;
  readonly answerScore: number;
  readonly sameAnswer: boolean;
  readonly leftStatus: string;
  readonly rightStatus: string;
  readonly leftSubtopic: string;
  readonly rightSubtopic: string;
  readonly leftQuestion: string;
  readonly rightQuestion: string;
}

const DEFAULT_THRESHOLD = 0.55;
const SAME_ANSWER_THRESHOLD = 0.8;

const STOP_WORDS = new Set(
  (
    'a an the of in on at to for from by with is are was were be been being which what who whom ' +
    'whose when where how why does do did can could may might must should would will shall not no ' +
    'only and or but as that this these those it its his her their there here into over under about ' +
    'after before during between among than then also very more most such other another any all ' +
    'each both one two three'
  ).split(' '),
);

interface CandidateRow {
  readonly line: number;
  readonly id: string;
  readonly section: string;
  readonly subtopic: string;
  readonly status: string;
  readonly question: string;
  readonly tokens: ReadonlySet<string>;
  readonly answer: ReadonlySet<string>;
}

export function findDuplicateCandidates(
  table: CsvTable,
  options: DuplicateOptions = {},
): DuplicateCandidate[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new ContentError(`--threshold must be greater than 0 and at most 1 (got "${threshold}")`);
  }

  const rows: CandidateRow[] = [];
  for (const row of table.rows) {
    const status = (row.values.status ?? '').trim().toLowerCase();
    if (!options.includeRejected && status === 'rejected') continue;
    if (options.subtopic !== undefined && row.values.subtopic !== options.subtopic) continue;

    const id = (row.values.id ?? '').trim();
    const question = (row.values.en_q ?? '').trim();
    if (id === '' || question === '') continue;

    const answer = (row.values.answer ?? '').trim().toLowerCase();
    const answerText = row.values[`en_option_${answer}`] ?? '';
    rows.push({
      line: row.line,
      id,
      section: (row.values.section ?? '').trim(),
      subtopic: (row.values.subtopic ?? '').trim(),
      status,
      question,
      tokens: tokenSet(`${question} ${row.values.en_explanation ?? ''}`),
      answer: tokenSet(answerText),
    });
  }

  if (rows.length === 0) {
    const scope = options.subtopic === undefined ? '' : ` for subtopic "${options.subtopic}"`;
    throw new ContentError(`no rows${scope}`);
  }

  const candidates: DuplicateCandidate[] = [];
  for (let leftIndex = 0; leftIndex < rows.length; leftIndex += 1) {
    const left = rows[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < rows.length; rightIndex += 1) {
      const right = rows[rightIndex]!;
      if (left.section !== right.section) continue;

      const score = jaccard(left.tokens, right.tokens);
      if (score < threshold) continue;
      const answerScore = jaccard(left.answer, right.answer);
      candidates.push({
        leftId: left.id,
        rightId: right.id,
        leftLine: left.line,
        rightLine: right.line,
        score,
        answerScore,
        sameAnswer: answerScore >= SAME_ANSWER_THRESHOLD,
        leftStatus: left.status,
        rightStatus: right.status,
        leftSubtopic: left.subtopic,
        rightSubtopic: right.subtopic,
        leftQuestion: left.question,
        rightQuestion: right.question,
      });
    }
  }

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.leftId.localeCompare(right.leftId) ||
      left.rightId.localeCompare(right.rightId),
  );
  return candidates;
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}
