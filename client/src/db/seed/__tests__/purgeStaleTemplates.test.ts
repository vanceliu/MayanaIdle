import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../database';
import { seedDatabase, resetSeedState } from '../index';
import { EQUIPMENT_SEEDS } from '../equipmentSeeds';
import { purgeStaleEquipmentTemplates } from '../purgeStaleTemplates';

/** 皮腰帶換過 id：舊 70（bonusWeight 1000）→ 現行 593（1700） */
const CURRENT_BELT = EQUIPMENT_SEEDS.find(t => t.name === '皮腰帶')!;
const STALE_BELT_ID = 70;
const REMOVED_ITEM_ID = 9001;

async function addStaleTemplate(id: number, name: string, bonusWeight?: number) {
  await db.equipmentTemplates.put({
    id,
    name,
    type: 'armor',
    slot: 'belt',
    isTwoHanded: false,
    defense: 0,
    bonusWeight,
    buyPrice: 5000,
    stability: -1,
  } as any);
}

async function addInstance(templateId: number, name: string): Promise<number> {
  return (await db.equipmentInstances.add({
    templateId,
    name,
    type: 'armor',
    slot: 'belt',
    isTwoHanded: false,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: true,
  } as any)) as number;
}

describe('purgeStaleEquipmentTemplates', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
  });

  it('剛 seed 完沒有孤兒模板，不動任何資料', async () => {
    const before = await db.equipmentTemplates.count();
    const result = await purgeStaleEquipmentTemplates();

    expect(result.removedTemplateIds).toHaveLength(0);
    expect(result.remappedInstances).toBe(0);
    expect(result.removedInstances).toBe(0);
    expect(await db.equipmentTemplates.count()).toBe(before);
  });

  it('刪掉不在 seed 內的模板，同名實例改指現行 id', async () => {
    await addStaleTemplate(STALE_BELT_ID, '皮腰帶', 1000);
    const instId = await addInstance(STALE_BELT_ID, '皮腰帶');

    const result = await purgeStaleEquipmentTemplates();

    expect(result.removedTemplateIds).toContain(STALE_BELT_ID);
    expect(result.remappedInstances).toBe(1);
    expect(result.removedInstances).toBe(0);

    expect(await db.equipmentTemplates.get(STALE_BELT_ID)).toBeUndefined();
    const inst = await db.equipmentInstances.get(instId);
    expect(inst!.templateId).toBe(CURRENT_BELT.id);

    // 改指之後拿到的是現行數值，不是舊表的 1000
    const template = await db.equipmentTemplates.get(inst!.templateId);
    expect(template!.bonusWeight).toBe(CURRENT_BELT.bonusWeight);
  });

  it('seed 內已無同名品項時，連實例一起刪除', async () => {
    await addStaleTemplate(REMOVED_ITEM_ID, '早就砍掉的腰帶', 999);
    const instId = await addInstance(REMOVED_ITEM_ID, '早就砍掉的腰帶');

    const result = await purgeStaleEquipmentTemplates();

    expect(result.removedTemplateIds).toContain(REMOVED_ITEM_ID);
    expect(result.removedInstances).toBe(1);
    expect(await db.equipmentTemplates.get(REMOVED_ITEM_ID)).toBeUndefined();
    expect(await db.equipmentInstances.get(instId)).toBeUndefined();
  });

  it('不會誤刪現行 seed 的模板與其實例', async () => {
    const instId = await addInstance(CURRENT_BELT.id!, '皮腰帶');
    await addStaleTemplate(STALE_BELT_ID, '皮腰帶', 1000);

    await purgeStaleEquipmentTemplates();

    expect(await db.equipmentTemplates.get(CURRENT_BELT.id!)).toBeDefined();
    const inst = await db.equipmentInstances.get(instId);
    expect(inst!.templateId).toBe(CURRENT_BELT.id);
  });

  it('seedDatabase 本身就會清掉孤兒模板', async () => {
    await addStaleTemplate(STALE_BELT_ID, '皮腰帶', 1000);
    const instId = await addInstance(STALE_BELT_ID, '皮腰帶');

    resetSeedState();
    await seedDatabase();

    expect(await db.equipmentTemplates.get(STALE_BELT_ID)).toBeUndefined();
    expect((await db.equipmentInstances.get(instId))!.templateId).toBe(CURRENT_BELT.id);
  });
});
