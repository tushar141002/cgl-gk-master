import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../tools/content/csv';
import { validateMaster } from '../../tools/content/master';

const MASTER = join(process.cwd(), 'content', 'master', 'questions.csv');

/** Subtopics whose questions have been author-verified and packed. */
const VERIFIED_SUBTOPICS = [
  'geography-indian-geography',
  'history-ancient-india',
  'polity-fundamental-rights',
];

/** Subtopics drafted for founder verification; not packed until verified. */
const DRAFT_SUBTOPICS = [
  'geography-climate-soils-agriculture',
  'geography-physical-india',
  'geography-rivers-lakes',
  'history-art-culture',
  'history-medieval-india',
  'history-modern-india',
  'history-national-movement',
  'polity-constitution-basics',
  'polity-federalism-local',
  'polity-judiciary',
  'polity-parliament',
  'polity-union-executive',
];

/**
 * The shipped bank is data, so it gets the same guard as code: a broken row, a
 * reused id or a duplicated question fails the build before it reaches a pack.
 * The lower bounds keep the guard stable as drafts are progressively verified.
 */
describe('content/master/questions.csv', () => {
  it('validates cleanly and still carries the shipped and drafted batches', async () => {
    const table = parseCsv(await readFile(MASTER, 'utf8'));
    const report = validateMaster(table);

    expect(report.errors).toEqual([]);
    expect(report.counts.verified).toBeGreaterThanOrEqual(60);
    expect(report.counts.draft).toBeGreaterThanOrEqual(300);
    expect(report.questions).toHaveLength(report.counts.verified);
    expect(Object.keys(report.subtopics)).toEqual(
      expect.arrayContaining([...VERIFIED_SUBTOPICS, ...DRAFT_SUBTOPICS]),
    );

    for (const subtopic of VERIFIED_SUBTOPICS) {
      expect(report.subtopics[subtopic]?.verified).toBeGreaterThanOrEqual(20);
    }
    for (const subtopic of DRAFT_SUBTOPICS) {
      expect(report.subtopics[subtopic]?.draft).toBeGreaterThanOrEqual(25);
    }
  });
});
