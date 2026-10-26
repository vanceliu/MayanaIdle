import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Session } from '../../stores/session';
import type { MapInstance } from '../mapInstance';

/** tick 錯誤隔離（`97-selfhosted-server.md` § 97.2 硬性要求） */
const broken = new Set<unknown>();
const calls: string[] = [];

function step(name: string, target: unknown) {
  calls.push(name);
  if (broken.has(target)) throw new Error(`${name} failed`);
}

vi.mock('../gameLoop', () => ({
  snapshotPrevPlayerPosition: (s: unknown) => step('snapshotPlayer', s),
  snapshotPrevMonsterPositions: (i: unknown) => step('snapshotMonsters', i),
  tickPlayerPre: (_d: number, s: unknown) => step('playerPre', s),
  tickInstanceWorld: (_d: number, i: unknown) => step('instanceWorld', i),
  tickPlayerPost: (_d: number, s: unknown) => step('playerPost', s),
}));

vi.mock('../combatLoop', () => ({
  tickInstanceCombat: (_d: number, i: unknown) => { step('instanceCombat', i); return []; },
  tickMemberCombat: (_d: number, s: unknown) => { step('memberCombat', s); return []; },
  applyMonsterAttacks: () => [],
}));

const { tickWorld } = await import('../worldTick');

function member(id: number): Session {
  const character = { id };
  return {
    game: { getState: () => ({ character }) },
    mapControl: { getState: () => ({ currentMap: { id: 'map' } }) },
    loop: { selfCastFx: [] },
  } as unknown as Session;
}

function instance(key: string, members: Session[]): MapInstance {
  const i = { key, members } as unknown as MapInstance;
  for (const m of members) (m as { instance: MapInstance }).instance = i;
  return i;
}

beforeEach(() => {
  broken.clear();
  calls.length = 0;
});

describe('tickWorld 錯誤隔離', () => {
  it('玩家步驟出錯：回報該玩家一次，其餘步驟跳過，其他玩家照常', () => {
    const bad = member(1);
    const good = member(2);
    const instances = [instance('a', [bad]), instance('b', [good])];
    broken.add(bad);
    const onFault = vi.fn();

    const result = tickWorld(100, [bad, good], instances, onFault);

    expect(onFault).toHaveBeenCalledTimes(1);
    expect(onFault.mock.calls[0][0]).toMatchObject({ kind: 'session', session: bad });
    expect(calls.filter(c => c === 'memberCombat')).toHaveLength(1);
    expect(result.has(good)).toBe(true);
  });

  it('單人實例出錯：回報實例，也回報該名玩家', () => {
    const solo = member(1);
    const inst = instance('solo', [solo]);
    broken.add(inst);
    const onFault = vi.fn();

    tickWorld(100, [solo], [inst], onFault);

    expect(onFault.mock.calls.map(c => c[0].kind)).toEqual(['instance', 'session']);
    expect(onFault.mock.calls[1][0].session).toBe(solo);
    expect(calls.filter(c => c === 'instanceWorld')).toHaveLength(0);
    expect(calls.filter(c => c === 'memberCombat')).toHaveLength(0);
  });

  it('多人實例出錯：只回報實例，成員不受牽連，其他實例照常', () => {
    const a = member(1);
    const b = member(2);
    const c = member(3);
    const party = instance('party', [a, b]);
    const other = instance('other', [c]);
    broken.add(party);
    const onFault = vi.fn();

    tickWorld(100, [a, b, c], [party, other], onFault);

    expect(onFault.mock.calls.map(x => x[0].kind)).toEqual(['instance']);
    expect(calls.filter(x => x === 'instanceWorld')).toHaveLength(1);
    expect(calls.filter(x => x === 'memberCombat')).toHaveLength(3);
  });
});
