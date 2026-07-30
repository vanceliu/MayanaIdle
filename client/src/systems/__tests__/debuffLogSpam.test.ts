import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { useGameStore } from '../../stores/gameStore';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { Skill } from '../../models/skill';
import type { ActiveEffect } from '../../models/effect';
import type { EquipmentInstance } from '../../models/equipment';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 200_000;

function testCharacter(): Character {
  return {
    name: 'Thief', className: 'thief', level: 40, exp: 0, expToNext: 100,
    hp: 300, maxHp: 300, mp: 200, maxMp: 200,
    baseAttributes: { STR: 20, AGI: 20, VIT: 15, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function target(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 22, currentHp: 99999, maxHp: 99999,
    attackMin: 15, attackMax: 22, defense: 0, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function dagger(): EquipmentInstance {
  return {
    templateId: 2, name: '匕首', type: 'dagger', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 20, largeMonsterDamage: 18, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function envenomBuff(): ActiveEffect {
  return {
    id: 'buff-envenom', sourceSkillId: 'envenom', sourceSkillName: '淬毒',
    category: 'poison-enchant', type: 'buff', target: 'player',
    startTime: NOW, duration: 300_000, tags: [], name: '淬毒', description: '',
  };
}

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function normalAttack(monster: MonsterInstance) {
  const gs = useGameStore.getState();
  return processPlayerAttack(
    { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: ['m1'] },
    {
      character: gs.character!,
      equippedGear: [dagger()],
      activeEffects: gs.activeEffects,
      skills: [],
      monsterInstances: new Map([['m1', monster]]),
      mapMonsters,
    },
  );
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  useGameStore.setState({
    character: testCharacter(),
    skills: [],
    equippedGear: {},
    combatLogs: [],
    activeEffects: [envenomBuff()],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('淬毒 — 存續期間不重複觸發（§ 24.3.2）', () => {
  it('連續普攻只在第一次輸出「淬毒觸發」', () => {
    const monster = target();
    const first = normalAttack(monster);
    const second = normalAttack(monster);
    const third = normalAttack(monster);

    const count = (r: { logs: { text: string }[] }) =>
      r.logs.filter(l => l.text.includes('淬毒觸發')).length;

    expect(count(first)).toBe(1);
    expect(count(second)).toBe(0);
    expect(count(third)).toBe(0);
  });

  it('中毒效果不會被重複堆疊', () => {
    const monster = target();
    normalAttack(monster);
    normalAttack(monster);
    normalAttack(monster);

    const poisons = useGameStore.getState().activeEffects.filter(
      e => e.type === 'debuff' && e.target === 'monster' && e.sourceSkillId === 'envenom'
    );
    expect(poisons).toHaveLength(1);
  });

  it('中毒結束後可再次觸發並重新輸出日誌', () => {
    const monster = target();
    expect(normalAttack(monster).logs.some(l => l.text.includes('淬毒觸發'))).toBe(true);

    // 中毒 5s 已過期
    vi.spyOn(Date, 'now').mockReturnValue(NOW + 6000);
    useGameStore.getState().clearExpiredEffects();
    useGameStore.setState({ activeEffects: [envenomBuff(), ...useGameStore.getState().activeEffects.filter(e => e.type === 'debuff')] });

    expect(normalAttack(monster).logs.some(l => l.text.includes('淬毒觸發'))).toBe(true);
  });

  it('對不同怪物各自獨立觸發', () => {
    const a = target();
    const b = { ...target(), templateId: 13, name: '高地獅鷲' };
    const gs = useGameStore.getState();

    const attack = (id: string, m: MonsterInstance) => processPlayerAttack(
      { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: [id] },
      {
        character: gs.character!, equippedGear: [dagger()],
        activeEffects: useGameStore.getState().activeEffects, skills: [],
        monsterInstances: new Map([[id, m]]),
        mapMonsters: [
          { id: 'm1', position: { x: 1, y: 1 }, isBoss: false },
          { id: 'm2', position: { x: 2, y: 2 }, isBoss: false },
        ] as unknown as MapMonster[],
      },
    );

    expect(attack('m1', a).logs.some(l => l.text.includes('淬毒觸發'))).toBe(true);
    expect(attack('m2', b).logs.some(l => l.text.includes('淬毒觸發'))).toBe(true);
    expect(attack('m1', a).logs.some(l => l.text.includes('淬毒觸發'))).toBe(false);
  });
});

describe('技能 debuff — 刷新時不重複輸出日誌', () => {
  function castSkill(skillId: string, monster: MonsterInstance) {
    const skill = { ...getSkillTemplate(skillId)!, lastUsedAt: 0 } as Skill;
    const gs = useGameStore.getState();
    useGameStore.setState({ skills: [skill] });
    return processPlayerAttack(
      { type: 'player_attack', action: { type: 'skill', skillId }, targetMonsterIds: ['m1'], skill },
      {
        character: gs.character!, equippedGear: [dagger()],
        activeEffects: useGameStore.getState().activeEffects, skills: [skill],
        monsterInstances: new Map([['m1', monster]]), mapMonsters,
      },
    );
  }

  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
  });

  /** debuff 施加日誌固定為 debuff-enemy 型別，與一般攻擊日誌區分 */
  const debuffLogs = (r: { logs: { type: string }[] }) =>
    r.logs.filter(l => l.type === 'debuff-enemy').length;

  it('裂傷斬（DoT）存續期間不重複施加也不重複輸出', () => {
    const monster = target();
    expect(debuffLogs(castSkill('rend', monster))).toBe(1);
    expect(debuffLogs(castSkill('rend', monster))).toBe(0);
    expect(useGameStore.getState().activeEffects.filter(e => e.category === 'bleeding')).toHaveLength(1);
  });

  it('盾擊（控場）暈眩期間不重複施加也不重複輸出', () => {
    const monster = target();
    expect(debuffLogs(castSkill('shield-bash', monster))).toBe(1);
    expect(debuffLogs(castSkill('shield-bash', monster))).toBe(0);
    expect(useGameStore.getState().activeEffects.filter(e => e.category === 'stun')).toHaveLength(1);
  });

  it('挑釁怒吼（數值修正）會刷新時間但不重複輸出日誌', () => {
    const monster = target();
    expect(debuffLogs(castSkill('taunt', monster))).toBe(1);

    vi.spyOn(Date, 'now').mockReturnValue(NOW + 3000);
    expect(debuffLogs(castSkill('taunt', monster))).toBe(0);

    const effects = useGameStore.getState().activeEffects.filter(e => e.category === 'atk-down');
    expect(effects).toHaveLength(1);
    expect(effects[0].startTime).toBe(NOW + 3000); // 已刷新
  });
});
