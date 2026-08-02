import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { BAG_DRAG_MIME, decodeBagDrag } from '../../models/bagLayout';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

describe('BagPanel', () => {
  it('renders with section header and slot count', () => {
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
    // § 35.1：無腰帶時為基礎 50 格
    expect(screen.getByText(/\/50/)).toBeDefined();
  });

it('shows gold row when expanded', () => {
    render(<BagPanel />);
    expect(screen.getByText('金幣')).toBeDefined();
  });

  it('shows potion cells with counts', () => {
    useGameStore.setState({
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 10 }],
    });
    render(<BagPanel />);
    expect(screen.getByText('紅色藥水')).toBeDefined();
  });

  it('shows empty message when no items', () => {
    useGameStore.setState({ bagItems: [], inventory: [] });
    render(<BagPanel />);
    expect(screen.getByText('背包')).toBeDefined();
  });

  /**
   * 迴歸測試：`effectAllowed` 必須允許 copy 與 move 兩種。
   *
   * 快捷鍵綁定用 `dropEffect='copy'`、丟到地圖用 `'move'`；
   * 若來源只宣告 `'move'`，瀏覽器會判定與 `'copy'` 不相容而**直接取消放置**，
   * drop 事件根本不會觸發 —— 症狀是「拖不進快捷鍵，但丟到地圖可以」。
   */
  it('拖曳來源的 effectAllowed 同時允許 copy 與 move', () => {
    useGameStore.setState({
      bagItems: [{ name: '紅色藥水', type: 'potion', amount: 3 }],
      inventory: [],
    });
    render(<BagPanel />);

    const cell = document.querySelector('.bag-cell:not(.empty)');
    expect(cell).not.toBeNull();

    const store: Record<string, string> = {};
    const dataTransfer = {
      types: [] as string[],
      setData: (type: string, value: string) => { store[type] = value; dataTransfer.types.push(type); },
      getData: (type: string) => store[type] ?? '',
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(cell!, { dataTransfer });

    expect(dataTransfer.effectAllowed).toBe('copyMove');
    // 同時確認負載有寫進去，且解得出來
    expect(decodeBagDrag(store[BAG_DRAG_MIME])).toEqual({
      kind: 'bag', name: '紅色藥水', amount: 3, equipmentId: undefined,
    });
  });
});