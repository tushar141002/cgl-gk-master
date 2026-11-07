import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildContent, readLock, writeBuild, writeLock } from './build';
import { parseCsv, writeCsv } from './csv';
import { ContentError, validateMaster } from './master';
import { buildReviewSheet, type ReviewStatus } from './review';
import { promote } from './promote';
import { generateSigningKeyPair, signBytes } from './signing';

const DEFAULTS = {
  input: 'content/master/questions.csv',
  out: 'content/dist',
  lock: 'content/packs.lock.json',
} as const;

const USAGE = `CGL GK Master content pipeline

Usage:
  npm run content:validate -- [--input <file>] [--verbose]
  npm run content:review   -- [--status draft|verified|rejected|all] [--subtopic <slug>] [--out <file>] [--force]
  npm run content:promote  -- --review <sheet.csv> [--input <master>] [--subtopic <slug>] [--at <iso>] [--dry-run]
  npm run content:build    -- --key <private.pem> --url-base <https://...> [options]
  npm run content:keygen   -- --out <directory outside this repository>

Options:
  --input <file>          Master CSV (default: ${DEFAULTS.input})
  --review <file>         Filled review sheet for \`promote\`
  --status <status>       Review rows: draft, verified, rejected or all (default: draft)
  --subtopic <slug>       Limit review or promotion to one sub-topic
  --out <dir|file>        Build output directory or review sheet path
  --lock <file>           Pack lock file (default: ${DEFAULTS.lock})
  --key <file>            Ed25519 private key in PEM; or set CGL_SIGNING_KEY
  --url-base <url>        CDN base for pack URLs; or set CGL_PACK_URL_BASE
  --generated-at <iso>    Manifest timestamp, for reproducible builds
  --at <iso>              Verification timestamp for promoted rows (default: now)
  --force                 Overwrite an existing review sheet
  --dry-run               Report what \`promote\` would change without writing
  --verbose               Show every warning and error
  --help, -h              Show this text
`;

export interface CliIO {
  readonly out: (message: string) => void;
  readonly err: (message: string) => void;
}

const defaultIO: CliIO = {
  out: (message) => console.log(message),
  err: (message) => console.error(message),
};

/**
 * The command line around the pipeline. Returns an exit code instead of
 * calling `process.exit`, so tests can run every command in a temp directory.
 */
export async function main(
  argv: readonly string[],
  io: CliIO = defaultIO,
  cwd: string = process.cwd(),
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        input: { type: 'string' },
        out: { type: 'string' },
        lock: { type: 'string' },
        review: { type: 'string' },
        status: { type: 'string' },
        subtopic: { type: 'string' },
        key: { type: 'string' },
        'url-base': { type: 'string' },
        'generated-at': { type: 'string' },
        at: { type: 'string' },
        force: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        verbose: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (error) {
    io.err(`error: ${asMessage(error)}`);
    io.err(USAGE);
    return 2;
  }

  if (parsed.values.help) {
    io.out(USAGE);
    return 0;
  }
  if (parsed.positionals.length === 0) {
    io.err(USAGE);
    return 2;
  }
  if (parsed.positionals.length > 1) {
    io.err(`error: unexpected argument "${parsed.positionals[1]}"`);
    return 2;
  }

  const command = parsed.positionals[0];
  const verbose = parsed.values.verbose === true;

  try {
    switch (command) {
      case 'validate':
        return await runValidate(parsed.values, io, cwd, verbose);
      case 'review':
        return await runReview(parsed.values, io, cwd);
      case 'promote':
        return await runPromote(parsed.values, io, cwd, verbose);
      case 'build':
        return await runBuild(parsed.values, io, cwd, verbose);
      case 'keygen':
        return await runKeygen(parsed.values, io, cwd);
      default:
        io.err(`error: unknown command "${command}"`);
        io.err(USAGE);
        return 2;
    }
  } catch (error) {
    io.err(`error: ${asMessage(error)}`);
    return 1;
  }
}

type Values = Readonly<Record<string, string | boolean | undefined>>;

async function runValidate(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const table = parseCsv(await readText(input, 'master'));
  const report = validateMaster(table);

  io.out(
    `Rows: ${report.rows.length} ` +
      `(verified ${report.counts.verified}, draft ${report.counts.draft}, rejected ${report.counts.rejected})`,
  );
  printSubtopics(report.subtopics, io.out);
  printList('warning', report.warnings, verbose ? Number.POSITIVE_INFINITY : 20, io.out);
  printList('error', report.errors, verbose ? Number.POSITIVE_INFINITY : 50, io.err);

  if (report.errors.length > 0) {
    io.err(`Invalid master: ${report.errors.length} error(s).`);
    return 1;
  }

  io.out(
    report.warnings.length === 0
      ? 'Master is valid.'
      : `Master is valid for building; ${report.warnings.length} warning(s) are on drafts.`,
  );
  return 0;
}

async function runReview(values: Values, io: CliIO, cwd: string): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const status = (stringValue(values.status) ?? 'draft') as ReviewStatus;
  const subtopic = stringValue(values.subtopic);
  const out = resolve(cwd, stringValue(values.out) ?? `content/review/${status}-review.csv`);

  const table = parseCsv(await readText(input, 'master'));
  const sheet = buildReviewSheet(table, {
    status,
    ...(subtopic === undefined ? {} : { subtopic }),
  });

  if (values.force !== true && (await exists(out))) {
    throw new ContentError(`review sheet "${out}" already exists; pass --force to overwrite it`);
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, writeCsv(sheet.header, sheet.rows, { bom: true }), 'utf8');

  io.out(`Wrote ${sheet.rows.length} row(s) to ${out}`);
  io.out(
    `Selected: verified ${sheet.counts.verified}, draft ${sheet.counts.draft}, rejected ${sheet.counts.rejected}`,
  );
  io.out('Fill the decision column with approve, reject or fix; reject and fix need a note.');
  io.out(`Next: npm run content:promote -- --review ${relative(cwd, out)}`);
  return 0;
}

async function runPromote(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const reviewOption = stringValue(values.review);
  if (reviewOption === undefined || reviewOption.trim() === '') {
    throw new ContentError('promote requires --review <sheet.csv> from `content:review`');
  }
  const reviewPath = resolve(cwd, reviewOption);
  const subtopic = stringValue(values.subtopic);
  const at = stringValue(values.at) ?? new Date().toISOString();
  const dryRun = values['dry-run'] === true;

  const table = parseCsv(await readText(input, 'master'));
  const sheet = parseCsv(await readText(reviewPath, 'review sheet'));
  const summary = promote(table, sheet, { at, ...(subtopic === undefined ? {} : { subtopic }) });

  io.out(
    `Approved ${summary.approved}, rejected ${summary.rejected}, fix ${summary.fix.length}, ` +
      `pending ${summary.pending}${summary.ignored === 0 ? '' : `, ignored ${summary.ignored}`}`,
  );
  printReviewSubtopics(summary.perSubtopic, io.out);
  if (summary.fix.length > 0) {
    io.out('Fix queue:');
    for (const item of summary.fix) io.out(`  ${item.id}: ${item.note}`);
  }
  if (verbose) io.out(`Status changes: ${summary.changed}`);

  if (summary.changed === 0) {
    io.out('No status changed; the master was not written.');
    return 0;
  }
  if (dryRun) {
    io.out('Dry run: the master was not written.');
    return 0;
  }

  await writeAtomic(
    input,
    writeCsv(
      summary.table.header,
      summary.table.rows.map((row) => row.values),
    ),
  );
  const report = validateMaster(summary.table);
  io.out(`Wrote ${summary.changed} status change(s) to ${input}`);
  io.out(
    `Master now: verified ${report.counts.verified}, draft ${report.counts.draft}, rejected ${report.counts.rejected}`,
  );
  io.out(
    'Next: rebuild the signed pack with `npm run content:build` and commit the master, reviews and lock together.',
  );
  return 0;
}

function printReviewSubtopics(
  entries: Readonly<Record<string, { approved: number; rejected: number; fix: number; pending: number }>>,
  write: (message: string) => void,
): void {
  const names = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return;
  write('By subtopic:');
  for (const name of names) {
    const entry = entries[name]!;
    write(
      `  ${name}: approved ${entry.approved}, rejected ${entry.rejected}, ` +
        `fix ${entry.fix}, pending ${entry.pending}`,
    );
  }
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, text, 'utf8');
  await rename(temporary, path);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function runBuild(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const out = resolve(cwd, stringValue(values.out) ?? DEFAULTS.out);
  const lockPath = resolve(cwd, stringValue(values.lock) ?? DEFAULTS.lock);
  const keyOption = stringValue(values.key) ?? process.env.CGL_SIGNING_KEY;
  const urlBase = stringValue(values['url-base']) ?? process.env.CGL_PACK_URL_BASE;

  if (keyOption === undefined || keyOption.trim() === '') {
    throw new ContentError('pass --key <private.pem> or set CGL_SIGNING_KEY');
  }
  if (urlBase === undefined || urlBase.trim() === '') {
    throw new ContentError('pass --url-base <https://...> or set CGL_PACK_URL_BASE');
  }
  const keyPath = resolve(cwd, keyOption);

  const privateKeyPem = await readText(keyPath, 'private key');
  const generatedAt = stringValue(values['generated-at']) ?? new Date().toISOString();
  const table = parseCsv(await readText(input, 'master'));
  const lock = await readLock(lockPath);

  const result = buildContent(table, {
    generatedAt,
    packUrlBase: urlBase,
    lock,
    sign: (message) => signBytes(message, privateKeyPem),
  });

  await writeBuild(result, out);
  await writeLock(result.lock, lockPath);

  io.out(`Built ${result.packs.length} pack(s) from ${result.counts.verified} verified question(s).`);
  for (const pack of result.packs) {
    io.out(
      `  ${pack.entry.id} v${pack.entry.version}: ${pack.entry.count} question(s), ` +
        `${pack.entry.bytes} bytes, sha256 ${pack.entry.sha256.slice(0, 12)}…`,
    );
  }
  io.out(`  manifest v${result.manifest.version} → ${resolve(out, 'manifest.json')}`);
  io.out(`  lock → ${lockPath}`);
  printList('warning', result.warnings, verbose ? Number.POSITIVE_INFINITY : 10, io.err);

  return 0;
}

async function runKeygen(values: Values, io: CliIO, cwd: string): Promise<number> {
  const outDir = stringValue(values.out);
  if (outDir === undefined || outDir.trim() === '') {
    throw new ContentError('keygen requires --out <directory outside this repository>');
  }

  const absolute = resolve(cwd, outDir);
  if (isInside(absolute, resolve(cwd))) {
    throw new ContentError(
      'refusing to write a private key inside the repository; choose a directory outside it',
    );
  }

  const pair = generateSigningKeyPair();
  await mkdir(absolute, { recursive: true });
  const privatePath = resolve(absolute, 'ed25519-private.pem');
  const publicPath = resolve(absolute, 'ed25519-public.pem');
  await writeFile(privatePath, pair.privateKeyPem, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await writeFile(publicPath, pair.publicKeyPem, { encoding: 'utf8', flag: 'wx' });

  io.out(`Private key: ${privatePath}`);
  io.out(`Public key:  ${publicPath}`);
  io.out('Keep the private key offline and never commit it. The public key is safe to ship.');
  return 0;
}

async function readText(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new ContentError(`cannot read ${label} "${path}": ${asMessage(error)}`);
  }
}

function printSubtopics(
  subtopics: Readonly<Record<string, { verified: number; draft: number; rejected: number }>>,
  write: (message: string) => void,
): void {
  const entries = Object.entries(subtopics).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return;
  write('Subtopics:');
  for (const [name, counts] of entries) {
    write(`  ${name}: verified ${counts.verified}, draft ${counts.draft}, rejected ${counts.rejected}`);
  }
}

function printList(
  kind: 'error' | 'warning',
  items: readonly string[],
  limit: number,
  write: (message: string) => void,
): void {
  if (items.length === 0) return;
  const shown = Number.isFinite(limit) ? items.slice(0, limit) : items;
  write(`${kind === 'error' ? 'Errors' : 'Warnings'} (${items.length}):`);
  for (const item of shown) write(`  ${kind}: ${item}`);
  if (shown.length < items.length) {
    write(`  … ${items.length - shown.length} more; pass --verbose to see every one.`);
  }
}

function stringValue(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isInside(child: string, parent: string): boolean {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const invoked = process.argv[1];
if (invoked !== undefined && resolve(invoked) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
