import type { MapLocation } from '../models/area';
import type { BagItem } from '../models/bagItem';
import { hasBagItem, consumeBagItem } from '../models/bagItem';
import { getRegion, getRequiredScrollItemId } from '../models/mapData';
import { getItemById } from '../models/items';
import { isRegionUnlockEnabled } from './devFlags';

export interface NavigationResult {
  success: boolean;
  error?: string;
  /** 要扣掉的卷軸 id（沒有就不扣） */
  scrollConsumed?: number;
}

function scrollName(itemId: number): string {
  return getItemById(itemId)?.name ?? '通行卷軸';
}

export function canNavigateTo(
  target: MapLocation,
  bagItems: BagItem[],
): NavigationResult {
  const region = getRegion(target.regionId);
  if (!region) {
    return { success: false, error: '目標區域不存在' };
  }

  if (region.type === 'town') {
    return { success: true };
  }

  if (region.entryScrollItemId && !isRegionUnlockEnabled()) {
    if (!hasBagItem(bagItems, region.entryScrollItemId)) {
      return { success: false, error: `需要「${scrollName(region.entryScrollItemId)}」才能前往` };
    }
    return { success: true, scrollConsumed: region.entryScrollItemId };
  }

  if (region.type === 'dungeon' && target.floor != null) {
    if (!region.floors?.some(f => f.floor === target.floor)) {
      return { success: false, error: '目標樓層不存在' };
    }

    if (region.requiresScroll && region.scrollSegmentSize) {
      const scrollItemId = getRequiredScrollItemId(region.id, target.floor);
      if (scrollItemId) {
        if (!hasBagItem(bagItems, scrollItemId)) {
          return { success: false, error: `需要「${scrollName(scrollItemId)}」才能前往` };
        }
        return { success: true, scrollConsumed: scrollItemId };
      }
    }
  }

  return { success: true };
}

export function consumeScroll(bagItems: BagItem[], scrollItemId: number): BagItem[] {
  return consumeBagItem(bagItems, scrollItemId);
}
