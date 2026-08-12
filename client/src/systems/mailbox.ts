/**
 * 系統信箱的發放與領取（`52-mailbox.md`）。
 *
 * **首版只發天賦格**（§ 52.0）。補償、里程碑與其他項目型別的設計已定案但不實作。
 */
import { db } from '../db/database';
import { SLOT_GRANT_LEVEL_INTERVAL, type TalentSlot, type TalentSlotTier } from '../models/talent';
import { talentSlotGrantKey, startingAffixBackfillKey, type Mail, type MailItem } from '../models/mailbox';

/**
 * 到這個等級為止「應該」收到幾封天賦格信。
 *
 * 用累計數而不是「升級事件」當依據：升級是遞迴的（一次可連升多級），
 * 而且事件漏掉就永遠補不回來。累計數每次載入都能重算，漏發自動補上。
 */
export function expectedTalentSlotGrants(level: number): number {
  return Math.floor(level / SLOT_GRANT_LEVEL_INTERVAL);
}

/**
 * 補齊天賦格發放信。回傳這次新發的封數。
 *
 * `sourceKey` 對 `characterId` 唯一（§ 52.2），所以重複呼叫安全 ——
 * 每次載入角色、每次升級都可以叫。
 */
export async function syncTalentSlotGrants(characterId: number, level: number): Promise<number> {
  const expected = expectedTalentSlotGrants(level);
  if (expected <= 0) return 0;

  const existing = await db.mailbox.where('characterId').equals(characterId).toArray();
  const haveKeys = new Set(existing.map(m => m.sourceKey));

  const pending: Mail[] = [];
  for (let i = 1; i <= expected; i++) {
    const key = talentSlotGrantKey(i);
    if (haveKeys.has(key)) continue;
    pending.push({
      characterId,
      sourceKey: key,
      title: `天賦格（Lv.${i * SLOT_GRANT_LEVEL_INTERVAL}）`,
      items: [{ type: 'talent_slot', slotTier: 1 }],
      createdAt: Date.now(),
      claimedAt: null,
    });
  }
  if (pending.length === 0) return 0;
  await db.mailbox.bulkAdd(pending);
  return pending.length;
}

/**
 * 起始配置改版的補發（§ 52.5）。
 *
 * 戰鬥起始從 1 條施放技能改成 3 條（`51-auto-talent.md` § 51.7），
 * 改版前建的角色少拿兩份 —— 走信箱補，不直接塞進背包：
 * 玩家要看得到「為什麼我多了東西」，靜悄悄多出兩份鑲材只會像 bug。
 *
 * 只補**改版前就存在**的角色：新角色由 `grantStartingIfEmpty` 直接給滿。
 * `sourceKey` 對 `characterId` 唯一，所以重複呼叫安全。
 */
export const STARTING_AFFIX_BACKFILL: {
  revision: number;
  title: string;
  items: MailItem[];
} = {
  revision: 1,
  title: '起始天賦調整補發',
  items: [
    { type: 'talent_affix', affixDefId: 2003, boundParam: null },
    { type: 'talent_affix', affixDefId: 2003, boundParam: null },
  ],
};

export async function syncStartingAffixBackfill(characterId: number): Promise<boolean> {
  const key = startingAffixBackfillKey(STARTING_AFFIX_BACKFILL.revision);
  const existing = await db.mailbox.where('characterId').equals(characterId).toArray();
  if (existing.some(m => m.sourceKey === key)) return false;

  // 天賦格一封都還沒發過＝這個角色是改版後才建的，起始就已經給滿
  const isNewCharacter = existing.length === 0
    && (await db.talentSlots.where('characterId').equals(characterId).count()) === 0;
  if (isNewCharacter) return false;

  await db.mailbox.add({
    characterId,
    sourceKey: key,
    title: STARTING_AFFIX_BACKFILL.title,
    items: STARTING_AFFIX_BACKFILL.items,
    createdAt: Date.now(),
    claimedAt: null,
  });
  return true;
}

export async function listMail(characterId: number): Promise<Mail[]> {
  const rows = await db.mailbox.where('characterId').equals(characterId).toArray();
  // 未領取在上，其餘照發放時間新到舊
  return rows.sort((a, b) => {
    if ((a.claimedAt === null) !== (b.claimedAt === null)) return a.claimedAt === null ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export function unclaimedCount(mails: Mail[]): number {
  return mails.filter(m => m.claimedAt === null).length;
}

/** 把一個發放項目變成實際資料。首版只處理天賦格與鑲材 */
async function grantItem(characterId: number, item: MailItem): Promise<void> {
  if (item.type === 'talent_slot') {
    const slot: TalentSlot = {
      characterId,
      tier: (item.slotTier ?? 1) as TalentSlotTier,
      // 領到的是**未安裝**狀態，躺在背包「天賦」分頁（§ 51.3.4）
      assignedType: null,
      templateId: null,
      order: null,
      enabled: true,
    };
    await db.talentSlots.add(slot);
    return;
  }
  if (item.type === 'talent_affix' && item.affixDefId !== undefined) {
    // 同樣是**未鑲入**狀態。指定型補發時不代綁，讓玩家自己選（§ 51.4.1）
    await db.talentAffixes.add({
      characterId,
      definitionId: item.affixDefId,
      boundParam: item.boundParam ?? null,
      params: null,
      slotId: null,
      slotIndex: null,
    });
  }
}

/**
 * 領取一封信。已領過回 false。
 *
 * 首版沒有道具型項目，因此不做背包容量檢查 —— 天賦格不佔格，一律放行（§ 52.0）。
 */
export async function claimMail(mailId: number): Promise<boolean> {
  return await db.transaction('rw', db.mailbox, db.talentSlots, db.talentAffixes, async () => {
    const mail = await db.mailbox.get(mailId);
    if (!mail || mail.claimedAt !== null) return false;
    for (const item of mail.items) {
      await grantItem(mail.characterId, item);
    }
    await db.mailbox.update(mailId, { claimedAt: Date.now() });
    return true;
  });
}

/** 全部領取。回傳實際領到的封數 */
export async function claimAll(characterId: number): Promise<number> {
  const mails = await db.mailbox.where('characterId').equals(characterId).toArray();
  let claimed = 0;
  for (const mail of mails) {
    if (mail.claimedAt !== null) continue;
    if (await claimMail(mail.id!)) claimed++;
  }
  return claimed;
}

/**
 * 換版清理（§ 52.7.1）：**只刪已領取的**。
 *
 * **未領取的一律保留，不分來源。** 天賦格每 5 級發一封；
 * 刪掉未領取的等於讓玩家永久少一個格子，而且他不會知道。
 */
export async function purgeClaimedMail(characterId: number): Promise<number> {
  const stale = await db.mailbox
    .where('characterId').equals(characterId)
    .filter(m => m.claimedAt !== null)
    .toArray();
  if (stale.length === 0) return 0;
  await db.mailbox.bulkDelete(stale.map(m => m.id!));
  return stale.length;
}

const PURGE_VERSION_KEY = 'mayana_mail_purged_version';

/**
 * 版本變了才清。回傳是否執行了清理。
 *
 * 綁 `BUILD_INFO.version`（顯示版本），**不可綁 `CURRENT_DATA_VERSION`** ——
 * 那個一升就把舊角色刪光（`19-account-character.md` § 19.9），沒有對象可清。
 */
export async function purgeClaimedMailOnVersionChange(
  characterId: number,
  currentVersion: string,
): Promise<boolean> {
  const key = `${PURGE_VERSION_KEY}_${characterId}`;
  const seen = localStorage.getItem(key);
  if (seen === currentVersion) return false;
  await purgeClaimedMail(characterId);
  localStorage.setItem(key, currentVersion);
  return true;
}
