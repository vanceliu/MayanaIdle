import { db } from '../database';
export { MONSTER_SEEDS } from './monsterSeeds';
export { EQUIPMENT_SEEDS } from './equipmentSeeds';
export { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './dropSeeds';
export { ITEM_DEFINITIONS } from './itemSeeds';

import { MONSTER_SEEDS } from './monsterSeeds';
import { EQUIPMENT_SEEDS } from './equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './dropSeeds';
import { ITEM_DEFINITIONS } from './itemSeeds';
import { purgeStaleEquipmentTemplates } from './purgeStaleTemplates';

let seedPromise: Promise<void> | null = null;

export function seedDatabase(): Promise<void> {
  if (!seedPromise) {
    seedPromise = performSeed();
  }
  return seedPromise;
}

export function resetSeedState(): void {
  seedPromise = null;
}

async function performSeed(): Promise<void> {
  await db.monsterTemplates.bulkPut(MONSTER_SEEDS as any);
  await db.equipmentTemplates.bulkPut(EQUIPMENT_SEEDS as any);
  // bulkPut 只覆寫不刪除，換過 id 的裝備會留下同名孤兒列，查表就會撈到舊數值
  const purged = await purgeStaleEquipmentTemplates();
  if (purged.removedTemplateIds.length > 0) {
    console.info(
      `[seed] 清除過時裝備模板 ${purged.removedTemplateIds.length} 筆`
      + `（實例改指 ${purged.remappedInstances}、刪除 ${purged.removedInstances}）`,
    );
  }
  await db.dropTables.clear();
  await db.dropTables.bulkAdd(DROP_TABLE_SEEDS as any);
  await db.bossDropTables.clear();
  await db.bossDropTables.bulkAdd(BOSS_DROP_TABLE_SEEDS as any);
  await db.itemTemplates.bulkPut(ITEM_DEFINITIONS as any);
}
