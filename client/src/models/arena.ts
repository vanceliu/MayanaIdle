/**
 * 競技場（`55-arena.md`）：段位、入場條件、波次、怪物池、王順序、票券場時段。
 */
import { MONSTER_SEEDS } from '../db/seed';
import { getItemId } from './items';
import type { MonsterTemplate } from './monster';

export type ArenaTier = 4 | 5 | 6 | 7;

export const ARENA_REGION_ID = 'arena';
export const ARENA_MAX_WAVE = 100;
export const ARENA_BOSS_WAVE_INTERVAL = 10;
export const ARENA_MATERIAL_COST = 5;
export const ARENA_MAX_WAVE_MONSTERS = 10;
const NORMAL_WAVE_SIZE = 3;
const BOSS_WAVE_SIZE = 2;
const MAX_AFFIXES = 4;

export interface ArenaTierSpec {
  tier: ArenaTier;
  /** § 55.1：目前開放 T4～T6 */
  open: boolean;
  level: number;
  materials: string[];
  bosses: string[];
  normalPool: (m: MonsterTemplate) => boolean;
  normalLabel: string;
}

/** § 55.1／§ 55.2 */
export const ARENA_TIERS: readonly ArenaTierSpec[] = [
  {
    tier: 4, open: true, level: 38,
    materials: ['試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳'],
    bosses: ['試煉飛龍', '雪地之主', '象牙塔惡魔'],
    normalPool: m => m.level >= 34 && m.level <= 40, normalLabel: 'Lv.34～40',
  },
  {
    tier: 5, open: true, level: 50,
    materials: ['蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗'],
    bosses: ['朦朧蛇魔', '深海獄王', '安塔巨龍', '毒之皇女', '哥布林之王', '暗影吸血鬼', '不死殭屍王', '龍王約特勒'],
    normalPool: m => m.level >= 46 && m.level <= 52, normalLabel: 'Lv.46～52',
  },
  {
    tier: 6, open: true, level: 60,
    materials: ['遠古騎士紋章', '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'],
    bosses: ['遠古騎士', '不死殭屍王', '龍王約特勒', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'],
    normalPool: m => m.level >= 56 && m.level <= 62, normalLabel: 'Lv.56～62',
  },
  {
    tier: 7, open: false, level: 70,
    materials: ['遠古騎士紋章', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'],
    bosses: ['遠古騎士', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'],
    normalPool: m => m.area === 'hundred-pillar-91-100f', normalLabel: '百柱塔 91～100F',
  },
];

export function getArenaTier(tier: number): ArenaTierSpec | undefined {
  return ARENA_TIERS.find(t => t.tier === tier);
}

/** § 55.1：金幣 = 段位 × 50,000 */
export function arenaGoldCost(tier: ArenaTier): number {
  return tier * 50_000;
}

/** 入場材料的道具 id */
export function arenaMaterialIds(spec: ArenaTierSpec): number[] {
  return spec.materials.map(name => {
    const id = getItemId(name);
    if (id == null) throw new Error(`競技場入場材料不存在：${name}`);
    return id;
  });
}

export function isBossWave(wave: number): boolean {
  return wave % ARENA_BOSS_WAVE_INTERVAL === 0;
}

/** § 55.2.1：單人數量 × 1.5^(人數 − 1)，無條件進位，上限 10 */
export function arenaWaveSize(wave: number, members: number): number {
  const base = isBossWave(wave) ? BOSS_WAVE_SIZE : NORMAL_WAVE_SIZE;
  return Math.min(ARENA_MAX_WAVE_MONSTERS, Math.ceil(base * 1.5 ** (Math.max(1, members) - 1)));
}

/** § 55.2：`min(4, floor((波次 − 1) / 10))` */
export function arenaAffixCount(wave: number): number {
  return Math.min(MAX_AFFIXES, Math.floor((wave - 1) / ARENA_BOSS_WAVE_INTERVAL));
}

/** § 55.2：王依 Boss 等級由低到高（同級依 HP），輪完固定出最強者 */
export function arenaBossOrder(spec: ArenaTierSpec): MonsterTemplate[] {
  return spec.bosses
    .map(name => {
      const t = MONSTER_SEEDS.find(m => m.isBoss && m.name === name);
      if (!t) throw new Error(`競技場 Boss 不存在：${name}`);
      return t;
    })
    .sort((a, b) => a.level - b.level || a.hp - b.hp);
}

export function arenaBossForWave(spec: ArenaTierSpec, wave: number): MonsterTemplate {
  const order = arenaBossOrder(spec);
  return order[Math.min(wave / ARENA_BOSS_WAVE_INTERVAL - 1, order.length - 1)];
}

/** § 55.2：該段位等級區間內的一般怪（不含 Boss） */
export function arenaNormalPool(spec: ArenaTierSpec): MonsterTemplate[] {
  return MONSTER_SEEDS.filter(m => !m.isBoss && spec.normalPool(m));
}

/** § 55.4：票券場每 3 小時重置（server 當地時間 00:00、03:00…21:00） */
export const ARENA_SLOT_HOURS = 3;

/** 不晚於 `now` 的票券場時段起點（毫秒） */
export function arenaSlotStart(now: number): number {
  const d = new Date(now);
  d.setHours(Math.floor(d.getHours() / ARENA_SLOT_HOURS) * ARENA_SLOT_HOURS, 0, 0, 0);
  return d.getTime();
}

/** `now` 之後的下一個時段起點（毫秒） */
export function nextArenaSlotStart(now: number): number {
  const d = new Date(arenaSlotStart(now));
  d.setHours(d.getHours() + ARENA_SLOT_HOURS);
  return d.getTime();
}

/** § 55.5：死亡收回本場票券的一半，無條件捨去 */
export function arenaDeathTicketLoss(ticketsThisRun: number): number {
  return Math.floor(ticketsThisRun / 2);
}

/** 角色身上的進行中場次（存 prefs；HUD 讀 `wave`／`elapsedMs`／`monstersLeft`） */
export interface ArenaCharacterRun {
  /** 實例鍵的場次部分：同場隊員共用 */
  runKey: string;
  tier: ArenaTier;
  /** 本場是否給票券（§ 55.4） */
  ticketRun: boolean;
  /** 本場已得票券（死亡收回一半，§ 55.5） */
  tickets: number;
  /** 進場前所在城鎮（死亡與打完 100 波回到這裡） */
  returnRegion: string;
  /** 本場地形主題（§ 55 場地） */
  theme: string;
  /** 進場時的票券場時段起點；重啟作廢時據此歸還次數（§ 55.6） */
  slotStart: number;
  wave: number;
  elapsedMs: number;
  monstersLeft: number;
}

/** 票券場使用紀錄：只記目前時段（§ 55.4） */
export interface ArenaSlotUsage {
  slotStart: number;
  tiers: ArenaTier[];
}

export const EMPTY_ARENA_SLOTS: ArenaSlotUsage = { slotStart: 0, tiers: [] };

export function isArenaSlotUsed(usage: ArenaSlotUsage, tier: ArenaTier, now: number): boolean {
  return usage.slotStart === arenaSlotStart(now) && usage.tiers.includes(tier);
}

export function markArenaSlotUsed(usage: ArenaSlotUsage, tier: ArenaTier, now: number): ArenaSlotUsage {
  const slotStart = arenaSlotStart(now);
  const tiers = usage.slotStart === slotStart ? usage.tiers : [];
  return { slotStart, tiers: tiers.includes(tier) ? tiers : [...tiers, tier] };
}

/** § 55.6：server 重啟作廢的場次，同時段內歸還次數 */
export function refundArenaSlot(usage: ArenaSlotUsage, tier: ArenaTier, slotStart: number): ArenaSlotUsage {
  if (usage.slotStart !== slotStart) return usage;
  return { slotStart, tiers: usage.tiers.filter(t => t !== tier) };
}

const isArenaTier = (v: unknown): v is ArenaTier => v === 4 || v === 5 || v === 6 || v === 7;

export function normalizeArenaSlots(raw: unknown): ArenaSlotUsage {
  const r = raw as Partial<ArenaSlotUsage> | null | undefined;
  if (!r || typeof r.slotStart !== 'number' || !Array.isArray(r.tiers)) return EMPTY_ARENA_SLOTS;
  return { slotStart: r.slotStart, tiers: r.tiers.filter(isArenaTier) };
}

export function normalizeArenaRun(raw: unknown): ArenaCharacterRun | null {
  const r = raw as Partial<ArenaCharacterRun> | null | undefined;
  if (!r || typeof r.runKey !== 'string' || !isArenaTier(r.tier) || typeof r.returnRegion !== 'string') return null;
  return {
    runKey: r.runKey, tier: r.tier, ticketRun: !!r.ticketRun, tickets: Number(r.tickets) || 0,
    returnRegion: r.returnRegion, theme: typeof r.theme === 'string' ? r.theme : 'battlefield',
    slotStart: Number(r.slotStart) || 0, wave: Number(r.wave) || 1, elapsedMs: Number(r.elapsedMs) || 0,
    monstersLeft: Number(r.monstersLeft) || 0,
  };
}
