/**
 * 測試用的資料庫替身。
 *
 * 遊戲資料的正式持久層在 server（`97-selfhosted-server.md` § 97.5），
 * client 不再有 IndexedDB；測試仍需要一個能查驗「有沒有真的存進去」的地方，
 * 由 `MemoryDb` 擔任，並登記成本次測試的 `defaultSession.repo`。
 *
 * 每個測試檔各自一份（vitest 以檔為單位隔離模組），互不干擾。
 */
import { MemoryDb } from '../db/memoryDb';
import { MemoryRepository } from '../db/memoryRepository';
import { defaultSession } from '../stores/session';

export const db = new MemoryDb();
export const repo = new MemoryRepository(db);

defaultSession.repo = repo;

/** 清掉玩家資料，靜態模板留著（它們隨程式碼發布，不是測試造出來的） */
export function resetTestDb(): void {
  for (const table of db.playerTables) table.restore({ rows: new Map(), nextId: 1 });
  db.warehouseGold.replace(new Map());
  /*
   * 存檔的記帳也要歸零（§ 97.4）：資料庫被清空之後，
   * 「這張表上次寫進去的內容」那份簽章就成了謊話 —— 內容看起來沒變，
   * 於是該寫的表被跳過，下一個測試拿到的是空表。
   */
  defaultSession.loop.savedSig = {};
  defaultSession.loop.saveDirty = false;
  defaultSession.loop.saveAcc = 0;
}
