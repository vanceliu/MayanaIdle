/**
 * 星盤技能等級與強化對技能數值的轉換（`56-star-chart.md` § 56.5）。
 */
import { describe, it, expect } from 'vitest';
import { applyStarCooldown, applyStarLevel, resolveSkill, skillStarLevel, starLevelSuffix, skillCategoryLabel } from '../skillStar';
import type { Skill } from '../skill';
import { instantiateFromTemplate } from '../skillTemplate';
import type { Ability } from '../ability';
import type { ClassName } from '../character';

const skill = (id: string): Skill => instantiateFromTemplate(id)!;
const owner = (className: ClassName, starChart: string[] = []) => ({ className, starChart });
/** 某職業第 i 招的節點 id（強化 boost0/1、等級 level0/1） */
const nodes = (cls: ClassName, i: number, kind: 'level' | 'boost', count: number) =>
  Array.from({ length: count }, (_, k) => `${cls}-magic${i}-${kind}${k}`);
const atLevel = (cls: ClassName, i: number, level: 1 | 2 | 3) => owner(cls, nodes(cls, i, 'level', level - 1));

describe('職業技能 I／II／III（×0.7／0.85／1）', () => {
  it('魔法公式技能乘技能攻擊力', () => {
    expect([1, 2, 3].map(l => applyStarLevel(skill('blood-curse'), atLevel('knight', 5, l as 1 | 2 | 3)).power)).toEqual([28, 34, 40]);
  });

  it('A 組物理技：技能攻擊力不乘，物理段倍率帶在 physicalScale', () => {
    const s = applyStarLevel(skill('shield-bash'), atLevel('knight', 0, 1));
    expect(s.power).toBe(32);
    expect(s.physicalScale).toBe(0.7);
  });

  it('持續傷害 %：裂傷斬流血 70% → 49%／59%／70%', () => {
    expect([1, 2, 3].map(l => applyStarLevel(skill('rend'), atLevel('knight', 1, l as 1 | 2 | 3)).applyDebuff!.dotDamagePercent)).toEqual([0.49, 0.59, 0.7]);
  });

  it('輔助效果：鋼鐵護盾減傷 40 → 28／34／40', () => {
    const v = [1, 2, 3].map(l => applyStarLevel(skill('iron-shield'), atLevel('knight', 2, l as 1 | 2 | 3)).buffModifiers![0].value);
    expect(v).toEqual([28, 34, 40]);
  });

  it('攻擊技附帶效果：挑釁降攻 −20 → −14；復仇之刃上限 50 → 35', () => {
    expect(applyStarLevel(skill('taunt'), atLevel('knight', 3, 1)).applyDebuff!.modifiers![0].value).toBe(-14);
    expect(applyStarLevel(skill('vengeance'), atLevel('knight', 6, 1)).selfBuff!.scaleByMissingHp!.maxPercent).toBe(35);
  });

  it('精準射擊命中、鷹眼遠程攻擊力四捨五入；鷹眼命中照常捨去', () => {
    expect([1, 2, 3].map(l => applyStarLevel(skill('precise-shot'), atLevel('elf', 0, l as 1 | 2 | 3)).buffModifiers![0].value)).toEqual([2, 3, 3]);
    const hawk = applyStarLevel(skill('hawk-eye'), atLevel('elf', 3, 1)).buffModifiers!;
    expect(hawk.map(m => [m.stat, m.value])).toEqual([['hit', 3], ['ranged_attack', 2]]);
  });

  it('煙霧彈打折持續時間（盜賊 I ×0.3），次數不變', () => {
    const s = applyStarLevel(skill('smoke-bomb'), atLevel('thief', 2, 1));
    expect(s.buffDuration).toBe(3000);
    expect(s.evadeCharges).toBe(1);
  });

  it('聖光護盾固定值與技能攻擊力各自打折；血魔轉換回魔打折、扣血不變（牧師 I ×0.3）', () => {
    const shield = applyStarLevel(skill('holy-shield'), atLevel('priest', 0, 1));
    expect(shield.buffModifiers![0].value).toBe(30);
    expect(shield.shieldPower).toBe(3);
    const bm = applyStarLevel(skill('blood-mana'), atLevel('priest', 4, 1));
    expect([bm.mpRestorePercent, bm.selfHpCostPercent]).toEqual([6, 20]);
  });

  it('閃避反擊、冷卻縮減不轉換', () => {
    expect(applyStarLevel(skill('cd-reduce'), owner('elementalist'))).toEqual(skill('cd-reduce'));
    expect(skillStarLevel(skill('dodge-counter'), owner('thief'))).toBeNull();
  });

  it('他職業的等級節點不生效', () => {
    expect(applyStarLevel(skill('blood-curse'), owner('elf', nodes('knight', 5, 'level', 2))).power).toBe(28);
  });
});

describe('說明文字跟著等級改數字', () => {
  it('增益、debuff、自身增益、回魔的數字依序替換', () => {
    expect(applyStarLevel(skill('iron-shield'), atLevel('knight', 2, 1)).buffEffect).toBe('減傷28%');
    expect(applyStarLevel(skill('hawk-eye'), atLevel('elf', 3, 1)).buffEffect).toBe('命中+3,遠攻+2');
    expect(applyStarLevel(skill('rend'), atLevel('knight', 1, 1)).applyDebuff!.description).toBe('每秒 49% 物理傷害（雙手武器 59%）');
    expect(applyStarLevel(skill('backstab'), atLevel('thief', 4, 1)).selfBuff!.description).toBe('攻擊力 +15%');
    expect(applyStarLevel(skill('blood-mana'), atLevel('priest', 4, 1)).description).toBe('扣最大 HP 20%，回復最大 MP 6%');
    expect(applyStarLevel(skill('holy-shield'), atLevel('priest', 0, 1)).buffEffect).toBe('吸收 30＋技能攻擊力 3 的傷害');
  });
});

describe('冷卻：基礎＝表列 ÷ 0.8，每個強化 −10%', () => {
  it('盾擊 10s → 12.5s／11.3s／10s', () => {
    expect([0, 1, 2].map(n => applyStarCooldown(skill('shield-bash'), owner('knight', nodes('knight', 0, 'boost', n))).cooldown))
      .toEqual([12500, 11300, 10000]);
  });

  it('基礎魔法與沒有節點的職業技能不改冷卻', () => {
    expect(applyStarCooldown(skill('fireball'), owner('elementalist')).cooldown).toBe(6000);
    expect(applyStarCooldown(skill('cd-reduce'), owner('elementalist')).cooldown).toBe(60000);
  });
});

describe('與隨機技能的順序', () => {
  it('冷卻：先乘倍率再扣隨機技能秒數', () => {
    const bow = [{ ability: { type: 'binding_arrow_boost', params: { cooldown: 1500, root: 1000 } } as Ability }];
    expect(resolveSkill(skill('binding-arrow'), bow, owner('elf')).cooldown).toBe(11000);
  });

  it('數值：隨機技能先改寫，再乘等級倍率', () => {
    const ring = [{ ability: { type: 'iron_shield_boost', params: { reduction: 50 } } as Ability }];
    expect(resolveSkill(skill('iron-shield'), ring, owner('knight')).buffModifiers![0].value).toBe(35);
  });
});

describe('基礎魔法沒有等級（§ 56.5）', () => {
  it('攻擊、回復、護盾、增益一律照表列，沒有等級後綴', () => {
    const elementalist = owner('elementalist');
    for (const id of ['fireball', 'heal', 'magic-armor', 'haste', 'holy-light']) {
      expect(applyStarLevel(skill(id), elementalist), id).toEqual(skill(id));
      expect(skillStarLevel(skill(id), elementalist), id).toBeNull();
    }
  });
});

describe('盜賊職業技能倍率（§ 56.5）', () => {
  it('盜賊、元素師、牧師 I／II／III 為表列 ×0.3／0.6／1；騎士、妖精 ×0.7／0.85／1', () => {
    const hit = [1, 2, 3].map(l => applyStarLevel(skill('precision-strike'), atLevel('thief', 3, l as 1 | 2 | 3)).buffModifiers![0].value);
    expect(hit).toEqual([3, 6, 10]);
  });
});

describe('等級後綴', () => {
  it('I 不顯示，II／III 顯示羅馬數字；沒有等級的技能為空', () => {
    expect(starLevelSuffix(skill('shield-bash'), atLevel('knight', 0, 1))).toBe('');
    expect(starLevelSuffix(skill('shield-bash'), atLevel('knight', 0, 2))).toBe('(II)');
    expect(starLevelSuffix(skill('shield-bash'), atLevel('knight', 0, 3))).toBe('(III)');
    expect(starLevelSuffix(skill('dodge-counter'), owner('thief'))).toBe('');
  });
});

describe('技能分類（tooltip）', () => {
  it('職業技能、基礎魔法三系；聖光術為基礎魔法', () => {
    expect(['shield-bash', 'fireball', 'heal', 'magic-armor', 'haste', 'sanctuary', 'holy-light'].map(id => skillCategoryLabel(skill(id))))
      .toEqual(['職業技能', '基礎攻擊魔法', '基礎回復魔法', '基礎護盾增益魔法', '基礎護盾增益魔法', '基礎護盾增益魔法', '基礎魔法']);
  });
});
