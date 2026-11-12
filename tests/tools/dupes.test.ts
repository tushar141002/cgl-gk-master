import { describe, expect, it } from 'vitest';
import type { CsvRow } from '../../tools/content/csv';
import { findDuplicateCandidates } from '../../tools/content/dupes';
import { masterTable, statusRow } from './fixtures';

function rows(...entries: CsvRow[]) {
  return masterTable(entries);
}

describe('findDuplicateCandidates', () => {
  it('flags two questions that ask the same fact in similar words', () => {
    const table = rows(
      statusRow(
        'draft',
        {
          id: 'geography-rivers-0001',
          en_q: 'Which river flows through the Thar desert?',
          en_explanation: 'The Luni is the major river of the Thar desert.',
        },
        2,
      ),
      statusRow(
        'draft',
        {
          id: 'geography-rivers-0002',
          en_q: 'Which river flows through the Thar desert region?',
          en_explanation: 'The Luni drains the Thar desert.',
        },
        3,
      ),
    );

    const candidates = findDuplicateCandidates(table);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      leftId: 'geography-rivers-0001',
      rightId: 'geography-rivers-0002',
      sameAnswer: true,
    });
    expect(candidates[0]?.score).toBeGreaterThan(0.55);
  });

  it('ignores pairs in different sections', () => {
    const table = rows(
      statusRow('draft', { id: 'polity-fr-0001', section: 'polity' }, 2),
      statusRow('draft', { id: 'history-ancient-0001', section: 'history' }, 3),
    );

    expect(findDuplicateCandidates(table)).toEqual([]);
  });

  it('hides rejected rows unless asked for them', () => {
    const table = rows(
      statusRow('rejected', { id: 'geography-rivers-0001' }, 2),
      statusRow('draft', { id: 'geography-rivers-0002' }, 3),
    );

    expect(findDuplicateCandidates(table)).toEqual([]);
    expect(findDuplicateCandidates(table, { includeRejected: true })).toHaveLength(1);
  });

  it('keeps only pairs that touch the requested subtopic', () => {
    const table = rows(
      statusRow('draft', { id: 'geography-rivers-0001', subtopic: 'geography-rivers-lakes' }, 2),
      statusRow('draft', { id: 'geography-rivers-0002', subtopic: 'geography-rivers-lakes' }, 3),
      statusRow('draft', { id: 'geography-physical-0001', subtopic: 'geography-physical-india' }, 4),
    );

    expect(findDuplicateCandidates(table, { subtopic: 'geography-rivers-lakes' })).toHaveLength(1);
    expect(findDuplicateCandidates(table, { subtopic: 'geography-physical-india' })).toHaveLength(0);
  });

  it('rejects an out-of-range threshold and an empty selection', () => {
    const table = rows(statusRow('draft', {}, 2));

    expect(() => findDuplicateCandidates(table, { threshold: 0 })).toThrow(/--threshold/);
    expect(() => findDuplicateCandidates(table, { threshold: 1.5 })).toThrow(/--threshold/);
    expect(() => findDuplicateCandidates(table, { subtopic: 'geography-rivers-lakes' })).toThrow(/no rows/);
  });

  it('sorts the closest pair first', () => {
    const table = rows(
      statusRow('draft', { id: 'geography-rivers-0001' }, 2),
      statusRow('draft', { id: 'geography-rivers-0002' }, 3),
      statusRow('draft', { id: 'geography-rivers-0003' }, 4),
    );

    const scores = findDuplicateCandidates(table).map((candidate) => candidate.score);
    expect(scores).toEqual([...scores].sort((left, right) => right - left));
  });
});
