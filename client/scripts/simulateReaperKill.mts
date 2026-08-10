/**
 * Lv.75 滿裝角色 vs 百柱死神（百柱塔 100F Boss）擊殺時間模擬。
 *
 * 直接呼叫 `src/systems/combat.ts` 的真實函式，不重寫任何傷害公式；
 * 怪物素質直接讀 `monsterSeeds.ts`、裝備直接讀 `equipmentSeeds.ts`，避免手抄數字。
 *
 * 前提（見 docs/design/44-dps-prediction.md）：
 *  - 目標「擺著不動」：不還手，因此不套用 詛咒／虛弱／暈眩，也不需計算玩家存活
 *  - MP 計入：消耗、每 6 秒的戰鬥中回魔、魔力奪取回魔都算；同時輸出「MP 無限」對照組
 *  - 長效 buff（≥300s）視為戰前已開好；短效 buff／攻擊技能進入輪替，佔用行動 tick
 *
 * 模型依據：
 *  - `playerCombatFSM.ts:96-99`：一個攻擊 tick 只能做一件事（放技能 or 普攻）
 *  - `combat.ts:362-366`：interval = max(300, floor(1200 / (1 + 攻速%/100)))
 *  - `PixiGame.tsx:610`：DoT 直接扣血，**不吃怪物防禦減傷**
 *  - `gameLoop.ts` DOT_TICK_INTERVAL = 1000ms
 *  - `regen.ts` MP_REGEN_INTERVAL_MS = 6000ms（戰鬥中回魔減半）
 *
 * 用法：npx vite-node scripts/simulateReaperKill.mts
 */
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculatePhysicalSnapshotSkill,
  calculateBasePhysicalDamage,
  getPlayerAttackInterval,
  getCombatBonuses,
  getTotalMagicAttack,
  getTotalDefense,
  getWeaponAttackSuccess,
  hasActiveFireEnchant,
  getAffixBonusesFromGear,
  getWeaponHitCount,
  COOLDOWN_REDUCTION_CAP,
  INT_SKILL_DAMAGE_PERCENT_PER_2,
  INT_COOLDOWN_PERCENT_PER_2,
} from '../src/systems/combat';
import {
  ATTRIBUTE_KEYS, CLASS_NAMES_ZH,
  getEffectiveAGI, getEffectiveINT, getEffectiveSTR, getTotalAttributes,
} from '../src/models/character';
import { getExpToNextLevel, INITIAL_HP, INITIAL_MP, tryLevelUp } from '../src/systems/levelUp';
import { getMpRegen, MP_REGEN_INTERVAL_MS } from '../src/systems/regen';
import type { Attributes, Character, ClassName } from '../src/models/character';
import type { EquipmentInstance } from '../src/models/equipment';
import type { MonsterInstance } from '../src/models/monster';
import type { ActiveEffect, StatModifier } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import { SKILL_CATALOG } from '../src/models/skill';
import { CLASS_SKILLS } from '../src/models/classSkills';
import { getErosion, getWeaponBaseDamage } from '../src/models/affix';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';

// ---------------------------------------------------------------- RNG

/** 可重現的 LCG（mulberry32）。覆寫 Math.random，讓真實 combat.ts 也吃到固定亂數流。 */
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

// ---------------------------------------------------------------- 常數

const RUNS = 10_000;

/** 回魔技（魔力奪取）的施放門檻：MP 低於上限的這個比例才放 */
const MP_DRAIN_THRESHOLD = 0.3;

/**
 * 可切換的規則組（`--rules=<name>`），用來評估數值調整的假設。
 *
 * INT 在 `combat.ts` 裡**只有一個作用**（`combat.ts:578-579`，全檔沒有第二個 INT 讀取點），
 * 因此本腳本一律把傳給 combat.ts 的 char/gear 的 INT 歸零，改由 `applyIntBonus()` 自行加算 ——
 * `current` 規則組會**逐位元重現**原本的公式（`intBonus = floor(威力 × 有效INT / 20)`），
 * 其餘乘區、暴擊、防禦減傷、取整順序全部仍由真實的 `calculateSkillAttack()` 負責。
 */
interface Rules {
  name: string;
  label: string;
  /** 每 2 點有效 INT 提供的「技能威力%」 */
  intDamagePer2: number;
  /** 每 2 點有效 INT 提供的「冷卻縮減%」（與詞綴/buff 加總後同樣受 50% 上限） */
  intCdrPer2: number;
  /** 基礎魔法威力倍率 */
  basicPowerMult: number;
  /** 職業魔法威力倍率（預設） */
  classPowerMult: number;
  /** 職業魔法威力倍率的職業別覆寫 */
  classPowerMultBy?: Partial<Record<ClassName, number>>;
}

/**
 * `current` 直接沿用 `combat.ts` 的常數與 seed 的技能威力，因此**必定與遊戲一致**；
 * 其餘規則組是用來評估調整方向的假設，只改這裡不會影響遊戲。
 */
const RULE_SETS: Record<string, Rules> = {
  current: {
    name: 'current', label: '現行規則',
    intDamagePer2: INT_SKILL_DAMAGE_PERCENT_PER_2,
    intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 1, classPowerMult: 1,
  },
  'no-int': {
    name: 'no-int', label: '拿掉 INT 的技能傷害加成（保留冷卻縮減）',
    intDamagePer2: 0, intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 1, classPowerMult: 1,
  },
  'int-10': {
    name: 'int-10', label: 'INT 技能傷害回到每 2 點 +10%',
    intDamagePer2: 10, intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 1, classPowerMult: 1,
  },
  'nerf-more': {
    name: 'nerf-more', label: '技能威力再砍 20%（在現行值之上）',
    intDamagePer2: INT_SKILL_DAMAGE_PERCENT_PER_2,
    intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 0.8, classPowerMult: 1,
    classPowerMultBy: { elementalist: 0.8, priest: 0.8 },
  },
};

const RULES_ARG = process.argv.find(a => a.startsWith('--rules='))?.split('=')[1] ?? 'current';
const RULES = RULE_SETS[RULES_ARG];
if (!RULES) throw new Error(`未知的規則組：${RULES_ARG}（可用：${Object.keys(RULE_SETS).join(', ')}）`);

/** § 21.4：INT 加成 = floor(技能威力 × (有效INT / 2 × 每2點%) / 100) */
function applyIntBonus(power: number, effInt: number): number {
  return power + Math.floor(power * (effInt / 2 * RULES.intDamagePer2) / 100);
}

/** INT 提供的冷卻縮減%（未套 50% 上限） */
function intCooldownReduction(effInt: number): number {
  return (effInt / 2) * RULES.intCdrPer2;
}

/**
 * 交給 `calculateSkillAttack()` 的威力：只套規則組的威力倍率。
 * **INT 一律交給 combat.ts 原生處理** —— § 21.4 改成乘區之後，
 * 腳本側先折算會整個繞過那個乘區，量到的數字會與遊戲不符。
 */
function ruledSkillPower(
  entry: { power?: number; isBasicMagic?: boolean },
  effInt: number,
  className: ClassName,
): number {
  const mult = entry.isBasicMagic
    ? RULES.basicPowerMult
    : (RULES.classPowerMultBy?.[className] ?? RULES.classPowerMult);
  return Math.floor((entry.power ?? 0) * mult);
}
/** PixiJS ticker 60fps —— 行動只會在幀邊界觸發，模擬時對齊避免高估 DPS */
const FRAME_MS = 1000 / 60;
/** gameLoop.ts DOT_TICK_INTERVAL */
const DOT_TICK_MS = 1000;
/** § 7.4 元素侵蝕的 DoT 持續時間 */
const EROSION_MS = 5000;
/** 打不死就中止（避免無限迴圈） */
const TIMEOUT_MS = 10 * 60 * 1000;

const ATTRIBUTE_CAP_NOTE = '建角 80 點（單項上限 18）+ Lv.51~75 每級 1 點 = 105 點';

// ---------------------------------------------------------------- 角色

/**
 * § 44.4：建角 80 點的最終分配（單項上限 18）。
 * SPI 在建角後就不再變動 —— 升級點全投主攻屬性與次要屬性，因此 MP 曲線可精確重現。
 */
const CREATION_ATTRIBUTES: Record<ClassName, Attributes> = {
  knight: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
  elf: { STR: 18, AGI: 16, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
  elementalist: { STR: 8, AGI: 8, VIT: 18, SPI: 16, INT: 18, CHA: 12 },
  priest: { STR: 6, AGI: 8, VIT: 18, SPI: 15, INT: 18, CHA: 15 },
  thief: { STR: 18, AGI: 18, VIT: 12, SPI: 10, INT: 12, CHA: 10 },
};

/** 各職業「設計上」的有效 INT（配點 + 裝備），用於 applyIntBonus 與 INT 冷卻縮減 */
function designEffectiveInt(className: ClassName, gear: (EquipmentInstance | null)[]): number {
  const raw = CREATION_ATTRIBUTES[className].INT + (LEVELUP_ALLOCATION[className].INT ?? 0);
  const fromGear = gear.reduce((sum, g) => sum + (GEAR_INT_BONUS.get(g?.name ?? '') ?? 0), 0);
  return getEffectiveINT(raw + fromGear);
}

/** 裝備模板的 INT 額外屬性（makeItem 會把 instance 的 INT 歸零，這裡另存一份） */
const GEAR_INT_BONUS = new Map<string, number>(
  EQUIPMENT_SEEDS.filter(t => t.bonusAttributes?.INT).map(t => [t.name, t.bonusAttributes!.INT!]),
);

/** § 44.4：Lv.51~75 的 25 點升級配點（主攻屬性 17 點推到 35，餘 8 點） */
const LEVELUP_ALLOCATION: Record<ClassName, Partial<Attributes>> = {
  knight: { STR: 17, VIT: 8 },
  elf: { STR: 17, AGI: 8 },
  elementalist: { INT: 17, VIT: 8 },
  priest: { INT: 17, VIT: 8 },
  thief: { STR: 17, AGI: 8 },
};

/** 依配點順序（主攻屬性優先）取前 n 點的 bonusAttributes 快照 */
function partialAllocation(full: Attributes, n: number): Attributes {
  const out: Attributes = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
  let left = n;
  for (const key of ATTRIBUTE_KEYS) {
    if (full[key] <= 0) continue;
    const take = Math.min(full[key], left);
    out[key] = take;
    left -= take;
    if (left <= 0) break;
  }
  return out;
}

/**
 * 用真實的 `tryLevelUp()` 把角色從 Lv.1 練到 Lv.75，取得實際的 maxHp / maxMp。
 * 升級成長只看 baseAttributes + bonusAttributes（`levelUp.ts:30` 不傳 gear）。
 */
function levelTo75(base: Attributes, bonus: Attributes): { maxHp: number; maxMp: number } {
  let char = {
    name: 'sim', className: 'knight', level: 1, exp: 0, expToNext: getExpToNextLevel(1),
    hp: INITIAL_HP, maxHp: INITIAL_HP, mp: INITIAL_MP, maxMp: INITIAL_MP,
    baseAttributes: base,
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: '', currentZone: '', currentRegion: '', currentFloor: null,
    skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  } as unknown as Character;

  while (char.level < 75) {
    char = tryLevelUp({ ...char, exp: char.expToNext });
    if (char.level > 50) {
      // Lv.51 起每級 +1 點，立刻配掉（下一級的成長才吃得到）
      char = { ...char, bonusAttributes: partialAllocation(bonus, char.level - 50) };
    }
  }
  return { maxHp: char.maxHp, maxMp: char.maxMp };
}

function buildCharacter(className: ClassName): Character {
  const raw = CREATION_ATTRIBUTES[className];
  const base = { ...raw }; // INT 交給 combat.ts 原生處理（§ 21.4 的乘區無法在腳本側先折算）
  const alloc = LEVELUP_ALLOCATION[className];
  const bonus: Attributes = {
    STR: alloc.STR ?? 0, AGI: alloc.AGI ?? 0, VIT: alloc.VIT ?? 0,
    SPI: alloc.SPI ?? 0, INT: alloc.INT ?? 0, CHA: alloc.CHA ?? 0,
  };
  const spent = ATTRIBUTE_KEYS.reduce((s, k) => s + bonus[k], 0);
  if (spent !== 25) throw new Error(`${className} 升級配點應為 25 點，實得 ${spent}`);
  const creationTotal = ATTRIBUTE_KEYS.reduce((s, k) => s + raw[k], 0);
  if (creationTotal !== 80) throw new Error(`${className} 建角配點應為 80 點，實得 ${creationTotal}`);

  const { maxHp, maxMp } = withSeed(1234, () => levelTo75(base, bonus));

  return {
    name: `Lv75-${className}`,
    className,
    level: 75,
    exp: 0,
    expToNext: 1,
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    baseAttributes: base,
    bonusAttributes: bonus,
    gold: 0,
    currentArea: 'hundred-pillar-91-100f',
    currentZone: 'hundred-pillar',
    currentRegion: 'hundred-pillar',
    currentFloor: 100,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: 0,
    createdAt: 0,
    userId: 1,
  } as Character;
}

// ---------------------------------------------------------------- 怪物

const REAPER_SEED = MONSTER_SEEDS.find(m => m.name === '百柱死神');
if (!REAPER_SEED) throw new Error('找不到百柱死神 seed');

function makeReaper(): MonsterInstance {
  return {
    templateId: REAPER_SEED!.id!,
    name: REAPER_SEED!.name,
    level: REAPER_SEED!.level,
    currentHp: REAPER_SEED!.hp,
    maxHp: REAPER_SEED!.hp,
    attackMin: REAPER_SEED!.attackMin,
    attackMax: REAPER_SEED!.attackMax,
    defense: REAPER_SEED!.defense,
    exp: REAPER_SEED!.exp,
    race: REAPER_SEED!.race,
    size: REAPER_SEED!.size,
    element: REAPER_SEED!.element,
    isBoss: REAPER_SEED!.isBoss,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1200,
    debuffs: REAPER_SEED!.debuffs,
  };
}

// ---------------------------------------------------------------- 裝備

type AffixType = 'attack_power' | 'element_brand' | 'element_erosion' | 'skill_elemental' | 'crit_rate'
  | 'crit_damage' | 'attack_speed' | 'cooldown_reduction' | 'defense' | 'max_hp' | 'max_mp';

/** T7 上限 20，品質 20% → getEffectiveAffixValue = floor(20 × 1.2) = 24 */
const T7 = 20;
const QUALITY = 20;

/**
 * 防具／飾品／**魔導書**完全沒有攻擊詞綴（`affix.ts` § 7.6），對本戰只影響防禦與 MP 池。
 * 魔導書走 armor 池是遊戲規則，不是本腳本的假設。
 */
const ARMOR_AFFIXES: AffixType[] = ['defense', 'max_hp', 'max_mp'];

interface Loadout {
  label: string;
  weaponName: string;
  weapon: EquipmentInstance;
  gear: (EquipmentInstance | null)[];
}

// ---------------------------------------------------------------- BiS 自動選定（§ 44.5）

type Template = (typeof EQUIPMENT_SEEDS)[number];

/** 缺件報告。找不到部位時累積在這裡，最後印出來 —— 不 throw（§ 44.9） */
const MISSING: string[] = [];

const ARMOR_SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace', 'ring1'] as const;
const OFFHAND_TYPES = new Set(['shield', 'magicBook', 'armGuard']);
const MAIN_STAT: Record<ClassName, keyof Attributes> = {
  knight: 'STR', elf: 'STR', thief: 'STR', elementalist: 'INT', priest: 'INT',
};

function usableBy(t: Template, cn: ClassName): boolean {
  return !t.requiredClass || t.requiredClass.length === 0 || t.requiredClass.includes(cn);
}

/** 腰帶安定值 −1 不可強化；飾品 +8 封頂（§ 44.1）；其餘 +9 */
function enhancementFor(slot: string): number {
  if (slot === 'belt') return 0;
  if (slot === 'necklace' || slot.startsWith('ring')) return 8;
  return 9;
}

/**
 * 元素刻印在模擬裡一律取「克制目標的元素」（`42-element-system.md` § 42.2）——
 * BiS 的前提是玩家挑得到最適合這場的裝備，刻印當然也挑克制的那一把。
 * 目標是暗屬性的百柱死神，因此刻印為光。
 */
const BRAND_COUNTER: Record<string, string> = {
  wind: 'fire', earth: 'wind', ice: 'earth', fire: 'ice', dark: 'light', light: 'dark',
};
const BIS_BRAND_ELEMENT = BRAND_COUNTER[REAPER_SEED.element] ?? 'fire';

/** `--erosion=max|mean`：侵蝕每跳傷害取完美 roll 或範圍期望值 */
const EROSION_MODE = process.argv.find(a => a.startsWith('--erosion='))?.split('=')[1] ?? 'max';
if (!['max', 'mean', 'low'].includes(EROSION_MODE)) throw new Error(`未知的 --erosion=${EROSION_MODE}（可用：max, mean, low）`);
function erosionRollValue(base: number): number {
  const max = Math.max(1, Math.floor(base));
  const min = Math.max(1, Math.floor(max / 2));
  if (EROSION_MODE === 'max') return max;
  if (EROSION_MODE === 'low') return min;
  return Math.max(1, Math.round((min + max) / 2));
}

function instantiate(tpl: Template, enhancement: number, affixTypes: AffixType[]): EquipmentInstance {
  const bonusAttributes = tpl.bonusAttributes;
  return {
    ...tpl, bonusAttributes, templateId: tpl.id!, quality: QUALITY, enhancement,
    affixes: affixTypes.map(type => ({
      type, tier: 7, value: T7,
      ...(type === 'element_brand' || type === 'element_erosion' ? { element: BIS_BRAND_ELEMENT } : {}),
      // 侵蝕的每跳傷害（§ 7.4）。`--erosion=max` 取完美 roll（與其他詞綴一律取 T7 上限一致）；
      // `--erosion=mean` 取該範圍的期望值，代表實際掉落的平均水準。
      ...(type === 'element_erosion' ? { dotDamage: erosionRollValue(getWeaponBaseDamage(tpl)) } : {}),
    })),
    ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

/**
 * 木樁測試下，防具／飾品／副手對**輸出**的影響只有 `bonusAttributes` 與 `magicAttack`
 * ——它們沒有攻擊詞綴（§ 7.6），防禦與格擋在不還手的目標上不生效。
 * 各部位彼此獨立，因此逐部位取最佳即為全域最佳，不需要跨部位窮舉。
 */
function scoreSupportPiece(t: Template, cn: ClassName): number {
  const main = t.bonusAttributes?.[MAIN_STAT[cn]] ?? 0;
  return main * 1000 + (t.magicAttack ?? 0) * 100 + (t.defense ?? 0);
}

function pickSupport(cn: ClassName, pred: (t: Template) => boolean, what: string): Template | null {
  const pool = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter' && usableBy(t, cn) && pred(t));
  if (pool.length === 0) { MISSING.push(`${CLASS_NAMES_ZH[cn]} 缺 ${what}`); return null; }
  return pool.reduce((a, b) => (scoreSupportPiece(b, cn) > scoreSupportPiece(a, cn) ? b : a));
}

/** 防具與飾品（不含手部）—— 每個職業只需算一次 */
function buildSupportGear(cn: ClassName): EquipmentInstance[] {
  const out: EquipmentInstance[] = [];
  for (const slot of ARMOR_SLOTS) {
    const tpl = pickSupport(cn, t => t.slot === slot, slot);
    if (!tpl) continue;
    out.push(instantiate(tpl, enhancementFor(slot), ARMOR_AFFIXES));
    if (slot === 'ring1') out.push(instantiate(tpl, enhancementFor(slot), ARMOR_AFFIXES)); // 兩隻戒指
  }
  return out;
}

function bestOffhand(cn: ClassName): Template | null {
  return pickSupport(cn, t => OFFHAND_TYPES.has(t.type as string), '副手');
}

/** 候選手部組合：雙手武器，以及「單手武器 ＋ 該職業最佳副手」 */
function handCombos(cn: ClassName): { label: string; weapon: Template; offhand: Template | null }[] {
  const weapons = EQUIPMENT_SEEDS.filter(t =>
    t.acquireType !== 'starter' && usableBy(t, cn)
    && t.smallMonsterDamage != null && !OFFHAND_TYPES.has(t.type as string));
  if (weapons.length === 0) { MISSING.push(`${CLASS_NAMES_ZH[cn]} 缺武器`); return []; }
  const off = bestOffhand(cn);
  return weapons.map(w => w.isTwoHanded
    ? { label: `${w.name}+9（雙手）`, weapon: w, offhand: null }
    : { label: `${w.name}+9 ＋ ${off?.name ?? '空手'}`, weapon: w, offhand: off });
}

function buildLoadout(
  label: string,
  weapon: Template,
  offhand: Template | null,
  weaponAffixes: AffixType[],
  support: EquipmentInstance[],
): Loadout {
  const w = instantiate(weapon, 9, weaponAffixes);
  const gear: (EquipmentInstance | null)[] = [w];
  if (offhand) gear.push(instantiate(offhand, 9, ARMOR_AFFIXES));
  gear.push(...support);
  return { label, weaponName: weapon.name, weapon: w, gear };
}

// ---------------------------------------------------------------- Buff

/**
 * combat.ts 用 `Date.now() - startTime >= duration` 判定過期。
 * 模擬用虛擬時鐘，因此 buff 一律設為永不過期，由本檔自行 add/remove 控制生效期間。
 */
function makeBuff(id: string, category: string, modifiers: StatModifier[]): ActiveEffect {
  return {
    id, sourceSkillId: id, sourceSkillName: id, category,
    type: 'buff', target: 'player', modifiers,
    startTime: 0, duration: Number.MAX_SAFE_INTEGER,
    tags: [], name: id, description: '',
  };
}

/** 加速來源四者互斥（category: 'speed'）：各職業取可用的最強者 */
const SPEED_SOURCE: Record<ClassName, { name: string; percent: number }> = {
  knight: { name: '綠色藥水', percent: 33 },      // 基礎魔法只到 1 級，學不到加速術
  thief: { name: '綠色藥水', percent: 33 },       // 基礎魔法只到 4 級
  elf: { name: '加速術（Lv6）', percent: 33 },     // 與綠色藥水同值、互斥
  elementalist: { name: '強化加速術（Lv8）', percent: 40 },
  priest: { name: '強化加速術（Lv8）', percent: 40 },
};

/** 戰前開好的長效 buff（duration ≥ 300s，遠長於戰鬥時間） */
function preCombatBuffs(className: ClassName): ActiveEffect[] {
  const b: ActiveEffect[] = [];
  switch (className) {
    case 'knight':
      // 基礎魔法上限 1 級：祝福武器（對不死命中 +5）、保護罩（防禦 +2）
      b.push(makeBuff('祝福武器', 'weapon-bless', [{ stat: 'hit_undead', value: 5, isPercent: false }]));
      b.push(makeBuff('保護罩', 'protect-shield', [{ stat: 'defense', value: 2, isPercent: false }]));
      break;
    case 'elf':
      b.push(makeBuff('祝福魔法武器', 'weapon-bless', [
        { stat: 'hit', value: 10, isPercent: false },
        { stat: 'extra_attack', value: 5, isPercent: false },
      ]));
      b.push(makeBuff('鷹眼', 'accuracy', [
        { stat: 'hit', value: 5, isPercent: false },
        { stat: 'ranged_attack', value: 3, isPercent: false },
      ]));
      b.push(makeBuff('火矢附魔', 'fire-enchant', [{ stat: 'fire_damage', value: 15, isPercent: false }]));
      b.push(makeBuff('力量提升', 'str-buff', [{ stat: 'str', value: 5, isPercent: false }]));
      b.push(makeBuff('敏捷提升', 'agi-buff', [{ stat: 'agility', value: 5, isPercent: false }]));
      break;
    case 'thief':
      b.push(makeBuff('精準打擊', 'accuracy', [
        { stat: 'hit', value: 10, isPercent: false },
        { stat: 'crit_rate', value: 10, isPercent: true },
      ]));
      b.push(makeBuff('敏捷提升', 'agi-buff', [{ stat: 'agility', value: 5, isPercent: false }]));
      // 淬毒本身是 300s buff，毒 DoT 由普攻觸發（見 rotation）
      break;
    case 'elementalist':
    case 'priest':
      b.push(makeBuff('祝福魔法武器', 'weapon-bless', [
        { stat: 'hit', value: 10, isPercent: false },
        { stat: 'extra_attack', value: 5, isPercent: false },
      ]));
      b.push(makeBuff('力量提升', 'str-buff', [{ stat: 'str', value: 5, isPercent: false }]));
      b.push(makeBuff('敏捷提升', 'agi-buff', [{ stat: 'agility', value: 5, isPercent: false }]));
      break;
  }
  return b;
}

// ---------------------------------------------------------------- 輪替

type ActionKind = 'normal' | 'magic_skill' | 'physical_skill' | 'self_buff';

interface RotationEntry {
  id: string;
  name: string;
  kind: ActionKind;
  /** magic_skill 用 */
  power?: number;
  element?: string;
  ignoreDefensePercent?: number;
  /** physical_skill（三連射）用 */
  hits?: number;
  /** § 21.4a 物理快照技能（盾擊／裂傷斬／挑釁怒吼）：基礎魔攻 + 基礎物理傷害 */
  physicalSnapshot?: boolean;
  /** § 99.1 第 6 條：【需裝備弓】是實際限制，配裝不符時整招不可用 */
  requiredWeaponType?: string;
  /** 冷卻（ms，未套 CDR） */
  cooldown: number;
  /** MP 消耗（`canUseSkill` 會擋） */
  mpCost: number;
  /** 回復等同最終傷害的 MP（魔力奪取 = 1） */
  mpDrainRatio?: number;
  /** 施放後給自己的 buff（背刺） */
  selfBuff?: { category: string; modifiers: StatModifier[]; duration: number };
  /** 施放後給怪的 DoT（裂傷斬流血），比例乘 calculateBasePhysicalDamage */
  dot?: { category: string; percent: number; interval: number; duration: number };
  /** 純 buff 類（元素增幅／強化冷卻縮減／致命一擊） */
  buff?: { category: string; modifiers: StatModifier[]; duration: number };
  /** true = 基礎魔法，false = 職業魔法（決定套用哪個威力倍率） */
  isBasicMagic?: boolean;
}

function classSkill(id: string): Omit<Skill, 'lastUsedAt'> {
  const s = CLASS_SKILLS.find(k => k.id === id);
  if (!s) throw new Error(`找不到職業魔法：${id}`);
  return s.skill;
}

/** § 99.1 第 6 條：配裝是否滿足技能的武器需求 */
function meetsWeaponRequirement(e: RotationEntry, loadout: Loadout): boolean {
  return !e.requiredWeaponType || loadout.weapon?.type === e.requiredWeaponType;
}

function magicEntry(s: Omit<Skill, 'lastUsedAt'>, isBasicMagic = false): RotationEntry {
  return {
    id: s.id, name: s.name, kind: 'magic_skill', isBasicMagic,
    power: s.power, element: s.element, physicalSnapshot: s.physicalSnapshot,
    requiredWeaponType: s.requiredWeaponType,
    ignoreDefensePercent: s.ignoreDefensePercent ?? 0,
    cooldown: s.cooldown,
    mpCost: s.mpCost,
    mpDrainRatio: s.mpDrainRatio,
  };
}

/**
 * 基礎魔法學習上限（skillRestrictions.ts）：
 *   騎士 1 級 / 盜賊 4 級 / 妖精 6 級 / 元素師 10 級 / 牧師 10 級
 * 學習次數：騎士 Lv50 起最多 5 個、妖精 floor(75/8)=9、盜賊 9、元素師 floor(75/4)=18、牧師 floor(75/5)=15
 */
const BASIC_MAGIC_BUDGET: Record<ClassName, number> = {
  knight: 5, elf: 9, thief: 9, elementalist: 18, priest: 15,
};

function buildRotation(className: ClassName): RotationEntry[] {
  const r: RotationEntry[] = [];

  if (className === 'knight') {
    const vengeance = classSkill('vengeance');
    r.push({
      ...magicEntry(vengeance),
      // scaleByMissingHp：打木樁不掉血 → 加成 0%，不施加 buff（arpgEventHandler.ts:48-53）
    });
    const rend = classSkill('rend');
    r.push({
      ...magicEntry(rend),
      dot: { category: 'bleeding', percent: 0.5, interval: 1000, duration: 5000 },
    });
    r.push(magicEntry(classSkill('shield-bash')));
    r.push(magicEntry(classSkill('taunt')));
  }

  if (className === 'elf') {
    const triple = classSkill('triple-shot');
    r.push({ id: triple.id, name: triple.name, kind: 'physical_skill', hits: triple.hits, cooldown: triple.cooldown, mpCost: triple.mpCost, requiredWeaponType: triple.requiredWeaponType });
    r.push(magicEntry(classSkill('arrow-rain')));
  }

  if (className === 'thief') {
    const backstab = classSkill('backstab');
    r.push({
      ...magicEntry(backstab),
      selfBuff: { category: 'backstab', duration: 5000, modifiers: [{ stat: 'attack_power', value: 50, isPercent: true }] },
    });
    const deadly = classSkill('deadly-strike');
    r.push({
      id: deadly.id, name: deadly.name, kind: 'self_buff', cooldown: deadly.cooldown, mpCost: deadly.mpCost,
      buff: { category: 'crit-buff', duration: deadly.buffDuration!, modifiers: deadly.buffModifiers! },
    });
  }

  if (className === 'elementalist') {
    const boost = classSkill('element-boost');
    r.push({
      id: boost.id, name: boost.name, kind: 'self_buff', cooldown: boost.cooldown, mpCost: boost.mpCost,
      buff: { category: 'element-boost', duration: boost.buffDuration!, modifiers: boost.buffModifiers! },
    });
    const gcd = classSkill('greater-cd-reduce');
    r.push({
      id: gcd.id, name: gcd.name, kind: 'self_buff', cooldown: gcd.cooldown, mpCost: gcd.mpCost,
      buff: { category: 'cd-reduction', duration: gcd.buffDuration!, modifiers: gcd.buffModifiers! },
    });
    r.push(magicEntry(classSkill('element-storm')));
    r.push(magicEntry(classSkill('mana-drain')));
  }

  if (className === 'priest') {
    r.push(magicEntry(classSkill('holy-judgment')));
  }

  // 基礎魔法：依威力排序取到學習上限（扣掉戰前 buff 佔用的學習次數）
  const prebuffBasics: Record<ClassName, string[]> = {
    knight: ['bless-weapon', 'protect-shield'],
    elf: ['haste', 'bless-magic-weapon', 'strength-boost', 'agility-boost'],
    thief: ['agility-boost'],
    elementalist: ['greater-haste', 'bless-magic-weapon', 'strength-boost', 'agility-boost'],
    priest: ['greater-haste', 'bless-magic-weapon', 'strength-boost', 'agility-boost'],
  };
  const maxLevel: Record<ClassName, number> = { knight: 1, thief: 4, elf: 6, elementalist: 10, priest: 10 };
  const remaining = BASIC_MAGIC_BUDGET[className] - prebuffBasics[className].length;

  const attackBasics = SKILL_CATALOG
    .filter(s => s.type === 'attack' && s.level <= maxLevel[className] && (s.power ?? 0) > 0)
    .sort((a, b) => b.power - a.power)
    .slice(0, Math.max(0, remaining));

  for (const s of attackBasics) r.push(magicEntry(s, true));

  return r;
}

// ---------------------------------------------------------------- 校準

const CALIBRATION_SAMPLES = 20_000;

interface ActionScore { name: string; avg: number; note: string }

/**
 * 先量測每個候選動作的「單次期望傷害」，把**打不贏普通攻擊**的技能剔除，再依期望值排序。
 * 因為一個攻擊 tick 只能做一件事（`playerCombatFSM.ts:96-99`），放一招比普攻弱的技能是淨損失。
 */
function calibrate(
  char: Character,
  loadout: Loadout,
  allEntries: RotationEntry[],
  effects: ActiveEffect[],
  effInt: number,
  seed: number,
): { order: RotationEntry[]; scores: ActionScore[] } {
  // § 99.1 第 6 條：requiredWeaponType 是實際限制（scriptRunner 的 meetsWeaponRequirement 會擋），
  // 配裝不帶弓時三連射／穿透箭雨整招不可用，不可讓它們照樣進校準。
  const rotation = allEntries.filter(e => meetsWeaponRequirement(e, loadout));
  const monster = makeReaper();
  const scores: ActionScore[] = [];
  let normalAvg = 0;

  withSeed(seed, () => {
    let sum = 0;
    for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
      const r = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      sum += r.hit ? r.damage : 0;
    }
    normalAvg = sum / CALIBRATION_SAMPLES;
    scores.push({ name: '普通攻擊', avg: normalAvg, note: '基準' });

    for (const e of rotation) {
      if (e.kind === 'self_buff') {
        scores.push({ name: e.name, avg: Number.POSITIVE_INFINITY, note: '純增益，一律保留' });
        continue;
      }
      let s = 0;
      for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
        if (e.kind === 'physical_skill') {
          const fire = hasActiveFireEnchant(effects);
          for (let h = 0; h < (e.hits ?? 1); h++) {
            const r = calculatePhysicalSkillHit(char, loadout.weapon, monster, loadout.gear, fire, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
            s += r.hit ? r.damage : 0;
          }
        } else if (e.physicalSnapshot) {
          const r = calculatePhysicalSnapshotSkill(char, ruledSkillPower(e, effInt, char.className), e.element!, loadout.weapon, monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
          s += r.damage;
        } else {
          const r = calculateSkillAttack(char, ruledSkillPower(e, effInt, char.className), e.element!, monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
          s += r.damage;
        }
      }
      let avg = s / CALIBRATION_SAMPLES;
      let note = '';
      if (e.dot) {
        // DoT 直接扣血、不吃防禦（PixiGame.tsx:610），快照制
        const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
        const tick = Math.max(1, Math.floor(base * e.dot.percent));
        const ticks = Math.floor(e.dot.duration / e.dot.interval);
        avg += tick * ticks;
        note = `含 DoT ${tick}×${ticks}`;
      }
      scores.push({ name: e.name, avg, note });
    }
  });

  const scoreOf = new Map(scores.map(s => [s.name, s.avg]));
  const order = rotation
    // 回魔技（魔力奪取）**不以單次傷害評價** —— 它的價值是續戰資源，
    // 用傷害門檻篩會把它整個踢掉，模擬就永遠不回魔、再回報「MP 見底」。
    // 它排在傷害技之後，且只在 MP 低於門檻時才會被選中（見 simulateOnce）。
    .filter(e => e.kind === 'self_buff' || e.mpDrainRatio != null || (scoreOf.get(e.name) ?? 0) > normalAvg)
    .sort((a, b) => {
      if (a.mpDrainRatio != null && b.mpDrainRatio == null) return 1;
      if (b.mpDrainRatio != null && a.mpDrainRatio == null) return -1;
      if (a.kind === 'self_buff' && b.kind !== 'self_buff') return -1;
      if (b.kind === 'self_buff' && a.kind !== 'self_buff') return 1;
      return (scoreOf.get(b.name) ?? 0) - (scoreOf.get(a.name) ?? 0);
    });

  return { order, scores: scores.sort((a, b) => b.avg - a.avg) };
}

// ---------------------------------------------------------------- 模擬

interface DotState { category: string; damage: number; nextTick: number; expiresAt: number }

interface SimStats {
  totalDamage: number; hits: number; misses: number; crits: number;
  physHits: number; physMisses: number;
  mpSpent: number; mpStarvedActions: number;
}

/** MP 模型：`enabled: false` 代表理論上限（MP 無限），`true` 代表把消耗與回復都算進去 */
interface MpModel { enabled: boolean; maxMp: number; regenPerTick: number }

function simulateOnce(
  char: Character,
  loadout: Loadout,
  rotation: RotationEntry[],
  baseEffects: ActiveEffect[],
  actionCounts: Record<string, number>,
  stats: SimStats,
  mp: MpModel,
  effInt: number,
): number {
  const monster = makeReaper();
  const effects: ActiveEffect[] = [...baseEffects];
  const timedEffects: { effect: ActiveEffect; expiresAt: number }[] = [];
  const cooldowns: Record<string, number> = {};
  const dots: DotState[] = [];

  /**
   * § 7.4 元素侵蝕：命中後依觸發率上 DoT。普攻與魔法命中都判定，
   * 雙持武器一次攻擊打兩下故判定兩次；存續期間不可刷新。
   */
  const erosion = getErosion(loadout.weapon.affixes, loadout.weapon.quality ?? 0);
  const erosionRolls = getWeaponHitCount(loadout.weapon);
  function tryErosion(now: number, rolls: number) {
    if (!erosion || dots.some(d => d.category === 'eroded')) return;
    for (let r = 0; r < rolls; r++) {
      if (Math.random() * 100 < erosion.chance) {
        dots.push({
          category: 'eroded', damage: erosion.damage,
          nextTick: now + DOT_TICK_MS, expiresAt: now + EROSION_MS,
        });
        return;
      }
    }
  }

  let now = 0;
  let nextAction = 0;
  // MP：戰鬥開始時全滿；`regen.ts` 每 6 秒回一次，戰鬥中減半
  let currentMp = mp.enabled ? mp.maxMp : Number.POSITIVE_INFINITY;
  let nextMpTick = MP_REGEN_INTERVAL_MS;

  const expire = (t: number) => {
    for (let i = timedEffects.length - 1; i >= 0; i--) {
      if (timedEffects[i].expiresAt <= t) {
        const idx = effects.indexOf(timedEffects[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timedEffects.splice(i, 1);
      }
    }
  };

  const addTimed = (e: ActiveEffect, duration: number) => {
    // 同 category 互蓋
    for (let i = timedEffects.length - 1; i >= 0; i--) {
      if (timedEffects[i].effect.category === e.category) {
        const idx = effects.indexOf(timedEffects[i].effect);
        if (idx >= 0) effects.splice(idx, 1);
        timedEffects.splice(i, 1);
      }
    }
    effects.push(e);
    timedEffects.push({ effect: e, expiresAt: now + duration });
  };

  const applyDamage = (dmg: number) => {
    monster.currentHp = Math.max(0, monster.currentHp - dmg);
    stats.totalDamage += dmg;
  };

  while (monster.currentHp > 0 && now < TIMEOUT_MS) {
    const nextDot = dots.length ? Math.min(...dots.map(d => d.nextTick)) : Infinity;
    const next = Math.min(nextAction, nextDot, mp.enabled ? nextMpTick : Infinity);
    now = next;
    expire(now);

    // --- MP 自然回復（regen.ts：每 6s，戰鬥中減半）
    while (mp.enabled && now >= nextMpTick) {
      currentMp = Math.min(mp.maxMp, currentMp + mp.regenPerTick);
      nextMpTick += MP_REGEN_INTERVAL_MS;
    }

    // --- DoT tick（直接扣血，不吃防禦，PixiGame.tsx:610）
    for (let i = dots.length - 1; i >= 0; i--) {
      const d = dots[i];
      if (d.nextTick > now) continue;
      if (now >= d.expiresAt) { dots.splice(i, 1); continue; }
      applyDamage(d.damage);
      d.nextTick += DOT_TICK_MS;
      if (d.nextTick >= d.expiresAt) dots.splice(i, 1);
    }
    if (monster.currentHp <= 0) break;

    if (now < nextAction) continue;

    // --- 行動
    // 詞綴 + buff 的 CDR 與 INT 提供的 CDR 加總後，同樣受 50% 上限（combat.ts:373）
    const cdr = Math.min(COOLDOWN_REDUCTION_CAP, getCombatBonuses(loadout.gear, effects).cooldown_reduction + intCooldownReduction(effInt));
    const pick = rotation.find(e => {
      const ready = (cooldowns[e.id] ?? -Infinity) <= now;
      if (!ready) return false;
      // `canUseSkill`：MP 不足就跳過這招，往下找下一個負擔得起的
      if (currentMp < e.mpCost) return false;
      // 回魔技只在 MP 低於 30% 時才放（常駐腳本的典型條件）；MP 無限的對照組永遠不放
      if (e.mpDrainRatio != null && (!mp.enabled || currentMp >= mp.maxMp * MP_DRAIN_THRESHOLD)) return false;
      if (e.kind === 'self_buff') {
        // buff 已在身上就不重複施放
        return !effects.some(x => x.category === e.buff!.category);
      }
      if (e.dot) {
        // § 24.3.2 DoT 存續期間不重複施加 —— 流血還在就不用這招
        return !dots.some(d => d.category === e.dot!.category);
      }
      return true;
    });

    const entry = pick ?? null;
    if (mp.enabled && !entry && rotation.length > 0) {
      // 有招可放卻只能普攻 → 若最便宜的技能也付不起，記為 MP 見底
      const cheapest = Math.min(...rotation.map(e => e.mpCost));
      if (currentMp < cheapest) stats.mpStarvedActions++;
    }
    const key = entry ? entry.name : '普通攻擊';
    actionCounts[key] = (actionCounts[key] ?? 0) + 1;

    if (!entry) {
      const res = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      if (res.hit) {
        stats.hits++;
        stats.physHits++;
        if (res.isCritical) stats.crits++;
        applyDamage(res.damage);
        tryErosion(now, erosionRolls);
        // 淬毒：普攻命中觸發毒 DoT（快照制、存續期間不刷新）
        if (char.className === 'thief' && !dots.some(d => d.category === 'poisoned')) {
          const base = calculateBasePhysicalDamage(char, loadout.weapon, loadout.gear, effects);
          dots.push({
            category: 'poisoned',
            damage: Math.max(1, Math.floor(base * 0.3)),
            nextTick: now + DOT_TICK_MS,
            expiresAt: now + 5000,
          });
        }
      } else {
        stats.misses++;
        stats.physMisses++;
      }
    } else if (entry.kind === 'self_buff') {
      currentMp -= entry.mpCost;
      stats.mpSpent += entry.mpCost;
      addTimed(makeBuff(entry.name, entry.buff!.category, entry.buff!.modifiers), entry.buff!.duration);
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else if (entry.kind === 'physical_skill') {
      currentMp -= entry.mpCost;
      stats.mpSpent += entry.mpCost;
      const fireEnchant = hasActiveFireEnchant(effects);
      for (let h = 0; h < (entry.hits ?? 1); h++) {
        const res = calculatePhysicalSkillHit(
          char, loadout.weapon, monster, loadout.gear, fireEnchant, entry.name, effects, 0,
          entry.ignoreDefensePercent ?? 0,
        );
        if (res.hit) {
          stats.hits++;
          stats.physHits++;
          if (res.isCritical) stats.crits++;
          applyDamage(res.damage);
          tryErosion(now, 1);
        } else {
          stats.misses++;
          stats.physMisses++;
        }
      }
      cooldowns[entry.id] = now + Math.floor(entry.cooldown * (1 - cdr / 100));
    } else {
      currentMp -= entry.mpCost;
      stats.mpSpent += entry.mpCost;
      // 攻擊技能自身 buff 於傷害結算「前」施加（arpgEventHandler.ts:199-206）
      if (entry.selfBuff) {
        addTimed(makeBuff(entry.name, entry.selfBuff.category, entry.selfBuff.modifiers), entry.selfBuff.duration);
      }
      const res = entry.physicalSnapshot
        ? calculatePhysicalSnapshotSkill(
            char, ruledSkillPower(entry, effInt, char.className), entry.element!, loadout.weapon, monster, loadout.gear, entry.name, effects, 0,
            entry.ignoreDefensePercent ?? 0,
          )
        : calculateSkillAttack(
            char, ruledSkillPower(entry, effInt, char.className), entry.element!, monster, loadout.gear, entry.name, effects, 0,
            entry.ignoreDefensePercent ?? 0,
          );
      stats.hits++;
      if (res.isCritical) stats.crits++;
      applyDamage(res.damage);
      tryErosion(now, 1);
      // 魔力奪取：回復等同最終傷害的 MP（combat.ts:609 calculateMpRestored）
      if (mp.enabled && entry.mpDrainRatio) {
        currentMp = Math.min(mp.maxMp, currentMp + Math.floor(res.damage * entry.mpDrainRatio));
      }
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

    // 下一次行動：對齊 60fps 幀邊界（playerCombatFSM 的 attackTimer 以 deltaMs 累加）
    const interval = getPlayerAttackInterval(loadout.gear, effects);
    nextAction = Math.ceil((now + interval) / FRAME_MS) * FRAME_MS;
  }

  return monster.currentHp <= 0 ? now : Number.NaN;
}

function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

interface ScenarioReport {
  className: ClassName;
  label: string;
  speedLabel: string;
  mpLabel: string;
  maxMp: number;
  mpRegen: number;
  mpStarvedPercent: number;
  mpPerKill: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  dps: number;
  hitRate: number;
  critRate: number;
  interval: number;
  actionMix: [string, number][];
  derived: Record<string, number | string>;
  scores: ActionScore[];
}

/**
 * 有效最大 MP。公式與 `gameStore.ts:234-239` 的 `getEffectiveMaxMp` 相同，
 * 但該函式吃 `EquippedGear` record 且住在 store 裡（會拉進 Dexie/zustand），
 * 腳本改用同一組聚合函式重算。修改 gameStore 的公式時此處要同步。
 */
function effectiveMaxMp(char: Character, gear: (EquipmentInstance | null)[]): number {
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = getAffixBonusesFromGear(items);
  const flatMp = items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0);
  return Math.floor((char.maxMp + flatMp) * (1 + bonuses.max_mp / 100));
}

function runScenario(
  className: ClassName,
  loadout: Loadout,
  withSpeed: boolean,
  mpEnabled: boolean,
  seed: number,
): ScenarioReport {
  const char = buildCharacter(className);
  const candidates = buildRotation(className);
  const effects = preCombatBuffs(className);
  const speed = SPEED_SOURCE[className];
  if (withSpeed) {
    effects.push(makeBuff(speed.name, 'speed', [{ stat: 'attack_speed', value: speed.percent, isPercent: true }]));
  }

  const effInt = designEffectiveInt(className, loadout.gear);
  const { order: rotation, scores } = calibrate(char, loadout, candidates, effects, effInt, seed + 500_000);

  const maxMp = effectiveMaxMp(char, loadout.gear);
  // regen.ts：戰鬥中回魔減半，每 MP_REGEN_INTERVAL_MS 一次
  const regenPerTick = getMpRegen(char, true, loadout.gear, effects);
  const mp: MpModel = { enabled: mpEnabled, maxMp, regenPerTick };

  const actionCounts: Record<string, number> = {};
  const stats: SimStats = {
    totalDamage: 0, hits: 0, misses: 0, crits: 0,
    physHits: 0, physMisses: 0, mpSpent: 0, mpStarvedActions: 0,
  };
  const killTimes: number[] = [];

  withSeed(seed, () => {
    for (let i = 0; i < RUNS; i++) {
      const t = simulateOnce(char, loadout, rotation, effects, actionCounts, stats, mp, effInt);
      if (!Number.isNaN(t)) killTimes.push(t);
    }
  });

  killTimes.sort((a, b) => a - b);
  const mean = killTimes.reduce((s, t) => s + t, 0) / killTimes.length;

  const bonuses = getCombatBonuses(loadout.gear, effects);
  const attrs = getTotalAttributes(char, effects, loadout.gear);
  const derived: Record<string, number | string> = {
    攻擊力詞綴: bonuses.attack_power,
    元素刻印: bonuses.element_brand,
    技能元素: bonuses.skill_elemental,
    爆擊率: Math.min(75, 5 + bonuses.crit_rate),
    爆擊倍率: Number((2 + bonuses.crit_damage / 100).toFixed(2)),
    攻速詞綴: bonuses.attack_speed,
    減CD: Math.min(COOLDOWN_REDUCTION_CAP, getCombatBonuses(loadout.gear, effects).cooldown_reduction + intCooldownReduction(effInt)),
    裝備魔攻: getTotalMagicAttack(loadout.gear),
    裝備防禦: getTotalDefense(loadout.gear),
    武器攻擊成功: getWeaponAttackSuccess(loadout.weapon),
    有效STR: getEffectiveSTR(attrs.STR),
    有效AGI: getEffectiveAGI(attrs.AGI),
    有效INT: effInt,
    最大MP: maxMp,
    戰鬥中回魔: `${regenPerTick}/6s`,
  };

  const totalActions = Object.values(actionCounts).reduce((s, n) => s + n, 0);
  const actionMix = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, Number(((v / totalActions) * 100).toFixed(1))] as [string, number]);

  return {
    className,
    label: loadout.label,
    speedLabel: withSpeed ? speed.name : '無加速',
    mpLabel: mpEnabled ? '計入 MP' : 'MP 無限',
    maxMp,
    mpRegen: regenPerTick,
    mpStarvedPercent: (stats.mpStarvedActions / Math.max(1, totalActions)) * 100,
    mpPerKill: stats.mpSpent / Math.max(1, killTimes.length),
    mean: mean / 1000,
    median: percentile(killTimes, 0.5) / 1000,
    p10: percentile(killTimes, 0.1) / 1000,
    p90: percentile(killTimes, 0.9) / 1000,
    dps: REAPER_SEED!.hp / (mean / 1000),
    hitRate: stats.physHits + stats.physMisses > 0
      ? (stats.physHits / (stats.physHits + stats.physMisses)) * 100
      : 100,
    critRate: (stats.crits / stats.hits) * 100,
    interval: getPlayerAttackInterval(loadout.gear, effects),
    actionMix,
    derived,
    scores,
  };
}

// ---------------------------------------------------------------- BiS 搜尋

/** § 7.6 武器詞綴池（7 種），4 格不重複 → C(7,4) = 35 組 */
const WEAPON_AFFIX_POOL: AffixType[] = [
  'attack_power', 'element_brand', 'element_erosion', 'skill_elemental',
  'crit_rate', 'crit_damage', 'attack_speed', 'cooldown_reduction',
];
/** 粗排用的取樣數（全模擬另有 RUNS） */
const PROXY_SAMPLES = 600;
/** 粗排後進入下一階段的組合數 */
const TOP_HANDS = 3;
const TOP_FINAL = 3;

const SEED_AFFIXES: Record<ClassName, AffixType[]> = {
  knight: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed'],
  elf: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed'],
  thief: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed'],
  elementalist: ['attack_power', 'skill_elemental', 'crit_rate', 'crit_damage'],
  priest: ['attack_power', 'skill_elemental', 'crit_rate', 'crit_damage'],
};

function choose4<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let a = 0; a < arr.length; a++)
    for (let b = a + 1; b < arr.length; b++)
      for (let c = b + 1; c < arr.length; c++)
        for (let d = c + 1; d < arr.length; d++)
          out.push([arr[a], arr[b], arr[c], arr[d]]);
  return out;
}

/**
 * 粗排指標：**單次期望傷害最高的動作 ÷ 攻擊間隔**，少量取樣。
 *
 * 已知偏誤：「減少冷卻時間」對單次傷害沒有貢獻，只在輪替裡有價值，
 * 因此粗排會低估帶減CD 的組合 —— 這是前 K 名仍要跑全模擬的原因。
 */
function proxyDps(className: ClassName, loadout: Loadout, seed: number): number {
  const char = buildCharacter(className);
  const effects = preCombatBuffs(className);
  const effInt = designEffectiveInt(className, loadout.gear);
  const monster = makeReaper();
  const rotation = buildRotation(className);
  let best = 0;
  withSeed(seed, () => {
    let sum = 0;
    for (let i = 0; i < PROXY_SAMPLES; i++) {
      const r = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, effects, 0);
      sum += r.hit ? r.damage : 0;
    }
    best = sum / PROXY_SAMPLES;
    for (const e of rotation) {
      if (e.kind === 'self_buff') continue;
      if (!meetsWeaponRequirement(e, loadout)) continue;
      let s = 0;
      for (let i = 0; i < PROXY_SAMPLES; i++) {
        if (e.kind === 'physical_skill') {
          const fire = hasActiveFireEnchant(effects);
          for (let h = 0; h < (e.hits ?? 1); h++) {
            const r = calculatePhysicalSkillHit(char, loadout.weapon, monster, loadout.gear, fire, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
            s += r.hit ? r.damage : 0;
          }
        } else if (e.physicalSnapshot) {
          const r = calculatePhysicalSnapshotSkill(char, ruledSkillPower(e, effInt, className), e.element!, loadout.weapon, monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
          s += r.damage;
        } else {
          const r = calculateSkillAttack(char, ruledSkillPower(e, effInt, className), e.element!, monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0);
          s += r.damage;
        }
      }
      best = Math.max(best, s / PROXY_SAMPLES);
    }
  });
  const intervalMs = getPlayerAttackInterval(loadout.gear, effects);
  // § 7.4 元素侵蝕：粗排也要算進去，否則它永遠進不了前 3 名。
  // DoT 不吃防禦，穩態貢獻 = 佔用率 × 每跳傷害；佔用率 = 1 − e^(−每秒觸發次數 × 5s)
  const erosion = getErosion(loadout.weapon.affixes, loadout.weapon.quality ?? 0);
  let erosionDps = 0;
  if (erosion) {
    const rolls = getWeaponHitCount(loadout.weapon);
    const perAttack = 1 - Math.pow(1 - erosion.chance / 100, rolls);
    const procsPerSec = perAttack / (intervalMs / 1000);
    erosionDps = (1 - Math.exp(-procsPerSec * (EROSION_MS / 1000))) * erosion.damage;
  }
  return best / intervalMs * 1000 + erosionDps;
}

/** 依 § 44.5 自動選出該職業的前 TOP_FINAL 名配置 */
function searchBis(className: ClassName): { loadouts: Loadout[]; searched: number } {
  const support = buildSupportGear(className);
  const hands = handCombos(className);
  const seedSet = SEED_AFFIXES[className];
  // **所有候選共用同一顆種子**：粗排是要比武器素質，不是比運氣。
  // 每個候選各給一顆種子時，暴擊擲骰的雜訊（±數點）會蓋過候選之間的真實差距
  // （例：T5 星霜杖 10/10 曾因此排在 T7 星辰權杖 18/18 之前）。
  const PROXY_SEED = 777;

  const rankedHands = hands
    .map(h => ({ h, score: proxyDps(className, buildLoadout(h.label, h.weapon, h.offhand, seedSet, support), PROXY_SEED) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_HANDS);

  const affixSets = choose4(WEAPON_AFFIX_POOL);
  const ranked = rankedHands
    .flatMap(({ h }) => affixSets.map(set => {
      const lo = buildLoadout(`${h.label}｜${set.join('+')}`, h.weapon, h.offhand, set, support);
      return { lo, score: proxyDps(className, lo, PROXY_SEED) };
    }))
    .sort((a, b) => b.score - a.score);

  return {
    loadouts: ranked.slice(0, TOP_FINAL).map(r => r.lo),
    searched: hands.length + rankedHands.length * affixSets.length,
  };
}

console.log('## BiS 自動選定（§ 44.5）\n');
const SCENARIOS: { className: ClassName; loadouts: Loadout[] }[] = [];
for (const cn of ['knight', 'elf', 'thief', 'elementalist', 'priest'] as ClassName[]) {
  const { loadouts, searched } = searchBis(cn);
  console.log(`- ${CLASS_NAMES_ZH[cn]}：粗排 ${searched} 組（手部 ${handCombos(cn).length} × 詞綴 ${choose4(WEAPON_AFFIX_POOL).length}），`
    + `取前 ${loadouts.length} 名進全模擬 → ${loadouts.map(l => l.label).join(' / ')}`);
  SCENARIOS.push({ className: cn, loadouts });
}
if (MISSING.length > 0) console.log(`\n⚠️ 缺件：${[...new Set(MISSING)].join('、')}`);
console.log('');

// ---------------------------------------------------------------- 執行

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

console.log(`# Lv.75 滿裝 vs 百柱死神 — ${RUNS.toLocaleString()} 次模擬 / 情境`);
console.log(`目標：${REAPER_SEED.name} Lv.${REAPER_SEED.level} HP ${REAPER_SEED.hp} 防禦 ${REAPER_SEED.defense}`
  + `（減傷 ${Math.min(REAPER_SEED.defense, 75)}%）${REAPER_SEED.race}/${REAPER_SEED.size}/${REAPER_SEED.element}`);
console.log(`屬性預算：${ATTRIBUTE_CAP_NOTE}`);
console.log(`元素侵蝕每跳傷害：**${EROSION_MODE === 'max' ? '完美 roll' : EROSION_MODE === 'low' ? '範圍下緣' : '範圍期望值'}**（--erosion=${EROSION_MODE}）`);
console.log(`規則組：**${RULES.label}**（--rules=${RULES.name}）`
  + ` — INT 每 2 點 +${RULES.intDamagePer2}% 技能威力 / +${RULES.intCdrPer2}% 冷卻縮減；`
  + `基礎魔法威力 ×${RULES.basicPowerMult}、職業魔法威力 ×${RULES.classPowerMult}`);
console.log('');

const pairs: { unlimited: ScenarioReport; limited: ScenarioReport }[] = [];
let seed = 20260801;
for (const sc of SCENARIOS) {
  for (const lo of sc.loadouts) {
    for (const withSpeed of [false, true]) {
      const s0 = seed++;
      pairs.push({
        unlimited: runScenario(sc.className, lo, withSpeed, false, s0),
        limited: runScenario(sc.className, lo, withSpeed, true, s0),
      });
    }
  }
}

console.log('| 職業 | 配置 | 加速 | 攻擊間隔 | 擊殺(MP無限) | 擊殺(計入MP) | 差異 | 中位(計入MP) | P10 | P90 | DPS(計入MP) | 每殺耗魔 | MP池 | MP見底行動% |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { unlimited: u, limited: l } of pairs) {
  const delta = u.mean > 0 ? ((l.mean - u.mean) / u.mean) * 100 : 0;
  console.log(`| ${CLASS_NAMES_ZH[l.className]} | ${l.label} | ${l.speedLabel} | ${l.interval}ms `
    + `| ${fmt(u.mean, 2)}s | ${fmt(l.mean, 2)}s | ${delta >= 0 ? '+' : ''}${fmt(delta)}% `
    + `| ${fmt(l.median, 2)}s | ${fmt(l.p10, 2)}s | ${fmt(l.p90, 2)}s | ${fmt(l.dps)} `
    + `| ${Math.round(l.mpPerKill)} | ${l.maxMp} | ${fmt(l.mpStarvedPercent)}% |`);
}

// § 44.7 表 2：各職業最佳解摘要
const bestPerClass = new Map<ClassName, ScenarioReport>();
for (const { limited } of pairs) {
  const cur = bestPerClass.get(limited.className);
  if (!cur || limited.mean < cur.mean) bestPerClass.set(limited.className, limited);
}
const ordered = [...bestPerClass.values()].sort((a, b) => a.mean - b.mean);
const slowest = ordered[ordered.length - 1].mean;
console.log('\n## 各職業最佳解摘要（計入 MP）\n');
console.log('| 職業 | 最佳配置 | 加速 | 擊殺 | 平均 DPS | 相對最慢 | MP 見底行動% |');
console.log('|---|---|---|---|---|---|---|');
for (const r of ordered) {
  console.log(`| ${CLASS_NAMES_ZH[r.className]} | ${r.label} | ${r.speedLabel} | ${fmt(r.mean, 2)}s `
    + `| ${fmt(r.dps)} | ${fmt(slowest / r.mean, 2)}x | ${fmt(r.mpStarvedPercent)}% |`);
}

console.log('\n## 各配置衍生數值與行動分佈（計入 MP）\n');
for (const { limited: r } of pairs) {
  if (r.speedLabel === '無加速') continue;
  console.log(`### ${CLASS_NAMES_ZH[r.className]} — ${r.label}`);
  console.log(Object.entries(r.derived).map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`實測物理命中率 ${fmt(r.hitRate)}%（技能 100% 命中，不計入）  實測暴擊率 ${fmt(r.critRate)}%`);
  console.log('單次期望傷害（校準用，> 普通攻擊者才進輪替）：'
    + r.scores.filter(s => Number.isFinite(s.avg))
      .map(s => `${s.name} ${fmt(s.avg)}${s.note ? `（${s.note}）` : ''}`).join('、'));
  console.log('實際行動分佈：' + r.actionMix.map(([k, v]) => `${k} ${v}%`).join('、'));
  console.log('');
}
