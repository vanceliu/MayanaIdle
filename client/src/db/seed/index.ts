/**
 * 靜態模板（`97-selfhosted-server.md` § 97.4）：隨程式碼發布，開機即在記憶體裡。
 * 沒有「把 seed 寫進資料庫」這道手續 —— server 啟動時載入 SQLite，client 直接用常數。
 */
export { MONSTER_SEEDS } from './monsterSeeds';
export { EQUIPMENT_SEEDS } from './equipmentSeeds';
export { DROP_TABLE_SEEDS, BOSS_DROP_TABLE_SEEDS } from './dropSeeds';
export { ITEM_DEFINITIONS } from './itemSeeds';
