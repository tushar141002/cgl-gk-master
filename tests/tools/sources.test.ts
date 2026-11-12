import { describe, expect, it } from 'vitest';
import { auditSources, isFrontPageUrl, SOURCE_ISSUE_KINDS } from '../../tools/content/sources';
import { masterTable, statusRow } from './fixtures';

describe('auditSources', () => {
  it('reports a complete row as clean', () => {
    const audit = auditSources(masterTable([statusRow('draft', {}, 2)]));

    expect(audit.scanned).toBe(1);
    expect(audit.rows).toEqual([]);
    expect(audit.counts).toEqual({
      'missing source_ref': 0,
      'missing source_url': 0,
      'source_url must start with https://': 0,
      'source_url is a front page': 0,
    });
  });

  it('flags a missing ref and a missing URL, with per-issue counts', () => {
    const audit = auditSources(
      masterTable([
        statusRow('draft', { id: 'polity-fr-0001', source_ref: '' }, 2),
        statusRow('draft', { id: 'polity-fr-0002', source_url: '' }, 3),
      ]),
    );

    expect(audit.rows).toHaveLength(2);
    expect(audit.counts['missing source_ref']).toBe(1);
    expect(audit.counts['missing source_url']).toBe(1);
    expect(audit.rows[0]?.issues).toEqual(['missing source_ref']);
    expect(audit.rows[1]?.issues).toEqual(['missing source_url']);
  });

  it('flags a non-https URL and a portal front page', () => {
    const audit = auditSources(
      masterTable([
        statusRow('draft', { id: 'polity-fr-0001', source_url: 'http://example.com/a' }, 2),
        statusRow('draft', { id: 'polity-fr-0002', source_url: 'https://www.ssc.gov.in/' }, 3),
      ]),
    );

    expect(audit.rows.map((row) => row.issues)).toEqual([
      ['source_url must start with https://'],
      ['source_url is a front page'],
    ]);
  });

  it('filters by status and subtopic', () => {
    const table = masterTable([
      statusRow('verified', { id: 'polity-fr-0001', source_ref: '' }, 2),
      statusRow('draft', { id: 'polity-const-0001', subtopic: 'polity-constitution-basics' }, 3),
    ]);

    expect(auditSources(table, { status: 'draft' }).rows).toEqual([]);
    expect(auditSources(table, { status: 'verified' }).rows).toHaveLength(1);
    expect(auditSources(table, { subtopic: 'polity-constitution-basics' }).rows).toHaveLength(0);
  });

  it('rejects an unknown status and an empty selection', () => {
    const table = masterTable([statusRow('draft', {}, 2)]);

    expect(() => auditSources(table, { status: 'published' as never })).toThrow(/--status/);
    expect(() => auditSources(table, { subtopic: 'geography-rivers-lakes' })).toThrow(/no rows/);
  });

  it('keeps the issue list stable for callers', () => {
    expect(SOURCE_ISSUE_KINDS).toHaveLength(4);
  });
});

describe('isFrontPageUrl', () => {
  it('flags a bare domain, a slash path and a language landing page', () => {
    expect(isFrontPageUrl('https://www.ssc.gov.in')).toBe(true);
    expect(isFrontPageUrl('https://www.ssc.gov.in/')).toBe(true);
    expect(isFrontPageUrl('https://legislative.gov.in/en')).toBe(true);
    expect(isFrontPageUrl('https://example.com/index.php')).toBe(true);
  });

  it('accepts a deep document link, a query-string page and a file', () => {
    expect(isFrontPageUrl('https://legislative.gov.in/constitution-of-india/')).toBe(false);
    expect(isFrontPageUrl('https://www.indiacode.nic.in/handle/123456789/1362')).toBe(false);
    expect(isFrontPageUrl('https://example.com/?p=123')).toBe(false);
    expect(isFrontPageUrl('https://example.com/pdfs/report.pdf')).toBe(false);
  });

  it('does not flag an empty or non-URL value', () => {
    expect(isFrontPageUrl('')).toBe(false);
    expect(isFrontPageUrl('not a url')).toBe(false);
    expect(isFrontPageUrl('ftp://example.com/')).toBe(false);
  });
});
