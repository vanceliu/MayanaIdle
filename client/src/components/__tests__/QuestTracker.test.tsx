// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuestTrackerButton, QuestTrackerContent } from '../QuestTracker';
import { useGameStore } from '../../stores/gameStore';
import { usePanelWindowStore, PANEL_KEYS } from '../../stores/panelWindowStore';

describe('QuestTracker（按鈕在 PanelDock、內容走可拖曳浮動視窗，§ 36.10.3）', () => {
  beforeEach(() => {
    usePanelWindowStore.setState({
      open: { stats: false, equipment: false, bag: false, skill: false, quest: false },
      order: [...PANEL_KEYS],
    });
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
        gold: 0,
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
      adventurerQuests: [],
    });
  });

  it('按鈕沿用 PanelDock 的按鈕樣式（與詳細狀態/裝備欄/背包一致）', () => {
    const { container } = render(<QuestTrackerButton />);
    const btn = container.querySelector('.quest-tracker-btn') as HTMLElement;
    expect(btn.className).toContain('panel-dock-btn');
  });

  it('點擊按鈕開啟／再點關閉 quest 面板', () => {
    render(<QuestTrackerButton />);
    const btn = screen.getByText(/任務/);

    fireEvent.click(btn);
    expect(usePanelWindowStore.getState().open.quest).toBe(true);

    fireEvent.click(btn);
    expect(usePanelWindowStore.getState().open.quest).toBe(false);
  });

  it('開啟時置頂，與其他浮動視窗共用 z 順序', () => {
    usePanelWindowStore.setState({ order: ['quest', 'stats', 'equipment', 'bag', 'skill'] });
    render(<QuestTrackerButton />);

    fireEvent.click(screen.getByText(/任務/));

    const { order } = usePanelWindowStore.getState();
    expect(order[order.length - 1]).toBe('quest');
  });

  it('開啟時按鈕標記為 active 與 aria-pressed', () => {
    const { container } = render(<QuestTrackerButton />);
    const btn = container.querySelector('.quest-tracker-btn') as HTMLElement;

    expect(btn.className).not.toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(btn);

    expect(btn.className).toContain('active');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
  });

  it('有任務時按鈕顯示數量 badge', () => {
    useGameStore.setState({
      adventurerQuests: [
        { id: 'aq1', title: '討伐野狼', targetArea: 'dawn-plains', targetMonster: '野狼', targetCount: 10, currentCount: 3, status: 'active' },
      ] as never,
    });

    const { container } = render(<QuestTrackerButton />);
    expect(container.querySelector('.quest-count-badge')?.textContent).toBe('1');
  });

  it('無任務時內容顯示空狀態文字', () => {
    render(<QuestTrackerContent />);
    expect(screen.getByText('目前無進行中的任務')).toBeTruthy();
  });
});
