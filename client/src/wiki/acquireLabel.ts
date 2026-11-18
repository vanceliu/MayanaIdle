import type { EquipmentTemplate } from '../models/equipment';

/**
 * 裝備的取得方式（`06-equipment-acquire.md` § 6A.1）：新手裝不販售、不掉落；
 * 其餘依裝備階級進掉落池，所以商店裝與製作裝也會掉落。
 */
export function getAcquireLabel(t: Pick<EquipmentTemplate, 'acquireType'>): string {
  switch (t.acquireType) {
    case 'starter': return '新手裝';
    case 'shop': return '商店／掉落';
    case 'craft': return '製作／掉落';
    default: return '掉落';
  }
}
