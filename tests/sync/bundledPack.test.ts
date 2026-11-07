import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { CONTENT_PUBLIC_KEY } from '../../src/sync/contentPublicKey';
import { PackInstallError, PackInstaller } from '../../src/sync/PackInstaller';

/**
 * The pack that ships inside the APK is a build artifact, not a fixture. This
 * test reads the real files, so a stale lock, a bad signature or a typo in the
 * master bank fails `npm test` before a release.
 */
const PACKS = join(process.cwd(), 'public', 'packs');

let db: AppDatabase;

beforeEach(async () => {
  db = await openDatabase(`cgl-bundled-${crypto.randomUUID()}`);
});

afterEach(async () => {
  await db.delete();
});

function fetchFromDisk(transform?: (name: string, text: string) => string): typeof fetch {
  const impl = async (input: string | URL | Request): Promise<Response> => {
    const name = String(input).slice(String(input).lastIndexOf('/') + 1);
    let text: string;
    try {
      text = await readFile(join(PACKS, name), 'utf8');
    } catch {
      return new Response('missing', { status: 404 });
    }
    return new Response(transform === undefined ? text : transform(name, text), { status: 200 });
  };
  return impl as unknown as typeof fetch;
}

function installer(fetchImpl: typeof fetch): PackInstaller {
  return new PackInstaller(db, {
    manifestUrl: './packs/manifest.json',
    publicKeyPem: CONTENT_PUBLIC_KEY,
    fetch: fetchImpl,
  });
}

describe('bundled pack (D-059)', () => {
  it('verifies with the pinned key and installs all three subtopics', async () => {
    const result = await installer(fetchFromDisk()).install();

    expect([...result.installed].sort()).toEqual([
      'geography-indian-geography',
      'history-ancient-india',
      'polity-fundamental-rights',
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.totalQuestions).toBe(60);

    const questions = await new QuestionRepository(db).all();
    expect(questions).toHaveLength(60);
    expect(questions.every((question) => question.hi !== null)).toBe(true);
    expect(new Set(questions.map((question) => question.section))).toEqual(
      new Set(['polity', 'history', 'geography']),
    );
  });

  it('skips the same version and hash on a second launch', async () => {
    const first = installer(fetchFromDisk());
    await first.install();

    const second = await first.install();
    expect(second.installed).toEqual([]);
    expect(second.skipped).toHaveLength(3);
    expect(second.totalQuestions).toBe(60);
  });

  it('rejects a manifest whose signature no longer matches', async () => {
    const tampered = fetchFromDisk((name, text) => {
      if (name !== 'manifest.json') return text;
      const manifest = JSON.parse(text) as { signature: string };
      return JSON.stringify({ ...manifest, signature: 'AAAA' });
    });

    await expect(installer(tampered).install()).rejects.toThrow(PackInstallError);
    await expect(installer(tampered).install()).rejects.toThrow(/signature/);
  });
});
