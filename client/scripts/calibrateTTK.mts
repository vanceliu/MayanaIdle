/**
 * TTK（擊殺時間）校準工具 —— `99-ai-constraints.md` § 99.4 Phase 0。
 *
 * 目的：在「合適等級 × 合適裝備」下量測各職業對一般怪與 Boss 的擊殺秒數，
 * 用來反推武器傷害帶、防具防禦帶與怪物素質縮放係數。
 *
 * 目標區間（使用者確認）：
 *   一般怪 2~6 秒、Boss 30~50 秒
 *
 * 設計原則（沿用 `simulateReaperKill.mts`）：
 *  - **直接 import `src/systems/combat.ts` 的真實函式**，不重寫任何傷害公式
 *  - 怪物讀 `monsterSeeds.ts`、裝備讀 `equipmentSeeds.ts`、技能讀 `skill.ts` / `classSkills.ts`
 *  - 技能可學性走真實的 `skillRestrictions.ts` 與 `classSkills.ts` 的 `requiredLevel`
 *  - maxHp / maxMp 用真實的 `tryLevelUp()` 從 Lv.1 練上來
 *  - `Math.random` 以 mulberry32 固定種子覆寫，結果可重現
 *  - 重現 `playerCombatFSM` 的「一 tick 一動作」與 60fps 幀邊界
 *
 * 與 `simulateReaperKill.mts` 的差異：
 *  - 該腳本鎖定 Lv.75 vs 百柱死神的極限配裝（含 +9 強化、T7 詞綴、滿 buff）
 *  - 本腳本掃描整條成長曲線，裝備取「該階梯可得的最佳解」，強化值預設 0
 *  - INT 交給 combat.ts 原生處理（本腳本不做規則組試算，因此不需要歸零再加回）
 *
 * 用法：
 *   cd client && npx vite-node scripts/calibrateTTK.mts
 *   npx vite-node scripts/calibrateTTK.mts --stage=craft-top --class=knight
 *   npx vite-node scripts/calibrateTTK.mts --runs=500 --enhance=4
 */
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculateBasePhysicalDamage,
  getPlayerAttackInterval,
  getCombatBonuses,
  getTotalMagicAttack,
  getTotalDefense,
  getAffixBonusesFromGear,
  hasActiveFireEnchant,
  COOLDOWN_REDUCTION_CAP,
  getIntCooldownReduction,
} from '../src/systems/combat';
import { ATTRIBUTE_KEYS, getEffectiveINT, getEffectiveSTR, getTotalAttributes } from '../src/models/character';
import { getExpToNextLevel, INITIAL_HP, INITIAL_MP, tryLevelUp } from '../src/systems/levelUp';
import { getMpRegen, MP_REGEN_INTERVAL_MS } from '../src/systems/regen';
import { getLearnableMaxLevel, CLASS_MAGIC_RESTRICTIONS } from '../src/models/skillRestrictions';
import type { Attributes, Character, ClassName } from '../src/models/character';
import type { EquipmentInstance, EquipmentTemplate, EquipSlot } from '../src/models/equipment';
import type { MonsterInstance, MonsterTemplate } from '../src/models/monster';
import type { ActiveEffect, StatModifier } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import { SKILL_CATALOG } from '../src/models/skill';
import { CLASS_SKILLS } from '../src/models/classSkills';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';

// ---------------------------------------------------------------- RNG

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const nativeRandom = Math.random;
function withSeed<T>(seed: number, fn: () => T): T {
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = nativeRandom;
  }
}

// ---------------------------------------------------------------- 參數

function argOf(name: string): string | undefined {
  return process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
}

const RUNS = Number(argOf('runs') ?? 300);
/**
 * 校準 profile（§ 99.4 決策 5a）：
 *  - `god`（預設）：**神裝** —— +9 強化、該階梯詞綴上限、滿 buff（含加速），打**弱怪**。
 *    2~5 秒的農法手感只在這個條件下成立。
 *  - `base`：+0 強化、無加速 buff、打同級怪。用來觀察「裝備不夠力」時的手感，
 *    這條線**偏慢是正確的**，不是要修的偏差。
 */
const PROFILE = (argOf('profile') ?? 'god') as 'god' | 'base';
const IS_GOD = PROFILE === 'god';
const ENHANCE = Number(argOf('enhance') ?? (IS_GOD ? 9 : 0));
const ONLY_STAGE = argOf('stage');
const ONLY_CLASS = argOf('class') as ClassName | undefined;
/**
 * 求解模式：二分搜尋「命中目標 TTK 所需的武器均傷」，用來反推素質曲線（Phase 1）。
 * 對法系而言武器基傷影響極小，因此改解「裝備魔攻」（技能傷害的固定值加算來源）。
 */
const SOLVE = process.argv.includes('--solve');
/** 求解的目標 TTK（秒）。一般怪取 2~6 的中位、Boss 取 30~50 的中位。 */
const SOLVE_NORMAL_TARGET = Number(argOf('target-normal') ?? 4);
const SOLVE_BOSS_TARGET = Number(argOf('target-boss') ?? 40);

/** PixiJS ticker 60fps —— 行動只在幀邊界觸發 */
const FRAME_MS = 1000 / 60;
/** gameLoop.ts DOT_TICK_INTERVAL */
const DOT_TICK_MS = 1000;
/** 打不死就中止 */
const TIMEOUT_MS = 5 * 60 * 1000;

const TTK_NORMAL_MIN = 2;
const TTK_NORMAL_MAX = 5;
const TTK_BOSS_MIN = 30;
const TTK_BOSS_MAX = 50;

const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const CLASS_ZH: Record<ClassName, string> = {
  knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊',
};

// ---------------------------------------------------------------- 階梯定義

interface Stage {
  id: string;
  label: string;
  /** 該階梯的「合適等級」—— 取區域等級帶的中位 */
  level: number;
  acquire: 'shop' | 'craft';
  /** 裝備階級（§ 6A.8）。T1~T3 商店、T4~T7 鐵匠 */
  tier: number;
  /** 該階梯裝備的詞綴 Tier 上限（商店 T3 為 § 99.4 決策 1） */
  affixTier: number;
  /** 同級一般怪的等級帶（`--profile=base` 用） */
  monsterLevel: [number, number];
  /**
   * 弱怪等級帶（`--profile=god` 用）—— 取前一階梯的農怪帶。
   * 神裝玩家回頭刷這一段收素材，2~5 秒的農法手感指的就是這個情境。
   */
  weakMonsterLevel: [number, number];
  /**
   * 對照用的 Boss 名稱。`null` = 該等級帶依設計就沒有 Boss。
   * 新手區（Lv.1~29）不設 Boss 是既有設計（§ 99.4 決策 8），不是缺口。
   */
  bossName: string | null;
  /**
   * 新手期（§ 99.4 決策 8）：前期不應有難度，因此只設上限、不設下限 ——
   * 打得比 2 秒更快是可接受的，不算偏離。
   */
  newbie?: boolean;
}

/**
 * 等級與區域的對應見 `09-dungeon.md`；Boss 對應見 `28-monster-stats.md`。
 * 商店三階對應 Lv.1~30 的新手中立區，製作三階對應 Lv.30~60。
 *
 * **Boss 選擇原則**（§ 99.4 決策 5）：Boss 不是可以一直刷的等級，
 * 因此一律挑「高於該階梯農怪等級帶」的挑戰目標，而不是同級 Boss。
 * 目前 Boss 等級上限為 Lv.60，故 craft-top 只能取同級中最硬的百柱死神。
 */
const STAGES: Stage[] = [
  { id: 'shop-low', label: '商店低階', level: 8, acquire: 'shop', tier: 1, affixTier: 3, monsterLevel: [6, 10], weakMonsterLevel: [1, 5], bossName: null, newbie: true },
  { id: 'shop-mid', label: '商店中階', level: 18, acquire: 'shop', tier: 2, affixTier: 3, monsterLevel: [16, 20], weakMonsterLevel: [6, 10], bossName: null, newbie: true },
  { id: 'shop-high', label: '商店高階', level: 28, acquire: 'shop', tier: 3, affixTier: 3, monsterLevel: [26, 30], weakMonsterLevel: [16, 20], bossName: '試煉飛龍' },      // Lv.30（+2，現有最低 Boss）
  { id: 'craft-entry', label: '製作入門', level: 38, acquire: 'craft', tier: 4, affixTier: 5, monsterLevel: [34, 40], weakMonsterLevel: [26, 30], bossName: '象牙塔惡魔' }, // Lv.45（+7）
  { id: 'craft-mid', label: '製作進階', level: 50, acquire: 'craft', tier: 5, affixTier: 5, monsterLevel: [46, 52], weakMonsterLevel: [34, 40], bossName: '不死殭屍王' },     // Lv.57（+7）
  { id: 'craft-top', label: '製作頂級', level: 60, acquire: 'craft', tier: 6, affixTier: 5, monsterLevel: [56, 62], weakMonsterLevel: [46, 52], bossName: '百柱死神' },       // Lv.60（同級但最硬）
];

// ---------------------------------------------------------------- 角色

/** § 44.4：建角 80 點（單項上限 18） */
const CREATION_ATTRIBUTES: Record<ClassName, Attributes> = {
  knight: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
  elf: { STR: 18, AGI: 16, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
  elementalist: { STR: 8, AGI: 8, VIT: 18, SPI: 16, INT: 18, CHA: 12 },
  priest: { STR: 6, AGI: 8, VIT: 18, SPI: 15, INT: 18, CHA: 15 },
  thief: { STR: 18, AGI: 18, VIT: 12, SPI: 10, INT: 12, CHA: 10 },
};

/** § 44.4：Lv.51 起每級 +1 點，投主攻屬性優先 */
const LEVELUP_PRIORITY: Record<ClassName, (keyof Attributes)[]> = {
  knight: ['STR', 'VIT'],
  elf: ['STR', 'AGI'],
  elementalist: ['INT', 'VIT'],
  priest: ['INT', 'VIT'],
  thief: ['STR', 'AGI'],
};

/** Lv.51 起每級 1 點；主攻屬性先推到 35（§ 20.10 的軟上限），再投次要屬性 */
function allocateLevelPoints(className: ClassName, level: number): Attributes {
  const out: Attributes = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
  let points = Math.max(0, level - 50);
  const base = CREATION_ATTRIBUTES[className];
  for (const key of LEVELUP_PRIORITY[className]) {
    if (points <= 0) break;
    const room = Math.max(0, 35 - base[key]);
    const take = Math.min(room, points);
    out[key] = take;
    points -= take;
  }
  return out;
}

/** 用真實的 `tryLevelUp()` 從 Lv.1 練到目標等級，取得實際 maxHp / maxMp */
function levelUpTo(base: Attributes, bonusAt: (lv: number) => Attributes, target: number): { maxHp: number; maxMp: number } {
  let char = {
    name: 'sim', className: 'knight', level: 1, exp: 0, expToNext: getExpToNextLevel(1),
    hp: INITIAL_HP, maxHp: INITIAL_HP, mp: INITIAL_MP, maxMp: INITIAL_MP,
    baseAttributes: base,
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: '', currentZone: '', currentRegion: '', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as unknown as Character;

  while (char.level < target) {
    char = tryLevelUp({ ...char, exp: char.expToNext });
    char = { ...char, bonusAttributes: bonusAt(char.level) };
  }
  return { maxHp: char.maxHp, maxMp: char.maxMp };
}

function buildCharacter(className: ClassName, level: number): Character {
  const base = CREATION_ATTRIBUTES[className];
  const bonus = allocateLevelPoints(className, level);
  const { maxHp, maxMp } = withSeed(1234, () =>
    levelUpTo(base, lv => allocateLevelPoints(className, lv), level));

  return {
    name: `Lv${level}-${className}`,
    className,
    level,
    exp: 0,
    expToNext: 1,
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    baseAttributes: base,
    bonusAttributes: bonus,
    gold: 0,
    currentArea: '',
    currentZone: '',
    currentRegion: '',
    currentFloor: null,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: 0,
    createdAt: 0,
    userId: 1,
  } as unknown as Character;
}

// ---------------------------------------------------------------- 怪物

function toInstance(t: MonsterTemplate): MonsterInstance {
  return {
    templateId: t.id!,
    name: t.name,
    level: t.level,
    currentHp: t.hp,
    maxHp: t.hp,
    attackMin: t.attackMin,
    attackMax: t.attackMax,
    defense: t.defense,
    exp: t.exp,
    race: t.race,
    size: t.size,
    element: t.element,
    isBoss: t.isBoss,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1200,
    debuffs: t.debuffs,
  } as MonsterInstance;
}

/** 取該等級帶的一般怪代表值：HP／防禦取中位數，避免被單一極端怪帶偏 */
function representativeNormal(stage: Stage): MonsterInstance {
  const [lo, hi] = IS_GOD ? stage.weakMonsterLevel : stage.monsterLevel;
  const pool = MONSTER_SEEDS.filter(m => !m.isBoss && m.level >= lo && m.level <= hi);
  if (pool.length === 0) throw new Error(`${stage.id}: 找不到 Lv.${lo}~${hi} 的一般怪`);
  const median = <T>(arr: T[], f: (x: T) => number): number => {
    const s = arr.map(f).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const proto = pool[Math.floor(pool.length / 2)];
  return {
    ...toInstance(proto),
    name: `Lv${lo}~${hi} ${IS_GOD ? '弱怪' : '同級怪'}(中位)`,
    level: Math.round((lo + hi) / 2),
    currentHp: median(pool, m => m.hp),
    maxHp: median(pool, m => m.hp),
    defense: median(pool, m => m.defense),
    attackMin: median(pool, m => m.attackMin),
    attackMax: median(pool, m => m.attackMax),
  };
}

function bossOf(stage: Stage): MonsterInstance | null {
  if (!stage.bossName) return null;
  const t = MONSTER_SEEDS.find(m => m.name === stage.bossName);
  if (!t) throw new Error(`${stage.id}: 找不到 Boss ${stage.bossName}`);
  return toInstance(t);
}

// ---------------------------------------------------------------- 裝備

type AffixType = 'attack_power' | 'attack_elemental' | 'skill_elemental' | 'crit_rate'
  | 'crit_damage' | 'attack_speed' | 'cooldown_reduction' | 'defense' | 'max_hp' | 'max_mp';

/** 攻擊型詞綴（武器池）；防具／飾品／魔導書走 armor 池，沒有攻擊詞綴（`07-affix.md` § 7.6） */
const WEAPON_AFFIXES: AffixType[] = ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed'];
const ARMOR_AFFIXES: AffixType[] = ['defense', 'max_hp', 'max_mp'];

/** 取該 Tier 的數值上緣（`07-affix.md` § 7.3 通用表）。校準取上緣＝該階梯的理論最佳解。 */
const TIER_MAX: Record<number, number> = { 1: 5, 2: 8, 3: 11, 4: 13, 5: 15, 6: 18, 7: 20 };

function makeItem(tpl: EquipmentTemplate, affixTypes: AffixType[], affixTier: number, enhancement: number): EquipmentInstance {
  return {
    ...tpl,
    templateId: tpl.id!,
    quality: 0,
    enhancement,
    affixes: affixTypes.map(type => ({ type, tier: affixTier, value: TIER_MAX[affixTier] })),
    ownerId: 1,
    equipped: true,
  } as EquipmentInstance;
}

const canUse = (t: EquipmentTemplate, c: ClassName) => !t.requiredClass || t.requiredClass.includes(c);

function inStage(t: EquipmentTemplate, stage: Stage): boolean {
  return t.tier === stage.tier;
}

/** 法系主手類型（`06-equipment.md` § 6.7 元素師／牧師的主力類型） */
const CASTER_WEAPON_TYPES = new Set(['staff', 'twoHandStaff']);

/**
 * 該階梯可得的最佳主手。
 *
 * 法系（元素師／牧師）**限定法杖類**：輸出來自技能（吃 INT 與裝備魔攻），
 * 武器基傷幾乎不影響 DPS，若單純比基傷會選到木棍之類的鈍器，與職業設計不符。
 */
function pickWeapon(className: ClassName, stage: Stage): EquipmentTemplate {
  const isCaster = className === 'elementalist' || className === 'priest';
  const usable = (t: EquipmentTemplate) =>
    t.slot === 'rightHand' && t.type !== 'armor' && canUse(t, className)
    && (!isCaster || CASTER_WEAPON_TYPES.has(String(t.type)));

  const score = (t: EquipmentTemplate): number => {
    const dmg = ((t.smallMonsterDamage ?? 0) + (t.largeMonsterDamage ?? 0)) / 2;
    // 法系以「回魔 + 附加智力 + 基傷」排序，貼近實際選裝邏輯
    return isCaster
      ? dmg + (t.mpRegen ?? 0) * 0.5 + (t.bonusAttributes?.INT ?? 0) * 5
      : dmg;
  };

  const cands = EQUIPMENT_SEEDS.filter(t => usable(t) && inStage(t, stage));
  if (cands.length > 0) return cands.sort((a, b) => score(b) - score(a))[0];

  // 該階梯無可用主手 —— 退回同管道任一階，由 missing 標記
  const fallback = EQUIPMENT_SEEDS.filter(t => usable(t) && t.acquireType === stage.acquire);
  if (fallback.length > 0) return fallback.sort((a, b) => score(b) - score(a))[0];
  const any = EQUIPMENT_SEEDS.filter(usable);
  if (any.length === 0) throw new Error(`${className}/${stage.id}: 完全找不到主手`);
  return any.sort((a, b) => score(b) - score(a))[0];
}

function pickSlot(className: ClassName, stage: Stage, slot: EquipSlot, key: (t: EquipmentTemplate) => number): EquipmentTemplate | null {
  const cands = EQUIPMENT_SEEDS.filter(t => t.slot === slot && canUse(t, className) && inStage(t, stage));
  if (cands.length === 0) return null;
  return cands.sort((a, b) => key(b) - key(a))[0];
}

interface Loadout {
  weapon: EquipmentInstance;
  gear: (EquipmentInstance | null)[];
  weaponName: string;
  offhandName: string;
  missing: string[];
}

function buildLoadout(className: ClassName, stage: Stage): Loadout {
  const missing: string[] = [];
  const wTpl = pickWeapon(className, stage);
  const weapon = makeItem(wTpl, WEAPON_AFFIXES, stage.affixTier, ENHANCE);
  const gear: (EquipmentInstance | null)[] = [weapon];

  let offhandName = wTpl.isTwoHanded ? '（雙手佔用）' : '無';
  if (!wTpl.isTwoHanded) {
    // 副手：法系優先魔導書（魔攻），其餘優先盾牌（防禦）
    const isCaster = className === 'elementalist' || className === 'priest';
    const off = pickSlot(className, stage, 'leftHand',
      t => (isCaster ? (t.magicAttack ?? 0) * 10 : 0) + (t.defense ?? 0));
    if (off) {
      gear.push(makeItem(off, ARMOR_AFFIXES, stage.affixTier, ENHANCE));
      offhandName = off.name;
    } else {
      missing.push('副手');
    }
  }

  const armorSlots: EquipSlot[] = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace', 'ring1', 'ring1'];
  for (const slot of armorSlots) {
    const tpl = pickSlot(className, stage, slot, t => (t.defense ?? 0) + (t.bonusHp ?? 0) / 10 + (t.bonusMp ?? 0) / 10);
    if (tpl) {
      gear.push(makeItem(tpl, ARMOR_AFFIXES, stage.affixTier, ENHANCE));
    } else {
      missing.push(slot);
    }
  }

  return { weapon, gear, weaponName: wTpl.name, offhandName, missing };
}

// ---------------------------------------------------------------- Buff / 技能

function makeBuff(id: string, category: string, modifiers: StatModifier[]): ActiveEffect {
  return {
    id, sourceSkillId: id, sourceSkillName: id, category,
    type: 'buff', target: 'player', modifiers,
    startTime: 0, duration: Number.MAX_SAFE_INTEGER,
    tags: [], name: id, description: '',
  };
}

type ActionKind = 'normal' | 'magic_skill' | 'physical_skill' | 'self_buff';

interface RotationEntry {
  id: string;
  name: string;
  kind: ActionKind;
  power?: number;
  element?: string;
  ignoreDefensePercent?: number;
  hits?: number;
  cooldown: number;
  mpCost: number;
  mpDrainRatio?: number;
  selfBuff?: { category: string; modifiers: StatModifier[]; duration: number };
  dot?: { category: string; percent: number; interval: number; duration: number };
  buff?: { category: string; modifiers: StatModifier[]; duration: number };
}

function magicEntry(s: Omit<Skill, 'lastUsedAt'>): RotationEntry {
  return {
    id: s.id, name: s.name, kind: 'magic_skill',
    power: s.power, element: s.element,
    ignoreDefensePercent: s.ignoreDefensePercent ?? 0,
    cooldown: s.cooldown,
    mpCost: s.mpCost,
    mpDrainRatio: s.mpDrainRatio,
  };
}

/** 戰前開好的長效 buff（duration ≥ 300s）：取該等級學得到的職業 buff 技能 */
function preCombatBuffs(className: ClassName, level: number): ActiveEffect[] {
  const out: ActiveEffect[] = [];
  for (const cs of CLASS_SKILLS) {
    if (cs.className !== className) continue;
    if (cs.requiredLevel > level) continue;
    const s = cs.skill;
    if (s.type !== 'buff' || !s.buffModifiers) continue;
    if ((s.buffDuration ?? 0) < 300_000) continue; // 短效 buff 進輪替，不算戰前
    out.push(makeBuff(s.name, s.buffCategory ?? s.id, s.buffModifiers));
  }
  // 基礎魔法的長效增益（力量提升／敏捷提升／加速術等）
  const maxMagicLv = getLearnableMaxLevel(className, level);
  for (const s of SKILL_CATALOG) {
    if (s.type !== 'buff' || !s.buffModifiers) continue;
    if (s.level > maxMagicLv) continue;
    if ((s.buffDuration ?? 0) < 300_000) continue;
    out.push(makeBuff(s.name, s.buffCategory ?? s.id, s.buffModifiers));
  }
  // 同 category 互斥：後者覆蓋前者，保留每個 category 的最後一個
  const byCategory = new Map<string, ActiveEffect>();
  for (const e of out) byCategory.set(e.category, e);

  // 神裝＝滿狀態：補上加速來源。加速術／強化加速術／綠色藥水同屬 category 'speed'，四者互斥，
  // 因此學不到加速術的職業（騎士 Lv.1 上限、盜賊 Lv.4 上限）改用綠色藥水 +33%（`30-items.md`）。
  if (IS_GOD && !byCategory.has('speed')) {
    byCategory.set('speed', makeBuff('綠色藥水', 'speed', [{ stat: 'attack_speed', value: 33, isPercent: true }]));
  }
  return [...byCategory.values()];
}

function buildRotation(className: ClassName, level: number, weaponType: string): RotationEntry[] {
  const r: RotationEntry[] = [];

  for (const cs of CLASS_SKILLS) {
    if (cs.className !== className) continue;
    if (cs.requiredLevel > level) continue;
    const s = cs.skill;

    if (s.type === 'buff') {
      // 短效 buff 進輪替（長效的已在 preCombatBuffs）
      if ((s.buffDuration ?? 0) >= 300_000 || !s.buffModifiers) continue;
      r.push({
        id: s.id, name: s.name, kind: 'self_buff', cooldown: s.cooldown, mpCost: s.mpCost,
        buff: { category: s.buffCategory ?? s.id, duration: s.buffDuration!, modifiers: s.buffModifiers },
      });
      continue;
    }
    if (s.type !== 'attack') continue;

    // 需要特定武器類型的技能（如三連射需要弓）
    if (s.requiredWeaponType && s.requiredWeaponType !== weaponType) continue;

    if (s.hits && s.hits > 1) {
      r.push({ id: s.id, name: s.name, kind: 'physical_skill', hits: s.hits, cooldown: s.cooldown, mpCost: s.mpCost });
      continue;
    }
    const entry = magicEntry(s);
    if (s.applyDebuff?.dotDamagePercent) {
      entry.dot = {
        category: s.applyDebuff.category,
        percent: s.applyDebuff.dotDamagePercent,
        interval: s.applyDebuff.dotInterval ?? 1000,
        duration: s.applyDebuff.dotDuration ?? 5000,
      };
    }
    if (s.selfBuff) {
      entry.selfBuff = {
        category: s.selfBuff.category ?? s.id,
        modifiers: s.selfBuff.modifiers ?? [],
        duration: s.selfBuff.duration ?? 5000,
      };
    }
    r.push(entry);
  }

  // 基礎魔法攻擊技：依威力排序取到學習上限
  const maxMagicLv = getLearnableMaxLevel(className, level);
  const budget = CLASS_MAGIC_RESTRICTIONS[className].maxSkills;
  const attackBasics = SKILL_CATALOG
    .filter(s => s.type === 'attack' && s.level <= maxMagicLv && (s.power ?? 0) > 0)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
    .slice(0, budget);
  for (const s of attackBasics) r.push(magicEntry(s));

  return r;
}

// ---------------------------------------------------------------- 校準（動作排序）

const CALIBRATION_SAMPLES = 2_000;

/** 把「打不贏普攻」的技能剔除，再依單次期望傷害排序（一 tick 只能做一件事） */
function orderRotation(
  char: Character, loadout: Loadout, rotation: RotationEntry[],
  effects: ActiveEffect[], monster: MonsterInstance, seed: number,
): RotationEntry[] {
  const avg = new Map<string, number>();
  let normalAvg = 0;

  withSeed(seed, () => {
    let sum = 0;
    for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
      const r = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      sum += r.hit ? r.damage : 0;
    }
    normalAvg = sum / CALIBRATION_SAMPLES;

    for (const e of rotation) {
      if (e.kind === 'self_buff') { avg.set(e.name, Number.POSITIVE_INFINITY); continue; }
      let s = 0;
      for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
        if (e.kind === 'physical_skill') {
          const fire = hasActiveFireEnchant(effects);
          for (let h = 0; h < (e.hits ?? 1); h++) {
            const r = calculatePhysicalSkillHit(char, loadout.weapon, monster, loadout.gear, fire, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
            s += r.hit ? r.damage : 0;
          }
        } else {
          const r = calculateSkillAttack(char, e.power ?? 0, e.element ?? 'none', monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
          s += r.damage;
        }
      }
      let v = s / CALIBRATION_SAMPLES;
      if (e.dot) {
        const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
        const tick = Math.max(1, Math.floor(base * e.dot.percent));
        v += tick * Math.floor(e.dot.duration / e.dot.interval);
      }
      avg.set(e.name, v);
    }
  });

  return rotation
    .filter(e => e.kind === 'self_buff' || (avg.get(e.name) ?? 0) > normalAvg)
    .sort((a, b) => {
      if (a.kind === 'self_buff' && b.kind !== 'self_buff') return -1;
      if (b.kind === 'self_buff' && a.kind !== 'self_buff') return 1;
      return (avg.get(b.name) ?? 0) - (avg.get(a.name) ?? 0);
    });
}

// ---------------------------------------------------------------- 模擬

interface DotState { category: string; damage: number; nextTick: number; expiresAt: number }

/**
 * 跨擊殺延續的狀態。連續農怪時 MP／冷卻／buff 不會在每隻怪之間重置 ——
 * 只模擬單隻怪會高估「起手爆發」型職業（如妖精三連射）的持續輸出。
 */
interface ChainState {
  mp: number;
  clock: number;
  cooldowns: Record<string, number>;
}

function simulateOnce(
  char: Character, loadout: Loadout, rotation: RotationEntry[],
  baseEffects: ActiveEffect[], monsterProto: MonsterInstance,
  maxMp: number, regenPerTick: number,
  chain?: ChainState,
): number {
  const monster: MonsterInstance = { ...monsterProto, currentHp: monsterProto.maxHp };
  const effects: ActiveEffect[] = [...baseEffects];
  const timed: { effect: ActiveEffect; expiresAt: number }[] = [];
  const cooldowns: Record<string, number> = chain ? chain.cooldowns : {};
  const dots: DotState[] = [];

  // 連續農怪：MP 與冷卻延續自上一隻怪；單次模式則從滿魔開始
  const startedAt = chain ? chain.clock : 0;
  let now = startedAt;
  let nextAction = startedAt;
  let currentMp = chain ? chain.mp : maxMp;
  let nextMpTick = startedAt + MP_REGEN_INTERVAL_MS;

  const expire = (t: number) => {
    for (let i = timed.length - 1; i >= 0; i--) {
      if (timed[i].expiresAt <= t) {
        const idx = effects.indexOf(timed[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timed.splice(i, 1);
      }
    }
  };
  const addTimed = (e: ActiveEffect, duration: number) => {
    for (let i = timed.length - 1; i >= 0; i--) {
      if (timed[i].effect.category === e.category) {
        const idx = effects.indexOf(timed[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timed.splice(i, 1);
      }
    }
    effects.push(e);
    timed.push({ effect: e, expiresAt: now + duration });
  };
  const hit = (dmg: number) => { monster.currentHp = Math.max(0, monster.currentHp - dmg); };

  while (monster.currentHp > 0 && now - startedAt < TIMEOUT_MS) {
    const nextDot = dots.length ? Math.min(...dots.map(d => d.nextTick)) : Infinity;
    now = Math.min(nextAction, nextDot, nextMpTick);
    expire(now);

    while (now >= nextMpTick) {
      currentMp = Math.min(maxMp, currentMp + regenPerTick);
      nextMpTick += MP_REGEN_INTERVAL_MS;
    }

    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (d.nextTick > now) continue;
      if (now >= d.expiresAt) { dots.splice(i, 1); continue; }
      hit(d.damage);
      d.nextTick += DOT_TICK_MS;
      if (d.nextTick >= d.expiresAt) dots.splice(i, 1);
    }
    if (monster.currentHp <= 0) break;
    if (now < nextAction) continue;

    const cdr = Math.min(
      COOLDOWN_REDUCTION_CAP,
      getCombatBonuses(loadout.gear, effects).cooldown_reduction + getIntCooldownReduction(char, effects, loadout.gear),
    );
    const entry = rotation.find(e => {
      if ((cooldowns[e.id] ?? -Infinity) > now) return false;
      if (currentMp < e.mpCost) return false;
      if (e.kind === 'self_buff') return !effects.some(x => x.category === e.buff!.category);
      if (e.dot) return !dots.some(d => d.category === e.dot!.category);
      return true;
    }) ?? null;

    if (!entry) {
      const res = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      if (res.hit) hit(res.damage);
    } else if (entry.kind === 'self_buff') {
      currentMp -= entry.mpCost;
      addTimed(makeBuff(entry.name, entry.buff!.category, entry.buff!.modifiers), entry.buff!.duration);
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else if (entry.kind === 'physical_skill') {
      currentMp -= entry.mpCost;
      const fire = hasActiveFireEnchant(effects);
      for (let h = 0; h < (entry.hits ?? 1); h++) {
        const res = calculatePhysicalSkillHit(char, loadout.weapon, monster, loadout.gear, fire, entry.name, effects, 0, entry.ignoreDefensePercent ?? 0);
        if (res.hit) hit(res.damage);
      }
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else {
      currentMp -= entry.mpCost;
      if (entry.selfBuff) addTimed(makeBuff(entry.name, entry.selfBuff.category, entry.selfBuff.modifiers), entry.selfBuff.duration);
      const res = calculateSkillAttack(char, entry.power ?? 0, entry.element ?? 'none', monster, loadout.gear, entry.name, effects, 0, entry.ignoreDefensePercent ?? 0);
      hit(res.damage);
      if (entry.mpDrainRatio) currentMp = Math.min(maxMp, currentMp + Math.floor(res.damage * entry.mpDrainRatio));
      if (entry.dot && !dots.some(d => d.category === entry.dot!.category)) {
        const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
        dots.push({
          category: entry.dot.category,
          damage: Math.max(1, Math.floor(base * entry.dot.percent)),
          nextTick: now + entry.dot.interval,
          expiresAt: now + entry.dot.duration,
        });
      }
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    }

    nextAction = Math.ceil((now + getPlayerAttackInterval(loadout.gear, effects)) / FRAME_MS) * FRAME_MS;
  }

  if (chain) {
    chain.mp = currentMp;
    chain.clock = now;
  }
  return monster.currentHp <= 0 ? now - startedAt : Number.NaN;
}

/** 有效最大 MP（公式同 `gameStore.ts` 的 getEffectiveMaxMp） */
function effectiveMaxMp(char: Character, gear: (EquipmentInstance | null)[]): number {
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = getAffixBonusesFromGear(items);
  const flatMp = items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0);
  return Math.floor((char.maxMp + flatMp) * (1 + bonuses.max_mp / 100));
}

interface Result {
  stage: Stage;
  className: ClassName;
  weaponName: string;
  offhandName: string;
  weaponDamage: number;
  gearDefense: number;
  gearMagicAttack: number;
  effSTR: number;
  effINT: number;
  normalTtk: number;
  /** `null` = 該階梯沒有等級相稱的 Boss */
  bossTtk: number | null;
  missing: string[];
  /** `--solve` 模式：命中目標 TTK 所需的武器均傷（法系為裝備魔攻） */
  solved?: { normal: number; boss: number | null; unit: string };
}

/** 是否為法系（輸出來自技能，武器基傷幾乎不影響 DPS） */
const isCasterClass = (c: ClassName) => c === 'elementalist' || c === 'priest';

/**
 * 把 loadout 的輸出強度改成指定值後重新量測。
 * 近戰改武器基傷（`calculateBasePhysicalDamage` 取小怪/大怪均值），
 * 法系改主手魔攻（`getTotalMagicAttack` 以固定值加算進技能傷害，§ 21.4）。
 */
function withPower(loadout: Loadout, className: ClassName, power: number): Loadout {
  const w = { ...loadout.weapon } as EquipmentInstance;
  if (isCasterClass(className)) {
    w.magicAttack = power;
  } else {
    w.smallMonsterDamage = power;
    w.largeMonsterDamage = power;
  }
  const gear = loadout.gear.map(g => (g === loadout.weapon ? w : g));
  return { ...loadout, weapon: w, gear };
}

/**
 * 一般怪的持續農怪串長度。MP／冷卻跨怪延續，取後段的平均值 ——
 * 前幾隻是「滿魔起手爆發」，不能代表持續輸出（§ 使用者指正：妖精不會一直放三連射）。
 */
const CHAIN_LENGTH = 12;
/** 取後 2/3 的擊殺作為穩態樣本，丟掉起手爆發段 */
const CHAIN_WARMUP = Math.floor(CHAIN_LENGTH / 3);

function measureTTK(
  char: Character, loadout: Loadout, candidates: RotationEntry[], effects: ActiveEffect[],
  target: MonsterInstance, maxMp: number, regen: number, seed: number, runs: number,
  sustained: boolean,
): number {
  const rotation = orderRotation(char, loadout, candidates, effects, target, seed + 900_000);
  const times: number[] = [];
  withSeed(seed, () => {
    for (let i = 0; i < runs; i++) {
      if (!sustained) {
        // Boss：單場戰鬥，滿魔開打（`44-dps-prediction.md` 的前提）
        const t = simulateOnce(char, loadout, rotation, effects, target, maxMp, regen);
        if (!Number.isNaN(t)) times.push(t);
        continue;
      }
      // 一般怪：連續擊殺，MP 與冷卻延續
      const chain: ChainState = { mp: maxMp, clock: 0, cooldowns: {} };
      for (let k = 0; k < CHAIN_LENGTH; k++) {
        const t = simulateOnce(char, loadout, rotation, effects, target, maxMp, regen, chain);
        if (Number.isNaN(t)) break;
        if (k >= CHAIN_WARMUP) times.push(t);
      }
    }
  });
  if (times.length === 0) return Number.POSITIVE_INFINITY;
  return times.reduce((s, t) => s + t, 0) / times.length / 1000;
}

/** 二分搜尋命中目標 TTK 的輸出強度。TTK 對強度單調遞減，因此二分收斂。 */
function solvePower(
  char: Character, loadout: Loadout, className: ClassName, candidates: RotationEntry[],
  effects: ActiveEffect[], target: MonsterInstance, maxMp: number, regen: number,
  seed: number, targetTtk: number, sustained: boolean,
): number {
  let lo = 1;
  let hi = 4096;
  // 求解用較少次數換速度；收斂後的值再由主報告以完整次數複驗
  const runs = Math.max(20, Math.floor(RUNS / 4));
  for (let i = 0; i < 13; i++) {
    const mid = (lo + hi) / 2;
    const ttk = measureTTK(char, withPower(loadout, className, mid), candidates, effects, target, maxMp, regen, seed, runs, sustained);
    if (ttk > targetTtk) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

function run(stage: Stage, className: ClassName): Result {
  const char = buildCharacter(className, stage.level);
  const loadout = buildLoadout(className, stage);
  const effects = preCombatBuffs(className, stage.level);
  const weaponType = String(loadout.weapon.type);
  const candidates = buildRotation(className, stage.level, weaponType);

  const normal = representativeNormal(stage);
  const boss = bossOf(stage);
  const maxMp = effectiveMaxMp(char, loadout.gear);
  const regen = getMpRegen(char, true, loadout.gear, effects);

  const normalSeed = 20_000 + stage.level * 13;
  const bossSeed = 40_000 + stage.level * 17;

  const attrs = getTotalAttributes(char, effects, loadout.gear);
  const w = loadout.weapon;

  const result: Result = {
    stage,
    className,
    weaponName: loadout.weaponName,
    offhandName: loadout.offhandName,
    weaponDamage: ((w.smallMonsterDamage ?? 0) + (w.largeMonsterDamage ?? 0)) / 2 + (w.enhancement ?? 0),
    gearDefense: getTotalDefense(loadout.gear),
    gearMagicAttack: getTotalMagicAttack(loadout.gear),
    effSTR: getEffectiveSTR(attrs.STR),
    effINT: getEffectiveINT(attrs.INT),
    normalTtk: measureTTK(char, loadout, candidates, effects, normal, maxMp, regen, normalSeed, RUNS, true),
    bossTtk: boss ? measureTTK(char, loadout, candidates, effects, boss, maxMp, regen, bossSeed, RUNS, false) : null,
    missing: loadout.missing,
  };

  if (SOLVE) {
    result.solved = {
      normal: solvePower(char, loadout, className, candidates, effects, normal, maxMp, regen, normalSeed, SOLVE_NORMAL_TARGET, true),
      boss: boss ? solvePower(char, loadout, className, candidates, effects, boss, maxMp, regen, bossSeed, SOLVE_BOSS_TARGET, false) : null,
      unit: isCasterClass(className) ? '主手魔攻' : '武器均傷',
    };
  }

  return result;
}

// ---------------------------------------------------------------- 輸出

function verdict(v: number | null, min: number, max: number): string {
  if (v === null) return '無對應Boss';
  if (!Number.isFinite(v)) return '打不死';
  if (v < min) return `過快(-${(min - v).toFixed(1)}s)`;
  if (v > max) return `過慢(+${(v - max).toFixed(1)}s)`;
  return 'OK';
}

function pad(s: string, n: number): string {
  // 中文字寬 2、半形 1
  let w = 0;
  for (const ch of s) w += /[一-鿿＀-￯（）]/.test(ch) ? 2 : 1;
  return s + ' '.repeat(Math.max(0, n - w));
}

const stages = STAGES.filter(s => !ONLY_STAGE || s.id === ONLY_STAGE);
const classes = CLASSES.filter(c => !ONLY_CLASS || c === ONLY_CLASS);
if (stages.length === 0) throw new Error(`未知階梯：${ONLY_STAGE}（可用：${STAGES.map(s => s.id).join(', ')}）`);

console.log('='.repeat(120));
console.log(`TTK 校準　目標：一般怪 ${TTK_NORMAL_MIN}~${TTK_NORMAL_MAX}s、Boss ${TTK_BOSS_MIN}~${TTK_BOSS_MAX}s`);
console.log(`每組 ${RUNS} 次模擬　強化值 +${ENHANCE}　詞綴取該階梯 Tier 上緣`);
console.log('='.repeat(120));

const all: Result[] = [];
for (const stage of stages) {
  const normal = representativeNormal(stage);
  const boss = bossOf(stage);
  console.log(`\n## ${stage.label}（${stage.id}）　Lv.${stage.level}　詞綴上限 T${stage.affixTier}`);
  console.log(`   對照怪：${normal.name} HP${normal.maxHp}/防${normal.defense}　│　Boss：`
    + (boss ? `${boss.name} Lv${boss.level} HP${boss.maxHp}/防${boss.defense}` : '該等級帶無 Boss（最低 Boss 為 Lv.30 試煉飛龍）'));
  console.log(`   ${pad('職業', 8)}${pad('主手', 20)}${pad('副手', 16)}${pad('武器均傷', 10)}${pad('裝備防禦', 10)}${pad('魔攻', 6)}${pad('一般怪', 18)}${pad('Boss', 18)}`);
  for (const className of classes) {
    const r = run(stage, className);
    all.push(r);
    const nv = verdict(r.normalTtk, r.stage.newbie ? 0 : TTK_NORMAL_MIN, TTK_NORMAL_MAX);
    const bv = verdict(r.bossTtk, TTK_BOSS_MIN, TTK_BOSS_MAX);
    const fmt = (v: number | null) => (v === null ? '—' : Number.isFinite(v) ? v.toFixed(1) : '∞');
    console.log(
      `   ${pad(CLASS_ZH[className], 8)}${pad(r.weaponName, 20)}${pad(r.offhandName, 16)}` +
      `${pad(String(r.weaponDamage), 10)}${pad(String(r.gearDefense), 10)}${pad(String(r.gearMagicAttack), 6)}` +
      `${pad(`${fmt(r.normalTtk)}s ${nv}`, 18)}${pad(`${fmt(r.bossTtk)}s ${bv}`, 18)}` +
      (r.solved
        ? `　需求${r.solved.unit}：一般怪 ${r.solved.normal}／Boss ${r.solved.boss ?? '—'}`
        : '')
      + (r.missing.length ? `　缺件：${r.missing.join(',')}` : ''),
    );
  }
}

console.log(`\n${'='.repeat(120)}`);
console.log('## 摘要：偏離目標區間的組合');
let deviations = 0;
for (const r of all) {
  const nv = verdict(r.normalTtk, r.stage.newbie ? 0 : TTK_NORMAL_MIN, TTK_NORMAL_MAX);
  const bv = verdict(r.bossTtk, TTK_BOSS_MIN, TTK_BOSS_MAX);
  if (nv === 'OK' && (bv === 'OK' || bv === '無對應Boss')) continue;
  deviations++;
  console.log(`   ${pad(r.stage.label, 12)}${pad(CLASS_ZH[r.className], 8)}一般怪 ${nv}　Boss ${bv}`);
}
if (deviations === 0) console.log('   （全部落在目標區間內）');
console.log(`\n偏離組合：${deviations} / ${all.length}`);
