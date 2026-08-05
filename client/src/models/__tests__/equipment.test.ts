import { describe, it, expect } from 'vitest';
import { isWeaponSlot, isWeaponEquipment, isOffhandDefenseType } from '../equipment';
import type { EquipmentInstance, EquipSlot } from '../equipment';

describe('equipment model', () => {
  describe('isWeaponSlot', () => {
    it('should return true for rightHand', () => {
      expect(isWeaponSlot('rightHand')).toBe(true);
    });

    it('should return true for leftHand', () => {
      expect(isWeaponSlot('leftHand')).toBe(true);
    });

    it('should return false for armor slots', () => {
      const armorSlots: EquipSlot[] = ['helmet', 'chest', 'belt', 'gloves', 'boots', 'necklace', 'ring1', 'ring2'];
      armorSlots.forEach(slot => {
        expect(isWeaponSlot(slot)).toBe(false);
      });
    });
  });

  // 統計的武器／防具分界（`37-statistics.md` § 37.1）：依裝備類型，不依欄位
  describe('isWeaponEquipment', () => {
    it('手部欄位的攻擊型裝備算武器', () => {
      expect(isWeaponEquipment('rightHand', 'twoHandSword')).toBe(true);
      expect(isWeaponEquipment('leftHand', 'sword')).toBe(true);
    });

    it('盾牌／魔導書／臂甲雖佔手部欄位，算防具', () => {
      expect(isOffhandDefenseType('shield')).toBe(true);
      expect(isWeaponEquipment('leftHand', 'shield')).toBe(false);
      expect(isWeaponEquipment('leftHand', 'magicBook')).toBe(false);
      expect(isWeaponEquipment('leftHand', 'armGuard')).toBe(false);
    });

    it('非手部欄位一律不是武器', () => {
      expect(isWeaponEquipment('chest', 'armor')).toBe(false);
      expect(isWeaponEquipment('ring1', 'armor')).toBe(false);
    });
  });

  describe('EquipmentInstance structure', () => {
    it('should support two-handed weapons', () => {
      const twoHander: EquipmentInstance = {
        templateId: 1,
        name: '雙手劍',
        type: 'twoHandSword',
        slot: 'rightHand',
        isTwoHanded: true,
        smallMonsterDamage: 25,
        largeMonsterDamage: 30,
        quality: 0,
        enhancement: 0,
        affixes: [],
        ownerId: 1,
        equipped: false,
      };
      expect(twoHander.isTwoHanded).toBe(true);
      expect(twoHander.slot).toBe('rightHand');
    });

    it('should support quality range 0-20', () => {
      const item: EquipmentInstance = {
        templateId: 1,
        name: '鐵劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 10,
        largeMonsterDamage: 8,
        quality: 0,
        enhancement: 0,
        affixes: [],
        ownerId: 1,
        equipped: false,
      };
      expect(item.quality).toBeGreaterThanOrEqual(0);
      expect(item.quality).toBeLessThanOrEqual(20);
    });

    it('should support up to 4 affixes', () => {
      const item: EquipmentInstance = {
        templateId: 1,
        name: '鐵劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 10,
        largeMonsterDamage: 8,
        quality: 0,
        enhancement: 0,
        affixes: [
          { type: 'attack_power', tier: 1, value: 5 },
          { type: 'crit_rate', tier: 2, value: 8 },
          { type: 'attack_speed', tier: 1, value: 6 },
          { type: 'element_brand', tier: 3, value: 11, element: 'fire' },
        ],
        ownerId: 1,
        equipped: false,
      };
      expect(item.affixes).toHaveLength(4);
    });

    it('should have smallMonsterDamage and largeMonsterDamage for weapons', () => {
      const weapon: EquipmentInstance = {
        templateId: 1,
        name: '鐵劍',
        type: 'sword',
        slot: 'rightHand',
        isTwoHanded: false,
        smallMonsterDamage: 15,
        largeMonsterDamage: 12,
        quality: 0,
        enhancement: 0,
        affixes: [],
        ownerId: 1,
        equipped: false,
      };
      expect(weapon.smallMonsterDamage).toBeDefined();
      expect(weapon.largeMonsterDamage).toBeDefined();
      expect(weapon.smallMonsterDamage).not.toBe(weapon.largeMonsterDamage);
    });

    it('should have defense for armor', () => {
      const armor: EquipmentInstance = {
        templateId: 2,
        name: '鐵甲',
        type: 'armor',
        slot: 'chest',
        isTwoHanded: false,
        defense: 10,
        quality: 0,
        enhancement: 0,
        affixes: [],
        ownerId: 1,
        equipped: false,
      };
      expect(armor.defense).toBe(10);
      expect(armor.smallMonsterDamage).toBeUndefined();
    });

    it('should support all 10 equipment slots', () => {
      const allSlots: EquipSlot[] = [
        'rightHand', 'leftHand', 'helmet', 'chest', 'belt',
        'gloves', 'boots', 'necklace', 'ring1', 'ring2',
      ];
      expect(allSlots).toHaveLength(10);
    });
  });
});
