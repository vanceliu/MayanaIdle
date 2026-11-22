import type { Character } from '../models/character';
import type { RegionType } from '../models/area';
import type { Mail } from '../models/mailbox';

/** 離線金幣（`04-character.md` § 4.12） */
export const OFFLINE_GOLD_CAP_MS = 24 * 60 * 60 * 1000;
export const OFFLINE_GOLD_RATIO = 0.5;
/** 未滿此離線時長不結算，狩獵累計保留 */
export const OFFLINE_GOLD_MIN_OFFLINE_MS = 10 * 60 * 1000;

/** 狩獵時長的判定：野外或副本，且搜尋模式為自動 */
export function isHunting(regionType: RegionType | undefined, searchMode: 'auto' | 'manual'): boolean {
  return (regionType === 'field' || regionType === 'dungeon') && searchMode === 'auto';
}

export function addHuntTime(char: Character, deltaMs: number): Character {
  if (deltaMs <= 0) return char;
  return { ...char, huntMs: (char.huntMs ?? 0) + deltaMs };
}

export function addHuntGold(char: Character, gold: number): Character {
  if (gold <= 0) return char;
  return { ...char, huntGold: (char.huntGold ?? 0) + gold };
}

export function offlineGoldMailKey(lastSeenAt: number): string {
  return `offline-gold-${lastSeenAt}`;
}

function formatOfflineDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  return `${Math.floor(totalMinutes / 60)} 小時 ${totalMinutes % 60} 分`;
}

export interface OfflineGoldSettlement {
  /** 狩獵累計已依結算結果處理的角色；`lastSeenAt` 不動，由 `accrueRestedExp` 更新 */
  char: Character;
  /** 要寄出的信；不寄時為 null */
  mail: Mail | null;
}

/** 上線時結算離線金幣 */
export function settleOfflineGold(char: Character, now: number): OfflineGoldSettlement {
  const lastSeenAt = char.lastSeenAt;
  if (lastSeenAt == null) return { char, mail: null };

  const offlineMs = now - lastSeenAt;
  if (offlineMs < OFFLINE_GOLD_MIN_OFFLINE_MS) return { char, mail: null };

  const huntGold = char.huntGold ?? 0;
  const huntMs = char.huntMs ?? 0;
  const countedMs = Math.min(offlineMs, OFFLINE_GOLD_CAP_MS);
  const gold = huntMs > 0 ? Math.floor((huntGold / huntMs) * countedMs * OFFLINE_GOLD_RATIO) : 0;
  const reset = { ...char, huntGold: 0, huntMs: 0 };
  if (gold <= 0 || char.id == null) return { char: reset, mail: null };

  return {
    char: reset,
    mail: {
      characterId: char.id,
      sourceKey: offlineGoldMailKey(lastSeenAt),
      title: `離線收益（離線 ${formatOfflineDuration(countedMs)}）`,
      items: [{ type: 'gold', amount: gold }],
      createdAt: now,
      claimedAt: null,
    },
  };
}
