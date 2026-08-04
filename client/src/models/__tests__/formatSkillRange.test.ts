import { describe, it, expect } from 'vitest';
import { formatSkillRange, SKILL_CATALOG } from '../skill';
import { CLASS_SKILLS } from '../classSkills';
import { getWeaponRange, isRangedWeapon, MELEE_WEAPON_RANGE } from '../equipment';
import { getWeaponAttackConfig } from '../../systems/playerCombatFSM';

/**
 * 技能射程顯示（`41-arpg-combat.md` § 3.1）。
 *
 * 攻擊技能才顯示射程；buff／heal 的 `range: 0` 是「對自己施放」，顯示出來只會誤導。
 * 用詞固定為「射程」——介面上的「範圍」已被 AOE 半徑佔用。
 */

describe('formatSkillRange', () => {
  it('遠程攻擊技能顯示格數', () => {
    expect(formatSkillRange({ type: 'attack', range: 12 })).toBe('12 格');
    expect(formatSkillRange({ type: 'attack', range: 15 })).toBe('15 格');
  });

  it('近身（1.5）寫「近身」而非「1.5 格」', () => {
    expect(formatSkillRange({ type: 'attack', range: 1.5 })).toBe('近身');
  });

  it('buff 與 heal 不顯示射程', () => {
    expect(formatSkillRange({ type: 'buff', range: 0 })).toBe('');
    expect(formatSkillRange({ type: 'heal', range: 0 })).toBe('');
    // 就算資料上填了距離，非攻擊技能一樣不顯示
    expect(formatSkillRange({ type: 'buff', range: 10 })).toBe('');
  });

  it('range 為 0 或未填的攻擊技能不顯示（對自身，無距離判定）', () => {
    expect(formatSkillRange({ type: 'attack', range: 0 })).toBe('');
    expect(formatSkillRange({ type: 'attack', range: undefined })).toBe('');
  });
});

describe('技能資料的射程完整性', () => {
  it('每個通用攻擊魔法都有 range', () => {
    const missing = SKILL_CATALOG
      .filter(s => s.type === 'attack' && !s.range)
      .map(s => s.name);
    expect(missing).toEqual([]);
  });

  it('每個職業攻擊技能都有 range', () => {
    const missing = CLASS_SKILLS
      .filter(d => d.skill.type === 'attack' && !d.skill.range)
      .map(d => d.name);
    expect(missing).toEqual([]);
  });

  it('所有攻擊技能都顯示得出射程（介面不會出現空白欄）', () => {
    const blank = SKILL_CATALOG
      .filter(s => s.type === 'attack')
      .filter(s => formatSkillRange(s) === '')
      .map(s => s.name);
    expect(blank).toEqual([]);
  });

  it('近身技能確實存在（顯示射程對近戰職業才有意義）', () => {
    const melee = CLASS_SKILLS.filter(d => formatSkillRange(d.skill) === '近身');
    expect(melee.length).toBeGreaterThan(0);
  });
});

describe('武器射程', () => {
  it('弓是唯一的遠程武器，其餘一律近戰', () => {
    expect(getWeaponRange('bow')).toBe(15);
    expect(isRangedWeapon('bow')).toBe(true);

    for (const t of ['sword', 'dagger', 'axe', 'mace', 'staff', 'magicBook',
                     'twoHandSword', 'twoHandAxe', 'twoHandStaff',
                     'dualBlade', 'claw', 'shield', 'armGuard']) {
      expect(getWeaponRange(t), `${t} 應為近戰`).toBe(MELEE_WEAPON_RANGE);
      expect(isRangedWeapon(t), `${t} 不應是遠程`).toBe(false);
    }
  });

  it('未知或未裝備武器視為近戰（赤手空拳）', () => {
    expect(getWeaponRange(undefined)).toBe(MELEE_WEAPON_RANGE);
    expect(getWeaponRange('unknown-type')).toBe(MELEE_WEAPON_RANGE);
  });

  it('FSM 的攻擊設定與共用常數一致（不可各自硬編）', () => {
    expect(getWeaponAttackConfig('bow')).toEqual({ attackType: 'ranged', range: 15 });
    expect(getWeaponAttackConfig('sword')).toEqual({ attackType: 'melee', range: MELEE_WEAPON_RANGE });
  });

  it('法杖與魔導書的普通攻擊也要貼身（法系輸出靠技能射程）', () => {
    expect(isRangedWeapon('staff')).toBe(false);
    expect(isRangedWeapon('magicBook')).toBe(false);
  });
});
