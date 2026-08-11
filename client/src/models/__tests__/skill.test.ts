import { describe, it, expect } from 'vitest';
import {
  SKILL_CATALOG,
  SKILL_WIND_BLADE,
  isSkillReady,
  canUseSkill,
  instantiateSkill,
} from '../skill';
import type { Skill } from '../skill';

describe('skill model', () => {
  describe('SKILL_CATALOG', () => {
    it('should contain 50 skills (level 1-10)', () => {
      expect(SKILL_CATALOG.length).toBe(50);
    });

    it('should have 5 skills per level for levels 1-10', () => {
      for (let level = 1; level <= 10; level++) {
        const count = SKILL_CATALOG.filter(s => s.level === level).length;
        expect(count).toBe(5);
      }
    });

    it('all skills should have required fields', () => {
      SKILL_CATALOG.forEach(skill => {
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.level).toBeGreaterThanOrEqual(1);
        expect(skill.mpCost).toBeGreaterThan(0);
        expect(skill.cooldown).toBeGreaterThan(0);
        expect(skill.element).toBeTruthy();
        expect(skill.type).toBeTruthy();
        expect(skill.target).toBeTruthy();
      });
    });

    /*
     * 治癒量改走 § 21.4c 的技能側公式後，固定的 `healAmount` 欄位已移除 ——
     * 治癒與攻擊技能一樣以 `power` 為輸入，實際回復量依智力與裝備魔攻計算。
     */
    it('heal skills should have power', () => {
      const healSkills = SKILL_CATALOG.filter(s => s.type === 'heal');
      expect(healSkills.length).toBeGreaterThan(0);
      healSkills.forEach(skill => {
        expect(skill.power, skill.id).toBeGreaterThan(0);
      });
    });

    it('aoe skills should have aoeCenter and aoeRadius', () => {
      const aoeSkills = SKILL_CATALOG.filter(s => s.target === 'aoe');
      aoeSkills.forEach(skill => {
        expect(skill.aoeCenter === 'self' || skill.aoeCenter === 'target').toBe(true);
        expect(skill.aoeRadius).toBeGreaterThan(0);
        // target 模式必須有目標上限；self 模式無上限（§ 3.4）
        if (skill.aoeCenter === 'target') expect(skill.maxTargets).toBeGreaterThan(0);
        else expect(skill.maxTargets).toBeUndefined();
      });
    });

    it('buff skills should have buffEffect and buffDuration (except cleanse)', () => {
      const buffSkills = SKILL_CATALOG.filter(s => s.type === 'buff' && !s.cleanse);
      buffSkills.forEach(skill => {
        expect(skill.buffEffect).toBeTruthy();
        expect(skill.buffDuration).toBeGreaterThan(0);
      });
    });

    it('skill ids should be unique', () => {
      const ids = SKILL_CATALOG.map(s => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe('SKILL_WIND_BLADE', () => {
    it('should be level 1 wind element attack', () => {
      expect(SKILL_WIND_BLADE.id).toBe('wind-blade');
      expect(SKILL_WIND_BLADE.level).toBe(1);
      expect(SKILL_WIND_BLADE.element).toBe('wind');
      expect(SKILL_WIND_BLADE.type).toBe('attack');
    });

    it('should have lastUsedAt initialized to 0', () => {
      expect(SKILL_WIND_BLADE.lastUsedAt).toBe(0);
    });
  });

  describe('isSkillReady', () => {
    it('should be ready when cooldown has elapsed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 1000, cooldown: 3000 };
      expect(isSkillReady(skill, 4000)).toBe(true);
      expect(isSkillReady(skill, 4001)).toBe(true);
    });

    it('should not be ready when cooldown has not elapsed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 1000, cooldown: 3000 };
      expect(isSkillReady(skill, 2000)).toBe(false);
      expect(isSkillReady(skill, 3999)).toBe(false);
    });

    it('should be ready when lastUsedAt is 0 and enough time passed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 0, cooldown: 3000 };
      expect(isSkillReady(skill, 3000)).toBe(true);
      expect(isSkillReady(skill, 5000)).toBe(true);
    });

    it('should not be ready when lastUsedAt is 0 and not enough time passed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 0, cooldown: 3000 };
      expect(isSkillReady(skill, 1000)).toBe(false);
    });
  });

  describe('canUseSkill', () => {
    it('should return true when mp is sufficient and cooldown elapsed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 0, mpCost: 5, cooldown: 3000 };
      expect(canUseSkill(skill, 10, 5000)).toBe(true);
    });

    it('should return false when mp is insufficient', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 0, mpCost: 5, cooldown: 3000 };
      expect(canUseSkill(skill, 4, 5000)).toBe(false);
    });

    it('should return false when cooldown has not elapsed', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 5000, mpCost: 5, cooldown: 3000 };
      expect(canUseSkill(skill, 10, 6000)).toBe(false);
    });

    it('should return false when both mp insufficient and cooldown not ready', () => {
      const skill: Skill = { ...SKILL_WIND_BLADE, lastUsedAt: 5000, mpCost: 5, cooldown: 3000 };
      expect(canUseSkill(skill, 3, 6000)).toBe(false);
    });
  });

  describe('instantiateSkill', () => {
    it('should return skill with lastUsedAt = 0 for valid id', () => {
      const skill = instantiateSkill('wind-blade');
      expect(skill).not.toBeNull();
      expect(skill!.id).toBe('wind-blade');
      expect(skill!.lastUsedAt).toBe(0);
    });

    it('should return null for invalid id', () => {
      const skill = instantiateSkill('nonexistent-skill');
      expect(skill).toBeNull();
    });

    it('should return a fresh copy (not reference to catalog)', () => {
      const skill1 = instantiateSkill('wind-blade');
      const skill2 = instantiateSkill('wind-blade');
      expect(skill1).not.toBe(skill2);
      skill1!.lastUsedAt = 999;
      expect(skill2!.lastUsedAt).toBe(0);
    });
  });
});
