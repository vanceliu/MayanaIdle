// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuffBar } from '../../components/BuffBar';
import { useGameStore } from '../../stores/gameStore';
import type { ActiveEffect } from '../../models/effect';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

function createBuff(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: `buff-${Math.random()}`,
    sourceSkillId: 'skill-1',
    sourceSkillName: '火矢附魔',
    category: 'fire-enchant',
    type: 'buff',
    target: 'player',
    startTime: Date.now(),
    duration: 300000,
    tags: [],
    name: '火矢附魔',
    description: '火屬性傷害 +15',
    ...overrides,
  };
}

describe('BuffBar', () => {
  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
  });

  it('renders nothing when no buffs', () => {
    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-bar')).toBeNull();
  });

  it('renders buff icons for player buffs', () => {
    const buff = createBuff({ id: 'b1' });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByTestId('icon-buffs/flaming-arrow')).toBeTruthy();
  });

  it('does not render monster debuffs', () => {
    const debuff = createBuff({ id: 'd1', type: 'debuff', target: 'monster', targetIdx: 0 });
    useGameStore.setState({ activeEffects: [debuff] });

    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-bar')).toBeNull();
  });

  it('shows overflow count when more than 8 buffs', () => {
    const buffs = Array.from({ length: 10 }, (_, i) =>
      createBuff({ id: `b${i}`, category: `cat-${i}` })
    );
    useGameStore.setState({ activeEffects: buffs });

    render(<BuffBar />);
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('shows max 8 icons when overflow', () => {
    const buffs = Array.from({ length: 12 }, (_, i) =>
      createBuff({ id: `b${i}`, category: `cat-${i}` })
    );
    useGameStore.setState({ activeEffects: buffs });

    const { container } = render(<BuffBar />);
    const icons = container.querySelectorAll('.buff-icon');
    expect(icons.length).toBe(8);
  });

  it('applies expiring class when remaining < 5s', () => {
    const buff = createBuff({
      id: 'expiring',
      startTime: Date.now() - 297000,
      duration: 300000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-icon.expiring')).toBeTruthy();
  });

  it('formats time as M:SS when >= 60s', () => {
    const buff = createBuff({
      id: 'long',
      startTime: Date.now(),
      duration: 120000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByText('2:00')).toBeTruthy();
  });

  it('formats time as Ns when < 60s', () => {
    const buff = createBuff({
      id: 'short',
      startTime: Date.now() - 270000,
      duration: 300000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByText('30s')).toBeTruthy();
  });
});
