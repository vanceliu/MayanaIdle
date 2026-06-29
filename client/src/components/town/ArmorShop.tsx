import { useState, useEffect } from 'react';
import { useGameStore, getBagUsedSlots, BAG_MAX_SLOTS } from '../../stores/gameStore';
import { db } from '../../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { resolveEquipment } from '../../systems/templateSync';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';

type ShopTab = 'buy' | 'sell';

const ARMOR_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'helmet', label: '頭盔' },
  { key: 'chest', label: '胸甲' },
  { key: 'gloves', label: '手套' },
  { key: 'boots', label: '鞋子' },
  { key: 'belt', label: '腰帶' },
  { key: 'necklace', label: '項鍊' },
  { key: 'ring1', label: '戒指' },
  { key: 'shield', label: '盾牌' },
  { key: 'magicBook', label: '魔導書' },
];

export function ArmorShop() {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    db.equipmentTemplates
      .filter(t => t.slot !== 'rightHand' && t.acquireType === 'shop')
      .sortBy('buyPrice')
      .then(setTemplates);
  }, []);

  if (!char) return null;

  async function buyArmor(template: EquipmentTemplate) {
    if (!template.buyPrice || char!.gold < template.buyPrice) return;
    const currentInv = useGameStore.getState().inventory;
    const currentBag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(currentBag, currentInv) >= BAG_MAX_SLOTS) return;

    const dbRecord = {
      templateId: template.id!,
      slot: template.slot,
      quality: 0,
      enhancement: 0,
      affixes: [] as any[],
      ownerId: char!.id!,
      equipped: false,
    };
    const id = await db.equipmentInstances.add(dbRecord as any);
    const instance: EquipmentInstance = resolveEquipment({
      id: id as number,
      templateId: template.id!,
      name: template.name,
      type: template.type,
      slot: template.slot,
      isTwoHanded: template.isTwoHanded,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: char!.id!,
      equipped: false,
    });

    set({
      character: { ...char!, gold: char!.gold - template.buyPrice! },
      inventory: [...useGameStore.getState().inventory, instance],
    });
  }

  function getSellPrice(item: EquipmentInstance): number {
    const template = templates.find(t => t.id === item.templateId);
    if (template?.buyPrice) return Math.floor(template.buyPrice * 0.5);
    return Math.floor((item.defense ?? 0) * 500 * 0.5);
  }

  function sellEquipment(item: EquipmentInstance) {
    const sellPrice = getSellPrice(item);
    if (sellPrice <= 0) return;
    const inv = useGameStore.getState().inventory;
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: useGameStore.getState().character!.gold + sellPrice },
      inventory: inv.filter(i => i.id !== item.id),
    });
    db.equipmentInstances.delete(item.id!);
  }

  const armorsInBag = inventory.filter(i => !i.smallMonsterDamage && getSellPrice(i) > 0);

  return (
    <div className="shop-panel">
      <p className="shop-greeting">「需要防具嗎？這裡有最好的裝甲。」</p>
      <div className="shop-gold">持有金幣: {char.gold.toLocaleString()}G</div>

      <div className="shop-tabs">
        <button className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>購買</button>
        <button className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>出售</button>
      </div>

      {tab === 'buy' && (
        <div className="shop-items">
          <div className="bs-craft-categories">
            {ARMOR_CATEGORIES.map(cat => {
              if (cat.key !== 'all' && !templates.some(t => {
                if (cat.key === 'shield') return t.type === 'shield';
                if (cat.key === 'magicBook') return t.type === 'magicBook';
                return t.slot === cat.key;
              })) return null;
              return (
                <button
                  key={cat.key}
                  className={category === cat.key ? 'active' : ''}
                  onClick={() => setCategory(cat.key)}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          {templates
            .filter(t => {
              if (category === 'all') return true;
              if (category === 'shield') return t.type === 'shield';
              if (category === 'magicBook') return t.type === 'magicBook';
              return t.slot === category;
            })
            .map(t => (
            <div key={t.name} className="shop-item">
              <div className="shop-item-info">
                <EquipmentTemplateDetail template={t} />
                <span className="shop-item-price">{t.buyPrice.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={() => buyArmor(t)}
                  disabled={char.gold < t.buyPrice}
                >
                  購買
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'sell' && (
        <div className="shop-items">
          {armorsInBag.length === 0 && <p className="empty-text">沒有可出售的防具</p>}
          {armorsInBag.map(item => {
            const sellPrice = getSellPrice(item);
            return (
              <div key={item.id} className="shop-item">
                <div className="shop-item-info">
                  <EquipmentDetail item={item} />
                  <span className="shop-item-price sell-price">+{sellPrice.toLocaleString()}G</span>
                </div>
                <div className="shop-item-actions">
                  <button onClick={() => sellEquipment(item)}>出售</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
