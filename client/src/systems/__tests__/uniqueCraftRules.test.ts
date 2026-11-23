import { describe, it, expect } from 'vitest';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { makeBagItem } from '../../models/bagItem';
import type { Ability } from '../../models/ability';
import { getParamFields, sanitizeParams } from '../../models/talentParams';
import type { VillageAction } from '../../models/villageScript';
import {
  acceptCraftQuest, evaluateCraftRequirements, getCraftQuestKind, hasCraftQuestFor, listCraftPrerequisiteOptions,
  removeCraftQuestByTemplate, type CraftSources,
} from '../craftQuestSystem';
import { getDismantleOutcome, getDismantleYield } from '../crafting';
import { collectVillageDismantle, type VillageScriptContext } from '../villageScriptRunner';

const RECIPE = EQUIPMENT_SEEDS.find(t => t.tier === 4 && t.slot === 'rightHand' && t.uniqueCraftMaterials)!;

let nextId = 1;
const gear = (over: Partial<EquipmentInstance> = {}, tpl: EquipmentTemplate = RECIPE): EquipmentInstance => ({
  id: nextId++, templateId: tpl.id!, name: tpl.name, type: tpl.type, slot: tpl.slot, isTwoHanded: tpl.isTwoHanded,
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false, ...over,
});

function sources(equipment: EquipmentInstance[], withMaterials = true): CraftSources {
  const materials = withMaterials ? RECIPE.uniqueCraftMaterials!.map(m => makeBagItem(m.itemId, m.amount)!) : [];
  return {
    bag: { materials, equipment },
    personal: { materials: [], equipment: [] },
    shared: { materials: [], equipment: [] },
  };
}

describe('獨特配方需求評估（`36-quest-system.md` § 36.13.3）', () => {
  it('素材比對 uniqueCraftMaterials、前置為同模板 ×1、金幣為 craftGold', () => {
    const status = evaluateCraftRequirements(RECIPE, sources([gear()]), RECIPE.craftGold!, 'unique');
    expect(status.ready).toBe(true);
    expect(status.materials.map(m => m.itemId)).toEqual(RECIPE.uniqueCraftMaterials!.map(m => m.itemId));
    expect(status.prerequisite).toEqual({ templateId: RECIPE.id, have: 1, need: 1, enough: true });
    expect(status.gold.need).toBe(RECIPE.craftGold);
  });

  it('(獨)、(擬)、身上裝備不算前置，但挑選清單列出 (獨)、(擬)', () => {
    const blocked = [gear({ isUniqueCraftedGear: true }), gear({ isMimicGear: true }), gear({ equipped: true })];
    const status = evaluateCraftRequirements(RECIPE, sources(blocked), RECIPE.craftGold!, 'unique');
    expect(status.prerequisite).toMatchObject({ have: 0, enough: false });
    expect(status.ready).toBe(false);
    expect(listCraftPrerequisiteOptions(RECIPE, sources(blocked), 'unique').map(c => c.item.id)).toEqual(blocked.slice(0, 2).map(g => g.id));
  });

  it('(鍛)、商店品可當前置；材料不足或金幣不足即未就緒', () => {
    const ok = sources([gear({ isCraftedGear: true }), gear({ maxAffixTier: 3 })]);
    expect(evaluateCraftRequirements(RECIPE, ok, RECIPE.craftGold!, 'unique').prerequisite?.have).toBe(2);
    expect(evaluateCraftRequirements(RECIPE, ok, RECIPE.craftGold! - 1, 'unique').ready).toBe(false);
    expect(evaluateCraftRequirements(RECIPE, sources([gear()], false), RECIPE.craftGold!, 'unique').ready).toBe(false);
  });

  it('一般配方的判定不受影響', () => {
    const status = evaluateCraftRequirements(RECIPE, sources([]), RECIPE.craftGold!);
    expect(status.materials.map(m => m.itemId)).toEqual(RECIPE.craftMaterials!.map(m => m.itemId));
  });
});

describe('製作追蹤資料', () => {
  it('舊資料沒有 unique 欄位＝一般配方；同模板兩種配方各自追蹤與移除', () => {
    const legacy = [{ id: `craft-${RECIPE.id}`, templateId: RECIPE.id! }];
    expect(getCraftQuestKind(legacy[0])).toBe('normal');
    const both = acceptCraftQuest(legacy, RECIPE.id!, 'unique')!;
    expect(both[1]).toEqual({ id: `craft-unique-${RECIPE.id}`, templateId: RECIPE.id, unique: true });
    expect(acceptCraftQuest(both, RECIPE.id!, 'unique')).toBeNull();
    expect(hasCraftQuestFor(both, RECIPE.id!, 'normal')).toBe(true);
    expect(removeCraftQuestByTemplate(both, RECIPE.id!, 'unique')).toEqual(legacy);
    expect(removeCraftQuestByTemplate(both, RECIPE.id!)).toEqual([both[1]]);
  });
});

describe('(獨) 的拆解（`06-equipment-acquire.md` § 6A.3「拆解」）', () => {
  const ability: Ability = { type: 'bonus_damage', params: { chance: 10, damage: 5 } };

  it('退一般配方 100%，不出結晶；掉落品照舊退一半並出結晶', () => {
    const unique = getDismantleOutcome(gear({ isUniqueCraftedGear: true, ability }), RECIPE);
    expect(unique.yields).toEqual(RECIPE.craftMaterials);
    expect(unique.crystal).toBeUndefined();
    const drop = getDismantleOutcome(gear({ ability }), RECIPE);
    expect(drop.yields).toEqual(getDismantleYield(RECIPE));
    expect(drop.crystal).toBeDefined();
  });
});

describe('補給天賦「拆解裝備」含製作品 (獨)（`49-village-script.md` § 49.4.1）', () => {
  const ctx = (inventory: EquipmentInstance[]): VillageScriptContext => ({
    className: 'knight', selfAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 }, gold: 0,
    bagItems: [], inventory, equippedIds: new Set(), templates: [RECIPE],
    bagUsedSlots: 10, bagMaxSlots: 50, inTown: true, lastHuntLocation: null, huntReturnPending: false,
    warehouse: { shared: { materials: [], equipment: [] }, personal: { materials: [], equipment: [] }, gold: 0 },
    bagFreeSlots: 40,
  });
  const action = (over: Partial<VillageAction> = {}): VillageAction => ({ type: 'dismantle_equipment', maxTier: 4, ...over });

  it('預設不拆，開啟才拆；與 (鍛) 開關各自獨立', () => {
    const unique = gear({ isUniqueCraftedGear: true });
    const crafted = gear({ isCraftedGear: true });
    const ids = (a: VillageAction) => collectVillageDismantle(a, ctx([unique, crafted])).map(p => p.item.id);
    expect(ids(action())).toEqual([]);
    expect(ids(action({ includeCrafted: true }))).toEqual([crafted.id]);
    expect(ids(action({ includeUniqueCrafted: true }))).toEqual([unique.id]);
    expect(collectVillageDismantle(action({ includeUniqueCrafted: true }), ctx([unique]))[0].yields).toEqual(RECIPE.craftMaterials);
  });

  it('參數欄位排在「含製作品 (鍛)」之後，預設關；server 驗證只收布林', () => {
    const keys = getParamFields('dismantle_equipment').map(f => f.key);
    expect(keys.indexOf('includeUniqueCrafted')).toBe(keys.indexOf('includeCrafted') + 1);
    expect(getParamFields('dismantle_equipment').find(f => f.key === 'includeUniqueCrafted')).toMatchObject({ kind: 'boolean', def: false, label: '含製作品 (獨)' });
    expect(sanitizeParams('dismantle_equipment', { maxTier: 5, includeUniqueCrafted: true })).toEqual({ maxTier: 5, includeUniqueCrafted: true });
    expect(sanitizeParams('dismantle_equipment', { maxTier: 5, includeUniqueCrafted: 'yes' })).toBeNull();
  });
});
