/**
 * 鑲材與天賦格的掉落（`27-drop-table.md` § 27.9、`51-auto-talent.md` § 51.6）。
 *
 * **與 `drops.ts` 分開**：鑲材帶 roll 出來的參數、天賦格根本不是道具，
 * 兩者都不進 `characterBag`，塞不進 `DroppedItem` 的形狀。
 */
import {
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
export function rollTalentAffixDrop(
  areaLevel: number,
  isBoss: boolean,
  dropRateMultiplier = 1,
  rng: Rng = defaultRng,
): TalentAffixDrop | null {
  const band = affixTierBandFor(areaLevel);
  const bossMult = isBoss ? BOSS_DROP_MULTIPLIER : 1;

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
    return { def, boundParam: rollBoundParam(def, rng) };
  }
  return null;
}

/**
 * 指定型／池型在掉落當下綁定參數（§ 51.4.1）。
 *
 * **這裡只決定「綁不綁」與形狀**；實際可選的技能清單要角色上下文（學了哪些招），
 * 由呼叫端在寫入實例前補上。自選型恆為 null。
 */
export function rollBoundParam(def: TalentAffixDef, _rng: Rng = defaultRng): string | null {
  if (def.form === 'free') return null;
  // 綁定值由呼叫端依角色可用範圍決定；掉落層只標記「這份需要綁定」
  return null;
}

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
