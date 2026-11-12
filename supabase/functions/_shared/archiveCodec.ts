/**
 * Compact binary encoding for one archive file (D-027, D-091).
 *
 * Shared by the nightly Edge function (Deno) and the tests (Node), so it uses
 * only web-standard APIs and imports nothing from outside `supabase/functions`.
 * `ArchivedAttempt` is structurally the app's `AttemptRecord`; a test pins that.
 *
 * Layout, before gzip:
 *   "CGA1" | varint stringCount | strings (varint byteLength + UTF-8)
 *   varint recordCount | records sorted by (at, id)
 * Record:
 *   flags byte: bits 0-2 mode, bits 3-5 chosen (7 = skipped), bit 6 correct,
 *               bit 7 has mockId
 *   id: 0x00 + 16 bytes for a UUID, or 0x01 + varint string index
 *   varint qid index | varint qv | varint ms (whole milliseconds)
 *   zigzag varint (at - previous at) | varint deviceId index
 *   [varint mockId index]
 *
 * `ms` is rounded to whole milliseconds; every other field round-trips exactly.
 */

export const ARCHIVE_MAGIC = 'CGA1';

export const ARCHIVE_MODES = ['practice', 'pyq', 'mock', 'daily', 'revise'] as const;

export type ArchiveMode = (typeof ARCHIVE_MODES)[number];

export interface ArchivedAttempt {
  readonly id: string;
  readonly qid: string;
  readonly qv: number;
  readonly chosen: 0 | 1 | 2 | 3 | null;
  readonly correct: boolean;
  readonly ms: number;
  readonly mode: ArchiveMode;
  readonly mockId?: string;
  readonly at: number;
  readonly deviceId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SKIPPED = 7;

export function encodeArchive(attempts: readonly ArchivedAttempt[]): Uint8Array {
  const sorted = [...attempts].sort((a, b) => a.at - b.at || compareText(a.id, b.id));

  const strings: string[] = [];
  const indexOf = new Map<string, number>();
  const intern = (value: string): number => {
    let index = indexOf.get(value);
    if (index === undefined) {
      index = strings.length;
      strings.push(value);
      indexOf.set(value, index);
    }
    return index;
  };

  const body = new Writer();
  body.varint(sorted.length);
  let previousAt = 0;
  for (const attempt of sorted) {
    const mode = ARCHIVE_MODES.indexOf(attempt.mode);
    if (mode < 0) throw new RangeError(`unknown mode "${attempt.mode}"`);
    const chosen = attempt.chosen === null ? SKIPPED : attempt.chosen;
    if (!Number.isInteger(chosen) || chosen < 0 || (chosen > 3 && chosen !== SKIPPED)) {
      throw new RangeError(`invalid chosen ${String(attempt.chosen)}`);
    }
    const hasMock = attempt.mockId !== undefined;
    body.byte(mode | (chosen << 3) | (attempt.correct ? 0x40 : 0) | (hasMock ? 0x80 : 0));

    if (UUID.test(attempt.id)) {
      body.byte(0);
      body.bytes(uuidBytes(attempt.id));
    } else {
      body.byte(1);
      body.varint(intern(attempt.id));
    }

    body.varint(intern(attempt.qid));
    body.varint(attempt.qv);
    body.varint(Math.max(0, Math.round(attempt.ms)));
    body.zigzag(attempt.at - previousAt);
    previousAt = attempt.at;
    body.varint(intern(attempt.deviceId));
    if (hasMock) body.varint(intern(attempt.mockId!));
  }

  const head = new Writer();
  head.bytes(new TextEncoder().encode(ARCHIVE_MAGIC));
  head.varint(strings.length);
  for (const value of strings) {
    const utf8 = new TextEncoder().encode(value);
    head.varint(utf8.length);
    head.bytes(utf8);
  }
  return concat(head.finish(), body.finish());
}

export function decodeArchive(data: Uint8Array): ArchivedAttempt[] {
  const reader = new Reader(data);
  const magic = new TextDecoder().decode(reader.take(4));
  if (magic !== ARCHIVE_MAGIC) throw new RangeError(`not an archive file (magic "${magic}")`);

  const strings: string[] = [];
  const stringCount = reader.varint();
  for (let i = 0; i < stringCount; i += 1) {
    strings.push(new TextDecoder().decode(reader.take(reader.varint())));
  }
  const text = (index: number): string => {
    const value = strings[index];
    if (value === undefined) throw new RangeError(`string index ${index} out of range`);
    return value;
  };

  const count = reader.varint();
  const attempts: ArchivedAttempt[] = [];
  let at = 0;
  for (let i = 0; i < count; i += 1) {
    const flags = reader.byte();
    const mode = ARCHIVE_MODES[flags & 0x07];
    if (mode === undefined) throw new RangeError(`unknown mode ${flags & 0x07}`);
    const chosenBits = (flags >> 3) & 0x07;
    if (chosenBits > 3 && chosenBits !== SKIPPED) throw new RangeError(`invalid chosen ${chosenBits}`);

    const idKind = reader.byte();
    const id = idKind === 0 ? uuidText(reader.take(16)) : text(reader.varint());
    const qid = text(reader.varint());
    const qv = reader.varint();
    const ms = reader.varint();
    at += reader.zigzag();
    const deviceId = text(reader.varint());
    const mockId = (flags & 0x80) !== 0 ? text(reader.varint()) : undefined;

    attempts.push({
      id,
      qid,
      qv,
      chosen: chosenBits === SKIPPED ? null : (chosenBits as 0 | 1 | 2 | 3),
      correct: (flags & 0x40) !== 0,
      ms,
      mode,
      ...(mockId === undefined ? {} : { mockId }),
      at,
      deviceId,
    });
  }
  if (!reader.done()) throw new RangeError('trailing bytes after the last record');
  return attempts;
}

export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  return pipe(data, new CompressionStream('gzip'));
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return pipe(data, new DecompressionStream('gzip'));
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([new Uint8Array(data)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

class Writer {
  private chunks: number[] = [];

  byte(value: number): void {
    this.chunks.push(value & 0xff);
  }

  bytes(values: Uint8Array): void {
    for (const value of values) this.chunks.push(value);
  }

  /** Unsigned LEB128 for integers up to 2^53, without BigInt. */
  varint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`varint out of range: ${value}`);
    let rest = value;
    while (rest >= 0x80) {
      this.chunks.push((rest % 0x80) | 0x80);
      rest = Math.floor(rest / 0x80);
    }
    this.chunks.push(rest);
  }

  zigzag(value: number): void {
    if (!Number.isSafeInteger(value)) throw new RangeError(`zigzag out of range: ${value}`);
    this.varint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

class Reader {
  private offset = 0;
  constructor(private readonly data: Uint8Array) {}

  byte(): number {
    const value = this.data[this.offset];
    if (value === undefined) throw new RangeError('archive ended early');
    this.offset += 1;
    return value;
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.data.length) throw new RangeError('archive ended early');
    const slice = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  varint(): number {
    let value = 0;
    let scale = 1;
    for (;;) {
      const byte = this.byte();
      value += (byte & 0x7f) * scale;
      if (!Number.isSafeInteger(value)) throw new RangeError('varint too large');
      if ((byte & 0x80) === 0) return value;
      scale *= 0x80;
    }
  }

  zigzag(): number {
    const raw = this.varint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  done(): boolean {
    return this.offset === this.data.length;
  }
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function uuidText(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
