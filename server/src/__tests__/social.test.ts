import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, syncWorld, type PlayerSession } from '../playerSession';
import { World } from '../world';
import { computeLeaderboard } from '../leaderboard';
import type { ServerMessage } from '../../../client/src/net/protocol';
import { addBagItem } from '../../../client/src/models/bagItem';
import type { DatabaseSync } from 'node:sqlite';

/** 第 5 階段：聊天（§ 97.7.2）、交易（§ 97.7 表）、本服排行榜（`37-statistics.md` § 37.4） */
const ATTRS = { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never;

describe('社交', () => {
  let world: World;
  let repo: SqliteRepository;
  let db: DatabaseSync;
  const sent = new Map<number, ServerMessage[]>();

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    world = new World();
    sent.clear();
  });

  async function enter(userId: number, name: string, region = 'neutral-town'): Promise<PlayerSession> {
    const s = createPlayerSession(repo, '127.0.0.1', m => {
      const list = sent.get(s.connectionId) ?? [];
      list.push(m);
      sent.set(s.connectionId, list);
    });
    s.world = world;
    s.userId = userId;
    s.game.setState({ userId });
    world.sessions.add(s);
    await s.game.getState().createCharacter(name, 'knight', ATTRS);
    const ch = s.game.getState().character!;
    s.game.setState({ character: { ...ch, currentRegion: region, currentArea: region, gold: 1000 } });
    await s.game.getState().saveState();
    await syncWorld(s);
    world.onCharacterEnter(s);
    return s;
  }

  function chats(s: PlayerSession) {
    return (sent.get(s.connectionId) ?? []).filter(m => m.t === 'chat') as Extract<ServerMessage, { t: 'chat' }>[];
  }

  it('世界頻道全服收到；城鎮頻道只有同城鎮；隊伍頻道只有隊員；公會頻道拒絕', async () => {
    const a = await enter(1, 'A', 'neutral-town');
    const b = await enter(2, 'B', 'neutral-town');
    const c = await enter(3, 'C', 'dawn-plains');

    expect(world.handleChat(a, 'world', '大家好').ok).toBe(true);
    expect(chats(a).map(m => m.message.text)).toEqual(['大家好']);
    expect(chats(b).map(m => m.message.text)).toEqual(['大家好']);
    expect(chats(c).map(m => m.message.text)).toEqual(['大家好']);

    expect(world.handleChat(a, 'town', '村裡的人').ok).toBe(true);
    expect(chats(b).map(m => m.message.text)).toEqual(['大家好', '村裡的人']);
    expect(chats(c).map(m => m.message.text)).toEqual(['大家好']);
    expect(world.handleChat(c, 'town', '不在城鎮').ok).toBe(false);

    expect(world.handleChat(a, 'party', '沒隊伍').ok).toBe(false);
    await world.handlePartyAction(a, 'invite', [b.game.getState().character!.id]);
    await world.handlePartyAction(b, 'accept', [b.party.getState().invites[0].id]);
    expect(world.handleChat(a, 'party', '隊伍').ok).toBe(true);
    expect(chats(b).at(-1)?.message.channel).toBe('party');
    expect(chats(c).at(-1)?.message.channel).toBe('world');

    expect(world.handleChat(a, 'guild', 'x')).toEqual({ ok: false, message: '尚無公會' });
    expect(world.handleChat(a, 'world', '   ').ok).toBe(false);
  });

  it('密語：以角色名稱指定，雙方都收到，第三人收不到', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    const c = await enter(3, 'C');
    const bId = b.game.getState().character!.id!;

    expect(world.handleChat(a, 'whisper', '在嗎', 'B').ok).toBe(true);
    expect(chats(a).at(-1)?.message).toMatchObject({ channel: 'whisper', to: { characterId: bId, name: 'B' } });
    expect(chats(b).at(-1)?.message.text).toBe('在嗎');
    expect(chats(c)).toHaveLength(0);

    expect(world.handleChat(b, 'whisper', '在', 'A').ok).toBe(true);
    expect(chats(a).at(-1)?.message.from.name).toBe('B');
  });

  it('密語：查無此人、對方離線、密語自己都擋下', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    expect(world.handleChat(a, 'whisper', 'x', '不存在的人')).toMatchObject({ ok: false });
    expect(world.handleChat(a, 'whisper', 'x', '')).toMatchObject({ ok: false, message: '請先填密語對象' });
    expect(world.handleChat(a, 'whisper', 'x', 'A')).toMatchObject({ ok: false, message: '不能密語自己' });

    // 角色 ID 不再是密語的鍵
    expect(world.handleChat(a, 'whisper', 'x', String(b.game.getState().character!.id))).toMatchObject({ ok: false });

    world.onCharacterLeave(b);
    await b.game.getState().logout();
    world.sessions.delete(b);
    expect(world.handleChat(a, 'whisper', 'x', 'B')).toMatchObject({ ok: false });
  });

  it('交易：提出 → 接受 → 放入 → 鎖定 → 雙方確認 → 換手，SQLite 的 ownerId 一併更新', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    const aId = a.game.getState().character!.id!;
    const bId = b.game.getState().character!.id!;
    const aItem = a.game.getState().inventory.find(i => !i.isStarterGear) ?? a.game.getState().inventory[0];
    // 新手裝不可交易：先讓 A 手上有一件一般裝備
    const created = await repo.addEquipment({ templateId: 1, ownerId: aId, quality: 0, enhancement: 0, affixes: [], equipped: false, inStorage: false });
    const inv = await repo.listEquipmentByOwner(aId);
    a.game.setState({ inventory: inv.filter(i => !i.equipped && !i.inStorage) });
    b.game.setState({ bagItems: addBagItem(b.game.getState().bagItems, 1, 5) });
    const aBefore = a.game.getState().bagItems.find(i => i.itemId === 1)?.amount ?? 0;
    const bBefore = b.game.getState().bagItems.find(i => i.itemId === 1)?.amount ?? 0;
    void aItem;

    expect((await world.handleTradeAction(a, 'offer', [bId])).ok).toBe(true);
    const offer = b.trade.getState().offers[0];
    expect(offer.fromCharacterId).toBe(aId);
    expect((await world.handleTradeAction(b, 'accept', [offer.id])).ok).toBe(true);
    expect(a.trade.getState().trade?.other.name).toBe('B');

    // 新手裝擋下
    const starter = a.game.getState().inventory.find(i => i.isStarterGear);
    if (starter) {
      const bad = await world.handleTradeAction(a, 'setOffer', [{ equipmentIds: [starter.id], items: [], gold: 0 }]);
      expect(bad.ok).toBe(false);
    }
    expect((await world.handleTradeAction(a, 'setOffer', [{ equipmentIds: [created], items: [], gold: 100 }])).ok).toBe(true);
    expect((await world.handleTradeAction(b, 'setOffer', [{ equipmentIds: [], items: [{ itemId: 1, amount: 3 }], gold: 0 }])).ok).toBe(true);
    expect((await world.handleTradeAction(b, 'setOffer', [{ equipmentIds: [], items: [], gold: 5000 }])).ok).toBe(false);
    expect((await world.handleTradeAction(b, 'setOffer', [{ equipmentIds: [], items: [{ itemId: 1, amount: 3 }], gold: 0 }])).ok).toBe(true);

    expect((await world.handleTradeAction(a, 'confirm', [])).ok).toBe(false);
    expect((await world.handleTradeAction(a, 'lock', [])).ok).toBe(true);
    expect((await world.handleTradeAction(b, 'lock', [])).ok).toBe(true);
    expect(a.trade.getState().trade?.stage).toBe('locked');
    expect((await world.handleTradeAction(a, 'confirm', [])).ok).toBe(true);
    expect(a.trade.getState().trade?.me.confirmed).toBe(true);
    expect((await world.handleTradeAction(b, 'confirm', [])).ok).toBe(true);

    expect(a.trade.getState().trade).toBeNull();
    expect(b.trade.getState().trade).toBeNull();
    expect(a.game.getState().character!.gold).toBe(900);
    expect(b.game.getState().character!.gold).toBe(1100);
    expect(b.game.getState().inventory.some(i => i.id === created)).toBe(true);
    expect(a.game.getState().inventory.some(i => i.id === created)).toBe(false);
    expect(a.game.getState().bagItems.find(i => i.itemId === 1)?.amount).toBe(aBefore + 3);
    expect(b.game.getState().bagItems.find(i => i.itemId === 1)?.amount).toBe(bBefore - 3);
    const row = (await repo.listEquipmentByOwner(bId)).find(i => i.id === created);
    expect(row?.ownerId).toBe(bId);
  });

  it('交易：改動放入內容會解除雙方鎖定；離線取消交易', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    await world.handleTradeAction(a, 'offer', [b.game.getState().character!.id]);
    await world.handleTradeAction(b, 'accept', [b.trade.getState().offers[0].id]);
    await world.handleTradeAction(a, 'lock', []);
    await world.handleTradeAction(b, 'lock', []);
    expect(a.trade.getState().trade?.stage).toBe('locked');
    await world.handleTradeAction(b, 'setOffer', [{ equipmentIds: [], items: [], gold: 1 }]);
    expect(a.trade.getState().trade?.stage).toBe('editing');
    expect(a.trade.getState().trade?.me.locked).toBe(false);

    world.onCharacterLeave(b);
    expect(a.trade.getState().trade).toBeNull();
  });

  it('建角擋重名（`19-account-character.md` § 19.4），大小寫視為同一個', async () => {
    await enter(1, 'Hero');
    expect(repo.nameTaken('Hero')).toBe(true);
    expect(repo.nameTaken('hero')).toBe(true);
    expect(repo.nameTaken('別的名字')).toBe(false);
  });

  it('排行榜：每個欄位 top-N 聯集，同分以 uuid 升冪', async () => {
    const a = await enter(1, 'A');
    const b = await enter(2, 'B');
    a.game.setState({ statistics: { ...a.game.getState().statistics, monstersKilled: 5 } });
    b.game.setState({ character: { ...b.game.getState().character!, level: 9 } });
    a.game.getState().saveState();
    b.game.getState().saveState();
    // 存檔走佇列（`gameStore` 的 saveQueue），等它排完再讀
    await new Promise(resolve => setTimeout(resolve, 20));
    const snap = computeLeaderboard(db, 20);
    expect(snap.count).toBe(2);
    expect(snap.rows).toHaveLength(2);
    const levelIdx = snap.fields.indexOf('character_level');
    const killsIdx = snap.fields.indexOf('monstersKilled');
    const rowA = snap.rows.find(r => r[1] === 'A')!;
    const rowB = snap.rows.find(r => r[1] === 'B')!;
    expect(rowA[killsIdx]).toBe(5);
    expect(rowB[levelIdx]).toBe(9);

    const top1 = computeLeaderboard(db, 1);
    // A 是殺敵榜第一、B 是等級榜第一，聯集仍是兩人
    expect(top1.rows).toHaveLength(2);
  });
});
