/**
 * Deterministic JSON for signatures (D-050).
 *
 * The build signs `canonicalJson(manifest without signature)` and the app
 * verifies exactly the same bytes, so the two sides cannot disagree about key
 * order, whitespace or number formatting.
 *
 * Rules:
 * - object keys sorted by UTF-16 code unit order;
 * - no whitespace;
 * - strings escaped with `JSON.stringify`;
 * - numbers must be safe integers (the manifest only carries counts, versions
 *   and byte sizes), so float formatting never enters the payload;
 * - only null, booleans, strings, safe integers, arrays and plain objects.
 *
 * Throws `RangeError` for anything else, including `undefined`, `NaN`, `Date`,
 * `Map` and non-plain class instances.
 */
export function canonicalJson(value: unknown): string {
  return encode(value, '$');
}

function encode(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isSafeInteger(value)) {
        throw new RangeError(`${path} must be a safe integer (got ${String(value)})`);
      }
      return String(value);
    case 'object':
      return Array.isArray(value) ? encodeArray(value, path) : encodeObject(value, path);
    default:
      throw new RangeError(`${path} has unsupported type "${typeof value}"`);
  }
}

function encodeArray(value: readonly unknown[], path: string): string {
  const items = value.map((item, index) => encode(item, `${path}[${index}]`));
  return `[${items.join(',')}]`;
}

function encodeObject(value: object, path: string): string {
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new RangeError(`${path} must be a plain object`);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const members = keys.map((key) => {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new RangeError(`${path} has an inherited key "${key}"`);
    }
    return `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`;
  });
  return `{${members.join(',')}}`;
}
