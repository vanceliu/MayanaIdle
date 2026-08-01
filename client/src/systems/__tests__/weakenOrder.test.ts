import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculatePlayerAttack, calculateSkillAttack } from '../combat';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';

function char(): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 100,
    hp: 100, maxHp: 100, mp: 100, maxMp: 100,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function monster(defense: number): MonsterInstance {
  return {
    templateId: 1, name: '測試怪', level: 50, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense, exp: 1,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

const weapon: EquipmentInstance = {
  templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
  smallMonsterDamage: 100, largeMonsterDamage: 100, defense: 0,
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
};

function weakenDebuff(): ActiveEffect {
  return {
    id: 'w', sourceSkillId: 'monster', sourceSkillName: '怪物',
    category: 'weaken', type: 'debuff', target: 'player',
    startTime: Date.now(), duration: 60000, tags: ['weakened'],
    name: '虛弱', description: '攻擊力 -20%',
    modifiers: [{ stat: 'attack', value: -20, isPercent: true }],
  };
}

describe('虛弱作用於最終傷害（§ 21.3）', () => {
  it('普攻：虛弱後的傷害 = floor(原最終傷害 × 0.8)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // 命中、不暴擊
    const m = monster(50); // 50% 減傷，凸顯「減傷前扣 20%」與「減傷後扣 20%」的差異
    const plain = calculatePlayerAttack(char(), weapon, m, [weapon], []).damage;
    const weakened = calculatePlayerAttack(char(), weapon, m, [weapon], [weakenDebuff()]).damage;
    expect(weakened).toBe(Math.floor(plain * 0.8));
  });

  it('技能：虛弱不影響（技能走魔法公式，§ 24.4.5）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const m = monster(50);
    const plain = calculateSkillAttack(char(), 100, 'none', m, []).damage;
    const weakened = calculateSkillAttack(char(), 100, 'none', m, [], '技能', [weakenDebuff()]).damage;
    expect(weakened).toBe(plain);
  });

  it('高防禦目標：虛弱扣的是減傷後的量，不會被防禦二次稀釋', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const m = monster(75); // 75% 減傷（上限）
    const plain = calculatePlayerAttack(char(), weapon, m, [weapon], []).damage;
    const weakened = calculatePlayerAttack(char(), weapon, m, [weapon], [weakenDebuff()]).damage;
    expect(weakened).toBe(Math.floor(plain * 0.8));
  });

  it('傷害最低仍為 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const tiny: EquipmentInstance = { ...weapon, smallMonsterDamage: 1, largeMonsterDamage: 1 };
    const m = monster(75);
    const weakened = calculatePlayerAttack(char(), tiny, m, [tiny], [weakenDebuff()]).damage;
    expect(weakened).toBeGreaterThanOrEqual(1);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
