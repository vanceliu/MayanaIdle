/**
 * 懸賞契約（`53-bounty-contract.md`）。
 *
 * 契約對象一律以區域 id ＋怪物名稱指涉，與冒險任務的判定相同（`36-quest-system.md` § 36.11）。
 * 價格不存契約內，由 `priceLevel` 查表（§ 53.2）。
 */
import { MONSTER_SEEDS } from '../db/seed/monsterSeeds';
import { AREA_POOLS, TOWN_BOSS_POOLS, TOWN_MONSTER_POOLS, type QuestTownId } from './adventurerQuest';
import { resolveArea } from './mapData';

export type BountyKind = 'monster' | 'boss';

export interface BountyContract {
  id: string;
  kind: BountyKind;
  /** 契約區域；Boss 契約為 Boss 所在區域 */
  areaId: string;
  monsterName: string;
  targetKills: number;
  priceLevel: number;
}

export interface SignedBounty extends BountyContract {
  kills: number;
  takeBetter: boolean;
}

export interface BountyBoard {
  /** 固定 5 格：前 4 格普通怪、最後 1 格 Boss；簽走的格子為 null */
  slots: (BountyContract | null)[];
  generatedAt: number;
}

export type BountyBoards = Partial<Record<QuestTownId, BountyBoard>>;

/** § 53.1 */
export const BOUNTY_MONSTER_SLOTS = 4;
export const BOUNTY_BOSS_SLOTS = 1;
export const BOUNTY_MONSTER_KILLS = { min: 50, max: 100 };
export const BOUNTY_BOSS_KILLS = { min: 20, max: 30 };
export const BOUNTY_MIN_PRICE_LEVEL = 30;
/** § 53.3 */
export const MAX_SIGNED_BOUNTIES = 3;
/** § 53.4：server 當地時間 */
export const BOUNTY_REFRESH_HOURS = [0, 6, 12, 18] as const;

/** § 53.2：依定價等級由高往低比對 */
const BOUNTY_PRICE_TABLE: { minLevel: number; base: number; takeBetter: number }[] = [
  { minLevel: 60, base: 70_000, takeBetter: 500_000 },
  { minLevel: 50, base: 60_000, takeBetter: 400_000 },
  { minLevel: 40, base: 50_000, takeBetter: 300_000 },
  { minLevel: 30, base: 30_000, takeBetter: 200_000 },
];

export function getBountyPrice(priceLevel: number): { base: number; takeBetter: number } | null {
  const row = BOUNTY_PRICE_TABLE.find(r => priceLevel >= r.minLevel);
  return row ? { base: row.base, takeBetter: row.takeBetter } : null;
}

export function getBountyTotalPrice(priceLevel: number, takeBetter: boolean): number | null {
  const price = getBountyPrice(priceLevel);
  if (!price) return null;
  return price.base + (takeBetter ? price.takeBetter : 0);
}

/** 不晚於 `now` 的最近一個更新時刻（毫秒） */
export function latestBountyRefreshAt(now: number): number {
  const d = new Date(now);
  const hour = [...BOUNTY_REFRESH_HOURS].reverse().find(h => h <= d.getHours()) ?? 0;
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** `now` 之後的下一個更新時刻（毫秒） */
export function nextBountyRefreshAt(now: number): number {
  const d = new Date(now);
  const hour = BOUNTY_REFRESH_HOURS.find(h => h > d.getHours());
  if (hour === undefined) {
    d.setDate(d.getDate() + 1);
    d.setHours(BOUNTY_REFRESH_HOURS[0], 0, 0, 0);
  } else {
    d.setHours(hour, 0, 0, 0);
  }
  return d.getTime();
}

export function isBountyBoardStale(board: BountyBoard | undefined, now: number): boolean {
  return !board || board.generatedAt < latestBountyRefreshAt(now);
}

interface BountyCandidate {
  areaId: string;
  monsterName: string;
  priceLevel: number;
}

const BOSS_LEVELS = new Map(MONSTER_SEEDS.filter(m => m.isBoss).map(m => [m.name, m.level]));

/** § 53.1：區域最低等級 ≥ 30 的普通怪（區域＋名稱去重） */
export function getBountyMonsterCandidates(town: QuestTownId): BountyCandidate[] {
  const seen = new Set<string>();
  const result: BountyCandidate[] = [];
  for (const entries of Object.values(TOWN_MONSTER_POOLS[town])) {
    for (const m of entries ?? []) {
      const levelMin = resolveArea(m.questArea)?.levelMin;
      if (levelMin === undefined || levelMin < BOUNTY_MIN_PRICE_LEVEL) continue;
      const key = `${m.questArea}|${m.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ areaId: m.questArea, monsterName: m.name, priceLevel: levelMin });
    }
  }
  return result;
}

/** § 53.1：Boss 等級 ≥ 30 */
export function getBountyBossCandidates(town: QuestTownId): BountyCandidate[] {
  const seen = new Set<string>();
  const result: BountyCandidate[] = [];
  for (const entries of Object.values(TOWN_BOSS_POOLS[town])) {
    for (const b of entries ?? []) {
      const level = BOSS_LEVELS.get(b.name);
      if (level === undefined || level < BOUNTY_MIN_PRICE_LEVEL || seen.has(b.name)) continue;
      seen.add(b.name);
      result.push({ areaId: b.area, monsterName: b.name, priceLevel: level });
    }
  }
  return result;
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

let bountyIdSeq = 0;

function drawContract(kind: BountyKind, candidates: BountyCandidate[], rng: () => number, now: number): BountyContract | null {
  if (candidates.length === 0) return null;
  const c = candidates[Math.floor(rng() * candidates.length)];
  const range = kind === 'boss' ? BOUNTY_BOSS_KILLS : BOUNTY_MONSTER_KILLS;
  return {
    id: `bounty-${now}-${++bountyIdSeq}`,
    kind,
    areaId: c.areaId,
    monsterName: c.monsterName,
    targetKills: randomInt(range.min, range.max, rng),
    priceLevel: c.priceLevel,
  };
}

export function generateBountyBoard(town: QuestTownId, rng: () => number, now: number): BountyBoard {
  const monsters = getBountyMonsterCandidates(town);
  const bosses = getBountyBossCandidates(town);
  const slots: (BountyContract | null)[] = [];
  for (let i = 0; i < BOUNTY_MONSTER_SLOTS; i++) slots.push(drawContract('monster', monsters, rng, now));
  for (let i = 0; i < BOUNTY_BOSS_SLOTS; i++) slots.push(drawContract('boss', bosses, rng, now));
  return { slots, generatedAt: now };
}

/** § 53.3「同對象」 */
export function isSameBountyTarget(a: BountyContract, b: BountyContract): boolean {
  if (a.kind !== b.kind || a.monsterName !== b.monsterName) return false;
  return a.kind === 'boss' || a.areaId === b.areaId;
}

export type BountySignBlock = 'gold' | 'limit' | 'duplicate';

export const BOUNTY_SIGN_BLOCK_TEXT: Record<BountySignBlock, string> = {
  gold: '金幣不足',
  limit: `已簽 ${MAX_SIGNED_BOUNTIES} 張`,
  duplicate: '已有相同對象的契約',
};

export function getBountySignBlock(
  contract: BountyContract,
  takeBetter: boolean,
  signed: SignedBounty[],
  gold: number,
): BountySignBlock | null {
  const total = getBountyTotalPrice(contract.priceLevel, takeBetter);
  if (total === null || gold < total) return 'gold';
  if (signed.length >= MAX_SIGNED_BOUNTIES) return 'limit';
  if (signed.some(s => isSameBountyTarget(s, contract))) return 'duplicate';
  return null;
}

/** § 53.5.2 */
export function isBountyTarget(contract: BountyContract, areaId: string, monsterName: string, isBoss: boolean): boolean {
  if (contract.monsterName !== monsterName) return false;
  if (contract.kind === 'boss') return isBoss;
  return !isBoss && contract.areaId === areaId;
}

export function findBountyFor(signed: SignedBounty[], areaId: string, monsterName: string, isBoss: boolean): SignedBounty | undefined {
  return signed.find(s => isBountyTarget(s, areaId, monsterName, isBoss));
}

/** § 53.5.4：擊殺 +1，達標的契約移除並回傳 */
export function recordBountyKill(
  signed: SignedBounty[],
  areaId: string,
  monsterName: string,
  isBoss: boolean,
): { signed: SignedBounty[]; completed: SignedBounty[] } {
  const target = findBountyFor(signed, areaId, monsterName, isBoss);
  if (!target) return { signed, completed: [] };
  const kills = target.kills + 1;
  if (kills >= target.targetKills) {
    return { signed: signed.filter(s => s.id !== target.id), completed: [{ ...target, kills }] };
  }
  return { signed: signed.map(s => (s.id === target.id ? { ...s, kills } : s)), completed: [] };
}

const AREA_NAMES = new Map(Object.values(AREA_POOLS).flat().map(e => [e.areaId, e.areaName]));

export function getBountyAreaName(areaId: string): string {
  return AREA_NAMES.get(areaId) ?? resolveArea(areaId)?.region.name ?? areaId;
}
