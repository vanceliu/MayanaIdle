/**
 * 信箱的道具／金幣／裝備型別（`52-mailbox.md` § 52.3、§ 52.4）——
 * 領取放進角色身上；背包放不下整封擋下，不部分領取。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, BAG_BASE_SLOTS } from '../../stores/gameStore';
import { useMailboxStore } from '../../stores/mailboxStore';
import { repo, resetTestDb } from '../../testing/testDb';
import { loadTemplateCache, resolveEquipment } from '../../systems/templateSync';
import { bagItemById } from '../../testing/bagFixtures';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../../db/seed';
import { isSigilItemId } from '../../models/sigil';
import { getBagItemAmount } from '../../models/bagItem';
import type { EquipmentInstance } from '../../models/equipment';
import type { MailItem } from '../../models/mailbox';
import { claimAll, claimMail, MAIL_BAG_FULL_MESSAGE } from '../../systems/mailbox';

const CHAR = 1;
const MATERIAL = ITEM_DEFINITIONS.find(i => i.category === 'material' && !i.bound && !isSigilItemId(i.id))!;
const TEMPLATE = EQUIPMENT_SEEDS.find(t => t.acquireType !== 'starter')!;

const character = () => ({
  id: CHAR, name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 1, maxHp: 1, mp: 1, maxMp: 1,
  baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 100, currentArea: 'neutral-town', currentZone: 'newbie-neutral', currentRegion: 'neutral-town',
  currentFloor: null, skills: [], quests: [], unspentAttributePoints: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
}) as never;

function filler(count: number): EquipmentInstance[] {
  return Array.from({ length: count }, (_, i) => resolveEquipment({
    id: 1000 + i, templateId: TEMPLATE.id!, name: TEMPLATE.name, type: TEMPLATE.type, slot: TEMPLATE.slot,
    isTwoHanded: TEMPLATE.isTwoHanded, quality: 0, enhancement: 0, affixes: [], ownerId: CHAR, equipped: false,
  } as EquipmentInstance));
}

async function mailedEquipment(): Promise<number> {
  return repo.addEquipment({
    templateId: TEMPLATE.id!, name: TEMPLATE.name, type: TEMPLATE.type, slot: TEMPLATE.slot,
    quality: 37, enhancement: 5, affixes: [], ownerId: CHAR, equipped: false, inStorage: true, storageType: 'mail',
  } as Partial<EquipmentInstance>);
}

async function send(items: MailItem[], key = 'auction-bought-1'): Promise<number> {
  await repo.bulkAddMail([{ characterId: CHAR, sourceKey: key, title: 't', items, createdAt: 1, claimedAt: null }]);
  return (await repo.listMail(CHAR)).find(m => m.sourceKey === key)!.id!;
}

beforeEach(async () => {
  resetTestDb();
  await loadTemplateCache();
  await repo.addCharacter(character());
  useGameStore.setState({ character: character(), equippedGear: {}, bagItems: [], inventory: [] });
  useMailboxStore.setState({ characterId: CHAR, mails: [], unread: 0, message: null });
});

describe('信箱交付道具／金幣／裝備（§ 52.3）', () => {
  it('道具進背包、金幣進角色', async () => {
    const id = await send([{ type: 'item', itemId: MATERIAL.id, amount: 7 }, { type: 'gold', amount: 5000 }]);

    expect(await claimMail(id)).toBe('claimed');

    const s = useGameStore.getState();
    expect(getBagItemAmount(s.bagItems, MATERIAL.id)).toBe(7);
    expect(s.character!.gold).toBe(5100);
    expect((await repo.getMail(id))!.claimedAt).not.toBeNull();
  });

  it('裝備回到背包，強化與品質原樣，持久層不再是信件中', async () => {
    const equipmentId = await mailedEquipment();
    const id = await send([{ type: 'equipment', equipmentId }]);

    expect(await claimMail(id)).toBe('claimed');

    const received = useGameStore.getState().inventory.find(i => i.id === equipmentId)!;
    expect(received).toMatchObject({ enhancement: 5, quality: 37, inStorage: false });
    const stored = (await repo.listEquipmentByOwner(CHAR)).find(e => e.id === equipmentId)!;
    expect(stored.storageType).toBeUndefined();
    expect(stored.inStorage).toBe(false);
  });

  it('背包放不下整封擋下，連同金幣都不給（§ 52.4 不部分領取）', async () => {
    useGameStore.setState({ inventory: filler(BAG_BASE_SLOTS) });
    const id = await send([{ type: 'item', itemId: MATERIAL.id, amount: 1 }, { type: 'gold', amount: 5000 }]);

    expect(await claimMail(id)).toBe('bag_full');

    expect(useGameStore.getState().character!.gold).toBe(100);
    expect((await repo.getMail(id))!.claimedAt).toBeNull();
  });

  it('背包已有同種道具不佔新格，滿了也領得到（§ 35.3.2）', async () => {
    useGameStore.setState({ inventory: filler(BAG_BASE_SLOTS - 1), bagItems: [bagItemById(MATERIAL.id, 1)] });
    const id = await send([{ type: 'item', itemId: MATERIAL.id, amount: 3 }]);

    expect(await claimMail(id)).toBe('claimed');
    expect(getBagItemAmount(useGameStore.getState().bagItems, MATERIAL.id)).toBe(4);
  });

  it('全部領取：放不下的跳過，金幣信照領，並顯示提示', async () => {
    useGameStore.setState({ inventory: filler(BAG_BASE_SLOTS) });
    const equipmentId = await mailedEquipment();
    await send([{ type: 'equipment', equipmentId }], 'auction-bought-1');
    await send([{ type: 'gold', amount: 300 }], 'auction-sold-2');

    expect(await claimAll(CHAR)).toEqual({ claimed: 1, blocked: 1 });
    expect(useGameStore.getState().character!.gold).toBe(400);

    await useMailboxStore.getState().claimAll();
    expect(useMailboxStore.getState().message).toBe(MAIL_BAG_FULL_MESSAGE);
  });

  it('別的角色的信不會改到目前角色', async () => {
    await repo.bulkAddMail([{ characterId: 2, sourceKey: 'x', title: 't', items: [{ type: 'gold', amount: 9 }], createdAt: 1, claimedAt: null }]);
    const id = (await repo.listMail(2))[0].id!;

    expect(await claimMail(id)).toBe('gone');
    expect(useGameStore.getState().character!.gold).toBe(100);
  });
});
