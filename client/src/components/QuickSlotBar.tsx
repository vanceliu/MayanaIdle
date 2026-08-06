import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getPotionCount } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { getEquipIcon, getItemIcon, resolveItemIcon } from '../models/iconMap';
import { getItemById } from '../models/items';
import { getBagItemAmount } from '../models/bagItem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
import { useDragStore } from '../stores/dragStore';
import { useLongPress } from '../hooks/useLongPress';
import {
  QUICK_SLOT_COUNT,
  keyToQuickSlotIndex,
  quickSlotLabel,
  getQuickSlotItemName,
  resolveQuickSlotAction,
  type BasicPotionType,
  type QuickSlotEntry,
} from '../models/quickSlot';

const POTION_COLORS: Record<BasicPotionType, string> = {
  red: '#DC2626',
  orange: '#F59E0B',
  white: '#E2E8F0',
};

export function QuickSlotBar() {
  const quickSlots = useGameStore(s => s.quickSlots);
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const useQuickSlot = useGameStore(s => s.useQuickSlot);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);
  const templates = useEquipmentTemplates();
  /*
   * 快捷格只是**放置目標**：它以 `data-drop-*` 宣告自己，實際的綁定由拖曳來源
   * （背包）在放開時執行（§ 34.8）。這裡只讀 hover 狀態畫外框。
   */
  const dragOver = useDragStore(s => s.over);
  const isDragging = useDragStore(s => s.item != null);
  const dragOverIndex = dragOver?.kind === 'quick-slot' ? dragOver.index : null;
  /**
   * § 35.7.5：滑鼠操作採兩段確認 —— 第一次點擊只選取（顯示外框），再點同一格才執行。
   * 鍵盤快捷鍵**不受此限**，按下即執行。
   */
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') {
        setSelectedIndex(null);
        return;
      }
      const idx = keyToQuickSlotIndex(e.key);
      if (idx == null) return;
      e.preventDefault();
      // 鍵盤一按即發，並清掉滑鼠的選取狀態
      setSelectedIndex(null);
      useQuickSlot(idx);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [useQuickSlot]);

  /** 這格還剩幾個可用；裝備回 1（存在）或 0（已不在背包） */
  function slotCount(entry: QuickSlotEntry): number {
    if (entry.kind === 'potion') return getPotionCount(bagItems, entry.potionType);
    if (entry.kind === 'equipment') {
      return inventory.some(i => i.id === entry.equipmentId) ? 1 : 0;
    }
    return getBagItemAmount(bagItems, entry.itemId);
  }

  function renderIcon(entry: QuickSlotEntry) {
    if (entry.kind === 'potion') {
      return <GameIcon name={getItemIcon(`${entry.potionType}-potion`)} size={24} color={POTION_COLORS[entry.potionType]} />;
    }
    if (entry.kind === 'equipment') {
      const item = inventory.find(i => i.id === entry.equipmentId);
      const iconKey = item
        ? getEquipIcon(item.type === 'armor' ? (item.slot || 'chest') : item.type)
        : getEquipIcon('sword');
      // 與背包一致，依裝備品階著色（`equipmentTier.ts`）
      return (
        <GameIcon
          name={iconKey}
          size={24}
          color={item ? getEquipmentInstanceTierColor(item, templates) : undefined}
        />
      );
    }
    const { icon, color } = resolveItemIcon(getItemById(entry.itemId), 'scroll');
    return <GameIcon name={icon} size={24} color={color} />;
  }

  /**
   * 清除這一格。右鍵與長按共用（§ 34.8）——
   * hook 只能在頂層呼叫，所以「按住的是第幾格」從 ref 讀，格子的 pointerdown 一定先跑。
   */
  const pressedIndexRef = useRef<number | null>(null);
  const longPress = useLongPress(() => {
    const idx = pressedIndexRef.current;
    if (idx == null) return;
    setSelectedIndex(prev => (prev === idx ? null : prev));
    assignQuickSlot(idx, null);
  });

  /** § 35.7.5：第一次點擊選取，再點同一格才執行 */
  function handleClick(idx: number, canUse: boolean) {
    // 長按剛清完這一格，放開時不能再算一次點擊
    if (longPress.didFire()) return;
    if (!canUse) {
      setSelectedIndex(null);
      return;
    }
    if (selectedIndex === idx) {
      setSelectedIndex(null);
      useQuickSlot(idx);
      return;
    }
    setSelectedIndex(idx);
  }

  return (
    <div className="quick-slot-bar">
      {Array.from({ length: QUICK_SLOT_COUNT }).map((_, idx) => {
        const entry = quickSlots[idx] ?? null;
        const count = entry ? slotCount(entry) : 0;
        const isEmpty = !entry;
        const isExhausted = !!entry && count <= 0;
        const canUse = !!entry && count > 0 && resolveQuickSlotAction(entry) != null;

        return (
          <button
            key={idx}
            className={`quick-slot ${isEmpty ? 'empty' : ''} ${isExhausted ? 'exhausted' : ''}`
              + (dragOverIndex === idx ? ' drag-over' : '')
              + (isDragging ? ' droppable' : '')
              + (selectedIndex === idx ? ' selected' : '')}
            /* 落點由 `elementFromPoint` 命中這兩個屬性（§ 34.8）；
               拖曳期間指標被來源格 capture，這裡收不到任何 pointer 事件 */
            data-drop-kind="quick-slot"
            data-drop-index={idx}
            onClick={() => handleClick(idx, canUse)}
            /* 右鍵不一定先經過 pointerdown（測試會直接派 contextmenu，
               部分環境的右鍵也是），索引要在這裡再設一次 */
            onContextMenu={(e) => { pressedIndexRef.current = idx; longPress.onContextMenu(e); }}
            onPointerDown={(e) => { pressedIndexRef.current = idx; longPress.onPointerDown(e); }}
            onPointerMove={longPress.onPointerMove}
            onPointerUp={longPress.onPointerUp}
            onPointerCancel={longPress.onPointerCancel}
            /* 不能用 disabled：被 disable 的按鈕收不到指標事件，空格就永遠放不進去 */
            aria-disabled={!canUse}
            title={entry
              ? `${getQuickSlotItemName(entry)}（${selectedIndex === idx ? '再點一次使用' : '點一次選取'}，右鍵或長按清除）`
              : '空（從背包拖曳或用背包選單指定）'}
          >
            <span className="quick-slot-key">{quickSlotLabel(idx)}</span>
            {entry && (
              <>
                {renderIcon(entry)}
                {entry.kind !== 'equipment' && <span className="quick-slot-count">{count}</span>}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
