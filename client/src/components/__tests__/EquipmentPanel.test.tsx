// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { EquipmentPanel } from '../EquipmentPanel';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name, size }: { name: string; size: number }) => (
    <span data-testid={`icon-${name}`} data-size={size}>icon</span>
  ),
}));

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

describe('EquipmentPanel', () => {
  beforeEach(() => {
    useGameStore.setState({ equippedGear: {} });
  });

  it('renders all equipment slots directly', () => {
    render(<EquipmentPanel />);
    expect(screen.getByText('右手')).toBeDefined();
    expect(screen.getByText('左手')).toBeDefined();
    expect(screen.getByText('頭盔')).toBeDefined();
    expect(screen.getByText('胸甲')).toBeDefined();
    expect(screen.getByText('腰帶')).toBeDefined();
    expect(screen.getByText('手套')).toBeDefined();
    expect(screen.getByText('鞋子')).toBeDefined();
    expect(screen.getByText('項鍊')).toBeDefined();
    expect(screen.getByText('戒指1')).toBeDefined();
    expect(screen.getByText('戒指2')).toBeDefined();
  });

  it('shows empty slot text when nothing equipped', () => {
    render(<EquipmentPanel />);
    const emptySlots = screen.getAllByText('-- 空 --');
    expect(emptySlots.length).toBe(12);
  });

  it('renders slot icons', () => {
    const { container } = render(<EquipmentPanel />);
    const icons = container.querySelectorAll('.slot-icon');
    expect(icons.length).toBe(12);
  });

  describe('hover tooltip', () => {
    const belt: EquipmentInstance = {
      id: 1,
      templateId: 593,
      name: '皮腰帶',
      type: 'armor',
      slot: 'belt',
      isTwoHanded: false,
      defense: 0,
      bonusWeight: 1700,
      bonusBagSlots: 5,
      weight: 10,
      quality: 0,
      enhancement: 0,
      stability: -1,
      affixes: [
        { type: 'max_hp', tier: 3, value: 25 },
        { type: 'defense', tier: 2, value: 4 },
      ],
      ownerId: 1,
      equipped: true,
    };

    beforeEach(() => {
      vi.useFakeTimers();
      useGameStore.setState({ equippedGear: { belt } });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** 一次完整的滑鼠點擊：按下與放開落在同一點 */
    function tap(el: Element, x = 10, y = 10) {
      fireEvent.pointerDown(el, { button: 0, clientX: x, clientY: y });
      fireEvent.pointerUp(el, { clientX: x, clientY: y });
    }

    it('格子只印部位名與裝備名，數值一律留給 tooltip', () => {
      const { container } = render(<EquipmentPanel />);
      const cell = container.querySelector('.equipped-item')!;
      expect(cell).not.toBeNull();
      expect(within(cell as HTMLElement).getByText('腰帶')).toBeDefined();
      expect(within(cell as HTMLElement).getByText('皮腰帶')).toBeDefined();
      // 十個格子各印四五行數值會把面板拉到整個畫面高，所以數值只在 hover 時出現
      expect(container.querySelector('.equip-detail-stat')).toBeNull();
      expect(screen.queryByText('負重+1700')).toBeNull();
      expect(screen.queryByText(/可用職業/)).toBeNull();
    });

    it('強化等級接在裝備名後面', () => {
      useGameStore.setState({ equippedGear: { belt: { ...belt, enhancement: 4 } } });
      const { container } = render(<EquipmentPanel />);
      expect(within(container.querySelector('.equipped-item') as HTMLElement).getByText('皮腰帶 +4')).toBeDefined();
    });

    it('沒穿的部位標成 is-empty，缺哪個部位一眼看得到', () => {
      const { container } = render(<EquipmentPanel />);
      // 十二個部位只穿了腰帶，其餘十一格都是空的
      expect(container.querySelectorAll('.equip-slot.is-empty')).toHaveLength(11);
      expect(container.querySelectorAll('.equip-slot')).toHaveLength(12);
    });

    it('裝備欄不列詞綴，避免十個欄位各印四條把面板灌爆', () => {
      const { container } = render(<EquipmentPanel />);
      expect(container.querySelector('.equip-detail-affixes')).toBeNull();
      expect(container.querySelector('.equip-detail-affix')).toBeNull();
    });

    it('hover 後才出現完整內容（含負重加成與卸下提示）', () => {
      const { container } = render(<EquipmentPanel />);
      const trigger = container.querySelector('.tooltip-trigger')!;

      expect(screen.queryByText('點擊選取')).toBeNull();

      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // 斷言限縮在 tooltip 內：部位名在格子上也有一份，不限縮會抓到欄位本身
      const popup = document.querySelector('.tooltip-popup') as HTMLElement;
      expect(popup).not.toBeNull();
      expect(within(popup).getByText('負重+1700')).toBeDefined();
      expect(within(popup).getByText('背包格子+5')).toBeDefined();
      expect(within(popup).getByText(/可用職業/)).toBeDefined();
      expect(within(popup).getByText('腰帶')).toBeDefined();
      expect(within(popup).getByText('點擊選取')).toBeDefined();
      // 詞綴只在 tooltip 裡出現
      expect(popup.querySelectorAll('.equip-detail-affix')).toHaveLength(2);
    });

    it('點一次只選取，點第二次才卸下', () => {
      const unequipItem = vi.fn();
      useGameStore.setState({ unequipItem });
      const { container } = render(<EquipmentPanel />);
      const equipped = container.querySelector('.equipped-item')!;

      tap(equipped);
      expect(unequipItem).not.toHaveBeenCalled();
      expect(container.querySelector('.equip-slot.is-selected')).not.toBeNull();

      tap(container.querySelector('.equipped-item')!);
      expect(unequipItem).toHaveBeenCalledWith('belt');
    });

    it('點空欄位或面板留白會取消選取', () => {
      const unequipItem = vi.fn();
      useGameStore.setState({ unequipItem });
      const { container } = render(<EquipmentPanel />);

      tap(container.querySelector('.equipped-item')!);
      expect(container.querySelector('.equip-slot.is-selected')).not.toBeNull();

      const empty = container.querySelector('.empty-slot')!;
      fireEvent.pointerDown(empty, { button: 0 });
      fireEvent.pointerUp(empty);
      expect(container.querySelector('.equip-slot.is-selected')).toBeNull();

      // 取消後再點只是重新選取，不會直接卸下
      tap(container.querySelector('.equipped-item')!);
      expect(unequipItem).not.toHaveBeenCalled();
    });

    it('按在裝備上、放開漂到欄位外時，選取不可被清掉', () => {
      const { container } = render(<EquipmentPanel />);
      const equipped = container.querySelector('.equipped-item')!;

      tap(equipped);
      expect(container.querySelector('.equip-slot.is-selected')).not.toBeNull();

      // click 被改派到共同祖先時不能誤判成點在空白處
      fireEvent.click(container.querySelector('.equipped-list')!);
      expect(container.querySelector('.equip-slot.is-selected')).not.toBeNull();
    });

    it('選取後 tooltip 提示改成「再點一次卸下」', () => {
      const { container } = render(<EquipmentPanel />);
      tap(container.querySelector('.equipped-item')!);

      fireEvent.mouseEnter(container.querySelector('.tooltip-trigger')!);
      act(() => {
        vi.advanceTimersByTime(300);
      });

      const popup = document.querySelector('.tooltip-popup') as HTMLElement;
      expect(within(popup).getByText('再點一次卸下')).toBeDefined();
    });

    it('移開滑鼠後 tooltip 消失', () => {
      const { container } = render(<EquipmentPanel />);
      const trigger = container.querySelector('.tooltip-trigger')!;

      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(document.querySelector('.tooltip-popup')).not.toBeNull();

      fireEvent.mouseLeave(trigger);
      expect(document.querySelector('.tooltip-popup')).toBeNull();
    });
  });
});
