/**
 * A small RFC 4180 CSV reader for the content master (D-047).
 *
 * Supports quoted fields with commas, newlines and doubled quotes, CRLF or LF
 * endings, and a UTF-8 BOM (Google Sheets exports one). It is strict on
 * purpose: a malformed master must fail the build, not silently drop a column.
 * No dependency, no dialect guessing.
 */

export interface CsvRow {
  /** 1-based line where the record starts, for error messages. */
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

export interface CsvTable {
  readonly header: readonly string[];
  readonly rows: readonly CsvRow[];
}

export class CsvError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`CSV line ${line}: ${message}`);
    this.name = 'CsvError';
    this.line = line;
  }
}

interface RawRecord {
  readonly fields: readonly string[];
  readonly line: number;
}

export function parseCsv(text: string): CsvTable {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = splitRecords(source).filter((record) => !isBlank(record));

  const headerRecord = records[0];
  if (headerRecord === undefined) throw new CsvError('the file has no header row', 1);

  const header = headerRecord.fields.map((name) => name.trim());
  const seen = new Set<string>();
  for (const name of header) {
    if (name.length === 0) throw new CsvError('a header column is empty', headerRecord.line);
    if (seen.has(name)) throw new CsvError(`duplicate header column "${name}"`, headerRecord.line);
    seen.add(name);
  }

  const rows = records.slice(1).map((record) => {
    if (record.fields.length !== header.length) {
      throw new CsvError(`expected ${header.length} columns, found ${record.fields.length}`, record.line);
    }
    const values: Record<string, string> = {};
    header.forEach((name, index) => {
      values[name] = record.fields[index]!;
    });
    return { line: record.line, values };
  });

  return { header, rows };
}

function splitRecords(source: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let afterQuote = false;

  const endField = (): void => {
    fields.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push({ fields, line: recordLine });
    fields = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }

    if (afterQuote) {
      if (char === ',') {
        endField();
        afterQuote = false;
        continue;
      }
      if (char === '\r' || char === '\n') {
        if (char === '\r' && source[index + 1] === '\n') index += 1;
        endRecord();
        line += 1;
        afterQuote = false;
        continue;
      }
      throw new CsvError('unexpected character after a closing quote', line);
    }

    if (char === '"') {
      if (field.length > 0) throw new CsvError('quote inside an unquoted field', line);
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      endField();
      continue;
    }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      endRecord();
      line += 1;
      continue;
    }
    field += char;
  }

  if (inQuotes) throw new CsvError('unterminated quoted field', recordLine);
  if (afterQuote || field.length > 0 || fields.length > 0) {
    endField();
    records.push({ fields, line: recordLine });
  }

  return records;
}

function isBlank(record: RawRecord): boolean {
  return record.fields.length === 1 && record.fields[0]!.trim().length === 0;
}

/**
 * RFC 4180 writer for the master and its review sheets. Always quotes, so a
 * comma, quote or newline in a question can never split a column. CRLF keeps
 * the file diff-friendly on Windows; an optional BOM lets Excel detect UTF-8.
 */
export function writeCsv(
  header: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
  options: { readonly bom?: boolean } = {},
): string {
  const cell = (value: string | undefined): string => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(cell).join(',')];
  for (const row of rows) lines.push(header.map((column) => cell(row[column])).join(','));
  return `${options.bom === true ? '\uFEFF' : ''}${lines.join('\r\n')}\r\n`;
}
