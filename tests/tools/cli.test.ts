import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Manifest } from '../../shared/contract';
import { main, type CliIO } from '../../tools/content/cli';
import { parseCsv, writeCsv } from '../../tools/content/csv';
import { COLUMNS } from '../../tools/content/master';
import { verifyManifest } from '../../tools/content/signing';
import { masterTable, statusRow } from './fixtures';

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
    expect(text).toContain('Subtopics:');
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

  it('exports a review sheet, promotes an approval and refuses to overwrite the sheet', async () => {
    const master = join(repo, 'master.csv');
    const sheetPath = join(repo, 'review', 'draft-review.csv');
    const hindiPath = join(repo, 'review', 'hindi-review.csv');
    const table = masterTable([
      statusRow('draft', { id: 'polity-fr-0002', en_q: 'Who is the head of state?' }, 2),
      statusRow('draft', { id: 'polity-fr-0003', en_q: 'Who presides over the Rajya Sabha?' }, 3),
    ]);
    await writeFile(
      master,
      writeCsv(
        [...COLUMNS],
        table.rows.map((row) => row.values),
      ),
      'utf8',
    );

    messages = [];
    io = capture(messages);
    const reviewed = await main(['review', '--input', master, '--out', sheetPath], io, repo);
    expect(reviewed).toBe(0);
    expect(messages.join('\n')).toContain('Wrote 2 row(s)');

    const hindiReview = await main(
      ['review', '--lang', 'hi', '--input', master, '--out', hindiPath],
      io,
      repo,
    );
    expect(hindiReview).toBe(0);

    const sheet = parseCsv(await readFile(sheetPath, 'utf8'));
    const filled = sheet.rows.map((row) => ({
      ...row.values,
      decision: row.values.id === 'polity-fr-0002' ? 'approve' : '',
    }));
    await writeFile(sheetPath, writeCsv(sheet.header, filled), 'utf8');

    const hindi = parseCsv(await readFile(hindiPath, 'utf8'));
    const checked = hindi.rows.map((row) => ({ ...row.values, hi_check: 'ok' }));
    await writeFile(hindiPath, writeCsv(hindi.header, checked), 'utf8');

    messages = [];
    io = capture(messages);
    const promoted = await main(
      [
        'promote',
        '--review',
        sheetPath,
        '--hindi',
        hindiPath,
        '--input',
        master,
        '--at',
        '2026-11-07T12:00:00.000Z',
      ],
      io,
      repo,
    );
    expect(promoted).toBe(0);
    expect(messages.join('\n')).toContain('Wrote 1 status change(s)');

    const after = parseCsv(await readFile(master, 'utf8'));
    const approved = after.rows.find((row) => row.values.id === 'polity-fr-0002')!;
    const untouched = after.rows.find((row) => row.values.id === 'polity-fr-0003')!;
    expect(approved.values.status).toBe('verified');
    expect(approved.values.verified_at).toBe('2026-11-07T12:00:00.000Z');
    expect(untouched.values.status).toBe('draft');

    messages = [];
    io = capture(messages);
    const again = await main(['review', '--input', master, '--out', sheetPath], io, repo);
    expect(again).toBe(1);
    expect(messages.join('\n')).toContain('already exists');
  });

  it('carries decisions from an earlier export while the content is unchanged', async () => {
    const master = join(repo, 'master.csv');
    const sheetPath = join(repo, 'draft-review.csv');
    const table = masterTable([
      statusRow('draft', { id: 'polity-fr-0002' }, 2),
      statusRow('draft', { id: 'polity-fr-0003' }, 3),
    ]);
    const columns = [...COLUMNS];
    await writeFile(
      master,
      writeCsv(
        columns,
        table.rows.map((row) => row.values),
      ),
      'utf8',
    );

    expect(await main(['review', '--input', master, '--out', sheetPath], io, repo)).toBe(0);
    const sheet = parseCsv(await readFile(sheetPath, 'utf8'));
    const filled = sheet.rows.map((row) => ({
      ...row.values,
      decision: row.values.id === 'polity-fr-0002' ? 'approve' : '',
    }));
    await writeFile(sheetPath, writeCsv(sheet.header, filled), 'utf8');

    messages = [];
    io = capture(messages);
    expect(
      await main(
        ['review', '--input', master, '--carry', sheetPath, '--out', sheetPath, '--force'],
        io,
        repo,
      ),
    ).toBe(0);
    expect(messages.join('\n')).toContain('Carried 1 decision(s)');
    const carried = parseCsv(await readFile(sheetPath, 'utf8'));
    expect(carried.rows.find((row) => row.values.id === 'polity-fr-0002')?.values.decision).toBe('approve');

    const changed = table.rows.map((row) =>
      row.values.id === 'polity-fr-0002'
        ? { line: row.line, values: { ...row.values, en_q: 'A changed question?' } }
        : row,
    );
    await writeFile(
      master,
      writeCsv(
        columns,
        changed.map((row) => row.values),
      ),
      'utf8',
    );

    messages = [];
    io = capture(messages);
    expect(
      await main(
        ['review', '--input', master, '--carry', sheetPath, '--out', sheetPath, '--force'],
        io,
        repo,
      ),
    ).toBe(0);
    expect(messages.join('\n')).toContain('1 dropped');
    const dropped = parseCsv(await readFile(sheetPath, 'utf8'));
    expect(dropped.rows.find((row) => row.values.id === 'polity-fr-0002')?.values.decision).toBe('');
  });

  it('writes a duplicate-candidate report', async () => {
    const master = join(repo, 'master.csv');
    const report = join(repo, 'dupes.csv');
    const table = masterTable([
      statusRow('draft', { id: 'geography-rivers-0001' }, 2),
      statusRow(
        'draft',
        {
          id: 'geography-rivers-0002',
          en_q: 'Which Article abolishes untouchability in India?',
        },
        3,
      ),
    ]);
    await writeFile(
      master,
      writeCsv(
        [...COLUMNS],
        table.rows.map((row) => row.values),
      ),
      'utf8',
    );

    const code = await main(['dupes', '--input', master, '--out', report], io, repo);
    expect(code).toBe(0);
    expect(messages.join('\n')).toContain('Duplicate candidates');
    expect(messages.join('\n')).toContain('Wrote');

    const parsed = parseCsv(await readFile(report, 'utf8'));
    expect(parsed.header).toContain('left_id');
    expect(parsed.header).toContain('score');
  });

  it('writes a source audit and flags missing refs and front pages', async () => {
    const master = join(repo, 'master.csv');
    const report = join(repo, 'sources.csv');
    const table = masterTable([
      statusRow('draft', { id: 'polity-fr-0002', source_ref: '' }, 2),
      statusRow('draft', { id: 'polity-fr-0003', source_url: 'https://www.ssc.gov.in/' }, 3),
    ]);
    await writeFile(
      master,
      writeCsv(
        [...COLUMNS],
        table.rows.map((row) => row.values),
      ),
      'utf8',
    );

    const code = await main(['sources', '--input', master, '--out', report], io, repo);
    expect(code).toBe(0);
    expect(messages.join('\n')).toContain('Source audit: 2 row(s) checked');
    expect(messages.join('\n')).toContain('missing source_ref: 1');
    expect(messages.join('\n')).toContain('source_url is a front page: 1');

    const parsed = parseCsv(await readFile(report, 'utf8'));
    expect(parsed.rows.map((row) => row.values.id)).toEqual(['polity-fr-0002', 'polity-fr-0003']);
  });
});
