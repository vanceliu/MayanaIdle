import { describe, it, expect } from 'vitest';
import { validateOffer, canReceive } from '../trade';
import type { GameState } from '../../stores/gameStore';
import { BAG_BASE_SLOTS } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import { makeBagItem } from '../../models/bagItem';

/** 交易的放入驗證與收下判定（`97-selfhosted-server.md` § 97.7 表） */
function equip(id: number, name: string, starter = false): EquipmentInstance {
  return { id, templateId: 1, name, type: 'sword', slot: 'rightHand', isTwoHanded: false, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false, isStarterGear: starter } as EquipmentInstance;
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    character: { id: 1, gold: 500 },
    inventory: [equip(10, '鐵劍'), equip(11, '新手劍', true)],
    bagItems: [makeBagItem(1, 5)!],
    equippedGear: {},
    ...overrides,
  } as unknown as GameState;
}

describe('validateOffer', () => {
  it('放入自己有的裝備、道具與金幣', () => {
    expect(validateOffer(state(), { equipmentIds: [10], items: [{ itemId: 1, amount: 5 }], gold: 500 })).toEqual({ ok: true });
  });

  it('新手裝不可交易', () => {
    const r = validateOffer(state(), { equipmentIds: [11], items: [], gold: 0 });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('新手裝');
  });

  it('不在背包的裝備、超額道具、超額金幣一律擋下', () => {
    expect(validateOffer(state(), { equipmentIds: [99], items: [], gold: 0 }).ok).toBe(false);
    expect(validateOffer(state(), { equipmentIds: [], items: [{ itemId: 1, amount: 6 }], gold: 0 }).ok).toBe(false);
    expect(validateOffer(state(), { equipmentIds: [], items: [], gold: 501 }).ok).toBe(false);
    expect(validateOffer(state(), { equipmentIds: [], items: [], gold: -1 }).ok).toBe(false);
    expect(validateOffer(state(), { equipmentIds: [10, 10], items: [], gold: 0 }).ok).toBe(false);
  });
});

describe('canReceive', () => {
  it('換出一件、收下一件時格數不變', () => {
    const r = canReceive(state(), { equipmentIds: [10], items: [], gold: 0 }, [equip(20, '鋼劍')], []);
    expect(r).toEqual({ ok: true });
  });

  it('背包已滿且只進不出時擋下', () => {
    const full = state({
      inventory: Array.from({ length: BAG_BASE_SLOTS }, (_, i) => equip(100 + i, `劍${i}`)),
      bagItems: [],
    });
    const r = canReceive(full, { equipmentIds: [], items: [], gold: 0 }, [equip(20, '鋼劍')], []);
    expect(r.ok).toBe(false);
    expect(r.message).toBe('背包欄位不足');
  });

  it('收下已持有的道具不佔新格', () => {
    const full = state({
      inventory: Array.from({ length: BAG_BASE_SLOTS - 1 }, (_, i) => equip(100 + i, `劍${i}`)),
      bagItems: [makeBagItem(1, 1)!],
    });
    expect(canReceive(full, { equipmentIds: [], items: [], gold: 0 }, [], [{ itemId: 1, amount: 3 }])).toEqual({ ok: true });
  });
});
