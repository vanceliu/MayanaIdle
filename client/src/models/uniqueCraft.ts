/**
 * 獨特製作（`06-equipment-acquire.md` § 6A.3.1、§ 6A.6「製作品 (獨)」）：材料池、配方分配規則、詞綴 Tier 保底。
 * 獨特材料依來源獨特魔物等級分階；Boss 專屬素材依表列。
 */
import { MONSTER_SEEDS } from '../db/seed/monsterSeeds';
import { UNIQUE_MONSTER_DROPS } from '../db/seed/dropSeeds';
import type { CraftMaterial } from './equipment';

export type UniqueCraftTier = 4 | 5 | 6;

export const UNIQUE_CRAFT_TIERS: readonly UniqueCraftTier[] = [4, 5, 6];

export function isUniqueCraftTier(tier: number | undefined): tier is UniqueCraftTier {
  return tier === 4 || tier === 5 || tier === 6;
}

/** 各階取用的獨特材料：來源獨特魔物等級區間 */
const UNIQUE_MATERIAL_LEVEL_RANGE: Record<UniqueCraftTier, { min: number; max: number }> = {
  4: { min: 33, max: 45 },
  5: { min: 46, max: 55 },
  6: { min: 60, max: 60 },
};

/** 各階取用的 Boss 專屬素材 id */
const BOSS_MATERIAL_IDS: Record<UniqueCraftTier, readonly number[]> = {
  4: [78, 79, 80],
  5: [81, 82, 83, 85, 86, 87, 88, 89],
  6: [84, 88, 89, 90, 91, 92, 93, 94],
};

const UNIQUE_LEVEL = new Map(MONSTER_SEEDS.filter(m => m.isUnique).map(m => [m.name, m.level]));

function uniqueMaterialIds(tier: UniqueCraftTier): number[] {
  const { min, max } = UNIQUE_MATERIAL_LEVEL_RANGE[tier];
  return UNIQUE_MONSTER_DROPS
    .filter(d => {
      const level = UNIQUE_LEVEL.get(d.monster);
      return level !== undefined && level >= min && level <= max;
    })
    .map(d => d.materialItemId);
}

/** 各階獨特配方的材料池（獨特材料在前、Boss 專屬素材在後） */
export const UNIQUE_CRAFT_MATERIAL_POOLS: Record<UniqueCraftTier, readonly number[]> = {
  4: [...uniqueMaterialIds(4), ...BOSS_MATERIAL_IDS[4]],
  5: [...uniqueMaterialIds(5), ...BOSS_MATERIAL_IDS[5]],
  6: [...uniqueMaterialIds(6), ...BOSS_MATERIAL_IDS[6]],
};

/** 每份配方的材料數量，依配方內順序（§ 6A.3.1「獨特配方分配規則」） */
export const UNIQUE_CRAFT_AMOUNTS: Record<UniqueCraftTier, readonly number[]> = {
  4: [4, 3, 2],
  5: [6, 5, 4, 3],
  6: [8, 6, 5, 4],
};

/** 固定放在第一種的材料：T6 為 Lv.60 獨特魔物的獨特材料（妖精王獠牙） */
export const UNIQUE_CRAFT_FIXED_FIRST: Record<UniqueCraftTier, number | undefined> = {
  4: undefined,
  5: undefined,
  6: uniqueMaterialIds(6)[0],
};

/** 指派時可輪替的材料（材料池扣掉固定第一種） */
export function getUniqueCraftRotationPool(tier: UniqueCraftTier): number[] {
  const fixed = UNIQUE_CRAFT_FIXED_FIRST[tier];
  return UNIQUE_CRAFT_MATERIAL_POOLS[tier].filter(id => id !== fixed);
}

/** 製作品 (獨) 的詞綴 Tier（§ 6A.6）：`highCount` 條 T6（均等抽），其餘 T5 */
export const UNIQUE_CRAFT_AFFIX_TIERS: Record<UniqueCraftTier, { highTier: number; highCount: number; baseTier: number }> = {
  4: { highTier: 6, highCount: 0, baseTier: 5 },
  5: { highTier: 6, highCount: 1, baseTier: 5 },
  6: { highTier: 6, highCount: 3, baseTier: 5 },
};

/** 產物規則的顯示文字，如「1 條 T6、3 條 T5」 */
export function formatUniqueCraftAffixTiers(tier: UniqueCraftTier): string {
  const { highTier, highCount, baseTier } = UNIQUE_CRAFT_AFFIX_TIERS[tier];
  if (highCount === 0) return `4 條全 T${baseTier}`;
  return `${highCount} 條 T${highTier}、${4 - highCount} 條 T${baseTier}`;
}

export interface UniqueCraftRecipeInput {
  id?: number;
  tier?: number;
  craftMaterials?: CraftMaterial[];
}

function* combinations(pool: readonly number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let j = start; j < pool.length; j++) yield* combinations(pool, k, j + 1, [...acc, pool[j]]);
}

/**
 * 獨特配方分配（§ 6A.3.1）：有 `craftMaterials` 的 T4～T6 模板依 id 排序逐份指派。
 *
 * - 候選＝輪替池取 N 種（T6 另加固定第一種）的所有組合，排除同階已用過的組合
 * - 排序：組合內最大使用次數 → 使用次數總和 → 依配方序號輪轉
 * - 配方內順序：累計需求量少的材料放在數量多的位置
 */
export function assignUniqueCraftMaterials(templates: readonly UniqueCraftRecipeInput[]): Map<number, CraftMaterial[]> {
  const result = new Map<number, CraftMaterial[]>();
  for (const tier of UNIQUE_CRAFT_TIERS) {
    const amounts = UNIQUE_CRAFT_AMOUNTS[tier];
    const fixed = UNIQUE_CRAFT_FIXED_FIRST[tier];
    const pool = getUniqueCraftRotationPool(tier);
    const need = amounts.length - (fixed === undefined ? 0 : 1);
    const usage = new Map<number, number>();
    const demand = new Map<number, number>();
    const used = (m: number) => usage.get(m) ?? 0;
    const signatures = new Set<string>();
    const combos = [...combinations(pool, need)];

    const recipes = templates
      .filter(t => t.tier === tier && t.craftMaterials?.length)
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    recipes.forEach((recipe, i) => {
      const n = combos.length;
      let best: { ids: number[]; max: number; sum: number; turn: number } | undefined;
      combos.forEach((ids, k) => {
        if (signatures.has(ids.join(','))) return;
        const counts = ids.map(used);
        const cand = { ids, max: Math.max(...counts), sum: counts.reduce((s, c) => s + c, 0), turn: (k - (i * 7) % n + n) % n };
        if (!best || (cand.max - best.max || cand.sum - best.sum || cand.turn - best.turn) < 0) best = cand;
      });
      if (!best) throw new Error(`T${tier} 第 ${i} 份湊不出不重複的獨特配方`);
      signatures.add(best.ids.join(','));
      const ordered = [...best.ids].sort((a, b) => (demand.get(a) ?? 0) - (demand.get(b) ?? 0) || pool.indexOf(a) - pool.indexOf(b));
      const ids = fixed === undefined ? ordered : [fixed, ...ordered];
      const mats = ids.map((itemId, k) => ({ itemId, amount: amounts[k] }));
      for (const m of mats) {
        usage.set(m.itemId, used(m.itemId) + 1);
        demand.set(m.itemId, (demand.get(m.itemId) ?? 0) + m.amount);
      }
      result.set(recipe.id!, mats);
    });
  }
  return result;
}
