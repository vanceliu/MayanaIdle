import { describe, it, expect, beforeEach } from 'vitest';
import { gameLoopTick } from '../gameLoop';
import { findAttackPosition } from '../pathfinding';
import { getDistance } from '../lineOfSight';
import { createPlayerCombatContext, tickPlayerCombat, type MonsterInfo } from '../playerCombatFSM';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { MapData } from '../../models/mapControl';

/**
 * 回歸情境：怪物停在射程外不動、角色也不出手，雙方靜止。
 *
 * 成因為射程判定用真實座標、落腳格判定用四捨五入的格心，兩者最多差 0.7 格，
 * 停在格與格之間時雙方會同時判定「已就位」。
 * 修正方向是**判定對齊**（一律用真實座標判），不是把位置拉回格心。
 */

/** 外圍一圈牆、內部全空的地圖；`autoSpawn: false` 讓測試期間不會自己生怪 */
function openMap(size = 12): MapData {
  return {
    id: 'test-map',
    name: 'Test Map',
    width: size,
    height: size,
    spawnPoint: { x: 5, y: 5 },
    autoSpawn: false,
    tiles: Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) =>
        (x === 0 || y === 0 || x === size - 1 || y === size - 1) ? 1 : 0
      )
    ),
  };
}

const MAP = openMap();
const MELEE_RANGE = 1.5;

function createCharacter(): Character {
  return {
    userId: 1,
    name: '騎士',
    className: 'knight',
    level: 6,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 45,
    maxMp: 45,
    baseAttributes: { STR: 14, AGI: 10, VIT: 14, SPI: 8, INT: 8, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: 'verdant-valley',
    currentZone: 'verdant-valley',
    currentRegion: 'verdant-valley',
    currentFloor: null,
    skills: [],
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
  };
}

function makeMonster(id: string, position: Position, overrides: Partial<MapMonster> = {}): MapMonster {
  return {
    id,
    position,
    targetPosition: { ...position },
    speed: 1,
    path: [],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: { ...position },
    isBoss: false,
    attackRange: MELEE_RANGE,
    ...overrides,
  };
}

interface Position { x: number; y: number }

function setup(
  player: { position?: Position; path?: Position[]; isMoving?: boolean },
  monsters: MapMonster[],
) {
  useGameStore.setState({ character: createCharacter(), equippedGear: {}, activeEffects: [], combatLogs: [] });
  useMapControlStore.setState({
    currentMap: MAP,
    playerPosition: player.position ?? { x: 5, y: 5 },
    targetPosition: null,
    currentPath: player.path ?? [],
    pathIndex: 0,
    isMoving: player.isMoving ?? false,
    autoMove: true,
    moveSpeed: 2,
  });
  useMapMonsterStore.setState({ monsters, paused: false, combatMonsterIds: [], maxMonsters: 3 });
}

describe('落腳格判定用真實座標', () => {
  it('停在格與格之間且超出射程時，不會把原地當成已就位', () => {
    const monster = { x: 8, y: 5 };
    const from = { x: 6.4, y: 5 };   // 真實距離 1.6 > 1.5，四捨五入後的格心距離 2 也不合格
    const between = { x: 6.6, y: 5 }; // 真實距離 1.4 ≤ 1.5，但格心（7,5）距離 1 也合格

    // 超出射程：必須挑別的格子，回原地會讓角色站著不動也不出手
    expect(findAttackPosition(MAP, monster, from, MELEE_RANGE)).not.toEqual({ x: 6, y: 5 });
    // 已在射程內：回原地才對，多走一步是白走
    expect(findAttackPosition(MAP, monster, between, MELEE_RANGE)).toEqual({ x: 7, y: 5 });
  });

  it('回傳的落腳格一律真的打得到目標', () => {
    const monster = { x: 8.3, y: 5.4 };
    const position = findAttackPosition(MAP, monster, { x: 3.2, y: 5 }, MELEE_RANGE)!;

    expect(position).not.toBeNull();
    expect(getDistance(position, monster)).toBeLessThanOrEqual(MELEE_RANGE);
  });
});

describe('停下時位置不回拉', () => {
  beforeEach(() => {
    useMapMonsterStore.getState().clearAll();
  });

  it('角色被怪擋住時停在原地並清空路徑，不倒退回格心', () => {
    setup(
      { position: { x: 5.4, y: 5 }, path: [{ x: 6, y: 5 }, { x: 7, y: 5 }], isMoving: true },
      [makeMonster('m1', { x: 6, y: 5 })],
    );

    gameLoopTick(100);

    const state = useMapControlStore.getState();
    expect(state.playerPosition).toEqual({ x: 5.4, y: 5 });
    expect(state.currentPath).toHaveLength(0);
    expect(state.isMoving).toBe(false);
  });

  it('怪物被別的怪擋住時停在原地並丟掉走不通的路徑', () => {
    setup({ position: { x: 5, y: 5 } }, [
      makeMonster('blocker', { x: 8, y: 5 }),
      // 路徑剛算完（玩家沒移動、計時器歸零）：這一幀只走路，不重算
      makeMonster('m1', { x: 9.4, y: 5 }, {
        path: [{ x: 8, y: 5 }], pathIndex: 0, lastPathPlayerPos: { x: 5, y: 5 },
      }),
    ]);

    gameLoopTick(100);

    const blocked = useMapMonsterStore.getState().monsters.find(m => m.id === 'm1')!;
    expect(blocked.position).toEqual({ x: 9.4, y: 5 });
    expect(blocked.path).toHaveLength(0);
  });
});

describe('追擊尋路繞開怪物', () => {
  it('路徑不穿過被佔住的格子', () => {
    setup({ position: { x: 5, y: 5 } }, []);
    const occupied = new Set(['4,6', '5,6', '6,6']);

    useMapControlStore.getState().moveToTarget({ x: 5, y: 8 }, occupied);

    const path = useMapControlStore.getState().currentPath;
    expect(path.length).toBeGreaterThan(0);
    expect(path.some(p => occupied.has(`${p.x},${p.y}`))).toBe(false);
  });

  it('繞不開時照原本的路走，不是原地不動', () => {
    setup({ position: { x: 5, y: 5 } }, []);
    // 目標四周全被佔住：繞路解不出來，仍要排出路徑
    const occupied = new Set(['4,7', '5,7', '6,7', '4,8', '6,8', '4,9', '5,9', '6,9']);

    useMapControlStore.getState().moveToTarget({ x: 5, y: 8 }, occupied);

    expect(useMapControlStore.getState().currentPath.length).toBeGreaterThan(0);
    expect(useMapControlStore.getState().isMoving).toBe(true);
  });
});

describe('僵局回歸', () => {
  it('怪物停在格與格之間、距離超出射程時會繼續走進來，不會靜止', () => {
    setup({ position: { x: 5, y: 5 } }, [makeMonster('m1', { x: 7.4, y: 5 })]);

    for (let i = 0; i < 20; i++) gameLoopTick(100);

    const monster = useMapMonsterStore.getState().monsters[0];
    expect(getDistance(monster.position, { x: 5, y: 5 })).toBeLessThanOrEqual(MELEE_RANGE);
  });

  it('角色停在格與格之間、距離在射程內時出得了手', () => {
    const playerPos = { x: 5.4, y: 5 };
    const monsters: MonsterInfo[] = [{ id: 'm1', index: 0, position: { x: 6.6, y: 5 }, alive: true }];
    const ctx = createPlayerCombatContext();

    const result = tickPlayerCombat(
      ctx, playerPos, monsters, { attackType: 'melee', range: MELEE_RANGE }, MAP, ctx.attackCooldown,
    );

    expect(result.action).toBe('attack');
    expect(result.attackTargetIdx).toBe(0);
  });
});
