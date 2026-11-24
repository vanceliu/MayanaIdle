// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SkillTagText, SkillTooltipTags } from '../SkillTagList';
import { applyAbilityToSkill } from '../../models/abilitySkill';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { Ability } from '../../models/ability';

const texts = (container: HTMLElement, selector: string) =>
  Array.from(container.querySelectorAll(selector)).map(e => e.textContent);

describe('技能 tooltip 標籤（`05-skill.md` § 5.5）', () => {
  it('三連射：【普攻】帶上武器元素，排在【弓】之前', () => {
    const triple = instantiateFromTemplate('triple-shot')!;
    const { container } = render(<SkillTooltipTags base={triple} shown={triple} basicAttackElement="fire" />);
    expect(texts(container, '.skill-tag')).toEqual(['普攻', '單體普攻', '物理', '火', '弓']);
    expect(container.querySelectorAll('.changed')).toHaveLength(0);
  });

  it('技能的元素取技能元素，不吃武器元素', () => {
    const smite = instantiateFromTemplate('holy-smite')!;
    const { container } = render(<SkillTooltipTags base={smite} shown={smite} basicAttackElement="fire" />);
    expect(texts(container, '.skill-tag')).toEqual(['技能', '單體技能', '技能元素', '魔法', '光']);
  });

  it('持續傷害另起一列，列首為名稱', () => {
    const rend = instantiateFromTemplate('rend')!;
    const { container } = render(<SkillTooltipTags base={rend} shown={rend} />);
    const lists = container.querySelectorAll('.skill-tag-list');
    expect(lists).toHaveLength(2);
    expect(lists[1].textContent).toBe('流血持續傷害物理');
  });

  it('隨機技能改寫後新增的標籤標黃', () => {
    const rain = instantiateFromTemplate('arrow-rain')!;
    const shown = applyAbilityToSkill(rain, [{ ability: { type: 'arrow_rain_boost', params: {} } as Ability }], 'elf');
    const { container } = render(<SkillTooltipTags base={rain} shown={shown} />);
    expect(texts(container, '.skill-tag')).toEqual(['普攻', '物理', '弓']);
    expect(texts(container, '.skill-tag.changed')).toEqual(['普攻', '物理']);
  });

  it('沒有標籤的技能不畫標籤列', () => {
    const shield = instantiateFromTemplate('iron-shield')!;
    const { container } = render(<SkillTooltipTags base={shield} shown={shield} />);
    expect(container.querySelectorAll('.skill-tag-list')).toHaveLength(0);
  });
});

describe('描述文字的標籤色塊', () => {
  it('【標籤】畫成色塊，括號內不是標籤的照原文', () => {
    const { container } = render(<SkillTagText text="【單體技能】命中時；【需裝備弓】" />);
    expect(texts(container, '.skill-tag')).toEqual(['單體技能']);
    expect(container.textContent).toBe('單體技能命中時；【需裝備弓】');
  });
});
