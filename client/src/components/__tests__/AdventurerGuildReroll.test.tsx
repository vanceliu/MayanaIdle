import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdventurerGuild } from '../town/AdventurerGuild';
import { useGameStore } from '../../stores/gameStore';
import { QUEST_BOARD_REFRESH_COST } from '../../models/adventurerQuest';

/**
 * @vitest-environment jsdom
 */

function setup(points: number) {
  useGameStore.setState({
    character: {
      name: 'TestGuild',
      className: 'knight',
      level: 30,
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
    } as never,
    adventurerQuests: [],
    guildProgress: { rank: 'C', points },
    questBoardTownId: null,
  });
}

describe('冒險者工會 — 手動刷新（§ 36.6.3）', () => {
  beforeEach(() => setup(2000));

  it('刷新只換掉目前分頁，其他分頁不動，並扣 50 貢獻', () => {
    render(<AdventurerGuild />);
    const before = useGameStore.getState().adventurerQuestBoard;
    const otherTabBefore = before.C;
    const activeTabBefore = before.D;

    fireEvent.click(screen.getByText(`重整（-${QUEST_BOARD_REFRESH_COST} 貢獻）`));

    const after = useGameStore.getState().adventurerQuestBoard;
    expect(after.C).toBe(otherTabBefore);
    expect(after.D.map(q => q.id)).not.toEqual(activeTabBefore.map(q => q.id));
    expect(after.D.length).toBeGreaterThanOrEqual(5);
    expect(useGameStore.getState().guildProgress.points).toBe(2000 - QUEST_BOARD_REFRESH_COST);
  });

  it('貢獻不足時按鈕禁用且不扣點', () => {
    setup(QUEST_BOARD_REFRESH_COST - 1);
    render(<AdventurerGuild />);
    const btn = screen.getByText(`重整（-${QUEST_BOARD_REFRESH_COST} 貢獻）`) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    useGameStore.getState().rerollQuestBoard('D');
    expect(useGameStore.getState().guildProgress.points).toBe(QUEST_BOARD_REFRESH_COST - 1);
  });

  it('扣到跌破門檻時照常降階（§ 36.4.1）', () => {
    // C 階門檻 1800，扣 50 後 1790 落回 D 階
    setup(1800 + 40);
    render(<AdventurerGuild />);
    fireEvent.click(screen.getByText(`重整（-${QUEST_BOARD_REFRESH_COST} 貢獻）`));

    expect(useGameStore.getState().guildProgress.points).toBe(1790);
    expect(useGameStore.getState().guildProgress.rank).toBe('D');
  });

  it('已接取的任務不受刷新影響', () => {
    render(<AdventurerGuild />);
    const target = useGameStore.getState().adventurerQuestBoard.D[0];
    useGameStore.getState().acceptAdventurerQuest(target);
    expect(useGameStore.getState().adventurerQuests).toHaveLength(1);

    fireEvent.click(screen.getByText(`重整（-${QUEST_BOARD_REFRESH_COST} 貢獻）`));

    const active = useGameStore.getState().adventurerQuests;
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(target.id);
  });
});
