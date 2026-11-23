import { describe, it, expect } from 'vitest';
import {
  getCraftUsage,
  hasCraftUsage,
  hasMaterialUsage,
  formatMaterialUsage,
  getCraftMaterialIds,
  getUsefulMaterialIds,
} from '../craftMaterialUsage';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed/itemSeeds';
import { isArmorEquipment, isOffhandDefenseType } from '../../models/equipment';
import { SIGIL_DEFINITIONS, SIGIL_USAGE_LABEL } from '../../models/sigil';
import { getItemId } from '../../models/items';
import { UNIQUE_CRAFT_MATERIAL_POOLS } from '../../models/uniqueCraft';
import { UNIQUE_MONSTER_DROPS } from '../../db/seed/dropSeeds';
import { SPELLBOOK_FRAGMENT_ID, SPELLBOOK_RECIPES } from '../../models/magicAcademy';
import { QUEST_MATERIAL_NAME } from '../../models/quest';

/** 測試以名稱閱讀，實際傳的是 id */
const id = (name: string) => getItemId(name)!;

/**
 * 製作用途是與 `iconTier`（稀有度）互相獨立的維度，唯一來源是
 * `EQUIPMENT_SEEDS.craftMaterials`（`30-items.md` § 素材 iconTier 對照）。
 */

describe('craftMaterialUsage 反查', () => {
  it('涵蓋所有配方裡出現過的素材，數量與 seed 一致', () => {
    const fromSeeds = new Set(
      EQUIPMENT_SEEDS.flatMap(e => e.craftMaterials?.map(m => m.itemId) ?? []),
    );
    expect(new Set(getCraftMaterialIds())).toEqual(fromSeeds);
  });

  it('純販售素材回傳 undefined 與空字串', () => {
    expect(hasMaterialUsage(id('破碎獸牙'))).toBe(false);
    expect(getCraftUsage(id('破碎獸牙'))).toBeUndefined();
    expect(formatMaterialUsage(id('破碎獸牙'))).toBe('');
  });

  it('單一階配方素材顯示單一 tier', () => {
    expect(hasCraftUsage(id('石像碎片'))).toBe(true);
    expect(getCraftUsage(id('石像碎片'))!.tiers).toEqual([4]);
    expect(formatMaterialUsage(id('石像碎片'))).toBe('T4 配方');
  });

  it('跨階配方素材列出所有 tier，升冪不重複', () => {
    const usage = getCraftUsage(id('龍骨碎片'))!;
    expect(usage.tiers).toEqual([4, 5]);
    expect(formatMaterialUsage(id('龍骨碎片'))).toBe('T4／T5 配方');
  });

  it('裝備清單依 tier 再依名稱排序，且與 seed 的實際配方相符', () => {
    const name = '奧里哈魯根精華';
    const usage = getCraftUsage(id(name))!;
    const expected = EQUIPMENT_SEEDS
      .filter(e => e.craftMaterials?.some(m => m.itemId === id(name)))
      .map(e => e.name)
      .sort();

    expect(usage.equipment.map(e => e.name).sort()).toEqual(expected);
    const tiers = usage.equipment.map(e => e.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('防具與武器分開標記（Wiki 是不同路由）', () => {
    for (const materialId of getCraftMaterialIds()) {
      for (const equip of getCraftUsage(materialId)!.equipment) {
        const seed = EQUIPMENT_SEEDS.find(e => e.name === equip.name)!;
        expect(equip.isArmor).toBe(isArmorEquipment(seed.slot, seed.type));
      }
    }
  });

  it('盾牌／魔導書／臂甲標記成防具（`06-equipment.md` § 副手裝備）', () => {
    const offhandCrafts = EQUIPMENT_SEEDS.filter(
      e => isOffhandDefenseType(e.type) && e.craftMaterials?.length,
    );
    expect(offhandCrafts.length).toBeGreaterThan(0);

    for (const seed of offhandCrafts) {
      const usage = getCraftUsage(seed.craftMaterials![0].itemId)!;
      expect(usage.equipment.find(e => e.name === seed.name)?.isArmor).toBe(true);
    }
  });

  it('每個配方素材在 ITEM_DEFINITIONS 裡都存在（配方沒有指向不存在的素材）', () => {
    const known = new Set(ITEM_DEFINITIONS.map(i => i.id));
    expect(getCraftMaterialIds().filter(n => !known.has(n))).toEqual([]);
  });
});

describe('印記師用的印記是不進配方的例外', () => {
  // 印記沒出現在任何 craftMaterials，只看配方會被當成純販售
  it('印記不在裝備配方裡', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(hasCraftUsage(d.itemId), d.name).toBe(false);
      expect(getCraftUsage(d.itemId), d.name).toBeUndefined();
    }
  });

  /*
   * 六種都要標 —— 這張表原本是手寫 id，只列了工藝與精鍊，
   * 另外四種在背包裡就沒有 ⚒ 記號。改成由 SIGIL_DEFINITIONS 反查後不會再漏。
   */
  it('六種印記都算「有用途」，背包的 ⚒ 與 Wiki 用途欄都要標', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(hasMaterialUsage(d.itemId), d.name).toBe(true);
      expect(getUsefulMaterialIds(), d.name).toContain(d.itemId);
    }
  });

  it('每種印記顯示自己的用途文字，不會被寫成「配方」', () => {
    for (const d of SIGIL_DEFINITIONS) {
      expect(formatMaterialUsage(d.itemId), d.name).toBe(SIGIL_USAGE_LABEL[d.type]);
      expect(formatMaterialUsage(d.itemId), d.name).not.toContain('配方');
    }
  });

  it('用途文字彼此不重複 —— 玩家看得出是哪一種加工', () => {
    const labels = SIGIL_DEFINITIONS.map(d => SIGIL_USAGE_LABEL[d.type]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('裝備配方以外的用途（`30-items.md` § 製作用途標記）', () => {
  it('獨特製作材料池的每個素材都標出所屬階級的獨特配方', () => {
    for (const [tier, ids] of Object.entries(UNIQUE_CRAFT_MATERIAL_POOLS)) {
      for (const itemId of ids) {
        expect(hasMaterialUsage(itemId), String(itemId)).toBe(true);
        expect(formatMaterialUsage(itemId), String(itemId)).toMatch(new RegExp(`(T\\d／)*T${tier}(／T\\d)* 獨特配方`));
      }
    }
  });

  it('跨階的 Boss 素材列出所有階級；競技場不再是用途', () => {
    expect(formatMaterialUsage(id('殭屍王心臟'))).toBe('T5／T6 獨特配方');
    expect(formatMaterialUsage(id('死神碎魂'))).toBe('T6 獨特配方');
    expect(formatMaterialUsage(id('試煉飛龍之鱗'))).toBe('T4 獨特配方');
    expect(formatMaterialUsage(id('冰牙狼王之牙'))).toBe('T4 獨特配方');
    expect(formatMaterialUsage(id('妖精王獠牙'))).toBe('T6 獨特配方');
  });

  it('獨特材料池依 § 6A.3.1：T4 23 種＋3 種 Boss 素材、T5 12 種＋8 種、T6 妖精王獠牙＋8 種', () => {
    const uniqueMaterials = new Set(UNIQUE_MONSTER_DROPS.map(d => d.materialItemId));
    const count = (tier: 4 | 5 | 6) => UNIQUE_CRAFT_MATERIAL_POOLS[tier].filter(i => uniqueMaterials.has(i)).length;
    expect([count(4), count(5), count(6)]).toEqual([23, 12, 1]);
    expect(UNIQUE_CRAFT_MATERIAL_POOLS[4].filter(i => !uniqueMaterials.has(i)).map(i => ITEM_DEFINITIONS.find(d => d.id === i)!.name))
      .toEqual(['試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳']);
    expect(UNIQUE_CRAFT_MATERIAL_POOLS[5].filter(i => !uniqueMaterials.has(i)).map(i => ITEM_DEFINITIONS.find(d => d.id === i)!.name))
      .toEqual(['蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗']);
    expect(UNIQUE_CRAFT_MATERIAL_POOLS[6].map(i => ITEM_DEFINITIONS.find(d => d.id === i)!.name))
      .toEqual(['妖精王獠牙', '遠古騎士紋章', '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂']);
  });

  it('Boss 專屬素材與獨特材料（iconTier 6／7）全部有用途', () => {
    const exclusiveMaterials = ITEM_DEFINITIONS.filter(d => d.category === 'material' && (d.iconTier ?? 0) >= 6);
    expect(exclusiveMaterials.length).toBe(17 + 36);
    expect(exclusiveMaterials.filter(d => !hasMaterialUsage(d.id)).map(d => d.name)).toEqual([]);
  });

  it('魔法學院配方的碎片與材料都算有用途', () => {
    for (const itemId of [SPELLBOOK_FRAGMENT_ID, ...SPELLBOOK_RECIPES.map(r => r.materialItemId)]) {
      expect(hasMaterialUsage(itemId), String(itemId)).toBe(true);
      expect(formatMaterialUsage(itemId), String(itemId)).toContain('魔法學院合成魔法書');
    }
  });

  it('魔法書碎片同時列出配方與魔法學院', () => {
    expect(formatMaterialUsage(SPELLBOOK_FRAGMENT_ID)).toBe('T4 配方、魔法學院合成魔法書');
  });

  it('任務素材標為職業任務', () => {
    expect(hasMaterialUsage(id(QUEST_MATERIAL_NAME))).toBe(true);
    expect(formatMaterialUsage(id(QUEST_MATERIAL_NAME))).toBe('冒險者工會職業任務');
  });
});

describe('用途與 iconTier 是兩個獨立維度', () => {
  it('同一個 iconTier 底下的用途不只一種', () => {
    const byTier = new Map<number, Set<string>>();
    for (const def of ITEM_DEFINITIONS) {
      if (def.category !== 'material' || !def.iconTier) continue;
      const labels = byTier.get(def.iconTier) ?? new Set<string>();
      labels.add(formatMaterialUsage(def.id));
      byTier.set(def.iconTier, labels);
    }
    // 若每個 tier 只對應一種用途，顏色就能推出用途，這個維度也就沒必要存在
    const mixed = [...byTier.values()].filter(labels => labels.size > 1);
    expect(mixed.length).toBeGreaterThan(0);
  });
});
