/**
 * 戰鬥天賦格的共用條件（`51-auto-talent.md` § 51.4.5）在實際戰鬥 tick 要能成立：
 * 負重百分比與 HP 取樣必須由 `tickCombat` 接進戰鬥天賦的判定。
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
import { gameNow } from '../../core/clock';
import type { MapData } from '../../models/mapControl';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterInstance } from '../../models/monster';
import type { TalentSlot, TalentSlotEntry } from '../../models/talent';

const MAP: MapData = {
  id: 'test-map',
  name: 'Test Map',
  width: 12,
  height: 12,
  spawnPoint: { x: 5, y: 5 },
  autoSpawn: false,
  tiles: Array.from({ length: 12 }, (_, y) =>
    Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 11 ? 1 : 0))),
};

/** 負重上限 (30 + 20) × 100 = 5000 */
function character(): Character {
  return {
    userId: 1, id: 1, name: '測試', className: 'knight', level: 10,
    exp: 0, expToNext: 1_000_000, hp: 200, maxHp: 200, mp: 50, maxMp: 50,
    baseAttributes: { STR: 30, AGI: 20, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains', currentFloor: null,
    skills: [], quests: [], areaEnteredAt: 0, createdAt: 0,
  };
}

/** 重 2000 的盔甲：負重 40% */
const HEAVY_ARMOR = {
  id: 99, templateId: 99, name: '重甲', type: 'armor', slot: 'body', isTwoHanded: false,
  defense: 0, weight: 2000, quality: 0, enhancement: 0, affixes: [],
} as unknown as EquipmentInstance;

function slotWith(condition: TalentSlotEntry): TalentSlot {
  return {
    id: 1, characterId: 1, tier: 1, assignedType: 'combat', templateId: 'default',
    order: 0, enabled: true, conditions: [condition], action: { ruleId: 'normal_attack', params: null },
  };
}

function setup(condition: TalentSlotEntry, equippedGear: Record<string, EquipmentInstance> = {}): void {
  const mapMonster: MapMonster = {
    id: 'm1',
    position: { x: 6, y: 5 },
    targetPosition: { x: 5, y: 5 },
    speed: 1, path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 5, y: 5 }, isBoss: false, attackRange: 1.5,
  };
  const inst: MonsterInstance = {
    templateId: 1, name: '木樁', level: 1, currentHp: 9999, maxHp: 9999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 100_000,
  };

  attachInstance(defaultSession, createMapInstance('test', useMapMonsterStore));
  useMapMonsterStore.setState({ monsters: [mapMonster], combatMonsterIds: [], maxMonsters: 5 });
  useMapControlStore.setState({
    currentMap: MAP, playerPosition: { x: 5, y: 5 }, prevPlayerPosition: { x: 5, y: 5 },
    currentPath: [], pathIndex: 0, isMoving: false, autoMove: false, paused: false,
  });
  useGameStore.setState({
    character: character(), equippedGear, inventory: [], bagItems: [], activeEffects: [], combatLogs: [], skills: [],
  });
  useTalentStore.setState({ slots: [slotWith(condition)] });

  defaultSession.combat.monsterInstances.set('m1', inst);
  defaultSession.combat.engine.monsters.set('m1', {
    instance: inst, mapMonster, combatCtx: createMonsterCombatContext(),
    attackConfig: { attackType: 'melee', attackRange: 1.5, attackInterval: 100_000 },
  });
  defaultSession.combat.engine.playerCtx.targetMonsterId = 'm1';
  defaultSession.combat.engine.playerCtx.attackTimer = 100_000;
  defaultSession.loop.hpSamples.length = 0;
}

function attacksWithin(ticks: number): boolean {
  for (let i = 0; i < ticks; i++) {
    if (tickCombat(300, defaultSession).some(v => v.kind === 'player_attack')) return true;
  }
  return false;
}

describe('戰鬥天賦格的共用條件', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
  });

  it('負重超過：負重 40% 時「負重超過 30%」成立', () => {
    setup({ ruleId: 'weight_over', params: { value: 30 } }, { body: HEAVY_ARMOR });
    expect(attacksWithin(12)).toBe(true);
  });

  it('負重超過：負重 40% 時「負重超過 50%」不成立', () => {
    setup({ ruleId: 'weight_over', params: { value: 50 } }, { body: HEAVY_ARMOR });
    expect(attacksWithin(12)).toBe(false);
  });

  it('HP 近期驟降：取樣顯示 3 秒內掉 50 個百分點時成立', () => {
    setup({ ruleId: 'hp_dropped_recently', params: { value: 30, radius: 3 } });
    const now = gameNow();
    defaultSession.loop.hpSamples.push({ t: now - 1000, percent: 100 }, { t: now, percent: 50 });
    expect(attacksWithin(12)).toBe(true);
  });

  it('HP 近期驟降：沒有掉血時不成立', () => {
    setup({ ruleId: 'hp_dropped_recently', params: { value: 30, radius: 3 } });
    const now = gameNow();
    defaultSession.loop.hpSamples.push({ t: now - 1000, percent: 100 }, { t: now, percent: 100 });
    expect(attacksWithin(12)).toBe(false);
  });
});
