import { describe, expect, it } from 'vitest';
import { decodeArchive, gunzip, type ArchivedAttempt } from '../../supabase/functions/_shared/archiveCodec';
import {
  archivePath,
  runArchive,
  type ArchivePorts,
  type PendingGroup,
} from '../../supabase/functions/_shared/archiveJob';

function attempt(id: string, at: number): ArchivedAttempt {
  return { id, qid: 'q-1', qv: 1, chosen: 1, correct: true, ms: 2000, mode: 'practice', at, deviceId: 'd-1' };
}

class FakePorts implements ArchivePorts {
  groups: PendingGroup[] = [];
  rows = new Map<string, ArchivedAttempt[]>();
  storage = new Map<string, Uint8Array>();
  recorded: Parameters<ArchivePorts['record']>[0][] = [];
  existingUsers = new Set<string>();
  failRecordFor: string | null = null;
  steps: string[] = [];
  logs: string[] = [];

  async pending(): Promise<readonly PendingGroup[]> {
    return this.groups;
  }
  async attempts(userId: string, day: string): Promise<readonly ArchivedAttempt[]> {
    return this.rows.get(`${userId}/${day}`) ?? [];
  }
  async upload(path: string, data: Uint8Array): Promise<void> {
    if (this.storage.has(path)) throw new Error('exists');
    this.steps.push(`upload ${path}`);
    this.storage.set(path, data);
  }
  async record(input: Parameters<ArchivePorts['record']>[0]): Promise<void> {
    if (input.userId === this.failRecordFor) throw new Error('db down');
    this.steps.push(`record ${input.path}`);
    this.recorded.push(input);
  }
  async listUserFolders(): Promise<readonly string[]> {
    return [...new Set([...this.storage.keys()].map((path) => path.split('/')[1]!))];
  }
  async orphans(userIds: readonly string[]): Promise<readonly string[]> {
    return userIds.filter((id) => !this.existingUsers.has(id));
  }
  async removeFolder(userId: string): Promise<number> {
    const paths = [...this.storage.keys()].filter((path) => path.startsWith(`users/${userId}/`));
    for (const path of paths) this.storage.delete(path);
    return paths.length;
  }
  async compact(): Promise<{ attemptsPruned: number; batchesPruned: number }> {
    this.steps.push('compact');
    return { attemptsPruned: 7, batchesPruned: 2 };
  }
  log(message: string): void {
    this.logs.push(message);
  }
}

describe('runArchive', () => {
  it('uploads one gzipped file per group, records it, then compacts', async () => {
    const ports = new FakePorts();
    ports.existingUsers.add('u-1');
    ports.groups = [{ userId: 'u-1', day: '2026-11-10', nextPart: 1 }];
    ports.rows.set('u-1/2026-11-10', [attempt('a-2', 200), attempt('a-1', 100)]);

    const summary = await runArchive(ports);

    expect(summary).toMatchObject({
      files: 1,
      attempts: 2,
      failures: 0,
      attemptsPruned: 7,
      batchesPruned: 2,
    });
    const [record] = ports.recorded;
    expect(record).toMatchObject({ userId: 'u-1', day: '2026-11-10', part: 1, attemptIds: ['a-2', 'a-1'] });
    expect(record!.path).toBe(archivePath('u-1', '2026-11-10', 1, record!.sha256));
    expect(ports.steps).toEqual([`upload ${record!.path}`, `record ${record!.path}`, 'compact']);

    const stored = ports.storage.get(record!.path)!;
    expect(record!.bytes).toBe(stored.length);
    expect(decodeArchive(await gunzip(stored)).map((a) => a.id)).toEqual(['a-1', 'a-2']);
  });

  it('keeps going after one group fails and still compacts', async () => {
    const ports = new FakePorts();
    ports.existingUsers.add('u-1').add('u-2');
    ports.failRecordFor = 'u-1';
    ports.groups = [
      { userId: 'u-1', day: '2026-11-10', nextPart: 1 },
      { userId: 'u-2', day: '2026-11-10', nextPart: 1 },
    ];
    ports.rows.set('u-1/2026-11-10', [attempt('a-1', 100)]);
    ports.rows.set('u-2/2026-11-10', [attempt('b-1', 100)]);

    const summary = await runArchive(ports);

    expect(summary).toMatchObject({ files: 1, failures: 1 });
    expect(ports.logs[0]).toContain('u-1 2026-11-10');
    expect(ports.steps.at(-1)).toBe('compact');
  });

  it('removes the Storage folders of deleted accounts', async () => {
    const ports = new FakePorts();
    ports.existingUsers.add('kept');
    ports.storage.set('users/kept/2026-11-01-1-aaaa.cga.gz', new Uint8Array([1]));
    ports.storage.set('users/gone/2026-11-01-1-bbbb.cga.gz', new Uint8Array([1]));
    ports.storage.set('users/gone/2026-11-02-1-cccc.cga.gz', new Uint8Array([1]));

    const summary = await runArchive(ports);

    expect(summary).toMatchObject({ orphanFolders: 1, orphanObjects: 2 });
    expect([...ports.storage.keys()]).toEqual(['users/kept/2026-11-01-1-aaaa.cga.gz']);
  });

  it('names a different file when the same day is retried with different content', () => {
    expect(archivePath('u', '2026-11-10', 1, 'a'.repeat(64))).not.toBe(
      archivePath('u', '2026-11-10', 1, 'b'.repeat(64)),
    );
  });
});
