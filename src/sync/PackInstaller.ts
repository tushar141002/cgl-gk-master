import type { Manifest, PackEntry, Question } from '../../shared/contract';
import { canonicalJson } from '../../shared/canonicalJson';
import { Question as QuestionValue } from '../core/Question';
import type { AppDatabase } from '../data/database';
import { PackRepository } from '../data/repositories/PackRepository';
import { QuestionRepository } from '../data/repositories/QuestionRepository';

/** The pack payload written by `tools/content/build.ts`. */
interface PackFile {
  readonly id: string;
  readonly version: number;
  readonly questions: readonly Question[];
}

export interface InstallResult {
  /** Pack ids written on this run. */
  readonly installed: readonly string[];
  /** Pack ids already at the advertised version and hash. */
  readonly skipped: readonly string[];
  /** Questions in the store after the run. */
  readonly totalQuestions: number;
}

export class PackInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackInstallError';
  }
}

export interface PackInstallerOptions {
  /** Manifest location. Relative paths resolve against the WebView origin. */
  readonly manifestUrl?: string;
  /**
   * Turns a manifest entry into the URL to fetch. The bundled manifest keeps
   * CDN URLs, so the default uses only the file name next to the manifest.
   */
  readonly packUrl?: (entry: PackEntry) => string;
  readonly publicKeyPem: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
}

const DEFAULT_MANIFEST_URL = './packs/manifest.json';

/**
 * Installs the signed packs shipped inside the APK (D-059, F1/F5).
 *
 * Order is deliberate: verify the manifest signature, then the pack hash, then
 * each record, and only then write. A failure leaves the previously installed
 * version untouched. Running it again is cheap because a matching
 * `(version, sha256)` is skipped.
 */
export class PackInstaller {
  private readonly manifestUrl: string;
  private readonly packUrl: (entry: PackEntry) => string;
  private readonly publicKeyPem: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly now: () => number;
  private readonly questions: QuestionRepository;
  private readonly packs: PackRepository;

  constructor(
    private readonly db: AppDatabase,
    options: PackInstallerOptions,
  ) {
    this.manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
    const base = this.manifestUrl.slice(0, this.manifestUrl.lastIndexOf('/') + 1);
    this.packUrl = options.packUrl ?? ((entry) => `${base}${fileNameOf(entry.url)}`);
    this.publicKeyPem = options.publicKeyPem;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.now = options.now ?? Date.now;
    this.questions = new QuestionRepository(db);
    this.packs = new PackRepository(db);
  }

  async install(): Promise<InstallResult> {
    const manifest = parseManifest(await this.fetchJson(this.manifestUrl));
    await verifyManifestSignature(manifest, this.publicKeyPem);

    const installed: string[] = [];
    const skipped: string[] = [];

    for (const entry of manifest.packs) {
      const current = await this.packs.get(entry.id);
      if (current !== undefined && current.version === entry.version && current.sha256 === entry.sha256) {
        skipped.push(entry.id);
        continue;
      }

      const bytes = await this.fetchBytes(this.packUrl(entry));
      const sha256 = await sha256Hex(bytes);
      if (sha256 !== entry.sha256) {
        throw new PackInstallError(
          `pack "${entry.id}" failed its hash check: expected ${entry.sha256}, got ${sha256}`,
        );
      }

      const pack = parsePack(decodeUtf8(bytes), entry);
      const questions = pack.questions;

      await this.db.transaction('rw', this.db.questions, this.db.packs, async () => {
        await this.questions.replacePack(entry.id, questions);
        await this.packs.put({
          id: entry.id,
          version: entry.version,
          sha256: entry.sha256,
          installedAt: this.now(),
        });
      });

      installed.push(entry.id);
    }

    return { installed, skipped, totalQuestions: await this.questions.count() };
  }

  private async fetchJson(url: string): Promise<unknown> {
    const bytes = await this.fetchBytes(url);
    const text = decodeUtf8(bytes);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new PackInstallError(`"${url}" is not valid JSON`);
    }
  }

  private async fetchBytes(url: string): Promise<Uint8Array> {
    let response: Response;
    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      throw new PackInstallError(
        `cannot fetch "${url}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      throw new PackInstallError(`cannot fetch "${url}": HTTP ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}

/** Shape checks before any signature or hash work, so errors name the field. */
export function parseManifest(value: unknown): Manifest {
  if (!isRecord(value)) throw new PackInstallError('manifest must be a JSON object');
  const version = value.version;
  const generatedAt = value.generatedAt;
  const packs = value.packs;
  const signature = value.signature;

  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    throw new PackInstallError('manifest.version must be a positive integer');
  }
  if (typeof generatedAt !== 'string' || Number.isNaN(Date.parse(generatedAt))) {
    throw new PackInstallError('manifest.generatedAt must be an ISO timestamp');
  }
  if (typeof signature !== 'string' || signature.length === 0) {
    throw new PackInstallError('manifest.signature must be a non-empty string');
  }
  if (!Array.isArray(packs)) throw new PackInstallError('manifest.packs must be an array');

  const seen = new Set<string>();
  const entries = packs.map((entry, index) => {
    const parsed = parsePackEntry(entry, index);
    if (seen.has(parsed.id)) {
      throw new PackInstallError(`manifest lists pack "${parsed.id}" twice`);
    }
    seen.add(parsed.id);
    return parsed;
  });

  return { version: version as number, generatedAt, packs: entries, signature };
}

function parsePackEntry(value: unknown, index: number): PackEntry {
  const where = `manifest.packs[${index}]`;
  if (!isRecord(value)) throw new PackInstallError(`${where} must be an object`);

  const id = value.id;
  const section = value.section;
  const subtopic = value.subtopic;
  const kind = value.kind;
  const version = value.version;
  const sha256 = value.sha256;
  const url = value.url;
  const count = value.count;
  const bytes = value.bytes;

  if (typeof id !== 'string' || id.length === 0) throw new PackInstallError(`${where}.id must be a string`);
  if (typeof section !== 'string') throw new PackInstallError(`${where}.section must be a string`);
  if (typeof subtopic !== 'string') throw new PackInstallError(`${where}.subtopic must be a string`);
  if (kind !== 'evergreen' && kind !== 'current-affairs') {
    throw new PackInstallError(`${where}.kind must be evergreen or current-affairs`);
  }
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    throw new PackInstallError(`${where}.version must be a positive integer`);
  }
  if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new PackInstallError(`${where}.sha256 must be 64 lowercase hex characters`);
  }
  if (typeof url !== 'string' || url.length === 0)
    throw new PackInstallError(`${where}.url must be a string`);
  if (!Number.isSafeInteger(count) || (count as number) < 0) {
    throw new PackInstallError(`${where}.count must be a non-negative integer`);
  }
  if (!Number.isSafeInteger(bytes) || (bytes as number) < 0) {
    throw new PackInstallError(`${where}.bytes must be a non-negative integer`);
  }

  return {
    id,
    section: section as PackEntry['section'],
    subtopic,
    kind,
    version: version as number,
    sha256,
    url,
    count: count as number,
    bytes: bytes as number,
  };
}

function parsePack(text: string, entry: PackEntry): PackFile {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new PackInstallError(`pack "${entry.id}" is not valid JSON`);
  }
  if (!isRecord(value)) throw new PackInstallError(`pack "${entry.id}" must be a JSON object`);
  if (value.id !== entry.id) {
    throw new PackInstallError(`pack file is for "${String(value.id)}", expected "${entry.id}"`);
  }
  if (value.version !== entry.version) {
    throw new PackInstallError(
      `pack "${entry.id}" is version ${String(value.version)}, expected ${entry.version}`,
    );
  }
  if (!Array.isArray(value.questions)) {
    throw new PackInstallError(`pack "${entry.id}" must carry a questions array`);
  }
  if (value.questions.length !== entry.count) {
    throw new PackInstallError(
      `pack "${entry.id}" has ${value.questions.length} questions, manifesto says ${entry.count}`,
    );
  }

  const questions = value.questions.map((record, index) => {
    if (!isRecord(record)) {
      throw new PackInstallError(`pack "${entry.id}" question ${index} must be an object`);
    }
    try {
      return QuestionValue.from(record as unknown as Question).toJSON();
    } catch (error) {
      throw new PackInstallError(
        `pack "${entry.id}" question ${index}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  return { id: entry.id, version: entry.version, questions };
}

async function verifyManifestSignature(manifest: Manifest, publicKeyPem: string): Promise<void> {
  const body = { version: manifest.version, generatedAt: manifest.generatedAt, packs: manifest.packs };
  const message = new TextEncoder().encode(canonicalJson(body));
  const signature = base64ToBytes(manifest.signature);

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'spki',
      toArrayBuffer(pemToDer(publicKeyPem)),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
  } catch {
    throw new PackInstallError(
      'this WebView cannot verify Ed25519 signatures; update Android System WebView',
    );
  }

  const ok = await crypto.subtle.verify('Ed25519', key, toArrayBuffer(signature), toArrayBuffer(message));
  if (!ok) throw new PackInstallError('manifest signature is not valid');
}

/** SHA-256 of the exact bytes that were served, as lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Copy into a plain `ArrayBuffer`. Web Crypto's DOM types reject
 * `Uint8Array<ArrayBufferLike>` because a `SharedArrayBuffer` view is not a
 * valid `BufferSource`, even though every byte here is ordinary memory.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '');
  return base64ToBytes(base64);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function fileNameOf(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const name = withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1);
  if (name.length === 0) throw new PackInstallError(`cannot derive a file name from "${url}"`);
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
