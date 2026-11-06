import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../shared/canonicalJson';

const asUnknown = (value: unknown): unknown => value;

describe('canonicalJson', () => {
  it('sorts object keys and emits no whitespace', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: [3, { b: 1, a: 2 }], a: null })).toBe('{"a":null,"z":[3,{"a":2,"b":1}]}');
  });

  it('is independent of insertion order', () => {
    const first = { version: 1, generatedAt: '2026-11-07T00:00:00.000Z', packs: [] };
    const second = { packs: [], generatedAt: '2026-11-07T00:00:00.000Z', version: 1 };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
  });

  it('encodes strings, booleans, nulls and arrays', () => {
    expect(canonicalJson('a"b\\c\n')).toBe(JSON.stringify('a"b\\c\n'));
    expect(canonicalJson([1, 'x', true, null])).toBe('[1,"x",true,null]');
    expect(canonicalJson(true)).toBe('true');
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson([])).toBe('[]');
    expect(canonicalJson({})).toBe('{}');
  });

  it('accepts the safe-integer boundaries', () => {
    expect(canonicalJson(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
    expect(canonicalJson(Number.MIN_SAFE_INTEGER)).toBe(String(Number.MIN_SAFE_INTEGER));
    expect(canonicalJson(0)).toBe('0');
  });

  it('accepts null-prototype objects', () => {
    const bare = Object.create(null) as Record<string, number>;
    bare.n = 7;
    expect(canonicalJson(bare)).toBe('{"n":7}');
  });

  it.each([
    ['a float', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['a bigint', 10n],
    ['a function', () => undefined],
  ])('rejects %s', (_label, value) => {
    expect(() => canonicalJson(asUnknown(value))).toThrow(RangeError);
  });

  it('rejects non-plain objects', () => {
    expect(() => canonicalJson(new Date(0))).toThrow(/must be a plain object/);
    expect(() => canonicalJson(new Map())).toThrow(/must be a plain object/);
    class Box {
      readonly value = 1;
    }
    expect(() => canonicalJson(new Box())).toThrow(/must be a plain object/);
  });

  it('names the offending path', () => {
    expect(() => canonicalJson({ packs: [{ bytes: 1.5 }] })).toThrow(/\$\.packs\[0\]\.bytes/);
  });
});
