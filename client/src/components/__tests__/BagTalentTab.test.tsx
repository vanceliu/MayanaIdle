import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import { talentBagOrderStorageKey } from '../../models/talentBag';
import { rowsForSlots } from '../BagGrid';
import type { TalentAffixInstance, TalentSlot } from '../../models/talent';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

const CHAR = 1;

function slot(id: number, tier: 1 | 2 | 3 | 4): TalentSlot {
  return { id, characterId: CHAR, tier, assignedType: null, templateId: null, order: null, enabled: true };
}

function affix(id: number, definitionId: number): TalentAffixInstance {
  return { id, characterId: CHAR, definitionId, boundParam: null, params: null, slotId: null, slotIndex: null };
}

/** 重開面板：位置是否持久化，只有關掉再開才驗得出來 */
function openTalentTab() {
  cleanup();
  render(<BagPanel />);
  fireEvent.click(screen.getByRole('tab', { name: '天賦' }));
}

/** 顯示順序＝格子上的名稱，空格不算 */
function cellNames(): string[] {
  return [...document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell-name')]
    .map(el => el.textContent ?? '');
}

describe('背包「天賦」分頁（§ 35.21）', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({ character: { id: CHAR } as never, bagItems: [], inventory: [] });
    useTalentStore.setState({
      characterId: CHAR,
      slots: [slot(1, 1)],
      // 取得順序刻意亂序：實作(2001) 在條件(1001) 之前、低階在高階之前
      affixes: [affix(10, 2001), affix(11, 1006), affix(12, 1001)],
    });
  });

  it('列數對齊一般分頁，兩邊切換時面板不會忽高忽低', () => {
    openTalentTab();
    const cells = document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell');
    // 無腰帶時基礎 60 格
    expect(cells.length).toBe(rowsForSlots(60) * 5);
  });

  it('預設維持取得順序，天賦格在最前面', () => {
    openTalentTab();
    expect(cellNames()[0]).toBe('天賦格');
  });

  it('整理後依「天賦格 → 條件 → 實作」分組，同組高階在前', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    const names = cellNames().slice(0, 2);
    expect(names[0]).toBe('天賦格');
    // 條件先於實作；條件內 T2(1006) 先於 T1(1001)
    expect(names[1]).not.toBe('普通攻擊'.slice(0, 4));
  });

  /* 與一般分頁同一套（§ 35.8）：整理是一次性落位，位置持久化 */
  it('整理是一次性落位，位置會持久化', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    const saved = JSON.parse(localStorage.getItem(talentBagOrderStorageKey(CHAR))!);
    expect(saved['slot-1']).toBe(0);
    expect(Object.keys(saved)).toHaveLength(4);

    const before = cellNames().slice(0, 4);
    openTalentTab();
    expect(cellNames().slice(0, 4)).toEqual(before);
  });

  it('整理過後新拿到的鑲材排在後面，不插進已排好的分類中間', () => {
    openTalentTab();
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    useTalentStore.setState({
      affixes: [affix(10, 2001), affix(11, 1006), affix(12, 1001), affix(13, 1002)],
    });
    openTalentTab();
    expect(cellNames()).toHaveLength(5);
    expect(cellNames()[4]).toBe('HP 高於'.slice(0, 4));
  });
});
