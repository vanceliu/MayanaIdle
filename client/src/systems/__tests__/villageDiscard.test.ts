import { describe, it, expect } from 'vitest';
import { evaluateVillageScript, collectDiscardEquipment, type VillageScriptContext } from '../villageScriptRunner';
import { getTemplateSellPrice } from '../shop';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { Attributes } from '../../models/attributes';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import type { VillageAction } from '../../models/villageScript';

/** 補給天賦「丟棄裝備」（`49-village-script.md` § 49.4.2） */

const seed = (pred: (t: EquipmentTemplate) => boolean) => EQUIPMENT_SEEDS.find(pred)!;
const STARTER = seed(t => t.acquireType === 'starter');
const SHOP_T2 = seed(t => t.acquireType === 'shop' && t.tier === 2 && t.slot === 'rightHand');
const T7_DROP = seed(t => t.acquireType === 'drop_only' && t.tier === 7 && t.slot === 'rightHand');
const TEMPLATES = [STARTER, SHOP_T2, T7_DROP];

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
    className: 'knight', selfAttributes: ATTRS, gold: 0, bagItems: [], inventory: [],
    equippedIds: new Set(), templates: TEMPLATES, bagUsedSlots: 10, bagMaxSlots: 50, inTown: false,
    lastHuntLocation: null, huntReturnPending: false,
    warehouse: { shared: { materials: [], equipment: [] }, personal: { materials: [], equipment: [] }, gold: 0 },
    bagFreeSlots: 40,
    ...over,
  };
}

const discard = (over: Partial<VillageAction> = {}): VillageAction => ({ type: 'discard_equipment', maxTier: 7, ...over });
const ids = (action: VillageAction, c: VillageScriptContext) => collectDiscardEquipment(action, c).map(i => i.id);

describe('丟棄裝備', () => {
  const shop = equip(SHOP_T2);
  const drop = equip(T7_DROP);
  const inventory = [shop, drop];

  it('測試資料：商店裝賣得掉、T7 掉落品賣不掉', () => {
    expect(getTemplateSellPrice(SHOP_T2)).toBeGreaterThan(0);
    expect(getTemplateSellPrice(T7_DROP)).toBe(0);
  });

  it('丟哪些：預設賣不掉的；可選賣得掉的或都丟', () => {
    expect(ids(discard(), ctx({ inventory }))).toEqual([drop.id]);
    expect(ids(discard({ discardScope: 'sellable' }), ctx({ inventory }))).toEqual([shop.id]);
    expect(ids(discard({ discardScope: 'all' }), ctx({ inventory }))).toEqual([shop.id, drop.id]);
  });

  it('Tier 門檻以上不丟', () => {
    expect(ids(discard({ discardScope: 'all', maxTier: 3 }), ctx({ inventory }))).toEqual([shop.id]);
  });

  it('新手裝（含沒有旗標的創角新手裝）與已裝備不丟', () => {
    const flagged = equip(STARTER, { isStarterGear: true });
    const unflagged = equip(STARTER);
    const worn = equip(T7_DROP);
    expect(ids(discard({ discardScope: 'all' }), ctx({ inventory: [flagged, unflagged, worn], equippedIds: new Set([worn.id]) })))
      .toEqual([]);
  });

  it('保留條件命中的不丟', () => {
    const keepAction = discard({ discardScope: 'all', keep: { equipTypes: [SHOP_T2.type] } });
    expect(ids(keepAction, ctx({ inventory }))).not.toContain(shop.id);
  });

  it('野外也可執行', () => {
    const rules = [{ id: 'r', enabled: true, conditions: [], action: discard() }];
    expect(evaluateVillageScript(rules, ctx({ inventory, inTown: false }))?.type).toBe('discard_equipment');
    expect(evaluateVillageScript(rules, ctx({ inventory: [shop], inTown: false }))).toBeNull();
  });
});
