// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MonsterListOverlay } from '../../components/MonsterListOverlay';
import { useGameStore } from '../../stores/gameStore';
import { useMonsterHudStore, type MonsterHudEntry } from '../../stores/monsterHudStore';
import type { ActiveEffect } from '../../models/effect';

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

function createEntry(overrides: Partial<MonsterHudEntry> = {}): MonsterHudEntry {
  return {
    id: 'm_1',
    name: '石像鬼',
    currentHp: 30,
    maxHp: 60,
    isBoss: false,
    ...overrides,
  };
}

function createMonsterDebuff(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: `md-${Math.random()}`,
    sourceSkillId: 'skill-1',
    sourceSkillName: '毒刃',
    category: 'dot-poison',
    type: 'debuff',
    target: 'monster',
    targetMonsterId: 'm_1',
    startTime: Date.now(),
    duration: 10000,
    tags: [],
    name: '中毒',
    description: '每秒受到 5 點毒傷害',
    ...overrides,
  };
}

describe('MonsterListOverlay（§ 24.8.3 怪物列表）', () => {
  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
    useMonsterHudStore.setState({ entries: [], targetId: null });
  });

  it('地圖上沒有怪時不渲染', () => {
    const { container } = render(<MonsterListOverlay />);
    expect(container.querySelector('.monster-list-overlay')).toBeNull();
  });

  it('地圖上有幾隻怪就顯示幾張卡片', () => {
    useMonsterHudStore.setState({
      entries: [
        createEntry({ id: 'm_1', name: '石像鬼' }),
        createEntry({ id: 'm_2', name: '哥布林' }),
        createEntry({ id: 'm_3', name: '骷髏兵' }),
      ],
    });

    render(<MonsterListOverlay />);
    expect(screen.getAllByTestId('monster-card')).toHaveLength(3);
    expect(screen.getByText('石像鬼')).toBeTruthy();
    expect(screen.getByText('哥布林')).toBeTruthy();
    expect(screen.getByText('骷髏兵')).toBeTruthy();
  });

  it('只有正在攻擊的目標卡片有 is-target 高亮', () => {
    useMonsterHudStore.setState({
      entries: [createEntry({ id: 'm_1' }), createEntry({ id: 'm_2', name: '哥布林' })],
      targetId: 'm_2',
    });

    const { container } = render(<MonsterListOverlay />);
    const targets = container.querySelectorAll('.monster-card.is-target');
    expect(targets).toHaveLength(1);
    expect(targets[0].textContent).toContain('哥布林');
  });

  it('無目標時沒有任何卡片被高亮', () => {
    useMonsterHudStore.setState({ entries: [createEntry()], targetId: null });

    const { container } = render(<MonsterListOverlay />);
    expect(container.querySelector('.monster-card.is-target')).toBeNull();
  });

  it('Boss 卡片套用 is-boss 特殊底色樣式', () => {
    useMonsterHudStore.setState({
      entries: [createEntry({ id: 'm_1' }), createEntry({ id: 'm_2', name: '岩巨魔', isBoss: true })],
    });

    const { container } = render(<MonsterListOverlay />);
    const bosses = container.querySelectorAll('.monster-card.is-boss');
    expect(bosses).toHaveLength(1);
    expect(bosses[0].textContent).toContain('岩巨魔');
  });

  it('HP 條寬度依剩餘血量百分比呈現', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ currentHp: 15, maxHp: 60 })] });

    const { container } = render(<MonsterListOverlay />);
    const fill = container.querySelector('.monster-card-hp-fill') as HTMLElement;
    expect(fill.style.width).toBe('25%');
  });

  it('HP 為 0 時寬度為 0%', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ currentHp: 0, maxHp: 60 })] });

    const { container } = render(<MonsterListOverlay />);
    const fill = container.querySelector('.monster-card-hp-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });

  it('顯示該怪身上的 debuff icon 與剩餘秒數', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ id: 'm_1' })] });
    useGameStore.setState({
      activeEffects: [
        createMonsterDebuff({ id: 'd1', targetMonsterId: 'm_1', category: 'dot-poison' }),
        createMonsterDebuff({
          id: 'd2', targetMonsterId: 'm_1', category: 'stun', name: '暈眩', duration: 2000,
        }),
      ],
    });

    render(<MonsterListOverlay />);
    expect(screen.getAllByTestId('monster-debuff-icon')).toHaveLength(2);
    expect(screen.getByTestId('icon-debuffs/poison-gas')).toBeTruthy();
    expect(screen.getByTestId('icon-debuffs/stoned-skull')).toBeTruthy();
    expect(screen.getByText('10s')).toBeTruthy();
    expect(screen.getByText('2s')).toBeTruthy();
  });

  it('debuff 只掛在對應的怪身上', () => {
    useMonsterHudStore.setState({
      entries: [createEntry({ id: 'm_1' }), createEntry({ id: 'm_2', name: '哥布林' })],
    });
    useGameStore.setState({ activeEffects: [createMonsterDebuff({ targetMonsterId: 'm_2' })] });

    const cards = render(<MonsterListOverlay />).container.querySelectorAll('.monster-card');
    expect(cards[0].querySelectorAll('.monster-debuff-icon')).toHaveLength(0);
    expect(cards[1].querySelectorAll('.monster-debuff-icon')).toHaveLength(1);
  });

  it('不顯示角色身上的 debuff', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ id: 'm_1' })] });
    useGameStore.setState({
      activeEffects: [createMonsterDebuff({ target: 'player', targetMonsterId: undefined })],
    });

    const { container } = render(<MonsterListOverlay />);
    expect(container.querySelectorAll('.monster-debuff-icon')).toHaveLength(0);
  });

  it('超過 4 個 debuff 顯示 +N', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ id: 'm_1' })] });
    useGameStore.setState({
      activeEffects: Array.from({ length: 6 }, (_, i) =>
        createMonsterDebuff({ id: `d${i}`, category: `cat-${i}` })
      ),
    });

    render(<MonsterListOverlay />);
    expect(screen.getAllByTestId('monster-debuff-icon')).toHaveLength(4);
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('剩餘 < 5 秒的 debuff 套用 expiring 閃爍', () => {
    useMonsterHudStore.setState({ entries: [createEntry({ id: 'm_1' })] });
    useGameStore.setState({
      activeEffects: [createMonsterDebuff({ startTime: Date.now() - 8000, duration: 10000 })],
    });

    const { container } = render(<MonsterListOverlay />);
    expect(container.querySelector('.monster-debuff-icon.expiring')).toBeTruthy();
  });

  it('hover debuff icon 顯示 tooltip 細節', async () => {
    useMonsterHudStore.setState({ entries: [createEntry({ id: 'm_1' })] });
    useGameStore.setState({ activeEffects: [createMonsterDebuff({ id: 'd1' })] });

    render(<MonsterListOverlay />);
    fireEvent.mouseEnter(screen.getByTestId('monster-debuff-icon').parentElement!);

    await waitFor(() => {
      expect(screen.getByText('中毒')).toBeTruthy();
    });
    expect(screen.getByText('每秒受到 5 點毒傷害')).toBeTruthy();
    expect(screen.getByText('來源: 毒刃')).toBeTruthy();
  });
});
