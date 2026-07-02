import { db } from '../database';
export { MONSTER_SEEDS } from './monsterSeeds';
export { EQUIPMENT_SEEDS } from './equipmentSeeds';
export { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './dropSeeds';
export { ITEM_DEFINITIONS } from './itemSeeds';

import { MONSTER_SEEDS } from './monsterSeeds';
import { EQUIPMENT_SEEDS } from './equipmentSeeds';
import { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './dropSeeds';
import { ITEM_DEFINITIONS } from './itemSeeds';

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
  await db.dropTables.clear();
  await db.dropTables.bulkAdd(DROP_TABLE_SEEDS as any);
  await db.bossDropTables.clear();
  await db.bossDropTables.bulkAdd(BOSS_DROP_TABLE_SEEDS as any);
  await db.itemTemplates.bulkPut(ITEM_DEFINITIONS as any);
}
