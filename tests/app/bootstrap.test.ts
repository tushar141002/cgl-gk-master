import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { bootstrap } from '../../src/app/bootstrap';
import type { AppDatabase } from '../../src/data/database';

const handles: AppDatabase[] = [];

afterEach(async () => {
  const [first] = handles;
  for (const handle of handles) {
    if (handle !== first) handle.close();
  }
  if (first !== undefined) await first.delete();
  handles.length = 0;
});

describe('bootstrap (F1)', () => {
  it('opens the database, creates defaults and mints a device id', async () => {
    const result = await bootstrap({
      dbName: `cgl-boot-${crypto.randomUUID()}`,
      now: 1_700_000_000_000,
      newDeviceId: () => 'device-test',
    });
    handles.push(result.db);

    expect(result.settingsCreated).toBe(true);
    expect(result.settings).toEqual({
      language: 'en',
      theme: 'light',
      dailyGoal: 10,
      examDate: null,
      reminderTime: null,
    });
    expect(result.deviceId).toBe('device-test');
    expect(await result.db.attempts.count()).toBe(0);
  });

  it('reuses the stored settings and device on the next launch', async () => {
    const dbName = `cgl-boot-${crypto.randomUUID()}`;
    const first = await bootstrap({ dbName, newDeviceId: () => 'device-first' });
    handles.push(first.db);

    const second = await bootstrap({ dbName, newDeviceId: () => 'device-second' });
    handles.push(second.db);

    expect(second.settingsCreated).toBe(false);
    expect(second.settings).toEqual(first.settings);
    expect(second.deviceId).toBe('device-first');
  });
});
