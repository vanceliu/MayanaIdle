import { describe, it, expect } from 'vitest';
import {
  evaluateCraftRequirements,
  acceptCraftQuest,
  abandonCraftQuest,
  removeCraftQuestByTemplate,
  hasCraftQuestFor,
} from '../craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';
import type { CraftQuest } from '../../models/craftQuest';
import type { EquipmentTemplate, EquipmentInstance } from '../../models/equipment';
import { bagItemById } from '../../testing/bagFixtures';

/**
 * 製作任務（`36-quest-system.md` § 36.13）
 *
 * 需求判定用手捏的 template，不綁 seed —— 這裡驗的是判定規則本身，
 * 配方數值改動不該讓這組測試變紅。
 */
const RECIPE: EquipmentTemplate = {
  id: 9001,
  name: '測試劍',
  type: 'sword',
  slot: 'rightHand',
  isTwoHanded: false,
  buyPrice: 0,
  craftGold: 50000,
  craftMaterials: [
    { itemId: 11, amount: 4 },
    { itemId: 12, amount: 3 },
  ],
} as EquipmentTemplate;

const RECIPE_WITH_PREREQ: EquipmentTemplate = {
  ...RECIPE,
  id: 9002,
  name: '測試劍改',
  craftPrerequisiteWeapon: { templateId: 9001, quantity: 2 },
};

const fullBag = () => [bagItemById(11, 10), bagItemById(12, 10)];

function equipInstance(templateId: number, id: number): EquipmentInstance {
  return { id, templateId, name: 'x', type: 'sword', slot: 'rightHand', isTwoHanded: false } as EquipmentInstance;
}

describe('evaluateCraftRequirements（§ 36.13.3 完成判定）', () => {
  it('素材、金幣、前置皆滿足時 ready 為 true', () => {
    const status = evaluateCraftRequirements(RECIPE_WITH_PREREQ, fullBag(), [
      equipInstance(9001, 1), equipInstance(9001, 2),
    ], 50000);

    expect(status.ready).toBe(true);
    expect(status.materials.every(m => m.enough)).toBe(true);
    expect(status.gold.enough).toBe(true);
    expect(status.prerequisite?.enough).toBe(true);
  });

  it('素材不足時 ready 為 false，且逐項標出缺哪一種', () => {
    const status = evaluateCraftRequirements(RECIPE, [bagItemById(11, 10), bagItemById(12, 1)], [], 50000);

    expect(status.ready).toBe(false);
    expect(status.materials.find(m => m.itemId === 11)!.enough).toBe(true);
    const lacking = status.materials.find(m => m.itemId === 12)!;
    expect(lacking.enough).toBe(false);
    expect(lacking.have).toBe(1);
    expect(lacking.need).toBe(3);
  });

  it('金幣不足時 ready 為 false（素材全滿也一樣）', () => {
    const status = evaluateCraftRequirements(RECIPE, fullBag(), [], 100);

    expect(status.ready).toBe(false);
    expect(status.materials.every(m => m.enough)).toBe(true);
    expect(status.gold).toEqual({ have: 100, need: 50000, enough: false });
  });

  it('前置裝備不足時 ready 為 false', () => {
    const status = evaluateCraftRequirements(RECIPE_WITH_PREREQ, fullBag(), [equipInstance(9001, 1)], 50000);

    expect(status.ready).toBe(false);
    expect(status.prerequisite).toEqual({ templateId: 9001, have: 1, need: 2, enough: false });
  });

  it('前置以 templateId 比對，同名但不同模板不算數（§ 99.1 第 3 條）', () => {
    const status = evaluateCraftRequirements(RECIPE_WITH_PREREQ, fullBag(), [
      equipInstance(8888, 1), equipInstance(8888, 2),
    ], 50000);

    expect(status.prerequisite!.have).toBe(0);
    expect(status.ready).toBe(false);
  });

  it('沒有前置需求的配方，prerequisite 為 null 且不影響 ready', () => {
    const status = evaluateCraftRequirements(RECIPE, fullBag(), [], 50000);

    expect(status.prerequisite).toBeNull();
    expect(status.ready).toBe(true);
  });

  it('不可製作的模板（無 craftMaterials）永遠 ready 為 false', () => {
    const notCraftable = { id: 9003, name: '掉落劍', buyPrice: 0 } as EquipmentTemplate;
    const status = evaluateCraftRequirements(notCraftable, fullBag(), [], 999999);

    expect(status.ready).toBe(false);
  });
});

describe('接取與取消（§ 36.13.2 / § 36.13.5）', () => {
  it('接取後任務只存 templateId，不存名稱', () => {
    const quests = acceptCraftQuest([], 9001)!;

    expect(quests).toHaveLength(1);
    expect(quests[0].templateId).toBe(9001);
    expect(Object.keys(quests[0]).sort()).toEqual(['id', 'templateId']);
  });

  it(`上限 ${MAX_ACTIVE_CRAFT_QUESTS} 個，滿了回傳 null`, () => {
    let quests: CraftQuest[] = [];
    for (let i = 0; i < MAX_ACTIVE_CRAFT_QUESTS; i++) {
      quests = acceptCraftQuest(quests, 9000 + i)!;
    }

    expect(quests).toHaveLength(MAX_ACTIVE_CRAFT_QUESTS);
    expect(acceptCraftQuest(quests, 9999)).toBeNull();
  });

  it('同一配方只能登記一張', () => {
    const quests = acceptCraftQuest([], 9001)!;

    expect(acceptCraftQuest(quests, 9001)).toBeNull();
    expect(hasCraftQuestFor(quests, 9001)).toBe(true);
    expect(hasCraftQuestFor(quests, 9002)).toBe(false);
  });

  it('取消只移除指定任務，其他保留', () => {
    let quests = acceptCraftQuest([], 9001)!;
    quests = acceptCraftQuest(quests, 9002)!;

    const after = abandonCraftQuest(quests, quests[0].id);

    expect(after).toHaveLength(1);
    expect(after[0].templateId).toBe(9002);
  });

  it('製作成功依 templateId 移除任務；沒登記過時是 no-op', () => {
    const quests = acceptCraftQuest([], 9001)!;

    expect(removeCraftQuestByTemplate(quests, 9001)).toHaveLength(0);
    expect(removeCraftQuestByTemplate(quests, 9002)).toHaveLength(1);
    expect(removeCraftQuestByTemplate([], 9001)).toHaveLength(0);
  });
});
