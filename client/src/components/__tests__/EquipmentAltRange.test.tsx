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
      { type: 'max_hp', tier: 7, value: 190 },
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
    expect(screen.getByText('最大 HP +209 (T7)')).toBeTruthy();
  });

  it('按住 Alt：詞綴區間乘品質、隨機技能參數依模板；額外屬性不顯示', () => {
    const { container } = render(<EquipmentDetail item={sword()} />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(ranges(container)).toEqual(['(5 ~ 15%)', '(5 ~ 29)', '(198 ~ 220)']);
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

  it('受擊回血：回復%也顯示區間', () => {
    const armor = {
      id: 2, templateId: 90, name: '測試胸甲', type: 'armor', slot: 'chest', isTwoHanded: false,
      defense: 20, quality: 0, enhancement: 0, ownerId: 1, equipped: true,
      affixes: [{ type: 'on_hit_hp', tier: 3, value: 3 }],
    } as EquipmentInstance;
    const { container } = render(<EquipmentDetail item={armor} />);
    expect(screen.getByText('受擊 3.0% 觸發回血 2.7% (T3)')).toBeTruthy();
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(ranges(container)).toEqual(['(2.4 ~ 3.5%)', '(2.5 ~ 2.8%)']);
  });

  it('compact 沒有詞綴與隨機技能，按 Alt 也不顯示', () => {
    const { container } = render(<EquipmentDetail item={sword()} compact />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    expect(ranges(container)).toEqual([]);
  });
});
