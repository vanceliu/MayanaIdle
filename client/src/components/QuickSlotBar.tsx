import { useEffect } from 'react';
import { useGameStore } from '../stores/gameStore';
import { POTION_CONFIG, type PotionType, getPotionCount } from '../stores/gameStore';
import { GameIcon } from './GameIcon';
import { getItemIcon } from '../models/iconMap';

const SLOT_COUNT = 5;

const POTION_COLORS: Record<PotionType, string> = {
  red: '#DC2626',
  orange: '#F59E0B',
  white: '#E2E8F0',
};

export function QuickSlotBar() {
  const quickSlots = useGameStore(s => s.quickSlots);
  const bagItems = useGameStore(s => s.bagItems);
  const useQuickSlot = useGameStore(s => s.useQuickSlot);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = parseInt(e.key);
      if (key >= 1 && key <= SLOT_COUNT) {
        e.preventDefault();
        useQuickSlot(key - 1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [useQuickSlot]);

  return (
    <div className="quick-slot-bar">
      {quickSlots.map((slot, idx) => {
        const count = slot ? getPotionCount(bagItems, slot) : 0;
        const isEmpty = !slot;
        const isExhausted = slot && count <= 0;
        const canUse = !!slot && count > 0;

        return (
          <button
            key={idx}
            className={`quick-slot ${isEmpty ? 'empty' : ''} ${isExhausted ? 'exhausted' : ''}`}
            onClick={() => canUse && useQuickSlot(idx)}
            onContextMenu={(e) => {
              e.preventDefault();
              assignQuickSlot(idx, null);
            }}
            disabled={!canUse}
            title={slot ? `${POTION_CONFIG[slot].name} (右鍵清除)` : '空 (從背包指定藥水)'}
          >
            <span className="quick-slot-key">{idx + 1}</span>
            {slot && (
              <>
                <GameIcon name={getItemIcon(`${slot}-potion`)} size={24} color={POTION_COLORS[slot]} />
                <span className="quick-slot-count">{count}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
