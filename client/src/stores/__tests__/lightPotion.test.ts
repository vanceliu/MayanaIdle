/**
 * 減重藥水（`30-items.md` 藥水類、`13-town.md` 雜貨店、`35-inventory-constraints.md` § 35.7.2）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore, POTION_CONFIG, POTION_TYPES, type PotionType } from '../gameStore';
import { getItemById } from '../../models/items';
import { GENERAL_STORE_ITEM_IDS } from '../../systems/shop';
import { getCarriedWeight } from '../../systems/weight';
import { normalizeQuickSlots, resolveQuickSlotAction, toQuickSlotEntry } from '../../models/quickSlot';
import { bagItem } from '../../testing/bagFixtures';
import type { Character } from '../../models/character';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 100_000;

const LIGHT: { type: PotionType; base: PotionType; id: number; name: string; weight: number; price: number }[] = [
  { type: 'light-red', base: 'red', id: 177, name: '減重紅色藥水', weight: 1, price: 50 },
  { type: 'light-orange', base: 'orange', id: 178, name: '減重橙色藥水', weight: 2.5, price: 160 },
  { type: 'light-white', base: 'white', id: 179, name: '減重白色藥水', weight: 5, price: 400 },
];

function character(hp: number): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp, maxHp: 300, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 1000, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

describe('道具定義', () => {
  it.each(LIGHT)('$name：回復量與冷卻同一般版、重量 $weight、售價 $price G、雜貨店販售', l => {
    const def = getItemById(l.id)!;
    const base = getItemById(POTION_CONFIG[l.base].itemId)!;
    expect(def).toMatchObject({ name: l.name, category: 'potion', weight: l.weight, buyPrice: l.price });
    expect([def.healMin, def.healMax, def.cooldown]).toEqual([base.healMin, base.healMax, base.cooldown]);
    expect(POTION_CONFIG[l.type]).toMatchObject({ itemId: l.id, healMin: def.healMin, healMax: def.healMax, cooldown: def.cooldown });
    expect(GENERAL_STORE_ITEM_IDS).toContain(l.id);
  });

  it('基礎藥水依一般版紅橙白、減重版紅橙白排列', () => {
    expect(POTION_TYPES).toEqual(['red', 'orange', 'white', 'light-red', 'light-orange', 'light-white']);
  });

  it('小數重量照數量相乘並收到小數一位', () => {
    expect(getCarriedWeight([], [bagItem('減重橙色藥水', 3)])).toBe(7.5);
  });
});

describe('使用', () => {
  it('指定減重版只喝減重版，一般版不動', () => {
    useGameStore.setState({
      character: character(10),
      bagItems: [bagItem('橙色藥水', 5), bagItem('減重橙色藥水', 5)],
      combatLogs: [], equippedGear: {}, activeEffects: [], lastPotionUsedAt: 0, lastPotionCooldown: 0,
    });
    useGameStore.getState().usePotionByType('light-orange');
    const s = useGameStore.getState();
    expect(s.character!.hp).toBeGreaterThanOrEqual(10 + POTION_CONFIG['light-orange'].healMin);
    expect(s.bagItems.find(b => b.name === '減重橙色藥水')?.amount).toBe(4);
    expect(s.bagItems.find(b => b.name === '橙色藥水')?.amount).toBe(5);
  });

  it('指定一般版只喝一般版，沒有一般版時不喝減重版', () => {
    useGameStore.setState({
      character: character(10),
      bagItems: [bagItem('減重紅色藥水', 5)],
      combatLogs: [], equippedGear: {}, activeEffects: [], lastPotionUsedAt: 0, lastPotionCooldown: 0,
    });
    useGameStore.getState().usePotionByType('red');
    const s = useGameStore.getState();
    expect(s.character!.hp).toBe(10);
    expect(s.bagItems.find(b => b.name === '減重紅色藥水')?.amount).toBe(5);
  });
});

describe('快捷鍵', () => {
  it.each(LIGHT)('$name 放進快捷鍵為獨立的藥水格', l => {
    const entry = toQuickSlotEntry('bag', l.id);
    expect(entry).toEqual({ kind: 'potion', potionType: l.type });
    expect(resolveQuickSlotAction(entry)).toEqual({ type: 'potion', potionType: l.type });
  });

  it('存檔讀回保留減重版藥水格', () => {
    const slots = normalizeQuickSlots([{ kind: 'potion', potionType: 'light-white' }, { kind: 'potion', potionType: 'bogus' }]);
    expect(slots[0]).toEqual({ kind: 'potion', potionType: 'light-white' });
    expect(slots[1]).toBeNull();
  });
});
