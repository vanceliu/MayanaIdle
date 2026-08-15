import { Fragment, useState, useEffect } from 'react';
import { useGameStore, getBagUsedSlots, getBagMaxSlots } from '../../stores/gameStore';
import type { EquipmentInstance, EquipSlot, EquipmentTemplate } from '../../models/equipment';
import { isWeaponSlot } from '../../models/equipment';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage, CRAFT_MAX_AFFIX_TIER, type AffixCategory, type Affix } from '../../models/affix';
import { EQUIPMENT_TIER_NAMES } from '../../models/equipmentTier';
import { EquipmentDetail } from '../EquipmentInfo';
import { GameIcon } from '../GameIcon';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { getItemById } from '../../models/items';
import { getBagItemAmount, consumeBagItem } from '../../models/bagItem';
import { evaluateCraftRequirements, hasCraftQuestFor, removeCraftQuestByTemplate } from '../../systems/craftQuestSystem';
import { MAX_ACTIVE_CRAFT_QUESTS } from '../../models/craftQuest';
import { useOneShotFx, FX_DURATION_MS } from './useOneShotFx';

/** 強化卷軸（`ITEM_DEFINITIONS` id）。背包比對一律用 id，不用名稱 */
const WEAPON_ENHANCE_SCROLL_ID = 7;
const ARMOR_ENHANCE_SCROLL_ID = 8;
import { getEquipmentTierColor } from '../../models/equipmentTier';
import { CLASS_NAMES_ZH } from '../../models/character';
import { db } from '../../db/database';
import { resolveEquipment } from '../../systems/templateSync';
import { getWeaponEnhanceRate, getArmorEnhanceRate } from '../../systems/enhancement';
import { useEquipmentTemplates } from '../../hooks/useEquipmentTemplates';

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

type Tab = 'enhance' | 'craft';

/**
 * 強化演出的總長度（`48-vfx.md` § 48.4.3）。
 * 最長的一段是成功的 `+N` 浮字：stagger 0.32s + 1.1s。
 * 失敗（碎裂）與紅閃同一拍，stagger + 0.88s 更短。
 */
export const ENHANCE_FX_DURATION_MS = FX_DURATION_MS;

type EnhanceFxKind = 'safe' | 'success' | 'fail';

interface EnhanceFx {
  kind: EnhanceFxKind;
  itemId: number;
  /** 成功時往上飄的 `+N` */
  label?: string;
  /** 失敗時的殘影快照：裝備已從清單移除，靠這份原地演完碎裂 */
  ghost?: EquipmentInstance;
  ghostIndex?: number;
  ghostSlot?: EquipSlot;
}

const SHARD_INDEXES = [1, 2, 3, 4, 5, 6];

function isWeapon(item: EquipmentInstance): boolean {
  return !!item.smallMonsterDamage;
}

function getStability(item: EquipmentInstance): number {
  if (isWeapon(item)) return item.stability ?? 6;
  if (item.stability != null) return item.stability;
  return 4;
}

/**
 * 製作品的詞綴（§ 6A.6）：4 個、Tier **T1~T5 均等隨機**、不出特殊詞綴。
 *
 * 這裡走與商店／掉落同一支 `generateAffixes`，只是帶不同選項。
 * 改版前這裡是另一份複製的實作，規則一樣但程式碼分開，很容易單邊改動就走鐘。
 *
 * **這也是「製作版 T6」與「掉落版 T6」的差別所在**：模板素質相同，
 * 但掉落版可以帶 T6/T7 詞綴與特殊詞綴，製作版最高只有 T5、且不會有特殊詞綴。
 */
function generateCraftAffixes(
  category: AffixCategory,
  tpl?: { smallMonsterDamage?: number | null; largeMonsterDamage?: number | null },
): Affix[] {
  return generateAffixes(category, 1, 4, false, {
    maxTier: CRAFT_MAX_AFFIX_TIER,
    uniformTier: true,
    noSpecialAffix: true,
    ...(tpl ? { weaponBaseDamage: getWeaponBaseDamage(tpl) } : {}),
  });
}

export function TownBlacksmith() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const bagItems = useGameStore(s => s.bagItems);
  const craftQuests = useGameStore(s => s.craftQuests);
  const acceptCraftQuest = useGameStore(s => s.acceptCraftQuest);
  const abandonCraftQuest = useGameStore(s => s.abandonCraftQuest);
  const [tab, setTab] = useState<Tab>('enhance');
  const [_selectedItem, _setSelectedItem] = useState<{ item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot } | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<EquipmentTemplate | null>(null);
  const [craftTemplates, setCraftTemplates] = useState<EquipmentTemplate[]>([]);
  const [craftCategory, setCraftCategory] = useState<string>('sword');
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const { fx, play: playFx } = useOneShotFx<EnhanceFx>();
  const allTemplates = useEquipmentTemplates();

  useEffect(() => {
    db.equipmentTemplates
      .filter(t => t.acquireType === 'craft')
      .toArray()
      .then(arr => setCraftTemplates(arr.sort((a, b) => (a.craftGold ?? 0) - (b.craftGold ?? 0))));
  }, []);

  if (!char) return null;

  const weaponScrolls = getBagItemAmount(bagItems, WEAPON_ENHANCE_SCROLL_ID);
  const armorScrolls = getBagItemAmount(bagItems, ARMOR_ENHANCE_SCROLL_ID);

  const allItems: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }[] = [];

  for (const [slot, item] of Object.entries(equippedGear)) {
    if (item) {
      allItems.push({ item, source: 'equipped', slot: slot as EquipSlot });
    }
  }
  for (const item of inventory) {
    allItems.push({ item, source: 'bag' });
  }

  function consumeFromBag(itemId: number) {
    return consumeBagItem(useGameStore.getState().bagItems, itemId);
  }

  /** 背包列一律以 `itemTemplateId` 定位（§ 99.1），不可用 name 查 —— 改名即失聯 */
  function persistBagItem(itemId: number, newAmount: number) {
    if (!char?.id) return;
    const rows = db.characterBag.where({ characterId: char.id, itemTemplateId: itemId });
    if (newAmount <= 0) {
      rows.delete();
    } else {
      rows.modify({ amount: newAmount });
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

  /*
   * 演出只掛在畫面上，不參與判定（`48-vfx.md` § 48.1）——
   * 失敗時裝備已經被移除，卡片會跟著消失，所以用 `ghost` 存一份快照原地演完碎裂。
   */

  function handleEnhance(entry: { item: EquipmentInstance; source: 'equipped' | 'bag'; slot?: EquipSlot }) {
    if (!char) return;
    const { item, source, slot } = entry;
    const nextLevel = (item.enhancement ?? 0) + 1;

    const itemIsWeapon = isWeapon(item);
    const scrollItemId = itemIsWeapon ? WEAPON_ENHANCE_SCROLL_ID : ARMOR_ENHANCE_SCROLL_ID;
    const scrollCount = itemIsWeapon ? weaponScrolls : armorScrolls;
    if (scrollCount <= 0) return;

    const stability = getStability(item);
    const rate = itemIsWeapon
      ? getWeaponEnhanceRate(nextLevel, stability)
      : getArmorEnhanceRate(nextLevel, stability);

    const success = Math.random() < rate;
    const newBag = consumeFromBag(scrollItemId);
    const remainingScrolls = (itemIsWeapon ? weaponScrolls : armorScrolls) - 1;
    persistBagItem(scrollItemId, remainingScrolls);

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
      // § 48.4：安定值內只給白閃，超過安定值才是金色那一套
      playFx({
        kind: nextLevel <= stability ? 'safe' : 'success',
        itemId: item.id!,
        label: `+${nextLevel}`,
      });
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
      // 裝備已經從清單移除，碎裂只能靠殘影卡片演（狀態不為了特效延後，見 `48-vfx.md` § 48.1）
      playFx({
        kind: 'fail',
        itemId: item.id!,
        ghost: item,
        ghostIndex: allItems.findIndex(e => e.item.id === item.id),
        ghostSlot: source === 'equipped' ? slot : undefined,
      });
    }
    const stats = { ...useGameStore.getState().statistics };
    if (itemIsWeapon) {
      stats.weaponEnhanceAttempts += 1;
      if (!success) stats.weaponsBroken += 1;
    } else {
      stats.armorEnhanceAttempts += 1;
      if (!success) stats.armorsBroken += 1;
    }
    useGameStore.setState({ statistics: stats });
    useGameStore.getState().saveState();
  }

  /** 失敗時的殘影卡片：純視覺，沒有任何按鈕，演完就由 `playFx` 收掉 */
  const ghostCard = fx?.kind === 'fail' && fx.ghost
    ? (
      <div
        key={`enh-ghost-${fx.token}`}
        className="shop-item bs-shop-item enh-shake enh-breaking"
        data-testid="enh-fx-ghost"
      >
        <div className="shop-item-info">
          {fx.ghostSlot && <span className="bs-slot-tag">[{SLOT_NAMES[fx.ghostSlot]}]</span>}
          <EquipmentDetail item={fx.ghost} templates={allTemplates} />
        </div>
        <div className="enh-fx-layer">
          <div className="enh-flash-red" />
          <div className="enh-flash-soft" />
          {SHARD_INDEXES.map(i => <div key={i} className={`enh-shard enh-shard--${i}`} />)}
        </div>
      </div>
    )
    : null;

  /**
   * 製作按鈕與製作任務外框走**同一支判定**（`36-quest-system.md` § 36.13.3）——
   * 兩邊各寫一份的話，任務會顯示「可製作」但按下去做不出來。
   */
  function canCraftRecipe(recipe: EquipmentTemplate): boolean {
    if (!char) return false;
    return evaluateCraftRequirements(recipe, bagItems, inventory, char.gold).ready;
  }

  async function handleCraft() {
    if (!selectedRecipe || !char) return;
    if (!canCraftRecipe(selectedRecipe)) return;
    if (!selectedRecipe.craftMaterials || !selectedRecipe.craftGold) return;
    const currentInv = useGameStore.getState().inventory;
    const currentBag = useGameStore.getState().bagItems;
    if (getBagUsedSlots(currentBag, currentInv, equippedGear) >= getBagMaxSlots(equippedGear)) return;

    let newBag = [...useGameStore.getState().bagItems];
    for (const mat of selectedRecipe.craftMaterials) {
      const newAmount = getBagItemAmount(newBag, mat.itemId) - mat.amount;
      persistBagItem(mat.itemId, newAmount);
      newBag = consumeBagItem(newBag, mat.itemId, mat.amount);
    }

    let newInvAfterPrereq = [...currentInv];
    if (selectedRecipe.craftPrerequisiteWeapon) {
      const { templateId, quantity } = selectedRecipe.craftPrerequisiteWeapon;
      let removed = 0;
      for (const item of currentInv) {
        if (removed >= quantity) break;
        if (item.templateId === templateId) {
          if (item.id) await db.equipmentInstances.delete(item.id);
          newInvAfterPrereq = newInvAfterPrereq.filter(i => i.id !== item.id);
          removed++;
        }
      }
    }

    const newGold = char.gold - selectedRecipe.craftGold;
    if (char.id) db.characters.update(char.id, { gold: newGold });

    const affixCategory: AffixCategory = getAffixCategoryForSlot(selectedRecipe.slot, selectedRecipe.type);
    const craftedAffixes = generateCraftAffixes(affixCategory, selectedRecipe);

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

    const newInv = [...newInvAfterPrereq, newEquip];
    useGameStore.setState({
      character: { ...char, gold: newGold },
      bagItems: newBag,
      inventory: newInv,
      // § 36.13.5：製作成功即移除同配方的任務。沒追蹤過時是 no-op
      craftQuests: removeCraftQuestByTemplate(
        useGameStore.getState().craftQuests,
        selectedRecipe.id!,
      ),
    });

    setResultMsg(`製作成功！獲得 ${selectedRecipe.name}`);
    const craftStats = { ...useGameStore.getState().statistics, equipmentCrafted: useGameStore.getState().statistics.equipmentCrafted + 1 };
    useGameStore.setState({ statistics: craftStats });
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

  return (
    <div className="shop-panel blacksmith-panel">
      <p className="shop-greeting">「想強化什麼裝備？拿來讓我瞧瞧。」</p>
      <div className="bs-resources">
        <span>金幣: {char.gold.toLocaleString()}G</span>
        <span>武器卷: {weaponScrolls}</span>
        <span>防具卷: {armorScrolls}</span>
        {tab === 'craft' && <span>製作任務: {craftQuests.length}/{MAX_ACTIVE_CRAFT_QUESTS}</span>}
      </div>

      <div className="shop-tabs">
        <button className={tab === 'enhance' ? 'active' : ''} onClick={() => { setTab('enhance'); setResultMsg(null); }}>
          裝備強化
        </button>
        <button className={tab === 'craft' ? 'active' : ''} onClick={() => { setTab('craft'); setResultMsg(null); setSelectedRecipe(null); }}>
          裝備製作
        </button>
      </div>

      {resultMsg && <p className="bs-result">{resultMsg}</p>}

      {/* 分類是篩選器，跟分頁一樣固定在表頭，不隨配方清單捲動 */}
      {tab === 'craft' && (
        <div className="bs-craft-categories">
          {[
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
            { key: 'shield', label: '盾牌' },
            { key: 'magicBook', label: '魔導書' },
            { key: 'armGuard', label: '臂甲' },
            { key: 'armor-helmet', label: '頭盔' },
            { key: 'armor-chest', label: '胸甲' },
            { key: 'armor-gloves', label: '手套' },
            { key: 'armor-boots', label: '鞋子' },
            { key: 'armor-belt', label: '腰帶' },
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
      )}

      {/* 只有裝備／配方清單會捲動，資源列與分頁固定在上方 */}
      <div className="panel-scroll">
      {tab !== 'craft' && (
        <div className="shop-items">
          {allItems.length === 0 && !ghostCard && <p className="empty-text">沒有裝備</p>}
          {allItems.map((entry, index) => (
            <Fragment key={entry.item.id}>
              {ghostCard && fx?.ghostIndex === index && ghostCard}
              <div
                className={`shop-item bs-shop-item${
                  tab === 'enhance' && getStability(entry.item) >= 0 ? ' enh-standby' : ''
                }`}
              >
                <div className="shop-item-info">
                  {entry.source === 'equipped' && entry.slot && (
                    <span className="bs-slot-tag">[{SLOT_NAMES[entry.slot]}]</span>
                  )}
                  <EquipmentDetail item={entry.item} templates={allTemplates} />
                </div>
                {tab === 'enhance' && renderEnhanceActions(entry)}
                {fx && fx.kind !== 'fail' && fx.itemId === entry.item.id && (
                  /* key 帶 token：連點時沿用同一個節點會讓 CSS 動畫不重跑 */
                  <div key={fx.token} className="enh-fx-layer" data-testid="enh-fx-success">
                    {fx.kind === 'success' && (
                      <>
                        <div className="enh-flash-gold" />
                        <div className="enh-ring" />
                        <div className="enh-ring delay" />
                      </>
                    )}
                    {fx.label && <div className="enh-float">{fx.label}</div>}
                    <div className="enh-flash-soft" />
                  </div>
                )}
              </div>
            </Fragment>
          ))}
          {/* 殘影原本的位置已被別的卡片遞補，或它本來就在最後一個，補在清單尾端 */}
          {ghostCard && (fx?.ghostIndex == null || fx.ghostIndex >= allItems.length) && ghostCard}
        </div>
      )}

      {tab === 'craft' && (
        <div className="shop-items">
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
                <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GameIcon name={getEquipIcon(recipe.type === 'armor' ? recipe.slot : recipe.type)} size={16} color={getEquipmentTierColor(recipe)} />
                  {recipe.name}
                </span>
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
                  {recipe.bonusBagSlots ? ` | 背包格子+${recipe.bonusBagSlots}` : ''}
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
                  {recipe.tier != null ? `${EQUIPMENT_TIER_NAMES[recipe.tier]} | ` : ''}
                  {recipe.requiredClass && recipe.requiredClass.length > 0
                    ? recipe.requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、')
                    : '全職業'}
                </span>
                <span className="shop-item-desc bs-craft-materials">
                  {recipe.craftPrerequisiteWeapon && (() => {
                    const { templateId, quantity } = recipe.craftPrerequisiteWeapon!;
                    const have = inventory.filter(i => i.templateId === templateId).length;
                    const enough = have >= quantity;
                    // 名稱只用於顯示，一律由 id 反查（§ 99.1 第 3 條）
                    const tmpl = allTemplates.find(t => t.id === templateId);
                    const name = tmpl?.name ?? `#${templateId}`;
                    const color = tmpl ? getEquipmentTierColor(tmpl) : undefined;
                    return (
                      <span className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                        <GameIcon name={getEquipIcon(tmpl?.type === 'armor' ? (tmpl.slot ?? 'chest') : (tmpl?.type ?? 'sword'))} size={14} color={color} />
                        <span className="bs-craft-mat-name" style={enough ? { color } : undefined}>{name}</span>
                        <span className="bs-craft-mat-count">{have}/{quantity}</span>
                      </span>
                    );
                  })()}
                  {(recipe.craftMaterials ?? []).map(m => {
                    const have = getBagItemAmount(bagItems, m.itemId);
                    const enough = have >= m.amount;
                    const def = getItemById(m.itemId);
                    const { icon, color } = resolveItemIcon(def, 'material');
                    return (
                      <span key={m.itemId} className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                        <GameIcon name={icon} size={14} color={color} />
                        <span className="bs-craft-mat-name" style={enough ? { color } : undefined}>{def?.name ?? '未知素材'}</span>
                        <span className="bs-craft-mat-count">{have}/{m.amount}</span>
                      </span>
                    );
                  })}
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
                {/* 製作追蹤（§ 36.13.2）。上限 3 個，與冒險者工會分開計算 */}
                {(() => {
                  const registered = hasCraftQuestFor(craftQuests, recipe.id!);
                  if (registered) {
                    return (
                      <button
                        className="btn-danger"
                        onClick={(e) => { e.stopPropagation(); abandonCraftQuest(`craft-${recipe.id}`); }}
                      >
                        取消追蹤
                      </button>
                    );
                  }
                  const full = craftQuests.length >= MAX_ACTIVE_CRAFT_QUESTS;
                  return (
                    <button
                      onClick={(e) => { e.stopPropagation(); acceptCraftQuest(recipe.id!); }}
                      disabled={full}
                      title={full ? `製作追蹤已滿（${MAX_ACTIVE_CRAFT_QUESTS}）` : undefined}
                    >
                      製作追蹤
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
