import { useState } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { BagItem } from '../../stores/gameStore';
import { EquipmentDetail } from '../EquipmentInfo';
import { GameIcon } from '../GameIcon';
import { resolveItemIcon } from '../../models/iconMap';
import { getItemWeight, getItemDefinition } from '../../models/items';
import { db } from '../../db/database';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { QtyStepper } from '../common/QtyStepper';
import { useShopCart, cartLines, type CartLine, ShopCartFooter } from '../common/ShopCart';

type StorageTab = 'personal' | 'shared';
type ActionTab = 'deposit' | 'withdraw';

/** 倉庫一次可以同時搬裝備與可堆疊物品，摘要要分開講清楚 */
function storageSummary(
  equipLines: CartLine<EquipmentInstance>[],
  materialLines: CartLine<BagItem>[],
): string {
  const parts: string[] = [];
  if (equipLines.length > 0) parts.push(`裝備 ${equipLines.length} 件`);
  if (materialLines.length > 0) {
    const total = materialLines.reduce((sum, l) => sum + l.qty, 0);
    parts.push(`物品 ${materialLines.length} 種 · 共 ${total} 個`);
  }
  return parts.length > 0 ? `已選 ${parts.join(' / ')}` : '未選擇任何項目';
}

export function Storage() {
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const equippedGear = useGameStore(s => s.equippedGear);
  const storedEquipment = useGameStore(s => s.storedEquipment);
  const storedMaterials = useGameStore(s => s.storedMaterials);
  const personalStoredEquipment = useGameStore(s => s.personalStoredEquipment);
  const personalStoredMaterials = useGameStore(s => s.personalStoredMaterials);
  const character = useGameStore(s => s.character);
  const userId = useGameStore(s => s.userId);
  const warehouseGold = useGameStore(s => s.warehouseGold);
  const [storageTab, setStorageTab] = useState<StorageTab>('shared');
  const [actionTab, setActionTab] = useState<ActionTab>('deposit');
  const [goldAmount, setGoldAmount] = useState('');
  // 購物車：清單只選數量，實際存取由底部單一按鈕執行（§ 34.1）
  const depositCart = useShopCart();
  const withdrawCart = useShopCart();
  const [search, setSearch] = useState('');
  const templates = useEquipmentTemplates();

  const isShared = storageTab === 'shared';
  const currentEquipStored = isShared ? storedEquipment : personalStoredEquipment;
  const currentMaterialStored = isShared ? storedMaterials : personalStoredMaterials;

  // --- Gold (shared only) ---
  function depositGold() {
    const amount = parseInt(goldAmount, 10);
    if (!amount || amount <= 0 || !character) return;
    const available = character.gold;
    const actual = Math.min(amount, available);
    if (actual <= 0) return;

    useGameStore.setState({
      character: { ...character, gold: character.gold - actual },
      warehouseGold: useGameStore.getState().warehouseGold + actual,
    });
    useGameStore.getState().saveState();
    setGoldAmount('');
  }

  function withdrawGold() {
    const amount = parseInt(goldAmount, 10);
    if (!amount || amount <= 0 || !character) return;
    const available = useGameStore.getState().warehouseGold;
    const actual = Math.min(amount, available);
    if (actual <= 0) return;

    useGameStore.setState({
      character: { ...character, gold: character.gold + actual },
      warehouseGold: useGameStore.getState().warehouseGold - actual,
    });
    useGameStore.getState().saveState();
    setGoldAmount('');
  }

  function switchStorage(next: StorageTab) {
    setStorageTab(next);
    depositCart.clear();
    withdrawCart.clear();
  }

  /** 依當前倉庫（共用／個人）決定要寫哪一組 state 欄位 */
  function storagePatch(equip: EquipmentInstance[], materials: BagItem[]) {
    return isShared
      ? { storedEquipment: equip, storedMaterials: materials }
      : { personalStoredEquipment: equip, personalStoredMaterials: materials };
  }

  /** 把 amount 個 `item` 併進目標清單（同名合併） */
  function mergeMaterial(list: BagItem[], item: BagItem, amount: number): BagItem[] {
    return list.some(s => s.name === item.name)
      ? list.map(s => (s.name === item.name ? { ...s, amount: s.amount + amount } : s))
      : [...list, { ...item, amount }];
  }

  /** 從來源清單扣掉 amount 個，扣完就移除該列 */
  function takeMaterial(list: BagItem[], name: string, amount: number): BagItem[] {
    return list
      .map(s => (s.name === name ? { ...s, amount: s.amount - amount } : s))
      .filter(s => s.amount > 0);
  }

  // --- 名稱搜尋：不分大小寫、去除前後空白，空字串代表不過濾 ---
  const query = search.trim().toLowerCase();
  const isFiltering = query.length > 0;
  const matchesQuery = (name: string) => !isFiltering || name.toLowerCase().includes(query);

  // 購物車一律以「未過濾的完整清單」計算，搜尋只影響看得到什麼，不會靜默丟掉已選的項目
  const depositableEquip = inventory.filter(i => !i.isStarterGear);
  const bagEquipment = depositableEquip.filter(i => matchesQuery(i.name));
  const potionItems = bagItems.filter(b => b.type === 'potion' && matchesQuery(b.name));
  const nonPotionItems = bagItems.filter(b => b.type !== 'potion' && matchesQuery(b.name));
  const storedEquipList = currentEquipStored.filter(i => matchesQuery(i.name));
  const storedPotions = currentMaterialStored.filter(s => s.type === 'potion' && matchesQuery(s.name));
  const storedNonPotions = currentMaterialStored.filter(s => s.type !== 'potion' && matchesQuery(s.name));

  const freeSlots = getBagMaxSlots(equippedGear) - getBagUsedSlots(bagItems, inventory);

  // --- 存入頁購物車 ---
  const depositEquipLines = cartLines(depositCart, depositableEquip, {
    keyOf: i => `eq:${i.id}`,
    maxOf: () => 1,
  });
  const depositMaterialLines = cartLines(depositCart, bagItems, {
    keyOf: b => `mat:${b.name}`,
    maxOf: b => b.amount,
    // 持有量本身就是上限，倉庫不套用 999 硬上限
    hardCap: Infinity,
  });

  function executeDeposit() {
    if (depositEquipLines.length === 0 && depositMaterialLines.length === 0) return;
    // 共用倉庫的裝備要記 ownerId 才知道是誰寄放的，沒有登入者就不搬裝備
    const canMoveEquip = isShared ? !!userId : !!character;
    const state = useGameStore.getState();
    let inv = state.inventory;
    let bag = state.bagItems;
    let equip = isShared ? state.storedEquipment : state.personalStoredEquipment;
    let materials = isShared ? state.storedMaterials : state.personalStoredMaterials;

    if (canMoveEquip) {
      for (const line of depositEquipLines) {
        const item = line.item;
        const changes = isShared
          ? { inStorage: true, storageType: 'shared' as const, ownerId: userId! }
          : { inStorage: true, storageType: 'personal' as const, ownerId: character!.id! };
        inv = inv.filter(i => i.id !== item.id);
        equip = [...equip, { ...item, ...changes }];
        db.equipmentInstances.update(item.id!, changes);
      }
    }

    for (const line of depositMaterialLines) {
      const held = bag.find(b => b.name === line.item.name);
      if (!held) continue;
      const actual = Math.min(line.qty, held.amount);
      if (actual <= 0) continue;
      bag = takeMaterial(bag, line.item.name, actual);
      materials = mergeMaterial(materials, line.item, actual);
    }

    useGameStore.setState({ inventory: inv, bagItems: bag, ...storagePatch(equip, materials) });
    state.saveState();
    depositCart.clear();
  }

  // --- 取出頁購物車 ---
  const withdrawEquipLines = cartLines(withdrawCart, currentEquipStored, {
    keyOf: i => `eq:${i.id}`,
    maxOf: () => 1,
  });
  const withdrawMaterialLines = cartLines(withdrawCart, currentMaterialStored, {
    keyOf: s => `mat:${s.name}`,
    maxOf: s => s.amount,
    hardCap: Infinity,
  });
  /** 取出要占背包欄位：裝備每件一格，物品只有背包沒有的品項才需要新格子 */
  const withdrawNeedSlots =
    withdrawEquipLines.length +
    withdrawMaterialLines.filter(l => !bagItems.some(b => b.name === l.item.name)).length;
  const withdrawHint = withdrawNeedSlots > freeSlots ? '背包欄位不足' : null;

  function executeWithdraw() {
    if (withdrawEquipLines.length === 0 && withdrawMaterialLines.length === 0) return;
    if (withdrawHint) return;
    // 取出的裝備要掛回自己名下，沒有角色就不動
    if (!character && withdrawEquipLines.length > 0) return;
    const state = useGameStore.getState();
    let inv = state.inventory;
    let bag = state.bagItems;
    let equip = isShared ? state.storedEquipment : state.personalStoredEquipment;
    let materials = isShared ? state.storedMaterials : state.personalStoredMaterials;

    for (const line of withdrawEquipLines) {
      const item = line.item;
      // 共用倉庫取出時要把 ownerId 改回自己，個人倉庫本來就是自己的
      const changes = isShared
        ? { inStorage: false, storageType: undefined, ownerId: character!.id! }
        : { inStorage: false, storageType: undefined };
      equip = equip.filter(i => i.id !== item.id);
      inv = [...inv, { ...item, ...changes }];
      db.equipmentInstances.update(item.id!, changes);
    }

    for (const line of withdrawMaterialLines) {
      const held = materials.find(s => s.name === line.item.name);
      if (!held) continue;
      const actual = Math.min(line.qty, held.amount);
      if (actual <= 0) continue;
      materials = takeMaterial(materials, line.item.name, actual);
      bag = mergeMaterial(bag, line.item, actual);
    }

    useGameStore.setState({ inventory: inv, bagItems: bag, ...storagePatch(equip, materials) });
    state.saveState();
    withdrawCart.clear();
  }

  /** 過濾中時所有分區共用同一句提示，避免誤以為東西不見了 */
  const emptyText = (fallback: string) => (isFiltering ? `沒有符合「${search.trim()}」的項目` : fallback);

  function itemIcon(name: string) {
    const { icon, color } = resolveItemIcon(getItemDefinition(name), name.includes('卷軸') ? 'scroll' : 'material');
    return <GameIcon name={icon} size={16} color={color} />;
  }

  /** 可堆疊物品的一列（存入／取出共用） */
  function materialRow(item: BagItem, cart: ReturnType<typeof useShopCart>) {
    return (
      <div key={item.name} className="storage-item">
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {itemIcon(item.name)}{item.name} ×{item.amount} (重量: {getItemWeight(item.name) * item.amount})
        </span>
        <div className="storage-item-actions">
          <QtyStepper
            label={item.name}
            value={cart.raw(`mat:${item.name}`)}
            max={item.amount}
            min={0}
            hardCap={Infinity}
            showMax
            onChange={next => cart.set(`mat:${item.name}`, next)}
          />
        </div>
      </div>
    );
  }

  /** 裝備的一列：唯一實例，數量上限固定 1，介面與物品列一致 */
  function equipRow(item: EquipmentInstance, cart: ReturnType<typeof useShopCart>) {
    return (
      <div key={item.id} className="storage-item">
        <EquipmentDetail item={item} templates={templates} />
        <div className="storage-item-actions">
          <QtyStepper
            label={`${item.name} #${item.id}`}
            value={cart.raw(`eq:${item.id}`)}
            max={1}
            min={0}
            onChange={next => cart.set(`eq:${item.id}`, next)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="storage-panel">
      <p className="shop-greeting">「需要存放東西嗎？」</p>

      <div className="storage-tabs">
        {/* 換倉庫等於換一份清單，已選數量不該跟著跑到另一個倉庫的同名物品上 */}
        <button className={storageTab === 'shared' ? 'active' : ''} onClick={() => switchStorage('shared')}>共用倉庫</button>
        <button className={storageTab === 'personal' ? 'active' : ''} onClick={() => switchStorage('personal')}>個人倉庫</button>
      </div>

      {isShared && (
        <div className="storage-gold-section">
          <span className="storage-gold-label">倉庫金幣：{warehouseGold} G</span>
          <span className="storage-gold-label">身上金幣：{character?.gold ?? 0} G</span>
          <div className="storage-gold-controls">
            <input
              type="number"
              min="1"
              value={goldAmount}
              onChange={e => setGoldAmount(e.target.value)}
              placeholder="金額"
              className="gold-input"
            />
            <button onClick={depositGold} disabled={!character || character.gold <= 0}>存入</button>
            <button onClick={withdrawGold} disabled={warehouseGold <= 0}>取出</button>
          </div>
        </div>
      )}

      <div className="storage-tabs">
        <button className={actionTab === 'deposit' ? 'active' : ''} onClick={() => setActionTab('deposit')}>存入物品</button>
        <button className={actionTab === 'withdraw' ? 'active' : ''} onClick={() => setActionTab('withdraw')}>取出物品</button>
      </div>

      <div className="storage-search">
        <input
          type="text"
          className="storage-search-input"
          aria-label="搜尋物品名稱"
          placeholder="搜尋物品名稱…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {isFiltering && (
          <button
            type="button"
            className="storage-search-clear"
            aria-label="清除搜尋"
            onClick={() => setSearch('')}
          >
            ✕
          </button>
        )}
      </div>

      {/* 只有物品清單會捲動，分頁／金幣／搜尋固定在上方 */}
      <div className="panel-scroll">
      {actionTab === 'deposit' && (
        <div className="storage-content">
          <h4>背包裝備 ({bagEquipment.length})</h4>
          {bagEquipment.length === 0 && <p className="empty-text">{emptyText('無裝備可存入')}</p>}
          {bagEquipment.map(item => equipRow(item, depositCart))}

          <h4>背包藥水</h4>
          {potionItems.length === 0 && <p className="empty-text">{emptyText('無藥水可存入')}</p>}
          {potionItems.map(item => materialRow(item, depositCart))}

          <h4>背包材料</h4>
          {nonPotionItems.length === 0 && <p className="empty-text">{emptyText('無材料可存入')}</p>}
          {nonPotionItems.map(item => materialRow(item, depositCart))}
        </div>
      )}

      {actionTab === 'withdraw' && (
        <div className="storage-content">
          <h4>倉庫裝備 ({storedEquipList.length})</h4>
          {storedEquipList.length === 0 && <p className="empty-text">{emptyText('倉庫空空如也')}</p>}
          {storedEquipList.map(item => equipRow(item, withdrawCart))}

          <h4>倉庫藥水</h4>
          {storedPotions.length === 0 && <p className="empty-text">{emptyText('無藥水')}</p>}
          {storedPotions.map(item => materialRow(item, withdrawCart))}

          <h4>倉庫材料</h4>
          {storedNonPotions.length === 0 && <p className="empty-text">{emptyText('無材料')}</p>}
          {storedNonPotions.map(item => materialRow(item, withdrawCart))}
        </div>
      )}
      </div>

      {/* 動作列固定在面板底部，全視窗只有這一顆執行鈕（§ 34.1） */}
      {actionTab === 'deposit' ? (
        <ShopCartFooter
          summary={storageSummary(depositEquipLines, depositMaterialLines)}
          actionLabel="存入"
          disabled={depositEquipLines.length === 0 && depositMaterialLines.length === 0}
          onAction={executeDeposit}
        />
      ) : (
        <ShopCartFooter
          summary={storageSummary(withdrawEquipLines, withdrawMaterialLines)}
          actionLabel="取出"
          hint={withdrawHint}
          disabled={
            (withdrawEquipLines.length === 0 && withdrawMaterialLines.length === 0) || !!withdrawHint
          }
          onAction={executeWithdraw}
        />
      )}
    </div>
  );
}
