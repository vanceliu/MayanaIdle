import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import { talentBagOrderStorageKey } from '../../models/talentBag';
import { rowsForSlots } from '../BagGrid';
import { emptyConditions, type TalentSlot, type TalentSlotTier } from '../../models/talent';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

const CHAR = 1;

function slot(id: number, tier: TalentSlotTier): TalentSlot {
  return {
    id,
    characterId: CHAR,
    tier,
    assignedType: null,
    templateId: null,
    order: null,
    enabled: true,
    conditions: emptyConditions(tier),
    action: null,
  };
}

/** 重開面板：位置是否持久化，只有關掉再開才驗得出來 */
function openTalentTab() {
  cleanup();
  render(<BagPanel />);
  fireEvent.click(screen.getByRole('tab', { name: '天賦' }));
}

function cells() {
  return [...document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell-tier')]
    .map(el => el.textContent ?? '');
}

describe('背包「天賦」分頁（§ 35.21）', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ character: { id: CHAR } as never, bagItems: [], inventory: [] });
    // 取得順序刻意亂序：低階在高階之前
    useTalentStore.setState({
      characterId: CHAR,
      slots: [slot(1, 1), slot(2, 1), slot(3, 3), slot(4, 2)],
    });
  });

  it('列數對齊一般分頁，兩邊切換時面板不會忽高忽低', () => {
    openTalentTab();
    const all = document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell');
    // 無腰帶時基礎 60 格
    expect(all.length).toBe(rowsForSlots(60) * 5);
  });

  /* 條件與動作不是物品，不進背包（§ 51.5）—— 這裡只該看到天賦格 */
  it('只列天賦格，同階堆成一格帶數量', () => {
    openTalentTab();
    expect(cells()).toEqual(['T1', 'T2', 'T3']);
    const counts = [...document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell-count')]
      .map(el => el.textContent);
    expect(counts[0]).toBe('×2');
  });

  it('整理後高階在前', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    expect(cells()).toEqual(['T3', 'T2', 'T1']);
  });

  /* 與一般分頁同一套（§ 35.8）：整理是一次性落位，位置持久化 */
  it('整理是一次性落位，位置會持久化', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    const saved = JSON.parse(localStorage.getItem(talentBagOrderStorageKey(CHAR))!);
    expect(saved['slot-3']).toBe(0);
    expect(Object.keys(saved)).toHaveLength(3);

    const before = cells();
    openTalentTab();
    expect(cells()).toEqual(before);
  });

  it('整理過後新拿到的天賦格排在後面，不插進已排好的順序中間', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    useTalentStore.setState({
      slots: [slot(1, 1), slot(2, 1), slot(3, 3), slot(4, 2), slot(5, 4)],
    });
    openTalentTab();
    expect(cells()).toEqual(['T3', 'T2', 'T1', 'T4']);
  });

  it('可依階級篩選（§ 35.21.1）', () => {
    openTalentTab();
    fireEvent.change(screen.getByLabelText('階級'), { target: { value: '1' } });
    expect(cells()).toEqual(['T1']);
  });
});
