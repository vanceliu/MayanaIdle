/**
 * T7 擊殺回血對 DoT 擊殺同樣生效（`07-affix-tier7.md` § 7T.4）。
 * 走 `tickCombat` 的 DoT 結算，玩家不出手，怪只被自己施加的 DoT 打死。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tickCombat } from '../combatLoop';
import { createMapInstance, attachInstance } from '../mapInstance';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useTalentStore } from '../../stores/talentStore';
import { defaultSession } from '../../stores/session';
import { createMonsterCombatContext } from '../monsterCombatFSM';
import type { MapData } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

const NOW = 2_000_000;

const MAP: MapData = {
  id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 5, y: 5 }, autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 60,
    exp: 0, expToNext: 1_000_000, hp: 100, maxHp: 1000, mp: 50, maxMp: 50,
    baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

function sword(killHeal?: number): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0, affixes: [],
    ownerId: 1, equipped: true, ...(killHeal ? { uniqueAffix: { type: 'kill_heal', value: killHeal } } : {}),
  } as EquipmentInstance;
}

function dot(monsterId: string): ActiveEffect {
  return {
    id: `dot-${monsterId}`, sourceSkillId: 'element-erosion', sourceSkillName: '元素侵蝕', category: 'dot-erosion',
    type: 'debuff', target: 'monster', targetMonsterId: monsterId,
    dot: { damage: 5, element: 'fire', interval: 1000, totalDuration: 5000 },
    startTime: NOW - 500, duration: 5000, tags: [], name: '元素侵蝕', description: '',
  };
}

function setup(monsterHp: number[], killHeal?: number) {
  const instance = createMapInstance('test', useMapMonsterStore);
  attachInstance(defaultSession, instance);
  const mapMonsters: MapMonster[] = [];
  monsterHp.forEach((hp, i) => {
    const id = `m${i + 1}`;
    const mapMonster: MapMonster = {
      id, position: { x: 8, y: 2 + i * 2 }, targetPosition: { x: 8, y: 2 + i * 2 },
      speed: 0, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
      lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false, attackRange: 1.5,
    };
    const inst: MonsterInstance = {
      templateId: 1, name: `怪${i + 1}`, level: 1, currentHp: hp, maxHp: 30,
      attackMin: 1, attackMax: 1, defense: 0, exp: 1,
      race: 'normal', size: 'small', element: 'none', isBoss: false,
      attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
    };
    mapMonsters.push(mapMonster);
    defaultSession.combat.monsterInstances.set(id, inst);
    defaultSession.combat.engine.monsters.set(id, {
      instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
      attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
    });
  });
  useMapMonsterStore.setState({ monsters: mapMonsters, combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: MAP, playerPosition: { x: 5, y: 5 }, prevPlayerPosition: { x: 5, y: 5 },
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
  });
  useGameStore.setState({
    character: character(), equippedGear: { rightHand: sword(killHeal) } as never, inventory: [], bagItems: [],
    activeEffects: mapMonsters.map(m => dot(m.id)), combatLogs: [], skills: [],
  });
  useTalentStore.setState({ slots: [] });
  defaultSession.combat.engine.playerCtx.targetMonsterId = null;
}

/** DoT 結算由遊戲迴圈每秒設一次旗標（`gameLoop.ts` 的 `consumeDotTick`），這裡直接打開跑一個 tick */
function tickUntilDotResolves() {
  defaultSession.loop.dotTickReady = true;
  tickCombat(300, defaultSession);
}

describe('DoT 擊殺觸發擊殺回血', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('DoT 打死一隻回一次', () => {
    setup([3], 40);
    tickUntilDotResolves();
    expect(defaultSession.combat.monsterInstances.get('m1')?.currentHp ?? 0).toBe(0);
    expect(useGameStore.getState().character!.hp).toBe(140);
  });

  it('同一個 tick 打死兩隻回兩次', () => {
    setup([3, 4], 40);
    tickUntilDotResolves();
    expect(useGameStore.getState().character!.hp).toBe(180);
  });

  it('DoT 沒打死不回；沒有擊殺回血也不回', () => {
    setup([50], 40);
    tickUntilDotResolves();
    expect(useGameStore.getState().character!.hp).toBe(100);

    setup([3]);
    tickUntilDotResolves();
    expect(useGameStore.getState().character!.hp).toBe(100);
  });
});
