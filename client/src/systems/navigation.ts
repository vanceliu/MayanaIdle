import type { MapLocation } from '../models/area';
import type { BagItem } from '../stores/gameStore';
import { getRegion, getRequiredScrollName } from '../models/mapData';
import { isRegionUnlockEnabled } from './devFlags';

export interface NavigationResult {
  success: boolean;
  error?: string;
  scrollConsumed?: string;
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

  if (region.entryScrollName && !isRegionUnlockEnabled()) {
    const hasScroll = bagItems.some(b => b.name === region.entryScrollName && b.amount > 0);
    if (!hasScroll) {
      return { success: false, error: `需要「${region.entryScrollName}」才能前往` };
    }
    return { success: true, scrollConsumed: region.entryScrollName };
  }

  if (region.type === 'dungeon' && target.floor != null) {
    if (!region.floors?.some(f => f.floor === target.floor)) {
      return { success: false, error: '目標樓層不存在' };
    }

    if (region.requiresScroll && region.scrollSegmentSize) {
      const scrollName = getRequiredScrollName(region.id, target.floor);
      if (scrollName) {
        const hasScroll = bagItems.some(b => b.name === scrollName && b.amount > 0);
        if (!hasScroll) {
          return { success: false, error: `需要「${scrollName}」才能前往` };
        }
        return { success: true, scrollConsumed: scrollName };
      }
    }
  }

  return { success: true };
}

export function consumeScroll(bagItems: BagItem[], scrollName: string): BagItem[] {
  return bagItems.map(item => {
    if (item.name === scrollName) {
      return { ...item, amount: item.amount - 1 };
    }
    return item;
  }).filter(item => item.amount > 0);
}
