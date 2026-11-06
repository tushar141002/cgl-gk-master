import type { AppDatabase, PackRow } from '../database';

/** Installed pack versions; used to skip a download the device already has. */
export class PackRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(id: string): Promise<PackRow | undefined> {
    return this.db.packs.get(id);
  }

  async put(pack: PackRow): Promise<void> {
    await this.db.packs.put(pack);
  }

  async all(): Promise<PackRow[]> {
    return this.db.packs.toArray();
  }
}
