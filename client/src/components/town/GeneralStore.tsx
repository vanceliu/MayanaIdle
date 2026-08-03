import { useState, useMemo } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import { getRegion } from '../../models/mapData';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';
import { getItemWeight, getItemDefinition } from '../../models/items';
import { isCureItem } from '../../models/cureItem';
import { GameIcon } from '../GameIcon';
import { resolveItemIcon } from '../../models/iconMap';
import { MATERIAL_TIER_COLORS } from '../../models/iconMap';
import { QtyStepper, parseQty } from '../common/QtyStepper';

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
  // 磨刀石已下架：壞刀機制暫不實作，此道具無使用功能（06-equipment.md § 壞刀機制）
];

export function GeneralStore() {
  const char = useGameStore(s => s.character);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');
  const [batchTier, setBatchTier] = useState<number | null>(null);
  // 各商品獨立的數量輸入，key = 商品名稱；未輸入過的商品預設為 1
  const [buyQty, setBuyQty] = useState<Record<string, string>>({});
  const [sellQty, setSellQty] = useState<Record<string, string>>({});

  if (!char) return null;

  const gold = char.gold;

  function qtyOf(map: Record<string, string>, name: string): string {
    return map[name] ?? '1';
  }

  const region = getRegion(char.currentRegion);
  const scrollConfig = region ? TOWN_SCROLL_CONFIG[region.id] : null;

  function canAddToBag(name: string): boolean {
    const currentBag = useGameStore.getState().bagItems;
    const inventory = useGameStore.getState().inventory;
    const existing = currentBag.find(b => b.name === name);
    if (existing) return true;
    return getBagUsedSlots(currentBag, inventory) < getBagMaxSlots(equippedGear);
  }

  function buyBulk(name: string, price: number, amount: number) {
    if (!char || amount < 1 || char.gold < price * amount) return;
    if (!canAddToBag(name)) return;
    const updated = { ...char, gold: char.gold - price * amount };
    set({ character: updated });
    buyBagItem(name, amount);
  }

  function buyBagItem(name: string, amount: number) {
    const currentBag = useGameStore.getState().bagItems;
    const inventory = useGameStore.getState().inventory;
    const existing = currentBag.find(b => b.name === name);
    if (!existing && getBagUsedSlots(currentBag, inventory) >= getBagMaxSlots(equippedGear)) return;
    const itemType = getItemType(name);
    const def = getItemDefinition(name);
    if (existing) {
      set({
        bagItems: currentBag.map(b =>
          b.name === name ? { ...b, amount: b.amount + amount } : b
        ),
      });
    } else {
      set({
        bagItems: [...currentBag, { name, type: itemType, itemTemplateId: def?.id, amount }],
      });
    }
    useGameStore.getState().saveState();
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

  function buyScroll(amount: number) {
    if (!char || !scrollConfig || amount < 1 || char.gold < scrollConfig.price * amount) return;
    if (!canAddToBag(scrollConfig.name)) return;
    const updated = { ...char, gold: char.gold - scrollConfig.price * amount };
    set({ character: updated });

    const currentBag = useGameStore.getState().bagItems;
    const existing = currentBag.find(b => b.name === scrollConfig.name);
    if (existing) {
      set({
        bagItems: currentBag.map(b =>
          b.name === scrollConfig.name ? { ...b, amount: b.amount + amount } : b
        ),
      });
    } else {
      set({
        bagItems: [...currentBag, { name: scrollConfig.name, type: 'scroll', amount }],
      });
    }
    useGameStore.getState().saveState();
  }

  function getSellPrice(name: string): number {
    const def = getItemDefinition(name);
    // 專用材料（魔法書材料）明確不可販售，不靠「沒填價格」來擋
    if (def?.noSell) return 0;
    if (def?.sellPrice) return def.sellPrice;
    if (def?.buyPrice) return def.buyPrice;
    return 0;
  }

  function sellBagItem(name: string, sellPrice: number, amount: number) {
    if (!char) return;
    const currentBag = useGameStore.getState().bagItems;
    const item = currentBag.find(b => b.name === name);
    if (!item || item.amount <= 0) return;
    const actual = Math.min(amount, item.amount);

    const newBag = currentBag.map(b =>
      b.name === name ? { ...b, amount: b.amount - actual } : b
    ).filter(b => b.amount > 0);

    set({
      character: { ...char, gold: char.gold + sellPrice * actual },
      bagItems: newBag,
    });
    useGameStore.getState().saveState();
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
      const sellPrice = Math.floor((def.sellPrice ?? def.buyPrice ?? 0) * 0.5);
      if (sellPrice <= 0) return false;
      return def.iconTier <= batchTier;
    });
  }, [bagItems, batchTier]);

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

      {tab === 'buy' && (
        <div className="shop-items">
          {SHOP_ITEMS.map(item => {
            const { icon, color } = getShopItemIcon(item.name);
            const raw = qtyOf(buyQty, item.name);
            const affordable = Math.floor(gold / item.price);
            const qty = parseQty(raw, affordable);
            const total = item.price * qty;
            return (
            <div key={item.name} className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GameIcon name={icon} size={16} color={color} />
                  {item.name}
                </span>
                <span className="shop-item-desc">{item.description} | 重量: {getItemWeight(item.name)}</span>
                <span className="shop-item-price">{item.price.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <QtyStepper
                  label={item.name}
                  value={raw}
                  max={affordable}
                  onChange={next => setBuyQty(q => ({ ...q, [item.name]: next }))}
                />
                <button
                  className="shop-action-btn"
                  onClick={() => buyBulk(item.name, item.price, qty)}
                  disabled={gold < total}
                >
                  購買 {total.toLocaleString()}G
                </button>
              </div>
            </div>
            );
          })}
          {scrollConfig && (() => {
            const raw = qtyOf(buyQty, scrollConfig.name);
            const affordable = Math.floor(gold / scrollConfig.price);
            const qty = parseQty(raw, affordable);
            const total = scrollConfig.price * qty;
            return (
            <div className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {(() => {
                    const { icon, color } = getShopItemIcon(scrollConfig.name);
                    return <GameIcon name={icon} size={16} color={color} />;
                  })()}
                  {scrollConfig.name}
                </span>
                <span className="shop-item-desc">使用後傳送至{scrollConfig.townName} | 重量: {getItemWeight(scrollConfig.name)}</span>
                <span className="shop-item-price">{scrollConfig.price}G</span>
              </div>
              <div className="shop-item-actions">
                <QtyStepper
                  label={scrollConfig.name}
                  value={raw}
                  max={affordable}
                  onChange={next => setBuyQty(q => ({ ...q, [scrollConfig.name]: next }))}
                />
                <button
                  className="shop-action-btn"
                  onClick={() => buyScroll(qty)}
                  disabled={gold < total}
                >
                  購買 {total.toLocaleString()}G
                </button>
              </div>
            </div>
            );
          })()}
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
            </div>
            {batchTier !== null && (
              <div className="batch-sell-preview">
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
                            <span style={{ color }}>{item.name} ×{item.amount}</span>
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

          {bagItems.length === 0 && <p className="empty-text">沒有可出售的物品</p>}
          {bagItems.map(item => {
            const sellPrice = Math.floor(getSellPrice(item.name) * 0.5);
            if (sellPrice <= 0) return null;
            const raw = qtyOf(sellQty, item.name);
            const qty = parseQty(raw, item.amount);
            const total = sellPrice * qty;
            return (
              <div key={item.name} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {(() => { const { icon, color } = getShopItemIcon(item.name); return <GameIcon name={icon} size={16} color={color} />; })()}
                    {item.name} ×{item.amount}
                  </span>
                  <span className="shop-item-price sell-price">+{sellPrice}G/個</span>
                </div>
                <div className="shop-item-actions">
                  <QtyStepper
                    label={item.name}
                    value={raw}
                    max={item.amount}
                    onChange={next => setSellQty(q => ({ ...q, [item.name]: next }))}
                  />
                  <button
                    className="shop-action-btn"
                    onClick={() => sellBagItem(item.name, sellPrice, qty)}
                  >
                    賣出 +{total.toLocaleString()}G
                  </button>
                  <button onClick={() => sellBagItem(item.name, sellPrice, item.amount)}>全部</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
