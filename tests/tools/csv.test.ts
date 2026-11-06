import { describe, expect, it } from 'vitest';
import { CsvError, parseCsv } from '../../tools/content/csv';

describe('parseCsv', () => {
  it('reads a header and rows', () => {
    const table = parseCsv('a,b\n1,2\n3,4\n');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows).toEqual([
      { line: 2, values: { a: '1', b: '2' } },
      { line: 3, values: { a: '3', b: '4' } },
    ]);
  });

  it('strips a UTF-8 BOM', () => {
    const table = parseCsv('\uFEFFa,b\n1,2\n');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows[0]?.values.a).toBe('1');
  });

  it('handles CRLF endings and does not add a phantom row', () => {
    const table = parseCsv('a,b\r\n1,2\r\n');
    expect(table.rows).toEqual([{ line: 2, values: { a: '1', b: '2' } }]);
  });

  it('skips blank lines', () => {
    const table = parseCsv('a,b\n\n1,2\n\n');
    expect(table.rows).toHaveLength(1);
  });

  it('supports quoted commas, newlines and doubled quotes', () => {
    const table = parseCsv('a,b\n"x,y","line 1\nline 2"\n"he said ""hi""",z\n');
    expect(table.rows[0]?.values).toEqual({ a: 'x,y', b: 'line 1\nline 2' });
    expect(table.rows[1]?.values).toEqual({ a: 'he said "hi"', b: 'z' });
  });

  it('reports the line where a record starts, not where it ends', () => {
    const table = parseCsv('a,b\n"one\ntwo",x\n');
    expect(table.rows[0]?.line).toBe(2);
  });

  it('trims header names but not cell values', () => {
    const table = parseCsv(' a , b \n 1 , 2 \n');
    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows[0]?.values.a).toBe(' 1 ');
  });

  it('fails when a row has the wrong number of columns', () => {
    expect(() => parseCsv('a,b\n1\n')).toThrow(CsvError);
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/expected 2 columns, found 3/);
  });

  it('fails on a duplicate or empty header', () => {
    expect(() => parseCsv('a,a\n1,2\n')).toThrow(/duplicate header/);
    expect(() => parseCsv('a,\n1,2\n')).toThrow(/header column is empty/);
  });

  it('fails when the file is empty', () => {
    expect(() => parseCsv('')).toThrow(/no header/);
  });

  it('fails on an unterminated quoted field', () => {
    expect(() => parseCsv('a,b\n"open,2\n')).toThrow(/unterminated quoted field/);
  });

  it('fails on a quote inside an unquoted field', () => {
    expect(() => parseCsv('a,b\nx"y,2\n')).toThrow(/quote inside an unquoted field/);
  });

  it('fails on trailing garbage after a closing quote', () => {
    expect(() => parseCsv('a,b\n"x"y,2\n')).toThrow(/after a closing quote/);
  });

  it('exposes the failing line number', () => {
    try {
      parseCsv('a,b\n1,2\n3\n');
      expect.unreachable('parse should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvError);
      expect((error as CsvError).line).toBe(3);
    }
  });
});
