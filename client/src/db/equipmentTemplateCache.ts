import type { EquipmentTemplate } from '../models/equipment';
import { EQUIPMENT_SEEDS } from './seed/equipmentSeeds';

/**
 * 裝備模板的行程內快取。
 *
 * 模板隨程式碼發布（`97-selfhosted-server.md` § 97.4），開機就是完整的，
 * 不必等任何載入；讀它的地方不只 React，所以放在這裡讓 store 與 hook 共用。
 */
let cached: EquipmentTemplate[] = EQUIPMENT_SEEDS as EquipmentTemplate[];

export function getCachedEquipmentTemplates(): EquipmentTemplate[] {
  return cached;
}

export async function loadEquipmentTemplates(): Promise<EquipmentTemplate[]> {
  return cached;
}

/** 測試改過模板之後還原 */
export function resetEquipmentTemplateCache(): void {
  cached = EQUIPMENT_SEEDS as EquipmentTemplate[];
}

/** 測試注入自訂模板 */
export function setEquipmentTemplateCache(templates: EquipmentTemplate[]): void {
  cached = templates;
}
