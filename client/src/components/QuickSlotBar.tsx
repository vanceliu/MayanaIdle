import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { getPotionCount } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { getEquipIcon, getItemIcon, resolveItemIcon } from '../models/iconMap';
import { getItemById } from '../models/items';
import { getBagItemAmount } from '../models/bagItem';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
import { BAG_DRAG_MIME, decodeBagDrag } from '../models/bagLayout';
import {
  QUICK_SLOT_COUNT,
  keyToQuickSlotIndex,
  quickSlotLabel,
  getQuickSlotItemName,
  resolveQuickSlotAction,
  toQuickSlotEntry,
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
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
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

  function handleDrop(idx: number, e: React.DragEvent) {
    const payload = decodeBagDrag(e.dataTransfer.getData(BAG_DRAG_MIME));
    setDragOverIndex(null);
    if (!payload) return;
    e.preventDefault();
    const entry = toQuickSlotEntry(payload.kind, payload.itemId ?? -1, payload.equipmentId, payload.name);
    if (!entry) return;
    setSelectedIndex(null);
    assignQuickSlot(idx, entry);
  }

  /** § 35.7.5：第一次點擊選取，再點同一格才執行 */
  function handleClick(idx: number, canUse: boolean) {
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
              + (selectedIndex === idx ? ' selected' : '')}
            onClick={() => handleClick(idx, canUse)}
            onContextMenu={(e) => {
              e.preventDefault();
              setSelectedIndex(prev => (prev === idx ? null : prev));
              assignQuickSlot(idx, null);
            }}
            onDragOver={(e) => {
              if (!Array.from(e.dataTransfer.types).includes(BAG_DRAG_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setDragOverIndex(idx);
            }}
            onDragLeave={() => setDragOverIndex(prev => (prev === idx ? null : prev))}
            onDrop={(e) => handleDrop(idx, e)}
            /* 不能用 disabled：被 disable 的按鈕收不到 drag 事件，空格就永遠放不進去 */
            aria-disabled={!canUse}
            title={entry
              ? `${getQuickSlotItemName(entry)}（${selectedIndex === idx ? '再點一次使用' : '點一次選取'}，右鍵清除）`
              : '空（從背包拖曳物品放入）'}
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
