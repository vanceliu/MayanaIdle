/**
 * 百柱死神模擬的共用部分：角色建構、配裝、技能盤點與輪替、校準、BiS 搜尋（`44-dps-prediction.md`）。
 * `simulateReaperKill.mts`（木樁）與 `simulateReaperFight.mts`（實戰）共用。
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
import { SPEED_POTION_ATTACK_SPEED_PERCENT, type ActiveEffect, type StatModifier } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import { SKILL_CATALOG, resolveDotDamagePercent } from '../src/models/skill';
import { CLASS_MAGIC_RESTRICTIONS, getLearnableMaxLevel } from '../src/models/skillRestrictions';
import { TALENT_INSTALL_MAX } from '../src/models/talent';
import { CLASS_SKILLS } from '../src/models/classSkills';
import {
  getErosion, getWeaponBaseDamage, getWeaponDebuffAffixes,
  AFFIX_DEBUFF_CHANCE, AFFIX_DEBUFF_DURATION_MS, DEFENSE_DOWN_CATEGORY,
} from '../src/models/affix';
import {
  UNIQUE_AFFIX_DEFINITIONS, UNIQUE_HIT_PROC_CHANCE, sumUniqueAffix, type UniqueAffixType,
} from '../src/models/uniqueAffix';
import { getEffectiveGear } from '../src/systems/gear';
import { setRandomSource } from '../src/core/rng';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';


// ---------------------------------------------------------------- RNG

/** 遊戲端亂數（`core/rng.ts`）改走 `Math.random`，`withSeed()` 才能固定整場模擬的亂數 */
setRandomSource(() => Math.random());

/** 可重現的 LCG（mulberry32）。覆寫 Math.random，讓真實 combat.ts 也吃到固定亂數流。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const nativeRandom = Math.random;
export function withSeed<T>(seed: number, fn: () => T): T {
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = nativeRandom;
  }
}

// ---------------------------------------------------------------- 常數

/**
 * 每個情境的模擬次數。`--runs=N` 可覆寫。
 *
 * **預設 600**：全五職業 `--top=40` 約 9.5 分鐘，落在「改一次數值就能重跑」的範圍。
 * 每個候選的成本約 4.7 秒 × (runs/1000)，粗排的固定成本不到 1 秒。
 * `--runs=10000` 誤差更小但全跑要兩個多小時，只在要把數字寫進報告時才用。
 */
export const RUNS_ARG = Number(process.argv.find(a => a.startsWith('--runs='))?.split('=')[1]);
export const RUNS = Number.isFinite(RUNS_ARG) && RUNS_ARG > 0 ? RUNS_ARG : 600;

/** 回魔技（魔力奪取）的施放門檻：MP 低於上限的這個比例才放 */
export const MP_DRAIN_THRESHOLD = 0.3;

/**
 * 可切換的規則組（`--rules=<name>`），用來評估數值調整的假設。
 *
 * **INT 不在規則組的控制範圍內。** 傷害一律交給 `combat.ts` 的 `calculateSkillAttack()`
 * 原生處理（含 INT 加成、魔攻乘區、暴擊、防禦減傷與取整順序），腳本不重算任何公式。
 * 規則組能動的只有「餵進去的技能威力」與「裝備上的 magicAttack」。
 */
export interface Rules {
  name: string;
  label: string;
  /**
   * 每 2 點有效 INT 提供的「技能威力%」—— **僅供表頭顯示，不會改變計算**。
   *
   * INT 加成由 `combat.ts` 的 `getBaseMagicAttack()` 原生處理，腳本沒有覆寫點。
   * 要試算不同的 INT 係數，只能暫時改 `INT_SKILL_DAMAGE_PERCENT_PER_2` 再跑。
   * 曾有 `no-int` / `int-10` 兩組規則掛在這個欄位上，因為改了不生效而**靜默失真**，已移除。
   */
  intDamagePer2: number;
  /** 每 2 點有效 INT 提供的「冷卻縮減%」（與詞綴/buff 加總後同樣受 50% 上限） */
  intCdrPer2: number;
  /** 基礎魔法威力倍率 */
  basicPowerMult: number;
  /** 職業魔法威力倍率（預設） */
  classPowerMult: number;
  /** 職業魔法威力倍率的職業別覆寫 */
  classPowerMultBy?: Partial<Record<ClassName, number>>;
  /**
   * 裝備 `magicAttack` 的倍率，用來試算「每 1 點魔攻換算幾 %」的匯率調整。
   * 1 = 現行（每 1 點 → +1%）。法杖強化那一份走 `getTotalMagicAttack()`，
   * 不吃這個倍率，因此本欄只放大裝備模板上的基底魔攻。
   */
  magicAttackMult: number;
}

/**
 * `current` 直接沿用 `combat.ts` 的常數與 seed 的技能威力，因此**必定與遊戲一致**；
 * 其餘規則組是用來評估調整方向的假設，只改這裡不會影響遊戲。
 */
export const RULE_SETS: Record<string, Rules> = {
  current: {
    name: 'current', label: '現行規則',
    intDamagePer2: INT_SKILL_DAMAGE_PERCENT_PER_2,
    intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 1, classPowerMult: 1, magicAttackMult: 1,
  },
  'nerf-more': {
    name: 'nerf-more', label: '技能威力再砍 20%（在現行值之上）',
    intDamagePer2: INT_SKILL_DAMAGE_PERCENT_PER_2,
    intCdrPer2: INT_COOLDOWN_PERCENT_PER_2,
    basicPowerMult: 0.8, classPowerMult: 1, magicAttackMult: 1,
    classPowerMultBy: { elementalist: 0.8, priest: 0.8 },
  },
};

/** `--no-skill-debuff`：技能的降防 debuff 不施加（量測降防技能的貢獻用） */
export const NO_SKILL_DEBUFF = process.argv.includes('--no-skill-debuff');

export const RULES_ARG = process.argv.find(a => a.startsWith('--rules='))?.split('=')[1] ?? 'current';
export const RULES = RULE_SETS[RULES_ARG];
if (!RULES) throw new Error(`未知的規則組：${RULES_ARG}（可用：${Object.keys(RULE_SETS).join(', ')}）`);

/** INT 提供的冷卻縮減%（未套 50% 上限） */
export function intCooldownReduction(effInt: number): number {
  return (effInt / 2) * RULES.intCdrPer2;
}

/**
 * 交給 `calculateSkillAttack()` 的威力：只套規則組的威力倍率。
 * **INT 一律交給 combat.ts 原生處理** —— § 21.4 改成乘區之後，
 * 腳本側先折算會整個繞過那個乘區，量到的數字會與遊戲不符。
 */
export function ruledSkillPower(
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
export const FRAME_MS = 1000 / 60;
/** gameLoop.ts DOT_TICK_INTERVAL */
export const DOT_TICK_MS = 1000;
/** § 7.4 元素侵蝕的 DoT 持續時間 */
export const EROSION_MS = 5000;
/** 打不死就中止（避免無限迴圈） */
export const TIMEOUT_MS = 10 * 60 * 1000;

export const ATTRIBUTE_CAP_NOTE = '建角 80 點（單項上限 18）+ Lv.51~75 每級 1 點 = 105 點';

// ---------------------------------------------------------------- 角色

/**
 * § 44.4：建角 80 點的最終分配（單項上限 18）。
 * SPI 在建角後就不再變動 —— 升級點全投主攻屬性與次要屬性，因此 MP 曲線可精確重現。
 */
export const CREATION_ATTRIBUTES: Record<ClassName, Attributes> = {
  knight: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
  // 妖精用弓，普攻吃敏捷不吃力量（`21-combat-formula.md` § 21.3）—— 建角把敏捷推到 18
  elf: { STR: 14, AGI: 18, VIT: 16, SPI: 12, INT: 10, CHA: 10 },
  elementalist: { STR: 8, AGI: 8, VIT: 18, SPI: 16, INT: 18, CHA: 12 },
  priest: { STR: 6, AGI: 8, VIT: 18, SPI: 15, INT: 18, CHA: 15 },
  thief: { STR: 18, AGI: 18, VIT: 12, SPI: 10, INT: 12, CHA: 10 },
};

/** 各職業「設計上」的有效 INT（配點 + 裝備），用於 INT 冷卻縮減與表頭顯示 */
export function designEffectiveInt(className: ClassName, gear: (EquipmentInstance | null)[]): number {
  const raw = CREATION_ATTRIBUTES[className].INT + (LEVELUP_ALLOCATION[className].INT ?? 0);
  const fromGear = gear.reduce((sum, g) => sum + (GEAR_INT_BONUS.get(g?.name ?? '') ?? 0), 0);
  return getEffectiveINT(raw + fromGear);
}

/** 裝備模板的 INT 額外屬性（makeItem 會把 instance 的 INT 歸零，這裡另存一份） */
export const GEAR_INT_BONUS = new Map<string, number>(
  EQUIPMENT_SEEDS.filter(t => t.bonusAttributes?.INT).map(t => [t.name, t.bonusAttributes!.INT!]),
);

/** § 44.4：Lv.51~75 的 25 點升級配點（主攻屬性 17 點推到 35，餘 8 點） */
export const LEVELUP_ALLOCATION: Record<ClassName, Partial<Attributes>> = {
  knight: { STR: 17, VIT: 8 },
  elf: { AGI: 17, STR: 8 },
  elementalist: { INT: 17, VIT: 8 },
  priest: { INT: 17, VIT: 8 },
  thief: { STR: 17, AGI: 8 },
};

/** 依配點順序（主攻屬性優先）取前 n 點的 bonusAttributes 快照 */
export function partialAllocation(full: Attributes, n: number): Attributes {
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
export function levelTo75(base: Attributes, bonus: Attributes): { maxHp: number; maxMp: number } {
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

export function buildCharacter(className: ClassName): Character {
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

export const REAPER_SEED = MONSTER_SEEDS.find(m => m.name === '百柱死神');
if (!REAPER_SEED) throw new Error('找不到百柱死神 seed');

export function makeReaper(): MonsterInstance {
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

export type AffixType = 'attack_power' | 'element_brand' | 'element_erosion' | 'skill_elemental' | 'crit_rate'
  | 'crit_damage' | 'attack_speed' | 'cooldown_reduction' | 'defense_down' | 'defense' | 'max_hp' | 'max_mp';

/** T7 獨有詞綴一律取區間上限（`07-affix-tier7.md` § 7T.5），與一般詞綴取 T7 上限一致 */
export function uniqueMax(type: UniqueAffixType): number {
  return UNIQUE_AFFIX_DEFINITIONS.find(d => d.type === type)?.range?.[1] ?? 0;
}

/**
 * 木樁上有輸出價值的武器獨有詞綴：被動三種（爆擊傷害／爆擊率／攻擊速度）＋ 追加傷害。
 * 回血、回魔、擊殺回血、命中暈眩對擊殺時間無貢獻（MP 不是瓶頸，§ 44.10）。
 */
export const WEAPON_UNIQUE_OPTIONS: UniqueAffixType[] = UNIQUE_AFFIX_DEFINITIONS
  .filter(d => d.pool === 'weapon' && (d.trigger === 'passive' || d.type === 'hit_bonus_damage'))
  .map(d => d.type);

/** T7 上限 20，品質 20% → getEffectiveAffixValue = floor(20 × 1.2) = 24 */
export const T7 = 20;
/** 武器的一般詞綴條數（4 洞全滿）；其後再 1 條封印詞綴（`07-affix.md` § 7.1／§ 7.11.1） */
export const WEAPON_GENERAL_AFFIXES = 4;
export const QUALITY = 20;

/**
 * 防具／飾品／**魔導書**完全沒有攻擊詞綴（`affix.ts` § 7.6），對本戰只影響防禦與 MP 池。
 * 魔導書走 armor 池是遊戲規則，不是本腳本的假設。
 */
export const ARMOR_AFFIXES: AffixType[] = ['defense', 'max_hp', 'max_mp'];

export interface Loadout {
  label: string;
  /** 武器的 T7 獨有詞綴；非 T7 武器為 null */
  unique: UniqueAffixType | null;
  weaponName: string;
  weapon: EquipmentInstance;
  gear: (EquipmentInstance | null)[];
}

// ---------------------------------------------------------------- BiS 自動選定（§ 44.5）

export type Template = (typeof EQUIPMENT_SEEDS)[number];

/** 缺件報告。找不到部位時累積在這裡，最後印出來 —— 不 throw（§ 44.9） */
export const MISSING: string[] = [];

export const ARMOR_SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace', 'ring1'] as const;
export const OFFHAND_TYPES = new Set(['shield', 'magicBook', 'armGuard']);
/**
 * 各職業的主攻屬性。**妖精是敏捷** —— 弓走遠程公式，基礎攻擊力吃 AGI 加成
 * （`21-combat-formula.md` § 21.3）。盜賊的雙刀與鋼爪是近戰，維持力量。
 */
export const MAIN_STAT: Record<ClassName, keyof Attributes> = {
  knight: 'STR', elf: 'AGI', thief: 'STR', elementalist: 'INT', priest: 'INT',
};

export function usableBy(t: Template, cn: ClassName): boolean {
  return !t.requiredClass || t.requiredClass.length === 0 || t.requiredClass.includes(cn);
}

/** 腰帶安定值 −1 不可強化；飾品 +8 封頂（§ 44.1）；其餘 +9 */
export function enhancementFor(slot: string): number {
  if (slot === 'belt') return 0;
  if (slot === 'necklace' || slot.startsWith('ring')) return 8;
  return 9;
}

/**
 * 元素刻印在模擬裡一律取「克制目標的元素」（`42-element-system.md` § 42.2）——
 * BiS 的前提是玩家挑得到最適合這場的裝備，刻印當然也挑克制的那一把。
 * 目標是暗屬性的百柱死神，因此刻印為光。
 */
export const BRAND_COUNTER: Record<string, string> = {
  wind: 'fire', earth: 'wind', ice: 'earth', fire: 'ice', dark: 'light', light: 'dark',
};
export const BIS_BRAND_ELEMENT = BRAND_COUNTER[REAPER_SEED.element] ?? 'fire';

/** `--erosion=max|mean`：侵蝕每跳傷害取完美 roll 或範圍期望值 */
export const EROSION_MODE = process.argv.find(a => a.startsWith('--erosion='))?.split('=')[1] ?? 'max';
if (!['max', 'mean', 'low'].includes(EROSION_MODE)) throw new Error(`未知的 --erosion=${EROSION_MODE}（可用：max, mean, low）`);
export function erosionRollValue(base: number): number {
  const max = Math.max(1, Math.floor(base));
  const min = Math.max(1, Math.floor(max / 2));
  if (EROSION_MODE === 'max') return max;
  if (EROSION_MODE === 'low') return min;
  return Math.max(1, Math.round((min + max) / 2));
}

export function instantiate(tpl: Template, enhancement: number, affixTypes: AffixType[], unique: UniqueAffixType | null = null): EquipmentInstance {
  const bonusAttributes = tpl.bonusAttributes;
  /*
   * 裝備魔攻的「點數 → 百分比」匯率調整（`magicAttackMult`）。
   *
   * `getBaseMagicAttack()` 是 `floor(威力 × (1 + Σ魔攻 / 100))`，把裝備上的
   * `magicAttack` 先乘上倍率，效果**等同**改那個 /100 的匯率，不必動 `combat.ts`。
   *
   * 但法杖／雙手法杖的強化那一份是 `getTotalMagicAttack()` 於執行期補的
   * `floor(強化/2)`，吃不到這裡的倍率 —— 因此把差額 `floor(強化/2) × (倍率−1)`
   * 一併塞進來，讓最終總和等於 `(基底 + 強化) × 倍率`。少了這段，
   * 匯率只套到一半，量出來的法系會低估。
   */
  const mult = RULES.magicAttackMult;
  // 與 `combat.ts` 的 `MAGIC_ATTACK_WEAPON_TYPES` 一致：魔導書是防具，強化不給魔攻
  const enhanceMagic = (tpl.type === 'staff' || tpl.type === 'twoHandStaff')
    ? Math.floor(enhancement / 2)
    : 0;
  const magicAttack = (tpl.magicAttack != null || enhanceMagic > 0)
    ? Math.round((tpl.magicAttack ?? 0) * mult + enhanceMagic * (mult - 1))
    : tpl.magicAttack;
  return {
    ...tpl, bonusAttributes, magicAttack, templateId: tpl.id!, quality: QUALITY, enhancement,
    // 第 5 條為封印詞綴（`07-affix.md` § 7.11.1）：效果與一般詞綴相同、吃品質
    affixes: affixTypes.map((type, i) => ({
      type, tier: 7, value: T7,
      ...(i === WEAPON_GENERAL_AFFIXES ? { sealed: true as const } : {}),
      ...(type === 'element_brand' || type === 'element_erosion' ? { element: BIS_BRAND_ELEMENT } : {}),
      // 侵蝕的每跳傷害（§ 7.4）。`--erosion=max` 取完美 roll（與其他詞綴一律取 T7 上限一致）；
      // `--erosion=mean` 取該範圍的期望值，代表實際掉落的平均水準。
      ...(type === 'element_erosion' ? { dotDamage: erosionRollValue(getWeaponBaseDamage(tpl)) } : {}),
    })),
    ...(unique ? { uniqueAffix: { type: unique, value: uniqueMax(unique) } } : {}),
    ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

/**
 * 木樁測試下，防具／飾品／副手對**輸出**的影響只有 `bonusAttributes` 與 `magicAttack`
 * ——它們沒有攻擊詞綴（§ 7.6），防禦與格擋在不還手的目標上不生效。
 * 各部位彼此獨立，因此逐部位取最佳即為全域最佳，不需要跨部位窮舉。
 */
export function scoreSupportPiece(t: Template, cn: ClassName): number {
  const main = t.bonusAttributes?.[MAIN_STAT[cn]] ?? 0;
  return main * 1000 + (t.magicAttack ?? 0) * 100 + (t.defense ?? 0);
}

export function pickSupport(cn: ClassName, pred: (t: Template) => boolean, what: string): Template | null {
  const pool = EQUIPMENT_SEEDS.filter(t => t.acquireType !== 'starter' && usableBy(t, cn) && pred(t));
  if (pool.length === 0) { MISSING.push(`${CLASS_NAMES_ZH[cn]} 缺 ${what}`); return null; }
  return pool.reduce((a, b) => (scoreSupportPiece(b, cn) > scoreSupportPiece(a, cn) ? b : a));
}

/** 防具與飾品（不含手部）—— 每個職業只需算一次 */
export function buildSupportGear(cn: ClassName): EquipmentInstance[] {
  const out: EquipmentInstance[] = [];
  for (const slot of ARMOR_SLOTS) {
    const tpl = pickSupport(cn, t => t.slot === slot, slot);
    if (!tpl) continue;
    // T7 飾品帶全屬性（§ 7T.5）；同類只有一件生效，由 getEffectiveGear() 去重
    const unique = tpl.tier === 7 && (slot === 'necklace' || slot === 'ring1') ? 'all_attributes' : null;
    out.push(instantiate(tpl, enhancementFor(slot), ARMOR_AFFIXES, unique));
    if (slot === 'ring1') out.push(instantiate(tpl, enhancementFor(slot), ARMOR_AFFIXES, unique)); // 兩隻戒指
  }
  return out;
}

export function bestOffhand(cn: ClassName): Template | null {
  return pickSupport(cn, t => OFFHAND_TYPES.has(t.type as string), '副手');
}

/** 候選手部組合：雙手武器，以及「單手武器 ＋ 該職業最佳副手」 */
export function handCombos(cn: ClassName): { label: string; weapon: Template; offhand: Template | null }[] {
  const weapons = EQUIPMENT_SEEDS.filter(t =>
    t.acquireType !== 'starter' && usableBy(t, cn)
    && t.smallMonsterDamage != null && !OFFHAND_TYPES.has(t.type as string));
  if (weapons.length === 0) { MISSING.push(`${CLASS_NAMES_ZH[cn]} 缺武器`); return []; }
  const off = bestOffhand(cn);
  return weapons.map(w => w.isTwoHanded
    ? { label: `${w.name}+9（雙手）`, weapon: w, offhand: null }
    : { label: `${w.name}+9 ＋ ${off?.name ?? '空手'}`, weapon: w, offhand: off });
}

export function buildLoadout(
  label: string,
  weapon: Template,
  offhand: Template | null,
  weaponAffixes: AffixType[],
  support: EquipmentInstance[],
  unique: UniqueAffixType | null = null,
): Loadout {
  const w = instantiate(weapon, 9, weaponAffixes, unique);
  const gear: (EquipmentInstance | null)[] = [w];
  if (offhand) gear.push(instantiate(offhand, 9, ARMOR_AFFIXES));
  gear.push(...support);
  return { label, unique, weaponName: weapon.name, weapon: w, gear };
}

/** 套用素質需求凍結與獨有詞綴同類去重（`systems/gear.ts`），戰鬥一律吃這份 */
export function resolveLoadout(char: Character, effects: ActiveEffect[], loadout: Loadout): Loadout {
  const gear = getEffectiveGear(char, effects, loadout.gear);
  return { ...loadout, gear, weapon: gear[0] as EquipmentInstance };
}

// ---------------------------------------------------------------- Buff

/**
 * combat.ts 用 `Date.now() - startTime >= duration` 判定過期。
 * 模擬用虛擬時鐘，因此 buff 一律設為永不過期，由本檔自行 add/remove 控制生效期間。
 */
export function makeBuff(id: string, category: string, modifiers: StatModifier[]): ActiveEffect {
  return {
    id, sourceSkillId: id, sourceSkillName: id, category,
    type: 'buff', target: 'player', modifiers,
    startTime: 0, duration: Number.MAX_SAFE_INTEGER,
    tags: [], name: id, description: '',
  };
}

/** 掛在怪物身上的數值型 debuff（防禦下降詞綴、詛咒、護甲崩壞等），生效期間由本檔控制 */
export function makeMonsterDebuff(id: string, category: string, modifiers: StatModifier[]): ActiveEffect {
  return {
    id, sourceSkillId: id, sourceSkillName: id, category,
    type: 'debuff', target: 'monster', targetIdx: 0, modifiers,
    startTime: 0, duration: Number.MAX_SAFE_INTEGER,
    tags: [], name: id, description: '',
  };
}

// ---------------------------------------------------------------- 技能盤點

/** § 44.1 的角色等級 */
export const CHAR_LEVEL = 75;
/** § 44.1：持續時間達此值的 buff 視為戰前開好，不佔戰鬥中的行動 */
export const PRECOMBAT_MIN_DURATION_MS = 300_000;
/** 只影響承傷的屬性：木樁不還手，這些 modifier 對輸出沒有作用 */
export const DEFENSIVE_STATS = new Set(['defense', 'damageReduction', 'shield_absorb', 'evasion', 'mana_shield']);
/** 怪物 debuff 中會改變玩家輸出的屬性（防禦 → 減傷，`21-combat-formula.md` § 21.16） */
export const OUTPUT_MONSTER_DEBUFF_STATS = new Set(['defense']);
export const SPEED_CATEGORY = 'speed';
export const SPEED_POTION_NAME = '綠色藥水';

export type SkillDef = Omit<Skill, 'lastUsedAt'>;

/**
 * 技能在模擬中的處理方式：
 * 加速來源／戰前開好／進輪替／被同類覆蓋／木樁量不到／超出學習上限
 */
export type SkillHandling = 'speed' | 'precombat' | 'rotation' | 'sustain' | 'superseded' | 'unmeasurable' | 'over_budget';

export const HANDLING_LABEL: Record<SkillHandling, string> = {
  speed: '加速來源', precombat: '戰前', rotation: '輪替', sustain: '續航（不佔行動）', superseded: '同類覆蓋',
  unmeasurable: '量不到', over_budget: '超出學習上限',
};

export interface SkillPlanItem {
  skill: SkillDef;
  isBasicMagic: boolean;
  source: string;
  handling: SkillHandling;
  note: string;
}

/** 普攻命中觸發的 DoT（淬毒） */
export interface OnHitDot { category: string; percent: number; interval: number; duration: number }

export interface ClassSkillPlan {
  items: SkillPlanItem[];
  precombat: ActiveEffect[];
  speed: { name: string; effect: ActiveEffect };
  rotation: SkillPlanItem[];
  onHitDot: OnHitDot | null;
}

export const hasOutputModifier = (mods: StatModifier[] | undefined) => !!mods?.some(m => !DEFENSIVE_STATS.has(m.stat));

/** 攻擊技能附帶的 debuff 是否會降低怪物防禦（會的話照實模擬） */
export function lowersMonsterDefense(s: SkillDef): boolean {
  const d = s.applyDebuff;
  return !!d && !d.stun && !!d.modifiers?.some(m => OUTPUT_MONSTER_DEBUFF_STATS.has(m.stat) && m.value < 0);
}

export const speedPercentOf = (s: SkillDef) =>
  s.buffModifiers?.find(m => m.stat === 'attack_speed')?.value ?? 0;

/** buff／治療類技能在木樁上量不到的原因；量得到時回 null */
export function unmeasurableReason(s: SkillDef): string | null {
  if (s.type === 'heal') return '治療，木樁不還手';
  if (s.type === 'passive') return '被動（閃避反擊），木樁不還手';
  if (s.evadeCharges) return '絕對迴避，木樁不還手';
  if (s.type !== 'buff') return null;
  if (s.invincible) return '無敵，木樁不還手';
  if (s.cleanse) return '淨化，木樁不施加負面狀態';
  if (s.onHitDebuff) return null;
  if (!hasOutputModifier(s.buffModifiers)) return '只影響承傷，木樁不還手';
  return null;
}

/** 攻擊技能的附帶效果在模擬中如何處理 */
export function attackSideNote(s: SkillDef): string {
  const notes: string[] = [];
  const d = s.applyDebuff;
  if (d) {
    if (d.dotDamagePercent || d.dotDamage) notes.push(`${d.name} DoT 照實模擬`);
    else if (lowersMonsterDefense(s)) notes.push(`${d.name}（${d.description}）照實模擬`);
    else notes.push(`${d.name}量不到（目標不還手）`);
  }
  if (s.selfBuff?.scaleByMissingHp) notes.push('殘血加成依模擬中的 HP（自扣 HP 的技能會壓低）');
  if (s.randomHits) notes.push(`單一目標時 ${s.randomHits} 下全中`);
  if (s.selfHpCostPercent) notes.push(`自扣有效最大 HP ${s.selfHpCostPercent}%`);
  if (s.dotOnly) notes.push('只上毒，不造成直接傷害');
  if (s.dash || s.retreat) notes.push('位移量不到（木樁不動）');
  if (s.selfBuff?.modifiers?.length) notes.push(`${s.selfBuff.name}自身增益照實模擬`);
  if (s.lifestealPercent) notes.push('吸血量不到');
  if (s.mpDrainRatio) notes.push('回魔技，MP 低於 30% 才放');
  if (s.requiredWeaponType) notes.push(`需裝備${s.requiredWeaponType}`);
  return notes.join('；');
}

export function classifySkill(s: SkillDef, isBasicMagic: boolean, source: string): SkillPlanItem {
  const item = (handling: SkillHandling, note: string): SkillPlanItem => ({ skill: s, isBasicMagic, source, handling, note });
  if (s.type === 'buff' && s.buffCategory === SPEED_CATEGORY) return item('speed', `攻速 +${speedPercentOf(s)}%`);
  if (s.mpRestorePercent) {
    return item('sustain', `MP 低於 ${100 - s.mpRestorePercent}% 時扣 HP ${s.selfHpCostPercent ?? 0}% 換 MP ${s.mpRestorePercent}%，不佔行動`);
  }
  const reason = unmeasurableReason(s);
  if (reason) return item('unmeasurable', reason);
  if (s.type === 'buff') {
    if ((s.buffDuration ?? 0) >= PRECOMBAT_MIN_DURATION_MS) {
      return item('precombat', s.onHitDebuff ? `普攻命中觸發${s.onHitDebuff.name}（${s.onHitDebuff.description}）` : (s.buffEffect ?? ''));
    }
    return item('rotation', `短效 buff（${s.buffEffect ?? ''}，${(s.buffDuration ?? 0) / 1000}s）`);
  }
  return item('rotation', attackSideNote(s));
}

/** 學習上限超出時的保留順序：加速 → 戰前 → 降防 → 其餘依技能攻擊力 */
export function learnPriority(i: SkillPlanItem): number {
  if (i.handling === 'speed') return 0;
  if (i.handling === 'precombat' || i.handling === 'sustain') return 1;
  if (i.handling === 'rotation' && lowersMonsterDefense(i.skill)) return 2;
  if (i.handling === 'rotation') return 3 + 1 / (1 + i.skill.power);
  return 5;
}

/**
 * 該職業 Lv.75 學得到的所有技能及其處理方式。
 * 基礎魔法可學等級與學習數上限讀 `skillRestrictions.ts`；同 category 的戰前 buff 只留等級最高者。
 */
export function buildSkillPlan(className: ClassName): ClassSkillPlan {
  const items: SkillPlanItem[] = [];
  for (const cs of CLASS_SKILLS) {
    if (cs.className !== className || cs.requiredLevel > CHAR_LEVEL) continue;
    items.push(classifySkill(cs.skill, false, `職業 ${cs.classLevel} 級`));
  }
  const maxBasicLevel = getLearnableMaxLevel(className, CHAR_LEVEL);
  const basics = SKILL_CATALOG
    .filter(s => s.level <= maxBasicLevel)
    .map(s => classifySkill(s, true, `基礎 ${s.level} 級`))
    .sort((a, b) => learnPriority(a) - learnPriority(b));
  const basicBudget = CLASS_MAGIC_RESTRICTIONS[className].maxSkills;
  basics.forEach((b, i) => {
    if (i >= basicBudget) { b.handling = 'over_budget'; b.note = `學習上限 ${basicBudget} 個`; }
  });
  items.push(...basics);

  const winners = new Map<string, SkillPlanItem>();
  for (const i of items.filter(x => x.handling === 'precombat')) {
    const category = i.skill.buffCategory ?? i.skill.id;
    const cur = winners.get(category);
    if (!cur || i.skill.level > cur.skill.level) winners.set(category, i);
  }
  for (const i of items.filter(x => x.handling === 'precombat')) {
    const winner = winners.get(i.skill.buffCategory ?? i.skill.id)!;
    if (winner !== i) { i.handling = 'superseded'; i.note = `被${winner.skill.name}覆蓋（同 category）`; }
  }

  const speedSkills = items.filter(x => x.handling === 'speed').sort((a, b) => speedPercentOf(b.skill) - speedPercentOf(a.skill));
  const bestSpeedSkill = speedSkills[0];
  const useSkillSpeed = !!bestSpeedSkill && speedPercentOf(bestSpeedSkill.skill) >= SPEED_POTION_ATTACK_SPEED_PERCENT;
  for (const s of speedSkills) {
    if (!useSkillSpeed || s !== bestSpeedSkill) {
      s.handling = 'superseded';
      s.note = `被${useSkillSpeed ? bestSpeedSkill.skill.name : SPEED_POTION_NAME}覆蓋（同 category）`;
    }
  }
  const speed = useSkillSpeed
    ? { name: bestSpeedSkill.skill.name, effect: makeBuff(bestSpeedSkill.skill.name, SPEED_CATEGORY, bestSpeedSkill.skill.buffModifiers!) }
    : { name: SPEED_POTION_NAME, effect: makeBuff(SPEED_POTION_NAME, SPEED_CATEGORY, [{ stat: 'attack_speed', value: SPEED_POTION_ATTACK_SPEED_PERCENT, isPercent: true }]) };

  const precombatItems = items.filter(x => x.handling === 'precombat');
  const precombat = precombatItems.map(i => makeBuff(i.skill.name, i.skill.buffCategory ?? i.skill.id, i.skill.buffModifiers ?? []));
  const poison = precombatItems.find(i => i.skill.onHitDebuff?.dotDamagePercent)?.skill.onHitDebuff;
  const onHitDot = poison
    ? { category: poison.category, percent: poison.dotDamagePercent!, interval: poison.dotInterval ?? DOT_TICK_MS, duration: poison.dotDuration ?? 5000 }
    : null;

  // 短效 buff 由等級高者先放（強化冷卻縮減先於冷卻縮減）；校準對 buff 之間維持這個順序
  const rotationItems = items.filter(x => x.handling === 'rotation');
  const rotation = [
    ...rotationItems.filter(x => x.skill.type === 'buff').sort((a, b) => b.skill.level - a.skill.level),
    ...rotationItems.filter(x => x.skill.type !== 'buff'),
  ];

  return { items, precombat, speed, rotation, onHitDot };
}

export const SKILL_PLANS = new Map<ClassName, ClassSkillPlan>();
export function getSkillPlan(className: ClassName): ClassSkillPlan {
  let plan = SKILL_PLANS.get(className);
  if (!plan) { plan = buildSkillPlan(className); SKILL_PLANS.set(className, plan); }
  return plan;
}

/** 戰前開好的長效 buff（每次回傳新陣列，呼叫端可自由 push） */
export function preCombatBuffs(className: ClassName): ActiveEffect[] {
  return [...getSkillPlan(className).precombat];
}

// ---------------------------------------------------------------- 輪替

export type ActionKind = 'normal' | 'magic_skill' | 'physical_skill' | 'self_buff';

export interface RotationEntry {
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
  /** § 21.8 魔法公式的物理系技能（復仇之刃／背刺）保留爆擊 */
  physicalDamage?: boolean;
  /** § 99.1 第 6 條：【需裝備弓】是實際限制，配裝不符時整招不可用 */
  requiredWeaponType?: string;
  /** 冷卻（ms，未套 CDR） */
  cooldown: number;
  /** MP 消耗（`canUseSkill` 會擋） */
  mpCost: number;
  /** 回復等同最終傷害的 MP（魔力奪取 = 1） */
  mpDrainRatio?: number;
  /** 單一目標時連打幾下（血濺咒殺的隨機多擊全落在死神身上） */
  randomHits?: number;
  /** 只上 DoT，不造成直接傷害（毒霧） */
  dotOnly?: boolean;
  /** 自扣有效最大 HP 的百分比（血濺咒殺），最低留 1 */
  selfHpCostPercent?: number;
  /** 施放後給自己的 buff（背刺）；`scaleByMissingHp` 依當下殘血決定加成（復仇之刃） */
  selfBuff?: {
    category: string; modifiers: StatModifier[]; duration: number;
    scaleByMissingHp?: { stat: string; maxPercent: number };
  };
  /** 施放後給怪的 DoT（裂傷斬流血），比例乘 calculateBasePhysicalDamage */
  dot?: { category: string; percent: number; interval: number; duration: number };
  /** 命中後給怪的降防 debuff（詛咒／護甲崩壞／極冰封印），同 category 覆蓋並刷新 */
  debuff?: { category: string; modifiers: StatModifier[]; duration: number };
  /** 校準結果：直接傷害本身就勝過普攻，debuff 還掛著時照樣施放 */
  debuffRecast?: boolean;
  /** 校準結果：價值全在降防（直接傷害不如普攻），由 runScenario 試算放與不放 */
  debuffOnly?: boolean;
  /** 純 buff 類（元素增幅／強化冷卻縮減／致命一擊） */
  buff?: { category: string; modifiers: StatModifier[]; duration: number };
  /** true = 基礎魔法，false = 職業魔法（決定套用哪個威力倍率） */
  isBasicMagic?: boolean;
}

/** § 99.1 第 6 條：配裝是否滿足技能的武器需求 */
export function meetsWeaponRequirement(e: RotationEntry, loadout: Loadout): boolean {
  return !e.requiredWeaponType || loadout.weapon?.type === e.requiredWeaponType;
}

export function magicEntry(s: SkillDef, isBasicMagic = false): RotationEntry {
  return {
    id: s.id, name: s.name, kind: 'magic_skill', isBasicMagic,
    power: s.power, element: s.element, physicalSnapshot: s.physicalSnapshot, physicalDamage: s.physicalDamage,
    requiredWeaponType: s.requiredWeaponType,
    ignoreDefensePercent: s.ignoreDefensePercent ?? 0,
    cooldown: s.cooldown,
    mpCost: s.mpCost,
    mpDrainRatio: s.mpDrainRatio,
    randomHits: s.randomHits,
    dotOnly: s.dotOnly,
    selfHpCostPercent: s.selfHpCostPercent,
  };
}

/** 盤點結果中「輪替」的技能 → 輪替項目。DoT／降防／自身增益一律讀技能定義（§ 44.9） */
export function toRotationEntry(item: SkillPlanItem, weapon: EquipmentInstance): RotationEntry {
  const s = item.skill;
  if (s.type === 'buff') {
    return {
      id: s.id, name: s.name, kind: 'self_buff', cooldown: s.cooldown, mpCost: s.mpCost,
      buff: { category: s.buffCategory ?? s.id, duration: s.buffDuration!, modifiers: s.buffModifiers! },
    };
  }
  if (s.hits && s.hits > 1) {
    return {
      id: s.id, name: s.name, kind: 'physical_skill', hits: s.hits, cooldown: s.cooldown, mpCost: s.mpCost,
      requiredWeaponType: s.requiredWeaponType, ignoreDefensePercent: s.ignoreDefensePercent ?? 0,
    };
  }
  const e = magicEntry(s, item.isBasicMagic);
  const d = s.applyDebuff;
  if (d?.dotDamagePercent) {
    e.dot = {
      category: d.category,
      percent: resolveDotDamagePercent(d, weapon.isTwoHanded)!,
      interval: d.dotInterval ?? DOT_TICK_MS,
      duration: d.dotDuration ?? 5000,
    };
  } else if (d && lowersMonsterDefense(s) && !NO_SKILL_DEBUFF) {
    e.debuff = { category: d.category, modifiers: d.modifiers!, duration: d.duration! };
  }
  if (s.selfBuff?.modifiers?.length || s.selfBuff?.scaleByMissingHp) {
    e.selfBuff = {
      category: s.selfBuff.category, modifiers: s.selfBuff.modifiers ?? [], duration: s.selfBuff.duration,
      scaleByMissingHp: s.selfBuff.scaleByMissingHp,
    };
  }
  return e;
}

export function buildRotation(className: ClassName, weapon: EquipmentInstance): RotationEntry[] {
  return getSkillPlan(className).rotation.map(i => toRotationEntry(i, weapon));
}

// ---------------------------------------------------------------- 校準

export const CALIBRATION_SAMPLES = 20_000;

export interface ActionScore { name: string; avg: number; note: string }

/**
 * 先量測每個候選動作的「單次期望傷害」，把**打不贏普通攻擊**的技能剔除，再依期望值排序。
 * 因為一個攻擊 tick 只能做一件事（`playerCombatFSM.ts:96-99`），放一招比普攻弱的技能是淨損失。
 */
export function calibrate(
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
        } else if (!e.dotOnly) {
          for (let h = 0; h < (e.randomHits ?? 1); h++) {
            const r = calculateSkillAttack(char, ruledSkillPower(e, effInt, char.className), e.element!, monster, loadout.gear, e.name, effects, 0, e.ignoreDefensePercent ?? 0, undefined, e.physicalDamage === true);
            s += r.damage;
          }
        }
      }
      let avg = s / CALIBRATION_SAMPLES;
      let note = '';
      if (e.debuff) {
        // 降防的價值 = 掛載期間每次普攻的增傷 × 期間內的行動數；直接傷害本身勝過普攻時，掛著也照放
        const debuffed = [...effects, makeMonsterDebuff(e.name, e.debuff.category, e.debuff.modifiers)];
        let sd = 0;
        for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
          const r = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, debuffed, 0);
          sd += r.hit ? r.damage : 0;
        }
        const gainPerAction = sd / CALIBRATION_SAMPLES - normalAvg;
        const actions = Math.floor(e.debuff.duration / getPlayerAttackInterval(loadout.gear, effects));
        e.debuffRecast = avg > normalAvg;
        e.debuffOnly = !e.debuffRecast;
        note = `直接 ${avg.toFixed(1)}＋降防 ${gainPerAction.toFixed(1)}×${actions}`;
        avg += gainPerAction * actions;
      }
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
      if (a.kind === 'self_buff' && b.kind === 'self_buff') return 0;
      return (scoreOf.get(b.name) ?? 0) - (scoreOf.get(a.name) ?? 0);
    });

  // 每招技能佔一格戰鬥天賦（`51-auto-talent.md` § 51.3.4 同類型最多 TALENT_INSTALL_MAX 格）；回魔技保留一格
  const drain = order.filter(e => e.mpDrainRatio != null);
  const capped = [
    ...order.filter(e => e.mpDrainRatio == null).slice(0, TALENT_INSTALL_MAX - drain.length),
    ...drain,
  ];

  return { order: capped, scores: scores.sort((a, b) => b.avg - a.avg) };
}


export function percentile(sorted: number[], p: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

/**
 * 有效最大 MP。公式與 `gameStore.ts` 的 `getEffectiveMaxMp` 相同（最大 MP 詞綴為固定值），
 * 但該函式吃 `EquippedGear` record 且住在 store 裡（會拉進 Dexie/zustand），
 * 腳本改用同一組聚合函式重算。修改 gameStore 的公式時此處要同步。
 */
export function effectiveMaxMp(char: Character, gear: (EquipmentInstance | null)[]): number {
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = getAffixBonusesFromGear(items);
  const flatMp = items.reduce((sum, g) => sum + (g.bonusMp ?? 0), 0);
  return char.maxMp + flatMp + bonuses.max_mp;
}

/** 有效最大 HP。公式同 `gameStore.ts` 的 `getEffectiveMaxHp`（最大 HP 詞綴為固定值） */
export function effectiveMaxHp(char: Character, gear: (EquipmentInstance | null)[]): number {
  const items = gear.filter((g): g is EquipmentInstance => g != null);
  const bonuses = getAffixBonusesFromGear(items);
  const flatHp = items.reduce((sum, g) => sum + (g.bonusHp ?? 0), 0);
  return char.maxHp + flatHp + bonuses.max_hp;
}

// ---------------------------------------------------------------- BiS 搜尋

/**
 * § 7.6 武器詞綴池中對木樁有輸出價值的 9 種（命中下降只影響怪打人，不列入）。
 * T7 單件最多 4 條一般詞綴 ＋ 1 條封印詞綴，互不重複 → C(9,5) = 126 組
 */
export const WEAPON_AFFIX_POOL: AffixType[] = [
  'attack_power', 'element_brand', 'element_erosion', 'skill_elemental',
  'crit_rate', 'crit_damage', 'attack_speed', 'cooldown_reduction', 'defense_down',
];
/** 粗排用的取樣數（全模擬另有 RUNS） */
export let PROXY_SAMPLES = 600;

/** 粗排取樣數。實戰腳本只取第一名配裝，可用較少取樣換時間 */
export function setProxySamples(n: number): void {
  PROXY_SAMPLES = n;
}
/**
 * 粗排後進入下一階段的組合數。可用 `--top=<n>` 放大。
 */
export const TOP_N_ARG = Number(process.argv.find(a => a.startsWith('--top='))?.split('=')[1]);
export const TOP_HANDS = Number.isFinite(TOP_N_ARG) && TOP_N_ARG > 0 ? TOP_N_ARG : 20;
export const TOP_FINAL = TOP_HANDS;

export const SEED_AFFIXES: Record<ClassName, AffixType[]> = {
  knight: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed', 'defense_down'],
  elf: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed', 'defense_down'],
  thief: ['attack_power', 'crit_rate', 'crit_damage', 'attack_speed', 'defense_down'],
  elementalist: ['attack_power', 'skill_elemental', 'crit_rate', 'crit_damage', 'attack_speed'],
  priest: ['attack_power', 'skill_elemental', 'crit_rate', 'crit_damage', 'attack_speed'],
};

/** 所有子集合（含空集合） */
export function chooseAll<T>(arr: T[]): T[][] {
  return arr.reduce<T[][]>((acc, x) => acc.concat(acc.map(sub => [...sub, x])), [[]]);
}

export function chooseK<T>(arr: T[], k: number, from = 0): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  for (let i = from; i <= arr.length - k; i++) {
    for (const rest of chooseK(arr, k - 1, i + 1)) out.push([arr[i], ...rest]);
  }
  return out;
}

/** 武器的獨有詞綴候選：T7 武器逐一試 `WEAPON_UNIQUE_OPTIONS`，其餘不帶 */
export function uniqueOptions(weapon: Template): (UniqueAffixType | null)[] {
  return weapon.tier === 7 ? WEAPON_UNIQUE_OPTIONS : [null];
}

export const uniqueLabel = (u: UniqueAffixType | null) => (u ? `｜(獨)${u}` : '');

/**
 * 粗排指標：**輪替加權的每次行動期望傷害 ÷ 攻擊間隔**，少量取樣。
 * 技能依「攻擊間隔 ÷ 冷卻（含減CD）」取代普攻的比例；不計 MP 與自身 buff 的行動佔用，
 * 精確排序由前 K 名的全模擬決定。
 */
export function proxyDps(className: ClassName, rawLoadout: Loadout, seed: number): number {
  const char = buildCharacter(className);
  const effects = preCombatBuffs(className);
  const loadout = resolveLoadout(char, effects, rawLoadout);
  const effInt = designEffectiveInt(className, loadout.gear);
  const monster = makeReaper();
  const rotation = buildRotation(className, loadout.weapon);
  // § 7T.4 追加傷害的期望值：每下命中 × 觸發率 × 數值
  const bonusPerHit = sumUniqueAffix(loadout.gear, 'hit_bonus_damage') * UNIQUE_HIT_PROC_CHANCE / 100;

  const intervalMs = getPlayerAttackInterval(loadout.gear, effects);
  const cdr = Math.min(COOLDOWN_REDUCTION_CAP, getCombatBonuses(loadout.gear, effects).cooldown_reduction + intCooldownReduction(effInt));
  const normalRolls = getWeaponHitCount(loadout.weapon);

  /**
   * 輪替加權的每次行動期望傷害。普攻為底，每招技能依「冷卻內可施放的比例」取代普攻，
   * 依增益大小貪婪分配行動數；`rolls` 為每次行動平均的防禦下降判定次數。
   */
  function rotationAction(fx: ActiveEffect[]): { damage: number; rolls: number } {
    let normal = 0;
    const skills: { damage: number; cooldownMs: number }[] = [];
    withSeed(seed, () => {
      let sum = 0;
      for (let i = 0; i < PROXY_SAMPLES; i++) {
        const r = calculatePlayerAttack(char, loadout.weapon, monster, loadout.gear, fx, 0);
        if (r.hit) sum += r.damage + r.hits.filter(h => !h.isMiss).length * bonusPerHit;
      }
      normal = sum / PROXY_SAMPLES;
      for (const e of rotation) {
        if (e.kind === 'self_buff') continue;
        if (!meetsWeaponRequirement(e, loadout)) continue;
        let s = 0;
        for (let i = 0; i < PROXY_SAMPLES; i++) {
          if (e.kind === 'physical_skill') {
            const fire = hasActiveFireEnchant(fx);
            for (let h = 0; h < (e.hits ?? 1); h++) {
              const r = calculatePhysicalSkillHit(char, loadout.weapon, monster, loadout.gear, fire, e.name, fx, 0, e.ignoreDefensePercent ?? 0);
              s += r.hit ? r.damage + bonusPerHit : 0;
            }
          } else if (e.physicalSnapshot) {
            const r = calculatePhysicalSnapshotSkill(char, ruledSkillPower(e, effInt, className), e.element!, loadout.weapon, monster, loadout.gear, e.name, fx, 0, e.ignoreDefensePercent ?? 0);
            s += r.damage + bonusPerHit;
          } else {
            const r = calculateSkillAttack(char, ruledSkillPower(e, effInt, className), e.element!, monster, loadout.gear, e.name, fx, 0, e.ignoreDefensePercent ?? 0, undefined, e.physicalDamage === true);
            s += r.damage + bonusPerHit;
          }
        }
        skills.push({ damage: s / PROXY_SAMPLES, cooldownMs: e.cooldown * (1 - cdr / 100) });
      }
    });
    let damage = normal;
    let rolls = normalRolls;
    let remaining = 1;
    for (const k of skills.filter(k => k.damage > normal).sort((a, b) => b.damage - a.damage)) {
      if (remaining <= 0) break;
      const share = Math.min(remaining, k.cooldownMs > 0 ? intervalMs / k.cooldownMs : 1);
      damage += share * (k.damage - normal);
      rolls += share * (1 - normalRolls);
      remaining -= share;
    }
    return { damage, rolls };
  }

  const plain = rotationAction(effects);
  let best = plain.damage;
  // § 7.9 防禦下降：穩態掛著的比例 = 1 − (1 − 觸發率)^(3 秒內的判定次數)，兩種狀態依比例加權
  const defenseDown = getWeaponDebuffAffixes(loadout.weapon.affixes, loadout.weapon.quality ?? 0)
    .find(d => d.type === 'defense_down');
  if (defenseDown) {
    const debuffed = rotationAction([
      ...effects,
      makeMonsterDebuff('防禦下降', DEFENSE_DOWN_CATEGORY, [{ stat: 'defense', value: -defenseDown.value, isPercent: true }]),
    ]);
    const rollsInWindow = plain.rolls * AFFIX_DEBUFF_DURATION_MS / intervalMs;
    const uptime = 1 - Math.pow(1 - AFFIX_DEBUFF_CHANCE / 100, rollsInWindow);
    best = (1 - uptime) * plain.damage + uptime * debuffed.damage;
  }
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
export function searchBis(className: ClassName): { loadouts: Loadout[]; searched: number } {
  const support = buildSupportGear(className);
  const hands = handCombos(className);
  const seedSet = SEED_AFFIXES[className];
  // **所有候選共用同一顆種子**：粗排是要比武器素質，不是比運氣。
  // 每個候選各給一顆種子時，暴擊擲骰的雜訊（±數點）會蓋過候選之間的真實差距
  // （例：T5 星霜杖 10/10 曾因此排在 T7 星辰權杖 18/18 之前）。
  const PROXY_SEED = 777;

  /*
   * 獨有詞綴分段搜尋，粗排量維持在「手部 × 詞綴組」的量級：
   * 1. 手部排名時每把 T7 武器試遍獨有詞綴，記下最佳者
   * 2. 詞綴組合一律帶該武器的最佳獨有詞綴排名
   * 3. 前 TOP_FINAL 名再把獨有詞綴逐一換過重排 —— 爆擊率與攻速、爆擊上限的交互會改變最佳解
   */
  let searched = 0;
  const rankedHands = hands
    .map(h => {
      let bestUnique: UniqueAffixType | null = null;
      let score = -Infinity;
      for (const u of uniqueOptions(h.weapon)) {
        searched++;
        const v = proxyDps(className, buildLoadout(h.label, h.weapon, h.offhand, seedSet, support, u), PROXY_SEED);
        if (v > score) { score = v; bestUnique = u; }
      }
      return { h, score, bestUnique };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_HANDS);

  const affixSets = chooseK(WEAPON_AFFIX_POOL, WEAPON_GENERAL_AFFIXES + 1);
  const make = (h: (typeof hands)[number], set: AffixType[], u: UniqueAffixType | null) => {
    searched++;
    const lo = buildLoadout(`${h.label}｜${set.join('+')}${uniqueLabel(u)}`, h.weapon, h.offhand, set, support, u);
    return { h, set, lo, score: proxyDps(className, lo, PROXY_SEED) };
  };
  const stage2 = rankedHands
    .flatMap(({ h, bestUnique }) => affixSets.map(set => make(h, set, bestUnique)))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_FINAL);
  const ranked = [
    ...stage2,
    ...stage2.flatMap(c => uniqueOptions(c.h.weapon)
      .filter(u => u !== c.lo.unique)
      .map(u => make(c.h, c.set, u))),
  ].sort((a, b) => b.score - a.score);

  return { loadouts: ranked.slice(0, TOP_FINAL).map(r => r.lo), searched };
}

/**
 * `--class=knight[,thief]` 只跑指定職業。改動只影響單一職業的技能時
 * （例：裂傷斬是騎士專屬），沒有必要把另外四個職業重算一遍。
 */
export const CLASS_ARG = process.argv.find(a => a.startsWith('--class='))?.split('=')[1];
export const ALL_CLASSES: ClassName[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];
export const TARGET_CLASSES = CLASS_ARG
  ? ALL_CLASSES.filter(c => CLASS_ARG.split(',').includes(c))
  : ALL_CLASSES;
if (TARGET_CLASSES.length === 0) {
  throw new Error(`--class 無效：${CLASS_ARG}（可用 ${ALL_CLASSES.join('／')}）`);
}
