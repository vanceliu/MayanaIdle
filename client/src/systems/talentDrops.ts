/**
 * 天賦格的掉落（`27-drop-table.md` § 27.9、`51-auto-talent.md` § 51.6）。
 *
 * **與 `drops.ts` 分開**：天賦格不是道具，不進 `characterBag`，
 * 塞不進 `DroppedItem` 的形狀。
 *
 * **條件與動作不掉落** —— 一律內建（§ 51.4.1）。一般怪不掉任何自動天賦相關物，
 * 這塊回饋不補（§ 51.6.2）。
 */
import {
  SLOT_DROP_RATE_BOSS,
  SLOT_DROP_RATE_UNIQUE,
  slotTierBandFor,
  type TalentSlotTier,
} from '../models/talent';
import type { MonsterRank } from '../models/monster';
import { DROP_ROLL_MAX } from './drops';
import { random } from '../core/rng';

export type Rng = () => number;
const defaultRng: Rng = () => random();

/**
 * 掉落值 → 是否命中。沿用 `27-drop-table.md` § 27.1 的公式（基數 1000）。
 */
function hits(percent: number, multiplier: number, rng: Rng): boolean {
  const dropValue = percent * 10; // % → 掉落值（基數 1000）
  const boosted = Math.min(dropValue * multiplier, DROP_ROLL_MAX);
  return rng() * DROP_ROLL_MAX < boosted;
}

const SLOT_DROP_RATE: Record<MonsterRank, number> = {
  normal: 0,
  unique: SLOT_DROP_RATE_UNIQUE,
  boss: SLOT_DROP_RATE_BOSS,
};

/**
 * 抽天賦格。**只有 Boss 與獨特魔物會掉，一般怪不掉**（`27-drop-table.md` § 27.9）。
 * 回傳 null ＝ 這次沒掉。T1 格不掉落，只從等級來。
 */
export function rollTalentSlotDrop(
  areaLevel: number,
  rank: MonsterRank,
  dropRateMultiplier = 1,
  rng: Rng = defaultRng,
): TalentSlotTier | null {
  const rate = SLOT_DROP_RATE[rank];
  if (rate <= 0) return null;
  if (!hits(rate, dropRateMultiplier, rng)) return null;

  const band = slotTierBandFor(areaLevel);
  const span = band.max - band.min + 1;
  return (band.min + Math.floor(rng() * span)) as TalentSlotTier;
}
