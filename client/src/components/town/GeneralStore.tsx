import { useState, useMemo } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { getRegion } from '../../models/mapData';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';
import { getItemWeight, getItemDefinition } from '../../models/items';
import { isCureItem } from '../../models/cureItem';
import { GameIcon } from '../GameIcon';
import { resolveItemIcon } from '../../models/iconMap';
import { MATERIAL_TIER_COLORS } from '../../models/iconMap';
import { QtyStepper } from '../common/QtyStepper';
import { useShopCart, cartLines, cartSummary, ShopCartFooter } from '../common/ShopCart';
import { CraftUsageBadge } from '../common/CraftUsageBadge';
import { hasMaterialUsage } from '../../systems/craftMaterialUsage';

type ShopTab = 'buy' | 'sell';

const SHOP_ITEMS = [
  { name: '紅色藥水', price: 25, description: '回復 10~15 HP' },
  { name: '橙色藥水', price: 80, description: '回復 30~45 HP' },
  { name: '白色藥水', price: 200, description: '回復 60~90 HP' },
  { name: '綠色藥水', price: 200, description: '攻速+33%（120秒）' },
  { name: '強化綠色藥水', price: 1000, description: '攻速+33%（600秒）' },
  { name: '解毒藥水', price: 50, description: '立即解除中毒' },
  { name: '止血繃帶', price: 50, description: '立即解除流血' },
  { name: '淨化藥水', price: 500, description: '解除詛咒/虛弱（全解）' },
  { name: '武器強化卷軸', price: 100000, description: '鐵匠鋪武器強化用' },
  { name: '防具強化卷軸', price: 50000, description: '鐵匠鋪防具強化用' },
  { name: '百柱塔 1F 通行卷軸', price: 2000, description: '進入百柱塔 1~10F 所需' },
  // 磨刀石已下架：壞刀機制暫不實作，此道具無使用功能（06-equipment.md § 壞刀機制）
];

/** 購買頁的一列商品（一般商品與當地回城卷軸共用同一種結構） */
interface BuyEntry {
  name: string;
  price: number;
  description: string;
}

export function GeneralStore() {
  const char = useGameStore(s => s.character);
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const equippedGear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');
  const [batchTier, setBatchTier] = useState<number | null>(null);
  // 預設保護有用途的素材（配方材料 + 強化石／品質石）：批量販售的本意是清掉純販售素材
  const [skipCraftMaterials, setSkipCraftMaterials] = useState(true);
  // 購物車：清單只選數量，實際買賣由底部單一按鈕結帳（§ 34.1）
  const buyCart = useShopCart();
  const sellCart = useShopCart();

  if (!char) return null;

  const gold = char.gold;
  const freeSlots = getBagMaxSlots(equippedGear) - getBagUsedSlots(bagItems, inventory);

  const region = getRegion(char.currentRegion);
  const scrollConfig = region ? TOWN_SCROLL_CONFIG[region.id] : null;

  const buyEntries: BuyEntry[] = SHOP_ITEMS.map(i => ({ ...i }));
  if (scrollConfig && !buyEntries.some(e => e.name === scrollConfig.name)) {
    buyEntries.push({
      name: scrollConfig.name,
      price: scrollConfig.price,
      description: `使用後傳送至${scrollConfig.townName}`,
    });
  }

  function getItemType(name: string): 'scroll' | 'material' | 'potion' {
    if (name.includes('卷軸')) return 'scroll';
    if (name.includes('藥水')) return 'potion';
    // 狀態解除道具（含止血繃帶）一律歸為 potion，背包才會顯示為可使用道具
    if (isCureItem(name)) return 'potion';
    return 'material';
  }

  function getShopItemIcon(name: string): { icon: string; color?: string } {
    // 顯示方式一律以 item 定義為準，與背包共用同一份資料
    return resolveItemIcon(getItemDefinition(name), name.includes('卷軸') ? 'scroll' : 'material');
  }

  function getSellPrice(name: string): number {
    const def = getItemDefinition(name);
    // 專用材料（魔法書材料）明確不可販售，不靠「沒填價格」來擋
    if (def?.noSell) return 0;
    if (def?.sellPrice) return def.sellPrice;
    if (def?.buyPrice) return def.buyPrice;
    return 0;
  }

  // --- 購買頁購物車 ---
  const buyLines = cartLines(buyCart, buyEntries, {
    keyOf: e => e.name,
    maxOf: e => Math.floor(gold / e.price),
  });
  const buyTotal = buyLines.reduce((sum, l) => sum + l.item.price * l.qty, 0);
  /** 尚未在背包裡的品項才需要新的欄位，多品項要一次算完才知道放不放得下 */
  const buyNewSlots = buyLines.filter(l => !bagItems.some(b => b.name === l.item.name)).length;
  const buyHint = buyLines.length === 0
    ? null
    : buyTotal > gold
      ? '金幣不足'
      : buyNewSlots > freeSlots
        ? '背包欄位不足'
        : null;

  function checkoutBuy() {
    if (buyLines.length === 0 || buyHint) return;
    const state = useGameStore.getState();
    let bag = state.bagItems;
    for (const line of buyLines) {
      const name = line.item.name;
      if (bag.some(b => b.name === name)) {
        bag = bag.map(b => (b.name === name ? { ...b, amount: b.amount + line.qty } : b));
      } else {
        bag = [
          ...bag,
          { name, type: getItemType(name), itemTemplateId: getItemDefinition(name)?.id, amount: line.qty },
        ];
      }
    }
    set({
      character: { ...state.character!, gold: state.character!.gold - buyTotal },
      bagItems: bag,
    });
    state.saveState();
    buyCart.clear();
  }

  // --- 出售頁購物車 ---
  const sellableItems = bagItems.filter(item => getSellPrice(item.name) > 0);
  /** 售價一律為買價的一半（§ 6.x 商店回收價） */
  const unitSellPrice = (name: string) => Math.floor(getSellPrice(name) * 0.5);
  const sellLines = cartLines(sellCart, sellableItems, {
    keyOf: item => item.name,
    maxOf: item => item.amount,
    // 持有量本身就是上限，不再另外套 999，「全部」才能一次賣光超過 999 的素材
    hardCap: Infinity,
  });
  const sellTotal = sellLines.reduce((sum, l) => sum + unitSellPrice(l.item.name) * l.qty, 0);

  function checkoutSell() {
    if (sellLines.length === 0) return;
    const state = useGameStore.getState();
    let bag = state.bagItems;
    let gained = 0;
    for (const line of sellLines) {
      const held = bag.find(b => b.name === line.item.name);
      if (!held) continue;
      const actual = Math.min(line.qty, held.amount);
      if (actual <= 0) continue;
      gained += unitSellPrice(line.item.name) * actual;
      bag = bag
        .map(b => (b.name === line.item.name ? { ...b, amount: b.amount - actual } : b))
        .filter(b => b.amount > 0);
    }
    set({
      character: { ...state.character!, gold: state.character!.gold + gained },
      bagItems: bag,
    });
    state.saveState();
    sellCart.clear();
  }

  const TIER_OPTIONS = [
    { tier: 1, label: 'Tier 1（白色素材）' },
    { tier: 2, label: 'Tier 2 以下' },
    { tier: 3, label: 'Tier 3 以下' },
    { tier: 4, label: 'Tier 4 以下' },
    { tier: 5, label: 'Tier 5 以下' },
    { tier: 6, label: 'Tier 6 以下' },
    { tier: 7, label: 'Tier 7 以下（全部）' },
  ];

  const batchSellItems = useMemo(() => {
    if (batchTier === null) return [];
    return bagItems.filter(item => {
      if (item.type !== 'material') return false;
      const def = getItemDefinition(item.name);
      if (!def || !def.iconTier || def.noSell) return false;
      // 顏色只表達稀有度，「Tier N 以下」會連進得了配方的素材一起掃掉，故預設保護
      if (skipCraftMaterials && hasMaterialUsage(item.name)) return false;
      const sellPrice = Math.floor((def.sellPrice ?? def.buyPrice ?? 0) * 0.5);
      if (sellPrice <= 0) return false;
      return def.iconTier <= batchTier;
    });
  }, [bagItems, batchTier, skipCraftMaterials]);

  /** 被保護規則擋下來的素材，讓玩家知道少賣了什麼，而不是靜默漏掉 */
  const protectedItems = useMemo(() => {
    if (batchTier === null || !skipCraftMaterials) return [];
    return bagItems.filter(item => {
      if (item.type !== 'material' || !hasMaterialUsage(item.name)) return false;
      const def = getItemDefinition(item.name);
      return !!def?.iconTier && !def.noSell && def.iconTier <= batchTier;
    });
  }, [bagItems, batchTier, skipCraftMaterials]);

  const batchSellTotal = useMemo(() => {
    return batchSellItems.reduce((sum, item) => {
      const def = getItemDefinition(item.name);
      const sellPrice = Math.floor((def?.sellPrice ?? def?.buyPrice ?? 0) * 0.5);
      return sum + sellPrice * item.amount;
    }, 0);
  }, [batchSellItems]);

  function executeBatchSell() {
    if (!char || batchSellItems.length === 0) return;
    const currentBag = useGameStore.getState().bagItems;
    let totalGold = 0;
    const namesToSell = new Set(batchSellItems.map(i => i.name));

    for (const item of currentBag) {
      if (!namesToSell.has(item.name)) continue;
      const def = getItemDefinition(item.name);
      const sellPrice = Math.floor((def?.sellPrice ?? def?.buyPrice ?? 0) * 0.5);
      totalGold += sellPrice * item.amount;
    }

    const newBag = currentBag.filter(b => !namesToSell.has(b.name));
    set({
      character: { ...useGameStore.getState().character!, gold: useGameStore.getState().character!.gold + totalGold },
      bagItems: newBag,
    });
    useGameStore.getState().saveState();
    setBatchTier(null);
  }

  return (
    <div className="shop-panel">
      <p className="shop-greeting">「歡迎光臨！需要什麼嗎？」</p>
      <div className="shop-gold">持有金幣: {char.gold.toLocaleString()}G</div>

      <div className="shop-tabs">
        <button className={tab === 'buy' ? 'active' : ''} onClick={() => setTab('buy')}>購買</button>
        <button className={tab === 'sell' ? 'active' : ''} onClick={() => setTab('sell')}>出售</button>
      </div>

      {/* 只有商品清單會捲動，持有金幣與購買／出售分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'buy' && (
        <div className="shop-items">
          {buyEntries.map(entry => {
            const { icon, color } = getShopItemIcon(entry.name);
            const affordable = Math.floor(gold / entry.price);
            return (
            <div key={entry.name} className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GameIcon name={icon} size={16} color={color} />
                  {entry.name}
                </span>
                <span className="shop-item-desc">{entry.description} | 重量: {getItemWeight(entry.name)}</span>
                <span className="shop-item-price">{entry.price.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <QtyStepper
                  label={entry.name}
                  value={buyCart.raw(entry.name)}
                  max={affordable}
                  min={0}
                  onChange={next => buyCart.set(entry.name, next)}
                />
              </div>
            </div>
            );
          })}
        </div>
      )}

      {tab === 'sell' && (
        <div className="shop-items">
          <div className="batch-sell-controls">
            <div className="batch-sell-selector">
              <span className="batch-sell-label">批量販售等級：</span>
              <select
                value={batchTier ?? ''}
                onChange={e => setBatchTier(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">-- 選擇等級 --</option>
                {TIER_OPTIONS.map(opt => (
                  <option key={opt.tier} value={opt.tier}>{opt.label}</option>
                ))}
              </select>
              <label className="batch-sell-skip-craft">
                <input
                  type="checkbox"
                  checked={skipCraftMaterials}
                  onChange={e => setSkipCraftMaterials(e.target.checked)}
                />
                跳過有用途的素材
              </label>
            </div>
            {batchTier !== null && (
              <div className="batch-sell-preview">
                {protectedItems.length > 0 && (
                  <p className="batch-sell-protected">
                    已保留 {protectedItems.length} 種有用途的素材：
                    {protectedItems.map(i => i.name).join('、')}
                  </p>
                )}
                {batchSellItems.length === 0 ? (
                  <p className="empty-text">沒有符合條件的素材</p>
                ) : (
                  <>
                    <div className="batch-sell-list">
                      {batchSellItems.map(item => {
                        const def = getItemDefinition(item.name);
                        const color = def?.iconTier ? MATERIAL_TIER_COLORS[def.iconTier] : '#FFFFFF';
                        const sellPrice = Math.floor((def?.sellPrice ?? def?.buyPrice ?? 0) * 0.5);
                        return (
                          <div key={item.name} className="batch-sell-item">
                            <span style={{ color }}>{item.name} ×{item.amount}<CraftUsageBadge name={item.name} compact /></span>
                            <span className="shop-item-price sell-price">+{(sellPrice * item.amount).toLocaleString()}G</span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="batch-sell-btn"
                      onClick={executeBatchSell}
                    >
                      一鍵販售 ({batchSellItems.length} 種) — 獲得 {batchSellTotal.toLocaleString()}G
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <hr className="batch-sell-divider" />

          {sellableItems.length === 0 && <p className="empty-text">沒有可出售的物品</p>}
          {sellableItems.map(item => {
            const sellPrice = unitSellPrice(item.name);
            return (
              <div key={item.name} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {(() => { const { icon, color } = getShopItemIcon(item.name); return <GameIcon name={icon} size={16} color={color} />; })()}
                    {item.name} ×{item.amount}
                    <CraftUsageBadge name={item.name} />
                  </span>
                  <span className="shop-item-price sell-price">+{sellPrice}G/個</span>
                </div>
                <div className="shop-item-actions">
                  <QtyStepper
                    label={item.name}
                    value={sellCart.raw(item.name)}
                    max={item.amount}
                    min={0}
                    hardCap={Infinity}
                    showMax
                    onChange={next => sellCart.set(item.name, next)}
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
          summary={cartSummary(sellLines, '個')}
          amount={`+${sellTotal.toLocaleString()}G`}
          actionLabel="賣出"
          disabled={sellLines.length === 0}
          onAction={checkoutSell}
        />
      )}
    </div>
  );
}
