import { describe, it, expect } from 'vitest';
import { findScrollInBag, consumeTownScroll, TOWN_SCROLL_CONFIG, ALL_TOWN_SCROLLS } from '../townScroll';
import { getItemId } from '../items';

/** 測試以名稱閱讀，實際比對的一律是 id */
const id = (name: string) => getItemId(name)!;

describe('townScroll', () => {
  describe('TOWN_SCROLL_CONFIG', () => {
    it('should define scrolls for all three towns', () => {
      expect(TOWN_SCROLL_CONFIG['neutral-town']).toBeDefined();
      expect(TOWN_SCROLL_CONFIG['elsarth-town']).toBeDefined();
      expect(TOWN_SCROLL_CONFIG['varden-town']).toBeDefined();
    });

    it('should have correct town IDs and names', () => {
      expect(TOWN_SCROLL_CONFIG['neutral-town'].townId).toBe('neutral-town');
      expect(TOWN_SCROLL_CONFIG['neutral-town'].townName).toBe('薄暮村');
      expect(TOWN_SCROLL_CONFIG['elsarth-town'].townName).toBe('艾爾薩斯城鎮');
      expect(TOWN_SCROLL_CONFIG['varden-town'].townName).toBe('瓦爾登城鎮');
    });

    it('每張回城卷軸的 itemId 都對得上 seed', () => {
      for (const scroll of ALL_TOWN_SCROLLS) {
        expect(scroll.itemId, scroll.name).toBe(getItemId(scroll.name));
      }
    });

    it('should all cost 500 gold', () => {
      for (const scroll of ALL_TOWN_SCROLLS) {
        expect(scroll.price).toBe(500);
      }
    });
  });

  describe('findScrollInBag', () => {
    it('should return null when bag is empty', () => {
      expect(findScrollInBag([])).toBeNull();
    });

    it('should return null when no scroll items in bag', () => {
      const bag = [
        { itemId: id('品質石'), amount: 3 },
        { itemId: id('紅色藥水'), amount: 10 },
      ];
      expect(findScrollInBag(bag)).toBeNull();
    });

    it('should find a neutral town scroll', () => {
      const bag = [{ itemId: id('薄暮村回城卷軸'), amount: 5 }];
      const result = findScrollInBag(bag);
      expect(result).not.toBeNull();
      expect(result!.townId).toBe('neutral-town');
    });

    it('should find elsarth scroll', () => {
      const bag = [{ itemId: id('艾爾薩斯回城卷軸'), amount: 2 }];
      const result = findScrollInBag(bag);
      expect(result).not.toBeNull();
      expect(result!.townId).toBe('elsarth-town');
    });

    it('should find varden scroll', () => {
      const bag = [{ itemId: id('瓦爾登回城卷軸'), amount: 1 }];
      const result = findScrollInBag(bag);
      expect(result).not.toBeNull();
      expect(result!.townId).toBe('varden-town');
    });

    it('should return null when scroll amount is 0', () => {
      const bag = [{ itemId: id('薄暮村回城卷軸'), amount: 0 }];
      expect(findScrollInBag(bag)).toBeNull();
    });

    it('should return first available scroll when multiple exist', () => {
      const bag = [
        { itemId: id('薄暮村回城卷軸'), amount: 3 },
        { itemId: id('艾爾薩斯回城卷軸'), amount: 2 },
      ];
      const result = findScrollInBag(bag);
      expect(result).not.toBeNull();
      expect(result!.townId).toBe('neutral-town');
    });
  });

  describe('consumeTownScroll', () => {
    it('should decrement scroll amount by 1', () => {
      const bag = [
        { itemId: id('薄暮村回城卷軸'), amount: 5 },
        { itemId: id('品質石'), amount: 3 },
      ];
      const result = consumeTownScroll(bag, id('薄暮村回城卷軸'));
      expect(result.find(b => b.itemId === id('薄暮村回城卷軸'))?.amount).toBe(4);
      expect(result.find(b => b.itemId === id('品質石'))?.amount).toBe(3);
    });

    it('should remove scroll from bag when amount reaches 0', () => {
      const bag = [
        { itemId: id('薄暮村回城卷軸'), amount: 1 },
        { itemId: id('品質石'), amount: 3 },
      ];
      const result = consumeTownScroll(bag, id('薄暮村回城卷軸'));
      expect(result.find(b => b.itemId === id('薄暮村回城卷軸'))).toBeUndefined();
      expect(result).toHaveLength(1);
    });

    it('should not affect other items', () => {
      const bag = [
        { itemId: id('薄暮村回城卷軸'), amount: 2 },
        { itemId: id('艾爾薩斯回城卷軸'), amount: 3 },
      ];
      const result = consumeTownScroll(bag, id('薄暮村回城卷軸'));
      expect(result.find(b => b.itemId === id('薄暮村回城卷軸'))?.amount).toBe(1);
      expect(result.find(b => b.itemId === id('艾爾薩斯回城卷軸'))?.amount).toBe(3);
    });
  });
});
