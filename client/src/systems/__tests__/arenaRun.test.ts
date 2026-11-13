import { describe, expect, it } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import arenaMapJson from '../../maps/arena.json';
import type { MapData } from '../../models/mapControl';
import { ARENA_REGION_ID, arenaWaveSize, type ArenaCharacterRun } from '../../models/arena';
import { addBagItem, getBagItemAmount, type BagItem } from '../../models/bagItem';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import type { Session } from '../../stores/session';
import { ARENA_TICKET_ITEM_IDS } from '../arenaBox';
import { createArenaRun, leaveArenaRun, tickArenaRun, type ArenaExitRecord } from '../arenaRun';
import { createMapInstance, type MapInstance } from '../mapInstance';

const arenaMap = arenaMapJson as unknown as MapData;
const T5_TICKET = ARENA_TICKET_ITEM_IDS[5]!;

interface FakeGame {
  character: { id: number; name: string; className: string; currentRegion: string; currentArea: string; currentZone: string; currentFloor: null };
  bagItems: BagItem[];
  arenaRun: ArenaCharacterRun | null;
  logs: string[];
  pushSystemLog: (text: string) => void;
  saveState: () => void;
}

function fakeSession(id: number, ticketRun = true, tickets = 0): Session {
  const game: StoreApi<FakeGame> = createStore<FakeGame>((set, get) => ({
    character: { id, name: `P${id}`, className: 'knight', currentRegion: ARENA_REGION_ID, currentArea: ARENA_REGION_ID, currentZone: '', currentFloor: null },
    bagItems: tickets > 0 ? addBagItem([], T5_TICKET, tickets) : [],
    arenaRun: {
      runKey: 'k', tier: 5, ticketRun, tickets, returnRegion: 'elsarth-town', theme: 'forest', slotStart: 0,
      wave: 1, elapsedMs: 0, monstersLeft: 0,
    },
    logs: [],
    pushSystemLog: text => set({ logs: [...get().logs, text] }),
    saveState: () => undefined,
  }));
  const mapControl = createStore(() => ({ currentMap: arenaMap, playerPosition: { ...arenaMap.spawnPoint } }));
  return { game, mapControl } as unknown as Session;
}

function setup(sessions: Session[]): { instance: MapInstance; records: ArenaExitRecord[] } {
  const instance = createMapInstance('arena:k', useMapMonsterStore);
  useMapMonsterStore.setState({ monsters: [], combatMonsterIds: [] });
  const run = createArenaRun('k', 5, sessions.map(s => s.game.getState().character!.id!));
  const records: ArenaExitRecord[] = [];
  run.onExit = r => records.push(r);
  instance.arena = run;
  for (const s of sessions) {
    instance.members.push(s);
    s.instance = instance;
  }
  return { instance, records };
}

const clear = () => useMapMonsterStore.setState({ monsters: [] });
const stateOf = (s: Session) => s.game.getState() as unknown as FakeGame;

describe('競技場波次（§ 55.2／§ 55.3）', () => {
  it('第 1 波依人數生怪並寫回 HUD；清空後進下一波', () => {
    const s = fakeSession(1);
    const { instance } = setup([s]);
    tickArenaRun(100, instance, arenaMap);
    expect(useMapMonsterStore.getState().monsters).toHaveLength(arenaWaveSize(1, 1));
    expect(useMapMonsterStore.getState().monsters.every(m => m.arenaSpawn?.affixCount === 0)).toBe(true);
    expect(stateOf(s).arenaRun!.monstersLeft).toBe(arenaWaveSize(1, 1));

    clear();
    tickArenaRun(100, instance, arenaMap);
    expect(instance.arena!.wave).toBe(2);
    tickArenaRun(100, instance, arenaMap);
    expect(instance.arenaSpawnedWave).toBe(2);
  });

  it('組隊數量乘倍率', () => {
    const { instance } = setup([fakeSession(1), fakeSession(2)]);
    tickArenaRun(100, instance, arenaMap);
    expect(useMapMonsterStore.getState().monsters).toHaveLength(arenaWaveSize(1, 2));
  });

  it('無人在場不計時、不出波', () => {
    const { instance } = setup([]);
    tickArenaRun(1000, instance, arenaMap);
    expect(instance.arena!.elapsedMs).toBe(0);
    expect(instance.arenaSpawnedWave).toBeUndefined();
  });

  it('王波清完：票券場隊員得 1 張，非票券場不給', () => {
    const a = fakeSession(1, true);
    const b = fakeSession(2, false);
    const { instance } = setup([a, b]);
    instance.arena!.wave = 10;
    tickArenaRun(100, instance, arenaMap);
    expect(useMapMonsterStore.getState().monsters.every(m => m.isBoss)).toBe(true);
    clear();
    tickArenaRun(100, instance, arenaMap);
    expect(getBagItemAmount(stateOf(a).bagItems, T5_TICKET)).toBe(1);
    expect(stateOf(a).arenaRun!.tickets).toBe(1);
    expect(getBagItemAmount(stateOf(b).bagItems, T5_TICKET)).toBe(0);
    expect(instance.arena!.wave).toBe(11);
  });

  it('打完第 100 波：發票、結算、回進場前的城鎮', () => {
    const s = fakeSession(1);
    const { instance, records } = setup([s]);
    instance.arena!.wave = 100;
    tickArenaRun(100, instance, arenaMap);
    clear();
    tickArenaRun(100, instance, arenaMap);
    expect(instance.arena!.finished).toBe(true);
    expect(getBagItemAmount(stateOf(s).bagItems, T5_TICKET)).toBe(1);
    expect(stateOf(s).arenaRun).toBeNull();
    expect(stateOf(s).character.currentRegion).toBe('elsarth-town');
    expect(records).toEqual([expect.objectContaining({ reason: 'finish', wave: 100, tier: 5, party: false })]);
  });
});

describe('排行榜時間（§ 55.7）', () => {
  it('記到達最後波次的時間，不是離場時間', () => {
    const s = fakeSession(1);
    const { instance, records } = setup([s]);
    tickArenaRun(100, instance, arenaMap);
    tickArenaRun(4900, instance, arenaMap);
    clear();
    tickArenaRun(1000, instance, arenaMap);
    expect(instance.arena!.wave).toBe(2);
    expect(instance.arena!.waveReachedMs).toBe(6000);
    tickArenaRun(30_000, instance, arenaMap);
    leaveArenaRun(s, 'death');
    expect(records[0]).toMatchObject({ wave: 2, timeMs: 6000 });
  });

  it('打完 100 波記打完的時間', () => {
    const s = fakeSession(1);
    const { instance, records } = setup([s]);
    instance.arena!.wave = 100;
    tickArenaRun(100, instance, arenaMap);
    clear();
    tickArenaRun(200, instance, arenaMap);
    expect(records[0]).toMatchObject({ reason: 'finish', timeMs: 300 });
  });
});

describe('競技場離場（§ 55.5）', () => {
  it('死亡收回本場票券的一半（無條件捨去）並回城', () => {
    const s = fakeSession(1, true, 5);
    const { records } = setup([s]);
    leaveArenaRun(s, 'death');
    expect(getBagItemAmount(stateOf(s).bagItems, T5_TICKET)).toBe(3);
    expect(stateOf(s).character.currentRegion).toBe('elsarth-town');
    expect(stateOf(s).arenaRun).toBeNull();
    expect(records[0].reason).toBe('death');
  });

  it('撤退票券全留，傳送交給回城卷軸', () => {
    const s = fakeSession(1, true, 5);
    setup([s]);
    leaveArenaRun(s, 'retreat');
    expect(getBagItemAmount(stateOf(s).bagItems, T5_TICKET)).toBe(5);
    expect(stateOf(s).character.currentRegion).toBe(ARENA_REGION_ID);
    expect(stateOf(s).arenaRun).toBeNull();
  });
});
