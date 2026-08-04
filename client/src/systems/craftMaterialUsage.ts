import { EQUIPMENT_SEEDS } from '../db/seed/equipmentSeeds';

/**
 * 素材的「製作用途」——與 `iconTier`（稀有度／區域階層）互相獨立的維度。
 *
 * 顏色只有一個通道，選了稀有度就表達不了用途；因此用途另開一個維度，
 * 兩者都由 seed 反推，不互相犧牲（`30-items.md` § 素材 iconTier 對照）。
 *
 * **唯一來源是 `EQUIPMENT_SEEDS.craftMaterials`**，不可另建素材→配方對照表：
 * 配方由 `client/scripts/assignCraftMaterials.mts` 產生，手維護的表必然漂移
 * （`99-ai-constraints.md` 第 86 條）。
 */
export interface CraftedEquipment {
  name: string;
  tier: number;
  /** 防具（`type === 'armor'`）與武器在 Wiki 是不同路由，見 `43-wiki-system.md` § 3 */
  isArmor: boolean;
}

export interface CraftUsage {
  /** 用到此素材的裝備 tier，升冪不重複 */
  tiers: number[];
  /** 用到此素材的裝備，依 tier 再依名稱排序 */
  equipment: CraftedEquipment[];
}

const USAGE_MAP: Map<string, CraftUsage> = (() => {
  const acc = new Map<string, CraftedEquipment[]>();

  for (const equip of EQUIPMENT_SEEDS) {
    if (!equip.craftMaterials?.length) continue;
    const entry: CraftedEquipment = {
      name: equip.name,
      tier: equip.tier ?? 0,
      isArmor: equip.type === 'armor',
    };
    for (const mat of equip.craftMaterials) {
      const list = acc.get(mat.name);
      if (list) list.push(entry);
      else acc.set(mat.name, [entry]);
    }
  }

  return new Map(
    [...acc].map(([name, equipment]) => {
      const sorted = [...equipment].sort(
        (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
      );
      return [name, { tiers: [...new Set(sorted.map(e => e.tier))], equipment: sorted }];
    }),
  );
})();

/**
 * 不進裝備配方、但仍有用途的素材（`13-town.md` § 13.6 鐵匠鋪）。
 *
 * 這兩個沒有出現在任何 `craftMaterials` 裡，若只看配方會被判定成「純販售」，
 * 批量販售的「Tier 4 以下」就會把它們一起賣掉 —— 必須明確列為例外。
 * 魔法書材料同樣不進配方，但它們是 `noSell: true`，批量販售本來就擋掉了。
 */
const SPECIAL_USE_MATERIALS: Record<string, string> = {
  品質石: '鐵匠鋪品質提升',
  強化石: '鐵匠鋪詞綴強化',
};

export function getCraftUsage(materialName: string): CraftUsage | undefined {
  return USAGE_MAP.get(materialName);
}

/** 進得了裝備配方（不含鐵匠鋪強化用素材，那些請用 `hasMaterialUsage`） */
export function hasCraftUsage(materialName: string): boolean {
  return USAGE_MAP.has(materialName);
}

/**
 * 有任何用途（裝備配方或鐵匠鋪強化）——「不該被批量賣掉」的判定一律用這個，
 * 而不是 `hasCraftUsage`。
 */
export function hasMaterialUsage(materialName: string): boolean {
  return USAGE_MAP.has(materialName) || materialName in SPECIAL_USE_MATERIALS;
}

/**
 * 「T4／T5 配方」／「鐵匠鋪詞綴強化」／空字串（純販售）。
 * UI 一律用這個，避免各處自己拼字串。
 */
export function formatMaterialUsage(materialName: string): string {
  const usage = USAGE_MAP.get(materialName);
  if (usage) return `${usage.tiers.map(t => `T${t}`).join('／')} 配方`;
  return SPECIAL_USE_MATERIALS[materialName] ?? '';
}

/** 目前所有進得了裝備配方的素材名稱（測試用） */
export function getCraftMaterialNames(): string[] {
  return [...USAGE_MAP.keys()];
}

/** 所有有用途的素材名稱（配方 + 鐵匠鋪強化） */
export function getUsefulMaterialNames(): string[] {
  return [...new Set([...USAGE_MAP.keys(), ...Object.keys(SPECIAL_USE_MATERIALS)])];
}
