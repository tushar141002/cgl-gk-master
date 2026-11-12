import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildContent, readLock, writeBuild, writeLock } from './build';
import { parseCsv, writeCsv } from './csv';
import { findDuplicateCandidates } from './dupes';
import { ContentError, validateMaster } from './master';
import { buildHindiSheet, buildReviewSheet, type ReviewStatus } from './review';
import { promote } from './promote';
import { generateSigningKeyPair, signBytes } from './signing';
import { auditSources, type SourceStatus } from './sources';

const DEFAULTS = {
  input: 'content/master/questions.csv',
  out: 'content/dist',
  lock: 'content/packs.lock.json',
} as const;

const USAGE = `CGL GK Master content pipeline

Usage:
  npm run content:validate -- [--input <file>] [--verbose]
  npm run content:review   -- [--status draft|verified|rejected|all] [--subtopic <slug>] [--lang en|hi] [--carry <old.csv>] [--out <file>] [--force]
  npm run content:promote  -- --review <sheet.csv> [--hindi <sheet.csv>] [--input <master>] [--subtopic <slug>] [--at <iso>] [--dry-run]
  npm run content:dupes    -- [--input <master>] [--threshold <0-1>] [--subtopic <slug>] [--include-rejected] [--out <file>] [--force]
  npm run content:sources  -- [--input <master>] [--status draft|verified|rejected|all] [--subtopic <slug>] [--out <file>] [--force]
  npm run content:build    -- --key <private.pem> --url-base <https://...> [options]
  npm run content:keygen   -- --out <directory outside this repository>

Options:
  --input <file>          Master CSV (default: ${DEFAULTS.input})
  --review <file>         Filled review sheet for \`promote\`
  --hindi <file>          Filled Hindi sheet; required for approvals
  --status <status>       Review or audit rows: draft, verified, rejected or all
  --lang <en|hi>          Review sheet language (default: en; hi covers all statuses)
  --carry <file>          Copy decisions from a previous sheet for unchanged rows
  --subtopic <slug>       Limit review, promotion or report to one sub-topic
  --out <dir|file>        Build output directory or review/report path
  --lock <file>           Pack lock file (default: ${DEFAULTS.lock})
  --key <file>            Ed25519 private key in PEM; or set CGL_SIGNING_KEY
  --url-base <url>        CDN base for pack URLs; or set CGL_PACK_URL_BASE
  --generated-at <iso>    Manifest timestamp, for reproducible builds
  --at <iso>              Verification timestamp for promoted rows (default: now)
  --threshold <0-1>       Duplicate-candidate Jaccard threshold (default: 0.55)
  --include-rejected      Include rejected rows in the duplicate report
  --force                 Overwrite an existing review or report file
  --dry-run               Report what \`promote\` would change without writing
  --verbose               Show every warning, error or report row
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
        hindi: { type: 'string' },
        carry: { type: 'string' },
        lang: { type: 'string' },
        status: { type: 'string' },
        subtopic: { type: 'string' },
        threshold: { type: 'string' },
        'include-rejected': { type: 'boolean', default: false },
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
      case 'dupes':
        return await runDupes(parsed.values, io, cwd, verbose);
      case 'sources':
        return await runSources(parsed.values, io, cwd, verbose);
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
  const lang = (stringValue(values.lang) ?? 'en').trim().toLowerCase();
  if (lang !== 'en' && lang !== 'hi') {
    throw new ContentError(`--lang must be en or hi (got "${lang}")`);
  }

  const status = (stringValue(values.status) ?? (lang === 'hi' ? 'all' : 'draft')) as ReviewStatus;
  const subtopic = stringValue(values.subtopic);
  const carryOption = stringValue(values.carry);
  const carry =
    carryOption === undefined
      ? undefined
      : parseCsv(await readText(resolve(cwd, carryOption), 'carry sheet'));

  const defaultOut =
    lang === 'hi'
      ? status === 'all'
        ? 'content/review/hindi-review.csv'
        : `content/review/hindi-${status}-review.csv`
      : `content/review/${status}-review.csv`;
  const out = resolve(cwd, stringValue(values.out) ?? defaultOut);

  const table = parseCsv(await readText(input, 'master'));
  const options = {
    status,
    ...(subtopic === undefined ? {} : { subtopic }),
    ...(carry === undefined ? {} : { carry }),
  };
  const sheet = lang === 'hi' ? buildHindiSheet(table, options) : buildReviewSheet(table, options);

  if (values.force !== true && (await exists(out))) {
    throw new ContentError(`review sheet "${out}" already exists; pass --force to overwrite it`);
  }

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, writeCsv(sheet.header, sheet.rows, { bom: true }), 'utf8');

  io.out(`Wrote ${sheet.rows.length} row(s) to ${out}`);
  io.out(
    `Selected: verified ${sheet.counts.verified}, draft ${sheet.counts.draft}, rejected ${sheet.counts.rejected}`,
  );
  if (carry !== undefined) {
    io.out(
      `Carried ${sheet.carried} decision(s); ${sheet.changed} row(s) changed since the old sheet; ` +
        `${sheet.dropped} dropped; ${sheet.added} new.`,
    );
  }
  if (lang === 'hi') {
    io.out('Fill hi_check with ok or fix; fix needs a hi_note. A blank check blocks approval.');
    io.out(`Next: npm run content:promote -- --review <en sheet> --hindi ${relative(cwd, out)}`);
  } else {
    io.out('Fill the decision column with approve, reject or fix; reject and fix need a note.');
    io.out(`Next: npm run content:review -- --lang hi --out content/review/hindi-review.csv`);
  }
  return 0;
}

async function runPromote(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const reviewOption = stringValue(values.review);
  if (reviewOption === undefined || reviewOption.trim() === '') {
    throw new ContentError('promote requires --review <sheet.csv> from `content:review`');
  }
  const reviewPath = resolve(cwd, reviewOption);
  const hindiOption = stringValue(values.hindi);
  const subtopic = stringValue(values.subtopic);
  const at = stringValue(values.at) ?? new Date().toISOString();
  const dryRun = values['dry-run'] === true;

  const table = parseCsv(await readText(input, 'master'));
  const sheet = parseCsv(await readText(reviewPath, 'review sheet'));
  const hindi =
    hindiOption === undefined
      ? undefined
      : parseCsv(await readText(resolve(cwd, hindiOption), 'Hindi sheet'));
  const summary = promote(table, sheet, {
    at,
    ...(subtopic === undefined ? {} : { subtopic }),
    ...(hindi === undefined ? {} : { hindi }),
  });

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

async function runDupes(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const thresholdText = stringValue(values.threshold);
  const threshold = thresholdText === undefined ? 0.55 : Number(thresholdText);
  const subtopic = stringValue(values.subtopic);
  const includeRejected = values['include-rejected'] === true;

  const table = parseCsv(await readText(input, 'master'));
  const candidates = findDuplicateCandidates(table, {
    threshold,
    ...(subtopic === undefined ? {} : { subtopic }),
    includeRejected,
  });

  io.out(`Duplicate candidates (Jaccard >= ${threshold}): ${candidates.length}`);
  const limit = verbose ? candidates.length : 20;
  for (const candidate of candidates.slice(0, limit)) {
    io.out(
      `${candidate.score.toFixed(2)}  ${candidate.leftId} (${candidate.leftStatus})  ~  ` +
        `${candidate.rightId} (${candidate.rightStatus})  answer ${candidate.answerScore.toFixed(2)}` +
        `${candidate.sameAnswer ? ' same' : ''}`,
    );
    io.out(`     ${candidate.leftQuestion}`);
    io.out(`     ${candidate.rightQuestion}`);
  }
  if (limit < candidates.length) {
    io.out(`  … ${candidates.length - limit} more; pass --verbose to see every one.`);
  }

  const outOption = stringValue(values.out);
  if (outOption !== undefined) {
    const header = [
      'score',
      'same_answer',
      'answer_score',
      'left_id',
      'left_status',
      'left_subtopic',
      'right_id',
      'right_status',
      'right_subtopic',
      'left_question',
      'right_question',
    ];
    const rows = candidates.map((candidate) => ({
      score: candidate.score.toFixed(2),
      same_answer: candidate.sameAnswer ? 'yes' : 'no',
      answer_score: candidate.answerScore.toFixed(2),
      left_id: candidate.leftId,
      left_status: candidate.leftStatus,
      left_subtopic: candidate.leftSubtopic,
      right_id: candidate.rightId,
      right_status: candidate.rightStatus,
      right_subtopic: candidate.rightSubtopic,
      left_question: candidate.leftQuestion,
      right_question: candidate.rightQuestion,
    }));
    const out = await writeReport(cwd, outOption, values.force === true, header, rows);
    io.out(`Wrote ${rows.length} candidate(s) to ${out}`);
  }
  return 0;
}

async function runSources(values: Values, io: CliIO, cwd: string, verbose: boolean): Promise<number> {
  const input = resolve(cwd, stringValue(values.input) ?? DEFAULTS.input);
  const status = (stringValue(values.status) ?? 'all') as SourceStatus;
  const subtopic = stringValue(values.subtopic);

  const table = parseCsv(await readText(input, 'master'));
  const audit = auditSources(table, {
    status,
    ...(subtopic === undefined ? {} : { subtopic }),
  });

  io.out(`Source audit: ${audit.scanned} row(s) checked, ${audit.rows.length} with issues.`);
  for (const [kind, count] of Object.entries(audit.counts)) {
    if (count > 0) io.out(`  ${kind}: ${count}`);
  }

  const limit = verbose ? audit.rows.length : 30;
  for (const issue of audit.rows.slice(0, limit)) {
    io.out(`  ${issue.id} (${issue.status}, ${issue.subtopic}): ${issue.issues.join('; ')}`);
  }
  if (limit < audit.rows.length) {
    io.out(`  … ${audit.rows.length - limit} more; pass --verbose to see every one.`);
  }

  const outOption = stringValue(values.out);
  if (outOption !== undefined) {
    const header = ['id', 'section', 'subtopic', 'status', 'source_url', 'source_ref', 'issues'];
    const rows = audit.rows.map((issue) => ({
      id: issue.id,
      section: issue.section,
      subtopic: issue.subtopic,
      status: issue.status,
      source_url: issue.sourceUrl,
      source_ref: issue.sourceRef,
      issues: issue.issues.join('; '),
    }));
    const out = await writeReport(cwd, outOption, values.force === true, header, rows);
    io.out(`Wrote ${rows.length} row(s) to ${out}`);
  }
  return 0;
}

async function writeReport(
  cwd: string,
  outOption: string,
  force: boolean,
  header: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
): Promise<string> {
  const out = resolve(cwd, outOption);
  if (!force && (await exists(out))) {
    throw new ContentError(`report "${out}" already exists; pass --force to overwrite it`);
  }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, writeCsv(header, rows, { bom: true }), 'utf8');
  return out;
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
