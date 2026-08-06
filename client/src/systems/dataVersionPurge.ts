import { db } from '../db/database';
import { CURRENT_DATA_VERSION } from '../config';
import { buildCharacterArchive, buildSharedWarehouseArchive } from './legacyArchive';

/**
 * 資料版本淘汰：`CURRENT_DATA_VERSION` 提高後，清除所有低於該版本的角色與其全部附屬資料。
 *
 * 這是「一次性打掉重來」的唯一開關 —— 改 `config.ts` 的 `CURRENT_DATA_VERSION` 即可觸發，
 * 不需要動 Dexie 的 schema 版本（那是給結構遷移用的，兩者互相獨立）。
 *
 * 必須把附屬資料一起清乾淨，否則：
 * - 會留下永遠不會被讀取的孤兒列
 * - 新角色取得相同的自增 id 時，會撿到上一個角色的裝備與背包
 */

/** 共用倉庫為帳號層級，與角色的 dataVersion 無關，故僅在該帳號「所有角色都被淘汰」時才清除 */
async function purgeSharedWarehouse(userId: number, dataVersion: number): Promise<void> {
  const remaining = await db.characters.where('userId').equals(userId).count();
  if (remaining > 0) return;

  // 先封存再刪除（§ 45.1）
  const archive = await buildSharedWarehouseArchive(userId, dataVersion);
  if (archive) await db.legacyArchives.add(archive);

  await db.warehouses.where('userId').equals(userId).delete();
  // 金幣自 v16 起在獨立表（§ 18.7），不會被上面那行帶走
  await db.warehouseGold.delete(userId);
  // 共用倉庫的裝備實例是掛在 ownerId = userId（非 characterId），需另外清除
  await db.equipmentInstances
    .where('ownerId').equals(userId)
    .filter(item => item.inStorage === true && item.storageType === 'shared')
    .delete();
}

function removeLocalStorageKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 無痕模式等取不到 localStorage 時忽略，不可讓清除流程中斷
  }
}

/** 清除單一角色與其附屬資料（不含帳號層級的共用倉庫） */
async function purgeCharacter(characterId: number, characterUuid?: string): Promise<void> {
  await db.equipmentInstances.where('ownerId').equals(characterId).delete();
  await db.characterBag.where('characterId').equals(characterId).delete();
  await db.characterStorage.where('characterId').equals(characterId).delete();
  // 個人倉庫（storageType === 'personal'）以 characterId 綁定
  await db.warehouses.where('characterId').equals(characterId).delete();
  await db.characters.delete(characterId);

  removeLocalStorageKey(`mayana_prefs_${characterId}`);
  if (characterUuid) removeLocalStorageKey(`mayana_stats_upload_${characterUuid}`);
}

/**
 * 掃描並清除所有 `dataVersion` 低於 `CURRENT_DATA_VERSION` 的角色。
 * 回傳被清除的角色數量。開機時呼叫一次，讓玩家直接看到空的角色選擇畫面，
 * 而不是「點下去角色才消失」。
 */
export async function purgeOutdatedData(): Promise<number> {
  const outdated = await db.characters
    .filter(char => !char.dataVersion || char.dataVersion < CURRENT_DATA_VERSION)
    .toArray();
  if (outdated.length === 0) return 0;

  const affectedUsers = new Map<number, number>();
  for (const char of outdated) {
    if (char.id == null) continue;
    affectedUsers.set(char.userId, char.dataVersion ?? 0);

    // 先封存成純文字快照，寫入成功才刪除原始資料（§ 45.1）。
    // 封存失敗時保留原資料 —— 寧可讓玩家看到過期角色，也不要無聲地毀掉他的成果。
    const archive = await buildCharacterArchive(char);
    await db.legacyArchives.add(archive);

    await purgeCharacter(char.id, char.uuid);
  }

  for (const [userId, dataVersion] of affectedUsers) {
    await purgeSharedWarehouse(userId, dataVersion);
  }

  return outdated.length;
}
