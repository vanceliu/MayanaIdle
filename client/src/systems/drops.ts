import { db } from '../db/database';
import type { EquipmentInstance } from '../models/equipment';
import { resolveEquipment } from './templateSync';
import { isWeaponSlot } from '../models/equipment';
import { getEquipmentTierLevel } from '../models/equipmentTier';
import type { EquipmentTierLevel } from '../models/equipmentTier';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage } from '../models/affix';
import type { AffixCategory } from '../models/affix';
import { resolveArea } from '../models/mapData';
import { rollClassSkillBookDrop } from './classSkillBookDrop';
import { getItemById } from '../models/items';
import { GOLD_RATE_MULTIPLIER, DROP_RATE_MULTIPLIER } from '../config';

export interface DropResult {
  gold: number;
  items: DroppedItem[];
}

import { mapItemCategoryToBagType as mapItemCategoryToInventoryType } from '../models/bagItem';
type InventoryItemType = 'material' | 'potion' | 'scroll' | 'spellbook';

export interface DroppedItem {
  name: string;
  type: 'equipment' | InventoryItemType;
  itemTemplateId?: number;
  amount: number;
  equipmentInstance?: EquipmentInstance;
  /**
   * 掉落物的裝備階級（`37-statistics.md` § 37.3 的 T7 計數用）。
   * 在此帶出是因為模板此刻就在手上；交給呼叫端事後查表得再打一次 DB。
   */
  equipmentTier?: EquipmentTierLevel;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export interface DropBonuses {
  drop_rate: number;
  gold_rate: number;
}

export const DROP_ROLL_MAX = 1000;

function getDropRateMultiplier(bonuses?: DropBonuses): number {
  return (1 + (bonuses?.drop_rate ?? 0) / 100) * DROP_RATE_MULTIPLIER;
}

/**
 * `equipmentPool: 'all'` 的類別抽取（27-drop-table.md § 27.3）。
 * 先以 1/2 決定武器或防具，再於該類別內均勻抽 —— 若直接對混合池均勻抽，
 * 各池武器/防具數量懸殊會讓結果嚴重偏斜（例：shop/high 有 16 武器 vs 1 防具 → 94% 掉武器）。
 * 單邊為空時退回另一邊，避免抽不到東西。
 */
export function pickEquipmentCategory<T extends { slot: string }>(candidates: T[]): T[] {
  const weapons = candidates.filter(t => isWeaponSlot(t.slot as any));
  const armors = candidates.filter(t => !isWeaponSlot(t.slot as any));
  if (weapons.length === 0) return armors;
  if (armors.length === 0) return weapons;
  return Math.random() < 0.5 ? weapons : armors;
}

/**
 * 區域內依怪物等級線性遞增的掉落值（`dropValueMax` 存在時生效）。
 * 用於文件以「50~100」這類範圍標示的掉落物，目前為百柱塔卷軸類與橙色藥水。
 */
export function scaleDropValue(
  base: number,
  max: number | undefined,
  monsterLevel: number,
  areaLevelMin: number,
  areaLevelMax: number,
): number {
  if (max === undefined || max <= base) return base;
  const levelRange = Math.max(1, areaLevelMax - areaLevelMin);
  const progress = Math.min(1, Math.max(0, (monsterLevel - areaLevelMin) / levelRange));
  return Math.min(max, Math.floor(base + (max - base) * progress));
}

export async function rollBossDrops(bossName: string, ownerId: number, areaLevel: number, bonuses?: DropBonuses): Promise<DropResult> {
  const entries = await db.bossDropTables.where('bossName').equals(bossName).toArray();
  let gold = 0;
  const items: DroppedItem[] = [];
  const dropRateMultiplier = getDropRateMultiplier(bonuses);
  const goldRateMultiplier = (1 + (bonuses?.gold_rate ?? 0) / 100) * GOLD_RATE_MULTIPLIER;
  let highTierRolled = false;

  for (const entry of entries) {
    // equipmentPool entries: roll once (10%), then 50/50 weapon or armor
    if (entry.equipmentPool) {
      if (highTierRolled) continue;
      highTierRolled = true;
      const roll = Math.random() * DROP_ROLL_MAX;
      const boostedDropValue = Math.min(entry.dropValue * dropRateMultiplier, DROP_ROLL_MAX);
      if (roll >= boostedDropValue) continue;
      const pickWeapon = Math.random() < 0.5;
      // `06-equipment-acquire.md` § 6A.1：掉落池以裝備階級 tier 比對（取代舊的 craftTier）
      const tier = entry.tier ?? 4;
      const candidates = await db.equipmentTemplates
        .filter(t => t.tier === tier && t.acquireType !== 'starter'
          && (pickWeapon ? isWeaponSlot(t.slot) : !isWeaponSlot(t.slot)))
        .toArray();
      if (candidates.length === 0) continue;
      const template = candidates[Math.floor(Math.random() * candidates.length)];
      const affixCategory: AffixCategory = getAffixCategoryForSlot(template.slot, template.type);
      const affixes = generateAffixes(affixCategory, areaLevel, 4, true, {
        weaponBaseDamage: getWeaponBaseDamage(template),
      });
      const dbRecord: Record<string, unknown> = {
        templateId: template.id!,
        slot: template.slot,
        quality: 0,
        enhancement: 0,
        affixes,
        ownerId,
        equipped: false,
      };
      const id = await db.equipmentInstances.add(dbRecord as any);
      const instance: EquipmentInstance = resolveEquipment({
        id: id as number,
        templateId: template.id!,
        name: template.name,
        type: template.type,
        slot: template.slot,
        isTwoHanded: template.isTwoHanded,
        quality: 0,
        enhancement: 0,
        affixes,
        ownerId,
        equipped: false,
      });
      items.push({
        name: template.name,
        type: 'equipment',
        amount: 1,
        equipmentInstance: instance,
        equipmentTier: getEquipmentTierLevel(template),
      });
      continue;
    }

    const roll = Math.random() * DROP_ROLL_MAX;
    const boostedDropValue = Math.min(entry.dropValue * dropRateMultiplier, DROP_ROLL_MAX);
    if (roll >= boostedDropValue) continue;

    if (entry.itemType === 'gold') {
      const baseGold = randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1);
      gold += Math.floor(baseGold * goldRateMultiplier);
    } else if (entry.itemType === 'equipment') {
      const template = entry.equipmentTemplateId
        ? await db.equipmentTemplates.get(entry.equipmentTemplateId)
        : undefined;
      if (template) {
        const affixCategory: AffixCategory = getAffixCategoryForSlot(template.slot, template.type);
        const affixes = generateAffixes(affixCategory, areaLevel, 4, true, {
          weaponBaseDamage: getWeaponBaseDamage(template),
        });
        const dbRecord: Record<string, unknown> = {
          templateId: template.id!,
          slot: template.slot,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        };
        const id = await db.equipmentInstances.add(dbRecord as any);
        const instance: EquipmentInstance = resolveEquipment({
          id: id as number,
          templateId: template.id!,
          name: template.name,
          type: template.type,
          slot: template.slot,
          isTwoHanded: template.isTwoHanded,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        });
        items.push({
          name: template.name,
          type: 'equipment',
          amount: 1,
          equipmentInstance: instance,
          equipmentTier: getEquipmentTierLevel(template),
        });
      }
    } else {
      const itemDef = entry.itemTemplateId ? getItemById(entry.itemTemplateId) : undefined;
      if (itemDef) {
        items.push({
          name: itemDef.name,
          type: mapItemCategoryToInventoryType(itemDef.category),
          itemTemplateId: entry.itemTemplateId,
          amount: randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1),
        });
      }
    }
  }

  // Class skill book drop (boss 5%)
  const skillBookDrop = rollClassSkillBookDrop(areaLevel, true, dropRateMultiplier);
  if (skillBookDrop) {
    items.push({
      name: getItemById(skillBookDrop)?.name ?? '技能書',
      type: 'spellbook',
      itemTemplateId: skillBookDrop,
      amount: 1,
    });
  }

  return { gold, items };
}

export async function rollDrops(areaId: string, ownerId: number, bonuses?: DropBonuses, isBoss: boolean = false, monsterLevel?: number): Promise<DropResult> {
  const entries = await db.dropTables.where('area').equals(areaId).toArray();
  // 副本樓層的 area id 是 `<regionId>-<floor>f`，不是 region id ——
  // 一律走 `resolveArea`，直接 `getRegion(areaId)` 會讓整座副本的區域等級退化成 1
  const area = resolveArea(areaId);
  const areaLevel = area?.levelMax ?? 1;
  const areaLevelMin = area?.levelMin ?? 1;
  const areaLevelMax = area?.levelMax ?? 1;
  let gold = 0;
  const items: DroppedItem[] = [];
  const dropRateMultiplier = getDropRateMultiplier(bonuses);
  const goldRateMultiplier = (1 + (bonuses?.gold_rate ?? 0) / 100) * GOLD_RATE_MULTIPLIER;

  for (const entry of entries) {
    let effectiveDropValue = entry.dropValue;
    if (monsterLevel && entry.itemType === 'item' && entry.itemTemplateId) {
      const itemDef = getItemById(entry.itemTemplateId);
      if (itemDef?.category === 'dungeon') {
        // 百柱塔卷軸：越高層機率越高（§ 27.1）
        const levelRange = Math.max(1, areaLevelMax - areaLevelMin);
        const levelProgress = Math.min(1, (monsterLevel - areaLevelMin) / levelRange);
        effectiveDropValue = Math.min(100, Math.floor(entry.dropValue * (1 + levelProgress)));
      } else {
        // 文件以「50~100」標示範圍者，依 dropValueMax 線性遞增（§ 27.3）
        effectiveDropValue = scaleDropValue(
          entry.dropValue, entry.dropValueMax, monsterLevel, areaLevelMin, areaLevelMax,
        );
      }
    }
    const roll = Math.random() * DROP_ROLL_MAX;
    const boostedDropValue = Math.min(effectiveDropValue * dropRateMultiplier, DROP_ROLL_MAX);
    if (roll >= boostedDropValue) continue;

    if (entry.itemType === 'gold') {
      const baseGold = randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1);
      gold += Math.floor(baseGold * goldRateMultiplier);
    } else if (entry.itemType === 'equipment') {
      let template;
      if (entry.equipmentPool) {
        const pool = entry.equipmentPool;
        const candidates = await db.equipmentTemplates
          .filter(t => {
            // `06-equipment-acquire.md` § 6A.1：掉落池以裝備階級 tier 比對。tier 已隱含取得管道
            // （T1~T3 = 商店可買、T4~T7 = 鐵匠製作），不需再比 acquireType。
            if (entry.tier != null && t.tier !== entry.tier) return false;
            if (pool === 'weapon') return isWeaponSlot(t.slot);
            if (pool === 'armor') return !isWeaponSlot(t.slot);
            return true;
          })
          .toArray();
        const finalists = pool === 'all' ? pickEquipmentCategory(candidates) : candidates;
        if (finalists.length > 0) {
          template = finalists[Math.floor(Math.random() * finalists.length)];
        }
      } else if (entry.equipmentTemplateId) {
        template = await db.equipmentTemplates.get(entry.equipmentTemplateId);
      }
      if (template) {
        const affixCategory: AffixCategory = getAffixCategoryForSlot(template.slot, template.type);
        const affixes = generateAffixes(affixCategory, areaLevel, 4, isBoss, {
          weaponBaseDamage: getWeaponBaseDamage(template),
        });
        const dbRecord: Record<string, unknown> = {
          templateId: template.id!,
          slot: template.slot,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        };
        const id = await db.equipmentInstances.add(dbRecord as any);
        const instance: EquipmentInstance = resolveEquipment({
          id: id as number,
          templateId: template.id!,
          name: template.name,
          type: template.type,
          slot: template.slot,
          isTwoHanded: template.isTwoHanded,
          quality: 0,
          enhancement: 0,
          affixes,
          ownerId,
          equipped: false,
        });
        items.push({
          name: template.name,
          type: 'equipment',
          amount: 1,
          equipmentInstance: instance,
          equipmentTier: getEquipmentTierLevel(template),
        });
      }
    } else {
      const itemDef = entry.itemTemplateId ? getItemById(entry.itemTemplateId) : undefined;
      if (itemDef) {
        items.push({
          name: itemDef.name,
          type: mapItemCategoryToInventoryType(itemDef.category),
          itemTemplateId: entry.itemTemplateId,
          amount: randomInt(entry.minAmount ?? 1, entry.maxAmount ?? 1),
        });
      }
    }
  }

  // Class skill book drop (dynamic, based on area level)
  const skillBookDrop = rollClassSkillBookDrop(areaLevel, isBoss, dropRateMultiplier);
  if (skillBookDrop) {
    items.push({
      name: getItemById(skillBookDrop)?.name ?? '技能書',
      type: 'spellbook',
      itemTemplateId: skillBookDrop,
      amount: 1,
    });
  }

  return { gold, items };
}
