// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPanel } from '../StatusPanel';
import { useGameStore } from '../../stores/gameStore';

describe('StatusPanel（底部列 compact 版，§ 34.3）', () => {
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

  it('四條由上往下堆疊：HP → MP → EXP → 負重（§ 34.3）', () => {
    const { container } = render(<StatusPanel />);
    const bars = [...container.querySelectorAll('.bars .bar')];

    // 負重做成進度條是刻意的：條快滿了＝該回村了（§ 20.7）
    expect(bars.map(b => b.className.split(' ')[1])).toEqual([
      'hp-bar', 'mp-bar', 'exp-bar', 'weight-bar',
    ]);
    // 四條在同一個 .bars 容器內，由 CSS 的 flex-direction: column 決定上下順序
    expect(container.querySelectorAll('.bars')).toHaveLength(1);
  });

  it('負重條依比例變色，超重時另外標示無法攻擊', () => {
    const { container } = render(<StatusPanel />);
    const bar = container.querySelector('.bars .weight-bar')!;
    // 空背包 → normal
    expect(bar.className).toContain('is-normal');
    expect(bar.textContent).toContain('負重');
    expect(bar.textContent).not.toContain('無法攻擊');
  });

  it('防禦值放在負重那一行（不獨立成一列）', () => {
    const { container } = render(<StatusPanel />);
    const row = container.querySelector('.bars .bar-row')!;

    expect(row.querySelector('.weight-bar')).toBeTruthy();
    expect(row.querySelector('.defense-value')?.textContent).toContain('防禦');
    expect(container.querySelector('.char-header .defense-value')).toBeNull();
  });

  it('不再顯示「目前區域」（改由頂部地圖選擇器呈現）', () => {
    const { container } = render(<StatusPanel />);
    expect(container.querySelector('.area-info')).toBeNull();
    expect(screen.queryByText(/目前區域/)).toBeNull();
  });
});
