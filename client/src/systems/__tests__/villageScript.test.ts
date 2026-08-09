import { describe, it, expect } from 'vitest';
import {
  evaluateVillageScript,
  getBuyAmount,
  collectVillageSellEquipment,
  collectDepositEquipment,
  getWithdrawAmount,
  getDepositGoldAmount,
  getWithdrawGoldAmount,
  getWarehouseKind,
  type VillageScriptContext,
} from '../villageScriptRunner';
import { matchesEquipmentFilter, normalizeVillageRules, DEFAULT_VILLAGE_SCRIPT } from '../../models/villageScript';
import type { VillageRule } from '../../models/villageScript';
import { makeBagItem } from '../../models/bagItem';
import type { BagItem } from '../../models/bagItem';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';

/** 村莊腳本（`49-village-script.md`） */

const RED_POTION = 1;   // buyPrice 25
const TUSK = 19;        // 素材，iconTier 1，純販售
const TOWN_SCROLL = 5;  // 回城卷軸（薄暮村）

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8, buyPrice: 1000, acquireType: 'shop', tier: 2 },
  { id: 3, name: '皮甲', type: 'armor', slot: 'chest', isTwoHanded: false, defense: 10, buyPrice: 500, acquireType: 'shop', tier: 1 },
] as EquipmentTemplate[];

function equip(templateId: number, overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const t = TEMPLATES.find(x => x.id === templateId)!;
  return {
    id: 100 + templateId,
    templateId,
    name: t.name,
    type: t.type,
    slot: t.slot,
    isTwoHanded: false,
    smallMonsterDamage: t.smallMonsterDamage,
    defense: t.defense,
    enhancement: 0,
    affixes: [],
    ...overrides,
  } as EquipmentInstance;
}

function ctx(overrides: Partial<VillageScriptContext> = {}): VillageScriptContext {
  return {
    className: 'knight',
    gold: 10_000,
    bagItems: [] as BagItem[],
    inventory: [],
    equippedIds: new Set(),
    templates: TEMPLATES,
    bagUsedSlots: 10,
    bagMaxSlots: 50,
    inTown: true,
    lastHuntLocation: null,
    warehouse: {
      shared: { materials: [] as BagItem[], equipment: [] },
      personal: { materials: [] as BagItem[], equipment: [] },
      gold: 0,
    },
    bagFreeSlots: 40,
    ...overrides,
  };
}

function rule(action: VillageRule['action'], conditions: VillageRule['conditions'] = [{ type: 'always' }]): VillageRule {
  return { id: 'r1', enabled: true, conditions, action };
}

describe('村莊腳本判定', () => {
  it('空腳本什麼都不做', () => {
    expect(evaluateVillageScript([], ctx())).toBeNull();
    expect(DEFAULT_VILLAGE_SCRIPT).toEqual([]);
  });

  it('停用的規則跳過', () => {
    const rules = [{ ...rule({ type: 'return_to_hunt' }), enabled: false }];
    const c = ctx({ lastHuntLocation: { zoneId: 'z', regionId: 'r', floor: null, x: 1, y: 1 } });
    expect(evaluateVillageScript(rules, c)).toBeNull();
  });

  describe('回城', () => {
    it('在野外且有卷軸才成立', () => {
      const rules = [rule({ type: 'return_town' })];
      const bag = [makeBagItem(TOWN_SCROLL, 1)] as BagItem[];
      expect(evaluateVillageScript(rules, ctx({ inTown: false, bagItems: bag }))?.type).toBe('return_town');
    });

    it('已經在城裡就跳過，換下一條規則接手', () => {
      const rules = [
        rule({ type: 'return_town' }),
        rule({ type: 'sell_materials', maxTier: 7 }),
      ];
      const bag = [makeBagItem(TOWN_SCROLL, 1), makeBagItem(TUSK, 5)] as BagItem[];
      expect(evaluateVillageScript(rules, ctx({ inTown: true, bagItems: bag }))?.type).toBe('sell_materials');
    });

    it('沒有卷軸就回不去', () => {
      const rules = [rule({ type: 'return_town' })];
      expect(evaluateVillageScript(rules, ctx({ inTown: false, bagItems: [] }))).toBeNull();
    });
  });

  describe('條件', () => {
    it('背包已用格數', () => {
      const rules = [rule({ type: 'return_town' }, [{ type: 'bag_slots_used_gte', value: 40 }])];
      const bag = [makeBagItem(TOWN_SCROLL, 1)] as BagItem[];
      expect(evaluateVillageScript(rules, ctx({ inTown: false, bagItems: bag, bagUsedSlots: 39 }))).toBeNull();
      expect(evaluateVillageScript(rules, ctx({ inTown: false, bagItems: bag, bagUsedSlots: 40 }))?.type).toBe('return_town');
    });

    it('道具數量少於', () => {
      const rules = [rule({ type: 'buy_item', itemId: RED_POTION, targetAmount: 100 }, [
        { type: 'item_count_below', itemId: RED_POTION, value: 20 },
      ])];
      const few = [makeBagItem(RED_POTION, 10)] as BagItem[];
      const many = [makeBagItem(RED_POTION, 50)] as BagItem[];
      expect(evaluateVillageScript(rules, ctx({ bagItems: few }))?.type).toBe('buy_item');
      expect(evaluateVillageScript(rules, ctx({ bagItems: many }))).toBeNull();
    });

    it('多條件 AND：全部成立才觸發', () => {
      const rules = [rule({ type: 'buy_item', itemId: RED_POTION, targetAmount: 100 }, [
        { type: 'item_count_below', itemId: RED_POTION, value: 20 },
        { type: 'gold_above', value: 5_000 },
      ])];
      const bag = [makeBagItem(RED_POTION, 10)] as BagItem[];
      expect(evaluateVillageScript(rules, ctx({ bagItems: bag, gold: 10_000 }))?.type).toBe('buy_item');
      expect(evaluateVillageScript(rules, ctx({ bagItems: bag, gold: 1_000 }))).toBeNull();
    });
  });

  describe('購買', () => {
    const action = { type: 'buy_item' as const, itemId: RED_POTION, targetAmount: 100 };

    it('補到目標數量，不是每次都買一整批', () => {
      const c = ctx({ bagItems: [makeBagItem(RED_POTION, 80)] as BagItem[] });
      expect(getBuyAmount(action, c)).toBe(20);
    });

    it('已經達標就不買（不會每輪重複下單）', () => {
      const c = ctx({ bagItems: [makeBagItem(RED_POTION, 100)] as BagItem[] });
      expect(getBuyAmount(action, c)).toBe(0);
      expect(evaluateVillageScript([rule(action)], c)).toBeNull();
    });

    it('金幣不夠就只買買得起的量', () => {
      // 紅色藥水 25G，身上 200G → 只買得起 8 個
      const c = ctx({ gold: 200, bagItems: [] });
      expect(getBuyAmount(action, c)).toBe(8);
    });

    it('一個都買不起時規則不成立', () => {
      const c = ctx({ gold: 10, bagItems: [] });
      expect(evaluateVillageScript([rule(action)], c)).toBeNull();
    });
  });

  describe('販售', () => {
    it('沒有東西可賣時規則不成立，讓下一條接手', () => {
      const rules = [
        rule({ type: 'sell_materials', maxTier: 7 }),
        rule({ type: 'return_to_hunt' }),
      ];
      const c = ctx({ bagItems: [], lastHuntLocation: { zoneId: 'z', regionId: 'r', floor: null, x: 1, y: 1 } });
      expect(evaluateVillageScript(rules, c)?.type).toBe('return_to_hunt');
    });

    it('裝備門檻以下才賣', () => {
      const action = { type: 'sell_equipment' as const, maxTier: 1 };
      const c = ctx({ inventory: [equip(1), equip(3)] });
      // 鐵劍是商店中階（2），皮甲是商店低階（1）
      expect(collectVillageSellEquipment(action, c).map(i => i.name)).toEqual(['皮甲']);
    });

    it('穿在身上的不會被賣掉', () => {
      const worn = equip(3);
      const c = ctx({ inventory: [worn], equippedIds: new Set([worn.id]) });
      expect(collectVillageSellEquipment({ type: 'sell_equipment', maxTier: 6 }, c)).toEqual([]);
    });
  });

  describe('返回掛機點', () => {
    it('沒有記錄過掛機點就不成立', () => {
      expect(evaluateVillageScript([rule({ type: 'return_to_hunt' })], ctx())).toBeNull();
    });

    it('在野外時不成立（人已經在外面了）', () => {
      const c = ctx({ inTown: false, lastHuntLocation: { zoneId: 'z', regionId: 'r', floor: null, x: 1, y: 1 } });
      expect(evaluateVillageScript([rule({ type: 'return_to_hunt' })], c)).toBeNull();
    });
  });
});

describe('倉庫存取', () => {
  const stored = (materials: BagItem[], gold = 0) => ({
    shared: { materials, equipment: [] },
    personal: { materials: [] as BagItem[], equipment: [] },
    gold,
  });

  it('存入素材：與販售同一套顏色門檻，但預設不保護配方素材', () => {
    const c = ctx({ bagItems: [makeBagItem(TUSK, 3)] as BagItem[] });
    expect(evaluateVillageScript([rule({ type: 'deposit_materials', maxTier: 1 })], c)?.type)
      .toBe('deposit_materials');
  });

  it('存入裝備：沒設條件就不存（不會整包倒進倉庫）', () => {
    const c = ctx({ inventory: [equip(1)] });
    expect(collectDepositEquipment({ type: 'deposit_equipment' }, c)).toEqual([]);
  });

  it('存入裝備：只存命中條件的，穿在身上的不動', () => {
    const worn = equip(1);
    const c = ctx({ inventory: [worn, equip(3, { id: 777 })], equippedIds: new Set([worn.id]) });
    const picked = collectDepositEquipment(
      { type: 'deposit_equipment', keep: { equipTypes: ['sword', 'armor'] } },
      c,
    );
    expect(picked.map(i => i.id)).toEqual([777]);
  });

  it('取出道具：補到目標數量，受倉庫存量限制', () => {
    const action = { type: 'withdraw_item' as const, itemId: RED_POTION, targetAmount: 50 };
    const c = ctx({
      bagItems: [makeBagItem(RED_POTION, 10)] as BagItem[],
      warehouse: stored([makeBagItem(RED_POTION, 25)] as BagItem[]),
    });
    expect(getWithdrawAmount(action, c)).toBe(25);
  });

  it('取出道具：已達標就不取', () => {
    const action = { type: 'withdraw_item' as const, itemId: RED_POTION, targetAmount: 50 };
    const c = ctx({
      bagItems: [makeBagItem(RED_POTION, 50)] as BagItem[],
      warehouse: stored([makeBagItem(RED_POTION, 25)] as BagItem[]),
    });
    expect(getWithdrawAmount(action, c)).toBe(0);
  });

  it('取出道具：背包沒空格又是新品項時取不出來', () => {
    const action = { type: 'withdraw_item' as const, itemId: RED_POTION, targetAmount: 50 };
    const c = ctx({
      bagItems: [],
      bagFreeSlots: 0,
      warehouse: stored([makeBagItem(RED_POTION, 25)] as BagItem[]),
    });
    expect(getWithdrawAmount(action, c)).toBe(0);
  });

  it('存金幣：身上留下指定金額，其餘存入', () => {
    const c = ctx({ gold: 10_000 });
    expect(getDepositGoldAmount({ type: 'deposit_gold', keepGold: 3_000 }, c)).toBe(7_000);
    expect(getDepositGoldAmount({ type: 'deposit_gold', keepGold: 20_000 }, c)).toBe(0);
  });

  it('領金幣：補到目標，受倉庫存量限制', () => {
    const c = ctx({ gold: 1_000, warehouse: stored([], 2_000) });
    expect(getWithdrawGoldAmount({ type: 'withdraw_gold', targetAmount: 10_000 }, c)).toBe(2_000);
    expect(getWithdrawGoldAmount({ type: 'withdraw_gold', targetAmount: 500 }, c)).toBe(0);
  });

  it('倉庫動作在野外一律不成立', () => {
    const c = ctx({ inTown: false, gold: 10_000 });
    expect(evaluateVillageScript([rule({ type: 'deposit_gold', keepGold: 0 })], c)).toBeNull();
  });

  it('預設走共用倉庫', () => {
    expect(getWarehouseKind({ type: 'withdraw_item' })).toBe('shared');
    expect(getWarehouseKind({ type: 'withdraw_item', warehouse: 'personal' })).toBe('personal');
  });
});

describe('裝備保留條件', () => {
  it('沒設保留條件就全賣', () => {
    expect(matchesEquipmentFilter(equip(1), undefined, 'knight')).toBe(false);
    expect(matchesEquipmentFilter(equip(1), {}, 'knight')).toBe(false);
  });

  it('詞綴 Tier 高於門檻就保留', () => {
    const good = equip(1, { affixes: [{ type: 'attack_power', tier: 6, value: 17 }] } as Partial<EquipmentInstance>);
    const plain = equip(1, { affixes: [{ type: 'attack_power', tier: 3, value: 10 }] } as Partial<EquipmentInstance>);
    expect(matchesEquipmentFilter(good, { affixTierAbove: 5 }, 'knight')).toBe(true);
    expect(matchesEquipmentFilter(plain, { affixTierAbove: 5 }, 'knight')).toBe(false);
  });

  it('指定詞綴就保留', () => {
    const item = equip(1, { affixes: [{ type: 'crit_rate', tier: 2, value: 7 }] } as Partial<EquipmentInstance>);
    expect(matchesEquipmentFilter(item, { affixTypes: ['crit_rate'] }, 'knight')).toBe(true);
    expect(matchesEquipmentFilter(item, { affixTypes: ['attack_power'] }, 'knight')).toBe(false);
  });

  it('本職業可裝備就保留（沒標職業的是全職業共用，也算可裝備）', () => {
    const knightOnly = equip(1, { requiredClass: ['knight'] });
    const elfOnly = equip(1, { requiredClass: ['elf'] });
    const anyClass = equip(1);
    expect(matchesEquipmentFilter(knightOnly, { classUsable: true }, 'knight')).toBe(true);
    expect(matchesEquipmentFilter(elfOnly, { classUsable: true }, 'knight')).toBe(false);
    expect(matchesEquipmentFilter(anyClass, { classUsable: true }, 'knight')).toBe(true);
  });

  it('指定裝備類型就保留', () => {
    expect(matchesEquipmentFilter(equip(1), { equipTypes: ['sword'] }, 'knight')).toBe(true);
    expect(matchesEquipmentFilter(equip(3), { equipTypes: ['sword'] }, 'knight')).toBe(false);
  });

  it('白名單模板一律保留', () => {
    expect(matchesEquipmentFilter(equip(1), { templateIds: [1] }, 'knight')).toBe(true);
  });

  it('多條保留條件是 OR：符合任一就保留', () => {
    const item = equip(3, { requiredClass: ['elf'] });
    expect(matchesEquipmentFilter(item, { classUsable: true, equipTypes: ['armor'] }, 'knight')).toBe(true);
  });

  it('保留條件會把裝備從販售清單濾掉', () => {
    const c = ctx({ inventory: [equip(3, { requiredClass: ['knight'] }), equip(3, { id: 999, requiredClass: ['elf'] })] });
    const picked = collectVillageSellEquipment(
      { type: 'sell_equipment', maxTier: 6, keep: { classUsable: true } },
      c,
    );
    expect(picked.map(i => i.id)).toEqual([999]);
  });
});

describe('讀檔防線', () => {
  it('形狀不對就整份重置成空腳本（不會讀到壞資料就亂買亂賣）', () => {
    expect(normalizeVillageRules([{ id: 'x', action: { type: 'return_town' } }])).toEqual([]);
    expect(normalizeVillageRules('nonsense')).toEqual([]);
    expect(normalizeVillageRules(undefined)).toEqual([]);
  });

  it('現行格式原樣保留', () => {
    const rules = [rule({ type: 'return_town' })];
    expect(normalizeVillageRules(rules)).toEqual(rules);
  });
});
