import { describe, it, expect, beforeEach } from 'vitest';
import {
  useWindowLayerStore,
  getWindowZIndex,
  WINDOW_Z_BASE,
  type WindowLayerKey,
} from '../windowLayerStore';

function z(key: WindowLayerKey): number {
  return getWindowZIndex(useWindowLayerStore.getState().order, key);
}

describe('windowLayerStore', () => {
  beforeEach(() => {
    useWindowLayerStore.setState({ order: [] });
  });

  it('沒被點過的視窗都停在基準層', () => {
    expect(z('combat-log')).toBe(WINDOW_Z_BASE);
    expect(z('town')).toBe(WINDOW_Z_BASE);
    expect(z('panel:bag')).toBe(WINDOW_Z_BASE);
  });

  it('點到誰誰就到最上層', () => {
    const { focusWindow } = useWindowLayerStore.getState();

    focusWindow('combat-log');
    expect(z('combat-log')).toBeGreaterThan(z('town'));

    // 城鎮設施視窗被點到之後就該蓋過戰鬥日誌
    focusWindow('town');
    expect(z('town')).toBeGreaterThan(z('combat-log'));
  });

  it('重複點同一個視窗不會改變順序（避免每次 pointerdown 都重繪）', () => {
    const { focusWindow } = useWindowLayerStore.getState();
    focusWindow('town');
    const orderBefore = useWindowLayerStore.getState().order;

    focusWindow('town');

    expect(useWindowLayerStore.getState().order).toBe(orderBefore);
  });

  it('再次點回舊視窗會把它移到最上層，不會留下重複項', () => {
    const { focusWindow } = useWindowLayerStore.getState();
    focusWindow('town');
    focusWindow('combat-log');
    focusWindow('panel:bag');
    focusWindow('town');

    const order = useWindowLayerStore.getState().order;
    expect(order).toEqual(['combat-log', 'panel:bag', 'town']);
    expect(z('town')).toBeGreaterThan(z('panel:bag'));
    expect(z('panel:bag')).toBeGreaterThan(z('combat-log'));
  });

  it('浮動面板與其他視窗共用同一個堆疊，不是各自一組', () => {
    const { focusWindow } = useWindowLayerStore.getState();
    focusWindow('panel:bag');
    expect(z('panel:bag')).toBeGreaterThan(z('town'));

    focusWindow('map-nav');
    expect(z('map-nav')).toBeGreaterThan(z('panel:bag'));
  });

  it('視窗層級一律低於常駐 HUD 控制（快捷格／面板按鈕的 800）', () => {
    const { focusWindow } = useWindowLayerStore.getState();
    for (const key of ['town', 'combat-log', 'panel:bag', 'panel:stats', 'map-nav'] as WindowLayerKey[]) {
      focusWindow(key);
    }
    expect(z('map-nav')).toBeLessThan(800);
  });
});
