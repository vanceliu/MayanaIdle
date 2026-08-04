import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StarterNpc } from '../town/StarterNpc';
import { useGameStore } from '../../stores/gameStore';
import { STARTER_TIPS } from '../../systems/starterTips';

/**
 * @vitest-environment jsdom
 *
 * 新手指導員「對話」分頁的前期知識條列（`13-town.md` § 13.11）
 */

describe('StarterNpc 前期知識條列', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: {
        name: 'TestKnight',
        className: 'knight',
        level: 5,
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
        areaEnteredAt: 0,
        createdAt: 0,
        userId: 1,
      },
      equippedGear: {},
      inventory: [],
    });
  });

  it('對話分頁列出所有知識分類標題', () => {
    render(<StarterNpc />);
    for (const section of STARTER_TIPS) {
      expect(screen.getByRole('button', { name: new RegExp(section.title) })).toBeDefined();
    }
  });

  it('預設全部收合，內容不渲染', () => {
    render(<StarterNpc />);
    for (const section of STARTER_TIPS) {
      const header = screen.getByRole('button', { name: new RegExp(section.title) });
      expect(header.getAttribute('aria-expanded')).toBe('false');
    }
    expect(screen.queryByText(STARTER_TIPS[0].tips[0])).toBeNull();
  });

  it('點擊標題展開該分類的條列內容', () => {
    render(<StarterNpc />);
    const section = STARTER_TIPS[0];
    const header = screen.getByRole('button', { name: new RegExp(section.title) });
    fireEvent.click(header);

    expect(header.getAttribute('aria-expanded')).toBe('true');
    for (const tip of section.tips) {
      expect(screen.getByText(tip)).toBeDefined();
    }
  });

  it('再次點擊可收合，且各分類獨立開合', () => {
    render(<StarterNpc />);
    const first = screen.getByRole('button', { name: new RegExp(STARTER_TIPS[0].title) });
    const second = screen.getByRole('button', { name: new RegExp(STARTER_TIPS[1].title) });

    fireEvent.click(first);
    fireEvent.click(second);
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(second.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(first);
    expect(first.getAttribute('aria-expanded')).toBe('false');
    expect(second.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText(STARTER_TIPS[0].tips[0])).toBeNull();
    expect(screen.getByText(STARTER_TIPS[1].tips[0])).toBeDefined();
  });

  it('切換到其他分頁後不再顯示知識條列', () => {
    render(<StarterNpc />);
    fireEvent.click(screen.getByRole('button', { name: '領取裝備' }));
    expect(screen.queryByText('冒險前的基本知識')).toBeNull();
  });
});

describe('STARTER_TIPS 資料完整性', () => {
  it('id 不重複', () => {
    const ids = STARTER_TIPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每個分類都有標題與至少一條內容', () => {
    for (const section of STARTER_TIPS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.tips.length).toBeGreaterThan(0);
      for (const tip of section.tips) {
        expect(tip.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('同一分類內的條目不重複（React key 使用條目文字）', () => {
    for (const section of STARTER_TIPS) {
      expect(new Set(section.tips).size).toBe(section.tips.length);
    }
  });
});
