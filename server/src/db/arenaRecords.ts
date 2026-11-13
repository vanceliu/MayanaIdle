/**
 * 競技場排行榜（`55-arena.md` § 55.7）：每個角色在每個段位 × 單人／組隊只留最佳紀錄。
 * 排序：波次高者在前，同波次時間短者在前。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { ArenaExitRecord } from '../../../client/src/systems/arenaRun';
import type { ArenaRankingRow, ArenaRankingQuery } from '../../../client/src/net/protocol';
import { writeGateOf, type WriteGate } from './writeGate';

export interface ArenaRecordStorage {
  save(record: ArenaExitRecord, achievedAt: number): Promise<void>;
  top(query: ArenaRankingQuery, limit: number): ArenaRankingRow[];
}

function better(a: { wave: number; timeMs: number }, b: { wave: number; timeMs: number }): boolean {
  return a.wave > b.wave || (a.wave === b.wave && a.timeMs < b.timeMs);
}

export class SqliteArenaRecords implements ArenaRecordStorage {
  private readonly db: DatabaseSync;
  private readonly gate: WriteGate;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.gate = writeGateOf(db);
  }

  save(record: ArenaExitRecord, achievedAt: number): Promise<void> {
    return this.gate.write(() => {
      const party = record.party ? 1 : 0;
      const prev = this.db.prepare('SELECT wave, time_ms FROM arena_records WHERE character_id = ? AND tier = ? AND party = ?')
        .get(record.characterId, record.tier, party) as { wave: number; time_ms: number } | undefined;
      if (prev && !better(record, { wave: prev.wave, timeMs: prev.time_ms })) return;
      this.db.prepare(`INSERT INTO arena_records (character_id, tier, party, name, class_name, wave, time_ms, achieved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (character_id, tier, party) DO UPDATE SET
          name = excluded.name, class_name = excluded.class_name, wave = excluded.wave,
          time_ms = excluded.time_ms, achieved_at = excluded.achieved_at`)
        .run(record.characterId, record.tier, party, record.name, record.className, record.wave, record.timeMs, achievedAt);
    });
  }

  top(query: ArenaRankingQuery, limit: number): ArenaRankingRow[] {
    const rows = this.db.prepare(`SELECT name, class_name, wave, time_ms FROM arena_records
      WHERE tier = ? AND party = ? AND (? IS NULL OR class_name = ?)
      ORDER BY wave DESC, time_ms ASC, achieved_at ASC LIMIT ?`)
      .all(query.tier, query.party ? 1 : 0, query.className ?? null, query.className ?? null, limit) as
      { name: string; class_name: string; wave: number; time_ms: number }[];
    return rows.map(r => ({ name: r.name, className: r.class_name, wave: r.wave, timeMs: r.time_ms }));
  }
}

/** 測試與未接 SQLite 時用 */
export class MemoryArenaRecords implements ArenaRecordStorage {
  private readonly rows = new Map<string, ArenaExitRecord & { achievedAt: number }>();

  async save(record: ArenaExitRecord, achievedAt: number): Promise<void> {
    const key = `${record.characterId}|${record.tier}|${record.party ? 1 : 0}`;
    const prev = this.rows.get(key);
    if (prev && !better(record, prev)) return;
    this.rows.set(key, { ...record, achievedAt });
  }

  top(query: ArenaRankingQuery, limit: number): ArenaRankingRow[] {
    return [...this.rows.values()]
      .filter(r => r.tier === query.tier && r.party === query.party && (!query.className || r.className === query.className))
      .sort((a, b) => b.wave - a.wave || a.timeMs - b.timeMs || a.achievedAt - b.achievedAt)
      .slice(0, limit)
      .map(r => ({ name: r.name, className: r.className, wave: r.wave, timeMs: r.timeMs }));
  }
}
