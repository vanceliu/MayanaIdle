// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkillTooltipBody } from '../SkillTooltipBody';
import { applyAbilityToSkill } from '../../models/abilitySkill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { AbilityType } from '../../models/ability';

function body(id: string, type: AbilityType, params: Record<string, number>) {
  const base = instantiateFromTemplate(id)!;
  const shown = applyAbilityToSkill(base, [{ ability: { type, params } }], 'knight');
  const { container } = render(<SkillTooltipBody base={base} shown={shown} healOf={p => p} />);
  return {
    text: container.textContent ?? '',
    marked: Array.from(container.querySelectorAll('.stat-changed')).map(e => e.textContent),
  };
}

describe('技能 tooltip 的強化數字（`07-affix-ability.md` § 7S.7）', () => {
  it('裂傷斬：流血比例跟著改並標色', () => {
    const r = body('rend', 'rend_boost', { percent: 30 });
    expect(r.text).toContain('每秒 91% 物理傷害（雙手武器 110.5%）');
    expect(r.marked).toEqual(['91', '110.5']);
  });

  it('血濺咒殺：效果與範圍合成一行，只標次數', () => {
    const r = body('blood-curse', 'blood_curse_boost', { hits: 4 });
    expect(r.text).toContain('扣自身最大 HP 15%，對 4 格內隨機打 8 下（可重複命中）');
    expect(r.text).not.toContain('範圍:');
    expect(r.marked).toEqual(['8']);
  });

  it('復仇之刃：改寫後的增益數值標色', () => {
    const r = body('vengeance', 'vengeance_boost', { percent: 20 });
    expect(r.text).toContain('攻擊力 +20%');
    expect(r.marked).toEqual(['20']);
  });
});
