/**
 * 本服排行榜（`37-statistics.md` § 37.4）：收到請求時由 SQLite 即時計算，
 * 回每個欄位 top-N 的聯集（去重），同分序 `value DESC, uuid ASC`。
 */
import type { DatabaseSync } from 'node:sqlite';
import type { Character } from '../../client/src/models/character';
import type { LeaderboardSnapshotView } from '../../client/src/net/protocol';
import { LEADERBOARD_FIELDS, type LeaderboardField } from '../../client/src/services/leaderboardService';
import { normalizeStatistics, type CharacterStatistics } from '../../client/src/models/statistics';

export const LEADERBOARD_DEFAULT_TOP = 20;
export const LEADERBOARD_MAX_TOP = 100;

interface Row {
  uuid: string;
  name: string;
  className: string;
  level: number;
  stats: CharacterStatistics;
  contribution: number;
}

function valueOf(row: Row, field: LeaderboardField): number {
  if (field === 'character_level') return row.level;
  if (field === 'contribution') return row.contribution;
  return row.stats[field as keyof CharacterStatistics] ?? 0;
}

export function loadRows(db: DatabaseSync): Row[] {
  const chars = db.prepare('SELECT id, uuid, data FROM characters').all() as { id: number; uuid: string; data: string }[];
  const prefs = new Map<number, { statistics?: Partial<CharacterStatistics>; guildProgress?: { points?: number } }>();
  for (const p of db.prepare('SELECT character_id, data FROM character_prefs').all() as { character_id: number; data: string }[]) {
    try {
      prefs.set(p.character_id, JSON.parse(p.data));
    } catch {
      // 壞掉的偏好列不影響榜單，當成沒有統計
    }
  }
  return chars.map(c => {
    const data = JSON.parse(c.data) as Character;
    const pref = prefs.get(c.id);
    return {
      uuid: c.uuid,
      name: data.name,
      className: data.className,
      level: data.level ?? 0,
      stats: normalizeStatistics(pref?.statistics),
      contribution: pref?.guildProgress?.points ?? 0,
    };
  });
}

export function buildSnapshot(rows: Row[], top: number): LeaderboardSnapshotView {
  const limit = Math.min(LEADERBOARD_MAX_TOP, Math.max(1, top));
  const picked = new Set<string>();
  for (const field of LEADERBOARD_FIELDS) {
    const sorted = [...rows].sort((a, b) => (valueOf(b, field) - valueOf(a, field)) || (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
    for (const r of sorted.slice(0, limit)) picked.add(r.uuid);
  }
  const fields = ['character_id', 'character_name', 'class_name', 'updated_at', ...LEADERBOARD_FIELDS];
  const out = rows.filter(r => picked.has(r.uuid)).map(r => [
    r.uuid, r.name, r.className, '',
    ...LEADERBOARD_FIELDS.map(f => valueOf(r, f)),
  ]);
  return { top: limit, count: rows.length, fields, rows: out };
}

export function computeLeaderboard(db: DatabaseSync, top = LEADERBOARD_DEFAULT_TOP): LeaderboardSnapshotView {
  return buildSnapshot(loadRows(db), top);
}
