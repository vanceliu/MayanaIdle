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
import { bagItem, fillerBagItems } from '../../testing/bagFixtures';

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
      bagItem('紅色藥水', 5),
      bagItem('橙色藥水', 3),
    ];
    expect(getPotionCount(bag, 'red')).toBe(5);
    expect(getPotionCount(bag, 'orange')).toBe(3);
    expect(getPotionCount(bag, 'white')).toBe(0);
  });

  it('addPotionToBag creates new entry when none exists', () => {
    const result = addPotionToBag([], 'red', 10);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(bagItem('紅色藥水', 10));
  });

  it('addPotionToBag stacks onto existing entry', () => {
    const bag: BagItem[] = [bagItem('紅色藥水', 5)];
    const result = addPotionToBag(bag, 'red', 3);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(8);
  });

  it('consumePotionFromBag decrements amount', () => {
    const bag: BagItem[] = [bagItem('紅色藥水', 5)];
    const result = consumePotionFromBag(bag, 'red');
    expect(result[0].amount).toBe(4);
  });

  it('consumePotionFromBag removes entry when amount reaches 0', () => {
    const bag: BagItem[] = [bagItem('白色藥水', 1)];
    const result = consumePotionFromBag(bag, 'white');
    expect(result).toHaveLength(0);
  });

  it('consumePotionFromBag does not affect other items', () => {
    const bag: BagItem[] = [
      bagItem('紅色藥水', 3),
      bagItem('工藝印記', 10),
    ];
    const result = consumePotionFromBag(bag, 'red');
    expect(result).toHaveLength(2);
    expect(result[0].amount).toBe(2);
    expect(result[1].amount).toBe(10);
  });
});

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

describe('Bag capacity', () => {
  it('getBagUsedSlots counts bagItems + inventory', () => {
    const bag: BagItem[] = [
      bagItem('紅色藥水', 99),
      bagItem('銀礦石', 5),
    ];
    const inv = [makeEquip(1), makeEquip(2)];
    expect(getBagUsedSlots(bag, inv, {})).toBe(4);
  });

  // § 35.20：印記走獨立分頁，完全不進格數計算
  it('印記不佔格', () => {
    const bag: BagItem[] = [
      bagItem('紅色藥水', 99),
      bagItem('工藝印記', 5),
      bagItem('精鍊印記', 200),
      bagItem('混沌印記', 3),
    ];
    expect(getBagUsedSlots(bag, [], {})).toBe(1);
  });

  it('背包被非印記塞滿時，印記照樣不算格數', () => {
    const bag: BagItem[] = [
      ...fillerBagItems(60),
      bagItem('突破印記', 40),
    ];
    expect(getBagUsedSlots(bag, [], {})).toBe(60);
    expect(isBagFull(bag, [], {})).toBe(true);
  });

  it('§ 35.1：裝備中的裝備一樣佔背包格', () => {
    const bag: BagItem[] = [bagItem('紅色藥水', 99)];
    const inv = [makeEquip(1)];
    const gear: EquippedGear = { chest: makeEquip(2), helmet: makeEquip(3) };
    expect(getBagUsedSlots(bag, inv, gear)).toBe(4);
  });

  it('§ 35.1：空欄位（null）不佔格', () => {
    const gear: EquippedGear = { chest: makeEquip(2), helmet: null };
    expect(getBagUsedSlots([], [], gear)).toBe(1);
  });

  it('stackable items occupy 1 slot regardless of amount', () => {
    const bag: BagItem[] = [bagItem('紅色藥水', 9999)];
    expect(getBagUsedSlots(bag, [], {})).toBe(1);
  });

  it('isBagFull returns false when under limit', () => {
    expect(isBagFull([], [], {})).toBe(false);
  });

  it('isBagFull returns true at exactly the base 60 slots', () => {
    const bag = fillerBagItems(58);
    const inv = [makeEquip(1), makeEquip(2)];
    expect(getBagUsedSlots(bag, inv, {})).toBe(60);
    expect(isBagFull(bag, inv, {})).toBe(true);
  });

  it('§ 35.1：滿裝的裝備欄一樣吃掉格數', () => {
    // 58 格背包 + 身上 2 件 = 60/60
    const bag = fillerBagItems(58);
    const gear: EquippedGear = { chest: makeEquip(1), helmet: makeEquip(2) };
    expect(isBagFull(bag, [], gear)).toBe(true);
    expect(isBagFull(bag, [], {})).toBe(false); // 沒穿裝備時 58/60 還有空間
  });

  it('BAG_BASE_SLOTS is 60（10 個裝備欄改為佔格後的補償，§ 35.1）', () => {
    expect(BAG_BASE_SLOTS).toBe(60);
  });
});

describe('腰帶擴充背包格數（§ 35.1）', () => {
  it('無腰帶時為基礎 60 格', () => {
    expect(getBagMaxSlots({})).toBe(60);
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

  it('滿裝上限為 80 格', () => {
    expect(getBagMaxSlots(gearWithBelt('天龍腰帶'))).toBe(80);
  });

  it('腰帶保留原有的負重加成（負重系統仍存在，只是沒有 UI）', () => {
    const belts = EQUIPMENT_SEEDS.filter(t => t.slot === 'belt');
    expect(belts.length).toBeGreaterThan(0);
    for (const b of belts) {
      expect(b.bonusWeight, b.name).toBeGreaterThan(0);
      expect(b.bonusBagSlots, b.name).toBeGreaterThan(0);
    }
  });

  it('容量檢查會隨腰帶放寬（腰帶自己也佔 1 格）', () => {
    const bag = fillerBagItems(60);
    expect(isBagFull(bag, [], {})).toBe(true);                        // 60/60
    expect(isBagFull(bag, [], gearWithBelt('皮腰帶'))).toBe(false);    // 61/65
    expect(isBagFull(bag, [], gearWithBelt('力之腰帶'))).toBe(false);  // 61/75
  });
});

describe('換裝時的背包溢出保護（§ 35.1）', () => {
  const bagOf = (n: number): BagItem[] => fillerBagItems(n);

  it('卸下非腰帶裝備：佔格不變，背包滿了照樣脫得下來', () => {
    // 59 格背包 + 身上 1 件 = 60/60 已滿
    const item = makeEquip(1);
    expect(getBagUsedSlots(bagOf(59), [], { chest: item })).toBe(60);
    // 卸下後那件從裝備欄移到背包清單，總數仍是 60 → 不擋
    expect(wouldOverflowBag(bagOf(59), [item], { chest: null })).toBe(false);
  });

  it('卸下腰帶：佔格不變，但上限下降時仍要擋', () => {
    // 力之腰帶 +15 → 上限 75；卸下後上限回到 60
    const belt = gearWithBelt('力之腰帶').belt!;
    const afterUnequip = { belt: null };

    // 背包 59 + 腰帶 1 = 60/60，剛好塞得下
    expect(wouldOverflowBag(bagOf(59), [belt], afterUnequip)).toBe(false);
    // 背包 60 + 腰帶 1 = 61/60 → 溢出，必須擋下
    expect(wouldOverflowBag(bagOf(60), [belt], afterUnequip)).toBe(true);
    // 背包 70（在 75 上限內合法），卸下後 71/60，明顯溢出
    expect(wouldOverflowBag(bagOf(70), [belt], afterUnequip)).toBe(true);
  });

  it('換成格數較少的腰帶也會溢出（佔格不變但上限下降）', () => {
    // 力之腰帶(+15, 上限 75) → 皮腰帶(+5, 上限 65)。舊腰帶回背包清單，總佔格不變
    const oldBelt = gearWithBelt('力之腰帶').belt!;
    const afterSwap = gearWithBelt('皮腰帶');
    expect(wouldOverflowBag(bagOf(63), [oldBelt], afterSwap)).toBe(false); // 65/65
    expect(wouldOverflowBag(bagOf(64), [oldBelt], afterSwap)).toBe(true);  // 66/65
  });

  it('換成格數較多的腰帶不會被擋', () => {
    const oldBelt = gearWithBelt('皮腰帶').belt!;
    const afterSwap = gearWithBelt('力之腰帶');
    expect(wouldOverflowBag(bagOf(70), [oldBelt], afterSwap)).toBe(false); // 72/75
  });

  it('從空手穿上腰帶：物品沒有離開背包，佔格不變', () => {
    const afterEquip = gearWithBelt('皮腰帶');
    // 背包 64 格（其中一格是那條腰帶）→ 穿上後 64/65，不變也不擋
    expect(wouldOverflowBag(bagOf(64), [], afterEquip)).toBe(false);
  });
});
