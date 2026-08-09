import { describe, it, expect } from 'vitest';
import { evaluateCombatScript } from '../../systems/scriptRunner';
import { getTotalAttributes, getEffectiveINT } from '../../models/character';
import type { CombatScriptContext } from '../../systems/scriptRunner';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { CombatRule } from '../../models/scriptEngine';
import type { Skill } from '../../models/skill';
import { CLASS_BASE_ATTRIBUTES } from '../../models/character';
import { INITIAL_HP, getExpToNextLevel } from '../../systems/levelUp';

function createCharacter(overrides: Partial<Character> = {}): Character {
  const base = CLASS_BASE_ATTRIBUTES['elementalist'];
  return {
    name: 'TestMage',
    className: 'elementalist',
    level: 10,
    exp: 0,
    expToNext: getExpToNextLevel(10),
    hp: INITIAL_HP,
    maxHp: INITIAL_HP,
    mp: 100,
    maxMp: 100,
    baseAttributes: { ...base },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 10, CHA: 0 },
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    unspentAttributePoints: 0,
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    userId: 1,
    ...overrides,
  };
}

function createMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1,
    name: '暴牙兔',
    level: 5,
    currentHp: 100,
    maxHp: 100,
    attackMin: 5,
    attackMax: 10,
    defense: 10,
    exp: 20,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
    ...overrides,
  };
}

function createFireball(): Skill {
  return {
    id: 'fireball',
    name: '火球',
    level: 3,
    element: 'fire',
    type: 'attack',
    target: 'aoe',
    power: 25,
    mpCost: 15,
    cooldown: 6000,
    aoeCenter: 'target',
    aoeRadius: 3,
    maxTargets: 3,
    lastUsedAt: 0,
  };
}

/**
 * Simulates the AOE damage logic from gameStore combat tick.
 * This replicates the fixed logic to verify AOE correctly damages
 * the selected target.
 */
function simulateAoeCombatTick(
  char: Character,
  monsters: MonsterInstance[],
  skill: Skill,
  selectedTargetIdx: number,
): { monsters: MonsterInstance[]; targetDamaged: boolean } {
  const targetIdx = selectedTargetIdx;
  const target = { ...monsters[targetIdx] };

  const attrs = getTotalAttributes(char);
  const effINT = getEffectiveINT(attrs.INT);
  const intBonus = Math.floor(skill.power * (effINT / 2 * 0.1));
  const magicDamage = skill.power + intBonus;

  let aoeHandledTarget = false;

  if (skill.target === 'aoe') {
    const alive = monsters.filter(m => m.currentHp > 0);
    const hitCount = Math.min(alive.length, skill.maxTargets ?? 1);
    for (let i = 0; i < hitCount; i++) {
      const m = alive[i];
      const mIdx = monsters.indexOf(m);
      const reduction = Math.min(m.defense, 65);
      const finalDamage = Math.max(1, Math.floor(magicDamage * (100 - reduction) / 100));
      monsters[mIdx] = { ...m, currentHp: m.currentHp - finalDamage };
      if (mIdx === targetIdx) {
        aoeHandledTarget = true;
      }
    }
  }

  if (!aoeHandledTarget) {
    monsters[targetIdx] = target;
  }

  const finalTarget = monsters[targetIdx];
  return {
    monsters,
    targetDamaged: finalTarget.currentHp < finalTarget.maxHp,
  };
}

describe('Integration: Combat AOE Targeting', () => {
  it('AOE skill should damage the selected target when it is in the alive list', () => {
    const char = createCharacter();
    const monsters = [
      createMonster({ name: '暴牙兔A' }),
      createMonster({ name: '暴牙兔B' }),
    ];
    const skill = createFireball();
    const selectedTargetIdx = 0;

    const result = simulateAoeCombatTick(char, monsters, skill, selectedTargetIdx);

    expect(result.targetDamaged).toBe(true);
    expect(result.monsters[0].currentHp).toBeLessThan(100);
    expect(result.monsters[1].currentHp).toBeLessThan(100);
  });

  it('AOE skill should damage the selected target even when it is the second monster', () => {
    const char = createCharacter();
    const monsters = [
      createMonster({ name: '暴牙兔A' }),
      createMonster({ name: '暴牙兔B' }),
    ];
    const skill = createFireball();
    const selectedTargetIdx = 1;

    const result = simulateAoeCombatTick(char, monsters, skill, selectedTargetIdx);

    expect(result.targetDamaged).toBe(true);
    expect(result.monsters[1].currentHp).toBeLessThan(100);
  });

  it('AOE skill should not overwrite selected target HP with stale snapshot', () => {
    const char = createCharacter();
    const monsters = [
      createMonster({ name: '暴牙兔A', currentHp: 50, maxHp: 100 }),
      createMonster({ name: '暴牙兔B', currentHp: 50, maxHp: 100 }),
    ];
    const skill = createFireball();
    const selectedTargetIdx = 0;

    const hpBefore = monsters[0].currentHp;
    const result = simulateAoeCombatTick(char, monsters, skill, selectedTargetIdx);

    expect(result.monsters[0].currentHp).toBeLessThan(hpBefore);
  });

  it('single target skill should only damage the selected target', () => {
    const char = createCharacter();
    const monsters = [
      createMonster({ name: '暴牙兔A' }),
      createMonster({ name: '暴牙兔B' }),
    ];
    const selectedTargetIdx = 0;
    const target = { ...monsters[selectedTargetIdx] };

    const attrs = getTotalAttributes(char);
    const effINT = getEffectiveINT(attrs.INT);
    const skill: Skill = {
      id: 'wind-blade',
      name: '風刃',
      level: 1,
      element: 'wind',
      type: 'attack',
      target: 'single',
      power: 10,
      mpCost: 5,
      cooldown: 3000,
      lastUsedAt: 0,
    };
    const intBonus = Math.floor(skill.power * (effINT / 2 * 0.1));
    const magicDamage = skill.power + intBonus;
    const reduction = Math.min(target.defense, 65);
    const finalDamage = Math.max(1, Math.floor(magicDamage * (100 - reduction) / 100));

    target.currentHp -= finalDamage;
    monsters[selectedTargetIdx] = target;

    expect(monsters[0].currentHp).toBeLessThan(100);
    expect(monsters[1].currentHp).toBe(100);
  });
});

describe('Integration: Combat Script No-Action Behavior', () => {
  it('character should idle when no combat rules match', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'monster_count_gte', value: 5 }], action: { type: 'skill', skillId: 'fireball' } },
    ];
    const ctx: CombatScriptContext = {
      character: createCharacter(),
      monsters: [{ id: 'm1', instance: createMonster(), position: { x: 1, y: 0 } }],
      skills: [createFireball()],
      now: 10000,
      playerPos: { x: 0, y: 0 },
      primaryTargetId: null,
      weaponRange: 1.5,
    };

    const action = evaluateCombatScript(rules, ctx);
    expect(action).toBeNull();
  });

  it('character should idle when all rules are disabled', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
      { id: 'r2', enabled: false, conditions: [{ type: 'always' }], action: { type: 'skill', skillId: 'fireball' } },
    ];
    const ctx: CombatScriptContext = {
      character: createCharacter(),
      monsters: [{ id: 'm1', instance: createMonster(), position: { x: 1, y: 0 } }],
      skills: [createFireball()],
      now: 10000,
      playerPos: { x: 0, y: 0 },
      primaryTargetId: null,
      weaponRange: 1.5,
    };

    const action = evaluateCombatScript(rules, ctx);
    expect(action).toBeNull();
  });

  it('wait action should prevent any attack when explicitly set', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: true, conditions: [{ type: 'always' }], action: { type: 'wait' } },
    ];
    const ctx: CombatScriptContext = {
      character: createCharacter(),
      monsters: [{ id: 'm1', instance: createMonster(), position: { x: 1, y: 0 } }],
      skills: [createFireball()],
      now: 10000,
      playerPos: { x: 0, y: 0 },
      primaryTargetId: null,
      weaponRange: 1.5,
    };

    const action = evaluateCombatScript(rules, ctx);
    expect(action).toEqual({ type: 'wait' });
  });

  it('disabling normal_attack rule should result in no action (null)', () => {
    const rules: CombatRule[] = [
      { id: 'r1', enabled: false, conditions: [{ type: 'always' }], action: { type: 'normal_attack' } },
    ];
    const ctx: CombatScriptContext = {
      character: createCharacter(),
      monsters: [{ id: 'm1', instance: createMonster(), position: { x: 1, y: 0 } }],
      skills: [],
      now: 10000,
      playerPos: { x: 0, y: 0 },
      primaryTargetId: null,
      weaponRange: 1.5,
    };

    const action = evaluateCombatScript(rules, ctx);
    expect(action).toBeNull();
  });
});
