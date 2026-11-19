/**
 * 同 IP 放行名單（`97-selfhosted-server.md` § 97.5「同 IP 同時在場」、§ 97.8）：名單上的 IP 不受同時在場上限。
 * `has` 每次進場都會查，讀記憶體快取；寫入同步更新快取。
 */
import type { DatabaseSync } from 'node:sqlite';
import { writeGateOf, type WriteGate } from './writeGate';

export interface IpAllowlistEntry {
  ip: string;
  note: string;
  addedAt: number;
}

export interface IpAllowlist {
  has(ip: string): boolean;
  list(): IpAllowlistEntry[];
  /** 已在名單上只更新備註 */
  add(ip: string, note: string, now: number): Promise<void>;
  /** 回傳是否有移除 */
  remove(ip: string): Promise<boolean>;
}

/** 測試與未接 SQLite 時用 */
export class MemoryIpAllowlist implements IpAllowlist {
  protected readonly entries = new Map<string, IpAllowlistEntry>();

  has(ip: string): boolean {
    return this.entries.has(ip);
  }

  list(): IpAllowlistEntry[] {
    return [...this.entries.values()].sort((a, b) => a.addedAt - b.addedAt);
  }

  async add(ip: string, note: string, now: number): Promise<void> {
    const prev = this.entries.get(ip);
    this.entries.set(ip, { ip, note, addedAt: prev?.addedAt ?? now });
  }

  async remove(ip: string): Promise<boolean> {
    return this.entries.delete(ip);
  }
}

export class SqliteIpAllowlist extends MemoryIpAllowlist {
  private readonly db: DatabaseSync;
  private readonly gate: WriteGate;

  constructor(db: DatabaseSync) {
    super();
    this.db = db;
    this.gate = writeGateOf(db);
    const rows = db.prepare('SELECT ip, note, added_at FROM ip_allowlist').all() as { ip: string; note: string; added_at: number }[];
    for (const r of rows) this.entries.set(r.ip, { ip: r.ip, note: r.note, addedAt: r.added_at });
  }

  override async add(ip: string, note: string, now: number): Promise<void> {
    await this.gate.write(() => {
      this.db.prepare(`INSERT INTO ip_allowlist (ip, note, added_at) VALUES (?, ?, ?)
        ON CONFLICT (ip) DO UPDATE SET note = excluded.note`).run(ip, note, now);
    });
    await super.add(ip, note, now);
  }

  override async remove(ip: string): Promise<boolean> {
    await this.gate.write(() => {
      this.db.prepare('DELETE FROM ip_allowlist WHERE ip = ?').run(ip);
    });
    return super.remove(ip);
  }
}
