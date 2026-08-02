// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPanel } from '../StatusPanel';
import { useGameStore } from '../../stores/gameStore';

describe('StatusPanel（頂部 HUD compact 版，§ 34.3）', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: {
        name: 'TestHero',
        className: 'knight',
        level: 10,
        exp: 250,
        expToNext: 1000,
        hp: 80,
        maxHp: 100,
        mp: 20,
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
      activeEffects: [],
    });
  });

  it('顯示角色名稱、職業與等級', () => {
    render(<StatusPanel />);
    expect(screen.getByText('TestHero')).toBeTruthy();
    expect(screen.getByText('騎士')).toBeTruthy();
    expect(screen.getByText('Lv.10')).toBeTruthy();
  });

  it('HP / MP / EXP 三條並排顯示', () => {
    const { container } = render(<StatusPanel />);
    expect(container.querySelector('.bars .hp-bar')).toBeTruthy();
    expect(container.querySelector('.bars .mp-bar')).toBeTruthy();
    expect(container.querySelector('.bars .exp-bar')).toBeTruthy();
    expect(container.querySelectorAll('.bars .bar')).toHaveLength(3);
  });

  it('防禦值與名稱同列（不再獨立成一行）', () => {
    const { container } = render(<StatusPanel />);
    expect(container.querySelector('.char-header .defense-value')).toBeTruthy();
    expect(container.querySelector('.defense-row')).toBeNull();
  });

  it('不再顯示「目前區域」（改由頂部地圖選擇器呈現）', () => {
    const { container } = render(<StatusPanel />);
    expect(container.querySelector('.area-info')).toBeNull();
    expect(screen.queryByText(/目前區域/)).toBeNull();
  });
});
