import { describe, it, expect } from 'vitest';
import {
  evaluateVillageScript,
  collectVillageDismantle,
  collectDepositItems,
  type VillageScriptContext,
} from '../villageScriptRunner';
import { getDismantleYield } from '../crafting';
import { abilityToCrystal } from '../../models/abilityCrystal';
import { makeBagItem, type BagItem } from '../../models/bagItem';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { Ability } from '../../models/ability';
import type { Attributes } from '../../models/attributes';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import type { VillageAction } from '../../models/villageScript';

/** 補給天賦「拆解裝備」「存入指定道具」（`49-village-script.md` § 49.3、§ 49.4.1） */

const seed = (pred: (t: EquipmentTemplate) => boolean) => EQUIPMENT_SEEDS.find(pred)!;
const T4_CRAFT = seed(t => t.acquireType === 'craft' && t.tier === 4 && t.slot === 'rightHand');
const T5_CRAFT = seed(t => t.acquireType === 'craft' && t.tier === 5 && t.slot === 'rightHand');
const T7_DROP = seed(t => t.acquireType === 'drop_only' && t.tier === 7 && t.slot === 'rightHand');
const TEMPLATES = [T4_CRAFT, T5_CRAFT, T7_DROP];

const RED_POTION = 1;
const TUSK = 19;

const WEAK: Ability = { type: 'bonus_damage', params: { chance: 5, damage: 5 } };
const STRONG: Ability = { type: 'bonus_damage', params: { chance: 10, damage: 5 } };

let nextId = 1;
function equip(template: EquipmentTemplate, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    id: nextId++, templateId: template.id, name: template.name, type: template.type, slot: template.slot,
    isTwoHanded: template.isTwoHanded, enhancement: 0, affixes: [], ...over,
  } as EquipmentInstance;
}

const ATTRS: Attributes = { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 };

function ctx(over: Partial<VillageScriptContext> = {}): VillageScriptContext {
  return {
    className: 'knight', selfAttributes: ATTRS, gold: 0,
    bagItems: [] as BagItem[], inventory: [], equippedIds: new Set(), templates: TEMPLATES,
    bagUsedSlots: 10, bagMaxSlots: 50, inTown: true,
    lastHuntLocation: null, huntReturnPending: false,
    warehouse: {
      shared: { materials: [], equipment: [] },
      personal: { materials: [], equipment: [] },
      gold: 0,
    },
    bagFreeSlots: 40,
    ...over,
  };
}

const dismantle = (over: Partial<VillageAction> = {}): VillageAction =>
  ({ type: 'dismantle_equipment', maxTier: 4, ...over });

const pickedIds = (action: VillageAction, c: VillageScriptContext) =>
  collectVillageDismantle(action, c).map(p => p.item.id);

describe('拆解裝備：Tier 門檻與硬保護', () => {
  it('只拆 Tier 門檻以下有配方的裝備，退還材料同手動拆解', () => {
    const t4 = equip(T4_CRAFT);
    const t5 = equip(T5_CRAFT);
    const picks = collectVillageDismantle(dismantle(), ctx({ inventory: [t4, t5] }));
    expect(picks.map(p => p.item.id)).toEqual([t4.id]);
    expect(picks[0].yields).toEqual(getDismantleYield(T4_CRAFT));
  });

  it('門檻 5 連 T5 一起拆', () => {
    const t4 = equip(T4_CRAFT);
    const t5 = equip(T5_CRAFT);
    expect(pickedIds(dismantle({ maxTier: 5 }), ctx({ inventory: [t4, t5] }))).toEqual([t4.id, t5.id]);
  });

  it('已裝備、新手裝不拆', () => {
    const worn = equip(T4_CRAFT);
    const starter = equip(T4_CRAFT, { isStarterGear: true });
    expect(pickedIds(dismantle(), ctx({ inventory: [worn, starter], equippedIds: new Set([worn.id]) }))).toEqual([]);
  });

  it('保留條件命中的不拆', () => {
    const keep = equip(T4_CRAFT, { affixes: [{ type: 'attack_power', tier: 6, value: 1 }] as unknown as EquipmentInstance['affixes'] });
    const plain = equip(T4_CRAFT);
    const action = dismantle({ keep: { affixTierAbove: 5 } });
    expect(pickedIds(action, ctx({ inventory: [keep, plain] }))).toEqual([plain.id]);
  });

  it('不在城鎮不可執行', () => {
    const rules = [{ id: 'r', enabled: true, conditions: [], action: dismantle() }];
    expect(evaluateVillageScript(rules, ctx({ inventory: [equip(T4_CRAFT)], inTown: false }))).toBeNull();
    expect(evaluateVillageScript(rules, ctx({ inventory: [equip(T4_CRAFT)] }))?.type).toBe('dismantle_equipment');
  });
});

describe('拆解裝備：掉落品與製作品開關', () => {
  it('無配方的帶技能掉落品要開啟開關，且仍受 Tier 門檻限制', () => {
    const drop = equip(T7_DROP, { ability: STRONG });
    expect(pickedIds(dismantle({ maxTier: 7 }), ctx({ inventory: [drop] }))).toEqual([]);
    expect(pickedIds(dismantle({ maxTier: 6, includeDropOnly: true }), ctx({ inventory: [drop] }))).toEqual([]);
    const picks = collectVillageDismantle(dismantle({ maxTier: 7, includeDropOnly: true }), ctx({ inventory: [drop] }));
    expect(picks).toHaveLength(1);
    expect(picks[0].yields).toEqual([]);
    expect(picks[0].crystal).toEqual(abilityToCrystal(STRONG, T7_DROP));
  });

  it('製作品 (鍛) 要開啟開關才拆，且不出結晶', () => {
    const crafted = equip(T4_CRAFT, { isCraftedGear: true, ability: STRONG });
    expect(pickedIds(dismantle(), ctx({ inventory: [crafted] }))).toEqual([]);
    const picks = collectVillageDismantle(dismantle({ includeCrafted: true }), ctx({ inventory: [crafted] }));
    expect(picks.map(p => p.item.id)).toEqual([crafted.id]);
    expect(picks[0].crystal).toBeUndefined();
  });
});

describe('拆解裝備：會出結晶的處理', () => {
  const owned = abilityToCrystal(WEAK, T4_CRAFT)!;

  it('新或更強才拆（預設）：已有同等或更好的結晶就跳過', () => {
    const same = equip(T4_CRAFT, { ability: WEAK });
    const better = equip(T4_CRAFT, { ability: STRONG });
    expect(pickedIds(dismantle(), ctx({ inventory: [same, better], abilityCrystals: [owned] }))).toEqual([better.id]);
  });

  it('同一輪依序比：兩件同強度只拆第一件', () => {
    const a = equip(T4_CRAFT, { ability: STRONG });
    const b = equip(T4_CRAFT, { ability: STRONG });
    expect(pickedIds(dismantle(), ctx({ inventory: [a, b] }))).toEqual([a.id]);
  });

  it('照拆：不看結晶', () => {
    const same = equip(T4_CRAFT, { ability: WEAK });
    expect(pickedIds(dismantle({ crystalMode: 'always' }), ctx({ inventory: [same], abilityCrystals: [owned] })))
      .toEqual([same.id]);
  });

  it('不拆：會出結晶的一律跳過，沒有技能的照拆', () => {
    const withAbility = equip(T4_CRAFT, { ability: STRONG });
    const plain = equip(T4_CRAFT);
    expect(pickedIds(dismantle({ crystalMode: 'never' }), ctx({ inventory: [withAbility, plain] }))).toEqual([plain.id]);
  });
});

describe('拆解裝備：背包格數', () => {
  const kinds = getDismantleYield(T4_CRAFT)!.length;

  it('退還的新材料放不下就跳過', () => {
    const item = equip(T4_CRAFT);
    expect(pickedIds(dismantle(), ctx({ inventory: [item], bagUsedSlots: 50 - kinds + 2, bagMaxSlots: 50 }))).toEqual([]);
    expect(pickedIds(dismantle(), ctx({ inventory: [item], bagUsedSlots: 50 - kinds + 1, bagMaxSlots: 50 }))).toEqual([item.id]);
  });

  it('同一輪已拆出的材料種類不再佔新格', () => {
    const a = equip(T4_CRAFT);
    const b = equip(T4_CRAFT);
    expect(pickedIds(dismantle(), ctx({ inventory: [a, b], bagUsedSlots: 50 - kinds + 1, bagMaxSlots: 50 }))).toEqual([a.id, b.id]);
  });
});

describe('存入指定道具', () => {
  const bag = [makeBagItem(RED_POTION, 30)!, makeBagItem(TUSK, 8)!];

  it('每組存「身上數量 − 留下數量」，沒超過的不存', () => {
    const action: VillageAction = {
      type: 'deposit_items', itemId: RED_POTION, keepAmount: 20, itemId2: TUSK, keepAmount2: 10,
    };
    expect(collectDepositItems(action, ctx({ bagItems: bag }))).toEqual([{ itemId: RED_POTION, amount: 10 }]);
  });

  it('留下數量未設＝全部存；同一道具重複只算第一組', () => {
    const action: VillageAction = { type: 'deposit_items', itemId: TUSK, itemId2: TUSK, keepAmount2: 0, itemId3: RED_POTION, keepAmount3: 25 };
    expect(collectDepositItems(action, ctx({ bagItems: bag }))).toEqual([
      { itemId: TUSK, amount: 8 },
      { itemId: RED_POTION, amount: 5 },
    ]);
  });

  it('全部未超過留下數量時不可執行', () => {
    const rules = [{ id: 'r', enabled: true, conditions: [], action: { type: 'deposit_items', itemId: RED_POTION, keepAmount: 30 } as VillageAction }];
    expect(evaluateVillageScript(rules, ctx({ bagItems: bag }))).toBeNull();
  });
});
