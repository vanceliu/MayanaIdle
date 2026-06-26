import { useGameStore } from '../stores/gameStore';
import type { EquipSlot } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';

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

export function Inventory() {
  const character = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equipItem = useGameStore(s => s.equipItem);
  const unequipItem = useGameStore(s => s.unequipItem);

  return (
    <div className="inventory-panel">
      <h3>裝備欄</h3>
      <div className="equipped-list">
        {SLOT_ORDER.map(slot => {
          const item = equippedGear[slot];
          return (
            <div key={slot} className="equip-slot">
              <span className="slot-name">{SLOT_NAMES[slot]}</span>
              {item ? (
                <div className="equipped-item" onClick={() => unequipItem(slot)}>
                  <EquipmentDetail item={item} />
                </div>
              ) : (
                <span className="empty-slot">-- 空 --</span>
              )}
            </div>
          );
        })}
      </div>

      <h3>背包</h3>
      <div className="inventory-items">
        <div className="bag-row">
          <span className="bag-label">金幣</span>
          <span className="bag-value">{character?.gold ?? 0}</span>
        </div>
        {bagItems.map(item => (
          <div key={item.name} className="bag-row">
            <span className="bag-label">{item.name}</span>
            <span className="bag-value">×{item.amount}</span>
          </div>
        ))}
        {inventory.length === 0 && bagItems.length === 0 && (
          <p className="empty-text">無其他物品</p>
        )}
        {inventory.map(item => (
          <div key={item.id} className="inventory-item" onClick={() => equipItem(item)}>
            <EquipmentDetail item={item} />
            <button className="btn-equip">裝備</button>
          </div>
        ))}
      </div>
    </div>
  );
}
