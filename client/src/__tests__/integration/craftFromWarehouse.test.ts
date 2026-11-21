/**
 * 製作取用倉庫（`06-equipment-acquire.md` § 6A.3「取用來源」）——
 * 素材依背包 → 個人倉庫 → 帳號倉庫扣，前置裝備由玩家指定、可在倉庫。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { getBagItemAmount } from '../../models/bagItem';
import { craftRequiresAbility, getAbilityCommonPool } from '../../models/ability';

const RECIPE = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 5 && t.craftPrerequisiteWeapon)!;
const PREREQ = EQUIPMENT_SEEDS.find(t => t.id === RECIPE.craftPrerequisiteWeapon!.templateId)!;
const ABILITY = craftRequiresAbility(RECIPE) ? getAbilityCommonPool(RECIPE)[0] : undefined;

const character = () => ({
  name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 1_000_000, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
}) as never;

function prereq(id: number, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return resolveEquipment({
    id, templateId: PREREQ.id!, name: PREREQ.name, type: PREREQ.type, slot: PREREQ.slot, isTwoHanded: PREREQ.isTwoHanded,
    quality: 0, enhancement: 0, affixes: [], affixSlots: 4, ownerId: 1, equipped: false, ...over,
  } as EquipmentInstance);
}

function setup(over: Record<string, unknown> = {}) {
  useGameStore.setState({
    character: character(), equippedGear: {}, craftQuests: [],
    bagItems: [], inventory: [],
    personalStoredMaterials: [], personalStoredEquipment: [],
    storedMaterials: [], storedEquipment: [],
    ...over,
  });
}

const craft = (ids?: number[]) => useGameStore.getState().craftEquipment(RECIPE.id!, ABILITY, ids);

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
});

describe('製作取用倉庫', () => {
  it('素材依背包 → 個人倉庫 → 帳號倉庫扣；前置可指定帳號倉庫的那件', async () => {
    const [first, ...rest] = (RECIPE as EquipmentTemplate).craftMaterials!;
    setup({
      bagItems: [bagItemById(first.itemId, 1), ...rest.map(m => bagItemById(m.itemId, m.amount))],
      personalStoredMaterials: [bagItemById(first.itemId, 1)],
      storedMaterials: [bagItemById(first.itemId, first.amount)],
      inventory: [prereq(11)],
      storedEquipment: [prereq(12, { inStorage: true, storageType: 'shared' })],
    });

    const result = await craft([12]);

    expect(result.ok).toBe(true);
    const s = useGameStore.getState();
    expect(getBagItemAmount(s.bagItems, first.itemId)).toBe(0);
    expect(getBagItemAmount(s.personalStoredMaterials, first.itemId)).toBe(0);
    expect(getBagItemAmount(s.storedMaterials, first.itemId)).toBe(2);
    for (const m of rest) expect(getBagItemAmount(s.bagItems, m.itemId)).toBe(0);
    expect(s.storedEquipment).toEqual([]);
    expect(s.inventory.map(i => i.id)).toContain(11);
    expect(s.inventory.some(i => i.templateId === RECIPE.id)).toBe(true);
  });

  it('前置在個人倉庫也可指定', async () => {
    setup({
      bagItems: RECIPE.craftMaterials!.map(m => bagItemById(m.itemId, m.amount)),
      personalStoredEquipment: [prereq(21, { inStorage: true, storageType: 'personal' })],
    });

    expect((await craft([21])).ok).toBe(true);
    expect(useGameStore.getState().personalStoredEquipment).toEqual([]);
  });

  it('未指定前置裝備時拒絕，不扣任何東西', async () => {
    const bag = RECIPE.craftMaterials!.map(m => bagItemById(m.itemId, m.amount));
    setup({ bagItems: bag, inventory: [prereq(11)] });

    expect(await craft()).toEqual({ ok: false, message: '請選擇前置裝備' });
    expect(useGameStore.getState().bagItems).toEqual(bag);
    expect(useGameStore.getState().inventory.map(i => i.id)).toEqual([11]);
  });

  it('背包＋兩個倉庫合計不足時拒絕', async () => {
    const [first, ...rest] = RECIPE.craftMaterials!;
    setup({
      bagItems: [bagItemById(first.itemId, first.amount - 1), ...rest.map(m => bagItemById(m.itemId, m.amount))],
      inventory: [prereq(11)],
    });

    expect(await craft([11])).toEqual({ ok: false, message: '材料不足' });
  });
});
