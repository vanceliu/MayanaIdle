import { useState, useEffect, useMemo } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { db } from '../../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { resolveEquipment } from '../../systems/templateSync';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierLevel, getEquipmentInstanceTierColor, type EquipmentTierLevel } from '../../models/equipmentTier';
import { generateAffixes, getAffixCategoryForSlot, SHOP_MAX_AFFIX_TIER } from '../../models/affix';

type ShopTab = 'buy' | 'sell';

const WEAPON_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'sword', label: '單手劍' },
  { key: 'dagger', label: '匕首' },
  { key: 'axe', label: '單手斧' },
  { key: 'mace', label: '鈍器' },
  { key: 'staff', label: '法杖' },
  { key: 'bow', label: '弓' },
  { key: 'twoHandSword', label: '雙手劍' },
  { key: 'twoHandAxe', label: '雙手斧' },
  { key: 'twoHandStaff', label: '雙手法杖' },
  { key: 'dualBlade', label: '雙刀' },
  { key: 'claw', label: '鋼爪' },
];

export function WeaponShop() {
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
      .filter(t => t.slot === 'rightHand' && t.acquireType === 'shop')
      .sortBy('buyPrice')
      .then(setTemplates);
  }, []);

  if (!char) return null;

  async function buyWeapon(template: EquipmentTemplate) {
    if (!template.buyPrice || char!.gold < template.buyPrice) return;
    const currentInv = useGameStore.getState().inventory;
    const currentBag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(currentBag, currentInv) >= getBagMaxSlots(equippedGear)) return;

    // § 6A.6：商店裝在購買當下隨機生成 4 個詞綴，Tier 均等落在 T1~T3，
    // 並記錄 maxAffixTier 讓鐵匠鋪的詞綴強化也升不過 T3。
    const affixes = generateAffixes(
      getAffixCategoryForSlot(template.slot, template.type),
      char!.level,
      4,
      false,
      { maxTier: SHOP_MAX_AFFIX_TIER, uniformTier: true, noSpecialAffix: true },
    );
    const dbRecord = {
      templateId: template.id!,
      slot: template.slot,
      quality: 0,
      enhancement: 0,
      affixes,
      maxAffixTier: SHOP_MAX_AFFIX_TIER,
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
      affixes,
      maxAffixTier: SHOP_MAX_AFFIX_TIER,
      ownerId: char!.id!,
      equipped: false,
    });

    set({
      character: { ...char!, gold: char!.gold - template.buyPrice! },
      inventory: [...useGameStore.getState().inventory, instance],
    });
    useGameStore.getState().saveState();
  }

  function getSellPrice(item: EquipmentInstance): number {
    const template = allTemplates.find(t => t.id === item.templateId);
    // 新手裝不能賣。`isStarterGear` 是實例旗標（只有從新手指導員領取時才會標），
    // 創角直接穿上的那套沒有旗標，所以改從模板的 acquireType 判斷。
    if (template?.acquireType === 'starter') return 0;
    if (template?.buyPrice) return Math.floor(template.buyPrice * 0.5);
    if (template?.craftGold) return Math.floor(template.craftGold * 0.5);
    return 0;
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

  const weaponsInBag = inventory.filter(i => !!i.smallMonsterDamage && getSellPrice(i) > 0 && !i.isStarterGear && !equippedIds.has(i.id));

  const EQUIP_TIER_OPTIONS: { tier: EquipmentTierLevel; label: string }[] = [
    { tier: 1, label: '商店低階（白色）' },
    { tier: 2, label: '商店中階以下' },
    { tier: 3, label: '商店高階以下' },
    { tier: 4, label: '製作入門以下' },
    { tier: 5, label: '製作進階以下' },
    { tier: 6, label: '製作頂級以下' },
  ];

  const batchSellWeapons = useMemo(() => {
    if (batchTier === null) return [];
    return weaponsInBag.filter(item => {
      const tierLevel = getEquipmentInstanceTierLevel(item, allTemplates);
      const template = allTemplates.find(t => t.id === item.templateId);
      // 新手裝現在也是 Tier 1，要靠 acquireType 排除而不是靠 tier === 0
      if (template?.acquireType === 'starter') return false;
      if (template?.acquireType === 'drop_only') return false;
      return tierLevel <= batchTier;
    });
  }, [weaponsInBag, batchTier, allTemplates]);

  const batchSellTotal = useMemo(() => {
    return batchSellWeapons.reduce((sum, item) => sum + getSellPrice(item), 0);
  }, [batchSellWeapons]);

  function executeBatchSell() {
    if (!char || batchSellWeapons.length === 0) return;
    let totalGold = 0;
    const idsToSell = new Set(batchSellWeapons.map(i => i.id));

    for (const item of batchSellWeapons) {
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
      <p className="shop-greeting">「好劍配好手！來看看我的貨色。」</p>
      <div className="shop-gold">持有金幣: {char.gold.toLocaleString()}G</div>

      <div className="shop-tabs">
        <button className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>購買</button>
        <button className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>出售</button>
      </div>

      {tab === 'buy' && (
        <div className="shop-items">
          <div className="bs-craft-categories">
            {WEAPON_CATEGORIES.map(cat => {
              if (cat.key !== 'all' && !templates.some(t => t.type === cat.key)) return null;
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
            .filter(t => category === 'all' || t.type === category)
            .map(t => (
            <div key={t.name} className="shop-item">
              <div className="shop-item-info">
                <EquipmentTemplateDetail template={t} />
                <span className="shop-item-price">{t.buyPrice.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={() => buyWeapon(t)}
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
                {batchSellWeapons.length === 0 ? (
                  <p className="empty-text">沒有符合條件的武器</p>
                ) : (
                  <>
                    <div className="batch-sell-list">
                      {batchSellWeapons.map(item => {
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
                      一鍵販售 ({batchSellWeapons.length} 件) — 獲得 {batchSellTotal.toLocaleString()}G
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <hr className="batch-sell-divider" />

          {weaponsInBag.length === 0 && <p className="empty-text">沒有可出售的武器</p>}
          {weaponsInBag.map(item => {
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
