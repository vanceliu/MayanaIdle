import { useState, useEffect, useMemo } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { db } from '../../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierLevel, getEquipmentInstanceTierColor, type EquipmentTierLevel } from '../../models/equipmentTier';
import { createShopEquipment } from '../../systems/shopEquipment';
import { QtyStepper } from '../common/QtyStepper';
import { useShopCart, cartLines, cartSummary, ShopCartFooter } from '../common/ShopCart';

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
  { key: 'armGuard', label: '臂甲' },
];

export function ArmorShop() {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');
  const [templates, setTemplates] = useState<EquipmentTemplate[]>([]);
  const [category, setCategory] = useState('all');
  const [batchTier, setBatchTier] = useState<EquipmentTierLevel | null>(null);
  // 購物車：清單只勾數量（唯一裝備上限 1），實際買賣由底部單一按鈕結帳（§ 34.1）
  const buyCart = useShopCart();
  const sellCart = useShopCart();
  const allTemplates = useEquipmentTemplates();

  useEffect(() => {
    db.equipmentTemplates
      .filter(t => t.slot !== 'rightHand' && t.acquireType === 'shop')
      .sortBy('buyPrice')
      .then(setTemplates);
  }, []);

  if (!char) return null;

  function getSellPrice(item: EquipmentInstance): number {
    const template = allTemplates.find(t => t.id === item.templateId);
    // 新手裝不能賣。`isStarterGear` 是實例旗標（只有從新手指導員領取時才會標），
    // 創角直接穿上的那套沒有旗標，所以改從模板的 acquireType 判斷。
    if (template?.acquireType === 'starter') return 0;
    if (template?.buyPrice) return Math.floor(template.buyPrice * 0.5);
    if (template?.craftGold) return Math.floor(template.craftGold * 0.5);
    return 0;
  }

  const equippedIds = new Set(
    Object.values(equippedGear).filter(Boolean).map(e => e!.id)
  );

  const armorsInBag = inventory.filter(i => !i.smallMonsterDamage && getSellPrice(i) > 0 && !i.isStarterGear && !equippedIds.has(i.id));

  // --- 購買頁購物車 ---
  const freeSlots = getBagMaxSlots(equippedGear) - getBagUsedSlots(bagItems, inventory);
  // 勾選狀態跨分類保留，切換分類不會靜默丟掉已勾的防具
  const buyLines = cartLines(buyCart, templates, { keyOf: t => t.name, maxOf: () => 1 });
  const buyTotal = buyLines.reduce((sum, l) => sum + (l.item.buyPrice ?? 0), 0);
  const buyHint = buyLines.length === 0
    ? null
    : buyTotal > char.gold
      ? '金幣不足'
      : buyLines.length > freeSlots
        ? '背包欄位不足'
        : null;

  async function checkoutBuy() {
    if (buyLines.length === 0 || buyHint) return;
    const instances = await createShopEquipment(buyLines.map(l => l.item), char!.level, char!.id!);
    const state = useGameStore.getState();
    set({
      character: { ...state.character!, gold: state.character!.gold - buyTotal },
      inventory: [...state.inventory, ...instances],
    });
    state.saveState();
    buyCart.clear();
  }

  // --- 出售頁購物車 ---
  const sellLines = cartLines(sellCart, armorsInBag, { keyOf: i => `eq:${i.id}`, maxOf: () => 1 });
  const sellTotal = sellLines.reduce((sum, l) => sum + getSellPrice(l.item), 0);

  function checkoutSell() {
    if (sellLines.length === 0) return;
    const ids = sellLines.map(l => l.item.id!);
    const idSet = new Set(ids);
    const state = useGameStore.getState();
    set({
      character: { ...state.character!, gold: state.character!.gold + sellTotal },
      inventory: state.inventory.filter(i => !idSet.has(i.id!)),
    });
    db.equipmentInstances.bulkDelete(ids);
    state.saveState();
    sellCart.clear();
  }

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

      {/* 分類是篩選器，跟分頁一樣固定在表頭，不隨商品清單捲動 */}
      {tab === 'buy' && (
        <div className="bs-craft-categories">
          {ARMOR_CATEGORIES.map(cat => {
            if (cat.key !== 'all' && !templates.some(t => {
              if (cat.key === 'shield') return t.type === 'shield';
              if (cat.key === 'magicBook') return t.type === 'magicBook';
              if (cat.key === 'armGuard') return t.type === 'armGuard';
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
      )}

      {/* 只有商品清單會捲動，持有金幣與購買／出售分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'buy' && (
        <div className="shop-items">
          {templates
            .filter(t => {
              if (category === 'all') return true;
              if (category === 'shield') return t.type === 'shield';
              if (category === 'magicBook') return t.type === 'magicBook';
              if (category === 'armGuard') return t.type === 'armGuard';
              return t.slot === category;
            })
            .map(t => (
            <div key={t.name} className="shop-item">
              <div className="shop-item-info">
                <EquipmentTemplateDetail template={t} />
                <span className="shop-item-price">{t.buyPrice.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                {/* 裝備是唯一實例，一次只能買一件，介面仍與雜貨店一致 */}
                <QtyStepper
                  label={t.name}
                  value={buyCart.raw(t.name)}
                  max={1}
                  min={0}
                  onChange={next => buyCart.set(t.name, next)}
                />
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
                  <QtyStepper
                    label={`${item.name} #${item.id}`}
                    value={sellCart.raw(`eq:${item.id}`)}
                    max={1}
                    min={0}
                    onChange={next => sellCart.set(`eq:${item.id}`, next)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* 動作列固定在面板底部，全視窗只有這一顆結帳鈕（§ 34.1） */}
      {tab === 'buy' ? (
        <ShopCartFooter
          summary={cartSummary(buyLines, '件')}
          amount={`${buyTotal.toLocaleString()}G`}
          actionLabel="購買"
          hint={buyHint}
          disabled={buyLines.length === 0 || !!buyHint}
          onAction={checkoutBuy}
        />
      ) : (
        <ShopCartFooter
          summary={cartSummary(sellLines, '件')}
          amount={`+${sellTotal.toLocaleString()}G`}
          actionLabel="出售"
          disabled={sellLines.length === 0}
          onAction={checkoutSell}
        />
      )}
    </div>
  );
}
