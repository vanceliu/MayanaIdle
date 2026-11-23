import { EQUIPMENT_SEEDS } from '../db/seed/equipmentSeeds';
import { isArmorEquipment } from '../models/equipment';
import { getItemId } from '../models/items';
import { SPELLBOOK_FRAGMENT_ID, SPELLBOOK_RECIPES } from '../models/magicAcademy';
import { QUEST_MATERIAL_NAME } from '../models/quest';
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
 * 裝備配方以外的用途（`30-items.md` § 製作用途標記）：印記師加工、獨特製作、
 * 魔法學院合成、職業任務。**各自由來源資料反查，不手寫 id**。
 * 一個道具可同時有多種用途（魔法書碎片兼進 T4 配方）。
 */
const SPECIAL_USES: Map<number, string[]> = (() => {
  const uses = new Map<number, string[]>();
  const add = (itemId: number, label: string) => {
    const list = uses.get(itemId);
    if (!list) uses.set(itemId, [label]);
    else if (!list.includes(label)) list.push(label);
  };

  for (const d of SIGIL_DEFINITIONS) add(d.itemId, SIGIL_USAGE_LABEL[d.type]);

  // 獨特製作：由 `EQUIPMENT_SEEDS.uniqueCraftMaterials` 反查（`06-equipment-acquire.md` § 6A.3.1）
  const uniqueCraftTiers = new Map<number, Set<number>>();
  for (const equip of EQUIPMENT_SEEDS) {
    for (const mat of equip.uniqueCraftMaterials ?? []) {
      const tiers = uniqueCraftTiers.get(mat.itemId) ?? new Set<number>();
      tiers.add(equip.tier ?? 0);
      uniqueCraftTiers.set(mat.itemId, tiers);
    }
  }
  for (const [itemId, tiers] of uniqueCraftTiers) {
    add(itemId, `${[...tiers].sort((a, b) => a - b).map(t => `T${t}`).join('／')} 獨特配方`);
  }

  for (const id of [SPELLBOOK_FRAGMENT_ID, ...SPELLBOOK_RECIPES.map(r => r.materialItemId)]) add(id, '魔法學院合成魔法書');

  const questMaterialId = getItemId(QUEST_MATERIAL_NAME);
  if (questMaterialId == null) throw new Error(`任務素材不存在：${QUEST_MATERIAL_NAME}`);
  add(questMaterialId, '冒險者工會職業任務');

  return uses;
})();

export function getCraftUsage(itemId: number): CraftUsage | undefined {
  return USAGE_MAP.get(itemId);
}

/** 進得了裝備配方（不含其他用途，那些請用 `hasMaterialUsage`） */
export function hasCraftUsage(itemId: number): boolean {
  return USAGE_MAP.has(itemId);
}

/**
 * 有任何用途（裝備配方或 `SPECIAL_USES`）——「不該被批量賣掉」的判定一律用這個，
 * 而不是 `hasCraftUsage`。
 */
export function hasMaterialUsage(itemId: number): boolean {
  return USAGE_MAP.has(itemId) || SPECIAL_USES.has(itemId);
}

/**
 * 「T4／T5 配方」／「T5／T6 獨特配方」／多種用途以「、」串接／空字串（純販售）。
 * UI 一律用這個，避免各處自己拼字串。
 */
export function formatMaterialUsage(itemId: number): string {
  const usage = USAGE_MAP.get(itemId);
  const labels = [
    ...(usage ? [`${usage.tiers.map(t => `T${t}`).join('／')} 配方`] : []),
    ...(SPECIAL_USES.get(itemId) ?? []),
  ];
  return labels.join('、');
}

/** 目前所有進得了裝備配方的素材 id（測試用） */
export function getCraftMaterialIds(): number[] {
  return [...USAGE_MAP.keys()];
}

/** 所有有用途的道具 id（配方 + `SPECIAL_USES`） */
export function getUsefulMaterialIds(): number[] {
  return [...new Set([...USAGE_MAP.keys(), ...SPECIAL_USES.keys()])];
}
