import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SLOT_NAMES, SLOT_ORDER, type EquipSlot } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';
import { Tooltip } from './Tooltip';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';
import { getEquipmentInstanceTierColor } from '../models/equipmentTier';
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
          const enhancement = item?.enhancement ?? 0;
          return (
            // 選取狀態掛在整個格子上（金色外框），與背包格的 `.bag-cell.is-selected` 同一套語言
            <div
              key={slot}
              className={`equip-slot${item ? '' : ' is-empty'}${selectedSlot === slot ? ' is-selected' : ''}`}
            >
              <span className="slot-icon">
                <GameIcon name={getEquipIcon(SLOT_ICON_MAP[slot])} size={20} />
              </span>
              {item ? (
                // 格子只印部位名 + 裝備名；數值、詞綴、Tier、材質、職業一律 hover 才出。
                // 十個欄位各印四五行數值會把面板拉到整個畫面高（見 `16-tech-frontend-architecture.md` § 32.15）
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
                    className="equipped-item"
                    onPointerDown={(e) => handleSlotPointerDown(e, slot)}
                    onPointerUp={(e) => handleSlotPointerUp(e, slot)}
                  >
                    <span className="slot-name">{SLOT_NAMES[slot]}</span>
                    {/* Tier 色與背包格同一個來源，同一件裝備在兩邊不會是兩個顏色 */}
                    <span
                      className="equip-slot-item-name"
                      style={{ color: getEquipmentInstanceTierColor(item, templates) }}
                    >
                      {item.name}{enhancement > 0 ? ` +${enhancement}` : ''}
                    </span>
                  </div>
                </Tooltip>
              ) : (
                <div className="equip-slot-label">
                  <span className="slot-name">{SLOT_NAMES[slot]}</span>
                  <span className="empty-slot">-- 空 --</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
