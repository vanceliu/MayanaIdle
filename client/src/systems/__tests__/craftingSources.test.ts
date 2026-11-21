import { describe, it, expect } from 'vitest';
import { drawCraftMaterials, pickCraftPrerequisites } from '../crafting';
import type { CraftSources } from '../craftQuestSystem';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { bagItemById } from '../../testing/bagFixtures';

/** 製作取用倉庫（`06-equipment-acquire.md` § 6A.3「取用來源」） */
const RECIPE = {
  id: 9002,
  name: '測試劍改',
  type: 'sword',
  craftMaterials: [{ itemId: 11, amount: 5 }],
  craftPrerequisiteWeapon: { templateId: 9001, quantity: 1 },
} as EquipmentTemplate;

const sword = (id: number, templateId = 9001) => ({ id, templateId, name: 'x' }) as EquipmentInstance;

function sources(): CraftSources {
  return {
    bag: { materials: [bagItemById(11, 2)], equipment: [sword(1)] },
    personal: { materials: [bagItemById(11, 2)], equipment: [sword(2)] },
    shared: { materials: [bagItemById(11, 4)], equipment: [sword(3), sword(4, 8888)] },
  };
}

describe('drawCraftMaterials', () => {
  it('依背包 → 個人倉庫 → 帳號倉庫的順序扣', () => {
    const drawn = drawCraftMaterials(RECIPE.craftMaterials!, sources());

    expect(drawn.bag).toEqual([]);
    expect(drawn.personal).toEqual([]);
    expect(drawn.shared).toEqual([bagItemById(11, 3)]);
  });

  it('背包足夠時不動倉庫', () => {
    const s = sources();
    s.bag.materials = [bagItemById(11, 6)];
    const drawn = drawCraftMaterials(RECIPE.craftMaterials!, s);

    expect(drawn.bag).toEqual([bagItemById(11, 1)]);
    expect(drawn.personal).toBe(s.personal.materials);
    expect(drawn.shared).toBe(s.shared.materials);
  });

  it('三處合計不足時丟錯', () => {
    expect(() => drawCraftMaterials([{ itemId: 11, amount: 9 }], sources())).toThrow();
  });
});

describe('pickCraftPrerequisites', () => {
  it('可指定倉庫裡的前置裝備', () => {
    expect(pickCraftPrerequisites(RECIPE, sources(), [3])).toEqual([{ source: 'shared', item: sword(3) }]);
  });

  it('未指定、件數不符、重複或模板不符時回 null', () => {
    expect(pickCraftPrerequisites(RECIPE, sources(), undefined)).toBeNull();
    expect(pickCraftPrerequisites(RECIPE, sources(), [])).toBeNull();
    expect(pickCraftPrerequisites(RECIPE, sources(), [1, 2])).toBeNull();
    expect(pickCraftPrerequisites({ ...RECIPE, craftPrerequisiteWeapon: { templateId: 9001, quantity: 2 } }, sources(), [1, 1])).toBeNull();
    expect(pickCraftPrerequisites(RECIPE, sources(), [4])).toBeNull();
    expect(pickCraftPrerequisites(RECIPE, sources(), [99])).toBeNull();
  });

  it('配方無前置時回空陣列', () => {
    const { craftPrerequisiteWeapon: _, ...noPrereq } = RECIPE;
    expect(pickCraftPrerequisites(noPrereq as EquipmentTemplate, sources(), undefined)).toEqual([]);
  });
});
