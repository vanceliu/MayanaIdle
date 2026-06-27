import { useState } from 'react';
import { useGameStore, getBagUsedSlots, BAG_MAX_SLOTS } from '../../stores/gameStore';
import { getRegion } from '../../models/mapData';
import { TOWN_SCROLL_CONFIG } from '../../models/townScroll';
import { getItemWeight } from '../../models/items';

type ShopTab = 'buy' | 'sell';

const SHOP_ITEMS = [
  { name: '紅色藥水', price: 25, description: '回復 10~15 HP' },
  { name: '橙色藥水', price: 80, description: '回復 30~45 HP' },
  { name: '白色藥水', price: 200, description: '回復 60~90 HP' },
  { name: '綠色藥水', price: 200, description: '攻速+33%（120秒）' },
  { name: '強化綠色藥水', price: 1000, description: '攻速+33%（600秒）' },
  { name: '武器強化卷軸', price: 100000, description: '鐵匠鋪武器強化用' },
  { name: '防具強化卷軸', price: 50000, description: '鐵匠鋪防具強化用' },
  { name: '磨刀石', price: 200, description: '修復武器壞刀 1 層' },
];

export function GeneralStore() {
  const char = useGameStore(s => s.character);
  const bagItems = useGameStore(s => s.bagItems);
  const set = useGameStore.setState;
  const [tab, setTab] = useState<ShopTab>('buy');

  if (!char) return null;

  const region = getRegion(char.currentRegion);
  const scrollConfig = region ? TOWN_SCROLL_CONFIG[region.id] : null;

  function canAddToBag(name: string): boolean {
    const currentBag = useGameStore.getState().bagItems;
    const inventory = useGameStore.getState().inventory;
    const existing = currentBag.find(b => b.name === name);
    if (existing) return true;
    return getBagUsedSlots(currentBag, inventory) < BAG_MAX_SLOTS;
  }

  function buyPotion(name: string, price: number) {
    if (!char || char.gold < price) return;
    if (!canAddToBag(name)) return;
    const updated = { ...char, gold: char.gold - price };
    set({ character: updated });
    buyBagItem(name, 1);
  }

  function buyBulk(name: string, price: number, amount: number) {
    if (!char || char.gold < price * amount) return;
    if (!canAddToBag(name)) return;
    const updated = { ...char, gold: char.gold - price * amount };
    set({ character: updated });
    buyBagItem(name, amount);
  }

  function buyBagItem(name: string, amount: number) {
    const currentBag = useGameStore.getState().bagItems;
    const inventory = useGameStore.getState().inventory;
    const existing = currentBag.find(b => b.name === name);
    if (!existing && getBagUsedSlots(currentBag, inventory) >= BAG_MAX_SLOTS) return;
    const itemType = getItemType(name);
    if (existing) {
      set({
        bagItems: currentBag.map(b =>
          b.name === name ? { ...b, amount: b.amount + amount } : b
        ),
      });
    } else {
      set({
        bagItems: [...currentBag, { name, type: itemType, amount }],
      });
    }
    useGameStore.getState().saveState();
  }

  function getItemType(name: string): 'scroll' | 'material' | 'potion' {
    if (name.includes('卷軸')) return 'scroll';
    if (name.includes('藥水')) return 'potion';
    return 'material';
  }

  function buyScroll(amount: number) {
    if (!char || !scrollConfig || char.gold < scrollConfig.price * amount) return;
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
    const potionPrices: Record<string, number> = { '紅色藥水': 25, '橙色藥水': 80, '白色藥水': 200, '綠色藥水': 200, '強化綠色藥水': 1000 };
    if (potionPrices[name]) return potionPrices[name];
    if (name.includes('回城卷軸')) return 500;
    if (name === '武器強化卷軸') return 100000;
    if (name === '防具強化卷軸') return 50000;
    if (name === '磨刀石') return 200;
    return 100;
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
          {SHOP_ITEMS.map(item => (
            <div key={item.name} className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name">{item.name}</span>
                <span className="shop-item-desc">{item.description} | 重量: {getItemWeight(item.name)}</span>
                <span className="shop-item-price">{item.price.toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={() => buyPotion(item.name, item.price)}
                  disabled={char.gold < item.price}
                >
                  買1
                </button>
                <button
                  onClick={() => buyBulk(item.name, item.price, 10)}
                  disabled={char.gold < item.price * 10}
                >
                  買10
                </button>
              </div>
            </div>
          ))}
          {scrollConfig && (
            <div className="shop-item">
              <div className="shop-item-info">
                <span className="shop-item-name">{scrollConfig.name}</span>
                <span className="shop-item-desc">使用後傳送至{scrollConfig.townName} | 重量: {getItemWeight(scrollConfig.name)}</span>
                <span className="shop-item-price">{scrollConfig.price}G</span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={() => buyScroll(1)}
                  disabled={char.gold < scrollConfig.price}
                >
                  買1
                </button>
                <button
                  onClick={() => buyScroll(10)}
                  disabled={char.gold < scrollConfig.price * 10}
                >
                  買10
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'sell' && (
        <div className="shop-items">
          {bagItems.length === 0 && <p className="empty-text">沒有可出售的物品</p>}
          {bagItems.map(item => {
            const sellPrice = Math.floor(getSellPrice(item.name) * 0.5);
            if (sellPrice <= 0) return null;
            return (
              <div key={item.name} className="shop-item">
                <div className="shop-item-info">
                  <span className="shop-item-name">{item.name} ×{item.amount}</span>
                  <span className="shop-item-price sell-price">+{sellPrice}G/個</span>
                </div>
                <div className="shop-item-actions">
                  <button onClick={() => sellBagItem(item.name, sellPrice, 1)}>賣1</button>
                  <button onClick={() => sellBagItem(item.name, sellPrice, 10)}>賣10</button>
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
