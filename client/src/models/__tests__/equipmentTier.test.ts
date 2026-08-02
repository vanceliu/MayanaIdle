import { describe, it, expect } from 'vitest';
import {
  getEquipmentTierLevel,
  getEquipmentTierColor,
  getEquipmentInstanceTierLevel,
  getEquipmentInstanceTierColor,
  EQUIPMENT_TIER_COLORS,
  EQUIPMENT_TIER_NAMES,
  getTierGroup,
} from '../equipmentTier';
import type { EquipmentTemplate, EquipmentInstance } from '../equipment';

function makeTemplate(overrides: Partial<EquipmentTemplate>): EquipmentTemplate {
  return {
    id: 1,
    name: 'Test',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    buyPrice: 5000,
    ...overrides,
  };
}

function makeInstance(overrides: Partial<EquipmentInstance>): EquipmentInstance {
  return {
    id: 1,
    templateId: 1,
    name: 'Test',
    type: 'sword',
    slot: 'rightHand',
    isTwoHanded: false,
    quality: 0,
    enhancement: 0,
    affixes: [],
    ownerId: 1,
    equipped: false,
    ...overrides,
  };
}

describe('equipmentTier', () => {
  describe('getEquipmentTierLevel', () => {
    it('returns 0 for starter gear', () => {
      const t = makeTemplate({ acquireType: 'starter' });
      expect(getEquipmentTierLevel(t)).toBe(0);
    });

    it('returns 1 for shop-low', () => {
      const t = makeTemplate({ acquireType: 'shop', shopTier: 'low' });
      expect(getEquipmentTierLevel(t)).toBe(1);
    });

    it('returns 2 for shop-mid', () => {
      const t = makeTemplate({ acquireType: 'shop', shopTier: 'mid' });
      expect(getEquipmentTierLevel(t)).toBe(2);
    });

    it('returns 3 for shop-high', () => {
      const t = makeTemplate({ acquireType: 'shop', shopTier: 'high' });
      expect(getEquipmentTierLevel(t)).toBe(3);
    });

    it('returns 4 for craft-entry', () => {
      const t = makeTemplate({ acquireType: 'craft', craftTier: 'entry' });
      expect(getEquipmentTierLevel(t)).toBe(4);
    });

    it('returns 5 for craft-mid', () => {
      const t = makeTemplate({ acquireType: 'craft', craftTier: 'mid' });
      expect(getEquipmentTierLevel(t)).toBe(5);
    });

    it('returns 6 for craft-top', () => {
      const t = makeTemplate({ acquireType: 'craft', craftTier: 'top' });
      expect(getEquipmentTierLevel(t)).toBe(6);
    });

    it('returns 1 as fallback for unknown acquireType', () => {
      const t = makeTemplate({ acquireType: undefined });
      expect(getEquipmentTierLevel(t)).toBe(1);
    });
  });

  describe('getEquipmentTierColor', () => {
    it('每個 tier 對應正確顏色（色階同詞綴 Tier）', () => {
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'starter' }))).toBe('#4B5563');
      expect(getEquipmentTierColor(makeTemplate({ tier: 1, acquireType: 'shop' }))).toBe('#6B7280');
      expect(getEquipmentTierColor(makeTemplate({ tier: 2, acquireType: 'shop' }))).toBe('#9CA3AF');
      expect(getEquipmentTierColor(makeTemplate({ tier: 3, acquireType: 'shop' }))).toBe('#4ADE80');
      expect(getEquipmentTierColor(makeTemplate({ tier: 4, acquireType: 'craft' }))).toBe('#FACC15');
      expect(getEquipmentTierColor(makeTemplate({ tier: 5, acquireType: 'craft' }))).toBe('#FB923C');
      expect(getEquipmentTierColor(makeTemplate({ tier: 6, acquireType: 'craft' }))).toBe('#EF4444');
      expect(getEquipmentTierColor(makeTemplate({ tier: 7, acquireType: 'craft' }))).toBe('#A855F7');
    });
  });

  describe('getEquipmentInstanceTierLevel', () => {
    const templates: EquipmentTemplate[] = [
      makeTemplate({ id: 1, acquireType: 'shop', shopTier: 'low' }),
      makeTemplate({ id: 2, acquireType: 'craft', craftTier: 'top' }),
      makeTemplate({ id: 3, acquireType: 'shop', shopTier: 'high' }),
    ];

    it('returns 0 for starter gear instance', () => {
      const inst = makeInstance({ isStarterGear: true, templateId: 1 });
      expect(getEquipmentInstanceTierLevel(inst, templates)).toBe(0);
    });

    it('looks up template by templateId', () => {
      const inst = makeInstance({ templateId: 2 });
      expect(getEquipmentInstanceTierLevel(inst, templates)).toBe(6);
    });

    it('returns 1 if template not found', () => {
      const inst = makeInstance({ templateId: 999 });
      expect(getEquipmentInstanceTierLevel(inst, templates)).toBe(1);
    });
  });

  describe('getEquipmentInstanceTierColor', () => {
    const templates: EquipmentTemplate[] = [
      makeTemplate({ id: 1, acquireType: 'craft', craftTier: 'mid' }),
    ];

    it('returns correct color for instance', () => {
      const inst = makeInstance({ templateId: 1 });
      expect(getEquipmentInstanceTierColor(inst, templates)).toBe('#FB923C');
    });

    it('returns starter color for starter gear', () => {
      const inst = makeInstance({ isStarterGear: true, templateId: 1 });
      expect(getEquipmentInstanceTierColor(inst, templates)).toBe('#4B5563');
    });
  });

  describe('constants', () => {
    it('EQUIPMENT_TIER_COLORS 涵蓋 0（新手）+ T1~T7', () => {
      expect(Object.keys(EQUIPMENT_TIER_COLORS).length).toBe(8);
    });

    it('EQUIPMENT_TIER_NAMES 涵蓋 0（新手）+ T1~T7', () => {
      expect(Object.keys(EQUIPMENT_TIER_NAMES).length).toBe(8);
    });

    // § 6A.8：裝備階級與詞綴 Tier 共用同一組色階（App.css .affix-tag.tier-N）
    it('T1~T7 的顏色與詞綴 Tier 色階一致', () => {
      expect(EQUIPMENT_TIER_COLORS[1]).toBe('#6B7280');
      expect(EQUIPMENT_TIER_COLORS[2]).toBe('#9CA3AF');
      expect(EQUIPMENT_TIER_COLORS[3]).toBe('#4ADE80');
      expect(EQUIPMENT_TIER_COLORS[4]).toBe('#FACC15');
      expect(EQUIPMENT_TIER_COLORS[5]).toBe('#FB923C');
      expect(EQUIPMENT_TIER_COLORS[6]).toBe('#EF4444');
      expect(EQUIPMENT_TIER_COLORS[7]).toBe('#A855F7');
    });

    it('新手裝的顏色與 T1/T2 可區分', () => {
      expect(EQUIPMENT_TIER_COLORS[0]).not.toBe(EQUIPMENT_TIER_COLORS[1]);
      expect(EQUIPMENT_TIER_COLORS[0]).not.toBe(EQUIPMENT_TIER_COLORS[2]);
    });
  });

  describe('tier 欄位優先於舊的 shopTier/craftTier 推導', () => {
    it('有 tier 時直接採用', () => {
      expect(getEquipmentTierLevel(makeTemplate({ tier: 7, acquireType: 'craft', craftTier: 'entry' }))).toBe(7);
    });

    it('沒有 tier 時退回舊推導（遷移期相容）', () => {
      expect(getEquipmentTierLevel(makeTemplate({ acquireType: 'craft', craftTier: 'entry' }))).toBe(4);
    });

    it('新手裝一律為 0，即使填了 tier', () => {
      expect(getEquipmentTierLevel(makeTemplate({ tier: 5, acquireType: 'starter' }))).toBe(0);
    });
  });

  describe('getTierGroup', () => {
    it('T1~T3 為低階（商店可買）', () => {
      expect(getTierGroup(1)).toBe('低階');
      expect(getTierGroup(3)).toBe('低階');
    });

    it('T4~T5 為中階', () => {
      expect(getTierGroup(4)).toBe('中階');
      expect(getTierGroup(5)).toBe('中階');
    });

    it('T6~T7 為高階', () => {
      expect(getTierGroup(6)).toBe('高階');
      expect(getTierGroup(7)).toBe('高階');
    });
  });
});
