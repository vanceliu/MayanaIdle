import { describe, it, expect } from 'vitest';
import {
  getPotionCount,
  addPotionToBag,
  consumePotionFromBag,
  getBagUsedSlots,
  isBagFull,
  wouldOverflowBag,
  getBagMaxSlots,
  BAG_BASE_SLOTS,
  type BagItem,
} from '../gameStore';
import type { EquipmentInstance, EquippedGear } from '../../models/equipment';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';

/** 只帶一條腰帶的裝備狀態 */
function gearWithBelt(beltName: string): EquippedGear {
  const tpl = EQUIPMENT_SEEDS.find(t => t.name === beltName);
  if (!tpl) throw new Error(`找不到腰帶：${beltName}`);
  return { belt: { ...tpl, templateId: tpl.id!, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true } as EquipmentInstance };
}

describe('Potion helpers', () => {
  it('getPotionCount returns 0 when no potion exists', () => {
    expect(getPotionCount([], 'red')).toBe(0);
  });

  it('getPotionCount returns correct amount', () => {
    const bag: BagItem[] = [
      { name: '紅色藥水', type: 'potion', amount: 5 },
      { name: '橙色藥水', type: 'potion', amount: 3 },
    ];
    expect(getPotionCount(bag, 'red')).toBe(5);
    expect(getPotionCount(bag, 'orange')).toBe(3);
    expect(getPotionCount(bag, 'white')).toBe(0);
  });

  it('addPotionToBag creates new entry when none exists', () => {
    const result = addPotionToBag([], 'red', 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: '紅色藥水', type: 'potion', itemTemplateId: 1, amount: 10 });
  });

  it('addPotionToBag stacks onto existing entry', () => {
    const bag: BagItem[] = [{ name: '紅色藥水', type: 'potion', amount: 5 }];
    const result = addPotionToBag(bag, 'red', 3);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(8);
  });

  it('consumePotionFromBag decrements amount', () => {
    const bag: BagItem[] = [{ name: '紅色藥水', type: 'potion', amount: 5 }];
    const result = consumePotionFromBag(bag, 'red');
    expect(result[0].amount).toBe(4);
  });

  it('consumePotionFromBag removes entry when amount reaches 0', () => {
    const bag: BagItem[] = [{ name: '白色藥水', type: 'potion', amount: 1 }];
    const result = consumePotionFromBag(bag, 'white');
    expect(result).toHaveLength(0);
  });

  it('consumePotionFromBag does not affect other items', () => {
    const bag: BagItem[] = [
      { name: '紅色藥水', type: 'potion', amount: 3 },
      { name: '品質石', type: 'material', amount: 10 },
    ];
    const result = consumePotionFromBag(bag, 'red');
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(2);
    expect(result[1].amount).toBe(10);
  });
});

describe('Bag capacity', () => {
  const makeEquip = (id: number): EquipmentInstance => ({
    id,
    templateId: 1,
    name: `裝備${id}`,
    slot: 'chest',
    equipped: false,
    ownerId: 1,
    defense: 10,
    weight: 100,
    enhancement: 0,
    quality: 0,
    qualityCap: 20,
    affixes: [],
  } as any);

  it('getBagUsedSlots counts bagItems + inventory', () => {
    const bag: BagItem[] = [
      { name: '紅色藥水', type: 'potion', amount: 99 },
      { name: '品質石', type: 'material', amount: 5 },
    ];
    const inv = [makeEquip(1), makeEquip(2)];
    expect(getBagUsedSlots(bag, inv)).toBe(4);
  });

  it('stackable items occupy 1 slot regardless of amount', () => {
    const bag: BagItem[] = [{ name: '紅色藥水', type: 'potion', amount: 9999 }];
    expect(getBagUsedSlots(bag, [])).toBe(1);
  });

  it('isBagFull returns false when under limit', () => {
    expect(isBagFull([], [], {})).toBe(false);
  });

  it('isBagFull returns true at exactly the base 50 slots', () => {
    const bag: BagItem[] = Array.from({ length: 48 }, (_, i) => ({
      name: `item${i}`,
      type: 'material' as const,
      amount: 1,
    }));
    const inv = [makeEquip(1), makeEquip(2)];
    expect(getBagUsedSlots(bag, inv)).toBe(50);
    expect(isBagFull(bag, inv, {})).toBe(true);
  });

  it('BAG_BASE_SLOTS is 50', () => {
    expect(BAG_BASE_SLOTS).toBe(50);
  });
});

describe('腰帶擴充背包格數（§ 35.1）', () => {
  it('無腰帶時為基礎 50 格', () => {
    expect(getBagMaxSlots({})).toBe(50);
  });

  it('每條腰帶各自提供正確的格數（§ 35.1，依裝備Tier 遞增）', () => {
    const expected: Record<string, number> = {
      皮腰帶: 5, 鐵扣腰帶: 6, 龍皮腰帶: 8, 銀扣腰帶: 10,
      力之腰帶: 15, 暗殺者腰帶: 15, 賢者腰帶: 15, 祈禱者腰帶: 15,
      守護者腰帶: 18,
      天龍腰帶: 20, 星辰腰帶: 20, 幻影腰帶: 20,
    };
    for (const [name, slots] of Object.entries(expected)) {
      expect(getBagMaxSlots(gearWithBelt(name)), name).toBe(BAG_BASE_SLOTS + slots);
    }
  });

  it('滿裝上限為 70 格', () => {
    expect(getBagMaxSlots(gearWithBelt('天龍腰帶'))).toBe(70);
  });

  it('腰帶保留原有的負重加成（負重系統仍存在，只是沒有 UI）', () => {
    const belts = EQUIPMENT_SEEDS.filter(t => t.slot === 'belt');
    expect(belts.length).toBeGreaterThan(0);
    for (const b of belts) {
      expect(b.bonusWeight, b.name).toBeGreaterThan(0);
      expect(b.bonusBagSlots, b.name).toBeGreaterThan(0);
    }
  });

  it('容量檢查會隨腰帶放寬', () => {
    const bag: BagItem[] = Array.from({ length: 50 }, (_, i) => ({
      name: `item${i}`, type: 'material' as const, amount: 1,
    }));
    expect(isBagFull(bag, [], {})).toBe(true);                        // 50/50
    expect(isBagFull(bag, [], gearWithBelt('皮腰帶'))).toBe(false);    // 50/55
    expect(isBagFull(bag, [], gearWithBelt('力之腰帶'))).toBe(false);  // 50/65
  });
});

describe('換裝時的背包溢出保護（§ 35.1）', () => {
  const bagOf = (n: number): BagItem[] =>
    Array.from({ length: n }, (_, i) => ({ name: `item${i}`, type: 'material' as const, amount: 1 }));

  it('卸下腰帶：同時計入「多佔一格」與「上限下降」', () => {
    // 力之腰帶 +15 → 上限 65。卸下後上限 50，且腰帶本身要佔 1 格
    const belt = gearWithBelt('力之腰帶');
    const afterUnequip = { ...belt, belt: null };

    // 49 格：卸下後 50/50，剛好塞得下
    expect(wouldOverflowBag(bagOf(49), [], afterUnequip, 1)).toBe(false);
    // 50 格：卸下後 51/50，溢出 → 必須擋下
    expect(wouldOverflowBag(bagOf(50), [], afterUnequip, 1)).toBe(true);
    // 64 格（在 65 上限內合法），卸下後 65/50，明顯溢出
    expect(wouldOverflowBag(bagOf(64), [], afterUnequip, 1)).toBe(true);
  });

  it('卸下非腰帶裝備：等同「背包已滿」判定', () => {
    const empty = {};
    expect(wouldOverflowBag(bagOf(49), [], empty, 1)).toBe(false); // 50/50
    expect(wouldOverflowBag(bagOf(50), [], empty, 1)).toBe(true);  // 51/50
  });

  it('換成格數較少的腰帶也會溢出（佔格不變但上限下降）', () => {
    // 力之腰帶(+15, 上限 65) → 皮腰帶(+5, 上限 55)，替換時 slotDelta = 0
    const afterSwap = gearWithBelt('皮腰帶');
    expect(wouldOverflowBag(bagOf(55), [], afterSwap, 0)).toBe(false); // 55/55
    expect(wouldOverflowBag(bagOf(56), [], afterSwap, 0)).toBe(true);  // 56/55
  });

  it('換成格數較多的腰帶不會被擋', () => {
    const afterSwap = gearWithBelt('力之腰帶');
    expect(wouldOverflowBag(bagOf(60), [], afterSwap, 0)).toBe(false); // 60/65
  });

  it('從空手穿上腰帶：物品離開背包，佔格 -1', () => {
    const afterEquip = gearWithBelt('皮腰帶');
    expect(wouldOverflowBag(bagOf(55), [], afterEquip, -1)).toBe(false); // 54/55
  });
});
