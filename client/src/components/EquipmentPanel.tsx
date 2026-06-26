import { useGameStore } from '../stores/gameStore';
import type { EquipSlot } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';

const SLOT_NAMES: Record<EquipSlot, string> = {
  rightHand: '右手',
  leftHand: '左手',
  helmet: '頭盔',
  chest: '胸甲',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指1',
  ring2: '戒指2',
};

const SLOT_ORDER: EquipSlot[] = ['rightHand', 'leftHand', 'helmet', 'chest', 'belt', 'gloves', 'boots', 'necklace', 'ring1', 'ring2'];

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

  return (
    <div className="equipment-panel-content">
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
                <div className="equipped-item" onClick={() => unequipItem(slot)}>
                  <EquipmentDetail item={item} compact />
                </div>
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
