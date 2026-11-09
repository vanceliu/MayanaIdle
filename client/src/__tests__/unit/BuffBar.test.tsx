// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuffBar } from '../../components/BuffBar';
import { useGameStore } from '../../stores/gameStore';
import type { ActiveEffect } from '../../models/effect';

const layout = vi.hoisted(() => ({ rowsPerColumn: null as number | null, isMobile: false }));

vi.mock('../../hooks/useBuffColumns', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useBuffColumns')>(),
  useBuffRowsPerColumn: () => layout.rowsPerColumn,
}));

vi.mock('../../hooks/useViewport', async importOriginal => ({
  ...await importOriginal<typeof import('../../hooks/useViewport')>(),
  useIsMobile: () => layout.isMobile,
}));

vi.mock('../../components/GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

function createBuff(overrides: Partial<ActiveEffect> = {}): ActiveEffect {
  return {
    id: `buff-${Math.random()}`,
    sourceSkillId: 'skill-1',
    sourceSkillName: '火矢附魔',
    category: 'fire-enchant',
    type: 'buff',
    target: 'player',
    startTime: Date.now(),
    duration: 300000,
    tags: [],
    name: '火矢附魔',
    description: '火屬性傷害 +15',
    ...overrides,
  };
}

describe('BuffBar', () => {
  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
    layout.rowsPerColumn = null;
    layout.isMobile = false;
  });

  it('renders nothing when no buffs', () => {
    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-bar')).toBeNull();
  });

  it('renders buff icons for player buffs', () => {
    const buff = createBuff({ id: 'b1' });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByTestId('icon-buffs/flaming-arrow')).toBeTruthy();
  });

  it('does not render monster debuffs', () => {
    const debuff = createBuff({ id: 'd1', type: 'debuff', target: 'monster', targetIdx: 0 });
    useGameStore.setState({ activeEffects: [debuff] });

    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-bar')).toBeNull();
  });

  it('量不到每欄格數時單欄全部顯示、沒有 +N', () => {
    useGameStore.setState({
      activeEffects: Array.from({ length: 12 }, (_, i) => createBuff({ id: `b${i}`, category: `cat-${i}` })),
    });

    const { container } = render(<BuffBar />);
    expect(container.querySelectorAll('.buff-icon')).toHaveLength(12);
    expect(container.querySelector('.buff-overflow')).toBeNull();
    expect((container.querySelector('.buff-bar') as HTMLElement).style.gridTemplateRows).toBe('');
  });

  it('依每欄格數排兩欄（grid-template-rows）', () => {
    layout.rowsPerColumn = 4;
    useGameStore.setState({ activeEffects: [createBuff({ id: 'b1' })] });

    const { container } = render(<BuffBar />);
    const bar = container.querySelector('.buff-bar') as HTMLElement;
    expect(bar.style.gridAutoFlow).toBe('column');
    expect(bar.style.gridTemplateRows).toBe('repeat(4, auto)');
  });

  it('兩欄放不下時最後一格改成 +N（每欄 3 格、10 個 → 顯示 5 個＋「+5」）', () => {
    layout.rowsPerColumn = 3;
    useGameStore.setState({
      activeEffects: Array.from({ length: 10 }, (_, i) => createBuff({ id: `b${i}`, category: `cat-${i}` })),
    });

    const { container } = render(<BuffBar />);
    expect(container.querySelectorAll('.buff-icon')).toHaveLength(5);
    expect(screen.getByText('+5')).toBeTruthy();
  });

  it('手機圖示 28px、桌機 36px', () => {
    useGameStore.setState({ activeEffects: [createBuff({ id: 'b1' })] });
    const desktop = render(<BuffBar />);
    expect(screen.getByTestId('icon-buffs/flaming-arrow').dataset.size).toBe('36');
    desktop.unmount();

    layout.isMobile = true;
    render(<BuffBar />);
    expect(screen.getByTestId('icon-buffs/flaming-arrow').dataset.size).toBe('28');
  });

  it('applies expiring class when remaining < 5s', () => {
    const buff = createBuff({
      id: 'expiring',
      startTime: Date.now() - 297000,
      duration: 300000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-icon.expiring')).toBeTruthy();
  });

  it('formats time as M:SS when >= 60s', () => {
    const buff = createBuff({
      id: 'long',
      startTime: Date.now(),
      duration: 120000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByText('2:00')).toBeTruthy();
  });

  it('formats time as Ns when < 60s', () => {
    const buff = createBuff({
      id: 'short',
      startTime: Date.now() - 270000,
      duration: 300000,
    });
    useGameStore.setState({ activeEffects: [buff] });

    render(<BuffBar />);
    expect(screen.getByText('30s')).toBeTruthy();
  });
});

describe('BuffBar — 角色 Debuff（§ 24.8.2）', () => {
  beforeEach(() => {
    useGameStore.setState({ activeEffects: [] });
    layout.rowsPerColumn = null;
  });

  function createPlayerDebuff(category: string, name: string, duration = 8000): ActiveEffect {
    return createBuff({
      id: `pd-${category}`,
      type: 'debuff',
      target: 'player',
      category,
      name,
      sourceSkillName: '毒蛇',
      description: '測試用 debuff',
      duration,
      tags: [],
    });
  }

  it('顯示角色 debuff 並套用紅框樣式', () => {
    useGameStore.setState({ activeEffects: [createPlayerDebuff('curse', '詛咒')] });

    const { container } = render(<BuffBar />);
    expect(container.querySelector('.buff-icon.is-debuff')).toBeTruthy();
    expect(container.querySelector('.buff-icon.is-buff')).toBeNull();
  });

  it('依序排：buff 在前、debuff 在後（加入順序不影響）', () => {
    useGameStore.setState({
      activeEffects: [createPlayerDebuff('slow', '減速', 6000), createBuff({ id: 'b1' })],
    });

    const { container } = render(<BuffBar />);
    const icons = container.querySelectorAll('.buff-icon');
    expect(icons).toHaveLength(2);
    expect(icons[0].className).toContain('is-buff');
    expect(icons[1].className).toContain('is-debuff');
  });

  it('buff 與 debuff 共用一個 +N（每欄 4 格、buff 6＋debuff 6 → 顯示 7 個＋「+5」）', () => {
    layout.rowsPerColumn = 4;
    useGameStore.setState({
      activeEffects: [
        ...Array.from({ length: 6 }, (_, i) => createBuff({ id: `b${i}`, category: `bcat-${i}` })),
        ...Array.from({ length: 6 }, (_, i) => createPlayerDebuff(`dcat-${i}`, `debuff${i}`)),
      ],
    });

    const { container } = render(<BuffBar />);
    expect(container.querySelectorAll('.buff-icon.is-buff')).toHaveLength(6);
    expect(container.querySelectorAll('.buff-icon.is-debuff')).toHaveLength(1);
    const overflow = container.querySelectorAll('.buff-overflow');
    expect(overflow).toHaveLength(1);
    expect(overflow[0].textContent).toBe('+5');
  });

  it('六種 debuff 各自對應到 icon', () => {
    const cases: [string, string][] = [
      ['dot-poison', 'icon-debuffs/poison-gas'],
      ['dot-bleed', 'icon-debuffs/bleeding-wound'],
      ['curse', 'icon-debuffs/skull-crossed-bones'],
      ['weaken', 'icon-debuffs/weaken-arrow'],
      ['slow', 'icon-debuffs/snail-slow'],
      ['stun', 'icon-debuffs/stoned-skull'],
    ];
    for (const [category, iconTestId] of cases) {
      useGameStore.setState({ activeEffects: [createPlayerDebuff(category, category)] });
      const { unmount } = render(<BuffBar />);
      expect(screen.getByTestId(iconTestId), category).toBeTruthy();
      unmount();
    }
  });

  it('debuff tooltip 標記為紅色名稱', () => {
    useGameStore.setState({ activeEffects: [createPlayerDebuff('weaken', '虛弱')] });
    const { container } = render(<BuffBar />);
    expect(container.querySelector('[data-testid="player-debuff-icon"]')).toBeTruthy();
  });
});

describe('怒氣、平靜顯示當下數值（`07-affix-ability.md` § 7S.7）', () => {
  it('以數值取代倒數秒數', () => {
    const now = Date.now();
    useGameStore.setState({
      character: null,
      activeEffects: [
        createBuff({ category: 'ability-rage', name: '怒氣', startTime: now, duration: 8000,
          modifiers: [{ stat: 'rage_decay', value: 10, isPercent: false }] }),
        createBuff({ category: 'ability-calm', name: '平靜', startTime: now - 5500, duration: 3_600_000,
          modifiers: [{ stat: 'calm_rate', value: 7, isPercent: false }] }),
      ],
    });
    render(<BuffBar />);
    const timers = Array.from(document.querySelectorAll('.buff-timer')).map(e => e.textContent);
    expect(timers).toContain('80');
    expect(timers).toContain('35');
    expect(screen.getAllByTestId('player-buff-icon').every(e => !e.classList.contains('expiring'))).toBe(true);
  });
});
