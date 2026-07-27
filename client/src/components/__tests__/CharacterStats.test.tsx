// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CharacterStats } from '../CharacterStats';
import { useGameStore } from '../../stores/gameStore';

describe('CharacterStats', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: {
        name: 'TestHero',
        className: 'knight',
        level: 10,
        exp: 0,
        expToNext: 1000,
        hp: 100,
        maxHp: 100,
        mp: 30,
        maxMp: 30,
        baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 1000,
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
      },
      equippedGear: {},
    });
  });

  it('renders stats directly without collapsible wrapper', () => {
    render(<CharacterStats />);
    expect(screen.getByText('物理(小怪)')).toBeDefined();
    expect(screen.getByText('防禦值')).toBeDefined();
    expect(screen.getByText('爆擊率')).toBeDefined();
    expect(screen.getByText('每次回血')).toBeDefined();
  });

  it('computes base stats without equipment', () => {
    render(<CharacterStats />);
    expect(screen.getByText('物理(小怪)')).toBeDefined();
    expect(screen.getByText('物理(大怪)')).toBeDefined();
    expect(screen.getByText('5%')).toBeDefined();
  });

  it('returns null when no character', () => {
    useGameStore.setState({ character: null });
    const { container } = render(<CharacterStats />);
    expect(container.innerHTML).toBe('');
  });
});
