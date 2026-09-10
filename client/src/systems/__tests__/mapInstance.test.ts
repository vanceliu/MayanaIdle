import { describe, it, expect } from 'vitest';
import { createMapMonsterStore } from '../../stores/mapMonsterStore';
import { createMapControlStore } from '../../stores/mapControlStore';
import { createLoopState, type Session } from '../../stores/session';
import {
  attachInstance, createMapInstance, createCombatState, detachInstance, leaveInstance, presentMembers, monsterTargetPosition,
} from '../mapInstance';
import { partyMaxMonsters } from '../pressure';
import { createMonsterTargetState } from '../monsterTargeting';

/** § 97.7.1 實例：成員共用怪物 store 與怪物實例；最後一位離開時清空 */

function fakeSession(id: number, areaKills = 0): Session {
  const s = {
    loop: createLoopState(),
    combat: createCombatState(),
    game: { getState: () => ({ character: { id, areaKills, areaEnteredAt: 0, hp: 100 } }) },
  } as unknown as Session;
  s.mapControl = createMapControlStore(s);
  s.mapMonster = createMapMonsterStore(s);
  s.mapControl.setState({ currentMap: { id: 'm', name: 'm', width: 5, height: 5, spawnPoint: { x: 0, y: 0 }, tiles: [[0]] } as never, playerPosition: { x: id, y: 0 } });
  return s;
}

describe('MapInstance', () => {
  it('attach 後 session 的 mapMonster／monsterInstances／occupation 都是實例的別名', () => {
    const inst = createMapInstance('k');
    const a = fakeSession(1);
    const b = fakeSession(2);
    attachInstance(a, inst);
    attachInstance(b, inst);
    expect(a.mapMonster).toBe(inst.mapMonster);
    expect(b.mapMonster).toBe(inst.mapMonster);
    expect(a.combat.monsterInstances).toBe(b.combat.monsterInstances);
    expect(a.combat.engine.monsters).toBe(inst.engineMonsters);
    expect(a.loop.occupation).toBe(inst.occupation);
    expect(presentMembers(inst)).toEqual([a, b]);
  });

  it('第一位成員以自己的 areaKills 起算擊殺數，後來的人不覆蓋', () => {
    const inst = createMapInstance('k');
    attachInstance(fakeSession(1, 640), inst);
    attachInstance(fakeSession(2, 5), inst);
    expect(inst.kills).toBe(640);
  });

  it('最後一位離開時清空；還有人時保留', () => {
    const inst = createMapInstance('k');
    const a = fakeSession(1);
    const b = fakeSession(2);
    attachInstance(a, inst);
    attachInstance(b, inst);
    inst.kills = 700;
    inst.mapMonster.setState({ monsters: [{ id: 'x' } as never] });
    detachInstance(a);
    expect(inst.kills).toBe(700);
    expect(inst.mapMonster.getState().monsters).toHaveLength(1);
    detachInstance(b);
    expect(inst.kills).toBe(0);
    expect(inst.mapMonster.getState().monsters).toHaveLength(0);
  });

  it('leaveInstance：原實例只有自己就清空後沿用；還有別人就另建私有實例', () => {
    const a = fakeSession(1);
    const b = fakeSession(2);
    const shared = createMapInstance('k');
    attachInstance(a, shared);
    attachInstance(b, shared);
    const fresh = leaveInstance(b);
    expect(fresh).not.toBe(shared);
    expect(b.instance).toBe(fresh);
    expect(shared.members).toEqual([a]);
    const reused = leaveInstance(a);
    expect(reused).toBe(shared);
    expect(shared.members).toEqual([a]);
  });

  it('怪物追目標成員；沒有目標時追最近的在場成員', () => {
    const inst = createMapInstance('k');
    const a = fakeSession(1);
    const b = fakeSession(4);
    attachInstance(a, inst);
    attachInstance(b, inst);
    expect(monsterTargetPosition(inst, 'm1', { x: 3.5, y: 0 })).toEqual({ x: 4, y: 0 });
    const state = createMonsterTargetState();
    state.targetId = 1;
    inst.targeting.set('m1', state);
    expect(monsterTargetPosition(inst, 'm1', { x: 3.5, y: 0 })).toEqual({ x: 1, y: 0 });
  });
});

describe('partyMaxMonsters（§ 97.7.1）', () => {
  it.each([
    [1, 0, 3], [1, 7, 10], [1, 9, 10],
    [2, 0, 5], [2, 3, 8], [2, 7, 12],
    [3, 0, 7], [3, 5, 12],
    [5, 0, 11], [5, 7, 18], [5, 12, 20],
  ])('%i 人 P=%i → %i', (n, p, expected) => {
    expect(partyMaxMonsters(p, n)).toBe(expected);
  });
});
