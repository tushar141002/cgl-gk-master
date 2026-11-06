import { DEFAULT_SETTINGS, type Settings } from '../../../shared/contract';
import type { AppDatabase, SettingsRow } from '../database';

const ROW_ID = 'app';

/**
 * The single settings row. `ensure` is the only writer that creates it, so
 * first launch never races two defaults into the table.
 */
export class SettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(): Promise<Settings | undefined> {
    const row = await this.db.settings.get(ROW_ID);
    return row === undefined ? undefined : toSettings(row);
  }

  /** Creates the default row once; later calls report `created: false`. */
  async ensure(now: number = Date.now()): Promise<{ settings: Settings; created: boolean }> {
    return this.db.transaction('rw', this.db.settings, async () => {
      const existing = await this.db.settings.get(ROW_ID);
      if (existing !== undefined) {
        return { settings: toSettings(existing), created: false };
      }

      const row: SettingsRow = { id: ROW_ID, updatedAt: now, ...DEFAULT_SETTINGS };
      await this.db.settings.add(row);
      return { settings: toSettings(row), created: true };
    });
  }

  /**
   * Merges a patch and returns the stored result, so callers stay in sync.
   * The read and the write share one transaction: two quick changes (theme then
   * language) cannot overwrite each other.
   */
  async update(patch: Partial<Settings>, now: number = Date.now()): Promise<Settings> {
    return this.db.transaction('rw', this.db.settings, async () => {
      const existing = await this.db.settings.get(ROW_ID);
      const current = existing === undefined ? DEFAULT_SETTINGS : toSettings(existing);
      const next = merge(current, patch);
      await this.db.settings.put({ id: ROW_ID, updatedAt: now, ...next });
      return next;
    });
  }
}

function merge(current: Settings, patch: Partial<Settings>): Settings {
  return {
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
    dailyGoal: patch.dailyGoal ?? current.dailyGoal,
    examDate: patch.examDate === undefined ? current.examDate : patch.examDate,
    reminderTime: patch.reminderTime === undefined ? current.reminderTime : patch.reminderTime,
  };
}

function toSettings(row: SettingsRow): Settings {
  return {
    language: row.language,
    theme: row.theme,
    dailyGoal: row.dailyGoal,
    examDate: row.examDate,
    reminderTime: row.reminderTime,
  };
}
