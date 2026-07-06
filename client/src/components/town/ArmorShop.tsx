import { useState, useEffect, useMemo } from 'react';
import { useGameStore, getBagUsedSlots, BAG_MAX_SLOTS } from '../../stores/gameStore';
import { db } from '../../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { resolveEquipment } from '../../systems/templateSync';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierLevel, getEquipmentInstanceTierColor, type EquipmentTierLevel } from '../../models/equipmentTier';

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
  const equippedGear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [category, setCategory] = useState('all');
  const [batchTier, setBatchTier] = useState<EquipmentTierLevel | null>(null);
  const allTemplates = useEquipmentTemplates();

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
    const template = allTemplates.find(t => t.id === item.templateId);
    if (template?.buyPrice) return Math.floor(template.buyPrice * 0.5);
    return Math.floor((item.defense ?? 0) * 500 * 0.5);
  }

  function sellEquipment(item: EquipmentInstance) {
    if (item.isStarterGear) return;
    const sellPrice = getSellPrice(item);
    if (sellPrice <= 0) return;
    const inv = useGameStore.getState().inventory;
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: useGameStore.getState().character!.gold + sellPrice },
      inventory: inv.filter(i => i.id !== item.id),
    });
    db.equipmentInstances.delete(item.id!);
    useGameStore.getState().saveState();
  }

  const equippedIds = new Set(
    Object.values(equippedGear).filter(Boolean).map(e => e!.id)
  );

  const armorsInBag = inventory.filter(i => !i.smallMonsterDamage && getSellPrice(i) > 0 && !i.isStarterGear && !equippedIds.has(i.id));

  const EQUIP_TIER_OPTIONS: { tier: EquipmentTierLevel; label: string }[] = [
    { tier: 1, label: '商店低階（白色）' },
    { tier: 2, label: '商店中階以下' },
    { tier: 3, label: '商店高階以下' },
    { tier: 4, label: '製作入門以下' },
    { tier: 5, label: '製作進階以下' },
    { tier: 6, label: '製作頂級以下' },
  ];

  const batchSellArmors = useMemo(() => {
    if (batchTier === null) return [];
    return armorsInBag.filter(item => {
      const tierLevel = getEquipmentInstanceTierLevel(item, allTemplates);
      if (tierLevel === 0) return false;
      const template = allTemplates.find(t => t.id === item.templateId);
      if (template?.acquireType === 'drop_only') return false;
      return tierLevel <= batchTier;
    });
  }, [armorsInBag, batchTier, allTemplates]);

  const batchSellTotal = useMemo(() => {
    return batchSellArmors.reduce((sum, item) => sum + getSellPrice(item), 0);
  }, [batchSellArmors]);

  function executeBatchSell() {
    if (!char || batchSellArmors.length === 0) return;
    let totalGold = 0;
    const idsToSell = new Set(batchSellArmors.map(i => i.id));

    for (const item of batchSellArmors) {
      totalGold += getSellPrice(item);
    }

    const currentInv = useGameStore.getState().inventory;
    const newInv = currentInv.filter(i => !idsToSell.has(i.id));
    useGameStore.setState({
      character: { ...useGameStore.getState().character!, gold: useGameStore.getState().character!.gold + totalGold },
      inventory: newInv,
    });
    for (const id of idsToSell) {
      db.equipmentInstances.delete(id!);
    }
    useGameStore.getState().saveState();
    setBatchTier(null);
  }

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
          <div className="batch-sell-controls">
            <div className="batch-sell-selector">
              <span className="batch-sell-label">批量販售等級：</span>
              <select
                value={batchTier ?? ''}
                onChange={e => setBatchTier(e.target.value ? Number(e.target.value) as EquipmentTierLevel : null)}
              >
                <option value="">-- 選擇等級 --</option>
                {EQUIP_TIER_OPTIONS.map(opt => (
                  <option key={opt.tier} value={opt.tier}>{opt.label}</option>
                ))}
              </select>
            </div>
            {batchTier !== null && (
              <div className="batch-sell-preview">
                {batchSellArmors.length === 0 ? (
                  <p className="empty-text">沒有符合條件的防具</p>
                ) : (
                  <>
                    <div className="batch-sell-list">
                      {batchSellArmors.map(item => {
                        const color = getEquipmentInstanceTierColor(item, allTemplates);
                        const sellPrice = getSellPrice(item);
                        return (
                          <div key={item.id} className="batch-sell-item">
                            <span style={{ color }}>{item.name}{item.enhancement > 0 ? ` +${item.enhancement}` : ''}</span>
                            <span className="shop-item-price sell-price">+{sellPrice.toLocaleString()}G</span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="batch-sell-btn"
                      onClick={executeBatchSell}
                    >
                      一鍵販售 ({batchSellArmors.length} 件) — 獲得 {batchSellTotal.toLocaleString()}G
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <hr className="batch-sell-divider" />

          {armorsInBag.length === 0 && <p className="empty-text">沒有可出售的防具</p>}
          {armorsInBag.map(item => {
            const sellPrice = getSellPrice(item);
            return (
              <div key={item.id} className="shop-item">
                <div className="shop-item-info">
                  <EquipmentDetail item={item} templates={allTemplates} />
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
