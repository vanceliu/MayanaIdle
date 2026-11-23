import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { loadTemplateCache } from '../../../client/src/systems/templateSync';
import { makeBagItem } from '../../../client/src/models/bagItem';
import { EQUIPMENT_SEEDS } from '../../../client/src/db/seed/equipmentSeeds';
import { UNIQUE_CRAFTED_GEAR_SUFFIX, type EquipmentInstance } from '../../../client/src/models/equipment';
import { UNIQUE_CRAFTED_GEAR_SIGIL_REASON } from '../../../client/src/models/sigil';
import { resolveEquipment } from '../../../client/src/systems/templateSync';
import { ACTION_ALLOWLIST, PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 獨特製作經遠端 action（`06-equipment-acquire.md` § 6A.3.1、§ 6A.6；`97-selfhosted-server.md` § 97.2） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const ADD_SIGIL = 161;
const RECIPE = EQUIPMENT_SEEDS.find(t => t.tier === 5 && t.slot === 'rightHand' && t.uniqueCraftMaterials)!;

interface Client {
  session: PlayerSession;
  act(name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('獨特製作（遠端 action）', () => {
  let db: DatabaseSync;
  let repo: SqliteRepository;
  let auth: AuthService;
  let server: GameServer;
  let fire: (socket: unknown, req: unknown) => void;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    migrate(db);
    repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    await loadTemplateCache(repo);
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
    let nextId = 1;
    return {
      session,
      act: async (name, ...args) => {
        const id = nextId++;
        send({ t: 'action', store: 'game', name, args, id });
        await vi.waitFor(() => expect(sent.some(m => 'id' in m && m.id === id)).toBe(true));
        return sent.find(m => 'id' in m && m.id === id)!;
      },
    };
  }

  /** 準備材料、製作費與一件同模板前置（存進資料庫取得 id） */
  async function prepare(c: Client, over: Partial<EquipmentInstance> = {}): Promise<EquipmentInstance> {
    const game = c.session.game;
    const ownerId = game.getState().character!.id!;
    const record = {
      templateId: RECIPE.id!, slot: RECIPE.slot, quality: 0, enhancement: 0, affixes: [], ownerId, equipped: false, ...over,
    };
    const id = await repo.addEquipment(record);
    const prereq = resolveEquipment({ ...record, id, name: RECIPE.name, type: RECIPE.type, isTwoHanded: RECIPE.isTwoHanded } as EquipmentInstance);
    game.setState({
      character: { ...game.getState().character!, gold: RECIPE.craftGold! },
      bagItems: [...RECIPE.uniqueCraftMaterials!.map(m => makeBagItem(m.itemId, m.amount)!), makeBagItem(ADD_SIGIL, 1)!],
      inventory: [...game.getState().inventory, prereq],
    });
    return prereq;
  }

  it('允許清單含 craftUniqueEquipment', () => {
    expect(ACTION_ALLOWLIST.game.has('craftUniqueEquipment')).toBe(true);
  });

  it('server 扣材料、前置與製作費，標記寫進資料庫，印記不受理', async () => {
    const c = await enter();
    const game = c.session.game;
    const prereq = await prepare(c);

    const crafted = await c.act('craftUniqueEquipment', RECIPE.id, prereq.id);
    expect(crafted).toMatchObject({ t: 'action_ok', result: { ok: true } });
    expect(game.getState().character!.gold).toBe(0);
    for (const m of RECIPE.uniqueCraftMaterials!) expect(game.getState().bagItems.some(b => b.itemId === m.itemId)).toBe(false);
    const item = game.getState().inventory.find(i => i.isUniqueCraftedGear)!;
    expect(item.name).toBe(`${RECIPE.name}${UNIQUE_CRAFTED_GEAR_SUFFIX}`);

    const charId = game.getState().character!.id!;
    const rows = await repo.listEquipmentByOwner(charId);
    expect(rows.find(i => i.id === item.id)!.isUniqueCraftedGear).toBe(true);
    expect(rows.some(i => i.id === prereq.id)).toBe(false);

    const reply = await c.act('applySigil', item.id, 'add', null);
    expect(reply).toMatchObject({ t: 'action_ok', result: { ok: false, message: UNIQUE_CRAFTED_GEAR_SIGIL_REASON } });
  });

  it('參數不合格、前置為 (擬) 時不處理', async () => {
    const c = await enter();
    const game = c.session.game;
    const prereq = await prepare(c);
    const mimic = await prepare(c, { isMimicGear: true });
    const bag = game.getState().bagItems;

    expect(await c.act('craftUniqueEquipment', String(RECIPE.id), prereq.id)).toMatchObject({ result: { ok: false, message: '無此配方' } });
    expect(await c.act('craftUniqueEquipment', RECIPE.id, String(prereq.id))).toMatchObject({ result: { ok: false, message: '請選擇前置裝備' } });
    expect(await c.act('craftUniqueEquipment', RECIPE.id, mimic.id)).toMatchObject({ result: { ok: false, message: '擬態品不可用' } });
    expect(game.getState().bagItems).toEqual(bag);
    expect(game.getState().character!.gold).toBe(RECIPE.craftGold);
  });

  it('製作追蹤可指定獨特配方', async () => {
    const c = await enter();
    await c.act('acceptCraftQuest', RECIPE.id, true);
    await c.act('acceptCraftQuest', RECIPE.id, 'x');
    expect(c.session.game.getState().craftQuests).toEqual([{ id: `craft-unique-${RECIPE.id}`, templateId: RECIPE.id, unique: true }]);
  });
});
