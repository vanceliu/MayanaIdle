// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExploreBar, formatPressureTitle } from '../ExploreBar';
import { useGameStore } from '../../stores/gameStore';

/** 探索列的 Pressure 顯示（`26-spawn-pressure.md` § 26.3） */
function setAreaKills(areaKills: number, pressureRate = 1, pressureMembers = 1) {
  useGameStore.setState({
    phase: 'explore',
    searchMode: 'auto',
    pressureRate,
    pressureMembers,
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
      areaKills,
      areaEnteredAt: 0,
      createdAt: 0,
      userId: 1,
    },
  });
}

describe('formatPressureTitle', () => {
  it('擊殺數/下一級門檻，帶千分位', () => {
    expect(formatPressureTitle(1000, 1120)).toBe('1,000/1,120');
  });

  it('沒有下一級時只顯示擊殺數', () => {
    expect(formatPressureTitle(1000, null)).toBe('1,000');
  });
});

describe('ExploreBar Pressure', () => {
  beforeEach(() => useGameStore.setState({ character: null }));

  it('顯示 P 值與擊殺數提示', () => {
    setAreaKills(1000);
    render(<ExploreBar />);
    expect(screen.getByText('P10').getAttribute('title')).toBe('1,000/1,100');
  });

  it('Pressure 0 也顯示', () => {
    setAreaKills(50);
    render(<ExploreBar />);
    expect(screen.getByText('P0').getAttribute('title')).toBe('50/100');
  });

  it('依 store 的全域倍率計算', () => {
    setAreaKills(400, 2);
    render(<ExploreBar />);
    expect(screen.getByText('P8').getAttribute('title')).toBe('400/450');
  });

  it('組隊時門檻乘以在場人數', () => {
    setAreaKills(400, 1, 2);
    render(<ExploreBar />);
    expect(screen.getByText('P2').getAttribute('title')).toBe('400/600');
  });

  it('倍率 0 時恆為 P0，提示只有擊殺數', () => {
    setAreaKills(5000, 0);
    render(<ExploreBar />);
    expect(screen.getByText('P0').getAttribute('title')).toBe('5,000');
  });
});
