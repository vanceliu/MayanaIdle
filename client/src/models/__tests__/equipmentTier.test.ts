import { describe, it, expect } from 'vitest';
import {
  getEquipmentTierLevel,
  getEquipmentTierColor,
  getEquipmentInstanceTierLevel,
  getEquipmentInstanceTierColor,
  EQUIPMENT_TIER_COLORS,
  EQUIPMENT_TIER_NAMES,
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
    it('returns correct color for each tier', () => {
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'starter' }))).toBe('#9CA3AF');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'shop', shopTier: 'low' }))).toBe('#FFFFFF');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'shop', shopTier: 'mid' }))).toBe('#60A5FA');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'shop', shopTier: 'high' }))).toBe('#4ADE80');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'craft', craftTier: 'entry' }))).toBe('#FACC15');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'craft', craftTier: 'mid' }))).toBe('#FB923C');
      expect(getEquipmentTierColor(makeTemplate({ acquireType: 'craft', craftTier: 'top' }))).toBe('#EF4444');
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
      expect(getEquipmentInstanceTierColor(inst, templates)).toBe('#9CA3AF');
    });
  });

  describe('constants', () => {
    it('EQUIPMENT_TIER_COLORS has 7 entries', () => {
      expect(Object.keys(EQUIPMENT_TIER_COLORS).length).toBe(7);
    });

    it('EQUIPMENT_TIER_NAMES has 7 entries', () => {
      expect(Object.keys(EQUIPMENT_TIER_NAMES).length).toBe(7);
    });
  });
});
