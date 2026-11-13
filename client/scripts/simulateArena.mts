/**
 * 競技場波次模擬（`44-dps-prediction.md` § 44.13）：各段位的合適角色連續清波，量 60 分鐘能打幾波。
 *
 * 直接驅動遊戲的 `tickWorld()`（server 同一套，每 tick `TICK_MS`）：怪物走過來攻擊、詠唱、上負面狀態，
 * 角色依戰鬥天賦出手、依常駐天賦補血／喝藥／補 buff。天賦配置共用 `fightSetup.mts`。
 *
 * 前提（§ 44.13）：
 *  - 一般波 3 隻；第 10 的倍數波只出 2 隻王，王依段位名單由 Boss 等級低到高（同級依 HP），輪完固定出最強者
 *  - 上一波清完立刻出下一波；強化詞綴數量 min(4, floor((波次 − 1) / 10))：1～10 波 0 個、11～20 波 1 個…
 *  - 橙色藥水 600 瓶放背包；負重超過上限的職業改為背包維持 20 瓶、喝掉由庫存補（報告標示超重）
 *  - 掉落、金幣、經驗倍率設 0：背包不進東西、角色不升級
 *  - 死亡或 60 分鐘到即結束；不設戰後休息門檻；藥水一律「缺血量 ≥ 一瓶補量就喝」（騎士不維持殘血）
 *  - 妖精與法系常駐天賦加「保持距離」
 *  - 防具路線依主攻屬性（力量→重、敏捷→輕、智力→布）；配點先補該階防具的素質需求，其餘照 § 44.4
 *  - 素質需求依遊戲的凍結判定：被凍結的部位降一階重選，直到整套詞綴都生效
 *
 * 用法：npx vite-node scripts/simulateArena.mts [--tier=4,5] [--class=a,b] [--runs=N] [--minutes=N] [--lifesteal=attack|skill|both]
 */
import { readFileSync } from 'node:fs';
import { tickWorld } from '../src/systems/worldTick';
import { createMapInstance, attachInstance } from '../src/systems/mapInstance';
import { createMonsterCombatContext } from '../src/systems/monsterCombatFSM';
import { defaultMonsterStatRates, scaleMonsterStat } from '../src/systems/globalRates';
import { getWeightStatus } from '../src/systems/weight';
import { getFrozenGear } from '../src/systems/gear';
import { calculateHealAmount, getCombatBonuses, getEffectiveDefense, getPlayerDodgeRate } from '../src/systems/combat';
import { defaultSession } from '../src/stores/session';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, POTION_CONFIG, getPotionCount } from '../src/stores/gameStore';
import { useMapControlStore } from '../src/stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../src/stores/mapMonsterStore';
import { useTalentStore } from '../src/stores/talentStore';
import { setGameNow, TICK_MS } from '../src/core/clock';
import { setRates } from '../src/core/rates';
import { makeBagItem } from '../src/models/bagItem';
import { TileType, type MapData } from '../src/models/mapControl';
import {
  ATTRIBUTE_CAP, ATTRIBUTE_KEYS, CLASS_BASE_ATTRIBUTES, CLASS_NAMES_ZH, CLASS_TOTAL_POINTS, CREATION_ATTRIBUTE_CAP,
  getEffectiveINT, type Attributes, type Character, type ClassName,
} from '../src/models/character';
import type { MonsterInstance, MonsterTemplate } from '../src/models/monster';
import type { ArmorLine, EquipmentInstance, EquipSlot } from '../src/models/equipment';
import { getAffixCategoryOf, getWeaponBaseDamage } from '../src/models/affix';
import {
  MONSTER_AFFIX_ORDER, applyMonsterAffixes, pickVenomDebuff, rollMonsterAffixes, type MonsterAffixId, type MonsterAffixRoll,
} from '../src/models/monsterAffix';
import {
  getAbilityClassPool, getAbilityCommonPool, getAbilityDefinition, resolveParamRange, formatAbilityDisplay,
  type Ability, type AbilityParamDef,
} from '../src/models/ability';
import { UNIQUE_AFFIX_DEFINITIONS, type UniqueAffixType } from '../src/models/uniqueAffix';
import { getExpToNextLevel, INITIAL_HP, INITIAL_MP, tryLevelUp } from '../src/systems/levelUp';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { MemoryRepository } from '../src/db/memoryRepository';
import type { CombatVisual } from '../src/systems/combatLoop';
import {
  BIS_BRAND_ELEMENT, CREATION_ATTRIBUTES, LEVELUP_ALLOCATION, MAIN_STAT, OFFHAND_TYPES, SEED_AFFIXES, TARGET_CLASSES,
  WEAPON_AFFIX_POOL, WEAPON_GENERAL_AFFIXES, WEAPON_UNIQUE_OPTIONS,
  chooseK, erosionRollValue, percentile, preCombatBuffs, proxyDps, rankArmorOffense, scoreSupportPiece, usableBy, withSeed,
  type AffixType, type Loadout, type SimContext, type Template,
} from './reaperShared.mts';
import { armorAffixTypes, buildAffixes } from './affixLoadout.mts';
import { buildSetup, fmt, slot as talentSlot, entry as talentEntry, type FightSetup } from './fightSetup.mts';

defaultSession.repo = new MemoryRepository();
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
}
setRates({ drop: 0, gold: 0, exp: 0 });

// ---------------------------------------------------------------- 參數

const argOf = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const RUNS = Number(argOf('runs') ?? 3);
/** 對照：強化詞綴改回一般地圖的自然機率（`25-monster-system.md` § 25.12.1） */
const NATURAL_AFFIXES = process.argv.includes('--natural-affixes');
/**
 * 對照：一般地圖（只限 T7，百柱塔 91～100F）。生怪、Pressure、Boss、自然強化詞綴、
 * 休息暫停生成全部由遊戲處理（`26-spawn-pressure.md` § 26.2），休息門檻用遊戲預設值
 */
const MAP_MODE = process.argv.includes('--map');
const MAP_MODE_AREA = 'hundred-pillar-91-100f';
/** `--heal-scale=X`：補血技能（`type: 'heal'`）威力乘 X，吸血不變 */
const HEAL_SCALE = Number(argOf('heal-scale') ?? 1);
/** `--heal-power=full-heal:80,great-heal:53`：指定補血技能的威力（優先於 `--heal-scale`） */
const HEAL_POWER = new Map((process.argv.find(a => a.startsWith('--heal-power='))?.split('=')[1] ?? '')
  .split(',').filter(Boolean).map(kv => [kv.split(':')[0], Number(kv.split(':')[1])] as const));
const healPower = (s: { id: string; power: number }) => HEAL_POWER.get(s.id) ?? Math.round(s.power * HEAL_SCALE);
/** 對照：不出王波 */
const NO_BOSS = process.argv.includes('--no-boss');
/** 印出每格的裝備明細、凍結檢查、實際防禦／迴避、行動分佈、受傷與補血來源 */
const DETAIL = process.argv.includes('--detail');
/**
 * 對照：武器帶回血詞綴（`07-affix.md` § 7.9）。`attack`／`skill` 換 1 條、`both` 換 2 條，
 * 換掉的是武器一般詞綴裡邊際輸出最小的攻擊詞綴（封印詞綴不動）
 */
const LIFESTEAL_ARG = argOf('lifesteal');
const LIFESTEAL_TYPES: AffixType[] = LIFESTEAL_ARG === 'attack' ? ['attack_lifesteal']
  : LIFESTEAL_ARG === 'skill' ? ['skill_lifesteal']
  : LIFESTEAL_ARG === 'both' ? ['attack_lifesteal', 'skill_lifesteal']
  : [];
/** 每 N 秒印出角色與場上怪物的狀態（除錯用） */
const TRACE_SEC = Number(argOf('trace') ?? 0);
const LIMIT_MS = Number(argOf('minutes') ?? 60) * 60_000;
const ALL_TIERS = [4, 5, 6, 7] as const;
type ArenaTier = (typeof ALL_TIERS)[number];
const TIERS: ArenaTier[] = process.argv.includes('--map') ? [7] : argOf('tier')
  ? ALL_TIERS.filter(t => argOf('tier')!.split(',').map(Number).includes(t))
  : [...ALL_TIERS];

const NORMAL_WAVE_SIZE = 3;
const BOSS_WAVE_SIZE = 2;
const BOSS_WAVE_EVERY = 10;
const MAX_MONSTER_AFFIXES = 4;
const POTION_BUDGET = 600;
const POTION_BAG = 20;
const QUALITY = 20;

// ---------------------------------------------------------------- 段位

interface TierSpec {
  level: number;
  /** 一般怪的池：依等級帶或區域 */
  normalPool: (m: MonsterTemplate) => boolean;
  normalLabel: string;
  /** 入場材料對應的 Boss（`27-drop-table.md` § 27.5 掉落該階裝備者） */
  bosses: string[];
}

const TIER_SPECS: Record<ArenaTier, TierSpec> = {
  4: {
    level: 38, normalPool: m => m.level >= 34 && m.level <= 40, normalLabel: 'Lv.34~40',
    bosses: ['試煉飛龍', '雪地之主', '象牙塔惡魔'],
  },
  5: {
    level: 50, normalPool: m => m.level >= 46 && m.level <= 52, normalLabel: 'Lv.46~52',
    bosses: ['朦朧蛇魔', '深海獄王', '安塔巨龍', '毒之皇女', '哥布林之王', '暗影吸血鬼', '不死殭屍王', '龍王約特勒'],
  },
  6: {
    level: 60, normalPool: m => m.level >= 56 && m.level <= 62, normalLabel: 'Lv.56~62',
    bosses: ['遠古騎士', '不死殭屍王', '龍王約特勒', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'],
  },
  7: {
    level: 80, normalPool: m => m.area === 'hundred-pillar-91-100f', normalLabel: '百柱塔 91~100F',
    bosses: ['遠古騎士', '冥王哈馬斯', '霜凍伊莉絲', '熔岩伊弗利特', '守護者之主', '百柱死神'],
  },
};

function bossOrder(names: string[]): MonsterTemplate[] {
  return names
    .map(n => {
      const t = MONSTER_SEEDS.find(m => m.isBoss && m.name === n);
      if (!t) throw new Error(`找不到 Boss ${n}`);
      return t;
    })
    .sort((a, b) => a.level - b.level || a.hp - b.hp);
}

function normalPool(spec: TierSpec): MonsterTemplate[] {
  const pool = MONSTER_SEEDS.filter(m => !m.isBoss && spec.normalPool(m));
  if (pool.length === 0) throw new Error(`${spec.normalLabel} 沒有一般怪`);
  return pool;
}

// ---------------------------------------------------------------- 角色

/**
 * 配點：建角自由點數與 Lv.51 起的升級點數**先補該階防具的素質需求**，
 * 剩下的照 `44-dps-prediction.md` § 44.4 —— 建角往 `CREATION_ATTRIBUTES` 補（主攻屬性優先），升級點主攻推到 35、其餘投次要屬性。
 * 回傳建角後屬性與升級點的投放順序（第 n 級後取前 n − 50 項）。
 */
function planAttributes(className: ClassName, level: number, req: Partial<Attributes>): { base: Attributes; levelOrder: (keyof Attributes)[] } {
  const base = { ...CLASS_BASE_ATTRIBUTES[className] };
  let free = CLASS_TOTAL_POINTS - ATTRIBUTE_KEYS.reduce((sum, k) => sum + base[k], 0);
  const levelOrder: (keyof Attributes)[] = [];
  let levelPoints = Math.max(0, level - 50);
  const total = (k: keyof Attributes) => base[k] + levelOrder.filter(x => x === k).length;

  for (const k of ATTRIBUTE_KEYS) {
    while (total(k) < (req[k] ?? 0)) {
      if (free > 0 && base[k] < CREATION_ATTRIBUTE_CAP) { base[k]++; free--; continue; }
      if (levelPoints > 0 && total(k) < ATTRIBUTE_CAP) { levelOrder.push(k); levelPoints--; continue; }
      break;
    }
  }
  const main = MAIN_STAT[className];
  const target = CREATION_ATTRIBUTES[className];
  for (const k of [main, ...ATTRIBUTE_KEYS.filter(x => x !== main)]) {
    while (free > 0 && base[k] < target[k]) { base[k]++; free--; }
  }
  for (const k of [main, ...ATTRIBUTE_KEYS.filter(x => x !== main)]) {
    while (free > 0 && base[k] < CREATION_ATTRIBUTE_CAP) { base[k]++; free--; }
  }
  const secondary = (Object.keys(LEVELUP_ALLOCATION[className]) as (keyof Attributes)[]).find(k => k !== main)!;
  while (levelPoints > 0) {
    levelOrder.push(total(main) < ATTRIBUTE_CAP ? main : secondary);
    levelPoints--;
  }
  return { base, levelOrder };
}

function pointsOf(order: (keyof Attributes)[]): Attributes {
  const out: Attributes = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
  for (const k of order) out[k]++;
  return out;
}

function buildArenaCharacter(className: ClassName, level: number, req: Partial<Attributes>): Character {
  const { base, levelOrder } = planAttributes(className, level, req);
  let char = {
    name: `Lv${level}-${className}`, className, level: 1, exp: 0, expToNext: getExpToNextLevel(1),
    hp: INITIAL_HP, maxHp: INITIAL_HP, mp: INITIAL_MP, maxMp: INITIAL_MP,
    baseAttributes: base,
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'arena', currentZone: 'arena', currentRegion: 'arena', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as unknown as Character;
  withSeed(1234, () => {
    while (char.level < level) {
      char = tryLevelUp({ ...char, exp: char.expToNext });
      if (char.level > 50) char = { ...char, bonusAttributes: pointsOf(levelOrder.slice(0, char.level - 50)) };
    }
  });
  return { ...char, exp: 0, expToNext: 1, hp: char.maxHp, mp: char.maxMp, unspentAttributePoints: 0 } as Character;
}

/** 該階各防具部位（含副手）首選模板的素質需求，逐項取最大 */
function gearRequirement(cn: ClassName, tier: ArenaTier): Partial<Attributes> {
  const rule = GEAR_RULES[tier];
  const req: Partial<Attributes> = {};
  const preds: ((t: Template) => boolean)[] = [
    ...ARMOR_SLOTS.map(slot => (t: Template) => t.slot === slot && onLine(cn, t)),
    (t: Template) => OFFHAND_TYPES.has(t.type as string) && onLine(cn, t),
  ];
  for (const pred of preds) {
    const got = pickAt(cn, rule.gearTier, rule.preferCraft, pred);
    for (const [k, v] of Object.entries(got?.tpl.requiredAttributes ?? {}) as [keyof Attributes, number][]) {
      req[k] = Math.max(req[k] ?? 0, v);
    }
  }
  return req;
}

function effectiveIntOf(char: Character) {
  return (gear: (EquipmentInstance | null)[]) => getEffectiveINT(
    char.baseAttributes.INT + char.bonusAttributes.INT
    + gear.reduce((s, g) => s + (g?.bonusAttributes?.INT ?? 0), 0),
  );
}

// ---------------------------------------------------------------- 裝備

const ARMOR_SLOTS: EquipSlot[] = ['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots', 'belt'];
/** 防具路線依主攻屬性（`06-equipment-armor.md`：每部位每階布／輕／重各一件，不限職業） */
const LINE_BY_MAIN_STAT: Partial<Record<keyof Attributes, ArmorLine>> = { STR: 'heavy', AGI: 'light', INT: 'robe' };
const lineOf = (cn: ClassName) => LINE_BY_MAIN_STAT[MAIN_STAT[cn]];
/** 沒有路線的模板（飾品、腰帶等）不受限 */
const onLine = (cn: ClassName, t: Template) => !t.line || t.line === lineOf(cn);
const ACCESSORY_SLOTS: EquipSlot[] = ['necklace', 'ring1', 'ring2'];
/**
 * 普攻擴散的額外目標數（`affixLoadout.mts` 的攻擊詞綴排名用）：一般波 3 隻，假設平均 1 隻在主目標 3 格內
 */
const ARENA_SPLASH_TARGETS = 1;

const isCasterClass = (cn: ClassName) => cn === 'elementalist' || cn === 'priest';

/**
 * 各段位的配裝規則：
 *  - T4~T6：該階製作裝備（該部位無製作品時取該階掉落品），武器 +6（安定值）、防具 +5、飾品 +0；製作品詞綴取製作範圍上限
 *  - T7：T7 武器 +8，其餘 T6 防具 +9、飾品 +8；詞綴 T6，武器含封印詞綴
 *  - 詞綴依所屬分類池（`affixLoadout.mts`）：武器窮舉攻擊詞綴組合，其他部位 2 條攻擊 ＋ 2 條生存
 */
interface GearRule {
  weaponTier: number;
  gearTier: number;
  preferCraft: boolean;
  affixTier: number;
  weaponEnhance: number;
  armorEnhance: number;
  accessoryEnhance: number;
  sealed: boolean;
  /** 隨機技能參數：製作品取最低端，掉落品取中間值 */
  abilityRoll: 'worst' | 'mid';
}

const GEAR_RULES: Record<ArenaTier, GearRule> = {
  4: { weaponTier: 4, gearTier: 4, preferCraft: true, affixTier: 5, weaponEnhance: 6, armorEnhance: 5, accessoryEnhance: 0, sealed: false, abilityRoll: 'worst' },
  5: { weaponTier: 5, gearTier: 5, preferCraft: true, affixTier: 6, weaponEnhance: 6, armorEnhance: 5, accessoryEnhance: 0, sealed: false, abilityRoll: 'worst' },
  6: { weaponTier: 6, gearTier: 6, preferCraft: true, affixTier: 6, weaponEnhance: 6, armorEnhance: 5, accessoryEnhance: 0, sealed: false, abilityRoll: 'worst' },
  7: { weaponTier: 7, gearTier: 6, preferCraft: false, affixTier: 6, weaponEnhance: 8, armorEnhance: 9, accessoryEnhance: 8, sealed: true, abilityRoll: 'mid' },
};

function makeItem(
  tpl: Template, enhancement: number, affixTypes: AffixType[], affixTier: number, sealed: boolean, cn: ClassName,
  unique: UniqueAffixType | null = null, ability: Ability | null = null,
): EquipmentInstance {
  return {
    ...tpl, templateId: tpl.id!, quality: QUALITY, enhancement: tpl.slot === 'belt' ? 0 : enhancement, defenseBonus: 0,
    affixes: buildAffixes(tpl, affixTypes, affixTier, {
      element: BIS_BRAND_ELEMENT,
      erosionDamage: erosionRollValue(getWeaponBaseDamage(tpl)),
      mainStat: MAIN_STAT[cn],
      ...(sealed && affixTypes.length > WEAPON_GENERAL_AFFIXES ? { sealedIndex: WEAPON_GENERAL_AFFIXES } : {}),
    }),
    ...(unique ? { uniqueAffix: { type: unique, value: uniqueMid(unique) } } : {}),
    ...(ability ? { ability } : {}),
    ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function uniqueMid(type: UniqueAffixType): number {
  const r = UNIQUE_AFFIX_DEFINITIONS.find(d => d.type === type)?.range;
  return r ? Math.round((r[0] + r[1]) / 2) : 0;
}

function rollParam(p: AbilityParamDef, weapon: Template, roll: 'worst' | 'mid'): number {
  const [, max] = resolveParamRange(p, weapon);
  if (roll === 'worst') return p.lowerIsBetter ? max : p.min;
  const step = p.step ?? 1;
  return p.min + Math.round((max - p.min) / 2 / step) * step;
}

function abilityCandidates(className: ClassName, weapon: Template, roll: 'worst' | 'mid'): Ability[] {
  const types = [...getAbilityCommonPool(weapon), ...getAbilityClassPool(weapon, className)];
  return types.map(type => ({
    type,
    params: Object.fromEntries(getAbilityDefinition(type)!.params.map(p => [p.key, rollParam(p, weapon, roll)])),
  }));
}

/** 該階起往下找第一個有模板的階級（製作品優先時只取製作品，該階沒有才取掉落品）；`excluded` 為已知穿不動的模板 */
function pickAt(
  cn: ClassName, tier: number, preferCraft: boolean, pred: (t: Template) => boolean, excluded: ReadonlySet<string> = new Set(),
): { tpl: Template; tier: number } | null {
  for (let t = tier; t >= 1; t--) {
    const all = EQUIPMENT_SEEDS.filter(x => x.tier === t && x.acquireType !== 'starter' && usableBy(x, cn) && pred(x)
      && !excluded.has(x.name));
    if (all.length === 0) continue;
    const craft = all.filter(x => x.acquireType === 'craft');
    const pool = preferCraft && craft.length > 0 ? craft : all;
    return { tpl: pool.reduce((a, b) => (scoreSupportPiece(b, cn) > scoreSupportPiece(a, cn) ? b : a)), tier: t };
  }
  return null;
}

/** 武器詞綴條數：4 條，T7 段另加 1 條封印 */
const weaponAffixCount = (rule: GearRule) => WEAPON_GENERAL_AFFIXES + (rule.sealed ? 1 : 0);

interface ArenaLoadout extends Loadout { missing: string[] }

interface SupportSet { items: EquipmentInstance[]; keys: string[]; offhand: Template | null; ranking: AffixType[] }

function assemble(
  cn: ClassName, rule: GearRule, weapon: Template, support: SupportSet, weaponSet: AffixType[],
  unique: UniqueAffixType | null, ability: Ability | null, missing: string[],
): ArenaLoadout {
  const w = makeItem(weapon, rule.weaponEnhance, weaponSet, rule.affixTier, rule.sealed, cn, unique, ability);
  const gear: (EquipmentInstance | null)[] = [w];
  const off = support.offhand && !weapon.isTwoHanded ? support.offhand : null;
  if (off) {
    gear.push(makeItem(off, rule.armorEnhance, armorAffixTypes('offhand', support.ranking, cn), rule.affixTier, false, cn));
  }
  gear.push(...support.items);
  const label = `${weapon.name}+${rule.weaponEnhance}${off ? ` ＋ ${off.name}` : ''}`
    + `${unique ? `｜(獨)${unique}` : ''}${ability ? `｜(技)${formatAbilityDisplay(ability)}` : ''}`;
  return { label, unique, ability, weaponName: weapon.name, weapon: w, gear, missing };
}

const isWeapon = (t: Template) => t.smallMonsterDamage != null && !OFFHAND_TYPES.has(t.type as string);

/** `--replay=<json>` 的一件：部位、模板名、強化、詞綴（依序，`sealed` 為第 5 條封印）、獨有詞綴、隨機技能 */
interface ReplayPiece {
  slot: string;
  name: string;
  enhancement: number;
  affixes: AffixType[];
  sealed?: boolean;
  unique?: UniqueAffixType;
  ability?: string;
}

/** `--replay=<json>`（鍵 `T{段位}|{職業}`）：照檔案重建配裝（數值依現行模板與階級表），不做配裝搜尋 */
const REPLAY_ARG = argOf('replay');
const REPLAY: Record<string, ReplayPiece[]> = REPLAY_ARG ? JSON.parse(readFileSync(REPLAY_ARG, 'utf8')) : {};

function replayLoadout(cn: ClassName, tier: ArenaTier): ArenaLoadout | null {
  const pieces = REPLAY[`T${tier}|${cn}`];
  if (!pieces) return null;
  const rule = GEAR_RULES[tier];
  const gear = pieces.map(p => {
    const tpl = EQUIPMENT_SEEDS.find(t => t.name === p.name);
    if (!tpl) throw new Error(`重播：找不到模板 ${p.name}`);
    const ability = p.ability ? abilityCandidates(cn, tpl, rule.abilityRoll).find(a => a.type === p.ability) ?? null : null;
    const item = makeItem(tpl, p.enhancement, p.affixes, rule.affixTier, !!p.sealed, cn, p.unique ?? null, ability);
    return p.slot === 'rightHand' || p.slot === 'leftHand' ? item : { ...item, slot: p.slot as EquipSlot };
  });
  const w = gear[0];
  const label = `${w.name}+${w.enhancement}（重播）${w.ability ? `｜(技)${formatAbilityDisplay(w.ability)}` : ''}`;
  return { label, unique: w.uniqueAffix?.type ?? null, ability: w.ability ?? null, weaponName: w.name, weapon: w, gear, missing: [] };
}

/**
 * 防具與飾品依 `scoreSupportPiece` 逐部位取；武器、獨有詞綴、隨機技能依粗排 DPS（對該段代表一般怪）選。
 * 素質需求以遊戲的 `getFrozenGear` 判定（含其他裝備的額外屬性）：被凍結的那件排除後重選（同階優先），直到整套都生效。
 */
function chooseLoadout(cn: ClassName, tier: ArenaTier, ctx: SimContext): ArenaLoadout {
  const rule = GEAR_RULES[tier];
  const effects = preCombatBuffs(cn, ctx.level);
  const SLOT_KEYS = [...ARMOR_SLOTS, ...ACCESSORY_SLOTS, 'offhand'];
  const excluded = new Set<string>();

  const predOf = (key: string) => (key === 'offhand'
    ? (t: Template) => OFFHAND_TYPES.has(t.type as string) && onLine(cn, t)
    : (t: Template) => t.slot === (key === 'ring2' ? 'ring1' : key) && onLine(cn, t));
  const buildSupport = (ranking: AffixType[]): SupportSet & { tiers: Map<string, number> } => {
    const items: EquipmentInstance[] = [];
    const keys: string[] = [];
    const tiers = new Map<string, number>();
    let offhand: Template | null = null;
    for (const key of SLOT_KEYS) {
      const got = pickAt(cn, rule.gearTier, rule.preferCraft, predOf(key), excluded);
      if (!got) continue;
      tiers.set(key, got.tier);
      if (key === 'offhand') { offhand = got.tpl; continue; }
      const accessory = (ACCESSORY_SLOTS as string[]).includes(key);
      const item = makeItem(got.tpl, accessory ? rule.accessoryEnhance : rule.armorEnhance,
        armorAffixTypes(getAffixCategoryOf(got.tpl), ranking, cn), rule.affixTier, false, cn);
      items.push({ ...item, slot: key as EquipSlot });
      keys.push(key);
    }
    return { items, keys, offhand, tiers, ranking };
  };
  const seedSet = SEED_AFFIXES[cn].slice(0, weaponAffixCount(rule));
  const weaponPool = () => {
    const first = pickAt(cn, rule.weaponTier, rule.preferCraft, isWeapon, excluded);
    if (!first) return [];
    const all = EQUIPMENT_SEEDS.filter(x => x.tier === first.tier && x.acquireType !== 'starter' && usableBy(x, cn) && isWeapon(x)
      && !excluded.has(x.name));
    const craft = all.filter(x => x.acquireType === 'craft');
    return rule.preferCraft && craft.length > 0 ? craft : all;
  };

  let support = buildSupport([]);
  let weapons: Template[] = [];
  for (let guard = 0; guard < 200; guard++) {
    weapons = weaponPool();
    if (weapons.length === 0) throw new Error(`${CLASS_NAMES_ZH[cn]} 沒有武器`);
    const fit = weapons.filter(w => {
      const lo = assemble(cn, rule, w, support, seedSet, null, null, []);
      return !getFrozenGear(ctx.character, effects, lo.gear).has(lo.weapon);
    });
    if (fit.length === 0) {
      for (const w of weapons) excluded.add(w.name);
      continue;
    }
    weapons = fit;
    const probe = assemble(cn, rule, weapons[0], support, seedSet, null, null, []);
    const frozen = getFrozenGear(ctx.character, effects, probe.gear);
    const frozenSupport = probe.gear.filter((g, i): g is EquipmentInstance => !!g && i > 0 && frozen.has(g));
    if (frozenSupport.length === 0) break;
    for (const g of frozenSupport) excluded.add(g.name);
    support = buildSupport([]);
  }

  const missing: string[] = [];
  for (const key of SLOT_KEYS) {
    const got = support.tiers.get(key);
    if (key === 'offhand' && weapons.every(w => w.isTwoHanded)) continue;
    if (got == null) missing.push(`缺 ${key}`);
    else if (got < rule.gearTier) missing.push(`${key} T${got}`);
  }
  if ((weapons[0].tier ?? 0) < rule.weaponTier) missing.push(`武器 T${weapons[0].tier}`);
  if (missing.some(m => !m.startsWith('缺'))) missing.unshift('素質不足降階：');

  const SEED = 777;
  const score = (lo: Loadout) => proxyDps(cn, lo, SEED, ctx);
  const uniques = (w: Template): (UniqueAffixType | null)[] => (w.tier === 7 ? WEAPON_UNIQUE_OPTIONS : [null]);

  // 非武器部位的攻擊詞綴排名：以生存配裝的第一名武器為基準量邊際輸出，再組 2 攻 2 守（素質判定不受詞綴影響）
  const base = weapons
    .map(w => assemble(cn, rule, w, support, seedSet, null, null, missing))
    .map(lo => ({ lo, s: score(lo) }))
    .sort((a, b) => b.s - a.s)[0].lo;
  const tiers = support.tiers;
  support = { ...buildSupport(rankArmorOffense(cn, base, SEED, ctx, ARENA_SPLASH_TARGETS)), tiers };

  const ranked = weapons
    .flatMap(w => uniques(w).map(u => assemble(cn, rule, w, support, seedSet, u, null, missing)))
    .map(lo => ({ lo, s: score(lo) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ lo }) => {
      // 武器詞綴：窮舉武器池的攻擊詞綴組合
      const w = weapons.find(t => t.name === lo.weaponName)!;
      return chooseK(WEAPON_AFFIX_POOL, weaponAffixCount(rule))
        .map(set => assemble(cn, rule, w, support, set, lo.unique, null, missing))
        .map(c => ({ lo: c, s: score(c) }))
        .sort((a, b) => b.s - a.s)[0];
    });
  const setOf = (lo: Loadout) => lo.weapon.affixes!.map(a => a.type as AffixType);
  const withAbility = ranked.flatMap(({ lo }) => {
    const w = weapons.find(t => t.name === lo.weaponName)!;
    return abilityCandidates(cn, w, rule.abilityRoll)
      .map(a => assemble(cn, rule, w, support, setOf(lo), lo.unique, a, missing));
  });
  const all = [...ranked.map(r => r.lo), ...withAbility].map(lo => ({ lo, s: score(lo) }));
  // 製作的武器必帶隨機技能（`06-equipment-acquire.md` § 6A.3）；T7 角色條件也是有隨機技能
  const best = all.filter(c => c.lo.ability).sort((a, b) => b.s - a.s)[0]?.lo ?? all.sort((a, b) => b.s - a.s)[0].lo;
  if (LIFESTEAL_TYPES.length === 0) return best;

  const w = weapons.find(t => t.name === best.weaponName)!;
  let set = setOf(best);
  for (const ls of LIFESTEAL_TYPES) {
    const swaps = set.slice(0, WEAPON_GENERAL_AFFIXES)
      .map((t, i) => (LIFESTEAL_TYPES.includes(t) ? null : set.map((x, j) => (j === i ? ls : x))))
      .filter((c): c is AffixType[] => c != null)
      .map(c => ({ c, s: score(assemble(cn, rule, w, support, c, best.unique, best.ability, missing)) }))
      .sort((a, b) => b.s - a.s);
    set = swaps[0].c;
  }
  return assemble(cn, rule, w, support, set, best.unique, best.ability, missing);
}

// ---------------------------------------------------------------- 怪物

function baseMonster(tpl: MonsterTemplate): MonsterInstance {
  const r = defaultMonsterStatRates();
  const maxHp = scaleMonsterStat(tpl.hp, r.hp);
  return {
    templateId: tpl.id!, name: tpl.name, level: tpl.level, currentHp: maxHp, maxHp,
    attackMin: scaleMonsterStat(tpl.attackMin, r.attack), attackMax: scaleMonsterStat(tpl.attackMax, r.attack),
    defense: tpl.defense, exp: tpl.exp, race: tpl.race, size: tpl.size, element: tpl.element, isBoss: tpl.isBoss,
    attackType: tpl.attackType ?? 'melee', attackRange: tpl.attackRange ?? 1.5, attackInterval: tpl.attackInterval ?? 1200,
    projectileSpeed: tpl.projectileSpeed, debuffs: tpl.debuffs,
  };
}

/** 強化詞綴固定 `count` 個（同一隻不重複，`25-monster-system.md` § 25.12.2） */
function forcedAffixes(tpl: MonsterTemplate, count: number): MonsterAffixRoll {
  const pool = [...MONSTER_AFFIX_ORDER];
  const picked = new Set<MonsterAffixId>();
  while (picked.size < count) picked.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const affixes = MONSTER_AFFIX_ORDER.filter(id => picked.has(id));
  return picked.has('venom')
    ? { affixes, venom: pickVenomDebuff((tpl.debuffs ?? []).map(d => d.type), Math.random) }
    : { affixes };
}

/** 1～10 波 0 個、11～20 波 1 個…，上限 4 個 */
const affixCountForWave = (wave: number) => Math.min(MAX_MONSTER_AFFIXES, Math.floor((wave - 1) / 10));

// ---------------------------------------------------------------- 場地

const SIZE = 30;
const CENTER = { x: 15, y: 15 };
const MAP: MapData = {
  id: 'arena-sim', name: 'Arena', width: SIZE, height: SIZE, spawnPoint: CENTER, autoSpawn: false,
  tiles: Array.from({ length: SIZE }, (_, y) =>
    Array.from({ length: SIZE }, (_, x) =>
      (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? TileType.Wall : TileType.Ground))),
};

/** 生在角色周圍 6~8 格（仇恨範圍內），夾在場內 */
function spawnPosition(player: { x: number; y: number }): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = 6 + Math.random() * 2;
  const clamp = (v: number) => Math.min(SIZE - 2, Math.max(1, Math.round(v)));
  return { x: clamp(player.x + Math.cos(angle) * dist), y: clamp(player.y + Math.sin(angle) * dist) };
}

// ---------------------------------------------------------------- 單場

interface WaveRecord { wave: number; boss: boolean; ms: number }

interface RunResult {
  died: boolean;
  /** 清完的波數 */
  cleared: number;
  /** 死亡時正在打的波次 */
  deathWave: number | null;
  ms: number;
  waves: WaveRecord[];
  potionsUsed: number;
  /** 藥水全部喝完的時間（ms）；沒喝完為 null */
  potionsOutAt: number | null;
  /** 出手次數（技能名／普攻） */
  actions: Record<string, number>;
  monsterHits: number;
  dodges: number;
  damageTaken: number;
  /** 補血量，依戰鬥紀錄分類 */
  heals: Record<string, number>;
  /** 死亡當下場上的 Boss */
  bossAtDeath: string | null;
}

const HEAL_LOG = /回復 (\d+) HP/;
function healSource(text: string): string {
  if (text.startsWith('使用')) return '藥水';
  if (text.startsWith('施放')) return '技能';
  if (text.includes('吸血')) return '吸血';
  if (text.includes('受擊回血')) return '受擊回血';
  if (text.startsWith('普攻回血')) return '普攻回血';
  if (text.startsWith('技能回血')) return '技能回血';
  if (text.includes('獨有詞綴')) return '獨有詞綴';
  return '其他';
}

function runOnce(setup: FightSetup, spec: TierSpec, seed: number, bagSize: number): RunResult {
  const normals = normalPool(spec);
  const bosses = bossOrder(spec.bosses);
  return withSeed(seed, () => {
    setGameNow(0);
    const instance = createMapInstance('arena', useMapMonsterStore);
    attachInstance(defaultSession, instance);
    useMapMonsterStore.setState({ monsters: [], combatMonsterIds: [], maxMonsters: NORMAL_WAVE_SIZE });
    if (MAP_MODE) {
      instance.areaTemplates.push(...MONSTER_SEEDS.filter(m => m.area === MAP_MODE_AREA));
      useMapMonsterStore.getState().setHasBossInPool(instance.areaTemplates.some(t => t.isBoss));
    }
    useMapControlStore.setState({
      currentMap: MAP_MODE ? { ...MAP, autoSpawn: true } : MAP, playerPosition: { ...CENTER }, prevPlayerPosition: { ...CENTER },
      currentPath: [], pathIndex: 0, isMoving: false, autoMove: true, paused: false,
    });
    const character = { ...setup.character };
    character.hp = getEffectiveMaxHp(character, setup.gear, setup.effects);
    character.mp = getEffectiveMaxMp(character, setup.gear, setup.effects);
    useGameStore.setState({
      character, equippedGear: setup.gear, inventory: [],
      skills: setup.skills.map(s => (s.type === 'heal' ? { ...s, power: healPower(s) } : { ...s })),
      bagItems: [makeBagItem(POTION_CONFIG.orange.itemId, bagSize)!], combatLogs: [],
      activeEffects: setup.effects.map(e => ({ ...e })),
      lastPotionUsedAt: -1e9, regenActive: true, persistentLoopActive: true,
      // 競技場下一波立刻出，不設戰後休息門檻（`gameLoop.ts` HP/MP threshold）；一般地圖對照用遊戲預設
      searchMode: 'auto',
      ...(MAP_MODE ? {} : {
        afterCombatHpThreshold: -1, afterCombatMpThreshold: -1, afterCombatHpResumeThreshold: 0, afterCombatMpResumeThreshold: 0,
      }),
      statistics: { ...useGameStore.getState().statistics, deathCount: 0 },
    });
    useTalentStore.setState({ slots: setup.slots });

    let reserve = POTION_BUDGET - bagSize;
    let wave = 0;
    let waveIds: string[] = [];
    let waveStart = 0;
    const r: RunResult = {
      died: false, cleared: 0, deathWave: null, ms: 0, waves: [], potionsUsed: 0, potionsOutAt: null,
      actions: {}, monsterHits: 0, dodges: 0, damageTaken: 0, heals: {}, bossAtDeath: null,
    };

    const spawnWave = () => {
      wave++;
      const boss = !NO_BOSS && wave % BOSS_WAVE_EVERY === 0;
      const bossTpl = bosses[Math.min(wave / BOSS_WAVE_EVERY - 1, bosses.length - 1)];
      const count = boss ? BOSS_WAVE_SIZE : NORMAL_WAVE_SIZE;
      const playerPos = useMapControlStore.getState().playerPosition;
      const added: MapMonster[] = [];
      waveIds = [];
      for (let i = 0; i < count; i++) {
        const tpl = boss ? bossTpl : normals[Math.floor(Math.random() * normals.length)];
        const roll = NATURAL_AFFIXES
          ? rollMonsterAffixes(tpl.level, (tpl.debuffs ?? []).map(d => d.type), Math.random)
          : forcedAffixes(tpl, affixCountForWave(wave));
        const inst = applyMonsterAffixes(baseMonster(tpl), roll);
        const pos = spawnPosition(playerPos);
        const id = `w${wave}-${i}`;
        const mm: MapMonster = {
          id, position: pos, targetPosition: { ...playerPos }, speed: 1, path: [], pathIndex: 0,
          pathRecalcTimer: 0, moveTimer: 0, lastPathPlayerPos: { ...playerPos }, isBoss: tpl.isBoss,
          attackRange: inst.attackRange,
        };
        instance.monsterInstances.set(id, inst);
        defaultSession.combat.engine.monsters.set(id, {
          instance: inst, mapMonster: mm, combatCtx: createMonsterCombatContext(),
          attackConfig: { attackType: inst.attackType, attackRange: inst.attackRange, attackInterval: inst.attackInterval },
        });
        added.push(mm);
        waveIds.push(id);
      }
      useMapMonsterStore.setState({ monsters: [...useMapMonsterStore.getState().monsters, ...added] });
      waveStart = r.ms;
    };

    if (!MAP_MODE) spawnWave();
    while (r.ms < LIMIT_MS) {
      useGameStore.setState({ combatLogs: [] });
      const visuals: CombatVisual[] = tickWorld(TICK_MS, [defaultSession], [instance], f => { throw f.error; })
        .get(defaultSession) ?? [];
      r.ms += TICK_MS;
      const gs = useGameStore.getState();
      for (const v of visuals) {
        if (v.kind === 'player_attack') {
          const name = v.result.skillUsed?.name ?? '普攻';
          r.actions[name] = (r.actions[name] ?? 0) + 1;
        }
        if (v.kind !== 'monster_attack') continue;
        if (v.isDodged) r.dodges++;
        else { r.monsterHits++; r.damageTaken += v.damage; }
      }
      for (const log of gs.combatLogs) {
        const m = HEAL_LOG.exec(log.text);
        if (m) r.heals[healSource(log.text)] = (r.heals[healSource(log.text)] ?? 0) + Number(m[1]);
      }
      if (TRACE_SEC > 0 && r.ms % (TRACE_SEC * 1000) < TICK_MS) {
        const pos = useMapControlStore.getState().playerPosition;
        const mons = useMapMonsterStore.getState().monsters.map(m => {
          const inst = instance.monsterInstances.get(m.id);
          return `${inst?.name ?? m.id}@${m.position.x.toFixed(1)},${m.position.y.toFixed(1)} HP${inst?.currentHp}`;
        });
        console.log(`${(r.ms / 1000).toFixed(0)}s 波${wave} 角色@${pos.x.toFixed(1)},${pos.y.toFixed(1)} HP${gs.character!.hp} MP${gs.character!.mp}`
          + ` FSM ${defaultSession.combat.engine.playerCtx.state}｜${mons.join('｜')}`);
        for (const log of gs.combatLogs.slice(-3)) console.log(`    ${log.text}`);
      }
      if (gs.statistics.deathCount > 0) {
        r.died = true;
        r.deathWave = wave;
        r.bossAtDeath = [...instance.monsterInstances.values()].find(m => m.isBoss && m.currentHp > 0)?.name ?? null;
        break;
      }
      const inBag = getPotionCount(gs.bagItems, 'orange');
      if (inBag === 0 && reserve === 0 && r.potionsOutAt == null) r.potionsOutAt = r.ms;
      if (inBag < bagSize && reserve > 0) {
        const add = Math.min(bagSize - inBag, reserve);
        reserve -= add;
        useGameStore.setState({
          bagItems: [makeBagItem(POTION_CONFIG.orange.itemId, inBag + add)!],
        });
      }
      if (MAP_MODE) { r.cleared = instance.kills; continue; }
      const alive = waveIds.some(id => (instance.monsterInstances.get(id)?.currentHp ?? 0) > 0
        && useMapMonsterStore.getState().monsters.some(m => m.id === id));
      if (!alive) {
        r.waves.push({ wave, boss: !NO_BOSS && wave % BOSS_WAVE_EVERY === 0, ms: r.ms - waveStart });
        r.cleared = wave;
        spawnWave();
      }
    }
    r.potionsUsed = POTION_BUDGET - getPotionCount(useGameStore.getState().bagItems, 'orange') - reserve;
    return r;
  });
}

// ---------------------------------------------------------------- 走位

/** 法系普攻是近戰，保持距離取技能射程內的固定格數；妖精留空＝退到弓的射程邊緣（`51-auto-talent.md` § 51.4.9） */
const CASTER_KEEP_DISTANCE = 8;

function withKeepDistance(cn: ClassName, setup: FightSetup): FightSetup {
  if (cn !== 'elf' && !isCasterClass(cn)) return setup;
  const distance = isCasterClass(cn) ? CASTER_KEEP_DISTANCE : null;
  const keep = talentSlot('persistent', talentEntry('keep_distance', distance ? { distance } : null));
  return { ...setup, slots: [...setup.slots, keep], rules: [...setup.rules, `保持距離：${distance ? `${distance} 格` : '武器射程'}`] };
}

// ---------------------------------------------------------------- 執行

const t0 = performance.now();
console.log(`# 競技場波次模擬 — 每格 ${RUNS} 場，每場上限 ${LIMIT_MS / 60_000} 分鐘`);
console.log(`一般波 ${NORMAL_WAVE_SIZE} 隻、每 ${BOSS_WAVE_EVERY} 波 ${BOSS_WAVE_SIZE} 隻王；強化詞綴 min(${MAX_MONSTER_AFFIXES}, floor((波次−1)/10))；`
  + `橙色藥水 ${POTION_BUDGET} 瓶；品質 ${QUALITY}%；妖精與法系保持距離；補血技能威力 ×${HEAL_SCALE}${HEAL_POWER.size ? `（指定 ${[...HEAL_POWER].map(([k, v]) => `${k} ${v}`).join('、')}）` : ''}\n`);

interface Row {
  tier: ArenaTier; cn: ClassName; setup: FightSetup; loadout: ArenaLoadout; results: RunResult[];
  weight: string; overweight: boolean;
}
const rows: Row[] = [];
for (const tier of TIERS) {
  const spec = TIER_SPECS[tier];
  const pool = normalPool(spec);
  const rep = pool[Math.floor(pool.length / 2)];
  for (const cn of TARGET_CLASSES) {
    const character = buildArenaCharacter(cn, spec.level, gearRequirement(cn, tier));
    const ctx: SimContext = { character, level: spec.level, monster: baseMonster(rep), effectiveInt: effectiveIntOf(character) };
    const loadout = replayLoadout(cn, tier) ?? chooseLoadout(cn, tier, ctx);
    const setup = withKeepDistance(cn, buildSetup(cn, loadout, 20261111 + tier, 'always', ctx, false));
    const w = getWeightStatus(setup.character, Object.values(setup.gear), [makeBagItem(POTION_CONFIG.orange.itemId, POTION_BUDGET)!], setup.effects);
    const bagSize = w.overweight ? POTION_BAG : POTION_BUDGET;
    const results: RunResult[] = [];
    for (let i = 0; i < RUNS; i++) results.push(runOnce(setup, spec, tier * 1_000_000 + i, bagSize));
    rows.push({ tier, cn, setup, loadout, results, weight: `${w.carried}/${w.capacity}`, overweight: w.overweight });
    console.error(`T${tier} ${CLASS_NAMES_ZH[cn]} 完成（${fmt((performance.now() - t0) / 1000)}s）`);
  }
}

const median = (xs: number[]) => (xs.length ? percentile([...xs].sort((a, b) => a - b), 0.5) : NaN);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

console.log(`| 段位 | 職業 | 撐滿 ${LIMIT_MS / 60_000} 分 | 存活時間中位 | 清完波數（中位／最少～最多） | 死亡波次 | 一般波平均 | 王波平均 | 藥水用量中位 | 藥水用完時間中位 |`);
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const row of rows) {
  const n = row.results.length;
  const cleared = row.results.map(r => r.cleared);
  const normalMs = row.results.flatMap(r => r.waves.filter(w => !w.boss).map(w => w.ms));
  const bossMs = row.results.flatMap(r => r.waves.filter(w => w.boss).map(w => w.ms));
  const deaths = row.results.filter(r => r.died).map(r => r.deathWave);
  const outAt = row.results.filter(r => r.potionsOutAt != null).map(r => r.potionsOutAt!);
  console.log(`| T${row.tier} | ${CLASS_NAMES_ZH[row.cn]} | ${row.results.filter(r => !r.died).length}/${n} `
    + `| ${fmt(median(row.results.map(r => r.ms)) / 60_000)} 分 `
    + `| ${median(cleared)}／${Math.min(...cleared)}～${Math.max(...cleared)} `
    + `| ${MAP_MODE
      ? (row.results.filter(r => r.died).map(r => `${fmt(r.ms / 60_000, 0)}分${r.bossAtDeath ? `(${r.bossAtDeath})` : ''}`).join('、') || '—')
      : (deaths.length ? deaths.join('、') : '—')} `
    + `| ${normalMs.length ? `${fmt(avg(normalMs) / 1000)}s` : '—'} | ${bossMs.length ? `${fmt(avg(bossMs) / 1000)}s` : '—'} `
    + `| ${median(row.results.map(r => r.potionsUsed))} `
    + `| ${outAt.length ? `${fmt(median(outAt) / 60_000)} 分（${outAt.length}/${n} 場用完）` : '—'} |`);
}

console.log('\n## 各段位角色與配裝\n');
for (const tier of TIERS) {
  const spec = TIER_SPECS[tier];
  console.log(`### T${tier}：Lv.${spec.level}，一般怪 ${spec.normalLabel}，王 ${bossOrder(spec.bosses).map(b => `${b.name}(Lv.${b.level})`).join(' → ')}\n`);
  for (const row of rows.filter(r => r.tier === tier)) {
    console.log(`- ${CLASS_NAMES_ZH[row.cn]}：${row.loadout.label}｜600 瓶時負重 ${row.weight}${row.overweight ? '（超重，改背包 20 瓶補充）' : ''}`
      + `${row.loadout.missing.length ? `｜${row.loadout.missing.join(' ').replace('： ', '：')}` : ''}`);
    const a = row.setup.character;
    const attrs = ATTRIBUTE_KEYS.map(k => `${k} ${a.baseAttributes[k] + a.bonusAttributes[k]}`).join(' ');
    console.log(`  - 屬性 ${attrs}；${row.setup.rules.join('；')}`);
    if (DETAIL) printDetail(row);
  }
  console.log('');
}
console.log(`總耗時 ${fmt((performance.now() - t0) / 1000)}s`);

function printDetail(row: Row): void {
  const { setup } = row;
  const gear = Object.values(setup.gear).filter((g): g is EquipmentInstance => !!g);
  const frozen = getFrozenGear(setup.character, setup.effects, gear);
  for (const g of gear) {
    const affixes = g.affixes.map(a => `${a.type} ${a.value}${a.sealed ? '(封)' : ''}`).join('、');
    console.log(`    - ${g.slot} ${g.name}+${g.enhancement} 防${g.defense ?? 0}｜${affixes}${g.uniqueAffix ? `｜獨 ${g.uniqueAffix.type} ${g.uniqueAffix.value}` : ''}`
      + `${g.ability ? `｜技 ${g.ability.type}` : ''}${frozen.has(g) ? '｜**凍結**' : ''}`);
  }
  const bonuses = getCombatBonuses(gear, setup.effects);
  const def = getEffectiveDefense(gear, setup.effects, bonuses.defense);
  console.log(`    - 實際防禦 ${def}（物理減傷 ${Math.min(def, 75)}%）、迴避率 ${fmt(getPlayerDodgeRate(setup.character, gear, setup.effects))}%`
    + `、藥水效果 +${fmt(bonuses.potion_effect ?? 0)}%、戰前 buff：${setup.effects.map(e => e.name).join('、') || '無'}`);
  for (const sk of setup.skills.filter(x => x.type === 'heal')) {
    const scaled = healPower(sk);
    const before = calculateHealAmount(setup.character, sk.power, gear, setup.effects);
    const after = calculateHealAmount(setup.character, scaled, gear, setup.effects);
    console.log(`    - 補血 ${sk.name}：威力 ${sk.power}→${scaled}，每次補 ${before}→${after}（MP ${sk.mpCost}、冷卻 ${sk.cooldown / 1000}s）`);
  }
  const r = row.results[0];
  const min = r.ms / 60_000;
  const acts = Object.entries(r.actions).sort((a, b) => b[1] - a[1]);
  const total = acts.reduce((sum, [, n]) => sum + n, 0) || 1;
  console.log(`    - 第 1 場 ${fmt(min)} 分：行動 ${acts.map(([k, n]) => `${k} ${fmt((n / total) * 100, 0)}%`).join('、')}`);
  console.log(`    - 受到攻擊 ${fmt(r.monsterHits / min, 0)} 次／分（迴避 ${fmt(r.dodges / min, 0)}）、受傷 ${fmt(r.damageTaken / min, 0)}／分；`
    + `補血 ${Object.entries(r.heals).map(([k, v]) => `${k} ${fmt(v / min, 0)}`).join('、')}（／分）`);
}
