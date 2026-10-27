import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { TALENT_INSTALL_MAX } from '../../../client/src/models/talent';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 天賦參數、安裝上限、緊急撤退驗證（`97-selfhosted-server.md` § 97.2、`51-auto-talent.md` § 51.3.4） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  characterId: number;
  act(store: string, name: string, ...args: unknown[]): Promise<void>;
}

describe('天賦與緊急撤退驗證', () => {
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

  async function enter(): Promise<Client> {
    const user = await auth.register('alice', 'password1');
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
    send({ t: 'resume', token: await auth.issueSession(user.id) });
    send({ t: 'create_character', name: 'Alice', className: 'knight', bonusAttrs: KNIGHT_BONUS });
    await vi.waitFor(() => expect(session.game.getState().character?.name).toBe('Alice'));
    const characterId = session.game.getState().character!.id!;
    await vi.waitFor(() => expect(session.talent.getState().slots.length).toBeGreaterThan(0));
    let nextId = 1;
    return {
      session,
      characterId,
      act: async (store, name, ...args) => {
        const id = nextId++;
        send({ t: 'action', store, name, args, id });
        await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
      },
    };
  }

  /** 把一格改成補給天賦並放上「販售素材」動作，回傳格 id */
  async function supplySellSlot(c: Client): Promise<number> {
    const id = c.session.talent.getState().slots[0].id!;
    await c.act('talent', 'installSlot', id, 'supply', 'default');
    await c.act('talent', 'setEntry', id, null, 'sell_materials');
    return id;
  }

  async function actionParams(c: Client, slotId: number) {
    return (await repo.listTalentSlots(c.characterId)).find(s => s.id === slotId)!.action!.params;
  }

  describe('setEntryParams', () => {
    it('未定義欄位（含 type、非陣列 keepItemIds）丟棄，合法欄位寫入', async () => {
      const c = await enter();
      const id = await supplySellSlot(c);

      await c.act('talent', 'setEntryParams', id, null, { type: 'buy_item', maxTier: 7, skipCraftMaterials: false, keepItemIds: { length: 1 } });

      expect(await actionParams(c, id)).toEqual({ maxTier: 7, skipCraftMaterials: false });
    });

    it.each([
      ['數字超出範圍', { maxTier: 99 }],
      ['數字為字串', { maxTier: '3' }],
      ['數字為物件', { maxTier: {} }],
      ['開關不是布林', { skipCraftMaterials: 'yes' }],
      ['參數不是物件', 'abc'],
      ['參數是陣列', [1, 2]],
    ])('%s：整筆不寫入', async (_label, params) => {
      const c = await enter();
      const id = await supplySellSlot(c);
      const before = await actionParams(c, id);

      await c.act('talent', 'setEntryParams', id, null, params);

      expect(await actionParams(c, id)).toEqual(before);
    });

    it.each([['字串', '__proto__'], ['數字字串', '0'], ['負數', -1], ['小數', 0.5]])('格位編號為%s：整格不變', async (_label, index) => {
      const c = await enter();
      const id = await supplySellSlot(c);
      const slotOf = async () => (await repo.listTalentSlots(c.characterId)).find(s => s.id === id);
      const before = await slotOf();

      await c.act('talent', 'setEntryParams', id, index, { maxTier: 1 });
      await c.act('talent', 'setEntry', id, index, 'hp_below');

      expect(await slotOf()).toEqual(before);
    });

    it('寫入後 tick 不出錯（原本會讓全服停擺的參數已被濾掉）', async () => {
      const c = await enter();
      const id = await supplySellSlot(c);
      await c.act('talent', 'setEntryParams', id, null, { maxTier: 7, keepItemIds: { length: 1 } });
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

      for (let i = 0; i < 5; i++) server.world.tick();

      expect(errorLog).not.toHaveBeenCalled();
      errorLog.mockRestore();
    });
  });

  describe('installSlot', () => {
    async function freeSlots(c: Client, count: number): Promise<number[]> {
      const ids: number[] = [];
      for (let i = 0; i < count; i++) {
        ids.push(await repo.addTalentSlot({ characterId: c.characterId, tier: 1, assignedType: null, templateId: null, order: null, enabled: true, conditions: [null], action: null }));
      }
      await c.session.talent.getState().load(c.characterId);
      return ids;
    }

    const installedIn = async (c: Client, type: string) =>
      (await repo.listTalentSlots(c.characterId)).filter(s => s.assignedType === type && s.templateId === 'default').length;

    it(`同類型同配置最多 ${TALENT_INSTALL_MAX} 個`, async () => {
      const c = await enter();
      const ids = await freeSlots(c, TALENT_INSTALL_MAX + 1);

      for (const id of ids) await c.act('talent', 'installSlot', id, 'supply', 'default');

      expect(await installedIn(c, 'supply')).toBe(TALENT_INSTALL_MAX);
    });

    it.each([['類型', 'zzz', 'default'], ['配置', 'supply', 'no-such-template']])('不存在的%s：不安裝', async (_label, type, templateId) => {
      const c = await enter();
      const [id] = await freeSlots(c, 1);

      await c.act('talent', 'installSlot', id, type, templateId);

      expect((await repo.listTalentSlots(c.characterId)).find(s => s.id === id)!.assignedType).toBeNull();
    });
  });

  describe('setEmergencyRetreat', () => {
    const VALID = { enabled: true, hpThreshold: 20, action: 'flee_town' };
    const retreat = (c: Client) => {
      const s = c.session.game.getState();
      return s.scriptTemplates.find(t => t.id === s.activeTemplateId)!.emergencyRetreat;
    };

    it.each([
      ['null', null],
      ['enabled 非布林', { ...VALID, enabled: 'x' }],
      ['門檻 0', { ...VALID, hpThreshold: 0 }],
      ['門檻 101', { ...VALID, hpThreshold: 101 }],
      ['門檻字串', { ...VALID, hpThreshold: '20' }],
      ['未知動作', { ...VALID, action: 'nuke' }],
      ['未知城鎮', { ...VALID, scrollTownId: 'nowhere' }],
    ])('%s：不寫入', async (_label, value) => {
      const c = await enter();
      const before = retreat(c);

      await c.act('game', 'setEmergencyRetreat', value);

      expect(retreat(c)).toEqual(before);
    });

    it('合法設定照常寫入', async () => {
      const c = await enter();

      await c.act('game', 'setEmergencyRetreat', { ...VALID, scrollTownId: 'elsarth-town' });

      expect(retreat(c)).toEqual({ ...VALID, scrollTownId: 'elsarth-town' });
    });
  });
});
