import { useGameStore } from '../stores/gameStore';
import { SLOT_NAMES, SLOT_ORDER } from '../models/equipment';
import { EquipmentDetail } from './EquipmentInfo';
import { useEquipmentTemplates } from '../hooks/useEquipmentTemplates';

export function Inventory() {
  const character = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equipItem = useGameStore(s => s.equipItem);
  const unequipItem = useGameStore(s => s.unequipItem);
  const templates = useEquipmentTemplates();

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
                  <EquipmentDetail item={item} templates={templates} />
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
            <EquipmentDetail item={item} templates={templates} />
            <button className="btn-equip">裝備</button>
          </div>
        ))}
      </div>
    </div>
  );
}
