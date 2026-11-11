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
import { getDismantleYield } from '../../../client/src/systems/crafting';
import { getAbilityWeaponValue } from '../../../client/src/models/ability';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { PlayerSession } from '../playerSession';

/** 鐵匠鋪拆解經遠端 action（`06-equipment-acquire.md` § 6A.3「拆解」、`97-selfhosted-server.md` § 97.2） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };
const RECIPE = EQUIPMENT_SEEDS.find(t => t.acquireType === 'craft' && t.tier === 4 && !t.craftPrerequisiteWeapon && t.type !== 'armor')!;

interface Client {
  session: PlayerSession;
  act(name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('拆解（遠端 action）', () => {
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

  it('拆解製作品：資料庫刪除實例、背包加入一半材料', async () => {
    const c = await enter();
    const game = c.session.game;
    game.setState({
      character: { ...game.getState().character!, gold: RECIPE.craftGold! },
      bagItems: RECIPE.craftMaterials!.map(m => makeBagItem(m.itemId, m.amount)!),
    });
    await c.act('craftEquipment', RECIPE.id, 'bonus_damage');
    const item = game.getState().inventory.find(i => i.templateId === RECIPE.id)!;

    const reply = await c.act('dismantleEquipment', item.id);
    expect(reply).toMatchObject({ t: 'action_ok', result: { ok: true } });
    expect(game.getState().inventory.some(i => i.id === item.id)).toBe(false);

    const charId = game.getState().character!.id!;
    expect((await repo.listEquipmentByOwner(charId)).some(i => i.id === item.id)).toBe(false);
    const bag = game.getState().bagItems;
    for (const m of getDismantleYield(RECIPE)!) expect(bag.find(b => b.itemId === m.itemId)?.amount).toBe(m.amount);
    // 製作費不退（`06-equipment-acquire.md` § 6A.3「拆解」）
    expect(game.getState().character!.gold).toBe(0);
  });

  it('不在自己背包的實例 id 不受理', async () => {
    const c = await enter();
    const before = c.session.game.getState();
    const reply = await c.act('dismantleEquipment', 99999);
    expect(reply).toMatchObject({ t: 'action_ok', result: { ok: false } });
    expect(c.session.game.getState().bagItems).toEqual(before.bagItems);
    expect(c.session.game.getState().inventory).toEqual(before.inventory);
  });

  it('掉落品拆出技能結晶存進 character_prefs，技能更換寫回裝備並扣金幣（§ 7S.8）', async () => {
    const c = await enter();
    const game = c.session.game;
    const charId = game.getState().character!.id!;
    const best = { type: 'bonus_damage' as const, params: { chance: 10, damage: getAbilityWeaponValue(RECIPE) } };
    const drop = await repo.addEquipment({
      templateId: RECIPE.id!, name: RECIPE.name, type: RECIPE.type, slot: RECIPE.slot, isTwoHanded: RECIPE.isTwoHanded,
      quality: 0, enhancement: 0, affixes: [], ownerId: charId, equipped: false, ability: best,
    } as never);
    const target = await repo.addEquipment({
      templateId: RECIPE.id!, name: RECIPE.name, type: RECIPE.type, slot: RECIPE.slot, isTwoHanded: RECIPE.isTwoHanded,
      quality: 0, enhancement: 0, affixes: [], ownerId: charId, equipped: false,
    } as never);
    const [dropItem, targetItem] = (await repo.listEquipmentByOwner(charId)).filter(i => i.id === drop || i.id === target);
    game.setState({ inventory: [dropItem, targetItem], character: { ...game.getState().character!, gold: 7_000_000 } });

    expect(await c.act('dismantleEquipment', drop)).toMatchObject({ t: 'action_ok', result: { ok: true } });
    const crystals = [{ type: 'bonus_damage', positions: { chance: 1, damage: 1 } }];
    expect(game.getState().abilityCrystals).toEqual(crystals);
    await game.getState().flushSaveNow();
    expect(((await repo.getCharacterPrefs(charId)) as { abilityCrystals?: unknown }).abilityCrystals).toEqual(crystals);

    expect(await c.act('applyAbilityCrystal', target, 'bonus_damage')).toMatchObject({ t: 'action_ok', result: { ok: true } });
    expect(game.getState().character!.gold).toBe(7_000_000 - 1_500_000 * RECIPE.tier!);
    await vi.waitFor(async () => {
      const saved = (await repo.listEquipmentByOwner(charId)).find(i => i.id === target);
      expect(saved?.ability).toEqual(best);
    });
  });
});
