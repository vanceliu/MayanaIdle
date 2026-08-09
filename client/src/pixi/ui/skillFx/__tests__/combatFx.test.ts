/**
 * 戰鬥事件 → 演出計畫的換算（`48-vfx.md` § 48.7.7）。
 *
 * 這一層是純函式，所以「冰刻印的劍普攻是什麼顏色」不必開瀏覽器看。
 */
import { describe, it, expect } from 'vitest';
import type { Affix } from '../../../../models/affix';
import type { ActiveEffect } from '../../../../models/effect';
import { SKILL_CATALOG } from '../../../../models/skill';
import { ELEMENT_COLORS } from '../../projectileStyle';
import {
  HIT_LIFT, resolveAttackFxContext, resolveEnchantElement,
  resolveMonsterAttackFxPlan, resolveMuzzleOffset, resolvePlayerAttackFxPlan,
} from '../combatFx';

const WHITE = 0xffffff;

function brand(element: Affix['element']): Affix[] {
  return [{ type: 'element_brand', value: 10, element } as Affix];
}

/** 火矢附魔：分類以 `-enchant` 結尾，元素從技能表反查 */
function enchant(sourceSkillId: string): ActiveEffect {
  return {
    id: 'e1', sourceSkillId, sourceSkillName: '火矢附魔', category: 'fire-enchant',
    type: 'buff', target: 'player',
    name: '火矢附魔', description: '', tags: [],
    startTime: 0, duration: 300_000,
  };
}

describe('resolveEnchantElement', () => {
  it('抓得到附魔 buff 的元素', () => {
    expect(resolveEnchantElement([enchant('fire-arrow')])).toBe('fire');
  });

  it('沒有附魔就是 undefined', () => {
    expect(resolveEnchantElement([])).toBeUndefined();
  });

  it('debuff 不算 —— 只有 buff 才是附魔', () => {
    const asDebuff = { ...enchant('fire-arrow'), type: 'debuff' as const };
    expect(resolveEnchantElement([asDebuff])).toBeUndefined();
  });
});

describe('普攻顏色：刻印 → 附魔 → 白（§ 42.4）', () => {
  const plain = () => resolvePlayerAttackFxPlan({
    ranged: false, bow: false, ctx: resolveAttackFxContext(undefined, []),
  });

  it('沒刻印沒附魔就是白', () => {
    expect(plain().color).toBe(WHITE);
  });

  it('有刻印吃刻印', () => {
    const plan = resolvePlayerAttackFxPlan({
      ranged: false, bow: false,
      ctx: resolveAttackFxContext(brand('ice'), []),
    });
    expect(plan.color).toBe(ELEMENT_COLORS.ice);
  });

  it('沒刻印才吃附魔', () => {
    const plan = resolvePlayerAttackFxPlan({
      ranged: false, bow: false,
      ctx: resolveAttackFxContext(undefined, [enchant('fire-arrow')]),
    });
    expect(plan.color).toBe(ELEMENT_COLORS.fire);
  });

  it('兩者都有時刻印贏 —— 順序不可反過來', () => {
    const plan = resolvePlayerAttackFxPlan({
      ranged: false, bow: false,
      ctx: resolveAttackFxContext(brand('ice'), [enchant('fire-arrow')]),
    });
    expect(plan.color).toBe(ELEMENT_COLORS.ice);
  });
});

describe('resolvePlayerAttackFxPlan', () => {
  it('沒有技能就是普攻：不起手、命中走最小型態', () => {
    const plan = resolvePlayerAttackFxPlan({ ranged: false, bow: false, ctx: {} });
    expect(plan.cast).toBe(false);
    expect(plan.minimalImpact).toBe(true);
    expect(plan.weapon).toBe('swing');
  });

  it('拿弓的普攻是射箭', () => {
    const plan = resolvePlayerAttackFxPlan({ ranged: true, bow: true, ctx: {} });
    expect(plan.delivery).toBe('travel');
    expect(plan.shape).toBe('arrow');
    expect(plan.weapon).toBe('shoot');
  });

  it('有技能就走技能的判定 —— 起手要演、命中不是最小型態', () => {
    const fireball = SKILL_CATALOG.find(s => s.id === 'fireball')!;
    const plan = resolvePlayerAttackFxPlan({
      skill: fireball, ranged: true, bow: false, ctx: {},
    });
    expect(plan.cast).toBe(true);
    expect(plan.minimalImpact).toBe(false);
    expect(plan.color).toBe(ELEMENT_COLORS.fire);
  });

  it('技能顏色不吃武器刻印 —— 冰刻印的劍放火球還是紅的', () => {
    const fireball = SKILL_CATALOG.find(s => s.id === 'fireball')!;
    const plan = resolvePlayerAttackFxPlan({
      skill: fireball, ranged: true, bow: false,
      ctx: resolveAttackFxContext(brand('ice'), []),
    });
    expect(plan.color).toBe(ELEMENT_COLORS.fire);
  });
});

describe('resolveMonsterAttackFxPlan', () => {
  it('怪物不演武器 —— 它是圓球，沒有剪影可以揮', () => {
    const plan = resolveMonsterAttackFxPlan({ ranged: true, shape: 'arrow', color: WHITE });
    expect(plan.weapon).toBe('none');
    expect(plan.cast).toBe(false);
    expect(plan.delivery).toBe('travel');
    expect(plan.minimalImpact).toBe(true);
  });

  it('近戰怪沒有飛行段', () => {
    expect(resolveMonsterAttackFxPlan({ ranged: false, shape: 'circle', color: WHITE }).delivery)
      .toBe('melee');
  });
});

it('命中點的抬高只有一個出處', () => {
  /* 數字、爆點、投射物終點共用它。改成兩個值，數字就會跳在爆點外面 */
  expect(HIT_LIFT).toBeGreaterThan(0);
});

describe('resolveMuzzleOffset：投射物從哪裡出去', () => {
  const AIM = 0;

  it('拉弓時從弓上出去 —— 不是腳下也不是身體中線', () => {
    const m = resolveMuzzleOffset({ weaponAction: 'shoot', aim: AIM, shownWeapon: 'bow' });
    expect(m).not.toEqual({ x: 0, y: -HIT_LIFT });
  });

  it('施法不演武器，就從身體高度出去（§ 48.6.1）', () => {
    /*
     * 這一條擋的是「拿法杖放魔法，彈丸卻從法杖尖端跑出來」——
     * 那支法杖根本沒被畫出來，槍口是一個沒發生過的姿勢。
     * 距離遠看不出來，貼身打就整個歪掉。
     */
    expect(resolveMuzzleOffset({ weaponAction: 'none', aim: AIM, shownWeapon: 'staff' }))
      .toEqual({ x: 0, y: -HIT_LIFT });
  });

  it('近戰揮擊也不用槍口 —— 它根本沒有投射物', () => {
    expect(resolveMuzzleOffset({ weaponAction: 'swing', aim: AIM, shownWeapon: 'sword' }))
      .toEqual({ x: 0, y: -HIT_LIFT });
  });

  it('空手或副手（畫不出武器）退回身體高度', () => {
    expect(resolveMuzzleOffset({ weaponAction: 'shoot', aim: AIM, shownWeapon: undefined }))
      .toEqual({ x: 0, y: -HIT_LIFT });
  });

  it('算不出方向時退回身體高度，不是丟例外', () => {
    expect(resolveMuzzleOffset({ weaponAction: 'shoot', aim: null, shownWeapon: 'bow' }))
      .toEqual({ x: 0, y: -HIT_LIFT });
  });
});
