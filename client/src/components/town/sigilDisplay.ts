import { getSigilDefinition, type SigilType } from '../../models/sigil';
import { getItemById } from '../../models/items';
import { resolveItemIcon } from '../../models/iconMap';

/**
 * 印記的顯示名稱與顏色一律由 `itemId` 反查 seed（§ 99.1：設定表存 id，名稱只用於顯示）。
 * 介面不另建 label 表與色表。
 */
export function sigilDisplay(type: SigilType): { name: string; color?: string } {
  const def = getSigilDefinition(type);
  const item = getItemById(def.itemId);
  return { name: item?.name ?? def.name, color: resolveItemIcon(item, 'scroll').color };
}
