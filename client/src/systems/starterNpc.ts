import type { EquipmentInstance, EquipmentTemplate, EquipSlot } from '../models/equipment';
import type { ClassName } from '../models/character';
import { db } from '../db/database';
import { EQUIPMENT_SEEDS } from '../db/seed/equipmentSeeds';
import { resolveEquipment } from './templateSync';

const STARTER_MAX_LEVEL = 30;
const STARTER_ENHANCE_COST = 500;

/**
 * 新手裝名單**只有一個來源**：seed 的 `acquireType: 'starter'`（`99-ai-constraints.md` 第 4 條）。
 * 不另外維護硬編名單 —— 以前用中文名字查表，同名的舊模板殘留在 IndexedDB 時會撈到舊資料。
 * 沒有 `requiredClass` 的（皮腰帶）視為全職業共用。
 */
const STARTER_TEMPLATES: EquipmentTemplate[] = EQUIPMENT_SEEDS.filter(
  t => t.acquireType === 'starter',
) as EquipmentTemplate[];

export function getStarterTemplates(className: ClassName): EquipmentTemplate[] {
  return STARTER_TEMPLATES.filter(t => !t.requiredClass || t.requiredClass.includes(className));
}

export function getStarterGearNames(className: ClassName): string[] {
  return getStarterTemplates(className).map(t => t.name);
}

export function canClaimStarterGear(level: number): boolean {
  return level <= STARTER_MAX_LEVEL;
}

export function getStarterEnhanceCost(): number {
  return STARTER_ENHANCE_COST;
}

export function getStarterEnhanceMax(item: EquipmentInstance): number {
  return item.stability ?? 0;
}

export function canEnhanceStarterGear(item: EquipmentInstance): boolean {
  return getStarterEnhanceState(item) === 'enhanceable';
}

/**
 * 新手裝的強化狀態。
 *
 * `unsupported` 必須與 `maxed` 分開 —— 腰帶的安定值是 **-1**
 * （`06-equipment.md` § 6.8：腰帶不適用強化系統），把它當成「已滿」會印出
 * 「皮腰帶 +0/-1 已滿」這種讀不懂的字。
 */
export type StarterEnhanceState = 'enhanceable' | 'maxed' | 'unsupported';

export function getStarterEnhanceState(item: EquipmentInstance): StarterEnhanceState {
  if (!item.isStarterGear) return 'unsupported';
  const max = getStarterEnhanceMax(item);
  if (max <= 0) return 'unsupported';
  return item.enhancement < max ? 'enhanceable' : 'maxed';
}

export function enhanceStarterGear(item: EquipmentInstance): EquipmentInstance {
  const newEnhancement = item.enhancement + 1;
  const updated = { ...item, enhancement: newEnhancement };
  return updated;
}

export interface ClaimResult {
  claimed: EquipmentInstance[];
  alreadyOwned: string[];
}

export async function claimStarterGear(
  characterId: number,
  className: ClassName,
  level: number,
  ownedEquipment: EquipmentInstance[],
): Promise<ClaimResult> {
  if (!canClaimStarterGear(level)) {
    return { claimed: [], alreadyOwned: [] };
  }

  const starterTemplates = getStarterTemplates(className);
  const ownedStarterNames = ownedEquipment
    .filter(e => e.isStarterGear)
    .map(e => e.name);

  const missing = starterTemplates.filter(t => !ownedStarterNames.includes(t.name));
  const alreadyOwned = starterTemplates
    .filter(t => ownedStarterNames.includes(t.name))
    .map(t => t.name);

  const claimed: EquipmentInstance[] = [];

  for (const seed of missing) {
    // 一律用 id 取模板：名字可能重複，id 不會（見 `db/seed/purgeStaleTemplates.ts`）
    const template = await db.equipmentTemplates.get(seed.id!);
    if (!template) continue;

    const dbRecord = {
      templateId: template.id!,
      slot: template.slot as EquipSlot,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: characterId,
      equipped: false,
      isStarterGear: true,
    };

    const instId = await db.equipmentInstances.add(dbRecord as any);
    const instance = resolveEquipment({
      id: instId as number,
      templateId: template.id!,
      name: template.name,
      type: template.type,
      slot: template.slot,
      isTwoHanded: template.isTwoHanded,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: characterId,
      equipped: false,
      isStarterGear: true,
    });
    claimed.push(instance);
  }

  return { claimed, alreadyOwned };
}

export async function persistStarterEnhance(item: EquipmentInstance): Promise<void> {
  await db.equipmentInstances.update(item.id!, { enhancement: item.enhancement });
}
