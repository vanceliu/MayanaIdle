/**
 * 系統信箱的發放與領取（`52-mailbox.md`）。
 * 首版做天賦格與補償，里程碑與道具／金幣型別不做（§ 52.0）。
 */
import { db } from '../db/database';
import { SLOT_GRANT_LEVEL_INTERVAL, type TalentSlot, type TalentSlotTier } from '../models/talent';
import { talentSlotGrantKey, type Mail, type MailItem } from '../models/mailbox';
import { COMPENSATIONS, isCompensationActive } from '../db/seed/compensations';

/** 到這個等級為止應該收到幾封天賦格信 */
export function expectedTalentSlotGrants(level: number): number {
  return Math.floor(level / SLOT_GRANT_LEVEL_INTERVAL);
}

/**
 * 補齊天賦格發放信。回傳這次新發的封數。
 * 依據是 `characters.talentSlotGrants`，不看信箱（§ 52.2.3）。
 */
export async function syncTalentSlotGrants(characterId: number, level: number): Promise<number> {
  const expected = expectedTalentSlotGrants(level);
  const character = await db.characters.get(characterId);
  if (!character) return 0;

  const issued = character.talentSlotGrants ?? 0;
  if (expected <= issued) return 0;

  const pending: Mail[] = [];
  for (let i = issued + 1; i <= expected; i++) {
    pending.push({
      characterId,
      sourceKey: talentSlotGrantKey(i),
      title: `天賦格（Lv.${i * SLOT_GRANT_LEVEL_INTERVAL}）`,
      items: [{ type: 'talent_slot', slotTier: 1 }],
      createdAt: Date.now(),
      claimedAt: null,
    });
  }
  // 發信與記數必須同一個交易（§ 52.2.3）
  await db.transaction('rw', db.mailbox, db.characters, async () => {
    await db.mailbox.bulkAdd(pending);
    await db.characters.update(characterId, { talentSlotGrants: expected });
  });
  return pending.length;
}

/**
 * 發放補償（§ 52.2.4）。回傳新發的封數。
 *
 * 發放 ＝ 補償清單與 `sentMailKeys` 的差集，再套版本範圍（§ 52.2.4）
 * 與 `createdAt < publishedAt`（§ 52.2.2）。
 */
export async function syncCompensations(
  characterId: number,
  currentVersion: string,
): Promise<number> {
  const character = await db.characters.get(characterId);
  if (!character) return 0;

  const sent = character.sentMailKeys ?? {};
  const due = COMPENSATIONS.filter(c =>
    !sent[c.id]
    && isCompensationActive(c, currentVersion)
    && character.createdAt < c.publishedAt);
  if (due.length === 0) return 0;

  const pending: Mail[] = due.map(c => ({
    characterId,
    sourceKey: c.id,
    title: c.title,
    items: c.items,
    createdAt: Date.now(),
    claimedAt: null,
  }));

  // 發信與記 key 必須同一個交易（§ 52.2.4.2）
  await db.transaction('rw', db.mailbox, db.characters, async () => {
    await db.mailbox.bulkAdd(pending);
    await db.characters.update(characterId, {
      sentMailKeys: { ...sent, ...Object.fromEntries(due.map(c => [c.id, true])) },
    });
  });
  return pending.length;
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

/** 把一個發放項目變成實際資料。首版處理天賦格與鑲材（§ 52.0） */
async function grantItem(characterId: number, item: MailItem): Promise<void> {
  if (item.type === 'talent_slot') {
    const slot: TalentSlot = {
      characterId,
      tier: (item.slotTier ?? 1) as TalentSlotTier,
      // 未安裝狀態（§ 51.3.4）
      assignedType: null,
      templateId: null,
      order: null,
      enabled: true,
    };
    await db.talentSlots.add(slot);
    return;
  }
  if (item.type === 'talent_affix' && item.affixDefId !== undefined) {
    // 未鑲入狀態。指定型不代綁，由玩家選（§ 51.4.1）
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

/** 領取一封信。已領過回 false。首版不做背包容量檢查（§ 52.0） */
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

/** 換版清理（§ 52.7.1）：只刪已領取的。發放紀錄不動 */
export async function purgeClaimedMail(characterId: number): Promise<number> {
  const stale = await db.mailbox
    .where('characterId').equals(characterId)
    .filter(m => m.claimedAt !== null)
    .toArray();
  if (stale.length === 0) return 0;
  await db.mailbox.bulkDelete(stale.map(m => m.id!));
  return stale.length;
}

/** 刪一封已領取的信（§ 52.4）。未領取的刪不掉 */
export async function deleteClaimedMail(mailId: number): Promise<boolean> {
  const mail = await db.mailbox.get(mailId);
  if (!mail || mail.claimedAt === null) return false;
  await db.mailbox.delete(mailId);
  return true;
}

const PURGE_VERSION_KEY = 'mayana_mail_purged_version';

/** 換版清理的版本戳記。角色刪除時要一併清掉（characterId 會被重用） */
export function mailPurgeStorageKey(characterId: number): string {
  return `${PURGE_VERSION_KEY}_${characterId}`;
}

/**
 * 版本變了才清。回傳是否執行了清理。
 * 綁 `BUILD_INFO.version`，不可綁 `CURRENT_DATA_VERSION`（§ 52.2.2）。
 */
export async function purgeClaimedMailOnVersionChange(
  characterId: number,
  currentVersion: string,
): Promise<boolean> {
  const key = mailPurgeStorageKey(characterId);
  const seen = localStorage.getItem(key);
  if (seen === currentVersion) return false;
  await purgeClaimedMail(characterId);
  localStorage.setItem(key, currentVersion);
  return true;
}
