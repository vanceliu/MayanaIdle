/**
 * 排行榜服務
 * 規格見 `docs/design/37-statistics.md` § 37.4
 *
 * 核心設計：整個統計中心只打一支 GET /api/snapshot，14 個榜單全部在本地由同一份
 * snapshot 排序切片；snapshot 以 localStorage 快取 10 分鐘，期間內完全不打 API。
 */

import { getTurnstileToken } from './turnstile';
import { CURRENT_DATA_VERSION } from '../config';

const LEADERBOARD_API = 'https://leaderboard-api.westwind3122.workers.dev';

const SNAPSHOT_CACHE_KEY = 'mayana_leaderboard_snapshot';
const UPLOAD_STAMP_PREFIX = 'mayana_stats_upload_';

/** § 37.4.4：10 分鐘內不重複請求 */
export const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
/** 展開檢視需要 Top 20，故向伺服端要求每個欄位的 top 20 */
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

export interface CharacterStatsPayload {
  character_id: string;
  /** 名稱不唯一，每次上傳都更新（伺服端仍驗格式） */
  character_name: string;
  /** 該角色的寫入密鑰。伺服端只存 SHA-256，首次寫入即綁定（§ 37.4.3） */
  auth_token: string;
  class_name: string;
  character_level: number;
  monstersKilled: number;
  bossesKilled: number;
  deathCount: number;
  equipmentCrafted: number;
  weaponEnhanceAttempts: number;
  armorEnhanceAttempts: number;
  weaponsBroken: number;
  armorsBroken: number;
  questsCompleted: number;
  totalGoldEarned: number;
  tier7WeaponsLooted: number;
  tier7ArmorsLooted: number;
  contribution: number;
}

export type LeaderboardErrorCode =
  | 'network'
  | 'invalid_name'
  /** 客戶端資料版本落後（多半是快取到舊 bundle），伺服端拒絕寫入 */
  | 'outdated_client'
  | 'turnstile'
  /** 密鑰錯誤或缺漏 —— 該角色無法寫入或刪除自己的線上紀錄 */
  | 'invalid_auth_token'
  | 'server';

export class LeaderboardError extends Error {
  code: LeaderboardErrorCode;

  constructor(code: LeaderboardErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'LeaderboardError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// localStorage 存取（無痕模式 / 配額滿時不可讓整個統計中心壞掉）
// ---------------------------------------------------------------------------

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略：快取失效只會多打一次 API */
  }
}

interface CachedSnapshot {
  fetchedAt: number;
  snapshot: LeaderboardSnapshot;
}

function isSnapshot(value: unknown): value is LeaderboardSnapshot {
  const s = value as LeaderboardSnapshot | null;
  return !!s && Array.isArray(s.fields) && Array.isArray(s.rows);
}

/** 讀取仍在 TTL 內的快取；過期或不存在回傳 null */
export function readCachedSnapshot(now = Date.now()): LeaderboardSnapshot | null {
  const raw = readStorage(SNAPSHOT_CACHE_KEY);
  if (!raw) return null;
  try {
    const cached = JSON.parse(raw) as CachedSnapshot;
    if (typeof cached?.fetchedAt !== 'number' || !isSnapshot(cached.snapshot)) return null;
    if (now - cached.fetchedAt >= SNAPSHOT_TTL_MS) return null;
    return cached.snapshot;
  } catch {
    return null;
  }
}

function writeCachedSnapshot(snapshot: LeaderboardSnapshot, now = Date.now()): void {
  writeStorage(SNAPSHOT_CACHE_KEY, JSON.stringify({ fetchedAt: now, snapshot } satisfies CachedSnapshot));
}

export function clearSnapshotCache(): void {
  try {
    localStorage.removeItem(SNAPSHOT_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// snapshot 取得與榜單計算
// ---------------------------------------------------------------------------

/**
 * 取得 snapshot。快取新鮮時直接回傳、完全不發請求（§ 37.4.4）。
 */
export async function fetchSnapshot(options: { force?: boolean; now?: number } = {}): Promise<LeaderboardSnapshot> {
  const now = options.now ?? Date.now();
  if (!options.force) {
    const cached = readCachedSnapshot(now);
    if (cached) return cached;
  }

  let res: Response;
  try {
    res = await fetch(`${LEADERBOARD_API}/api/snapshot?top=${SNAPSHOT_TOP}`);
  } catch {
    throw new LeaderboardError('network');
  }
  if (!res.ok) throw new LeaderboardError('server', `snapshot ${res.status}`);

  const snapshot = (await res.json()) as LeaderboardSnapshot;
  if (!isSnapshot(snapshot)) throw new LeaderboardError('server', 'malformed snapshot');

  writeCachedSnapshot(snapshot, now);
  return snapshot;
}

function toNumber(value: SnapshotValue): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 由 snapshot 切出單一欄位的榜單（純函式，不碰網路）。
 *
 * 排序必須與伺服端一致：值由大到小，同分時 character_id 由小到大。
 * 伺服端已保證 snapshot 內含該欄位的真實 top-N，故此處切出的結果等同全球真實榜單。
 */
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
const FORCE_UPLOAD_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UploadStamp {
  at: number;
  /** 上次成功上傳的數值指紋 */
  sig: string;
}

/**
 * 數值指紋：排除 character_id（不會變）與 auth_token（機密且不變），
 * 其餘欄位依固定順序串接。名稱納入指紋 —— 匯入還原可能改名，改了就要重送。
 */
function statsSignature(payload: CharacterStatsPayload): string {
  return [
    payload.character_name,
    payload.class_name,
    payload.character_level,
    ...STAT_FIELD_ORDER.map(f => payload[f]),
  ].join('|');
}

const STAT_FIELD_ORDER = [
  'monstersKilled', 'bossesKilled', 'deathCount', 'equipmentCrafted',
  'weaponEnhanceAttempts', 'armorEnhanceAttempts', 'weaponsBroken',
  'armorsBroken', 'questsCompleted', 'totalGoldEarned',
  'tier7WeaponsLooted', 'tier7ArmorsLooted', 'contribution',
] as const satisfies readonly (keyof CharacterStatsPayload)[];

function readUploadStamp(characterUuid: string): UploadStamp | null {
  const raw = readStorage(`${UPLOAD_STAMP_PREFIX}${characterUuid}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as UploadStamp;
    if (typeof parsed?.at !== 'number' || typeof parsed?.sig !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 是否需要上傳統計。三個條件依序判定：
 * 1. 從未上傳過 → 要
 * 2. 距離上次上傳未滿 10 分鐘 → 不要（與 snapshot 同一個節流週期）
 * 3. 數值與上次上傳完全相同且未滿 24 小時 → 不要
 *
 * 條件 3 是放置型遊戲的主要省流量來源：掛在城鎮、只是來看榜的玩家不會產生任何寫入。
 */
export function shouldUploadStats(
  characterUuid: string,
  payload: CharacterStatsPayload,
  now = Date.now(),
): boolean {
  const stamp = readUploadStamp(characterUuid);
  if (!stamp) return true;
  if (now - stamp.at < SNAPSHOT_TTL_MS) return false;
  if (stamp.sig !== statsSignature(payload)) return true;
  return now - stamp.at >= FORCE_UPLOAD_INTERVAL_MS;
}

export function markStatsUploaded(
  characterUuid: string,
  payload: CharacterStatsPayload,
  now = Date.now(),
): void {
  writeStorage(
    `${UPLOAD_STAMP_PREFIX}${characterUuid}`,
    JSON.stringify({ at: now, sig: statsSignature(payload) } satisfies UploadStamp),
  );
}

/**
 * upsert 自己的統計（§ 37.4.3）。首次上傳直接建列並綁定 `auth_token` 的 SHA-256（TOFU），
 * 之後密鑰不符即 403 —— 這是「別人不能覆寫你的排行榜資料」的唯一防線。
 */
export async function uploadStats(payload: CharacterStatsPayload): Promise<void> {
  const turnstile_token = await getTurnstileToken().catch(() => {
    throw new LeaderboardError('turnstile');
  });

  let res: Response;
  try {
    res = await fetch(`${LEADERBOARD_API}/api/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, data_version: CURRENT_DATA_VERSION, turnstile_token }),
    });
  } catch {
    throw new LeaderboardError('network');
  }

  if (res.ok) return;

  const body = await res.json().catch(() => ({}) as { error?: string });
  if (res.status === 409) throw new LeaderboardError('outdated_client');
  // 403 有兩種：Turnstile 沒過，或密鑰不符（有人拿公開的 uuid 想覆寫他人資料）
  if (body.error === 'invalid_auth_token' || body.error === 'auth_token_required') {
    throw new LeaderboardError('invalid_auth_token');
  }
  if (res.status === 400 && body.error === 'invalid_name') throw new LeaderboardError('invalid_name');
  if (res.status === 403) throw new LeaderboardError('turnstile');
  throw new LeaderboardError('server', body.error ?? `stats ${res.status}`);
}
