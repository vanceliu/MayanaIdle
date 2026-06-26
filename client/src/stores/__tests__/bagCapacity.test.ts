import { describe, it, expect } from 'vitest';
import {
  getPotionCount,
  addPotionToBag,
  consumePotionFromBag,
  getBagUsedSlots,
  isBagFull,
  BAG_MAX_SLOTS,
  type BagItem,
} from '../gameStore';
import type { EquipmentInstance } from '../../models/equipment';

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
    expect(result[0]).toEqual({ name: '紅色藥水', type: 'potion', amount: 10 });
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
    expect(isBagFull([], [])).toBe(false);
  });

  it('isBagFull returns true at exactly 100 slots', () => {
    const bag: BagItem[] = Array.from({ length: 98 }, (_, i) => ({
      name: `item${i}`,
      type: 'material' as const,
      amount: 1,
    }));
    const inv = [makeEquip(1), makeEquip(2)];
    expect(getBagUsedSlots(bag, inv)).toBe(100);
    expect(isBagFull(bag, inv)).toBe(true);
  });

  it('BAG_MAX_SLOTS is 100', () => {
    expect(BAG_MAX_SLOTS).toBe(100);
  });
});
