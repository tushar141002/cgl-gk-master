import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../shared/contract';
import { main, type CliIO } from '../../tools/content/cli';
import { verifyManifest } from '../../tools/content/signing';

const SAMPLE = join(process.cwd(), 'content', 'sample', 'questions.csv');

function capture(messages: string[]): CliIO {
  return {
    out: (message) => messages.push(message),
    err: (message) => messages.push(`ERR ${message}`),
  };
}

let base: string;
let repo: string;
let keys: string;
let out: string;
let messages: string[];
let io: CliIO;
let savedKey: string | undefined;
let savedBase: string | undefined;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'cgl-cli-'));
  repo = join(base, 'repo');
  keys = join(base, 'keys');
  out = join(base, 'dist');
  await mkdir(repo, { recursive: true });
  messages = [];
  io = capture(messages);
  savedKey = process.env.CGL_SIGNING_KEY;
  savedBase = process.env.CGL_PACK_URL_BASE;
  delete process.env.CGL_SIGNING_KEY;
  delete process.env.CGL_PACK_URL_BASE;
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
  if (savedKey === undefined) delete process.env.CGL_SIGNING_KEY;
  else process.env.CGL_SIGNING_KEY = savedKey;
  if (savedBase === undefined) delete process.env.CGL_PACK_URL_BASE;
  else process.env.CGL_PACK_URL_BASE = savedBase;
});

describe('content CLI', () => {
  it('validates the sample master and reports drafts as warnings', async () => {
    const code = await main(['validate', '--input', SAMPLE, '--verbose'], io, repo);
    const text = messages.join('\n');

    expect(code).toBe(0);
    expect(text).toContain('Rows: 4 (verified 3, draft 1, rejected 0)');
    expect(text).toContain('polity-fr-0002');
    expect(text).toContain('Master is valid for building');
  });

  it('returns 1 when the CSV cannot be parsed', async () => {
    const path = join(repo, 'broken.csv');
    await writeFile(path, 'a,b\n1\n', 'utf8');
    const code = await main(['validate', '--input', path], io, repo);

    expect(code).toBe(1);
    expect(messages.join('\n')).toContain('CSV line 2');
  });

  it('returns 1 when a verified row has errors', async () => {
    const path = join(repo, 'bad.csv');
    await writeFile(path, 'not,a,master\n1,2,3\n', 'utf8');
    const code = await main(['validate', '--input', path], io, repo);

    expect(code).toBe(1);
    expect(messages.join('\n')).toContain('missing these columns');
  });

  it('prints usage for --help and for no command', async () => {
    expect(await main(['--help'], io, repo)).toBe(0);
    expect(messages.join('\n')).toContain('content:build');

    messages = [];
    io = capture(messages);
    expect(await main([], io, repo)).toBe(2);
  });

  it('rejects an unknown command with exit code 2', async () => {
    expect(await main(['publish'], io, repo)).toBe(2);
    expect(messages.join('\n')).toContain('unknown command');
  });

  it('generates a key pair outside the repository', async () => {
    const code = await main(['keygen', '--out', keys], io, repo);
    expect(code).toBe(0);

    const privatePem = await readFile(join(keys, 'ed25519-private.pem'), 'utf8');
    const publicPem = await readFile(join(keys, 'ed25519-public.pem'), 'utf8');
    expect(privatePem).toContain('BEGIN PRIVATE KEY');
    expect(publicPem).toContain('BEGIN PUBLIC KEY');
  });

  it('refuses to write a private key inside the working directory', async () => {
    const code = await main(['keygen', '--out', join(repo, 'keys')], io, repo);
    expect(code).toBe(1);
    expect(messages.join('\n')).toContain('refusing to write a private key');
  });

  it('builds packs and a verifiable manifest', async () => {
    expect(await main(['keygen', '--out', keys], io, repo)).toBe(0);
    messages = [];
    io = capture(messages);

    const code = await main(
      [
        'build',
        '--input',
        SAMPLE,
        '--out',
        out,
        '--lock',
        join(base, 'packs.lock.json'),
        '--key',
        join(keys, 'ed25519-private.pem'),
        '--url-base',
        'https://cdn.example.com/packs',
        '--generated-at',
        '2026-11-07T00:00:00.000Z',
      ],
      io,
      repo,
    );

    const text = messages.join('\n');
    expect(code).toBe(0);
    expect(text).toContain('Built 3 pack(s) from 3 verified question(s).');

    const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Manifest;
    const publicPem = await readFile(join(keys, 'ed25519-public.pem'), 'utf8');
    expect(verifyManifest(manifest, publicPem)).toBe(true);
    expect(manifest.generatedAt).toBe('2026-11-07T00:00:00.000Z');
  });

  it('reuses the lock on a second build so versions stay put', async () => {
    await main(['keygen', '--out', keys], io, repo);
    const lockPath = join(base, 'packs.lock.json');
    const args = [
      'build',
      '--input',
      SAMPLE,
      '--out',
      out,
      '--lock',
      lockPath,
      '--key',
      join(keys, 'ed25519-private.pem'),
      '--url-base',
      'https://cdn.example.com/packs',
      '--generated-at',
      '2026-11-07T00:00:00.000Z',
    ];

    expect(await main(args, io, repo)).toBe(0);
    const first = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Manifest;
    messages = [];
    io = capture(messages);
    expect(await main(args, io, repo)).toBe(0);
    const second = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Manifest;

    expect(second.version).toBe(first.version);
    expect(second.packs.map((pack) => pack.version)).toEqual(first.packs.map((pack) => pack.version));
  });

  it('requires a key and a URL base for build', async () => {
    const code = await main(['build', '--input', SAMPLE], io, repo);
    expect(code).toBe(1);
    expect(messages.join('\n')).toContain('pass --key');
  });

  it('reads the key and URL base from the environment', async () => {
    await main(['keygen', '--out', keys], io, repo);
    process.env.CGL_SIGNING_KEY = join(keys, 'ed25519-private.pem');
    process.env.CGL_PACK_URL_BASE = 'https://cdn.example.com/packs';

    messages = [];
    io = capture(messages);
    const code = await main(
      [
        'build',
        '--input',
        SAMPLE,
        '--out',
        out,
        '--lock',
        join(base, 'packs.lock.json'),
        '--generated-at',
        '2026-11-07T00:00:00.000Z',
      ],
      io,
      repo,
    );

    expect(code).toBe(0);
    expect(messages.join('\n')).toContain('Built 3 pack(s)');
  });
});
