import { describe, it, expect } from 'vitest';
import { canNavigateTo, consumeScroll } from '../navigation';
import type { BagItem } from '../../stores/gameStore';

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
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to ivory tower floor', () => {
      const result = canNavigateTo(
        { zoneId: 'ivory-tower', regionId: 'ivory-tower-5f', floor: null },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to dragon valley floor', () => {
      const result = canNavigateTo(
        { zoneId: 'dragon-valley', regionId: 'dragon-valley-3f', floor: null },
        [],
      );
      expect(result.success).toBe(true);
    });

    it('allows navigation to ancient dungeon floor', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'ancient-dungeon-9f', floor: null },
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
        { name: '百柱塔 11F 通行卷軸', type: 'scroll', amount: 2 },
      ];
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-11-20f', floor: null },
        bag,
      );
      expect(result.success).toBe(true);
      expect(result.scrollConsumed).toBe('百柱塔 11F 通行卷軸');
    });

    it('blocks navigation to hundred-pillar 91-100f without scroll', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-91-100f', floor: null },
        [],
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('需要「百柱塔 91F 通行卷軸」才能前往');
    });

    it('allows hundred-pillar 1-10f without any scroll', () => {
      const result = canNavigateTo(
        { zoneId: 'grey-ridge', regionId: 'hundred-pillar-1-10f', floor: null },
        [],
      );
      expect(result.success).toBe(true);
      expect(result.scrollConsumed).toBeUndefined();
    });
  });

  describe('consumeScroll', () => {
    it('decrements scroll amount', () => {
      const bag: BagItem[] = [
        { name: '百柱塔 11F 通行卷軸', type: 'scroll', amount: 3 },
        { name: '品質石', type: 'material', amount: 5 },
      ];
      const result = consumeScroll(bag, '百柱塔 11F 通行卷軸');
      expect(result).toHaveLength(2);
      expect(result.find(b => b.name === '百柱塔 11F 通行卷軸')!.amount).toBe(2);
    });

    it('removes item when amount reaches 0', () => {
      const bag: BagItem[] = [
        { name: '百柱塔 11F 通行卷軸', type: 'scroll', amount: 1 },
        { name: '品質石', type: 'material', amount: 5 },
      ];
      const result = consumeScroll(bag, '百柱塔 11F 通行卷軸');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('品質石');
    });
  });
});
