import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, migrate } from '../db/sqlite';
import { SqliteRepository } from '../db/sqliteRepository';
import { defaultSession } from '../../../client/src/stores/session';
import { createPlayerSession, type PlayerSession } from '../playerSession';
import { buildFrame, collectCombatDelta, collectStoreDeltas, resetSync } from '../sync';
import type { CombatLog } from '../../../client/src/stores/gameStore';
import type { MapMonster } from '../../../client/src/stores/mapMonsterStore';
import type { MonsterInstance } from '../../../client/src/models/monster';

/** 狀態同步（`97-selfhosted-server.md` § 97.2「狀態同步」） */
describe('狀態同步', () => {
  let session: PlayerSession;

  beforeEach(async () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const repo = new SqliteRepository(db);
    defaultSession.repo = repo;
    session = createPlayerSession(repo, '127.0.0.1', () => {});
    session.game.setState({ userId: 1 });
    await session.game.getState().createCharacter('同步', 'knight', { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 } as never);
    collectStoreDeltas(session);
    collectCombatDelta(session);
  });

  const log = (message: string) => ({ message }) as unknown as CombatLog;

  function monster(id: string, x: number, y: number): MapMonster {
    return {
      id, position: { x, y }, prevPosition: { x: x - 1, y }, targetPosition: { x: 0, y: 0 }, speed: 2,
      path: [{ x: 1, y: 1 }], pathIndex: 0, pathRecalcTimer: 120, moveTimer: 30, lastPathPlayerPos: { x: 0, y: 0 }, isBoss: false,
    };
  }

  function instance(currentHp: number, maxHp = 100): MonsterInstance {
    return { name: '史萊姆', level: 3, currentHp, maxHp, isBoss: false, element: 'none', attackType: 'melee' } as MonsterInstance;
  }

  it('戰鬥日誌只送尾端新增的筆數', () => {
    const a = log('a'), b = log('b'), c = log('c');
    session.game.setState({ combatLogs: [a, b] });
    expect(collectStoreDeltas(session)?.game?.append?.combatLogs).toEqual({ items: [a, b], length: 2 });
    session.game.setState({ combatLogs: [a, b, c] });
    expect(collectStoreDeltas(session)).toEqual({ game: { append: { combatLogs: { items: [c], length: 3 } } } });
  });

  it('戰鬥日誌整份換掉時改送整值', () => {
    session.game.setState({ combatLogs: [log('a')] });
    collectStoreDeltas(session);
    const fresh = [log('x')];
    session.game.setState({ combatLogs: fresh });
    expect(collectStoreDeltas(session)?.game).toEqual({ set: { combatLogs: fresh } });
  });

  it('角色只送變動的欄位', () => {
    const ch = session.game.getState().character!;
    session.game.setState({ character: { ...ch, hp: ch.hp - 7 } });
    expect(collectStoreDeltas(session)).toEqual({ game: { merge: { character: { hp: ch.hp - 7 } } } });
  });

  it('角色欄位被就地改寫時仍送出', () => {
    const ch = session.game.getState().character!;
    ch.hp -= 5;
    expect(collectStoreDeltas(session)).toEqual({ game: { merge: { character: { hp: ch.hp } } } });
    session.game.setState({ character: { ...ch, exp: ch.exp + 1 } });
    expect(collectStoreDeltas(session)).toEqual({ game: { merge: { character: { exp: ch.exp + 1 } } } });
  });

  it('角色變成 null 時送整值', () => {
    session.game.setState({ character: null });
    expect(collectStoreDeltas(session)?.game?.set).toEqual({ character: null });
  });

  it('怪物只送顯示欄位，內容不變就不送', () => {
    session.mapMonster.setState({ monsters: [monster('m1', 3, 4)] });
    expect(collectStoreDeltas(session)?.mapMonster?.set?.monsters).toEqual([{ id: 'm1', position: { x: 3, y: 4 }, isBoss: false }]);
    // 只有伺服器端欄位（計時器、prevPosition）變動
    session.mapMonster.setState({ monsters: [{ ...monster('m1', 3, 4), moveTimer: 90, prevPosition: { x: 3, y: 4 } }] });
    expect(collectStoreDeltas(session)).toBeNull();
  });

  it('怪物戰鬥：第一則清空重建，之後只送新怪、血量變動與移除', () => {
    resetSync(session);
    session.combat.monsterInstances.set('m1', instance(100));
    const first = collectCombatDelta(session)!;
    expect(first.full).toBe(true);
    expect(first.add?.map(v => v.id)).toEqual(['m1']);
    expect(first).toHaveProperty('target', null);
    expect(first).toHaveProperty('cast', {});

    expect(collectCombatDelta(session)).toBeNull();

    session.combat.monsterInstances.get('m1')!.currentHp = 80;
    session.combat.monsterInstances.set('m2', instance(50));
    expect(collectCombatDelta(session)).toEqual({ add: [expect.objectContaining({ id: 'm2', name: '史萊姆', currentHp: 50 })], hp: { m1: 80 } });

    session.combat.monsterInstances.delete('m1');
    session.combat.engine.playerCtx.targetMonsterId = 'm2';
    expect(collectCombatDelta(session)).toEqual({ remove: ['m1'], target: 'm2' });
  });

  it('tick 推送有角色時必送並帶 now；操作回應的推送沒有變動就不送', () => {
    expect(buildFrame(session, null)).toBeNull();
    const tick = buildFrame(session, { visuals: [] });
    expect(tick).toMatchObject({ t: 'frame' });
    expect(tick).toHaveProperty('now');
    session.game.setState({ searchMode: 'manual' });
    const action = buildFrame(session, null)!;
    expect(action).toEqual({ t: 'frame', stores: { game: { set: { searchMode: 'manual' } } } });
  });

  it('resetSync 後下一次推送送完整狀態', () => {
    resetSync(session);
    const deltas = collectStoreDeltas(session)!;
    expect(deltas.game?.set?.character).toEqual(session.game.getState().character);
    expect(deltas.mapControl?.set).toHaveProperty('playerPosition');
  });
});
