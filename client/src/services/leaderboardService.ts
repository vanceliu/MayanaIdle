/**
 * 排行榜的欄位定義與顯示（`37-statistics.md` § 37.4）。
 *
 * 榜單由本服 server 即時計算（`97-selfhosted-server.md` § 97.4），
 * 這裡只負責把回傳的 columnar snapshot 切成各榜的名次；沒有上傳，也沒有外部 API。
 */

/** 展開檢視需要 Top 20，故向 server 要求每個欄位的 top 20 */
export const SNAPSHOT_TOP = 20;

export type LeaderboardField =
  | 'character_level'
  | 'monstersKilled'
  | 'bossesKilled'
  | 'deathCount'
  | 'equipmentCrafted'
  | 'weaponEnhanceAttempts'
  | 'armorEnhanceAttempts'
  | 'weaponsBroken'
  | 'armorsBroken'
  | 'questsCompleted'
  | 'totalGoldEarned'
  | 'tier7WeaponsLooted'
  | 'tier7ArmorsLooted'
  | 'contribution';

export const LEADERBOARD_FIELDS: LeaderboardField[] = [
  'character_level', 'monstersKilled', 'bossesKilled', 'deathCount',
  'equipmentCrafted', 'weaponEnhanceAttempts', 'armorEnhanceAttempts',
  'weaponsBroken', 'armorsBroken', 'questsCompleted',
  'totalGoldEarned', 'tier7WeaponsLooted', 'tier7ArmorsLooted', 'contribution',
];

export const LEADERBOARD_LABELS: Record<LeaderboardField, string> = {
  character_level: '等級',
  monstersKilled: '殺敵數',
  bossesKilled: 'BOSS 討伐',
  deathCount: '死亡次數',
  equipmentCrafted: '製作裝備',
  weaponEnhanceAttempts: '武器強化',
  armorEnhanceAttempts: '防具強化',
  weaponsBroken: '武器爆掉',
  armorsBroken: '防具爆掉',
  questsCompleted: '任務完成',
  totalGoldEarned: '金幣總量',
  tier7WeaponsLooted: 'T7 武器掉落',
  tier7ArmorsLooted: 'T7 防具掉落',
  contribution: '任務貢獻度',
};

export type SnapshotValue = string | number | null;

/** 伺服端回傳的 columnar 格式：每個角色只出現一次 */
export interface LeaderboardSnapshot {
  top: number;
  count: number;
  fields: string[];
  rows: SnapshotValue[][];
}

export interface LeaderboardEntry {
  rank: number;
  character_id: string;
  character_name: string;
  /** 榜上顯示用：`名稱#xxxx`（§ 37.4.7）。名稱不唯一，同名靠這串區分 */
  display_name: string;
  class_name: string;
  value: number;
  updated_at: string;
}

/**
 * 榜上顯示名稱（§ 37.4.7）。**一律**加後綴，不做「只有衝突才加」——
 * 那會讓同一個人的顯示名隨著別人進榜而變動。
 */
export function toDisplayName(characterName: string, characterId: string): string {
  const suffix = characterId.replace(/-/g, '').slice(0, 4).toLowerCase();
  return suffix ? `${characterName}#${suffix}` : characterName;
}

/** columnar 的值可能是 null（該欄位沒有紀錄），排序前一律當 0 */
function toNumber(value: SnapshotValue): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function buildBoard(
  snapshot: LeaderboardSnapshot,
  field: LeaderboardField,
  limit: number,
): LeaderboardEntry[] {
  const idIdx = snapshot.fields.indexOf('character_id');
  const nameIdx = snapshot.fields.indexOf('character_name');
  const classIdx = snapshot.fields.indexOf('class_name');
  const updatedIdx = snapshot.fields.indexOf('updated_at');
  const valueIdx = snapshot.fields.indexOf(field);
  if (idIdx < 0 || valueIdx < 0) return [];

  return snapshot.rows
    .map(row => {
      const character_id = String(row[idIdx] ?? '');
      const character_name = String(row[nameIdx] ?? '');
      return {
        character_id,
        character_name,
        display_name: toDisplayName(character_name, character_id),
        class_name: String(row[classIdx] ?? ''),
        updated_at: String(row[updatedIdx] ?? ''),
        value: toNumber(row[valueIdx]),
      };
    })
    .sort((a, b) => (b.value - a.value) || a.character_id.localeCompare(b.character_id))
    .slice(0, limit)
    .map((entry, i) => ({ rank: i + 1, ...entry }));
}

// ---------------------------------------------------------------------------
// 統計上傳
// ---------------------------------------------------------------------------

/**
 * 即使數值完全沒變，仍每 24 小時強制上傳一次。
 * 純粹靠「數值有變才上傳」會有一個死角：若伺服端資料遺失（清庫、重建），
 * 客戶端會誤以為早就同步過而永遠不再送出，該角色就此從排行榜消失。
 */
