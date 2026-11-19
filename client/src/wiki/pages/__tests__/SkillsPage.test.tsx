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
    expect(formatSelfBuff(skill('backstab'))).toBe('背刺（施放後 5 秒，攻擊力 +50%）');
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

describe('SkillsPage 星盤技能等級（`56-star-chart.md` § 56.5）', () => {
  const rowOf = (name: string) => screen.getAllByRole('row').find(r => r.querySelector('strong')?.textContent === name)!;

  it('職業技能威力列出 I／II／III，冷卻列出強化 0→1→2，變動的數字標黃', () => {
    render(<SkillsPage />);
    const curse = rowOf('血濺咒殺');
    expect(curse.textContent).toContain('28／34／40');
    expect(curse.querySelector('.stat-changed')).not.toBeNull();
    expect(rowOf('盾擊').textContent).toContain('12.5→11.3→10.0');
    expect(rowOf('盾擊').textContent).toContain('32 + 物理 ×0.7／0.85／1');
  });

  it('基礎魔法沒有等級，照表列、不標黃', () => {
    render(<SkillsPage />);
    for (const name of ['火球', '治癒', '加速術']) expect(rowOf(name).querySelector('.stat-changed'), name).toBeNull();
    expect(rowOf('火球').textContent).toContain('18');
  });
});
