import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 存檔與跨 store 連動在 server 端的 store action 內完成（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  characterId: number;
  act(store: string, name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('線上模式的存檔與連動', () => {
  let db: DatabaseSync;
  let repo: SqliteRepository;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(() => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    auth = new AuthService(db);
    const config = { ...buildConfig(new Map(), '/tmp').config, bind: '0.0.0.0' };
    server = new GameServer({ repo, auth, config: () => config, version: 'test', hostUsername: 'host', mode: 'open', leaderboard: () => ({ top: 20, count: 0, fields: [], rows: [] }) });
    server.attach({ on: (_ev: string, handler: typeof fire) => { fire = handler; } } as never);
  });

  async function enter(name: string): Promise<Client> {
    const user = await auth.register(name.toLowerCase(), 'password1');
    const handlers: Record<string, (raw: unknown) => void> = {};
    const sent: ServerMessage[] = [];
    fire({
      readyState: 1,
      OPEN: 1,
      on(ev: string, h: (raw: unknown) => void) { handlers[ev] = h; },
      send(raw: string) { sent.push(JSON.parse(raw) as ServerMessage); },
      close() {},
    }, { socket: { remoteAddress: '1.2.3.4' } });
    const session = [...server.sessions].at(-1)!;
    const send = (msg: unknown) => handlers.message(JSON.stringify(msg));
    send({ t: 'hello', version: PROTOCOL_VERSION, release: 'test' });
    send({ t: 'resume', token: auth.issueSession(user.id) });
    send({ t: 'create_character', name, className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe(name));
    let nextId = 1;
    const act = async (store: string, actionName: string, ...args: unknown[]) => {
      const id = nextId++;
      send({ t: 'action', store, name: actionName, args, id });
      await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      return sent.find(m => 'id' in m && m.id === id)!;
    };
    return { session, characterId: session.game.getState().character!.id!, act };
  }

  describe.each([
    ['背包位置（`35-inventory-constraints.md` § 35.17）', 'setBagSlotMap', 'bagSlotMap', 'getBagLayout'],
    ['天賦分頁位置（`35-inventory-constraints.md` § 35.21.1）', 'setTalentBagOrder', 'talentBagOrder', 'getTalentBagLayout'],
  ] as const)('%s', (_title, action, field, read) => {
    it(`${action} 寫進持久層`, async () => {
      const player = await enter('Player');

      const reply = await player.act('game', action, { 'item-3': 0, 'item-1': 4 });

      expect(reply).not.toMatchObject({ t: 'error' });
      expect(player.session.game.getState()[field]).toEqual({ 'item-3': 0, 'item-1': 4 });
      await vi.waitFor(async () => {
        expect(await repo[read](player.characterId)).toEqual({ 'item-3': 0, 'item-1': 4 });
      });
    });

    it.each([
      ['陣列', [0, 1]],
      ['null', null],
      ['負數位置', { a: -1 }],
      ['小數位置', { a: 1.5 }],
      ['字串位置', { a: '1' }],
    ])('格式不合（%s）整筆不寫', async (_label, value) => {
      const player = await enter('Player');
      await player.act('game', action, { keep: 2 });
      await vi.waitFor(async () => expect(await repo[read](player.characterId)).toEqual({ keep: 2 }));

      await player.act('game', action, value);

      expect(player.session.game.getState()[field]).toEqual({ keep: 2 });
      expect(await repo[read](player.characterId)).toEqual({ keep: 2 });
    });
  });

  describe('信件領取後的天賦格（`52-mailbox.md` § 52.3）', () => {
    async function talentMail(characterId: number, key: string) {
      await repo.bulkAddMail([{ characterId, sourceKey: key, title: 't', items: [{ type: 'talent_slot', slotTier: 2 }], createdAt: Date.now(), claimedAt: null } as never]);
      return (await repo.listMail(characterId)).find(m => m.sourceKey === key)!;
    }
    const tier2Count = (client: Client) => client.session.talent.getState().slots.filter(s => s.tier === 2).length;

    it('claim：server 端天賦 store 立即含新格', async () => {
      const player = await enter('Player');
      await player.session.mailbox.getState().load(player.characterId);
      const before = tier2Count(player);
      const mail = await talentMail(player.characterId, 'one');

      await player.act('mailbox', 'claim', mail.id);

      expect(tier2Count(player)).toBe(before + 1);
    });

    it('claimAll：server 端天賦 store 立即含全部新格', async () => {
      const player = await enter('Player');
      await player.session.mailbox.getState().load(player.characterId);
      const before = tier2Count(player);
      await talentMail(player.characterId, 'a');
      await talentMail(player.characterId, 'b');

      await player.act('mailbox', 'claimAll');

      expect(tier2Count(player)).toBe(before + 2);
    });
  });
});
