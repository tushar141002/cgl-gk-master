import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../shared/contract';
import { buildContent, readLock, SEED_TO_DIFFICULTY, writeBuild, writeLock } from '../../tools/content/build';
import { ContentError } from '../../tools/content/master';
import { generateSigningKeyPair, signBytes, verifyManifest } from '../../tools/content/signing';
import { masterRow, masterTable } from './fixtures';

const keys = generateSigningKeyPair();
const sign = (message: Uint8Array): string => signBytes(message, keys.privateKeyPem);

const OPTIONS = {
  generatedAt: '2026-11-07T00:00:00.000Z',
  packUrlBase: 'https://cdn.example.com/packs',
  sign,
} as const;

function rows() {
  return [
    masterRow({ id: 'polity-fr-0001', subtopic: 'polity-fundamental-rights', section: 'polity' }, 2),
    masterRow(
      {
        id: 'polity-fr-0002',
        subtopic: 'polity-fundamental-rights',
        section: 'polity',
        en_q: 'Which Article guarantees the right to constitutional remedies?',
        answer: 'C',
      },
      3,
    ),
    masterRow(
      {
        id: 'history-ancient-0001',
        subtopic: 'history-ancient-india',
        section: 'history',
        source_type: 'PYQ',
        source_exam: 'SSC CGL',
        source_year: '2023',
      },
      4,
    ),
  ];
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cgl-build-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('buildContent', () => {
  it('builds one pack per subtopic with a signed manifest', () => {
    const result = buildContent(masterTable(rows()), { ...OPTIONS, lock: null });

    expect(result.packs.map((pack) => pack.entry.id)).toEqual([
      'history-ancient-india',
      'polity-fundamental-rights',
    ]);
    expect(result.manifest.version).toBe(1);
    expect(result.counts).toEqual({ verified: 3, draft: 0, rejected: 0 });
    expect(result.warnings).toEqual([]);
    expect(verifyManifest(result.manifest, keys.publicKeyPem)).toBe(true);
  });

  it('sorts questions inside a pack and hashes the exact bytes', () => {
    const result = buildContent(masterTable([...rows()].reverse()), OPTIONS);
    const pack = result.packs.find((entry) => entry.entry.id === 'polity-fundamental-rights');
    expect(pack).toBeDefined();

    const parsed = JSON.parse(pack!.json) as { questions: readonly { id: string }[] };
    expect(parsed.questions.map((question) => question.id)).toEqual(['polity-fr-0001', 'polity-fr-0002']);
    expect(pack!.entry.sha256).toBe(sha256(pack!.json));
    expect(pack!.entry.bytes).toBe(Buffer.byteLength(pack!.json, 'utf8'));
    expect(pack!.fileName).toBe(`polity-fundamental-rights-v1-${pack!.entry.sha256.slice(0, 12)}.json`);
    expect(pack!.entry.url).toBe(`${OPTIONS.packUrlBase}/${pack!.fileName}`);
  });

  it('marks current-affairs packs by section', () => {
    const result = buildContent(
      masterTable([
        masterRow({
          section: 'current-affairs',
          subtopic: 'current-affairs-2026-10',
          source_type: 'CA',
          source_ca_month: '2026-10',
        }),
      ]),
      OPTIONS,
    );
    expect(result.packs[0]?.entry.kind).toBe('current-affairs');
  });

  it('keeps versions when nothing changed', () => {
    const first = buildContent(masterTable(rows()), OPTIONS);
    const second = buildContent(masterTable(rows()), { ...OPTIONS, lock: first.lock });

    expect(second.lock.manifestVersion).toBe(1);
    expect(second.manifest.version).toBe(1);
    for (const pack of second.packs) {
      expect(pack.entry.version).toBe(1);
    }
  });

  it('bumps the pack and manifest versions when content changes', () => {
    const first = buildContent(masterTable(rows()), OPTIONS);
    const edited = rows().map((row) =>
      row.values.id === 'polity-fr-0001'
        ? { ...row, values: { ...row.values, en_explanation: 'Rewritten explanation.' } }
        : row,
    );
    const second = buildContent(masterTable(edited), { ...OPTIONS, lock: first.lock });

    expect(second.manifest.version).toBe(2);
    const polity = second.packs.find((pack) => pack.entry.id === 'polity-fundamental-rights');
    const history = second.packs.find((pack) => pack.entry.id === 'history-ancient-india');
    expect(polity?.entry.version).toBe(2);
    expect(history?.entry.version).toBe(1);
  });

  it('bumps the manifest when a pack is added', () => {
    const first = buildContent(masterTable([rows()[0]!]), OPTIONS);
    const second = buildContent(masterTable(rows()), { ...OPTIONS, lock: first.lock });
    expect(second.manifest.version).toBe(2);
    expect(second.packs.map((pack) => pack.entry.id)).toEqual([
      'history-ancient-india',
      'polity-fundamental-rights',
    ]);
  });

  it('detects a tampered manifest signature', () => {
    const result = buildContent(masterTable(rows()), OPTIONS);
    const tampered: Manifest = {
      ...result.manifest,
      packs: result.manifest.packs.map((entry, index) =>
        index === 0 ? { ...entry, count: entry.count + 1 } : entry,
      ),
    };
    expect(verifyManifest(tampered, keys.publicKeyPem)).toBe(false);
  });

  it('fails when the master has errors', () => {
    expect(() =>
      buildContent(
        masterTable([masterRow({ id: 'polity-fr-0001' }), masterRow({ id: 'polity-fr-0001' })]),
        OPTIONS,
      ),
    ).toThrow(ContentError);
  });

  it('fails when there is nothing verified to pack', () => {
    expect(() => buildContent(masterTable([masterRow({ status: 'draft' })]), OPTIONS)).toThrow(
      /no verified questions/,
    );
  });

  it('fails when one subtopic mixes sections', () => {
    expect(() =>
      buildContent(
        masterTable([
          masterRow({ id: 'polity-fr-0001', subtopic: 'shared-pack', section: 'polity' }),
          masterRow({ id: 'polity-fr-0002', subtopic: 'shared-pack', section: 'history' }),
        ]),
        OPTIONS,
      ),
    ).toThrow(/mixes sections/);
  });

  it('validates the clock and the URL base', () => {
    expect(() => buildContent(masterTable(rows()), { ...OPTIONS, generatedAt: 'yesterday' })).toThrow(
      /generatedAt/,
    );
    expect(() =>
      buildContent(masterTable(rows()), { ...OPTIONS, packUrlBase: 'http://cdn.example.com' }),
    ).toThrow(/packUrlBase/);
  });

  it('tolerates a trailing slash on the URL base', () => {
    const result = buildContent(masterTable(rows()), {
      ...OPTIONS,
      packUrlBase: 'https://cdn.example.com/packs/',
    });
    expect(result.packs[0]?.entry.url.startsWith('https://cdn.example.com/packs/')).toBe(true);
    expect(result.packs[0]?.entry.url).not.toContain('packs//');
  });
});

describe('build output on disk', () => {
  it('writes packs and manifest.json', async () => {
    const result = buildContent(masterTable(rows()), OPTIONS);
    const out = join(dir, 'dist');
    await writeBuild(result, out);

    const manifestText = await readFile(join(out, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText) as Manifest;
    expect(manifest).toEqual(result.manifest);
    for (const pack of result.packs) {
      expect(await readFile(join(out, pack.fileName), 'utf8')).toBe(pack.json);
    }
  });

  it('round-trips the lock file through disk', async () => {
    const result = buildContent(masterTable(rows()), OPTIONS);
    const path = join(dir, 'nested', 'packs.lock.json');
    await writeLock(result.lock, path);
    expect(await readLock(path)).toEqual(result.lock);
  });

  it('returns null for a missing lock file', async () => {
    expect(await readLock(join(dir, 'missing.json'))).toBeNull();
  });

  it('rejects an invalid lock file', async () => {
    const path = join(dir, 'broken.json');
    await writeFile(path, '{not json', 'utf8');
    await expect(readLock(path)).rejects.toThrow(ContentError);

    await writeFile(path, JSON.stringify({ manifestVersion: 0, packs: {} }), 'utf8');
    await expect(readLock(path)).rejects.toThrow(/manifestVersion/);

    await writeFile(
      path,
      JSON.stringify({
        manifestVersion: 1,
        packs: { x: { version: 1, contentHash: 'nope', sha256: 'nope' } },
      }),
      'utf8',
    );
    await expect(readLock(path)).rejects.toThrow(/contentHash/);
  });

  it('re-runs against a lock read from disk without changing versions', async () => {
    const first = buildContent(masterTable(rows()), OPTIONS);
    const path = join(dir, 'packs.lock.json');
    await writeLock(first.lock, path);
    const loaded = await readLock(path);
    const second = buildContent(masterTable(rows()), { ...OPTIONS, lock: loaded });
    expect(second.manifest.version).toBe(1);
  });
});

describe('SEED_TO_DIFFICULTY', () => {
  it('maps each author difficulty to its seed', () => {
    expect(SEED_TO_DIFFICULTY).toEqual({ 1100: 'easy', 1200: 'medium', 1300: 'hard' });
  });
});
