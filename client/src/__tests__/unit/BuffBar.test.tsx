// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuffBar } from '../../components/BuffBar';
import { useGameStore } from '../../stores/gameStore';
import type { ActiveEffect } from '../../models/effect';

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

  it('shows overflow count when more than 8 buffs', () => {
    const buffs = Array.from({ length: 10 }, (_, i) =>
      createBuff({ id: `b${i}`, category: `cat-${i}` })
    );
    useGameStore.setState({ activeEffects: buffs });

    render(<BuffBar />);
    expect(screen.getByText('+2')).toBeTruthy();
  });

  it('shows max 8 icons when overflow', () => {
    const buffs = Array.from({ length: 12 }, (_, i) =>
      createBuff({ id: `b${i}`, category: `cat-${i}` })
    );
    useGameStore.setState({ activeEffects: buffs });

    const { container } = render(<BuffBar />);
    const icons = container.querySelectorAll('.buff-icon');
    expect(icons.length).toBe(8);
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

  it('buff 與 debuff 分成兩列，各自一列', () => {
    useGameStore.setState({
      activeEffects: [createBuff({ id: 'b1' }), createPlayerDebuff('slow', '減速', 6000)],
    });

    const { container } = render(<BuffBar />);
    const rows = container.querySelectorAll('.buff-row');
    expect(rows).toHaveLength(2);
    // 上排 buff、下排 debuff
    expect(rows[0].className).toContain('is-buff');
    expect(rows[1].className).toContain('is-debuff');
    expect(rows[0].querySelectorAll('.buff-icon.is-buff')).toHaveLength(1);
    expect(rows[1].querySelectorAll('.buff-icon.is-debuff')).toHaveLength(1);
  });

  it('只有其中一種時不渲染另一列（不留空行）', () => {
    useGameStore.setState({ activeEffects: [createPlayerDebuff('curse', '詛咒')] });
    const { container } = render(<BuffBar />);

    const rows = container.querySelectorAll('.buff-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].className).toContain('is-debuff');
  });

  it('兩列的溢位各自計算（buff 9 個、debuff 9 個 → 各顯示 +1）', () => {
    useGameStore.setState({
      activeEffects: [
        ...Array.from({ length: 9 }, (_, i) => createBuff({ id: `b${i}`, category: `bcat-${i}` })),
        ...Array.from({ length: 9 }, (_, i) => createPlayerDebuff(`dcat-${i}`, `debuff${i}`)),
      ],
    });

    const { container } = render(<BuffBar />);
    const rows = container.querySelectorAll('.buff-row');
    expect(rows[0].querySelectorAll('.buff-icon')).toHaveLength(8);
    expect(rows[1].querySelectorAll('.buff-icon')).toHaveLength(8);
    expect(container.querySelectorAll('.buff-overflow')).toHaveLength(2);
    for (const el of container.querySelectorAll('.buff-overflow')) {
      expect(el.textContent).toBe('+1');
    }
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
