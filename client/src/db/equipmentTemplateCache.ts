import { db } from './database';
import type { EquipmentTemplate } from '../models/equipment';

/**
 * 裝備模板的行程內快取。
 *
 * 模板是 seed 資料，一次讀進來就不會變，但讀它的地方不只 React
 * （商店面板用 hook，商店買賣與村莊腳本的自動販售在 store 裡），
 * 所以快取放在這裡讓兩邊共用，而不是綁在 hook 的模組作用域。
 */
let cached: EquipmentTemplate[] | null = null;

/** 同步取用。尚未載入時回空陣列 —— 需要保證有值的路徑請用 `loadEquipmentTemplates()` */
export function getCachedEquipmentTemplates(): EquipmentTemplate[] {
  return cached ?? [];
}

export async function loadEquipmentTemplates(): Promise<EquipmentTemplate[]> {
  if (cached) return cached;
  cached = await db.equipmentTemplates.toArray();
  return cached;
}

/** 測試在重新 seed 之間必須清掉，否則會拿到上一輪的模板 */
export function resetEquipmentTemplateCache(): void {
  cached = null;
}
