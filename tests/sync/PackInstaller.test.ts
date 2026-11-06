import 'fake-indexeddb/auto';
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../../shared/canonicalJson';
import type { Manifest, PackEntry, Question } from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { PackInstaller, PackInstallError, sha256Hex } from '../../src/sync/PackInstaller';

let db: AppDatabase;
let publicKeyPem: string;
interface SigningPair {
  readonly privateKeyPem: string;
}
let signingPair: SigningPair;

const QUESTION: Question = {
  id: 'polity-fr-0001',
  v: 1,
  packId: 'polity-fundamental-rights',
  section: 'polity',
  subtopic: 'polity-fundamental-rights',
  source: { type: 'practice' },
  en: {
    q: 'Which Article abolishes untouchability?',
    options: ['14', '15', '16', '17'],
    explanation: 'Article 17.',
  },
  hi: {
    q: 'कौन-सा अनुच्छेद अस्पृश्यता का अंत करता है?',
    options: ['14', '15', '16', '17'],
    explanation: 'अनुच्छेद 17।',
  },
  answer: 3,
  eloSeed: 1100,
  verifiedAt: '2026-11-07T00:00:00.000Z',
};

beforeEach(async () => {
  db = await openDatabase(`cgl-install-${crypto.randomUUID()}`);
  const pair = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKeyPem = pair.publicKey;
  signingPair = { privateKeyPem: pair.privateKey };
});

afterEach(async () => {
  await db.delete();
});

interface Fixture {
  readonly manifest: Manifest;
  readonly files: ReadonlyMap<string, string>;
}

async function fixture(
  options: {
    readonly questions?: readonly Question[];
    readonly manifestSignature?: string;
    readonly sha256?: string;
  } = {},
): Promise<Fixture> {
  const questions = options.questions ?? [QUESTION];
  const pack = { id: QUESTION.packId, version: 1, questions };
  const json = `${JSON.stringify(pack, null, 2)}\n`;
  const sha256 = options.sha256 ?? (await sha256Hex(new TextEncoder().encode(json)));
  const entry: PackEntry = {
    id: QUESTION.packId,
    section: 'polity',
    subtopic: 'polity-fundamental-rights',
    kind: 'evergreen',
    version: 1,
    sha256,
    url: 'https://cdn.cglgkmaster.app/packs/polity-fundamental-rights.json',
    count: questions.length,
    bytes: Buffer.byteLength(json, 'utf8'),
  };
  const body = { version: 1, generatedAt: '2026-11-07T00:00:00.000Z', packs: [entry] };
  const signature =
    options.manifestSignature ??
    cryptoSign(null, Buffer.from(canonicalJson(body), 'utf8'), signingPair.privateKeyPem).toString('base64');

  return {
    manifest: { ...body, signature },
    files: new Map([
      ['https://test.local/packs/manifest.json', `${JSON.stringify({ ...body, signature })}\n`],
      ['https://test.local/packs/polity-fundamental-rights.json', json],
    ]),
  };
}

function installer(fixtureValue: Fixture): PackInstaller {
  return new PackInstaller(db, {
    manifestUrl: 'https://test.local/packs/manifest.json',
    publicKeyPem,
    fetch: async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = fixtureValue.files.get(url);
      return body === undefined ? new Response('missing', { status: 404 }) : new Response(body);
    },
    now: () => 1_700_000_000_000,
  });
}

describe('PackInstaller (D-059)', () => {
  it('verifies and installs a signed pack', async () => {
    const result = await installer(await fixture()).install();

    expect(result.installed).toEqual(['polity-fundamental-rights']);
    expect(result.skipped).toEqual([]);
    expect(result.totalQuestions).toBe(1);
    expect(await db.questions.get(QUESTION.id)).toEqual(QUESTION);
    expect(await db.packs.get('polity-fundamental-rights')).toEqual({
      id: 'polity-fundamental-rights',
      version: 1,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      installedAt: 1_700_000_000_000,
    });
  });

  it('skips a pack already installed at the same version and hash', async () => {
    const value = await fixture();
    await installer(value).install();

    const second = await installer(value).install();
    expect(second.installed).toEqual([]);
    expect(second.skipped).toEqual(['polity-fundamental-rights']);
    expect(await db.questions.count()).toBe(1);
  });

  it('replaces the questions when a pack changes', async () => {
    const value = await fixture();
    await installer(value).install();

    const edited: Question = { ...QUESTION, en: { ...QUESTION.en, q: 'Edited question?' } };
    const next = await fixture({ questions: [edited] });
    // The fixture always uses version 1, so force a different advertised hash
    // and drop the stored row to simulate a new build.
    await db.packs.clear();
    const result = await installer(next).install();

    expect(result.installed).toEqual(['polity-fundamental-rights']);
    expect((await db.questions.get(QUESTION.id))?.en.q).toBe('Edited question?');
  });

  it('rejects a manifest whose signature does not match', async () => {
    const value = await fixture({ manifestSignature: 'AAAA' });
    await expect(installer(value).install()).rejects.toThrow(/signature/);
    expect(await db.questions.count()).toBe(0);
  });

  it('rejects a pack whose bytes do not match the advertised hash', async () => {
    const value = await fixture({ sha256: '0'.repeat(64) });
    await expect(installer(value).install()).rejects.toThrow(/hash check/);
    expect(await db.questions.count()).toBe(0);
  });

  it('rejects a pack containing an invalid question', async () => {
    const invalid: Question = { ...QUESTION, answer: 9 as Question['answer'] };
    const value = await fixture({ questions: [invalid] });

    await expect(installer(value).install()).rejects.toThrow(PackInstallError);
    expect(await db.questions.count()).toBe(0);
  });

  it('fails closed when the manifest is missing', async () => {
    const value = await fixture();
    const broken = new PackInstaller(db, {
      manifestUrl: 'https://test.local/packs/manifest.json',
      publicKeyPem,
      fetch: async () => new Response('missing', { status: 404 }),
    });

    await expect(broken.install()).rejects.toThrow(/HTTP 404/);
    expect(await db.questions.count()).toBe(0);
    expect(value.files.size).toBe(2);
  });
});

describe('sha256Hex', () => {
  it('matches node:crypto for the same bytes', async () => {
    const bytes = new TextEncoder().encode('content');
    expect(await sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
  });
});
