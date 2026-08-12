import type { TalentSlotTier } from './talent';

/**
 * 系統信箱（`52-mailbox.md`）
 *
 * **首版只做天賦格發放**（§ 52.0）。里程碑、補償、道具／金幣／鑲材型別、
 * 更新公告分頁的設計都已定案但不實作，型別預留位置以免之後要改形狀。
 */

/** 發放項目的型別（§ 52.3）。首版只用到 `talent_slot` */
export type MailItemType = 'talent_slot' | 'item' | 'gold' | 'talent_affix';

export interface MailItem {
  type: MailItemType;
  /** `talent_slot` 用 */
  slotTier?: TalentSlotTier;
  /** `item` 用。存 id 不存名稱（§ 99.1 第 7 條） */
  itemId?: number;
  /** `item` / `gold` 用 */
  amount?: number;
  /** `talent_affix` 用 */
  affixDefId?: number;
  /** `talent_affix` 用：指定型／池型的綁定值 */
  boundParam?: string | null;
}

export interface Mail {
  id?: number;
  characterId: number;
  /**
   * 發放來源鍵。**對 `characterId` 唯一** —— 重複發放靠它擋。
   * 沒有這個鍵，開檔掃描會在每次載入時重發。
   */
  sourceKey: string;
  title: string;
  items: MailItem[];
  createdAt: number;
  /** 領取時間。**null ＝ 未領取** */
  claimedAt: number | null;
}

/**
 * 天賦格發放的 `sourceKey`（§ 52.2）。
 *
 * 以「第幾次發放」為鍵而不是等級，等級表若之後改間隔也不會與舊鍵撞號。
 */
export function talentSlotGrantKey(grantIndex: number): string {
  return `talent-slot-${grantIndex}`;
}

/**
 * 起始鑲材補發的 `sourceKey`（§ 52.5）。
 *
 * 以「補哪一版的起始配置」為鍵：起始配置之後再改，換一個編號就是新的一批，
 * 不會與已經補過的撞號、也不會漏補。
 */
export function startingAffixBackfillKey(revision: number): string {
  return `starting-affix-backfill-${revision}`;
}

export function isClaimed(mail: Mail): boolean {
  return mail.claimedAt !== null;
}

/**
 * 換版清理（§ 52.7.1）：只刪**已領取**的。
 *
 * **未領取的一律保留，不分來源** —— 天賦格每 5 級發一封，
 * 刪掉未領取的等於讓玩家永久少一個格子，而且他不會知道。
 */
export function shouldPurgeOnVersionChange(mail: Mail): boolean {
  return isClaimed(mail);
}
