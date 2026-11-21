// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExploreBar } from '../ExploreBar';
import { useGameStore, type GamePhase } from '../../stores/gameStore';
import { useMapControlStore } from '../../stores/mapControlStore';
import { ARENA_REGION_ID } from '../../models/arena';

/** 戰鬥後等待橫幅（`03-combat.md` § 戰鬥後等待） */
function setup({ paused, phase = 'explore', region = 'dawn-plains' }: { paused: boolean; phase?: GamePhase; region?: string }) {
  useMapControlStore.setState({ paused });
  useGameStore.setState({
    phase,
    searchMode: 'auto',
    character: {
      name: 'TestHero', className: 'knight', level: 10, exp: 0, expToNext: 1000, hp: 10, mp: 10,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 0, currentArea: region, currentZone: region, currentRegion: region, currentFloor: null,
      skills: [], quests: [], areaKills: 0, areaEnteredAt: 0, createdAt: 0, userId: 1,
    },
  });
  render(<ExploreBar />);
}

describe('ExploreBar 戰鬥後等待橫幅', () => {
  it('等待中：顯示橫幅，不顯示「探索中...」', () => {
    setup({ paused: true });
    expect(screen.getByRole('status').textContent).toBe('⏸ 戰鬥後等待中');
    expect(screen.queryByText('探索中...')).toBeNull();
  });

  it('等待中被打斷：顯示紅框「等待被打斷，戰鬥中」', () => {
    setup({ paused: true, phase: 'combat' });
    const banner = screen.getByRole('status');
    expect(banner.textContent).toBe('⚔ 等待被打斷，戰鬥中');
    expect(banner.classList.contains('is-interrupted')).toBe(true);
  });

  it('沒有在等待：不顯示橫幅', () => {
    setup({ paused: false });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByText('探索中...')).toBeTruthy();
  });

  it('競技場：不顯示橫幅', () => {
    setup({ paused: true, region: ARENA_REGION_ID });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
