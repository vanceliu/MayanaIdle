import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClassGuild } from '../town/ClassGuild';
import { useGameStore } from '../../stores/gameStore';

/**
 * @vitest-environment jsdom
 */

describe('ClassGuild', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: {
        name: 'TestKnight',
        className: 'knight',
        level: 15,
        exp: 0,
        expToNext: 1000,
        hp: 100,
        maxHp: 100,
        mp: 30,
        maxMp: 30,
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 1000,
        currentArea: 'neutral-town',
        currentZone: 'newbie-neutral',
        currentRegion: 'neutral-town',
        currentFloor: null,
        skills: [],
        quests: [],
        unspentAttributePoints: 0,
        areaEnteredAt: Date.now(),
        createdAt: Date.now(),
        userId: 1,
      },
      skills: [],
      bagItems: [{ name: '盾擊技能書', type: 'scroll', amount: 1 }],
    });
  });

  it('renders class skills for knight', () => {
    render(<ClassGuild />);
    expect(screen.getByText('盾擊')).toBeDefined();
    expect(screen.getByText('裂傷斬')).toBeDefined();
  });

  it('allows learning when level and book requirements met', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
    });
    render(<ClassGuild />);
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables learning when level too low', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 5 },
    });
    render(<ClassGuild />);
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables learning when no book in bag', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
      bagItems: [],
    });
    render(<ClassGuild />);
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('learns skill when clicked and removes book', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
    });
    render(<ClassGuild />);
    const learnButtons = screen.getAllByText('學習');
    fireEvent.click(learnButtons[0]);

    const state = useGameStore.getState();
    expect(state.skills.some(s => s.id === 'shield-bash')).toBe(true);
    expect(state.bagItems.find(b => b.name === '盾擊技能書')).toBeUndefined();
  });

  it('shows learned tag after learning', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
      skills: [{ id: 'shield-bash', name: '盾擊', level: 1, element: 'none', type: 'attack', target: 'single', power: 20, mpCost: 15, cooldown: 10000, lastUsedAt: 0 }],
    });
    render(<ClassGuild />);
    expect(screen.getByText('已學習')).toBeDefined();
  });
});
