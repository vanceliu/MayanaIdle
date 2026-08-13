/**
 * 鑲材與天賦格的掉落（`27-drop-table.md` § 27.9、`51-auto-talent.md` § 51.6）。
 *
 * **與 `drops.ts` 分開**：鑲材帶 roll 出來的參數、天賦格根本不是道具，
 * 兩者都不進 `characterBag`，塞不進 `DroppedItem` 的形狀。
 */
import {
  SKILL_POOL_KEYS,
  ITEM_POOL_KEYS,
  AFFIX_DROP_RATE,
  BOSS_DROP_MULTIPLIER,
  SLOT_DROP_RATE_BOSS,
  TALENT_TYPES,
  affixTierBandFor,
  slotTierBandFor,
  type TalentAffixDef,
  type TalentSlotTier,
  type TalentTier,
  type TalentType,
} from '../models/talent';
import { TALENT_AFFIX_DEFS } from '../db/seed/talentSeeds';
import { DROP_ROLL_MAX } from './drops';

export type Rng = () => number;
const defaultRng: Rng = () => Math.random();

/**
 * 某個類型在某個 tier 的候選鑲材（§ 51.6.1.1）。
 *
 * 候選集合＝該類型的專屬鑲材 ＋ 適用該類型的共用鑲材，
 * **條件與實作混在同一個集合**，不分開抽。
 * `blocked` 的排除在外 —— 怪物側機制沒開，那些鑲材不該存在於世界上（§ 51.4.4）。
 */
export function affixCandidates(type: TalentType, tier: TalentTier): TalentAffixDef[] {
  return TALENT_AFFIX_DEFS.filter(
    d => !d.blocked && d.tier === tier && d.appliesTo.includes(type),
  );
}

/**
 * 掉落值 → 是否命中。沿用 `27-drop-table.md` § 27.1 的公式，
 * **掉落值可為小數**（天賦格的 0.01% 對應 0.1）。
 */
function hits(percent: number, multiplier: number, rng: Rng): boolean {
  const dropValue = percent * 10; // % → 掉落值（基數 1000）
  const boosted = Math.min(dropValue * multiplier, DROP_ROLL_MAX);
  return rng() * DROP_ROLL_MAX < boosted;
}

export interface TalentAffixDrop {
  def: TalentAffixDef;
  /** 指定型／池型在掉落當下 roll 出來的綁定值；自選型為 null */
  boundParam: string | null;
}

/**
 * 抽一個鑲材。回傳 null ＝ 這次沒掉。
 *
 * 順序（§ 51.6.1.1）：**各 tier 獨立判定** → 命中後均等抽類型 →
 * 該類型該 tier 沒東西就改抽其他類型 → 候選中均等抽一個。
 */
/**
 * 抽鑲材掉落。**各 tier 獨立判定**（§ 51.6.1）——
 * 低階命中不會吃掉高階的判定機會，一次擊殺可能掉多份。
 */
export function rollTalentAffixDrops(
  areaLevel: number,
  isBoss: boolean,
  dropRateMultiplier = 1,
  rng: Rng = defaultRng,
): TalentAffixDrop[] {
  const band = affixTierBandFor(areaLevel);
  const bossMult = isBoss ? BOSS_DROP_MULTIPLIER : 1;
  const drops: TalentAffixDrop[] = [];

  for (let tier = band.min; tier <= band.max; tier++) {
    const t = tier as TalentTier;
    const rate = AFFIX_DROP_RATE[t];
    if (rate <= 0) continue; // T7 不掉落
    if (!hits(rate * bossMult, dropRateMultiplier, rng)) continue;

    // 只在「該 tier 真的有東西」的類型裡抽，落空就換一個
    const viable = TALENT_TYPES.filter(type => affixCandidates(type, t).length > 0);
    if (viable.length === 0) continue;
    const type = viable[Math.floor(rng() * viable.length)];

    const candidates = affixCandidates(type, t);
    const def = candidates[Math.floor(rng() * candidates.length)];
    drops.push({ def, boundParam: rollBoundParam(def, rng) });
  }
  return drops;
}

/** 單份版本。回傳最高階的那一份 */
export function rollTalentAffixDrop(
  areaLevel: number,
  isBoss: boolean,
  dropRateMultiplier = 1,
  rng: Rng = defaultRng,
): TalentAffixDrop | null {
  const drops = rollTalentAffixDrops(areaLevel, isBoss, dropRateMultiplier, rng);
  return drops.length > 0 ? drops[drops.length - 1] : null;
}

/**
 * 掉落當下 roll 出綁定值（§ 51.4.1）。
 *
 * 池型 roll 出一個有語意的子集（技能系別／道具類別），玩家在子集內自選。
 * 指定型的對象是單一技能，可選範圍要角色上下文（學了哪些招），
 * 所以掉落層回 null，由首次鑲入時玩家選定並鎖死。
 */
export function rollBoundParam(def: TalentAffixDef, rng: Rng = defaultRng): string | null {
  if (def.form !== 'pool') return null;
  const keys = POOL_KEYS_OF[def.ruleId];
  if (!keys || keys.length === 0) return null;
  return keys[Math.floor(rng() * keys.length)];
}

/** 池型鑲材的子集來源（§ 51.4.9、§ 51.4.11） */
const POOL_KEYS_OF: Record<string, readonly string[]> = {
  // T2「施放特定系別攻擊技能」與 T1 技能一樣是 `skill`，靠 `form` 區分
  skill: SKILL_POOL_KEYS,
  buy_item: ITEM_POOL_KEYS,
  withdraw_item: ITEM_POOL_KEYS,
};

/**
 * 抽天賦格。**只有 Boss 會掉，一般怪不掉**（§ 51.6.2）。
 * 回傳 null ＝ 這次沒掉。T1 格不掉落，只從等級來。
 */
export function rollTalentSlotDrop(
  areaLevel: number,
  isBoss: boolean,
  dropRateMultiplier = 1,
  rng: Rng = defaultRng,
): TalentSlotTier | null {
  if (!isBoss) return null;
  if (!hits(SLOT_DROP_RATE_BOSS, dropRateMultiplier, rng)) return null;

  const band = slotTierBandFor(areaLevel);
  const span = band.max - band.min + 1;
  return (band.min + Math.floor(rng() * span)) as TalentSlotTier;
}
