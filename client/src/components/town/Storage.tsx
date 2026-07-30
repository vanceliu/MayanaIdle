import { useState } from 'react';
import { useGameStore, getBagUsedSlots, BAG_MAX_SLOTS } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { BagItem } from '../../stores/gameStore';
import { EquipmentDetail } from '../EquipmentInfo';
import { GameIcon } from '../GameIcon';
import { resolveItemIcon } from '../../models/iconMap';
import { getItemWeight, getItemDefinition } from '../../models/items';
import { db } from '../../db/database';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';

type StorageTab = 'personal' | 'shared';
type ActionTab = 'deposit' | 'withdraw';

export function Storage() {
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
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
  const templates = useEquipmentTemplates();

  // --- Shared warehouse equipment ---
  function depositEquipShared(item: EquipmentInstance) {
    if (!userId) return;
    if (item.isStarterGear) return;
    const inv = useGameStore.getState().inventory;
    const stored = useGameStore.getState().storedEquipment;
    useGameStore.setState({
      inventory: inv.filter(i => i.id !== item.id),
      storedEquipment: [...stored, { ...item, inStorage: true, storageType: 'shared', ownerId: userId }],
    });
    db.equipmentInstances.update(item.id!, { inStorage: true, storageType: 'shared', ownerId: userId });
    useGameStore.getState().saveState();
  }

  function withdrawEquipShared(item: EquipmentInstance) {
    if (!character) return;
    const inv = useGameStore.getState().inventory;
    const bag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(bag, inv) >= BAG_MAX_SLOTS) return;
    const stored = useGameStore.getState().storedEquipment;
    useGameStore.setState({
      storedEquipment: stored.filter(i => i.id !== item.id),
      inventory: [...inv, { ...item, inStorage: false, storageType: undefined, ownerId: character.id! }],
    });
    db.equipmentInstances.update(item.id!, { inStorage: false, storageType: undefined, ownerId: character.id! });
    useGameStore.getState().saveState();
  }

  // --- Personal warehouse equipment ---
  function depositEquipPersonal(item: EquipmentInstance) {
    if (!character) return;
    if (item.isStarterGear) return;
    const inv = useGameStore.getState().inventory;
    const stored = useGameStore.getState().personalStoredEquipment;
    useGameStore.setState({
      inventory: inv.filter(i => i.id !== item.id),
      personalStoredEquipment: [...stored, { ...item, inStorage: true, storageType: 'personal' }],
    });
    db.equipmentInstances.update(item.id!, { inStorage: true, storageType: 'personal', ownerId: character.id! });
    useGameStore.getState().saveState();
  }

  function withdrawEquipPersonal(item: EquipmentInstance) {
    if (!character) return;
    const inv = useGameStore.getState().inventory;
    const bag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(bag, inv) >= BAG_MAX_SLOTS) return;
    const stored = useGameStore.getState().personalStoredEquipment;
    useGameStore.setState({
      personalStoredEquipment: stored.filter(i => i.id !== item.id),
      inventory: [...inv, { ...item, inStorage: false, storageType: undefined }],
    });
    db.equipmentInstances.update(item.id!, { inStorage: false, storageType: undefined });
    useGameStore.getState().saveState();
  }

  // --- Shared warehouse materials ---
  function depositMaterialShared(item: BagItem, amount: number) {
    const bag = useGameStore.getState().bagItems;
    const stored = useGameStore.getState().storedMaterials;
    const actual = Math.min(amount, item.amount);
    if (actual <= 0) return;

    const newBag = bag.map(b =>
      b.name === item.name ? { ...b, amount: b.amount - actual } : b
    ).filter(b => b.amount > 0);

    const existing = stored.find(s => s.name === item.name);
    const newStored = existing
      ? stored.map(s => s.name === item.name ? { ...s, amount: s.amount + actual } : s)
      : [...stored, { ...item, amount: actual }];

    useGameStore.setState({ bagItems: newBag, storedMaterials: newStored });
    useGameStore.getState().saveState();
  }

  function withdrawMaterialShared(item: BagItem, amount: number) {
    const bag = useGameStore.getState().bagItems;
    const inv = useGameStore.getState().inventory;
    const stored = useGameStore.getState().storedMaterials;
    const actual = Math.min(amount, item.amount);
    if (actual <= 0) return;

    const existing = bag.find(b => b.name === item.name);
    if (!existing && getBagUsedSlots(bag, inv) >= BAG_MAX_SLOTS) return;

    const newStored = stored.map(s =>
      s.name === item.name ? { ...s, amount: s.amount - actual } : s
    ).filter(s => s.amount > 0);

    const newBag = existing
      ? bag.map(b => b.name === item.name ? { ...b, amount: b.amount + actual } : b)
      : [...bag, { ...item, amount: actual }];

    useGameStore.setState({ bagItems: newBag, storedMaterials: newStored });
    useGameStore.getState().saveState();
  }

  // --- Personal warehouse materials ---
  function depositMaterialPersonal(item: BagItem, amount: number) {
    const bag = useGameStore.getState().bagItems;
    const stored = useGameStore.getState().personalStoredMaterials;
    const actual = Math.min(amount, item.amount);
    if (actual <= 0) return;

    const newBag = bag.map(b =>
      b.name === item.name ? { ...b, amount: b.amount - actual } : b
    ).filter(b => b.amount > 0);

    const existing = stored.find(s => s.name === item.name);
    const newStored = existing
      ? stored.map(s => s.name === item.name ? { ...s, amount: s.amount + actual } : s)
      : [...stored, { ...item, amount: actual }];

    useGameStore.setState({ bagItems: newBag, personalStoredMaterials: newStored });
    useGameStore.getState().saveState();
  }

  function withdrawMaterialPersonal(item: BagItem, amount: number) {
    const bag = useGameStore.getState().bagItems;
    const inv = useGameStore.getState().inventory;
    const stored = useGameStore.getState().personalStoredMaterials;
    const actual = Math.min(amount, item.amount);
    if (actual <= 0) return;

    const existing = bag.find(b => b.name === item.name);
    if (!existing && getBagUsedSlots(bag, inv) >= BAG_MAX_SLOTS) return;

    const newStored = stored.map(s =>
      s.name === item.name ? { ...s, amount: s.amount - actual } : s
    ).filter(s => s.amount > 0);

    const newBag = existing
      ? bag.map(b => b.name === item.name ? { ...b, amount: b.amount + actual } : b)
      : [...bag, { ...item, amount: actual }];

    useGameStore.setState({ bagItems: newBag, personalStoredMaterials: newStored });
    useGameStore.getState().saveState();
  }

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

  const isShared = storageTab === 'shared';
  const currentEquipStored = isShared ? storedEquipment : personalStoredEquipment;
  const currentMaterialStored = isShared ? storedMaterials : personalStoredMaterials;
  const depositEquip = isShared ? depositEquipShared : depositEquipPersonal;
  const withdrawEquip = isShared ? withdrawEquipShared : withdrawEquipPersonal;
  const depositMaterial = isShared ? depositMaterialShared : depositMaterialPersonal;
  const withdrawMaterial = isShared ? withdrawMaterialShared : withdrawMaterialPersonal;

  const potionItems = bagItems.filter(b => b.type === 'potion');
  const nonPotionItems = bagItems.filter(b => b.type !== 'potion');
  const storedPotions = currentMaterialStored.filter(s => s.type === 'potion');
  const storedNonPotions = currentMaterialStored.filter(s => s.type !== 'potion');

  return (
    <div className="storage-panel">
      <p className="shop-greeting">「需要存放東西嗎？」</p>

      <div className="storage-tabs">
        <button className={storageTab === 'shared' ? 'active' : ''} onClick={() => setStorageTab('shared')}>共用倉庫</button>
        <button className={storageTab === 'personal' ? 'active' : ''} onClick={() => setStorageTab('personal')}>個人倉庫</button>
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

      {actionTab === 'deposit' && (
        <div className="storage-content">
          <h4>背包裝備 ({inventory.filter(i => !i.isStarterGear).length})</h4>
          {inventory.filter(i => !i.isStarterGear).length === 0 && <p className="empty-text">無裝備可存入</p>}
          {inventory.filter(i => !i.isStarterGear).map(item => (
            <div key={item.id} className="storage-item">
              <EquipmentDetail item={item} templates={templates} />
              <div className="storage-item-actions">
                <button onClick={() => depositEquip(item)}>存入</button>
              </div>
            </div>
          ))}

          <h4>背包藥水</h4>
          {potionItems.length === 0 && <p className="empty-text">無藥水可存入</p>}
          {potionItems.map(item => (
            <div key={item.name} className="storage-item">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{(() => { const { icon, color } = resolveItemIcon(getItemDefinition(item.name), item.name.includes('卷軸') ? 'scroll' : 'material'); return <GameIcon name={icon} size={16} color={color} />; })()}{item.name} ×{item.amount} (重量: {getItemWeight(item.name) * item.amount})</span>
              <div className="storage-item-actions">
                <button onClick={() => depositMaterial(item, 1)}>存1</button>
                <button onClick={() => depositMaterial(item, 10)}>存10</button>
                <button onClick={() => depositMaterial(item, item.amount)}>全部</button>
              </div>
            </div>
          ))}

          <h4>背包材料</h4>
          {nonPotionItems.length === 0 && <p className="empty-text">無材料可存入</p>}
          {nonPotionItems.map(item => (
            <div key={item.name} className="storage-item">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{(() => { const { icon, color } = resolveItemIcon(getItemDefinition(item.name), item.name.includes('卷軸') ? 'scroll' : 'material'); return <GameIcon name={icon} size={16} color={color} />; })()}{item.name} ×{item.amount} (重量: {getItemWeight(item.name) * item.amount})</span>
              <div className="storage-item-actions">
                <button onClick={() => depositMaterial(item, 1)}>存1</button>
                <button onClick={() => depositMaterial(item, 10)}>存10</button>
                <button onClick={() => depositMaterial(item, item.amount)}>全部</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {actionTab === 'withdraw' && (
        <div className="storage-content">
          <h4>倉庫裝備 ({currentEquipStored.length})</h4>
          {currentEquipStored.length === 0 && <p className="empty-text">倉庫空空如也</p>}
          {currentEquipStored.map(item => (
            <div key={item.id} className="storage-item">
              <EquipmentDetail item={item} templates={templates} />
              <div className="storage-item-actions">
                <button onClick={() => withdrawEquip(item)}>取出</button>
              </div>
            </div>
          ))}

          <h4>倉庫藥水</h4>
          {storedPotions.length === 0 && <p className="empty-text">無藥水</p>}
          {storedPotions.map(item => (
            <div key={item.name} className="storage-item">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{(() => { const { icon, color } = resolveItemIcon(getItemDefinition(item.name), item.name.includes('卷軸') ? 'scroll' : 'material'); return <GameIcon name={icon} size={16} color={color} />; })()}{item.name} ×{item.amount} (重量: {getItemWeight(item.name) * item.amount})</span>
              <div className="storage-item-actions">
                <button onClick={() => withdrawMaterial(item, 1)}>取1</button>
                <button onClick={() => withdrawMaterial(item, 10)}>取10</button>
                <button onClick={() => withdrawMaterial(item, item.amount)}>全部</button>
              </div>
            </div>
          ))}

          <h4>倉庫材料</h4>
          {storedNonPotions.length === 0 && <p className="empty-text">無材料</p>}
          {storedNonPotions.map(item => (
            <div key={item.name} className="storage-item">
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{(() => { const { icon, color } = resolveItemIcon(getItemDefinition(item.name), item.name.includes('卷軸') ? 'scroll' : 'material'); return <GameIcon name={icon} size={16} color={color} />; })()}{item.name} ×{item.amount} (重量: {getItemWeight(item.name) * item.amount})</span>
              <div className="storage-item-actions">
                <button onClick={() => withdrawMaterial(item, 1)}>取1</button>
                <button onClick={() => withdrawMaterial(item, 10)}>取10</button>
                <button onClick={() => withdrawMaterial(item, item.amount)}>全部</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
