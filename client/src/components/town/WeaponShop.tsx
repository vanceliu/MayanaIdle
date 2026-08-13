import { useState, useEffect } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { db } from '../../db/database';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { EquipmentDetail, EquipmentTemplateDetail } from '../EquipmentInfo';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { getEquipmentInstanceTierColor, type EquipmentTierLevel } from '../../models/equipmentTier';
import {
  getEquipmentSellPrice, isSellableEquipment, isWeaponInstance,
  collectBatchSellEquipment, getEquipmentSellTotal, EQUIPMENT_TIER_OPTIONS,
} from '../../systems/shop';
import { createShopEquipment } from '../../systems/shopEquipment';
import { QtyStepper } from '../common/QtyStepper';
import { useShopCart, cartLines, cartSummary, ShopCartFooter } from '../common/ShopCart';

type ShopTab = 'buy' | 'sell';

const WEAPON_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'sword', label: '單手劍' },
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
      .filter(t => t.slot === 'rightHand' && t.acquireType === 'shop')
      .sortBy('buyPrice')
      .then(setTemplates);
  }, []);

  if (!char) return null;

  const getSellPrice = (item: EquipmentInstance) => getEquipmentSellPrice(item, allTemplates);

  const equippedIds = new Set(
    Object.values(equippedGear).filter(Boolean).map(e => e!.id)
  );

  const weaponsInBag = inventory.filter(
    i => isWeaponInstance(i) && isSellableEquipment(i, allTemplates, equippedIds)
  );

  // --- 購買頁購物車 ---
  const freeSlots = getBagMaxSlots(equippedGear) - getBagUsedSlots(bagItems, inventory, equippedGear);
  // 勾選狀態跨分類保留，切換分類不會靜默丟掉已勾的武器
  /*
   * 裝備可以買多件（與雜貨店同一套）—— 每件都是獨立實例、各佔一格，
   * 所以上限同時看金幣與背包空格，不是寫死 1。
   */
  const buyLines = cartLines(buyCart, templates, {
    keyOf: t => `tpl:${t.id}`,
    // 上限只用金幣算：背包空格是**所有列共用**的，逐列夾不出來，由下方合計檢查
    maxOf: t => Math.floor(char.gold / Math.max(1, t.buyPrice ?? 1)),
    hardCap: Infinity,
  });
  const buyTotal = buyLines.reduce((sum, l) => sum + (l.item.buyPrice ?? 0) * l.qty, 0);
  const buyCount = buyLines.reduce((sum, l) => sum + l.qty, 0);
  const buyHint = buyLines.length === 0
    ? null
    : buyTotal > char.gold
      ? '金幣不足'
      : buyCount > freeSlots
        ? '背包欄位不足'
        : null;

  async function checkoutBuy() {
    if (buyLines.length === 0 || buyHint) return;
    // 買幾件就開幾個實例，各自 roll 詞綴
    const ordered = buyLines.flatMap(l => Array.from({ length: l.qty }, () => l.item));
    const instances = await createShopEquipment(ordered, char!.level, char!.id!);
    const state = useGameStore.getState();
    set({
      character: { ...state.character!, gold: state.character!.gold - buyTotal },
      inventory: [...state.inventory, ...instances],
    });
    state.saveState();
    buyCart.clear();
  }

  // --- 出售頁購物車 ---
  const sellLines = cartLines(sellCart, weaponsInBag, { keyOf: i => `eq:${i.id}`, maxOf: () => 1 });
  const sellTotal = sellLines.reduce((sum, l) => sum + getSellPrice(l.item), 0);

  function checkoutSell() {
    if (sellLines.length === 0) return;
    useGameStore.getState().sellEquipmentInstances(sellLines.map(l => l.item.id!), allTemplates);
    sellCart.clear();
  }

  /* 同 `ArmorShop`：deps 是每次 render 新生的陣列，memo 不會命中，
     且擺在早期 return 之後會讓 hook 數量隨 char 有無變動 */
  const batchSellWeapons = batchTier === null
    ? []
    : collectBatchSellEquipment(weaponsInBag, allTemplates, batchTier);
  const batchSellTotal = getEquipmentSellTotal(batchSellWeapons, allTemplates);

  function executeBatchSell() {
    if (!char || batchSellWeapons.length === 0) return;
    useGameStore.getState().sellEquipmentInstances(batchSellWeapons.map(i => i.id!), allTemplates);
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

      {/* 分類是篩選器，跟分頁一樣固定在表頭，不隨商品清單捲動 */}
      {tab === 'buy' && (
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
      )}

      {/* 只有商品清單會捲動，持有金幣與購買／出售分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'buy' && (
        <div className="shop-items">
          {templates
            .filter(t => category === 'all' || t.type === category)
            .map(t => (
            <div key={t.name} className="shop-item">
              <div className="shop-item-info">
                <EquipmentTemplateDetail template={t} />
                <span className="shop-item-price">{t.buyPrice.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                {/* 上限同時看金幣與背包空格 —— 每件都是獨立實例，各佔一格 */}
                <QtyStepper
                  label={t.name}
                  value={buyCart.raw(`tpl:${t.id}`)}
                  max={Math.floor(char.gold / Math.max(1, t.buyPrice ?? 1))}
                  min={0}
                  onChange={next => buyCart.set(`tpl:${t.id}`, next)}
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
                {EQUIPMENT_TIER_OPTIONS.map(opt => (
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
          summary={cartSummary(buyLines, '個')}
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
