import type { TalentSlotTier } from './talent';

/** 系統信箱（`52-mailbox.md`）。首版只做天賦格發放與補償（§ 52.0） */

/**
 * 發放項目的型別（§ 52.3）。首版只用到 `talent_slot`。
 *
 * **沒有鑲材型別** —— 自動天賦的條件與動作一律內建，不經信箱發放
 * （`51-auto-talent.md` § 51.4.1）。
 */
export type MailItemType = 'talent_slot' | 'item' | 'gold';

export interface MailItem {
  type: MailItemType;
  /** `talent_slot` 用 */
  slotTier?: TalentSlotTier;
  /** `item` 用。存 id 不存名稱（§ 99.1 第 7 條） */
  itemId?: number;
  /** `item` / `gold` 用 */
  amount?: number;
}

export interface Mail {
  id?: number;
  characterId: number;
  /** 這封信是什麼（顯示與除錯用）。不是重複發放的防線，見 § 52.2.3 */
  sourceKey: string;
  title: string;
  items: MailItem[];
  createdAt: number;
  /** 領取時間。**null ＝ 未領取** */
  claimedAt: number | null;
}

/** 天賦格發放的 `sourceKey`（§ 52.2）。以第幾次發放為鍵 */
export function talentSlotGrantKey(grantIndex: number): string {
  return `talent-slot-${grantIndex}`;
}

export function isClaimed(mail: Mail): boolean {
  return mail.claimedAt !== null;
}

/** 換版清理（§ 52.7.1）：只刪已領取的 */
export function shouldPurgeOnVersionChange(mail: Mail): boolean {
  return isClaimed(mail);
}

/**
 * 重複發放的對帳（`52-mailbox.md` § 52.2.3.1）。
 * 同一個 `sourceKey` 只留一封，有領過的優先留；兩封以上領過才算多拿。
 */
export function planMailDedupe(mails: Mail[]): {
  drop: number[];
  extraClaims: Map<number, number>;
} {
  const byKey = new Map<string, Mail[]>();
  for (const mail of mails) {
    const key = `${mail.characterId}::${mail.sourceKey}`;
    const group = byKey.get(key);
    if (group) group.push(mail);
    else byKey.set(key, [mail]);
  }

  const drop: number[] = [];
  const extraClaims = new Map<number, number>();
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const claimed = group.filter(isClaimed);
    const survivor = claimed[0] ?? group[0];
    for (const mail of group) {
      if (mail.id !== survivor.id) drop.push(mail.id!);
    }
    const extra = Math.max(0, claimed.length - 1);
    if (extra > 0) {
      const cid = group[0].characterId;
      extraClaims.set(cid, (extraClaims.get(cid) ?? 0) + extra);
    }
  }
  return { drop, extraClaims };
}
