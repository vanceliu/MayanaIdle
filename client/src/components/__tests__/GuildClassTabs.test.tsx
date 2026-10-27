import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MagicAcademy } from '../town/MagicAcademy';
import { AdventurerGuild } from '../town/AdventurerGuild';
import { useGameStore } from '../../stores/gameStore';
import { bagItem } from '../../testing/bagFixtures';

/**
 * @vitest-environment jsdom
 */

function renderClassSkillTab() {
  render(<MagicAcademy />);
  fireEvent.click(screen.getByText('職業技能'));
}

describe('魔法學院 — 職業技能分頁（§ 13.9）', () => {
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
      bagItems: [bagItem('盾擊技能書', 1)],
    });
  });

  it('renders class skills for knight', () => {
    renderClassSkillTab();
    expect(screen.getByText('盾擊')).toBeDefined();
    expect(screen.getByText('裂傷斬')).toBeDefined();
  });

  it('allows learning when level and book requirements met', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
    });
    renderClassSkillTab();
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables learning when level too low', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 5 },
    });
    renderClassSkillTab();
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables learning when no book in bag', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
      bagItems: [],
    });
    renderClassSkillTab();
    const learnButtons = screen.getAllByText('學習');
    expect((learnButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('learns skill when clicked and removes book', () => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10 },
    });
    renderClassSkillTab();
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
    renderClassSkillTab();
    expect(screen.getByText('已學習')).toBeDefined();
  });
});

describe('冒險者工會 — 冒險任務／職業任務分頁（§ 13.10）', () => {
  beforeEach(() => {
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, level: 10, quests: [] },
      adventurerQuests: [],
      guildProgress: { rank: 'F', points: 0 },
      questBoardTownId: null,
    });
  });

  it('預設顯示冒險任務，等階狀態只在冒險任務分頁', () => {
    const { container } = render(<AdventurerGuild />);
    expect(container.querySelector('.adventurer-guild-status')).not.toBeNull();
    expect(screen.queryByText(/職業試煉/)).toBeNull();

    fireEvent.click(screen.getByText('職業任務'));
    expect(container.querySelector('.adventurer-guild-status')).toBeNull();
  });

  it('職業任務分頁可接取職業試煉', () => {
    render(<AdventurerGuild />);
    fireEvent.click(screen.getByText('職業任務'));
    expect(screen.getByText(/職業試煉 — 實戰訓練/)).toBeDefined();

    fireEvent.click(screen.getByText('接取'));
    const quests = useGameStore.getState().character!.quests;
    expect(quests).toHaveLength(1);
    expect(quests[0].status).toBe('active');
    expect(screen.getByText('進行中')).toBeDefined();
  });

  it('接取職業任務不佔冒險任務上限（§ 36.6.2）', () => {
    render(<AdventurerGuild />);
    fireEvent.click(screen.getByText('職業任務'));
    fireEvent.click(screen.getByText('接取'));
    fireEvent.click(screen.getByText('冒險任務'));
    expect(screen.getByText(/已接取：0\//)).toBeDefined();
  });
});
