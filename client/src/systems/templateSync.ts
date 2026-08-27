import type { EquipmentTemplate, EquipmentInstance } from '../models/equipment';
import { db } from '../db/database';
import { isAccessorySlot, rollDefenseBonus, rollArmorStability, ARMOR_STABILITY_MIN } from '../models/equipment';
import { getAccessoryStatMultiplier } from './enhancement';

/** 飾品強化倍率作用的欄位（§ 6.10.1）——不含額外屬性 */
const ACCESSORY_SCALED_FIELDS = ['bonusHp', 'bonusMp', 'hpRegen', 'mpRegen'] as const;

let templateCache: Map<number, EquipmentTemplate> = new Map();
let templateByNameCache: Map<string, EquipmentTemplate> = new Map();

export async function loadTemplateCache(): Promise<void> {
  const templates = await db.equipmentTemplates.toArray();
  templateCache = new Map(templates.map(t => [t.id!, t]));
  templateByNameCache = new Map(templates.map(t => [t.name, t]));
}

export function getTemplateById(id: number): EquipmentTemplate | undefined {
  return templateCache.get(id);
}

export function getTemplateByName(name: string): EquipmentTemplate | undefined {
  return templateByNameCache.get(name);
}

export function isTemplateCacheReady(): boolean {
  return templateCache.size > 0;
}

/**
 * 每次載入都從模板覆蓋回實例的欄位 —— 模板改了數值，舊實例跟著改。
 *
 * **`stability` 不在此列**：防具的安定值是實例屬性（逐件抽 4~6，§ 6.10），
 * 模板沒有這個欄位，照抄會把抽好的值洗成 undefined。武器與飾品仍走模板，
 * 由下方的 `resolveStability()` 分流。
 * `defenseBonus` 同理，它只存在於實例上。
 */
const TEMPLATE_FIELDS = [
  'name', 'type', 'isTwoHanded',
  'smallMonsterDamage', 'largeMonsterDamage', 'defense',
  'attackSuccess', 'extraAttack', 'magicAttack',
  'bonusHp', 'bonusMp', 'hpRegen', 'mpRegen',
  'bonusWeight', 'bonusBagSlots', 'bonusStats', 'bonusAttributes', 'blockRate', 'weight',
  'material', 'requiredClass', 'line', 'requiredAttributes',
] as const;

/**
 * 模板有安定值就用模板的（武器 6、飾品 0、腰帶 -1）；沒有的是防具，
 * 用實例抽好的值。舊實例沒有這個欄位時退回安定值下限，不重抽 ——
 * 每次載入重抽等於玩家每次開遊戲都換一次安定值。
 */
function resolveStability(template: EquipmentTemplate, instance: EquipmentInstance): number | undefined {
  if (template.stability !== undefined) return template.stability;
  return instance.stability ?? ARMOR_STABILITY_MIN;
}

/**
 * 實例生成時要抽的欄位（`06-equipment.md` § 6A.8.8、§ 6.10）。
 * 掉落、商店、製作、新手裝共用這一支，各自寫一份會漂移。
 *
 * | 來源 | 安定值 | 隨機額外防禦 |
 * |---|---|---|
 * | 武器／飾品／腰帶／新手裝 | 模板值 | 無 |
 * | 商店防具 | 固定 4（下限） | 抽 |
 * | 製作與掉落的防具 | 抽 4~6 | 抽 |
 *
 * **商店防具不抽安定值**：商店是最低階管道，詞綴也是硬上限 T3，
 * 抽得到 6 會讓商店貨的強化潛力贏過製作品與掉落品。
 */
export function rollNewInstanceFields(
  template: Pick<EquipmentTemplate, 'slot' | 'type' | 'stability' | 'acquireType'>,
): { defenseBonus?: number; stability?: number } {
  if (template.stability !== undefined) return { stability: template.stability };
  return {
    defenseBonus: rollDefenseBonus(),
    stability: template.acquireType === 'shop' ? ARMOR_STABILITY_MIN : rollArmorStability(),
  };
}

export function resolveEquipment(instance: EquipmentInstance): EquipmentInstance {
  const template = templateCache.get(instance.templateId);
  if (!template) return instance;

  const resolved = { ...instance };
  for (const field of TEMPLATE_FIELDS) {
    (resolved as any)[field] = (template as any)[field];
  }
  resolved.stability = resolveStability(template, instance);
  if (!resolved.slot) {
    resolved.slot = template.slot;
  }

  // 飾品強化的數值倍率（§ 6.10.1）在此統一套用，
  // 避免各消費端（最大HP/MP、回復、面板）各算一份而漂移。
  if (isAccessorySlot(resolved.slot) && (resolved.enhancement ?? 0) > 0) {
    const mult = getAccessoryStatMultiplier(resolved.enhancement ?? 0);
    if (mult > 1) {
      for (const field of ACCESSORY_SCALED_FIELDS) {
        const base = (resolved as any)[field];
        if (typeof base === 'number' && base > 0) {
          (resolved as any)[field] = Math.floor(base * mult);
        }
      }
    }
  }

  return resolved;
}

export function resolveEquipmentList(instances: EquipmentInstance[]): EquipmentInstance[] {
  return instances.map(resolveEquipment);
}

export function toStorableInstance(instance: EquipmentInstance): Record<string, unknown> {
  const { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage, isStarterGear } = instance;
  return { id, templateId, quality, enhancement, affixes, element, ownerId, equipped, inStorage, ...(isStarterGear ? { isStarterGear } : {}) };
}
