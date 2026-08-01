// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterStats } from '../../components/CharacterStats';
import { useGameStore } from '../../stores/gameStore';
import { createPlayerDebuffEffect } from '../../systems/playerDebuffSystem';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { PlayerDebuffType } from '../../models/playerDebuff';

const NOW = 900_000;

function testCharacter(): Character {
  return {
    name: 'Tester', className: 'knight', level: 40, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 20, AGI: 12, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

function sourceMonster(): MonsterInstance {
  return {
    templateId: 1, name: '石像鬼', level: 22, currentHp: 100, maxHp: 100,
    attackMin: 20, attackMax: 20, defense: 5, exp: 50,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function armor(defense: number): EquipmentInstance {
  return {
    templateId: 50, name: '鎧甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    smallMonsterDamage: 0, largeMonsterDamage: 0, defense, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function sword(): EquipmentInstance {
  return {
    templateId: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 40, largeMonsterDamage: 30, defense: 0, quality: 0, enhancement: 0,
    affixes: [], ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

function setup(debuffs: PlayerDebuffType[]) {
  useGameStore.setState({
    character: testCharacter(),
    equippedGear: { chest: armor(50), rightHand: sword() },
    activeEffects: debuffs.map(t => createPlayerDebuffEffect(t, sourceMonster(), NOW, new Set())),
  });
}

function statValue(label: string): string {
  // 標籤外層包了 Tooltip 的 .tooltip-trigger，不能用 parentElement + 位置索引
  const row = screen.getByText(label).closest('.stat-row');
  return row?.querySelector('.stat-value')?.textContent ?? '';
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW + 100);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('角色狀態面板反映 debuff', () => {
  it('詛咒使防禦值下降 20%', () => {
    setup([]);
    const { unmount } = render(<CharacterStats />);
    const base = statValue('防禦值');
    unmount();

    setup(['curse']);
    render(<CharacterStats />);
    const cursed = statValue('防禦值');

    expect(Number(base)).toBe(50);
    expect(Number(cursed)).toBe(40);
  });

  it('詛咒同時使減傷率下降', () => {
    setup([]);
    const { unmount } = render(<CharacterStats />);
    const base = statValue('減傷率');
    unmount();

    setup(['curse']);
    render(<CharacterStats />);
    expect(Number(base.replace('%', ''))).toBeGreaterThan(Number(statValue('減傷率').replace('%', '')));
  });

  it('虛弱使物理攻擊力下降 20%', () => {
    setup([]);
    const { unmount } = render(<CharacterStats />);
    const base = statValue('物理(小怪)');
    unmount();

    setup(['weaken']);
    render(<CharacterStats />);
    const weakened = statValue('物理(小怪)');

    expect(Number(weakened)).toBe(Math.floor(Number(base) * 0.8));
  });

  it('減速使攻速加成下降 30%', () => {
    setup([]);
    const { unmount } = render(<CharacterStats />);
    expect(statValue('攻速加成')).toBe('+0%');
    unmount();

    setup(['slow']);
    render(<CharacterStats />);
    expect(statValue('攻速加成')).toBe('-30%');
  });

  it('沒有 debuff 時數值不受影響', () => {
    setup([]);
    render(<CharacterStats />);
    expect(Number(statValue('防禦值'))).toBe(50);
    expect(statValue('攻速加成')).toBe('+0%');
  });
});
