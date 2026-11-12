import { createHash } from 'node:crypto';

/**
 * A content fingerprint for a review row (D-080).
 *
 * A review sheet is a copy of the master, and a copy goes stale. Comparing a
 * handful of fields is not enough: an option or explanation edit would slip
 * through. Hash every field the reviewer actually saw instead. The sheet stores
 * the hash, and `promote` recomputes it from the sheet and from the master, so
 * an edited cell without a fresh export is refused.
 *
 * Values are normalised to LF so a CRLF/LF conversion of the file cannot change
 * the hash. Column names are part of the payload so reordering or adding a
 * content column is a deliberate schema change, not a silent match.
 */
export function contentHash(values: Readonly<Record<string, string>>, columns: readonly string[]): string {
  const payload = columns.map((column) => [column, normalize(values[column] ?? '')]);
  return createHash('sha256')
    .update(JSON.stringify({ version: 1, fields: payload }), 'utf8')
    .digest('hex');
}

function normalize(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}
