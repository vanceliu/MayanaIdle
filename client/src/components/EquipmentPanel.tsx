import { useGameStore } from '../stores/gameStore';
import type { EquipSlot } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';
import { Tooltip } from './Tooltip';
import { GameIcon } from './GameIcon';
import { getEquipIcon } from '../models/iconMap';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';

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
  const templates = useEquipmentTemplates();

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
                // 欄位本身只放 compact 摘要；hover 才出完整內容（部位／Tier／材質／重量／職業／詞綴）
                <Tooltip
                  position="right"
                  content={<EquipmentDetail item={item} hint="點擊卸下" templates={templates} />}
                >
                  <div className="equipped-item" onClick={() => unequipItem(slot)}>
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
