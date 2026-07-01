import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { loadTemplateCache } from '../templateSync';
import {
  canClaimStarterGear,
  canEnhanceStarterGear,
  enhanceStarterGear,
  getStarterGearNames,
  getStarterEnhanceCost,
  getStarterEnhanceMax,
  claimStarterGear,
} from '../starterNpc';
import type { EquipmentInstance } from '../../models/equipment';

describe('starterNpc', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    await loadTemplateCache();
  });

  describe('canClaimStarterGear', () => {
    it('returns true for level <= 30', () => {
      expect(canClaimStarterGear(1)).toBe(true);
      expect(canClaimStarterGear(15)).toBe(true);
      expect(canClaimStarterGear(30)).toBe(true);
    });

    it('returns false for level > 30', () => {
      expect(canClaimStarterGear(31)).toBe(false);
      expect(canClaimStarterGear(50)).toBe(false);
    });
  });

  describe('getStarterGearNames', () => {
    it('returns correct gear for knight', () => {
      const names = getStarterGearNames('knight');
      expect(names).toContain('新手劍');
      expect(names).toContain('新手盾');
      expect(names).toContain('新手鐵盔');
      expect(names).toContain('新手鎖甲');
      expect(names).toContain('新手鐵手甲');
      expect(names).toContain('新手鐵靴');
      expect(names).toHaveLength(6);
    });

    it('returns correct gear for elf', () => {
      const names = getStarterGearNames('elf');
      expect(names).toContain('新手弓');
      expect(names).toContain('新手皮帽');
      expect(names).toContain('新手皮甲');
      expect(names).toContain('新手皮手套');
      expect(names).toContain('新手皮靴');
      expect(names).toHaveLength(5);
    });

    it('returns correct gear for elementalist', () => {
      const names = getStarterGearNames('elementalist');
      expect(names).toContain('新手法杖');
      expect(names).toContain('新手魔導書');
      expect(names).toContain('新手法師頭巾');
      expect(names).toContain('新手法師長袍');
      expect(names).toContain('新手法師手套');
      expect(names).toContain('新手布鞋');
      expect(names).toHaveLength(6);
    });

    it('returns correct gear for priest', () => {
      const names = getStarterGearNames('priest');
      expect(names).toContain('新手鐵鎚');
      expect(names).toContain('新手盾');
      expect(names).toContain('新手法師頭巾');
      expect(names).toContain('新手法師長袍');
      expect(names).toContain('新手法師手套');
      expect(names).toContain('新手布鞋');
      expect(names).toHaveLength(6);
    });

    it('returns correct gear for thief', () => {
      const names = getStarterGearNames('thief');
      expect(names).toContain('新手匕首');
      expect(names).toContain('新手面罩');
      expect(names).toContain('新手盜賊皮衣');
      expect(names).toContain('新手護腕');
      expect(names).toContain('新手疾風靴');
      expect(names).toHaveLength(5);
    });
  });

  describe('claimStarterGear', () => {
    it('claims full set when character has none', async () => {
      const result = await claimStarterGear(1, 'knight', 5, []);
      expect(result.claimed).toHaveLength(6);
      expect(result.alreadyOwned).toHaveLength(0);
      expect(result.claimed.every(e => e.isStarterGear)).toBe(true);
    });

    it('only claims missing items when some are already owned', async () => {
      const firstClaim = await claimStarterGear(1, 'knight', 5, []);
      const ownedSome = firstClaim.claimed.slice(0, 3);
      const result = await claimStarterGear(1, 'knight', 5, ownedSome);
      expect(result.claimed).toHaveLength(3);
      expect(result.alreadyOwned).toHaveLength(3);
    });

    it('returns empty if level > 30', async () => {
      const result = await claimStarterGear(1, 'knight', 31, []);
      expect(result.claimed).toHaveLength(0);
    });

    it('returns empty if all gear already owned', async () => {
      const firstClaim = await claimStarterGear(1, 'knight', 5, []);
      const result = await claimStarterGear(1, 'knight', 5, firstClaim.claimed);
      expect(result.claimed).toHaveLength(0);
      expect(result.alreadyOwned).toHaveLength(6);
    });
  });

  describe('canEnhanceStarterGear', () => {
    it('returns true for starter weapon below stability', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手劍', type: 'sword', slot: 'rightHand',
        isTwoHanded: false, quality: 0, enhancement: 3, affixes: [],
        ownerId: 1, equipped: true, stability: 6, isStarterGear: true,
      };
      expect(canEnhanceStarterGear(item)).toBe(true);
    });

    it('returns false for starter weapon at stability limit', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手劍', type: 'sword', slot: 'rightHand',
        isTwoHanded: false, quality: 0, enhancement: 6, affixes: [],
        ownerId: 1, equipped: true, stability: 6, isStarterGear: true,
      };
      expect(canEnhanceStarterGear(item)).toBe(false);
    });

    it('returns false for starter armor at stability limit', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手鐵盔', type: 'armor', slot: 'helmet',
        isTwoHanded: false, quality: 0, enhancement: 4, affixes: [],
        ownerId: 1, equipped: true, stability: 4, isStarterGear: true,
      };
      expect(canEnhanceStarterGear(item)).toBe(false);
    });

    it('returns false for non-starter gear', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '短劍', type: 'sword', slot: 'rightHand',
        isTwoHanded: false, quality: 0, enhancement: 3, affixes: [],
        ownerId: 1, equipped: true, stability: 6,
      };
      expect(canEnhanceStarterGear(item)).toBe(false);
    });

    it('returns false for items with stability -1 (cannot enhance)', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手魔導書', type: 'magicBook', slot: 'leftHand',
        isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
        ownerId: 1, equipped: true, stability: -1, isStarterGear: true,
      };
      expect(canEnhanceStarterGear(item)).toBe(false);
    });
  });

  describe('enhanceStarterGear', () => {
    it('increases enhancement by 1', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手劍', type: 'sword', slot: 'rightHand',
        isTwoHanded: false, quality: 0, enhancement: 2, affixes: [],
        ownerId: 1, equipped: true, stability: 6, isStarterGear: true,
      };
      const result = enhanceStarterGear(item);
      expect(result.enhancement).toBe(3);
    });
  });

  describe('getStarterEnhanceCost', () => {
    it('returns 500', () => {
      expect(getStarterEnhanceCost()).toBe(500);
    });
  });

  describe('getStarterEnhanceMax', () => {
    it('returns stability value for weapons', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手劍', type: 'sword', slot: 'rightHand',
        isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
        ownerId: 1, equipped: true, stability: 6, isStarterGear: true,
      };
      expect(getStarterEnhanceMax(item)).toBe(6);
    });

    it('returns stability value for armor', () => {
      const item: EquipmentInstance = {
        id: 1, templateId: 1, name: '新手鐵盔', type: 'armor', slot: 'helmet',
        isTwoHanded: false, quality: 0, enhancement: 0, affixes: [],
        ownerId: 1, equipped: true, stability: 4, isStarterGear: true,
      };
      expect(getStarterEnhanceMax(item)).toBe(4);
    });
  });
});
