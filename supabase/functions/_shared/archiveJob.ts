import { encodeArchive, gzip, sha256Hex, type ArchivedAttempt } from './archiveCodec.ts';

/**
 * The nightly archive run (F9, D-027, D-091), with every side effect behind a
 * port so it runs in Node tests and in the Deno Edge function alike.
 *
 * Order matters: a file is uploaded before it is recorded, and attempts are
 * marked archived only by `record_archive`, in the same transaction as the
 * manifest row. A crash between upload and record leaves an unreferenced file
 * and an unarchived day, which the next run simply archives again under a new
 * name; nothing is lost and no file is ever rewritten.
 */

export interface PendingGroup {
  readonly userId: string;
  readonly day: string;
  readonly nextPart: number;
}

export interface ArchivePorts {
  pending(limit: number): Promise<readonly PendingGroup[]>;
  attempts(userId: string, day: string): Promise<readonly ArchivedAttempt[]>;
  /** Must refuse to overwrite: the path is new for every upload. */
  upload(path: string, data: Uint8Array): Promise<void>;
  record(input: {
    userId: string;
    day: string;
    part: number;
    path: string;
    attemptIds: readonly string[];
    bytes: number;
    sha256: string;
  }): Promise<void>;
  /** Top-level `users/<id>` folders in the bucket. */
  listUserFolders(): Promise<readonly string[]>;
  /** Of these ids, the ones whose account no longer exists. */
  orphans(userIds: readonly string[]): Promise<readonly string[]>;
  removeFolder(userId: string): Promise<number>;
  compact(): Promise<{ attemptsPruned: number; batchesPruned: number }>;
  log?(message: string): void;
}

export interface ArchiveSummary {
  readonly files: number;
  readonly attempts: number;
  readonly bytes: number;
  readonly failures: number;
  readonly orphanFolders: number;
  readonly orphanObjects: number;
  readonly attemptsPruned: number;
  readonly batchesPruned: number;
}

export interface ArchiveOptions {
  /** Groups per run; the rest wait for the next night. */
  readonly limit?: number;
}

export async function runArchive(ports: ArchivePorts, options: ArchiveOptions = {}): Promise<ArchiveSummary> {
  const log = (message: string): void => ports.log?.(message);
  let files = 0;
  let attempts = 0;
  let bytes = 0;
  let failures = 0;

  for (const group of await ports.pending(options.limit ?? 500)) {
    try {
      const rows = await ports.attempts(group.userId, group.day);
      if (rows.length === 0) continue;

      const data = await gzip(encodeArchive(rows));
      const sha256 = await sha256Hex(data);
      const path = archivePath(group.userId, group.day, group.nextPart, sha256);

      await ports.upload(path, data);
      await ports.record({
        userId: group.userId,
        day: group.day,
        part: group.nextPart,
        path,
        attemptIds: rows.map((row) => row.id),
        bytes: data.length,
        sha256,
      });

      files += 1;
      attempts += rows.length;
      bytes += data.length;
    } catch (error) {
      // One bad day must not stop the others; its attempts stay unarchived and
      // therefore unprunable until a later run succeeds.
      failures += 1;
      log(`archive failed for ${group.userId} ${group.day}: ${String(error)}`);
    }
  }

  // Finish account deletion (D-086): Postgres cannot remove Storage objects.
  const folders = await ports.listUserFolders();
  const orphans = folders.length === 0 ? [] : await ports.orphans(folders);
  let orphanObjects = 0;
  for (const userId of orphans) orphanObjects += await ports.removeFolder(userId);

  const pruned = await ports.compact();

  return {
    files,
    attempts,
    bytes,
    failures,
    orphanFolders: orphans.length,
    orphanObjects,
    attemptsPruned: pruned.attemptsPruned,
    batchesPruned: pruned.batchesPruned,
  };
}

/** `users/<id>/<yyyy-mm-dd>-<part>-<sha8>.cga.gz`: unique for every upload. */
export function archivePath(userId: string, day: string, part: number, sha256: string): string {
  return `users/${userId}/${day}-${part}-${sha256.slice(0, 8)}.cga.gz`;
}
