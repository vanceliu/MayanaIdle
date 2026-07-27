// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BattleView } from '../../components/BattleView';
import { useGameStore } from '../../stores/gameStore';
import type { ActiveEffect } from '../../models/effect';
import type { MonsterInstance } from '../../models/monster';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

vi.mock('../../components/Tooltip', () => ({
  Tooltip: ({ children, content: _content }: { children: React.ReactNode; content: React.ReactNode }) => (
    <span data-testid="tooltip-wrapper">{children}</span>
  ),
}));

function createMonster(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    name: '哥布林',
    level: 5,
    maxHp: 100,
    currentHp: 80,
    attack: 10,
    defense: 3,
    exp: 20,
    sizeCategory: 'small',
    race: 'beast',
    element: 'none',
    isBoss: false,
    ...overrides,
  } as MonsterInstance;
}

describe('BattleView debuff display', () => {
  beforeEach(() => {
    useGameStore.setState({
      phase: 'combat',
      monsters: [createMonster()],
      selectedTargetIdx: 0,
      combatLogs: [],
      activeEffects: [],
      searchMode: 'auto',
    });
  });

  it('shows debuff icons on monster when debuffs exist', () => {
    const debuff: ActiveEffect = {
      id: 'stun-1',
      sourceSkillId: 'skill-1',
      sourceSkillName: '盾擊',
      category: 'stun',
      type: 'debuff',
      target: 'monster',
      targetIdx: 0,
      startTime: Date.now(),
      duration: 2000,
      tags: ['stunned'],
      name: '暈眩',
      description: '目標無法行動',
    };
    useGameStore.setState({ activeEffects: [debuff] });

    const { container } = render(<BattleView />);
    expect(container.querySelector('.monster-debuffs')).toBeTruthy();
    expect(container.querySelector('[data-testid="icon-debuffs/stoned-skull"]')).toBeTruthy();
  });

  it('does not show debuff section when no debuffs on monster', () => {
    const { container } = render(<BattleView />);
    expect(container.querySelector('.monster-debuffs')).toBeNull();
  });

  it('shows debuffs only for the matching monster index', () => {
    useGameStore.setState({
      monsters: [createMonster(), createMonster({ name: '巨魔' })],
      activeEffects: [{
        id: 'bleed-1',
        sourceSkillId: 'skill-2',
        sourceSkillName: '斬擊',
        category: 'bleeding',
        type: 'debuff',
        target: 'monster',
        targetIdx: 1,
        startTime: Date.now(),
        duration: 5000,
        tags: ['bleeding'],
        name: '流血',
        description: '持續傷害',
      }],
    });

    const { container } = render(<BattleView />);
    const monsterCards = container.querySelectorAll('.monster-card');
    expect(monsterCards[0].querySelector('.monster-debuffs')).toBeNull();
    expect(monsterCards[1].querySelector('.monster-debuffs')).toBeTruthy();
  });
});
