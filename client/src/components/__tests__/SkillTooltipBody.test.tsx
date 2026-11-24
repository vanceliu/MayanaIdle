// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkillTooltipBody } from '../SkillTooltipBody';
import { applyAbilityToSkill } from '../../models/abilitySkill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { AbilityType } from '../../models/ability';
import { resolveSkillWithoutStars } from '../../models/skillStar';

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

describe('範圍', () => {
  it('沒有半徑的群體技能顯示「全隊」', () => {
    for (const id of ['group-heal', 'holy-domain']) {
      const skill = instantiateFromTemplate(id)!;
      const { container } = render(<SkillTooltipBody base={skill} shown={skill} healOf={p => p} />);
      expect(container.textContent).toContain('範圍: 全隊');
    }
  });
});

describe('隨星盤變動的數值一律標黃（`56-star-chart.md` § 56.5）', () => {
  it('點滿（＝表列）時，物理段與冷卻照樣標黃；技能攻擊力、MP 不隨等級變動不標', () => {
    const bash = instantiateFromTemplate('shield-bash')!;
    const floor = resolveSkillWithoutStars(bash, [], { className: 'knight', starChart: [] });
    const { container } = render(
      <SkillTooltipBody base={bash} shown={bash} references={[floor]} healOf={p => p} physicalOf={scale => Math.floor(100 * scale)} />,
    );
    const marked = Array.from(container.querySelectorAll('.stat-changed')).map(e => e.textContent);
    expect(marked).toContain('100');
    expect(marked).toContain(String(bash.cooldown / 1000));
    expect(marked).not.toContain(String(bash.power));
    expect(marked).not.toContain(String(bash.mpCost));
  });

  it('基礎魔法沒有星盤等級，數值不標', () => {
    const blade = { ...instantiateFromTemplate('shield-bash')!, id: 'wind-blade' };
    const floor = resolveSkillWithoutStars(blade, [], { className: 'knight', starChart: [] });
    const { container } = render(<SkillTooltipBody base={blade} shown={blade} references={[floor]} healOf={p => p} />);
    expect(container.querySelectorAll('.stat-changed')).toHaveLength(0);
  });
});

