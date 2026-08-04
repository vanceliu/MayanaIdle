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
    expect(emptySlots.length).toBe(10);
  });

  it('renders slot icons', () => {
    const { container } = render(<EquipmentPanel />);
    const icons = container.querySelectorAll('.slot-icon');
    expect(icons.length).toBe(10);
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
      affixes: [],
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

    it('欄位本身只顯示 compact 摘要，不含部位與職業', () => {
      const { container } = render(<EquipmentPanel />);
      expect(container.querySelector('.equipped-item')).not.toBeNull();
      // compact 模式不印可用職業；「腰帶」只會出現在欄位標籤，不是 tooltip 內容
      expect(screen.queryByText(/可用職業/)).toBeNull();
    });

    it('hover 後才出現完整內容（含負重加成與卸下提示）', () => {
      const { container } = render(<EquipmentPanel />);
      const trigger = container.querySelector('.tooltip-trigger')!;

      expect(screen.queryByText('點擊卸下')).toBeNull();

      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // compact 摘要也印同一批數值，所以斷言要限縮在 tooltip 內，避免抓到欄位本身
      const popup = document.querySelector('.tooltip-popup') as HTMLElement;
      expect(popup).not.toBeNull();
      expect(within(popup).getByText('負重+1700')).toBeDefined();
      expect(within(popup).getByText('背包格子+5')).toBeDefined();
      expect(within(popup).getByText(/可用職業/)).toBeDefined();
      expect(within(popup).getByText('腰帶')).toBeDefined();
      expect(within(popup).getByText('點擊卸下')).toBeDefined();
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
