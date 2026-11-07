import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../tools/content/csv';
import { validateMaster } from '../../tools/content/master';

const MASTER = join(process.cwd(), 'content', 'master', 'questions.csv');

/**
 * The shipped bank is data, so it gets the same guard as code: a broken row, a
 * reused id or a duplicated question fails the build before it reaches a pack.
 */
describe('content/master/questions.csv', () => {
  it('validates cleanly and still carries the first shipped batch', async () => {
    const table = parseCsv(await readFile(MASTER, 'utf8'));
    const report = validateMaster(table);

    expect(report.errors).toEqual([]);
    expect(report.counts.verified).toBeGreaterThanOrEqual(60);
    expect(report.questions).toHaveLength(report.counts.verified);
    expect(Object.keys(report.subtopics).sort()).toEqual([
      'geography-indian-geography',
      'history-ancient-india',
      'polity-fundamental-rights',
    ]);
  });
});
