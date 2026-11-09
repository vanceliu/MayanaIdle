/**
 * 衝鋒突進的位移（`41-arpg-combat.md` § 3.6）：判定瞬間落地，演出事件帶起點與落點。
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
import type { MapData } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';

const MAP: MapData = {
  id: 'test-map', name: 'Test Map', width: 12, height: 12, spawnPoint: { x: 2, y: 5 }, autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 50,
    exp: 0, expToNext: 1_000_000, hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

const MONSTER_POS = { x: 8, y: 5 };

function setup(): void {
  const instance = createMapInstance('test', useMapMonsterStore);
  attachInstance(defaultSession, instance);
  const mapMonster: MapMonster = {
    id: 'm1', position: { ...MONSTER_POS }, targetPosition: { x: 2, y: 5 },
    speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 2, y: 5 }, isBoss: false, attackRange: 1.5,
  };
  const inst: MonsterInstance = {
    templateId: 1, name: '木頭人', level: 1, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
  };
  useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: MAP, playerPosition: { x: 2, y: 5 }, prevPlayerPosition: { x: 2, y: 5 },
    currentPath: [{ x: 3, y: 5 }, { x: 4, y: 5 }], pathIndex: 0, isMoving: true, autoMove: false, paused: false,
  });
  const charge = { ...getSkillTemplate('charge')!, lastUsedAt: 0 };
  useGameStore.setState({ character: character(), equippedGear: {}, inventory: [], bagItems: [], activeEffects: [], combatLogs: [], skills: [charge] });
  useTalentStore.setState({ slots: [] });

  defaultSession.combat.monsterInstances.set('m1', inst);
  defaultSession.combat.engine.monsters.set('m1', {
    instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
    attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
  });
  defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
  defaultSession.combat.engine.playerCtx.attackTimer = 100_000;
  defaultSession.loop.occupation.clear();
  defaultSession.loop.occupation.register({ x: 2, y: 5 }, 'player', 'player-1');
  defaultSession.loop.occupation.register(MONSTER_POS, 'monster', 'm1');
}

function castCharge(): CombatVisual[] {
  for (let i = 0; i < 6; i++) {
    defaultSession.combatCommand.getState().requestSkill('charge');
    const visuals = tickCombat(300, defaultSession);
    if (visuals.some(v => v.kind === 'player_attack')) return visuals;
  }
  return [];
}

describe('衝鋒突進', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    setup();
  });

  it('瞬間落到目標相鄰格，前一 tick 位置同步、路徑清空', () => {
    castCharge();
    const mc = useMapControlStore.getState();
    expect(mc.playerPosition).toEqual({ x: 7, y: 5 });
    expect(mc.prevPlayerPosition).toEqual({ x: 7, y: 5 });
    expect(mc.currentPath).toEqual([]);
    expect(mc.isMoving).toBe(false);
  });

  it('佔位表換到落點', () => {
    castCharge();
    const occ = defaultSession.loop.occupation;
    expect(occ.isOccupiedByType({ x: 2, y: 5 }, 'player')).toBe(false);
    expect(occ.isOccupiedByType({ x: 7, y: 5 }, 'player')).toBe(true);
  });

  it('演出事件：先突進再出手，出手位置是落點、不是遠程', () => {
    const visuals = castCharge();
    const dashIdx = visuals.findIndex(v => v.kind === 'dash');
    const attackIdx = visuals.findIndex(v => v.kind === 'player_attack');
    expect(dashIdx).toBeGreaterThanOrEqual(0);
    expect(dashIdx).toBeLessThan(attackIdx);
    expect(visuals[dashIdx]).toMatchObject({ from: { x: 2, y: 5 }, to: { x: 7, y: 5 } });
    expect(visuals[attackIdx]).toMatchObject({ playerPos: { x: 7, y: 5 }, ranged: false });
  });

  it('扣 MP 15、進冷卻', () => {
    castCharge();
    const gs = useGameStore.getState();
    expect(gs.character!.mp).toBe(85);
    expect(gs.skills[0].lastUsedAt).toBeGreaterThan(0);
  });
});

describe('神聖懲擊強化（`07-affix-ability.md` § 7S.5）', () => {
  function setupSmite(): void {
    setup();
    const smite = { ...getSkillTemplate('holy-smite')!, lastUsedAt: 0 };
    const staff = {
      id: 9, templateId: 1019, name: '杖', type: 'staff', slot: 'rightHand', isTwoHanded: false,
      smallMonsterDamage: 10, largeMonsterDamage: 10, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
      ability: { type: 'holy_smite_boost', params: { stun: 1500 } },
    };
    useGameStore.setState({ character: { ...character(), className: 'priest' }, skills: [smite], equippedGear: { rightHand: staff } as never });
  }

  function castSmite(): CombatVisual[] {
    for (let i = 0; i < 6; i++) {
      defaultSession.combatCommand.getState().requestSkill('holy-smite');
      const visuals = tickCombat(300, defaultSession);
      if (visuals.some(v => v.kind === 'player_attack')) return visuals;
    }
    return [];
  }

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    setupSmite();
  });

  it('突進到相鄰格並暈眩 X 秒', () => {
    const visuals = castSmite();
    expect(visuals.some(v => v.kind === 'dash')).toBe(true);
    expect(useMapControlStore.getState().playerPosition).toEqual({ x: 7, y: 5 });
    const stun = useGameStore.getState().activeEffects.find(e => e.stun && e.targetMonsterId === 'm1');
    expect(stun?.duration).toBe(1500);
  });

  it('找不到落點時原地施放', () => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx || dy) defaultSession.loop.occupation.register({ x: MONSTER_POS.x + dx, y: MONSTER_POS.y + dy }, 'monster', `block-${dx}-${dy}`);
      }
    }
    const visuals = castSmite();
    expect(visuals.some(v => v.kind === 'player_attack')).toBe(true);
    expect(visuals.some(v => v.kind === 'dash')).toBe(false);
    expect(useMapControlStore.getState().playerPosition).toEqual({ x: 2, y: 5 });
  });
});
