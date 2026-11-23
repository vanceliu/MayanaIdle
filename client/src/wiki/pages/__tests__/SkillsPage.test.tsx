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
  it.each([
    ['復仇之刃', '自身增益：復仇（施放後 10 秒，依已損失血量提升攻擊力，最高 +20／35／50%）'],
    ['背刺', '自身增益：背刺（施放後 5 秒，攻擊力 +15／30／50%）'],
  ])('%s 顯示自身增益（I／II／III）', (name, text) => {
    render(<SkillsPage />);
    const row = screen.getAllByRole('row').find(r => r.querySelector('strong')?.textContent === name)!;
    expect(row.textContent).toContain(text);
  });

  it('效果與持續欄列出 I／II／III 並標黃', () => {
    render(<SkillsPage />);
    const row = (name: string) => screen.getAllByRole('row').find(r => r.querySelector('strong')?.textContent === name)!;
    expect(row('鋼鐵護盾').textContent).toContain('減傷10／25／40%');
    expect(row('火矢附魔').textContent).toContain('100／200／300 秒');
    expect(row('火矢附魔').textContent).toContain('弓額外 +5／10／15 火傷害');
    expect(row('盾擊').textContent).toContain('0.5／1／1.5s／持盾 1／2／3s');
    expect(row('鋼鐵護盾').querySelector('.stat-changed')).not.toBeNull();
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
    expect(rowOf('元素風暴').textContent).toMatch(/\d+／\d+／\d+/);
    expect(rowOf('盾擊').querySelector('.stat-changed')).not.toBeNull();
    expect(rowOf('盾擊').textContent).toContain('12.5→11.3→10.0');
    expect(rowOf('盾擊').textContent).toContain('32 + 物理傷害');
    expect(rowOf('盾擊').textContent).not.toContain('%');
  });

  it('血濺咒殺：隨機打擊次數與 HP 消耗依等級；冷卻依節點數 0～4', () => {
    render(<SkillsPage />);
    const curse = rowOf('血濺咒殺');
    expect(curse.textContent).toContain('範圍(半徑4格/隨機1／2／4下)');
    expect(curse.textContent).toContain('扣自身最大 HP 25／20／15%');
    expect(curse.textContent).toContain('20.0→18.0→16.0→14.0→12.0');
    expect(rowOf('裂傷斬').textContent).toContain('20.0→17.0→14.0→11.0→8.0');
  });

  it('基礎魔法沒有等級，照表列、不標黃', () => {
    render(<SkillsPage />);
    for (const name of ['火球', '治癒', '加速術']) expect(rowOf(name).querySelector('.stat-changed'), name).toBeNull();
    expect(rowOf('火球').textContent).toContain('18');
  });
});
