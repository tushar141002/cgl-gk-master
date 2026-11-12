import type { CsvTable } from './csv';
import { ContentError, type RowStatus } from './master';

/**
 * Source-citation audit (D-082).
 *
 * Every approved row must carry a locator — an Article, section, chapter or
 * page — and a link that is not a portal front page. A front page cannot prove
 * a fact; it only proves the portal exists. This module is deliberately a
 * heuristic: it flags the obvious bare-domain links and leaves the judgement
 * of whether a deep link really supports the fact to the reviewer.
 */
export type SourceStatus = RowStatus | 'all';

export const SOURCE_ISSUE_KINDS = [
  'missing source_ref',
  'missing source_url',
  'source_url must start with https://',
  'source_url is a front page',
] as const;

export type SourceIssueKind = (typeof SOURCE_ISSUE_KINDS)[number];

export interface SourceIssue {
  readonly line: number;
  readonly id: string;
  readonly section: string;
  readonly subtopic: string;
  readonly status: string;
  readonly sourceUrl: string;
  readonly sourceRef: string;
  readonly issues: readonly SourceIssueKind[];
}

export interface SourceAudit {
  /** Rows with at least one issue, in file order. */
  readonly rows: readonly SourceIssue[];
  /** Per-issue counts; every known issue is present, zero when absent. */
  readonly counts: Readonly<Record<SourceIssueKind, number>>;
  /** Rows selected by the status/subtopic filters. */
  readonly scanned: number;
}

export interface SourceAuditOptions {
  /** Default `all`, because drafts need source work too. */
  readonly status?: SourceStatus;
  readonly subtopic?: string;
}

const STATUSES: readonly SourceStatus[] = ['draft', 'verified', 'rejected', 'all'];

export function auditSources(table: CsvTable, options: SourceAuditOptions = {}): SourceAudit {
  const status = options.status ?? 'all';
  if (!STATUSES.includes(status)) {
    throw new ContentError(`--status must be draft, verified, rejected or all (got "${status}")`);
  }

  const counts: Record<SourceIssueKind, number> = {
    'missing source_ref': 0,
    'missing source_url': 0,
    'source_url must start with https://': 0,
    'source_url is a front page': 0,
  };
  const rows: SourceIssue[] = [];
  let scanned = 0;

  for (const row of table.rows) {
    const rowStatus = (row.values.status ?? '').trim().toLowerCase();
    if (status !== 'all' && rowStatus !== status) continue;
    if (options.subtopic !== undefined && row.values.subtopic !== options.subtopic) continue;
    scanned += 1;

    const sourceRef = (row.values.source_ref ?? '').trim();
    const sourceUrl = (row.values.source_url ?? '').trim();
    const issues: SourceIssueKind[] = [];

    if (sourceRef === '') issues.push('missing source_ref');
    if (sourceUrl === '') {
      issues.push('missing source_url');
    } else if (!/^https:\/\/\S+$/.test(sourceUrl)) {
      issues.push('source_url must start with https://');
    } else if (isFrontPageUrl(sourceUrl)) {
      issues.push('source_url is a front page');
    }

    if (issues.length === 0) continue;
    for (const issue of issues) counts[issue] += 1;
    rows.push({
      line: row.line,
      id: (row.values.id ?? '').trim(),
      section: (row.values.section ?? '').trim(),
      subtopic: (row.values.subtopic ?? '').trim(),
      status: rowStatus,
      sourceUrl,
      sourceRef,
      issues,
    });
  }

  if (scanned === 0) {
    const scope = options.subtopic === undefined ? '' : ` for subtopic "${options.subtopic}"`;
    throw new ContentError(`no ${status === 'all' ? '' : `${status} `}rows${scope}`);
  }

  return { rows, counts, scanned };
}

/**
 * True for a link that lands on a portal's front page rather than a document.
 *
 * A query string or fragment is treated as evidence of a specific page, so
 * `/?p=123` is not flagged. A path with more than a home/index segment is not
 * flagged either. This is intentionally conservative: a missed front page costs
 * a reviewer's attention, a false positive asks them to justify a real link.
 */
export function isFrontPageUrl(raw: string): boolean {
  const value = raw.trim();
  if (value === '') return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;

  const hasQuery = url.search !== '' || url.hash !== '';
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '') return !hasQuery;
  if (hasQuery) return false;

  const lower = path.toLowerCase();
  if (/\/(index|default|home)(\.(html?|php|aspx?))?$/.test(lower)) return true;
  return lower === '/en' || lower === '/hi' || lower === '/english' || lower === '/hindi';
}
