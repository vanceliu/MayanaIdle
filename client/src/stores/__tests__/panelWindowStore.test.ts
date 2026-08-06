import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePanelWindowStore,
  getPanelZIndex,
  clampedDefaults,
  getCurrentViewport,
  PANEL_KEYS,
  PANEL_WIDTHS,
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
   * `47-mobile.md`：手機的 sheet 是滿版的，多開只會互相蓋住，被蓋掉的那些玩家也看不到。
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

  /**
   * 回歸：`DEFAULT_POSITIONS` 是以寬螢幕排出來的（任務面板 x=1576），
   * 1600 以下的機器上直接寫回去會有一半在畫面外，而 `.game-layout` 是
   * `overflow: hidden` —— 露出去的部分是被裁掉，不是可以捲過去。
   *
   * `FloatingWindow` 掛載時雖然也會夾一次，但那只在開啟的當下跑；
   * 面板已經開著時按「重設視窗位置」就沒有人夾了。
   */
  describe('預設位置夾進視窗', () => {
    it('視窗放得下時維持原本的錯開座標', () => {
      const pos = clampedDefaults({ w: 1920, h: 1080 });
      expect(pos.quest).toEqual({ x: 1576, y: 128 });
    });

    it('視窗較窄時把面板整個拉回畫面內（右緣不超出）', () => {
      const viewport = { w: 1366, h: 768 };
      const pos = clampedDefaults(viewport);

      for (const key of PANEL_KEYS) {
        expect(pos[key].x + PANEL_WIDTHS[key], key).toBeLessThanOrEqual(viewport.w);
        expect(pos[key].x, key).toBeGreaterThanOrEqual(0);
      }
    });

    it('視窗很矮時仍保證標題列留在畫面上', () => {
      const pos = clampedDefaults({ w: 1366, h: 100 });
      for (const key of PANEL_KEYS) {
        expect(pos[key].y, key).toBeLessThanOrEqual(100 - 80);
      }
    });

    it('量不到視窗尺寸時退回原始預設值，不可回傳 NaN', () => {
      expect(clampedDefaults(null)).toEqual(clampedDefaults({ w: 99999, h: 99999 }));
    });

    it('resetPositions 走的是夾過的預設值', () => {
      const { resetPositions, setPosition } = usePanelWindowStore.getState();
      setPosition('quest', { x: 10, y: 10 });

      resetPositions();

      const { quest } = usePanelWindowStore.getState().positions;
      const viewport = getCurrentViewport();
      if (viewport) {
        expect(quest.x + PANEL_WIDTHS.quest).toBeLessThanOrEqual(viewport.w);
      }
      expect(quest).toEqual(clampedDefaults(viewport).quest);
    });
  });

  it('getPanelZIndex 依 order 位置遞增，最上層 z 最大', () => {
    const order: PanelKey[] = ['stats', 'equipment', 'skill', 'bag'];

    expect(getPanelZIndex(order, 'stats')).toBe(PANEL_Z_BASE);
    expect(getPanelZIndex(order, 'bag')).toBe(PANEL_Z_BASE + 3);
    expect(getPanelZIndex(order, 'bag')).toBeGreaterThan(getPanelZIndex(order, 'skill'));
  });
});
