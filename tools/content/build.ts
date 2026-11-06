import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Manifest, PackEntry, Question as QuestionRecord } from '../../shared/contract';
import { canonicalJson } from '../../shared/canonicalJson';
import type { CsvTable } from './csv';
import { ContentError, validateMaster, type Difficulty } from './master';

export interface PackLockEntry {
  readonly version: number;
  /** Hash of `{ id, questions }`; decides whether the semantic version moves. */
  readonly contentHash: string;
  /** Hash of the final pack bytes, exactly what the manifest advertises. */
  readonly sha256: string;
}

export interface PackLock {
  readonly manifestVersion: number;
  readonly packs: Readonly<Record<string, PackLockEntry>>;
}

export interface BuildOptions {
  readonly generatedAt: string;
  /** CDN base, e.g. `https://cdn.example.com/packs`. No trailing slash required. */
  readonly packUrlBase: string;
  /** Previous lock, or null on a first build. */
  readonly lock?: PackLock | null;
  /** Base64 Ed25519 over the canonical manifest body (D-050). */
  readonly sign: (message: Uint8Array) => string;
}

export interface BuiltPack {
  readonly entry: PackEntry;
  /** Exact bytes written to disk. */
  readonly json: string;
  readonly fileName: string;
}

export interface BuildResult {
  readonly packs: readonly BuiltPack[];
  readonly manifest: Manifest;
  readonly lock: PackLock;
  readonly counts: Readonly<Record<'verified' | 'draft' | 'rejected', number>>;
  readonly warnings: readonly string[];
}

/**
 * Turn a validated master into pack files and a signed manifest (D-047..D-050).
 *
 * Pure apart from `sign`: the caller supplies the clock and the key, so the
 * build is reproducible in tests. Pack versions move only when the questions
 * change; the file name and manifest URL include the byte hash, so a formatting
 * change can never be served from a stale CDN cache.
 */
export function buildContent(table: CsvTable, options: BuildOptions): BuildResult {
  const report = validateMaster(table);
  if (report.errors.length > 0) {
    throw new ContentError(`the master has ${report.errors.length} error(s):\n${report.errors.join('\n')}`);
  }
  if (report.questions.length === 0) {
    throw new ContentError('no verified questions to pack; mark at least one row as verified');
  }

  validateBuildOptions(options);
  const base = options.packUrlBase.replace(/\/+$/, '');
  const previous = options.lock ?? null;

  const groups = new Map<string, readonly QuestionRecord[]>();
  for (const question of report.questions) {
    const record = question.record;
    const group = groups.get(record.packId);
    if (group === undefined) {
      groups.set(record.packId, [record]);
      continue;
    }
    if (group[0]!.section !== record.section) {
      throw new ContentError(
        `pack "${record.packId}" mixes sections "${group[0]!.section}" and "${record.section}"`,
      );
    }
    groups.set(record.packId, [...group, record]);
  }

  const packIds = [...groups.keys()].sort(compareText);
  const nextPacks: Record<string, PackLockEntry> = {};
  const built: BuiltPack[] = [];

  for (const packId of packIds) {
    const questions = [...groups.get(packId)!].sort((a, b) => compareText(a.id, b.id));
    const section = questions[0]!.section;
    const contentHash = hash(JSON.stringify({ id: packId, questions }));

    const old = previous?.packs[packId];
    const version =
      old !== undefined && old.contentHash === contentHash ? old.version : (old?.version ?? 0) + 1;

    const json = `${JSON.stringify({ id: packId, version, questions }, null, 2)}\n`;
    const sha256 = hash(json);
    const fileName = `${packId}-v${version}-${sha256.slice(0, 12)}.json`;

    const entry: PackEntry = {
      id: packId,
      section,
      subtopic: packId,
      kind: section === 'current-affairs' ? 'current-affairs' : 'evergreen',
      version,
      sha256,
      url: `${base}/${fileName}`,
      count: questions.length,
      bytes: Buffer.byteLength(json, 'utf8'),
    };

    nextPacks[packId] = { version, contentHash, sha256 };
    built.push({ entry, json, fileName });
  }

  const changed = hasChanged(previous, nextPacks);
  const manifestVersion = changed ? (previous?.manifestVersion ?? 0) + 1 : (previous?.manifestVersion ?? 1);
  const entries = built.map((pack) => pack.entry);
  const body = { version: manifestVersion, generatedAt: options.generatedAt, packs: entries };
  const signature = options.sign(Buffer.from(canonicalJson(body), 'utf8'));

  return {
    packs: built,
    manifest: { ...body, signature },
    lock: { manifestVersion, packs: nextPacks },
    counts: report.counts,
    warnings: report.warnings,
  };
}

/** Write packs and `manifest.json` under `outDir`. */
export async function writeBuild(result: BuildResult, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const pack of result.packs) {
    await writeFile(join(outDir, pack.fileName), pack.json, 'utf8');
  }
  await writeFile(join(outDir, 'manifest.json'), `${JSON.stringify(result.manifest, null, 2)}\n`, 'utf8');
}

/** Read a previous lock; a missing file is a first build, not an error. */
export async function readLock(path: string): Promise<PackLock | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ContentError(`cannot read lock file "${path}": ${asMessage(error)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ContentError(`lock file "${path}" is not valid JSON`);
  }
  return parseLock(parsed, path);
}

export async function writeLock(lock: PackLock, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}

/** Which difficulty value produced this seed; useful for reports. */
export const SEED_TO_DIFFICULTY: Readonly<Record<number, Difficulty>> = Object.freeze({
  1100: 'easy',
  1200: 'medium',
  1300: 'hard',
});

function hasChanged(previous: PackLock | null, next: Readonly<Record<string, PackLockEntry>>): boolean {
  if (previous === null) return true;
  const oldIds = Object.keys(previous.packs).sort(compareText);
  const newIds = Object.keys(next).sort(compareText);
  if (oldIds.length !== newIds.length) return true;
  for (let index = 0; index < newIds.length; index += 1) {
    const id = newIds[index]!;
    if (id !== oldIds[index]) return true;
    const old = previous.packs[id]!;
    const current = next[id]!;
    if (old.version !== current.version || old.sha256 !== current.sha256) return true;
  }
  return false;
}

function parseLock(value: unknown, path: string): PackLock {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ContentError(`lock file "${path}" must contain a JSON object`);
  }
  const record = value as Record<string, unknown>;
  const manifestVersion = record.manifestVersion;
  if (!Number.isSafeInteger(manifestVersion) || (manifestVersion as number) < 1) {
    throw new ContentError(`lock file "${path}" has an invalid manifestVersion`);
  }
  const packsValue = record.packs;
  if (packsValue === null || typeof packsValue !== 'object' || Array.isArray(packsValue)) {
    throw new ContentError(`lock file "${path}" has an invalid packs map`);
  }

  const packs: Record<string, PackLockEntry> = {};
  for (const [id, entry] of Object.entries(packsValue as Record<string, unknown>)) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ContentError(`lock file "${path}" has an invalid entry for "${id}"`);
    }
    const fields = entry as Record<string, unknown>;
    const version = fields.version;
    const contentHash = fields.contentHash;
    const sha256 = fields.sha256;
    if (!Number.isSafeInteger(version) || (version as number) < 1) {
      throw new ContentError(`lock file "${path}" has an invalid version for "${id}"`);
    }
    if (typeof contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(contentHash)) {
      throw new ContentError(`lock file "${path}" has an invalid contentHash for "${id}"`);
    }
    if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new ContentError(`lock file "${path}" has an invalid sha256 for "${id}"`);
    }
    packs[id] = { version: version as number, contentHash, sha256 };
  }

  return { manifestVersion: manifestVersion as number, packs };
}

function validateBuildOptions(options: BuildOptions): void {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(options.generatedAt) || Number.isNaN(Date.parse(options.generatedAt))) {
    throw new ContentError(`generatedAt must be an ISO timestamp (got "${options.generatedAt}")`);
  }
  if (!/^https:\/\/\S+$/.test(options.packUrlBase)) {
    throw new ContentError(`packUrlBase must be an https URL (got "${options.packUrlBase}")`);
  }
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
