import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillsPage } from '../SkillsPage';
import { CLASS_SKILLS } from '../../../models/classSkills';
import { formatSelfBuff } from '../../../models/skill';

/**
 * @vitest-environment jsdom
 *
 * 攻擊技能附帶的自身 buff（`23-class-magic.md` § 23.3 復仇之刃、§ 23.7 背刺）必須顯示在 Wiki 效果欄。
 */

const skill = (id: string) => CLASS_SKILLS.find(s => s.id === id)!.skill;

describe('formatSelfBuff', () => {
  it('復仇之刃：名稱、持續秒數、說明', () => {
    expect(formatSelfBuff(skill('vengeance'))).toBe('復仇（施放後 10 秒，依已損失血量提升攻擊力，最高 +50%）');
  });

  it('背刺：名稱、持續秒數、說明', () => {
    expect(formatSelfBuff(skill('backstab'))).toBe('背刺（施放後 5 秒，攻擊力 +50%（×1.5））');
  });

  it('沒有 selfBuff 回傳空字串', () => {
    expect(formatSelfBuff(skill('shield-bash'))).toBe('');
  });
});

describe('SkillsPage 職業技能效果欄', () => {
  it.each(['vengeance', 'backstab'])('%s 顯示自身增益', id => {
    render(<SkillsPage />);
    expect(screen.getByText(`自身增益：${formatSelfBuff(skill(id))}`)).toBeDefined();
  });

  it('騎士段顯示復仇之刃詳細規則（不作用於本次技能）', () => {
    render(<SkillsPage />);
    expect(screen.getByText(/不影響/).closest('.wiki-section-note')?.textContent).toContain('這次的復仇之刃本身');
  });
});
