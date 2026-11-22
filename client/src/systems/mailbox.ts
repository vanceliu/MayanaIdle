/**
 * 系統信箱的發放與領取（`52-mailbox.md`）。
 * 天賦格、補償、拍賣場交付（道具／金幣／裝備）；里程碑不做（§ 52.0）。
 */
import type { GameRepository } from '../db/repository';
import type { Character } from '../models/character';
import { defaultSession, type Session } from '../stores/session';
import type { GameState } from '../stores/gameStore';
import { getBagMaxSlots, getBagUsedSlots } from './bagCapacity';
import { addBagItem, type BagItem } from '../models/bagItem';
import type { EquipmentInstance } from '../models/equipment';
import { resolveEquipment } from './templateSync';
import {
  SLOT_GRANT_LEVEL_INTERVAL,
  emptyConditions,
  type TalentSlot,
  type TalentSlotTier,
} from '../models/talent';
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
/** 濾掉已存在的 `sourceKey` —— `[characterId+sourceKey]` 是唯一索引，重發會整批失敗 */
async function withoutExistingKeys(characterId: number, pending: Mail[], repo: GameRepository): Promise<Mail[]> {
  if (pending.length === 0) return pending;
  const existing = new Set((await repo.listMail(characterId)).map(m => m.sourceKey));
  return pending.filter(m => !existing.has(m.sourceKey));
}

export async function syncTalentSlotGrants(characterId: number, level: number, repo: GameRepository = defaultSession.repo): Promise<number> {
  const expected = expectedTalentSlotGrants(level);
  const character = await repo.getCharacter(characterId);
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
  const fresh = await withoutExistingKeys(characterId, pending, repo);

  // 發信與記數必須同一個交易（§ 52.2.3）
  await repo.transaction(async () => {
    if (fresh.length > 0) await repo.bulkAddMail(fresh);
    await repo.updateCharacter(characterId, { talentSlotGrants: expected });
  });
  return fresh.length;
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
  repo: GameRepository = defaultSession.repo,
): Promise<number> {
  const character = await repo.getCharacter(characterId);
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

  const fresh = await withoutExistingKeys(characterId, pending, repo);

  // 發信與記 key 必須同一個交易（§ 52.2.4.2）
  await repo.transaction(async () => {
    if (fresh.length > 0) await repo.bulkAddMail(fresh);
    await repo.updateCharacter(characterId, {
      sentMailKeys: { ...sent, ...Object.fromEntries(due.map(c => [c.id, true])) },
    });
  });
  return fresh.length;
}

/**
 * 寄出離線金幣信（`04-character.md` § 4.12）。回傳是否新寄出。
 * 寄信與結算基準（`lastSeenAt`、狩獵累計歸零）同一個交易；`sourceKey` 已存在則只更新基準。
 */
export async function sendOfflineGoldMail(
  mail: Mail,
  baseline: Pick<Character, 'lastSeenAt' | 'restedExpMs' | 'huntGold' | 'huntMs'>,
  repo: GameRepository = defaultSession.repo,
): Promise<boolean> {
  const fresh = await withoutExistingKeys(mail.characterId, [mail], repo);
  await repo.transaction(async () => {
    if (fresh.length > 0) await repo.bulkAddMail(fresh);
    await repo.updateCharacter(mail.characterId, baseline);
  });
  return fresh.length > 0;
}

export async function listMail(characterId: number, repo: GameRepository = defaultSession.repo): Promise<Mail[]> {
  const rows = await repo.listMail(characterId);
  // 未領取在上，其餘照發放時間新到舊
  return rows.sort((a, b) => {
    if ((a.claimedAt === null) !== (b.claimedAt === null)) return a.claimedAt === null ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

export function unclaimedCount(mails: Mail[]): number {
  return mails.filter(m => m.claimedAt === null).length;
}

export type ClaimResult = 'claimed' | 'gone' | 'bag_full';

export const MAIL_BAG_FULL_MESSAGE = '背包空間不足，清出空間後再領取';

const CHARACTER_ITEM_TYPES: ReadonlySet<string> = new Set(['item', 'gold', 'equipment']);

/** 道具、金幣、裝備要改角色身上的背包／金幣，必須由該角色的 session 領取 */
function touchesCharacter(mail: Mail): boolean {
  return mail.items.some(i => CHARACTER_ITEM_TYPES.has(i.type));
}

/** 整封領取後背包放不放得下（§ 52.4、`35-inventory-constraints.md` § 35.3）。印記等不佔格的照 `getBagUsedSlots` */
export function mailFitsBag(state: Pick<GameState, 'bagItems' | 'inventory' | 'equippedGear'>, items: MailItem[]): boolean {
  let bag: BagItem[] = state.bagItems;
  let equipment = 0;
  for (const item of items) {
    if (item.type === 'item' && item.itemId !== undefined) bag = addBagItem(bag, item.itemId, item.amount ?? 0);
    if (item.type === 'equipment') equipment++;
  }
  return getBagUsedSlots(bag, state.inventory, state.equippedGear) + equipment <= getBagMaxSlots(state.equippedGear);
}

/** 天賦格寫進持久層；裝備改回背包並回傳實例，由呼叫端放進角色狀態 */
async function grantItem(characterId: number, item: MailItem, repo: GameRepository): Promise<EquipmentInstance | null> {
  if (item.type === 'equipment') {
    const instance = (await repo.listEquipmentByOwner(characterId))
      .find(e => e.id === item.equipmentId && e.storageType === 'mail');
    if (!instance) return null;
    const changes = { inStorage: false, storageType: undefined, equipped: false };
    await repo.updateEquipment(instance.id!, changes);
    return { ...instance, ...changes };
  }
  if (item.type !== 'talent_slot') return null;
  const tier = (item.slotTier ?? 1) as TalentSlotTier;
  const slot: TalentSlot = {
    characterId,
    tier,
    // 未安裝狀態（§ 51.3.4）
    assignedType: null,
    templateId: null,
    order: null,
    enabled: true,
    conditions: emptyConditions(tier),
    action: null,
  };
  await repo.addTalentSlot(slot);
  return null;
}

/** 道具、金幣、裝備放進角色狀態 */
function applyToCharacter(session: Session, items: MailItem[], equipment: EquipmentInstance[]): void {
  const gs = session.game.getState();
  let bag = gs.bagItems;
  let gold = gs.character!.gold;
  for (const item of items) {
    if (item.type === 'item' && item.itemId !== undefined) bag = addBagItem(bag, item.itemId, item.amount ?? 0);
    if (item.type === 'gold') gold += item.amount ?? 0;
  }
  session.game.setState({
    bagItems: bag,
    inventory: [...gs.inventory, ...equipment.map(resolveEquipment)],
    character: { ...gs.character!, gold },
  });
}

/** 領取一封信。背包放不下整封擋下，不部分領取（§ 52.4） */
export async function claimMail(mailId: number, session: Session = defaultSession): Promise<ClaimResult> {
  const repo = session.repo;
  const outcome = await repo.transaction(async () => {
    const mail = await repo.getMail(mailId);
    if (!mail || mail.claimedAt !== null) return { result: 'gone' as const };
    const physical = touchesCharacter(mail);
    if (physical) {
      const gs = session.game.getState();
      if (gs.character?.id !== mail.characterId) return { result: 'gone' as const };
      if (!mailFitsBag(gs, mail.items)) return { result: 'bag_full' as const };
    }
    const equipment: EquipmentInstance[] = [];
    for (const item of mail.items) {
      const received = await grantItem(mail.characterId, item, repo);
      if (received) equipment.push(received);
    }
    await repo.updateMail(mailId, { claimedAt: Date.now() });
    return { result: 'claimed' as const, mail, physical, equipment };
  });
  if (outcome.result !== 'claimed') return outcome.result;
  if (outcome.physical) {
    applyToCharacter(session, outcome.mail.items, outcome.equipment);
    await session.game.getState().flushSaveNow();
  }
  return 'claimed';
}

/** 信是否屬於該角色（領取、刪除前的擁有權檢查） */
export async function isOwnMail(mailId: number, characterId: number, repo: GameRepository = defaultSession.repo): Promise<boolean> {
  return (await repo.getMail(mailId))?.characterId === characterId;
}

/** 全部領取。放不下的那封跳過、其餘照領 */
export async function claimAll(characterId: number, session: Session = defaultSession): Promise<{ claimed: number; blocked: number }> {
  const mails = await session.repo.listMail(characterId);
  let claimed = 0;
  let blocked = 0;
  for (const mail of mails) {
    if (mail.claimedAt !== null) continue;
    const result = await claimMail(mail.id!, session);
    if (result === 'claimed') claimed++;
    if (result === 'bag_full') blocked++;
  }
  return { claimed, blocked };
}

/** 換版清理（§ 52.7.1）：只刪已領取的。發放紀錄不動 */
export async function purgeClaimedMail(characterId: number, repo: GameRepository = defaultSession.repo): Promise<number> {
  const stale = (await repo.listMail(characterId)).filter(m => m.claimedAt !== null);
  if (stale.length === 0) return 0;
  await repo.bulkDeleteMail(stale.map(m => m.id!));
  return stale.length;
}

/** 刪一封已領取的信（§ 52.4）。未領取的刪不掉 */
export async function deleteClaimedMail(mailId: number, repo: GameRepository = defaultSession.repo): Promise<boolean> {
  const mail = await repo.getMail(mailId);
  if (!mail || mail.claimedAt === null) return false;
  await repo.deleteMail(mailId);
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
  repo: GameRepository = defaultSession.repo,
): Promise<boolean> {
  const seen = await repo.getMailPurgeVersion(characterId);
  if (seen === currentVersion) return false;
  await purgeClaimedMail(characterId, repo);
  await repo.setMailPurgeVersion(characterId, currentVersion);
  return true;
}
