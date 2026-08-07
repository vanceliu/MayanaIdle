import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EQUIPMENT_TIER_COLORS, getEquipmentInstanceTierLevel } from '../../models/equipmentTier';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { QuickSlotBar } from '../QuickSlotBar';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { LONG_PRESS_MS } from '../../hooks/useLongPress';
import { dragTo, dragStart, pointAt, restoreElementFromPoint } from '../../testing/pointerDrag';
import { QUICK_SLOT_COUNT, emptyQuickSlots } from '../../models/quickSlot';
import type { EquipmentInstance } from '../../models/equipment';
import { bagItem } from '../../testing/bagFixtures';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => EQUIPMENT_SEEDS,
}));

// GameIcon 的 SVG 是非同步載入的，載入前會回傳沒有顏色的佔位 span。
// 這裡改成把 props 攤平成 data-*，直接驗證「傳給圖示的顏色」而不是渲染結果。
vi.mock('../GameIcon', () => ({
  GameIcon: ({ name, color }: { name: string; color?: string }) =>
    <span data-testid="icon" data-name={name} data-color={color ?? ''} />,
}));

/**
 * @vitest-environment jsdom
 */

const slots = () => document.querySelectorAll('.quick-slot');

describe('QuickSlotBar', () => {
  beforeEach(() => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots(),
      bagItems: [bagItem('紅色藥水', 5)],
      inventory: [],
    });
  });

  it('渲染 10 格，標籤為 1~9 與 0', () => {
    render(<QuickSlotBar />);
    expect(slots()).toHaveLength(QUICK_SLOT_COUNT);
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('9')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
  });

  /**
   * 迴歸測試：空格原本用 `disabled` 標記，而**被 disable 的按鈕收不到 drag 事件**，
   * 導致任何物品都放不進快捷鍵。空格必須永遠可以接收拖放。
   */
  it('空格沒有 disabled 屬性（否則收不到 drag 事件）', () => {
    render(<QuickSlotBar />);
    for (const el of slots()) {
      expect((el as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('右鍵清除該格', () => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i === 2 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
    });
    render(<QuickSlotBar />);

    fireEvent.contextMenu(slots()[2]);
    expect(useGameStore.getState().quickSlots[2]).toBeNull();
  });

  /**
   * `47-mobile.md`：手機沒有右鍵，長按是唯一的清除入口。
   * 沒有這條路徑，快捷格在手機上綁上去就再也拿不下來。
   */
  it('長按清除該格（觸控沒有右鍵）', async () => {
    vi.useFakeTimers();
    try {
      useGameStore.setState({
        quickSlots: emptyQuickSlots().map((_, i) =>
          i === 2 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
      });
      render(<QuickSlotBar />);

      fireEvent.pointerDown(slots()[2], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
      await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });

      expect(useGameStore.getState().quickSlots[2]).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('按住但手指滑開（捲動）不算長按', async () => {
    vi.useFakeTimers();
    try {
      useGameStore.setState({
        quickSlots: emptyQuickSlots().map((_, i) =>
          i === 2 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
      });
      render(<QuickSlotBar />);

      fireEvent.pointerDown(slots()[2], { button: 0, clientX: 5, clientY: 5, pointerType: 'touch' });
      fireEvent.pointerMove(slots()[2], { clientX: 5, clientY: 90, pointerType: 'touch' });
      await act(async () => { await vi.advanceTimersByTimeAsync(LONG_PRESS_MS + 20); });

      expect(useGameStore.getState().quickSlots[2]).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * 快捷格綁定的落點測試（`47-mobile.md`）。
 *
 * 綁定動作已經由拖曳來源（背包）執行，快捷格只宣告自己是落點，
 * 所以測試必須把兩個元件一起渲染 —— 只渲染快捷格是測不到這條路徑的。
 */
describe('從背包拖曳到快捷格', () => {
  beforeEach(() => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots(),
      bagItems: [bagItem('紅色藥水', 5)],
      inventory: [],
    });
  });

  afterEach(() => restoreElementFromPoint());

  function renderBoth() {
    render(<><BagPanel /><QuickSlotBar /></>);
    const source = document.querySelector('.bag-cell:not(.empty)');
    expect(source).not.toBeNull();
    return source!;
  }

  it('把背包藥水拖到空格 → 綁定該格', () => {
    const source = renderBoth();
    dragTo(source, slots()[3]);
    expect(useGameStore.getState().quickSlots[3]).toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('拖到第 10 格（鍵盤 0）也能綁定', () => {
    const source = renderBoth();
    dragTo(source, slots()[QUICK_SLOT_COUNT - 1]);
    expect(useGameStore.getState().quickSlots[QUICK_SLOT_COUNT - 1])
      .toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('拖入不可放置的物品時不綁定', () => {
    useGameStore.setState({ bagItems: [bagItem('武器強化卷軸', 1)] });
    const source = renderBoth();
    dragTo(source, slots()[0]);
    expect(useGameStore.getState().quickSlots[0]).toBeNull();
  });

  it('同一個物品拖到新格時，舊格自動清空', () => {
    const source = renderBoth();
    dragTo(source, slots()[1]);
    expect(useGameStore.getState().quickSlots[1]).not.toBeNull();

    dragTo(source, slots()[6]);
    expect(useGameStore.getState().quickSlots[1]).toBeNull();
    expect(useGameStore.getState().quickSlots[6]).toEqual({ kind: 'potion', potionType: 'red' });
  });

  it('拖曳中的快捷格會亮出可放置提示', () => {
    const source = renderBoth();
    dragStart(source);
    expect(slots()[0].className).toContain('droppable');
  });

  it('放在沒有落點的地方＝什麼都不做', () => {
    const source = renderBoth();
    pointAt(document.body);
    fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerType: 'mouse' });
    fireEvent.pointerMove(source, { clientX: 40, clientY: 40, pointerType: 'mouse' });
    fireEvent.pointerUp(source, { clientX: 40, clientY: 40, pointerType: 'mouse' });

    expect(useGameStore.getState().quickSlots.every(s => s == null)).toBe(true);
  });
});

describe('滑鼠兩段確認（§ 35.7.5）', () => {
  beforeEach(() => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i === 0 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
      bagItems: [bagItem('紅色藥水', 5)],
      inventory: [],
      // 藥水冷卻是全域共用（`30-items.md`），跨測試會殘留，必須重置
      lastPotionUsedAt: 0,
      character: {
        name: 'T', className: 'knight', level: 10, exp: 0, expToNext: 100,
        hp: 50, maxHp: 100, mp: 30, maxMp: 50,
        baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
        gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
        currentRegion: 'dawn-plains', currentFloor: null, skills: [],
        unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
      } as never,
    });
  });

  it('第一次點擊只選取，不執行', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);

    expect(slots()[0].className).toContain('selected');
    expect(useGameStore.getState().bagItems[0].amount).toBe(before);
  });

  it('再點同一格才執行，並解除選取', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);
    fireEvent.click(slots()[0]);

    expect(useGameStore.getState().bagItems[0].amount).toBeLessThan(before);
    expect(slots()[0].className).not.toContain('selected');
  });

  it('點另一格會移動選取，不會執行前一格', () => {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i <= 1 ? { kind: 'potion' as const, potionType: 'red' as const } : null),
    });
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.click(slots()[0]);
    fireEvent.click(slots()[1]);

    expect(slots()[0].className).not.toContain('selected');
    expect(slots()[1].className).toContain('selected');
    expect(useGameStore.getState().bagItems[0].amount).toBe(before);
  });

  it('Esc 解除選取', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[0]);
    expect(slots()[0].className).toContain('selected');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(slots()[0].className).not.toContain('selected');
  });

  it('鍵盤快捷鍵一按即發，不需要兩段確認', () => {
    render(<QuickSlotBar />);
    const before = useGameStore.getState().bagItems[0].amount;

    fireEvent.keyDown(window, { key: '1' });

    expect(useGameStore.getState().bagItems[0].amount).toBeLessThan(before);
  });

  it('點空格不會進入選取狀態', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[5]);
    expect(slots()[5].className).not.toContain('selected');
  });

  it('右鍵清除該格時一併解除選取', () => {
    render(<QuickSlotBar />);
    fireEvent.click(slots()[0]);
    expect(slots()[0].className).toContain('selected');

    fireEvent.contextMenu(slots()[0]);
    expect(slots()[0].className).not.toContain('selected');
    expect(useGameStore.getState().quickSlots[0]).toBeNull();
  });
});

describe('裝備快捷鍵的品階著色', () => {
  /** 用 seed 造一個指定名稱的裝備實例 */
  function equipOf(name: string, id: number): EquipmentInstance {
    const tpl = EQUIPMENT_SEEDS.find(t => t.name === name);
    if (!tpl) throw new Error(`找不到裝備：${name}`);
    return { ...tpl, templateId: tpl.id!, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: false, id } as EquipmentInstance;
  }

  /** 渲染後取第 0 格傳給 GameIcon 的顏色 */
  function iconColorFor(item: EquipmentInstance): string {
    useGameStore.setState({
      quickSlots: emptyQuickSlots().map((_, i) =>
        i === 0 ? { kind: 'equipment' as const, equipmentId: item.id!, name: item.name } : null),
      inventory: [item],
      bagItems: [],
    });
    const view = render(<QuickSlotBar />);
    const icon = document.querySelectorAll('.quick-slot')[0].querySelector('[data-testid="icon"]');
    const color = icon?.getAttribute('data-color') ?? '';
    view.unmount();
    return color;
  }

  it('依裝備品階著色，而不是一律同一個顏色', () => {
    // 王者之劍＝製作頂級（紅）、新手劍＝新手裝（白）
    const topColor = iconColorFor(equipOf('王者之劍', 101));
    const lowColor = iconColorFor(equipOf('新手劍', 102));

    expect(topColor).not.toBe('');
    expect(lowColor).not.toBe('');
    expect(topColor).not.toBe(lowColor);
  });

  it('品階顏色與 equipmentTier 的定義一致', () => {
    const item = equipOf('王者之劍', 103);
    const expected = EQUIPMENT_TIER_COLORS[getEquipmentInstanceTierLevel(item, EQUIPMENT_SEEDS)];
    expect(iconColorFor(item)).toBe(expected);
  });

  /**
   * § 35.7.2：裝備中的裝備還留在背包格上，所以快捷格是**穿／脫的切換**，
   * 不像以前那樣「換上後該格自動清空」。
   */
  describe('裝備快捷格是穿脫切換（§ 35.7.2）', () => {
    const item = equipOf('新手劍', 200);

    function bindSlot0() {
      useGameStore.setState({
        quickSlots: emptyQuickSlots().map((_, i) =>
          i === 0 ? { kind: 'equipment' as const, equipmentId: item.id!, name: item.name } : null),
        bagItems: [],
      });
    }

    afterEach(() => {
      useGameStore.setState({ equippedGear: {}, inventory: [] });
    });

    it('在背包裡 → 穿上，而且該格不會被清空', () => {
      const equipItem = vi.fn();
      bindSlot0();
      useGameStore.setState({ inventory: [item], equippedGear: {}, equipItem });

      useGameStore.getState().useQuickSlot(0);

      expect(equipItem).toHaveBeenCalledTimes(1);
      expect(useGameStore.getState().quickSlots[0]).not.toBeNull();
    });

    it('穿在身上 → 卸下', () => {
      const unequipItem = vi.fn();
      bindSlot0();
      useGameStore.setState({
        inventory: [],
        equippedGear: { rightHand: { ...item, equipped: true } },
        unequipItem,
      });

      useGameStore.getState().useQuickSlot(0);

      expect(unequipItem).toHaveBeenCalledWith('rightHand');
      expect(useGameStore.getState().quickSlots[0]).not.toBeNull();
    });

    it('實例真的不見了（賣掉／丟棄）才清空該格', () => {
      bindSlot0();
      useGameStore.setState({ inventory: [], equippedGear: {} });

      useGameStore.getState().useQuickSlot(0);

      expect(useGameStore.getState().quickSlots[0]).toBeNull();
    });

    it('穿在身上時該格不會變成灰階（仍可點）', () => {
      bindSlot0();
      useGameStore.setState({
        inventory: [],
        equippedGear: { rightHand: { ...item, equipped: true } },
      });
      const view = render(<QuickSlotBar />);

      expect(slots()[0].className).not.toContain('exhausted');
      expect(slots()[0].getAttribute('aria-disabled')).toBe('false');
      view.unmount();
    });
  });
});