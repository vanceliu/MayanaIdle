import { useState, useEffect } from 'react';
import { useGameStore, getBagUsedSlots, BAG_MAX_SLOTS } from '../../stores/gameStore';
import type { EquipmentInstance, EquipSlot, EquipmentTemplate } from '../../models/equipment';
import { isWeaponSlot } from '../../models/equipment';
import { AFFIX_DEFINITIONS, AFFIX_TIERS, rollAffixValue, getAffixPoolForSlot, type AffixCategory, type Affix } from '../../models/affix';
import { CRAFT_TIER_NAMES } from '../../models/crafting';
import { EquipmentDetail } from '../EquipmentInfo';
import { CLASS_NAMES_ZH } from '../../models/character';
import { db } from '../../db/database';
import { resolveEquipment } from '../../systems/templateSync';

const SLOT_NAMES: Record<EquipSlot, string> = {
  rightHand: '右手',
  leftHand: '左手',
  helmet: '頭盔',
  chest: '胸甲',
  belt: '腰帶',
  gloves: '手套',
  boots: '鞋子',
  necklace: '項鍊',
  ring1: '戒指1',
  ring2: '戒指2',
};

const QUALITY_COST = 50000;
const QUALITY_MAX = 20;

type Tab = 'enhance' | 'quality' | 'affix' | 'craft';

function getWeaponEnhanceRate(targetLevel: number, stability: number): number {
  if (targetLevel <= stability) return 1.0;
  return 1 / 3;
}

function getArmorEnhanceRate(targetLevel: number, stability: number): number {
  if (targetLevel <= stability) return 1.0;
  return 1 / (targetLevel - 1);
}

function isWeapon(item: EquipmentInstance): boolean {
  return !!item.smallMonsterDamage;
}

function getStability(item: EquipmentInstance): number {
  if (isWeapon(item)) return item.stability ?? 6;
  if (item.stability != null) return item.stability;
  return 4;
}

function generateCraftAffixes(category: AffixCategory): Affix[] {
  const pool = getAffixPoolForSlot(category);
  const available = [...pool];
  const affixes: Affix[] = [];
  const slotCount = Math.min(4, available.length);
  for (let i = 0; i < slotCount; i++) {
    const idx = Math.floor(Math.random() * available.length);
    const def = available.splice(idx, 1)[0];
    const tier = Math.floor(Math.random() * 5) + 1;
    const value = rollAffixValue(tier);
    affixes.push({ type: def.type, tier, value });
  }
  return affixes;
}

export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const [tab, setTab] = useState<Tab>('enhance');
  const [_selectedItem, _setSelectedItem] = useState<{ item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot } | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<EquipmentTemplate | null>(null);
  const [craftTemplates, setCraftTemplates] = useState<EquipmentTemplate[]>([]);
  const [craftCategory, setCraftCategory] = useState<string>('sword');
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  useEffect(() => {
    db.equipmentTemplates
      .filter(t => t.acquireType === 'craft')
      .toArray()
      .then(arr => setCraftTemplates(arr.sort((a, b) => (a.craftGold ?? 0) - (b.craftGold ?? 0))));
  }, []);

  if (!char) return null;

  const qualityStones = bagItems.find(b => b.name === '品質石')?.amount ?? 0;
  const weaponScrolls = bagItems.find(b => b.name === '武器強化卷軸')?.amount ?? 0;
  const armorScrolls = bagItems.find(b => b.name === '防具強化卷軸')?.amount ?? 0;
  const enhanceStones = bagItems.find(b => b.name === '強化石')?.amount ?? 0;

  const allItems: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }[] = [];

  for (const [slot, item] of Object.entries(equippedGear)) {
    if (item) {
      allItems.push({ item, source: 'equipped', slot: slot as EquipSlot });
    }
  }
  for (const item of inventory) {
    allItems.push({ item, source: 'bag' });
  }

  function consumeBagItem(name: string) {
    const currentBag = useGameStore.getState().bagItems;
    return currentBag.map(b =>
      b.name === name ? { ...b, amount: b.amount - 1 } : b
    ).filter(b => b.amount > 0);
  }

  function persistBagItem(name: string, newAmount: number) {
    if (!char?.id) return;
    if (newAmount <= 0) {
      db.characterBag.where({ characterId: char.id, name }).delete();
    } else {
      db.characterBag.where({ characterId: char.id, name }).modify({ amount: newAmount });
    }
  }

  function persistEquipment(item: EquipmentInstance) {
    if (!item.id) return;
    db.equipmentInstances.update(item.id, {
      enhancement: item.enhancement,
      quality: item.quality,
      affixes: item.affixes,
    });
  }

  function handleEnhance(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    if (!char) return;
    const { item, source, slot } = entry;
    const nextLevel = (item.enhancement ?? 0) + 1;

    const itemIsWeapon = isWeapon(item);
    const scrollName = itemIsWeapon ? '武器強化卷軸' : '防具強化卷軸';
    const scrollCount = itemIsWeapon ? weaponScrolls : armorScrolls;
    if (scrollCount <= 0) return;

    const stability = getStability(item);
    const rate = itemIsWeapon
      ? getWeaponEnhanceRate(nextLevel, stability)
      : getArmorEnhanceRate(nextLevel, stability);

    const success = Math.random() < rate;
    const newBag = consumeBagItem(scrollName);
    const remainingScrolls = (itemIsWeapon ? weaponScrolls : armorScrolls) - 1;
    persistBagItem(scrollName, remainingScrolls);

    if (success) {
      const updatedItem = { ...item, enhancement: nextLevel };
      persistEquipment(updatedItem);
      if (source === 'equipped' && slot) {
        const gear = { ...equippedGear, [slot]: updatedItem };
        useGameStore.setState({ equippedGear: gear, bagItems: newBag });
      } else {
        const newInv = inventory.map(i => i.id === item.id ? updatedItem : i);
        useGameStore.setState({ inventory: newInv, bagItems: newBag });
      }
      setResultMsg(`強化成功！${item.name} +${nextLevel}`);
    } else {
      if (item.id) db.equipmentInstances.delete(item.id);
      if (source === 'equipped' && slot) {
        const gear = { ...equippedGear, [slot]: null };
        useGameStore.setState({ equippedGear: gear, bagItems: newBag });
      } else {
        const newInv = inventory.filter(i => i.id !== item.id);
        useGameStore.setState({ inventory: newInv, bagItems: newBag });
      }
      setResultMsg(`強化失敗！${item.name} 已損毀...`);
    }
    useGameStore.getState().saveState();
  }

  function handleQualityUp(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    if (!char) return;
    const { item, source, slot } = entry;
    if ((item.quality ?? 0) >= QUALITY_MAX) return;
    if (qualityStones <= 0) return;
    if (char.gold < QUALITY_COST) return;

    const newQuality = (item.quality ?? 0) + 1;
    const newGold = char.gold - QUALITY_COST;
    const updatedItem = { ...item, quality: newQuality };
    const updatedChar = { ...char, gold: newGold };
    const newBag = consumeBagItem('品質石');

    persistEquipment(updatedItem);
    persistBagItem('品質石', qualityStones - 1);
    if (char.id) db.characters.update(char.id, { gold: newGold });

    if (source === 'equipped' && slot) {
      const gear = { ...equippedGear, [slot]: updatedItem };
      useGameStore.setState({ character: updatedChar, equippedGear: gear, bagItems: newBag });
    } else {
      const newInv = inventory.map(i => i.id === item.id ? updatedItem : i);
      useGameStore.setState({ character: updatedChar, inventory: newInv, bagItems: newBag });
    }

    setResultMsg(`品質提升！${updatedItem.name} 品質 ${newQuality}%`);
    useGameStore.getState().saveState();
  }

  function handleAffixEnhance(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }, affixIdx: number) {
    if (!char) return;
    if (enhanceStones <= 0) return;
    const { item, source, slot } = entry;
    if (!item.affixes || !item.affixes[affixIdx]) return;

    const affix = item.affixes[affixIdx];
    if (affix.tier >= 5) return;

    const newTier = affix.tier + 1;
    const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);

    const tierDef = AFFIX_TIERS.find(t => t.tier === newTier);
    if (!tierDef) return;
    const newValue = Math.floor(Math.random() * (tierDef.max - tierDef.min + 1)) + tierDef.min;

    const newAffixes = [...item.affixes];
    newAffixes[affixIdx] = { ...affix, tier: newTier, value: newValue };
    const updatedItem = { ...item, affixes: newAffixes };
    const newBag = consumeBagItem('強化石');

    persistEquipment(updatedItem);
    persistBagItem('強化石', enhanceStones - 1);

    if (source === 'equipped' && slot) {
      const gear = { ...equippedGear, [slot]: updatedItem };
      useGameStore.setState({ equippedGear: gear, bagItems: newBag });
    } else {
      const newInv = inventory.map(i => i.id === item.id ? updatedItem : i);
      useGameStore.setState({ inventory: newInv, bagItems: newBag });
    }

    setResultMsg(`詞綴強化成功！${def?.name} 升至 T${newTier} (+${newValue}%)`);
    useGameStore.getState().saveState();
  }

  function canCraftRecipe(recipe: EquipmentTemplate): boolean {
    if (!char) return false;
    if (!recipe.craftGold || char.gold < recipe.craftGold) return false;
    if (!recipe.craftMaterials) return false;
    for (const mat of recipe.craftMaterials) {
      const have = bagItems.find(b => b.name === mat.name)?.amount ?? 0;
      if (have < mat.amount) return false;
    }
    return true;
  }

  async function handleCraft() {
    if (!selectedRecipe || !char) return;
    if (!canCraftRecipe(selectedRecipe)) return;
    if (!selectedRecipe.craftMaterials || !selectedRecipe.craftGold) return;
    const currentInv = useGameStore.getState().inventory;
    const currentBag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(currentBag, currentInv) >= BAG_MAX_SLOTS) return;

    let newBag = [...useGameStore.getState().bagItems];
    for (const mat of selectedRecipe.craftMaterials) {
      const current = newBag.find(b => b.name === mat.name);
      const newAmount = (current?.amount ?? 0) - mat.amount;
      persistBagItem(mat.name, newAmount);
      newBag = newBag.map(b =>
        b.name === mat.name ? { ...b, amount: b.amount - mat.amount } : b
      ).filter(b => b.amount > 0);
    }

    const newGold = char.gold - selectedRecipe.craftGold;
    if (char.id) db.characters.update(char.id, { gold: newGold });

    const affixCategory: AffixCategory = selectedRecipe.type === 'shield' ? 'shield'
      : isWeaponSlot(selectedRecipe.slot) ? 'weapon' : 'armor';
    const craftedAffixes = generateCraftAffixes(affixCategory);

    const dbRecord = {
      templateId: selectedRecipe.id!,
      slot: selectedRecipe.slot,
      quality: 0,
      enhancement: 0,
      stability: selectedRecipe.stability ?? (isWeaponSlot(selectedRecipe.slot) ? 6 : 4),
      affixes: craftedAffixes,
      ownerId: char.id!,
      equipped: false,
    };

    const id = char.id ? await db.equipmentInstances.add(dbRecord as any) : undefined;

    const newEquip: EquipmentInstance = resolveEquipment({
      id: id as number,
      templateId: selectedRecipe.id!,
      name: selectedRecipe.name,
      type: selectedRecipe.type,
      slot: selectedRecipe.slot,
      isTwoHanded: selectedRecipe.isTwoHanded,
      quality: 0,
      enhancement: 0,
      stability: selectedRecipe.stability ?? (isWeaponSlot(selectedRecipe.slot) ? 6 : 4),
      affixes: craftedAffixes,
      ownerId: char.id!,
      equipped: false,
    });

    const newInv = [...useGameStore.getState().inventory, newEquip];
    useGameStore.setState({
      character: { ...char, gold: newGold },
      bagItems: newBag,
      inventory: newInv,
    });

    setResultMsg(`製作成功！獲得 ${selectedRecipe.name}`);
    useGameStore.getState().saveState();
  }

  function renderEnhanceActions(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    const { item } = entry;
    const stability = getStability(item);
    if (stability < 0) {
      return (
        <div className="shop-item-actions">
          <span className="bs-action-cost">不可強化</span>
        </div>
      );
    }
    const nextLevel = (item.enhancement ?? 0) + 1;
    const itemIsWeapon = isWeapon(item);
    const scrollName = itemIsWeapon ? '武器卷' : '防具卷';
    const scrollCount = itemIsWeapon ? weaponScrolls : armorScrolls;
    const rate = itemIsWeapon
      ? getWeaponEnhanceRate(nextLevel, stability)
      : getArmorEnhanceRate(nextLevel, stability);
    const isSafe = nextLevel <= stability;

    return (
      <div className="shop-item-actions bs-actions">
        <div className="bs-action-summary">
          <span className="bs-action-cost">{scrollName}×1</span>
          <span className="bs-action-rate">{isSafe ? '100%' : `${Math.floor(rate * 100)}%`}</span>
          {!isSafe && <span className="bs-action-warn">失敗消失</span>}
        </div>
        <button onClick={() => handleEnhance(entry)} disabled={scrollCount <= 0}>
          +{item.enhancement ?? 0} → +{nextLevel}
        </button>
      </div>
    );
  }

  function renderQualityActions(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    const { item } = entry;
    const currentQuality = item.quality ?? 0;
    if (currentQuality >= QUALITY_MAX) {
      return (
        <div className="shop-item-actions">
          <span className="bs-action-cost">已滿 20%</span>
        </div>
      );
    }
    return (
      <div className="shop-item-actions bs-actions">
        <div className="bs-action-summary">
          <span className="bs-action-cost">品質石×1 + 50,000G</span>
        </div>
        <button
          onClick={() => handleQualityUp(entry)}
          disabled={char!.gold < QUALITY_COST || qualityStones <= 0}
        >
          {currentQuality}% → {currentQuality + 1}%
        </button>
      </div>
    );
  }

  function renderAffixActions(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    const { item } = entry;
    const affixes = item.affixes;
    if (!affixes || affixes.length === 0) {
      return (
        <div className="shop-item-actions">
          <span className="bs-action-cost">無詞綴</span>
        </div>
      );
    }
    return (
      <div className="shop-item-actions bs-actions">
        <div className="bs-affix-list">
          {affixes.map((affix, i) => {
            const def = AFFIX_DEFINITIONS.find(d => d.type === affix.type);
            const canEnhance = affix.tier < 5 && enhanceStones > 0;
            return (
              <div key={i} className="bs-affix-row">
                <span className={`affix-tag tier-${affix.tier}`}>
                  {def?.name} T{affix.tier}
                </span>
                <button
                  className="bs-affix-btn"
                  onClick={() => handleAffixEnhance(entry, i)}
                  disabled={!canEnhance}
                >
                  {affix.tier >= 5 ? '已滿' : '強化'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="shop-panel blacksmith-panel">
      <p className="shop-greeting">「想強化什麼裝備？拿來讓我瞧瞧。」</p>
      <div className="bs-resources">
        <span>金幣: {char.gold.toLocaleString()}G</span>
        <span>品質石: {qualityStones}</span>
        <span>強化石: {enhanceStones}</span>
        <span>武器卷: {weaponScrolls}</span>
        <span>防具卷: {armorScrolls}</span>
      </div>

      <div className="shop-tabs">
        <button className={tab === 'enhance' ? 'active' : ''} onClick={() => { setTab('enhance'); setResultMsg(null); }}>
          裝備強化
        </button>
        <button className={tab === 'quality' ? 'active' : ''} onClick={() => { setTab('quality'); setResultMsg(null); }}>
          品質提升
        </button>
        <button className={tab === 'affix' ? 'active' : ''} onClick={() => { setTab('affix'); setResultMsg(null); }}>
          詞綴強化
        </button>
        <button className={tab === 'craft' ? 'active' : ''} onClick={() => { setTab('craft'); setResultMsg(null); setSelectedRecipe(null); }}>
          裝備製作
        </button>
      </div>

      {resultMsg && <p className="bs-result">{resultMsg}</p>}

      {tab !== 'craft' && (
        <div className="shop-items">
          {allItems.length === 0 && <p className="empty-text">沒有裝備</p>}
          {allItems.map((entry) => (
            <div key={entry.item.id} className="shop-item bs-shop-item">
              <div className="shop-item-info">
                {entry.source === 'equipped' && entry.slot && (
                  <span className="bs-slot-tag">[{SLOT_NAMES[entry.slot]}]</span>
                )}
                <EquipmentDetail item={entry.item} />
              </div>
              {tab === 'enhance' && renderEnhanceActions(entry)}
              {tab === 'quality' && renderQualityActions(entry)}
              {tab === 'affix' && renderAffixActions(entry)}
            </div>
          ))}
        </div>
      )}

      {tab === 'craft' && (
        <div className="shop-items">
          <div className="bs-craft-categories">
            {[
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
              { key: 'shield', label: '盾牌' },
              { key: 'magicBook', label: '魔導書' },
              { key: 'armor-helmet', label: '頭盔' },
              { key: 'armor-chest', label: '胸甲' },
              { key: 'armor-gloves', label: '手套' },
              { key: 'armor-boots', label: '鞋子' },
              { key: 'armor-necklace', label: '項鍊' },
              { key: 'armor-ring1', label: '戒指' },
            ].map(cat => {
              const hasItems = craftTemplates.some(t => {
                if (cat.key.startsWith('armor-')) {
                  return t.type === 'armor' && t.slot === cat.key.replace('armor-', '');
                }
                return t.type === cat.key;
              });
              if (!hasItems) return null;
              return (
                <button
                  key={cat.key}
                  className={craftCategory === cat.key ? 'active' : ''}
                  onClick={() => { setCraftCategory(cat.key); setSelectedRecipe(null); }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
          {craftTemplates
            .filter(recipe => {
              if (craftCategory.startsWith('armor-')) {
                return recipe.type === 'armor' && recipe.slot === craftCategory.replace('armor-', '');
              }
              return recipe.type === craftCategory;
            })
            .map(recipe => (
            <div
              key={recipe.id}
              className={`shop-item bs-shop-item ${selectedRecipe?.id === recipe.id ? 'selected' : ''} ${!canCraftRecipe(recipe) ? 'disabled-look' : ''}`}
              onClick={() => { setSelectedRecipe(recipe); setResultMsg(null); }}
            >
              <div className="shop-item-info">
                <span className="shop-item-name">{recipe.name}</span>
                <span className="shop-item-desc">
                  {recipe.smallMonsterDamage ? `攻擊: ${recipe.smallMonsterDamage}/${recipe.largeMonsterDamage}` : ''}
                  {recipe.defense ? `防禦: ${recipe.defense}` : ''}
                  {recipe.magicAttack ? ` | 魔攻+${recipe.magicAttack}` : ''}
                  {recipe.blockRate ? ` | 格擋${recipe.blockRate}%` : ''}
                  {recipe.attackSuccess ? ` | 命中+${recipe.attackSuccess}` : ''}
                  {recipe.extraAttack ? ` | 額攻+${recipe.extraAttack}` : ''}
                  {recipe.hpRegen ? ` | 回血+${recipe.hpRegen}` : ''}
                  {recipe.mpRegen ? ` | 回魔+${recipe.mpRegen}` : ''}
                  {recipe.bonusHp ? ` | HP+${recipe.bonusHp}` : ''}
                  {recipe.bonusMp ? ` | MP+${recipe.bonusMp}` : ''}
                  {recipe.bonusWeight ? ` | 負重+${recipe.bonusWeight}` : ''}
                </span>
                <span className="shop-item-desc">
                  {recipe.bonusStats ? `${recipe.bonusStats} | ` : ''}
                  {recipe.material ? `${recipe.material === 'wood' ? '木' : recipe.material === 'iron' ? '鐵' : recipe.material === 'silver' ? '銀' : recipe.material === 'mithril' ? '米索利' : recipe.material === 'dragon' ? '龍' : '奧里哈魯根'} | ` : ''}
                  重量{recipe.weight ?? '—'}
                  {` | 安定值${recipe.stability ?? (isWeaponSlot(recipe.slot) ? 6 : 4)}`}
                  {` | ${recipe.canBreak === false ? '不壞刀' : '會壞刀'}`}
                </span>
                <span className="shop-item-desc">
                  {recipe.craftTier ? `${CRAFT_TIER_NAMES[recipe.craftTier]} | ` : ''}
                  {recipe.requiredClass && recipe.requiredClass.length > 0
                    ? recipe.requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、')
                    : '全職業'}
                </span>
                <span className="shop-item-desc">
                  {(recipe.craftMaterials ?? []).map(m => {
                    const have = bagItems.find(b => b.name === m.name)?.amount ?? 0;
                    return `${m.name} ${have}/${m.amount}`;
                  }).join('、')}
                </span>
                <span className="shop-item-price">{(recipe.craftGold ?? 0).toLocaleString()}G</span>
              </div>
              <div className="shop-item-actions">
                <button
                  onClick={(e) => { e.stopPropagation(); handleCraft(); }}
                  disabled={!canCraftRecipe(recipe) || selectedRecipe?.id !== recipe.id}
                >
                  製作
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
