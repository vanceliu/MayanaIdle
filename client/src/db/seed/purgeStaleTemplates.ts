import { db } from '../database';
import { EQUIPMENT_SEEDS } from './equipmentSeeds';

/**
 * 清掉過時的裝備模板。
 *
 * `performSeed` 用 `bulkPut` 寫入 seed，**只覆寫不刪除**，所以裝備換過 id 之後
 * 舊的那筆會永遠留在玩家的 IndexedDB 裡。同名兩筆的後果是查表撈到舊資料
 * （皮腰帶 id 70 `bonusWeight: 1000` vs id 593 `1700`），數值直接錯掉。
 *
 * 處理順序：
 * 1. 指向孤兒模板的裝備實例，若 seed 還有同名品項 → 改指新 id（玩家的東西保住，數值校正）
 * 2. 找不到同名 seed（該裝備已從遊戲移除）→ 連同實例一起刪除，
 *    否則實例會變成沒有任何數值的空殼（`toStorableInstance` 只存 templateId，不存 stat）
 * 3. 刪掉所有不在 seed 內的模板列
 *
 * 快捷鍵指向的是**實例 id**，實例被刪時 `QuickSlotBar` 找不到就自動失效，不需另外清。
 */
export interface PurgeStaleTemplatesResult {
  removedTemplateIds: number[];
  /** 改指到現行 seed 的實例數 */
  remappedInstances: number;
  /** 找不到對應品項而被刪掉的實例數 */
  removedInstances: number;
}

const EMPTY_RESULT: PurgeStaleTemplatesResult = {
  removedTemplateIds: [],
  remappedInstances: 0,
  removedInstances: 0,
};

export async function purgeStaleEquipmentTemplates(): Promise<PurgeStaleTemplatesResult> {
  const validIds = new Set(EQUIPMENT_SEEDS.map(t => t.id!));
  const seedIdByName = new Map(EQUIPMENT_SEEDS.map(t => [t.name, t.id!]));

  const stale = (await db.equipmentTemplates.toArray()).filter(t => !validIds.has(t.id!));
  if (stale.length === 0) return EMPTY_RESULT;

  let remappedInstances = 0;
  let removedInstances = 0;

  for (const template of stale) {
    const staleId = template.id!;
    const currentId = seedIdByName.get(template.name);
    const affected = db.equipmentInstances.where('templateId').equals(staleId);

    if (currentId != null) {
      remappedInstances += await affected.modify({ templateId: currentId });
    } else {
      removedInstances += await affected.delete();
    }
  }

  const removedTemplateIds = stale.map(t => t.id!);
  await db.equipmentTemplates.bulkDelete(removedTemplateIds);

  return { removedTemplateIds, remappedInstances, removedInstances };
}
