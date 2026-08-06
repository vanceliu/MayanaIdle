import { describe, it, expect } from 'vitest';
import { canNavigateTo, consumeScroll } from '../navigation';
import type { BagItem } from '../../stores/gameStore';

import { getItemId } from '../../models/items';
import { bagItem } from '../../testing/bagFixtures';
describe('navigation system', () => {
  describe('canNavigateTo', () => {
    it('allows navigation to any field region', () => {
      const result = canNavigateTo(
        { zoneId: 'newbie-neutral', regionId: 'dawn-plains', floor: null },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to town', () => {
      const result = canNavigateTo(
        { zoneId: 'newbie-neutral', regionId: 'neutral-town', floor: null },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to dungeon region', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-1-10f', floor: null },
        [bagItem('百柱塔 1F 通行卷軸', 1)],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to ivory tower floor', () => {
      const result = canNavigateTo(
        { zoneId: 'ivory-tower-zone', regionId: 'ivory-tower', floor: 5 },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to dragon valley floor', () => {
      const result = canNavigateTo(
        { zoneId: 'dragon-valley-zone', regionId: 'dragon-valley', floor: 3 },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to ancient dungeon floor', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'ancient-dungeon', floor: 9 },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('returns error for non-existent region', () => {
      const result = canNavigateTo(
        { zoneId: 'newbie-neutral', regionId: 'fake-region', floor: null },
        [],
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('目標區域不存在');
    });

    it('blocks navigation to hundred-pillar 11-20f without scroll', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-11-20f', floor: null },
        [],
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('需要「百柱塔 11F 通行卷軸」才能前往');
    });

    it('allows navigation to hundred-pillar 11-20f with scroll and consumes it', () => {
      const bag: BagItem[] = [
        bagItem('百柱塔 11F 通行卷軸', 2),
      ];
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-11-20f', floor: null },
        bag,
      );
      expect(result.success).toBe(true);
      expect(result.scrollConsumed).toBe(getItemId('百柱塔 11F 通行卷軸'));
    });

    it('blocks navigation to hundred-pillar 91-100f without scroll', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-91-100f', floor: null },
        [],
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('需要「百柱塔 91F 通行卷軸」才能前往');
    });

    // 1~10F 原本免卷軸，改為需要雜貨店販售的入場券（`09-dungeon.md` § 百柱塔）
    it('blocks hundred-pillar 1-10f without the entry scroll', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-1-10f', floor: null },
        [],
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('需要「百柱塔 1F 通行卷軸」才能前往');
    });

    it('allows hundred-pillar 1-10f with the entry scroll, consuming it', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-1-10f', floor: null },
        [bagItem('百柱塔 1F 通行卷軸', 1)],
      );
      expect(result.success).toBe(true);
      expect(result.scrollConsumed).toBe(getItemId('百柱塔 1F 通行卷軸'));
    });
  });

  describe('consumeScroll', () => {
    it('decrements scroll amount', () => {
      const bag: BagItem[] = [
        bagItem('百柱塔 11F 通行卷軸', 3),
        bagItem('工藝印記', 5),
      ];
      const result = consumeScroll(bag, getItemId('百柱塔 11F 通行卷軸')!);
      expect(result).toHaveLength(2);
      expect(result.find(b => b.itemId === getItemId('百柱塔 11F 通行卷軸'))!.amount).toBe(2);
    });

    it('removes item when amount reaches 0', () => {
      const bag: BagItem[] = [
        bagItem('百柱塔 11F 通行卷軸', 1),
        bagItem('工藝印記', 5),
      ];
      const result = consumeScroll(bag, getItemId('百柱塔 11F 通行卷軸')!);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('工藝印記');
    });
  });
});
