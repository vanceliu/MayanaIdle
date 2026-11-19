/**
 * 遺產系統（`45-legacy-archive.md`）：版本淘汰時封存的唯讀紀錄。
 * `payload` 是封存當下的 JSON 字串，與遊玩中的資料結構脫鉤；讀取端缺欄位顯示「—」。
 */
export type LegacyArchiveType = 'character' | 'sharedWarehouse' | 'guild';

export interface LegacyArchiveSummary {
  id: number;
  type: LegacyArchiveType;
  /** 角色名稱、「帳號倉庫」或公會名稱 */
  label: string;
  className?: string;
  level?: number;
  /** 封存時的 server schema 版本 */
  dataVersion: number;
  /** 被封存的那一季；遺產頁以 `Season N` 分組 */
  season: number;
  archivedAt: number;
}

export interface LegacyArchive extends LegacyArchiveSummary {
  payload: string;
}
