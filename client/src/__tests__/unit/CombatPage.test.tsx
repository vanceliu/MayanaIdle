// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CombatPage } from '../../wiki/pages/CombatPage';
import {
  DAMAGE_REDUCTION_CAP,
  MAGIC_DEFENSE_CONTRIBUTION_CAP,
} from '../../systems/combat';

describe('戰鬥計算 wiki 頁', () => {
  it('防禦上限引用實作常數，沒有寫死的舊值 65', () => {
    const { container } = render(<CombatPage />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('防禦上限 65');
    expect(text).toContain(String(DAMAGE_REDUCTION_CAP));
  });

  it('列出魔法減傷與魔法抗性', () => {
    render(<CombatPage />);
    expect(screen.getByText('魔法抗性')).toBeTruthy();
    expect(screen.getByText(/魔法減傷率 = min/)).toBeTruthy();
  });

  it('標明裝備防禦對魔法只有一半效力，貢獻上限為實作值', () => {
    const { container } = render(<CombatPage />);
    const text = container.textContent ?? '';
    expect(text).toContain(`${MAGIC_DEFENSE_CONTRIBUTION_CAP}%`);
  });

  it('涵蓋所有戰鬥區塊', () => {
    render(<CombatPage />);
    for (const title of [
      '物理攻擊（普通攻擊）',
      '技能攻擊（魔法）',
      '命中率',
      '玩家防禦減傷',
      '魔法抗性',
      '迴避率',
      '爆擊',
      '格擋',
      '攻擊速度',
      '元素克制關係',
    ]) {
      expect(screen.getByText(title), title).toBeTruthy();
    }
  });
});
