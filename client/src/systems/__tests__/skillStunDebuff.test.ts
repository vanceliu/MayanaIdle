import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack, BOSS_CC_IMMUNE_MS } from '../arpgEventHandler';
import { tickMonsterCombat, createMonsterCombatContext } from '../monsterCombatFSM';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { MapMonster } from '../../stores/mapMonsterStore';
import type { MapData } from '../../models/mapControl';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 60_000;

function testCharacter(): Character {
  return {
    name: 'Knight', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 200, maxMp: 200,
    baseAttributes: { STR: 25, AGI: 15, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 5, name: '哥布林', level: 20, currentHp: 5000, maxHp: 5000,
    attackMin: 10, attackMax: 10, defense: 0, exp: 50,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
    ...overrides,
  };
}

const shieldBash = { ...getSkillTemplate('shield-bash')!, lastUsedAt: 0 } as Skill;
const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function castShieldBash(monster: MonsterInstance) {
  const character = testCharacter();
  useGameStore.setState({ character, skills: [shieldBash], activeEffects: [], equippedGear: {}, combatLogs: [] });
  return processPlayerAttack(
    {
      type: 'player_attack',
      action: { type: 'skill', skillId: 'shield-bash' },
      targetMonsterIds: ['m1'],
      skill: shieldBash,
    },
    {
      character,
      equippedGear: [],
      activeEffects: [],
      skills: [shieldBash],
      monsterInstances: new Map([['m1', monster]]),
      mapMonsters,
    },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('盾擊暈眩（23-class-magic.md 騎士 Lv.1）', () => {
  it('技能定義帶有 2 秒暈眩', () => {
    expect(shieldBash.applyDebuff).toMatchObject({
      category: 'stun',
      stun: true,
      duration: 2000,
      tags: ['stunned'],
    });
  });

  it('命中後對怪物施加 stun 效果', () => {
    castShieldBash(target());

    const effects = useGameStore.getState().activeEffects;
    const stun = effects.find(e => e.category === 'stun');
    expect(stun).toBeDefined();
    expect(stun?.stun).toBe(true);
    expect(stun?.target).toBe('monster');
    expect(stun?.targetMonsterId).toBe('m1');
    expect(stun?.duration).toBe(2000);
  });

  it('暈眩期間不可重複施加（§ 24.3.3）', () => {
    const monster = target();
    castShieldBash(monster);
    const before = useGameStore.getState().activeEffects.length;

    // 保留既有效果再打一次
    const character = testCharacter();
    const existing = useGameStore.getState().activeEffects;
    processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId: 'shield-bash' }, targetMonsterIds: ['m1'], skill: shieldBash },
      { character, equippedGear: [], activeEffects: existing, skills: [shieldBash], monsterInstances: new Map([['m1', monster]]), mapMonsters },
    );

    expect(useGameStore.getState().activeEffects.filter(e => e.category === 'stun')).toHaveLength(1);
    expect(useGameStore.getState().activeEffects.length).toBe(before);
  });
});

describe('§ 24.6 Boss 控場免疫', () => {
  it('Boss 首次被控場後設定 30 秒免疫冷卻', () => {
    const boss = target({ isBoss: true, name: '哥布林之王' });
    castShieldBash(boss);

    expect(useGameStore.getState().activeEffects.some(e => e.category === 'stun')).toBe(true);
    expect(boss.ccImmuneUntil).toBe(NOW + BOSS_CC_IMMUNE_MS);
  });

  it('免疫冷卻中的 Boss 不再被暈眩，並輸出免疫日誌', () => {
    const boss = target({ isBoss: true, name: '哥布林之王', ccImmuneUntil: NOW + 10_000 });
    const result = castShieldBash(boss);

    expect(useGameStore.getState().activeEffects.some(e => e.category === 'stun')).toBe(false);
    expect(result.logs.some(l => l.text.includes('免疫控場'))).toBe(true);
  });

  it('免疫冷卻結束後可再次暈眩', () => {
    const boss = target({ isBoss: true, name: '哥布林之王', ccImmuneUntil: NOW - 1 });
    castShieldBash(boss);

    expect(useGameStore.getState().activeEffects.some(e => e.category === 'stun')).toBe(true);
    expect(boss.ccImmuneUntil).toBe(NOW + BOSS_CC_IMMUNE_MS);
  });

  it('小怪無免疫機制，控場正常生效且不設定冷卻', () => {
    const mob = target({ isBoss: false });
    castShieldBash(mob);

    expect(useGameStore.getState().activeEffects.some(e => e.category === 'stun')).toBe(true);
    expect(mob.ccImmuneUntil).toBeUndefined();
  });
});

describe('怪物暈眩後停止行動', () => {
  const map = { width: 20, height: 20, tiles: [] } as unknown as MapData;

  it('暈眩中的怪物不攻擊也不追擊', () => {
    const ctx = createMonsterCombatContext();
    ctx.state = 'attacking';
    const result = tickMonsterCombat(
      ctx,
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { attackType: 'melee', attackRange: 1.5, attackInterval: 1000 },
      map,
      5000,
      true,
    );
    expect(result.action).toBe('none');
    expect(ctx.attackTimer).toBe(0);
  });
});
