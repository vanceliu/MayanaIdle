/**
 * 走不到的目標（`41-arpg-combat.md` § 4.3）與突進追擊落腳格（§ 3.6），走完整戰鬥迴圈。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tickCombat } from '../combatLoop';
import { createMapInstance, attachInstance } from '../mapInstance';
import { applyManualTarget } from '../arpgEngine';
import { planDash } from '../dash';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useTalentStore } from '../../stores/talentStore';
import { defaultSession } from '../../stores/session';
import { createMonsterCombatContext } from '../monsterCombatFSM';
import { getSkillTemplate } from '../../models/skillTemplate';
import { TileType, type MapData, type Position } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';

const G = TileType.Ground;
const W = TileType.Wall;
const A = TileType.Water;

function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 50,
    exp: 0, expToNext: 1_000_000, hp: 500, mp: 100,
    baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

function instance(): MonsterInstance {
  return {
    templateId: 1, name: '木頭人', level: 1, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
  };
}

/** 外框為牆的地圖，`walls`／`water` 為內部障礙 */
function makeMap(width: number, height: number, walls: Position[], water: Position[] = []): MapData {
  const has = (list: Position[], x: number, y: number) => list.some(p => p.x === x && p.y === y);
  return {
    id: 'test-map', name: 'Test Map', width, height, spawnPoint: { x: 1, y: 1 }, autoSpawn: false,
    tiles: Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || has(walls, x, y)) return W;
      return has(water, x, y) ? A : G;
    })),
  };
}

function setup(map: MapData, playerPos: Position, monsters: { id: string; pos: Position }[], skillIds: string[] = []): void {
  attachInstance(defaultSession, createMapInstance('test', useMapMonsterStore));
  const mapMonsters: MapMonster[] = monsters.map(m => ({
    id: m.id, position: { ...m.pos }, targetPosition: { ...m.pos },
    speed: 0, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { ...playerPos }, isBoss: false, attackRange: 1.5,
  }));
  useMapMonsterStore.setState({ monsters: mapMonsters, combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: map, playerPosition: { ...playerPos }, prevPlayerPosition: { ...playerPos },
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: true, paused: false,
  });
  const skills = skillIds.map(id => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 }));
  useGameStore.setState({ character: character(), equippedGear: {}, inventory: [], bagItems: [], activeEffects: [], combatLogs: [], skills });
  useTalentStore.setState({ slots: [] });

  defaultSession.loop.occupation.clear();
  defaultSession.loop.occupation.register(playerPos, 'player', 'player-1');
  for (const m of mapMonsters) {
    const inst = instance();
    defaultSession.combat.monsterInstances.set(m.id, inst);
    defaultSession.combat.engine.monsters.set(m.id, {
      instance: inst, mapMonster: m, combatCtx: createMonsterCombatContext(),
      attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
    });
    defaultSession.loop.occupation.register(m.position, 'monster', m.id);
  }
}

/** 被牆圍住、四周沒有可站的格子 */
const ENCLOSED = { x: 6, y: 5 };
const RING = [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dy => ({ x: ENCLOSED.x + dx, y: ENCLOSED.y + dy })))
  .filter(p => p.x !== ENCLOSED.x || p.y !== ENCLOSED.y);

describe('走不到的目標（§ 4.3）', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('最近的怪走不到：排除 5 秒並改追下一隻，不會卡在原地', () => {
    setup(makeMap(12, 12, RING), { x: 3, y: 5 }, [
      { id: 'stuck', pos: ENCLOSED },
      { id: 'open', pos: { x: 3, y: 10 } },
    ]);
    defaultSession.combat.engine.playerCtx.targetMonsterId = 'stuck';

    for (let i = 0; i < 3; i++) tickCombat(16, defaultSession);

    const ctx = defaultSession.combat.engine.playerCtx;
    expect(ctx.unreachableUntil.has('stuck')).toBe(true);
    expect(ctx.targetMonsterId).toBe('open');
    expect(useMapControlStore.getState().isMoving).toBe(true);
  });

  it('手動點選被排除的怪：解除排除，重新嘗試', () => {
    setup(makeMap(12, 12, RING), { x: 3, y: 5 }, [{ id: 'stuck', pos: ENCLOSED }]);
    tickCombat(16, defaultSession);
    const ctx = defaultSession.combat.engine.playerCtx;
    expect(ctx.unreachableUntil.has('stuck')).toBe(true);

    expect(applyManualTarget(defaultSession.combat.engine, 'stuck')).toBe(true);
    expect(ctx.unreachableUntil.has('stuck')).toBe(false);
  });
});

describe('突進追擊落腳格（§ 3.6）', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  // 水池擋在中間（有視線、直線走不過去），最下排可繞路
  const water = Array.from({ length: 6 }, (_, i) => ({ x: 10, y: i + 1 }));
  const MONSTER = { x: 13, y: 3 };

  it('射程外追擊：走到突進得了的格子，不停在水邊', () => {
    const map = makeMap(16, 9, [], water);
    setup(map, { x: 1, y: 3 }, [{ id: 'm1', pos: MONSTER }], ['charge']);
    defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';

    defaultSession.combatCommand.getState().requestSkill('charge');
    tickCombat(16, defaultSession);

    const path = useMapControlStore.getState().currentPath;
    const dest = path[path.length - 1];
    expect(dest).toBeDefined();
    expect(planDash(map, dest, MONSTER, 8, defaultSession.loop.occupation.getOccupiedSet('player-1'))).not.toBeNull();
  });

  it('手動突進在射程內卻沒有落點：交給天賦，不站著空轉', () => {
    const map = makeMap(16, 9, [], water);
    setup(map, { x: 7, y: 3 }, [{ id: 'm1', pos: MONSTER }], ['charge']);
    defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
    defaultSession.combat.engine.playerCtx.attackTimer = 100_000;

    defaultSession.combatCommand.getState().requestSkill('charge');
    tickCombat(16, defaultSession);

    expect(defaultSession.combat.engine.playerCtx.state).not.toBe('attacking');
    expect(useGameStore.getState().skills[0].lastUsedAt).toBe(0);
  });
});
