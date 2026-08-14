// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ExploreBar } from '../ExploreBar';
import { formatElapsed } from '../../hooks/useAreaElapsed';
import { useGameStore } from '../../stores/gameStore';

const NOW = 1_700_000_000_000;

function setCharacter(areaEnteredAt: number) {
  useGameStore.setState({
    phase: 'explore',
    searchMode: 'auto',
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
      gold: 0,
      currentArea: 'dawn-plains',
      currentZone: 'newbie-neutral',
      currentRegion: 'dawn-plains',
      currentFloor: null,
      skills: [],
      unspentAttributePoints: 0,
      quests: [],
      areaEnteredAt,
      createdAt: NOW,
      userId: 1,
    },
  });
}

describe('formatElapsed', () => {
  it.each([
    [0, '0:00'],
    [7_000, '0:07'],
    [5 * 60_000 + 7_000, '5:07'],
    [59 * 60_000 + 59_000, '59:59'],
    [60 * 60_000, '1:00:00'],
    [(65 * 60 + 7) * 1000, '1:05:07'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it('負值視為 0，時鐘回捲不會顯示負號', () => {
    expect(formatElapsed(-5000)).toBe('0:00');
  });
});

describe('ExploreBar 停留時間', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('顯示自 areaEnteredAt 起算的停留時間', () => {
    setCharacter(NOW - 90_000);
    render(<ExploreBar />);
    expect(screen.getByTitle('待在這張地圖的時間').textContent).toBe('1:30');
  });

  it('每秒更新', () => {
    setCharacter(NOW);
    render(<ExploreBar />);
    expect(screen.getByTitle('待在這張地圖的時間').textContent).toBe('0:00');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTitle('待在這張地圖的時間').textContent).toBe('0:03');
  });

  it('換圖後歸零', () => {
    setCharacter(NOW - 600_000);
    render(<ExploreBar />);
    expect(screen.getByTitle('待在這張地圖的時間').textContent).toBe('10:00');

    act(() => {
      vi.advanceTimersByTime(1000);
      setCharacter(NOW + 1000);
    });
    expect(screen.getByTitle('待在這張地圖的時間').textContent).toBe('0:00');
  });

  it('沒有角色時不顯示', () => {
    useGameStore.setState({ character: null, phase: 'explore', searchMode: 'auto' });
    render(<ExploreBar />);
    expect(screen.queryByTitle('待在這張地圖的時間')).toBeNull();
  });
});
