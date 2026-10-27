import { useEffect, useState } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { BagItem } from '../../stores/gameStore';
import { EquipmentDetail } from '../EquipmentInfo';
import { Tooltip } from '../Tooltip';
import { GameIcon } from '../GameIcon';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { getItemById } from '../../models/items';
import { hasBagItem } from '../../models/bagItem';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';
import { QtyStepper } from '../common/QtyStepper';
import { roundWeight } from '../../systems/weight';
import { isSigilItemId } from '../../models/sigil';
import { useShopCart, cartLines, type CartLine, ShopCartFooter } from '../common/ShopCart';
import { useGuildStore } from '../../stores/guildStore';
import { useMultiplayer } from '../../net/online';

/** 分頁順序：帳號 → 個人 → 公會（`13-town.md` § 13.8） */
type StorageTab = 'shared' | 'personal' | 'guild';
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
  const accountGold = useGameStore(s => s.warehouseGold);
  // 公會倉庫（`11-guild.md` § 11.8）：內容只在分頁開著時才有
  const multiplayer = useMultiplayer();
  const guild = useGuildStore(s => s.guild);
  const guildWarehouse = useGuildStore(s => s.warehouse);
  const guildMessage = useGuildStore(s => s.message);
  const openGuildWarehouse = useGuildStore(s => s.openWarehouse);
  const closeGuildWarehouse = useGuildStore(s => s.closeWarehouse);
  const [storageTab, setStorageTab] = useState<StorageTab>('shared');
  const [actionTab, setActionTab] = useState<ActionTab>('deposit');
  const [goldAmount, setGoldAmount] = useState('');
  // 購物車：清單只選數量，實際存取由底部單一按鈕執行（§ 34.1）
  const depositCart = useShopCart();
  const withdrawCart = useShopCart();
  const [search, setSearch] = useState('');
  const templates = useEquipmentTemplates();

  const isShared = storageTab === 'shared';
  const isGuild = storageTab === 'guild';
  const hasGold = isShared || isGuild;
  const warehouseGold = isGuild ? guildWarehouse?.gold ?? 0 : accountGold;
  const currentEquipStored = isGuild ? guildWarehouse?.equipment ?? [] : isShared ? storedEquipment : personalStoredEquipment;
  const currentMaterialStored = isGuild ? guildWarehouse?.items ?? [] : isShared ? storedMaterials : personalStoredMaterials;

  // 打開公會分頁才向 server 要內容；切走或關掉倉庫就釋放（§ 11.8）
  useEffect(() => {
    if (!isGuild) return;
    void openGuildWarehouse();
    return () => { void closeGuildWarehouse(); };
  }, [isGuild, openGuildWarehouse, closeGuildWarehouse]);

  // 在公會分頁時被踢或公會解散：退回帳號倉庫
  if (isGuild && !guild) setStorageTab('shared');

  // --- Gold（帳號與公會倉庫才有） ---
  /** 空字串／非數字一律當 0，不可讓 NaN 進到餘額運算（會把兩邊的金幣一起洗成 NaN） */
  const goldInput = Number.parseInt(goldAmount, 10);
  const goldInputValid = Number.isFinite(goldInput) && goldInput > 0;

  function depositGold() {
    if (!goldInputValid) return;
    if (isGuild) void useGuildStore.getState().depositWarehouseGold(goldInput);
    else useGameStore.getState().depositWarehouseGold(goldInput);
    setGoldAmount('');
  }

  function withdrawGold() {
    if (!goldInputValid) return;
    if (isGuild) void useGuildStore.getState().withdrawWarehouseGold(goldInput);
    else useGameStore.getState().withdrawWarehouseGold(goldInput);
    setGoldAmount('');
  }

  function switchStorage(next: StorageTab) {
    setStorageTab(next);
    depositCart.clear();
    withdrawCart.clear();
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
  // 印記獨立一區（§ 35.20），不與材料混列
  const bagMaterials = nonPotionItems.filter(b => !isSigilItemId(b.itemId));
  const bagSigils = nonPotionItems.filter(b => isSigilItemId(b.itemId));
  const storedEquipList = currentEquipStored.filter(i => matchesQuery(i.name));
  const storedPotions = currentMaterialStored.filter(s => s.type === 'potion' && matchesQuery(s.name));
  const storedNonPotions = currentMaterialStored.filter(s => s.type !== 'potion' && matchesQuery(s.name));
  const storedMaterialList = storedNonPotions.filter(s => !isSigilItemId(s.itemId));
  const storedSigils = storedNonPotions.filter(s => isSigilItemId(s.itemId));

  const freeSlots = getBagMaxSlots(equippedGear) - getBagUsedSlots(bagItems, inventory, equippedGear);

  // --- 存入頁購物車 ---
  const depositEquipLines = cartLines(depositCart, depositableEquip, {
    keyOf: i => `eq:${i.id}`,
    maxOf: () => 1,
  });
  const depositMaterialLines = cartLines(depositCart, bagItems, {
    keyOf: b => `mat:${b.itemId}`,
    maxOf: b => b.amount,
    // 持有量本身就是上限，倉庫不套用 999 硬上限
    hardCap: Infinity,
  });

  function executeDeposit() {
    if (depositEquipLines.length === 0 && depositMaterialLines.length === 0) return;
    const move = {
      equipmentIds: depositEquipLines.map(l => l.item.id!),
      materials: depositMaterialLines.map(l => ({ itemId: l.item.itemId, amount: l.qty })),
    };
    if (isGuild) void useGuildStore.getState().depositWarehouse(move);
    else useGameStore.getState().depositToWarehouse({ warehouse: storageTab as 'shared' | 'personal', ...move });
    depositCart.clear();
  }

  // --- 取出頁購物車 ---
  const withdrawEquipLines = cartLines(withdrawCart, currentEquipStored, {
    keyOf: i => `eq:${i.id}`,
    maxOf: () => 1,
  });
  const withdrawMaterialLines = cartLines(withdrawCart, currentMaterialStored, {
    keyOf: s => `mat:${s.itemId}`,
    maxOf: s => s.amount,
    hardCap: Infinity,
  });
  /**
   * 取出要占背包欄位：裝備每件一格，物品只有背包沒有的品項才需要新格子。
   * 印記不佔格（§ 35.20），取多少都不用算。
   */
  const withdrawNeedSlots =
    withdrawEquipLines.length +
    withdrawMaterialLines.filter(
      l => !isSigilItemId(l.item.itemId) && !hasBagItem(bagItems, l.item.itemId),
    ).length;
  const withdrawHint = withdrawNeedSlots > freeSlots ? '背包欄位不足' : null;

  function executeWithdraw() {
    if (withdrawEquipLines.length === 0 && withdrawMaterialLines.length === 0) return;
    if (withdrawHint) return;
    const move = {
      equipmentIds: withdrawEquipLines.map(l => l.item.id!),
      materials: withdrawMaterialLines.map(l => ({ itemId: l.item.itemId, amount: l.qty })),
    };
    if (isGuild) void useGuildStore.getState().withdrawWarehouse(move);
    else useGameStore.getState().withdrawFromWarehouse({ warehouse: storageTab as 'shared' | 'personal', ...move });
    withdrawCart.clear();
  }

  /** 過濾中時所有分區共用同一句提示，避免誤以為東西不見了 */
  const emptyText = (fallback: string) => (isFiltering ? `沒有符合「${search.trim()}」的項目` : fallback);

  function itemIcon(itemId: number) {
    const def = getItemById(itemId);
    const fallback = def?.category === 'scroll' || def?.category === 'dungeon' ? 'scroll' : 'material';
    const { icon, color, glowClass } = resolveItemIcon(def, fallback);
    return <GameIcon name={icon} size={16} color={color} className={glowClass} />;
  }

  /** 可堆疊物品的一列（存入／取出共用） */
  function materialRow(item: BagItem, cart: ReturnType<typeof useShopCart>) {
    return (
      <div key={item.itemId} className="storage-item">
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* 小數重量乘上數量會留浮點尾數並直接印出來，一律先收過 */}
          {itemIcon(item.itemId)}{item.name} ×{item.amount} (重量: {roundWeight((getItemById(item.itemId)?.weight ?? 0) * item.amount)})
        </span>
        <div className="storage-item-actions">
          <QtyStepper
            label={item.name}
            value={cart.raw(`mat:${item.itemId}`)}
            max={item.amount}
            min={0}
            hardCap={Infinity}
            showMax
            onChange={next => cart.set(`mat:${item.itemId}`, next)}
          />
        </div>
      </div>
    );
  }

  /** 裝備的一列：只印 icon + 名稱，完整內容走 hover tooltip；唯一實例，數量上限固定 1 */
  function equipRow(item: EquipmentInstance, cart: ReturnType<typeof useShopCart>) {
    const tierColor = getEquipmentInstanceTierColor(item, templates);
    const enhancement = item.enhancement ?? 0;
    return (
      <div key={item.id} className="storage-item">
        <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>
          <span className="storage-equip-name" style={{ color: tierColor }}>
            <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={tierColor} />
            {item.name}{enhancement > 0 ? ` +${enhancement}` : ''}
          </span>
        </Tooltip>
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
        <button className={storageTab === 'shared' ? 'active' : ''} onClick={() => switchStorage('shared')}>帳號倉庫</button>
        <button className={storageTab === 'personal' ? 'active' : ''} onClick={() => switchStorage('personal')}>個人倉庫</button>
        {/* § 11.8：單機世界不顯示；沒有公會時變暗、點了沒反應 */}
        {multiplayer && (
          <button
            className={`${isGuild ? 'active' : ''}${guild ? '' : ' is-unavailable'}`}
            aria-disabled={!guild}
            title={guild ? undefined : '加入公會後可使用'}
            onClick={() => { if (guild) switchStorage('guild'); }}
          >
            公會倉庫
          </button>
        )}
      </div>

      {isGuild && guildWarehouse && (
        <div className="storage-capacity">已用 {guildWarehouse.used} / {guildWarehouse.capacity} 格</div>
      )}
      {isGuild && guildMessage && <div className="party-message" role="status">{guildMessage}</div>}

      {hasGold && (
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
            <button onClick={depositGold} disabled={!goldInputValid || !character || character.gold <= 0}>存入</button>
            <button onClick={withdrawGold} disabled={!goldInputValid || warehouseGold <= 0}>取出</button>
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
          {bagMaterials.length === 0 && <p className="empty-text">{emptyText('無材料可存入')}</p>}
          {bagMaterials.map(item => materialRow(item, depositCart))}

          <h4>背包印記</h4>
          {bagSigils.length === 0 && <p className="empty-text">{emptyText('無印記可存入')}</p>}
          {bagSigils.map(item => materialRow(item, depositCart))}
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
          {storedMaterialList.length === 0 && <p className="empty-text">{emptyText('無材料')}</p>}
          {storedMaterialList.map(item => materialRow(item, withdrawCart))}

          <h4>倉庫印記</h4>
          {storedSigils.length === 0 && <p className="empty-text">{emptyText('無印記')}</p>}
          {storedSigils.map(item => materialRow(item, withdrawCart))}
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
