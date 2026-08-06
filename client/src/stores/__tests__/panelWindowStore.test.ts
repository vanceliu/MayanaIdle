import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePanelWindowStore,
  getPanelZIndex,
  PANEL_KEYS,
  PANEL_Z_BASE,
  type PanelKey,
} from '../panelWindowStore';

function reset() {
  usePanelWindowStore.getState().closeAll();
  usePanelWindowStore.setState({
    positions: {
      stats: { x: 24, y: 120 },
      equipment: { x: 396, y: 120 },
      bag: { x: 780, y: 120 },
      skill: { x: 1224, y: 120 },
      quest: { x: 1576, y: 128 },
      script: { x: 700, y: 72 },
    },
    order: [...PANEL_KEYS],
  });
}

describe('panelWindowStore', () => {
  beforeEach(reset);

  it('五個面板（含任務）預設皆為關閉', () => {
    const { open } = usePanelWindowStore.getState();
    expect(Object.values(open).every(v => v === false)).toBe(true);
  });

  it('toggle 開啟後再 toggle 會關閉', () => {
    const { toggle } = usePanelWindowStore.getState();

    toggle('bag');
    expect(usePanelWindowStore.getState().open.bag).toBe(true);

    toggle('bag');
    expect(usePanelWindowStore.getState().open.bag).toBe(false);
  });

  it('可同時開啟多個面板（多開，無互斥）', () => {
    const { toggle } = usePanelWindowStore.getState();

    toggle('bag');
    toggle('equipment');
    toggle('stats');

    const { open } = usePanelWindowStore.getState();
    expect(open.bag).toBe(true);
    expect(open.equipment).toBe(true);
    expect(open.stats).toBe(true);
    expect(open.skill).toBe(false);
  });

  it('開啟時移到 z 順序最上層', () => {
    const { toggle } = usePanelWindowStore.getState();

    toggle('stats');
    toggle('bag');

    const { order } = usePanelWindowStore.getState();
    expect(order[order.length - 1]).toBe('bag');
  });

  it('focusPanel 把指定面板移到最上層且不改變開關狀態', () => {
    const { openPanel, focusPanel } = usePanelWindowStore.getState();

    openPanel('stats');
    openPanel('bag');
    focusPanel('stats');

    const state = usePanelWindowStore.getState();
    expect(state.order[state.order.length - 1]).toBe('stats');
    expect(state.open.stats).toBe(true);
    expect(state.open.bag).toBe(true);
  });

  it('closePanel 只關閉指定面板，位置保留', () => {
    const { openPanel, setPosition, closePanel } = usePanelWindowStore.getState();

    openPanel('skill');
    setPosition('skill', { x: 200, y: 300 });
    closePanel('skill');

    const state = usePanelWindowStore.getState();
    expect(state.open.skill).toBe(false);
    expect(state.positions.skill).toEqual({ x: 200, y: 300 });
  });

  it('setPosition 只影響指定面板', () => {
    const before = usePanelWindowStore.getState().positions.bag;
    usePanelWindowStore.getState().setPosition('stats', { x: 10, y: 20 });

    const after = usePanelWindowStore.getState().positions;
    expect(after.stats).toEqual({ x: 10, y: 20 });
    expect(after.bag).toEqual(before);
  });

  it('closeAll 關閉全部面板', () => {
    const { openPanel, closeAll } = usePanelWindowStore.getState();
    openPanel('bag');
    openPanel('skill');

    closeAll();

    const { open } = usePanelWindowStore.getState();
    expect(Object.values(open).every(v => v === false)).toBe(true);
  });

  /**
   * § 34.8：手機的 sheet 是滿版的，多開只會互相蓋住，被蓋掉的那些玩家也看不到。
   * 一次只留一個面板開著，才對得上畫面上真的看得到的東西。
   */
  it('toggle 帶 exclusive 時，開新面板會關掉其他面板', () => {
    const { openPanel, toggle } = usePanelWindowStore.getState();
    openPanel('bag');
    openPanel('skill');

    toggle('stats', true);

    const { open } = usePanelWindowStore.getState();
    expect(open.stats).toBe(true);
    expect(open.bag).toBe(false);
    expect(open.skill).toBe(false);
  });

  it('toggle 不帶 exclusive（桌機）維持可多開', () => {
    const { openPanel, toggle } = usePanelWindowStore.getState();
    openPanel('bag');

    toggle('stats');

    const { open } = usePanelWindowStore.getState();
    expect(open.stats).toBe(true);
    expect(open.bag).toBe(true);
  });

  it('exclusive 關閉已開啟的面板時就只是關掉它', () => {
    const { openPanel, toggle } = usePanelWindowStore.getState();
    openPanel('bag');

    toggle('bag', true);

    expect(usePanelWindowStore.getState().open.bag).toBe(false);
  });

  it('getPanelZIndex 依 order 位置遞增，最上層 z 最大', () => {
    const order: PanelKey[] = ['stats', 'equipment', 'skill', 'bag'];

    expect(getPanelZIndex(order, 'stats')).toBe(PANEL_Z_BASE);
    expect(getPanelZIndex(order, 'bag')).toBe(PANEL_Z_BASE + 3);
    expect(getPanelZIndex(order, 'bag')).toBeGreaterThan(getPanelZIndex(order, 'skill'));
  });
});
