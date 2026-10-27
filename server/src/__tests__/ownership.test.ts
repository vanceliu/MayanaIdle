import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { AuthService } from '../auth';
import { buildConfig } from '../config';
import { GameServer } from '../ws';
import { defaultSession } from '../../../client/src/stores/session';
import { PROTOCOL_VERSION, type ServerMessage } from '../../../client/src/net/protocol';
import type { EquipmentInstance } from '../../../client/src/models/equipment';
import type { PlayerSession } from '../playerSession';

/** 以 id 操作的 action 檢查擁有權（`97-selfhosted-server.md` § 97.2 硬性要求） */
const KNIGHT_BONUS = { STR: 2, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 0 };

interface Client {
  session: PlayerSession;
  characterId: number;
  act(store: string, name: string, ...args: unknown[]): Promise<ServerMessage>;
}

describe('擁有權檢查', () => {
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
    send({ t: 'resume', token: await auth.issueSession(user.id) });
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

  function row(id: number): { owner_id: number; data: string } | undefined {
    return db.prepare('SELECT owner_id, data FROM equipment_instances WHERE id = ?').get(id) as never;
  }

  /** 把一件已裝備的防具脫回背包，回傳該實例 */
  async function unequippedArmor(client: Client): Promise<EquipmentInstance> {
    const gear = client.session.game.getState().equippedGear as Record<string, EquipmentInstance>;
    const slot = Object.keys(gear).find(s => s === 'helmet')!;
    await client.act('game', 'unequipItem', slot);
    return client.session.game.getState().inventory.find(i => i.id === gear[slot].id)!;
  }

  describe('equipItem', () => {
    it('他人的裝備：不裝上，資料庫列不變', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const loot = await unequippedArmor(victim);
      const before = row(loot.id!);

      await attacker.act('game', 'equipItem', { ...loot, slot: 'amulet', requiredClass: [] });

      expect(Object.values(attacker.session.game.getState().equippedGear).some(g => g?.id === loot.id)).toBe(false);
      expect(row(loot.id!)).toEqual(before);
    });

    it('自己的裝備附上偽造欄位：裝上的是背包裡的原始實例', async () => {
      const player = await enter('Player');
      const own = await unequippedArmor(player);

      await player.act('game', 'equipItem', { ...own, affixes: [{ type: 'max_hp', tier: 7, value: 999999 }], quality: 100, stability: 99 });

      const equipped = player.session.game.getState().equippedGear.helmet!;
      expect(equipped.id).toBe(own.id);
      expect(equipped.affixes).toEqual(own.affixes);
      expect(equipped.quality).toBe(own.quality);
      expect(JSON.parse(row(own.id!)!.data).affixes).toEqual(own.affixes);
    });
  });

  describe('丟棄', () => {
    it('discardInventoryItem 他人的裝備：不刪除', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const target = await unequippedArmor(victim);

      await attacker.act('game', 'discardInventoryItem', target.id);

      expect(row(target.id!)).toBeDefined();
    });

    it('requestDiscard＋confirmDiscard 他人的裝備：不刪除', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const target = await unequippedArmor(victim);

      await attacker.act('game', 'requestDiscard', { kind: 'equipment', name: 'x', maxAmount: 1, equipmentId: target.id });
      await attacker.act('game', 'confirmDiscard', 1);

      expect(attacker.session.game.getState().pendingDiscard).toBeNull();
      expect(row(target.id!)).toBeDefined();
    });

    it('requestDiscard 背包道具：名稱與數量上限以自己的資料為準', async () => {
      const player = await enter('Player');
      const potion = player.session.game.getState().bagItems[0];

      await player.act('game', 'requestDiscard', { kind: 'bag', name: '偽造', itemId: potion.itemId, maxAmount: 99999 });

      expect(player.session.game.getState().pendingDiscard).toEqual({ kind: 'bag', name: potion.name, itemId: potion.itemId, maxAmount: potion.amount });
    });

    it('自己的裝備照常丟棄', async () => {
      const player = await enter('Player');
      const own = await unequippedArmor(player);

      await player.act('game', 'requestDiscard', { kind: 'equipment', name: own.name, maxAmount: 1, equipmentId: own.id });
      await player.act('game', 'confirmDiscard', 1);

      expect(row(own.id!)).toBeUndefined();
    });

    it('requestDiscardBatch 混入他人的裝備：只留自己的項目，名稱與上限以自己的資料為準', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const target = await unequippedArmor(victim);
      const own = await unequippedArmor(attacker);
      const potion = attacker.session.game.getState().bagItems[0];

      await attacker.act('game', 'requestDiscardBatch', [
        { kind: 'equipment', name: 'x', maxAmount: 1, equipmentId: target.id },
        { kind: 'equipment', name: 'x', maxAmount: 1, equipmentId: own.id },
        { kind: 'bag', name: '偽造', itemId: potion.itemId, maxAmount: 99999 },
      ]);
      expect(attacker.session.game.getState().pendingDiscardBatch).toEqual([
        { kind: 'equipment', name: own.name, maxAmount: 1, equipmentId: own.id },
        { kind: 'bag', name: potion.name, itemId: potion.itemId, maxAmount: potion.amount },
      ]);

      await attacker.act('game', 'confirmDiscardBatch', [1, 99999]);

      expect(row(target.id!)).toBeDefined();
      expect(row(own.id!)).toBeUndefined();
      expect(attacker.session.game.getState().bagItems.some(b => b.itemId === potion.itemId)).toBe(false);
      expect(attacker.session.game.getState().pendingDiscardBatch).toBeNull();
    });

    it('confirmDiscardBatch 數量非整數：整筆不丟棄', async () => {
      const player = await enter('Player');
      const own = await unequippedArmor(player);
      const potion = player.session.game.getState().bagItems[0];

      await player.act('game', 'requestDiscardBatch', [
        { kind: 'equipment', name: own.name, maxAmount: 1, equipmentId: own.id },
        { kind: 'bag', name: potion.name, itemId: potion.itemId, maxAmount: potion.amount },
      ]);
      await player.act('game', 'confirmDiscardBatch', [1, 1.5]);

      expect(row(own.id!)).toBeDefined();
      expect(player.session.game.getState().bagItems[0].amount).toBe(potion.amount);
    });
  });

  describe('天賦格', () => {
    it('uninstallSlot 他人的天賦格：不拆', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      await vi.waitFor(async () => expect((await repo.listTalentSlots(victim.characterId)).length).toBeGreaterThan(0));
      const [slot] = await repo.listTalentSlots(victim.characterId);
      expect(slot.assignedType).not.toBeNull();

      await attacker.act('talent', 'uninstallSlot', slot.id);

      expect((await repo.listTalentSlots(victim.characterId))[0].assignedType).toBe(slot.assignedType);
    });
  });

  describe('信件', () => {
    async function mailFor(characterId: number, claimed: boolean) {
      await repo.bulkAddMail([{ characterId, sourceKey: `t-${claimed}`, title: 't', items: [{ type: 'talent_slot', slotTier: 1 }], createdAt: Date.now(), claimedAt: claimed ? Date.now() : null } as never]);
      return (await repo.listMail(characterId)).find(m => m.sourceKey === `t-${claimed}`)!;
    }

    it('claim 他人的信：不領取', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const mail = await mailFor(victim.characterId, false);

      await attacker.act('mailbox', 'claim', mail.id);

      expect((await repo.getMail(mail.id!))!.claimedAt).toBeNull();
    });

    it('remove 他人已領的信：不刪除', async () => {
      const victim = await enter('Victim');
      const attacker = await enter('Attacker');
      const mail = await mailFor(victim.characterId, true);

      await attacker.act('mailbox', 'remove', mail.id);

      expect(await repo.getMail(mail.id!)).toBeDefined();
    });

    it('自己的信照常領取與刪除', async () => {
      const player = await enter('Player');
      const mail = await mailFor(player.characterId, false);

      await player.act('mailbox', 'claim', mail.id);
      expect((await repo.getMail(mail.id!))!.claimedAt).not.toBeNull();

      await player.act('mailbox', 'remove', mail.id);
      expect(await repo.getMail(mail.id!)).toBeUndefined();
    });
  });
});
