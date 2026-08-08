import { EQUIPMENT_SEEDS } from '../db/seed/equipmentSeeds';
import { isArmorEquipment } from '../models/equipment';
import { SIGIL_DEFINITIONS, SIGIL_USAGE_LABEL } from '../models/sigil';

/**
 * 素材的「製作用途」——與 `iconTier`（稀有度／區域階層）互相獨立的維度。
 *
 * 顏色只有一個通道，選了稀有度就表達不了用途；因此用途另開一個維度，
 * 兩者都由 seed 反推，不互相犧牲（`30-items.md` § 素材 iconTier 對照）。
 *
 * **唯一來源是 `EQUIPMENT_SEEDS.craftMaterials`**，不可另建素材→配方對照表：
 * 配方由 `client/scripts/assignCraftMaterials.mts` 產生，手維護的表必然漂移
 * （`06-equipment-acquire.md` § 6A.3）。
 */
export interface CraftedEquipment {
  name: string;
  tier: number;
  /** 防具（含盾牌／魔導書／臂甲）與武器在 Wiki 是不同路由，見 `43-wiki-system.md` § 3 */
  isArmor: boolean;
}

export interface CraftUsage {
  /** 用到此素材的裝備 tier，升冪不重複 */
  tiers: number[];
  /** 用到此素材的裝備，依 tier 再依名稱排序 */
  equipment: CraftedEquipment[];
}

/** 材料 id → 用到它的配方。key 是 id 不是名稱（§ 99.1） */
const USAGE_MAP: Map<number, CraftUsage> = (() => {
  const acc = new Map<number, CraftedEquipment[]>();

  for (const equip of EQUIPMENT_SEEDS) {
    if (!equip.craftMaterials?.length) continue;
    const entry: CraftedEquipment = {
      name: equip.name,
      tier: equip.tier ?? 0,
      isArmor: isArmorEquipment(equip.slot, equip.type),
    };
    for (const mat of equip.craftMaterials) {
      const list = acc.get(mat.itemId);
      if (list) list.push(entry);
      else acc.set(mat.itemId, [entry]);
    }
  }

  return new Map(
    [...acc].map(([itemId, equipment]) => {
      const sorted = [...equipment].sort(
        (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
      );
      return [itemId, { tiers: [...new Set(sorted.map(e => e.tier))], equipment: sorted }];
    }),
  );
})();

/**
 * 不進裝備配方、但仍有用途的道具 —— 目前就是六種印記（`46-sigil.md` § 46.2）。
 *
 * 只看配方會把它們標成純販售，所以背包的 ⚒ 記號與 Wiki 的「用途」欄都要靠這張表。
 * **由 `SIGIL_DEFINITIONS` 反查，不手寫 id** —— 之前手寫時只列了工藝與精鍊，
 * 另外四種印記在背包裡就少了用途標記。
 */
const SPECIAL_USE_MATERIALS: Record<number, string> = Object.fromEntries(
  SIGIL_DEFINITIONS.map(d => [d.itemId, SIGIL_USAGE_LABEL[d.type]]),
);

export function getCraftUsage(itemId: number): CraftUsage | undefined {
  return USAGE_MAP.get(itemId);
}

/** 進得了裝備配方（不含印記，那些請用 `hasMaterialUsage`） */
export function hasCraftUsage(itemId: number): boolean {
  return USAGE_MAP.has(itemId);
}

/**
 * 有任何用途（裝備配方或印記師的加工）——「不該被批量賣掉」的判定一律用這個，
 * 而不是 `hasCraftUsage`。
 */
export function hasMaterialUsage(itemId: number): boolean {
  return USAGE_MAP.has(itemId) || itemId in SPECIAL_USE_MATERIALS;
}

/**
 * 「T4／T5 配方」／「印記師詞綴升階」／空字串（純販售）。
 * UI 一律用這個，避免各處自己拼字串。
 */
export function formatMaterialUsage(itemId: number): string {
  const usage = USAGE_MAP.get(itemId);
  if (usage) return `${usage.tiers.map(t => `T${t}`).join('／')} 配方`;
  return SPECIAL_USE_MATERIALS[itemId] ?? '';
}

/** 目前所有進得了裝備配方的素材 id（測試用） */
export function getCraftMaterialIds(): number[] {
  return [...USAGE_MAP.keys()];
}

/** 所有有用途的素材 id（配方 + 印記師加工） */
export function getUsefulMaterialIds(): number[] {
  return [...new Set([...USAGE_MAP.keys(), ...Object.keys(SPECIAL_USE_MATERIALS).map(Number)])];
}
