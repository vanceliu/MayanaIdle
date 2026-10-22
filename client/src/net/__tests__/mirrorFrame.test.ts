import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyServerMessage, mirrorCastProgress } from '../mirror';
import { setClockSource } from '../../core/clock';
import { defaultSession } from '../../stores/session';
import { createCombatState } from '../../systems/combatLoop';
import type { CombatLog } from '../../stores/gameStore';
import type { CombatInstanceView, ServerMessage } from '../protocol';

/** 狀態同步的 client 還原（`97-selfhosted-server.md` § 97.2「狀態同步」） */
describe('client 套用 frame', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => 1_000);
    defaultSession.combat = createCombatState();
    defaultSession.mapMonster.setState({ monsters: [] });
    defaultSession.game.setState({ combatLogs: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setClockSource(() => Date.now());
  });

  const frame = (f: Omit<Extract<ServerMessage, { t: 'frame' }>, 't'>): ServerMessage => ({ t: 'frame', ...f });
  const log = (message: string) => ({ message }) as unknown as CombatLog;
  const view = (id: string, currentHp: number): CombatInstanceView => ({
    id, name: '史萊姆', level: 3, currentHp, maxHp: 100, isBoss: false, element: 'none', attackType: 'melee',
  });

  it('戰鬥日誌接上新增的筆數並保留最後 length 筆', () => {
    const a = log('a'), b = log('b'), c = log('c');
    applyServerMessage(frame({ stores: { game: { set: { combatLogs: [a, b] } } } }));
    applyServerMessage(frame({ stores: { game: { append: { combatLogs: { items: [c], length: 2 } } } } }));
    expect(defaultSession.game.getState().combatLogs).toEqual([b, c]);
  });

  it('角色併入變動欄位，其他欄位保留', () => {
    const ch = defaultSession.game.getState().character;
    applyServerMessage(frame({ stores: { game: { set: { character: { ...(ch ?? {}), name: '甲', hp: 50, mp: 20 } } } } }));
    applyServerMessage(frame({ stores: { game: { merge: { character: { hp: 42 } } } } }));
    expect(defaultSession.game.getState().character).toMatchObject({ name: '甲', hp: 42, mp: 20 });
  });

  it('怪物還原：prevPosition 取上一次位置；沒有位置更新的 tick 插值起點對齊目前位置', () => {
    applyServerMessage(frame({ now: 300, stores: { mapMonster: { set: { monsters: [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] } } } }));
    applyServerMessage(frame({ now: 600, stores: { mapMonster: { set: { monsters: [{ id: 'm1', position: { x: 2, y: 1 }, isBoss: false }] } } } }));
    let [m] = defaultSession.mapMonster.getState().monsters;
    expect(m.prevPosition).toEqual({ x: 1, y: 1 });
    expect(m.position).toEqual({ x: 2, y: 1 });

    applyServerMessage(frame({ now: 900 }));
    [m] = defaultSession.mapMonster.getState().monsters;
    expect(m.prevPosition).toEqual({ x: 2, y: 1 });
  });

  it('怪物戰鬥：full 清掉舊資料，之後依新增、血量、移除更新', () => {
    defaultSession.combat.monsterInstances.set('stale', {} as never);
    applyServerMessage(frame({ now: 300, combat: { full: true, add: [view('m1', 100)], target: null, cast: {} } }));
    expect([...defaultSession.combat.monsterInstances.keys()]).toEqual(['m1']);

    applyServerMessage(frame({ now: 600, combat: { add: [view('m2', 60)], hp: { m1: 70 }, target: 'm2', cast: { m2: 0.5 } } }));
    expect(defaultSession.combat.monsterInstances.get('m1')?.currentHp).toBe(70);
    expect(defaultSession.combat.engine.playerCtx.targetMonsterId).toBe('m2');
    expect(mirrorCastProgress('m2')).toBe(0.5);

    applyServerMessage(frame({ now: 900, combat: { remove: ['m1'] } }));
    expect([...defaultSession.combat.monsterInstances.keys()]).toEqual(['m2']);
    expect(defaultSession.combat.engine.playerCtx.targetMonsterId).toBe('m2');
    expect(mirrorCastProgress('m2')).toBe(0.5);
  });
});
