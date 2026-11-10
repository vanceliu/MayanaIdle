// @vitest-environment jsdom
/**
 * 裝備 tooltip 按住 Alt 顯示數值區間（`34-ui-guidelines.md` § 34.2）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EquipmentDetail } from '../EquipmentInfo';
import { useGameStore } from '../../stores/gameStore';
import { resetAltHeld } from '../../hooks/useAltHeld';
import type { EquipmentInstance } from '../../models/equipment';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

function sword(): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 10, enhancement: 0,
    affixes: [
      { type: 'max_hp', tier: 7, value: 95 },
      { type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' },
    ],
    ownerId: 1, equipped: true,
    ability: { type: 'bonus_damage', params: { chance: 8, damage: 12 } },
  } as EquipmentInstance;
}

const ranges = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.stat-range')).map(e => e.textContent);

beforeEach(() => {
  resetAltHeld();
  useGameStore.setState({ character: null, activeEffects: [], equippedGear: {} });
});

describe('裝備 tooltip Alt 數值區間', () => {
  it('未按 Alt 不顯示區間', () => {
    const { container } = render(<EquipmentDetail item={sword()} />);
    expect(ranges(container)).toEqual([]);
    expect(screen.getByText('最大 HP +104 (T7)')).toBeTruthy();
  });

  it('按住 Alt：詞綴區間乘品質、隨機技能參數依模板；額外屬性不顯示', () => {
    const { container } = render(<EquipmentDetail item={sword()} />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(ranges(container)).toEqual(['(5 ~ 10%)', '(5 ~ 19)', '(99 ~ 110)']);
    expect(screen.getByText('力量 +1')).toBeTruthy();
  });

  it('放開 Alt 或視窗失焦即收起', () => {
    const { container } = render(<EquipmentDetail item={sword()} />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    act(() => { fireEvent.keyUp(window, { key: 'Alt' }); });
    expect(ranges(container)).toEqual([]);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    act(() => { fireEvent.blur(window); });
    expect(ranges(container)).toEqual([]);
  });

  it('擋掉 Alt 單鍵的預設行為', () => {
    render(<EquipmentDetail item={sword()} />);
    const down = new KeyboardEvent('keydown', { key: 'Alt', cancelable: true });
    act(() => { window.dispatchEvent(down); });
    expect(down.defaultPrevented).toBe(true);
  });

  it('compact 沒有詞綴與隨機技能，按 Alt 也不顯示', () => {
    const { container } = render(<EquipmentDetail item={sword()} compact />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(ranges(container)).toEqual([]);
  });
});
