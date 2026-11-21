/**
 * 戰鬥後等待在競技場不觸發（`03-combat.md` § 戰鬥後等待、`55-arena.md`）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tickPlayerPre } from '../gameLoop';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore } from '../../stores/mapMonsterStore';
import { defaultSession } from '../../stores/session';
import { ARENA_REGION_ID } from '../../models/arena';
import type { MapData } from '../../models/mapControl';

const testMap: MapData = {
  id: 'test-map',
  name: 'Test Map',
  width: 6,
  height: 6,
  spawnPoint: { x: 3, y: 3 },
  tiles: Array.from({ length: 6 }, (_, y) => Array.from({ length: 6 }, (_, x) => (x === 0 || y === 0 || x === 5 || y === 5 ? 1 : 0))),
};

function setup(region: string, paused: boolean) {
  useGameStore.setState({
    phase: 'explore',
    searchMode: 'auto',
    combatLogs: [],
    character: {
      name: 'TestHero', className: 'knight', level: 10, exp: 0, expToNext: 1000,
      hp: 1, mp: 1,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 0, currentArea: region, currentZone: region, currentRegion: region, currentFloor: null,
      skills: [], quests: [], areaKills: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
    },
  });
  useMapMonsterStore.setState({ monsters: [], combatMonsterIds: [] });
  useMapControlStore.setState({
    currentMap: testMap, playerPosition: { x: 3, y: 3 }, targetPosition: null,
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: !paused, paused,
  });
  defaultSession.loop.pauseLogShown = false;
}

describe('戰鬥後等待與競技場', () => {
  beforeEach(() => setup('dawn-plains', false));

  it('野外 HP 低於門檻且附近無怪：進入等待並寫日誌', () => {
    tickPlayerPre(16, defaultSession);
    expect(useMapControlStore.getState().paused).toBe(true);
    expect(useGameStore.getState().combatLogs.some(l => l.text.includes('等待恢復中'))).toBe(true);
  });

  it('競技場 HP 低於門檻：不進入等待', () => {
    setup(ARENA_REGION_ID, false);
    tickPlayerPre(16, defaultSession);
    expect(useMapControlStore.getState().paused).toBe(false);
    expect(useGameStore.getState().combatLogs.some(l => l.text.includes('等待恢復中'))).toBe(false);
  });

  it('帶著等待狀態進競技場：立即解除', () => {
    setup(ARENA_REGION_ID, true);
    tickPlayerPre(16, defaultSession);
    expect(useMapControlStore.getState().paused).toBe(false);
    expect(useMapControlStore.getState().autoMove).toBe(true);
  });
});
