/**
 * 後躍射擊（`23-class-magic.md` § 23.4、`41-arpg-combat.md` § 3.6 後退）：先退再射，退不了只射不跳。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tickCombat, type CombatVisual } from '../combatLoop';
import { createMapInstance, attachInstance } from '../mapInstance';
import { useGameStore } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { useMapMonsterStore, type MapMonster } from '../../stores/mapMonsterStore';
import { useTalentStore } from '../../stores/talentStore';
import { defaultSession } from '../../stores/session';
import { createMonsterCombatContext } from '../monsterCombatFSM';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { MapData, Position } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

const MAP: MapData = {
  id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 5, y: 5 }, autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'elf', level: 60,
    exp: 0, expToNext: 1_000_000, hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 12, AGI: 25, VIT: 14, SPI: 12, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

function bow(): EquipmentInstance {
  return {
    id: 1, templateId: 9, name: '短弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
    smallMonsterDamage: 30, largeMonsterDamage: 25, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function setup(playerPos: Position, monsterPos: Position): void {
  const instance = createMapInstance('test', useMapMonsterStore);
  attachInstance(defaultSession, instance);
  const mapMonster: MapMonster = {
    id: 'm1', position: { ...monsterPos }, targetPosition: { ...playerPos },
    speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { ...playerPos }, isBoss: false, attackRange: 1.5,
  };
  const inst: MonsterInstance = {
    templateId: 1, name: '木頭人', level: 1, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
  };
  useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: MAP, playerPosition: { ...playerPos }, prevPlayerPosition: { ...playerPos },
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
  });
  const leap = { ...getSkillTemplate('leap-shot')!, lastUsedAt: 0 };
  useGameStore.setState({
    character: character(), equippedGear: { rightHand: bow() } as never, inventory: [], bagItems: [],
    activeEffects: [], combatLogs: [], skills: [leap],
  });
  useTalentStore.setState({ slots: [] });

  defaultSession.combat.monsterInstances.set('m1', inst);
  defaultSession.combat.engine.monsters.set('m1', {
    instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
    attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
  });
  defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
  defaultSession.combat.engine.playerCtx.attackTimer = 100_000;
  defaultSession.loop.occupation.clear();
  defaultSession.loop.occupation.register(playerPos, 'player', 'player-1');
  defaultSession.loop.occupation.register(monsterPos, 'monster', 'm1');
}

function castLeap(): CombatVisual[] {
  for (let i = 0; i < 6; i++) {
    defaultSession.combatCommand.getState().requestSkill('leap-shot');
    const visuals = tickCombat(300, defaultSession);
    if (visuals.some(v => v.kind === 'player_attack')) return visuals;
  }
  return [];
}

describe('後躍射擊', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('往目標反方向退 2 格，再從落點射出', () => {
    setup({ x: 5, y: 5 }, { x: 8, y: 5 });
    const visuals = castLeap();
    expect(useMapControlStore.getState().playerPosition).toEqual({ x: 3, y: 5 });
    expect(visuals.find(v => v.kind === 'dash')).toMatchObject({ from: { x: 5, y: 5 }, to: { x: 3, y: 5 } });
    expect(visuals.find(v => v.kind === 'player_attack')).toMatchObject({ playerPos: { x: 3, y: 5 }, ranged: true });
    expect(useGameStore.getState().character!.mp).toBe(70);
  });

  it('背後是牆：不移動，照常射擊', () => {
    setup({ x: 1, y: 5 }, { x: 4, y: 5 });
    const visuals = castLeap();
    expect(useMapControlStore.getState().playerPosition).toEqual({ x: 1, y: 5 });
    expect(visuals.some(v => v.kind === 'dash')).toBe(false);
    const attack = visuals.find(v => v.kind === 'player_attack');
    expect(attack).toBeDefined();
    expect((attack as Extract<CombatVisual, { kind: 'player_attack' }>).result.damages[0].damage).toBeGreaterThan(0);
  });
});
