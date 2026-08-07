import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SLOT_NAMES, SLOT_ORDER, type EquipSlot } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';
import { Tooltip } from './Tooltip';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';

/** 按下到放開的位移在這個範圍內都算「點擊」（px） */
const CLICK_SLOP = 8;

const SLOT_ICON_MAP: Record<EquipSlot, string> = {
  rightHand: 'sword',
  leftHand: 'shield',
  helmet: 'helmet',
  chest: 'chest',
  belt: 'belt',
  gloves: 'gloves',
  boots: 'boots',
  necklace: 'necklace',
  ring1: 'ring',
  ring2: 'ring',
};

export function EquipmentPanel() {
  const equippedGear = useGameStore(s => s.equippedGear);
  const unequipItem = useGameStore(s => s.unequipItem);
  const templates = useEquipmentTemplates();
  // 卸下要點兩次：第一次選取、第二次才真的脫下來，避免滑一下就把裝備脫掉
  const [selectedSlot, setSelectedSlot] = useState<EquipSlot | null>(null);
  /** 這次按壓的起點：判斷放開時算不算「點擊」，以及是不是剛選起來的那一下 */
  const pressRef = useRef<{ slot: EquipSlot; x: number; y: number; justSelected: boolean } | null>(null);

  // 該欄位被別處清空（賣掉、強化失敗、換裝）時把選取狀態一起收掉
  useEffect(() => {
    if (selectedSlot && !equippedGear[selectedSlot]) {
      setSelectedSlot(null);
    }
  }, [equippedGear, selectedSlot]);

  /**
   * 點在已裝備的欄位以外（空欄位、欄位標籤、面板留白）就取消選取。
   * 綁 pointerdown 而非 click：click 會在按下／放開跨元素時改派到共同祖先，
   * 快速點擊容易誤判成「點在空白處」（同 `BagPanel`）。
   */
  function handlePanelPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (!(e.target as HTMLElement).closest?.('.equipped-item')) {
      setSelectedSlot(null);
    }
  }

  /** 按下就選取（與背包同一套語意），放開才卸下 */
  function handleSlotPointerDown(e: React.PointerEvent, slot: EquipSlot) {
    if (e.button !== 0) return;
    const justSelected = selectedSlot !== slot;
    if (justSelected) setSelectedSlot(slot);
    pressRef.current = { slot, x: e.clientX, y: e.clientY, justSelected };
  }

  /**
   * 動作綁 pointerup 不綁 click：click 會在按下／放開跨元素時改派到共同祖先，
   * 快速點擊常常整下被吃掉（與 `BagPanel` 同一個原因）。
   */
  function handleSlotPointerUp(e: React.PointerEvent, slot: EquipSlot) {
    const press = pressRef.current;
    pressRef.current = null;
    if (!press || press.slot !== slot) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > CLICK_SLOP) return;
    if (press.justSelected) return;

    // 選的是「欄位」：選起來就留著，之後每放開一次都直接卸下。
    // 卸完該欄位變空，選取狀態由上面的 effect 收掉。
    if (selectedSlot === slot) unequipItem(slot);
  }

  return (
    <div className="equipment-panel-content" onPointerDown={handlePanelPointerDown}>
      <div className="equipped-list">
        {SLOT_ORDER.map(slot => {
          const item = equippedGear[slot];
          return (
            <div key={slot} className="equip-slot">
              <span className="slot-icon">
                <GameIcon name={getEquipIcon(SLOT_ICON_MAP[slot])} size={20} />
              </span>
              <span className="slot-name">{SLOT_NAMES[slot]}</span>
              {item ? (
                // 欄位本身只放 compact 摘要（無詞綴）；hover 才出完整內容
                // （部位／Tier／材質／重量／職業／詞綴）
                <Tooltip
                  position="right"
                  content={(
                    <EquipmentDetail
                      item={item}
                      hint={selectedSlot === slot ? '再點一次卸下' : '點擊選取'}
                      templates={templates}
                    />
                  )}
                >
                  <div
                    className={`equipped-item${selectedSlot === slot ? ' is-selected' : ''}`}
                    onPointerDown={(e) => handleSlotPointerDown(e, slot)}
                    onPointerUp={(e) => handleSlotPointerUp(e, slot)}
                  >
                    <EquipmentDetail item={item} compact templates={templates} />
                  </div>
                </Tooltip>
              ) : (
                <span className="empty-slot">-- 空 --</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
