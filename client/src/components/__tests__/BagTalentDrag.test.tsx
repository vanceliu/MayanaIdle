import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BagPanel } from '../BagPanel';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import { useDragStore } from '../../stores/dragStore';
import { pointAt, restoreElementFromPoint } from '../../testing/pointerDrag';
import { emptyConditions, type TalentSlot } from '../../models/talent';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 *
 * 天賦分頁的拖曳手感必須與一般分頁一致（`35-inventory-constraints.md` § 35.1.4）：
 * 按下先記著、超過容忍距離才轉拖曳、觸控不拖。
 */

const CHAR = 1;

function slot(id: number): TalentSlot {
  return {
    id,
    characterId: CHAR,
    tier: 1,
    assignedType: null,
    templateId: null,
    order: null,
    enabled: true,
    conditions: emptyConditions(1),
    action: null,
  };
}

function openTalentTab() {
  render(<BagPanel />);
  fireEvent.click(screen.getByRole('tab', { name: '天賦' }));
}

const cell = () => document.querySelector('[data-testid="bag-talent-tab"] .bag-cell:not(.empty)')!;

describe('天賦分頁的拖曳', () => {
  beforeEach(() => {
    useDragStore.getState().cancel();
    useGameStore.setState({ character: { id: CHAR } as never, bagItems: [], inventory: [] });
    useTalentStore.setState({ characterId: CHAR, slots: [slot(10)] });
  });

  it('只是點一下不會開始拖曳', () => {
    openTalentTab();
    fireEvent.pointerDown(cell(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell(), { clientX: 12, clientY: 13 });
    expect(useDragStore.getState().item).toBeNull();
  });

  it('移動超過容忍距離才轉成拖曳', () => {
    openTalentTab();
    fireEvent.pointerDown(cell(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell(), { clientX: 40, clientY: 40 });
    expect(useDragStore.getState().item?.payload.kind).toBe('talent-slot-item');
  });

  // 長按已被次要選單佔走，按住滑動要留給捲動（`47-mobile.md`）
  it('觸控不拖曳', () => {
    openTalentTab();
    fireEvent.pointerDown(cell(), { button: 0, pointerType: 'touch', clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell(), { pointerType: 'touch', clientX: 40, clientY: 40 });
    expect(useDragStore.getState().item).toBeNull();
  });

  it('拖曳中來源格顯示為拖曳中', () => {
    openTalentTab();
    fireEvent.pointerDown(cell(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(cell(), { clientX: 40, clientY: 40 });
    expect(cell().className).toContain('dragging');
  });

  /* 分頁內自由擺放（§ 35.21.1）：與一般分頁同一套 */
  describe('格子內自由擺放', () => {
    const cells = () => document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell');

    it('每一格都是落點', () => {
      openTalentTab();
      for (const el of cells()) {
        expect(el.getAttribute('data-drop-kind')).toBe('talent-cell');
      }
    });

    it('拖到空格會換位置', () => {
      openTalentTab();
      const source = cells()[0];
      const targetIdx = 3;
      pointAt(cells()[targetIdx] as HTMLElement);

      fireEvent.pointerDown(source, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(source, { clientX: 60, clientY: 60 });
      fireEvent.pointerUp(source, { clientX: 60, clientY: 60 });
      restoreElementFromPoint();

      const moved = document.querySelectorAll('[data-testid="bag-talent-tab"] .bag-cell')[targetIdx];
      expect(moved.className).not.toContain('empty');
    });
  });
});