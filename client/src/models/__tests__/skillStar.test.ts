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

describe('職業技能 I／II／III（×0.3／0.6／1）', () => {
  it('精準射擊命中、鷹眼遠程攻擊力四捨五入；鷹眼命中照常捨去', () => {
    expect([1, 2, 3].map(l => applyStarLevel(skill('precise-shot'), atLevel('elf', 0, l as 1 | 2 | 3)).buffModifiers![0].value)).toEqual([1, 2, 3]);
    const hawk = [1, 2, 3].map(l => applyStarLevel(skill('hawk-eye'), atLevel('elf', 3, l as 1 | 2 | 3)).buffModifiers!.map(m => m.value));
    expect(hawk).toEqual([[1, 1], [3, 2], [5, 3]]);
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
    expect(applyStarLevel(skill('blood-curse'), owner('elf', nodes('knight', 5, 'level', 2))).randomHits).toBe(1);
  });
});

describe('妖精職業技能（§ 56.5）', () => {
  const levels = <T>(id: string, i: number, pick: (s: Skill) => T) =>
    [1, 2, 3].map(l => pick(applyStarLevel(skill(id), atLevel('elf', i, l as 1 | 2 | 3))));

  it('精準射擊、火矢附魔、鷹眼持續 100／200／300s', () => {
    for (const [id, i] of [['precise-shot', 0], ['fire-arrow', 1], ['hawk-eye', 3]] as const) {
      expect(levels(id, i, s => s.buffDuration), id).toEqual([100_000, 200_000, 300_000]);
    }
  });

  it('火矢附魔額外火傷 +5／+10／+15', () => {
    expect(levels('fire-arrow', 1, s => [s.buffModifiers![0].value, s.buffEffect])).toEqual([
      [5, '攻擊附加火屬性，弓額外 +5 火傷害'], [10, '攻擊附加火屬性，弓額外 +10 火傷害'], [15, '攻擊附加火屬性，弓額外 +15 火傷害'],
    ]);
  });

  it('三連射每箭 ×0.3／0.6／1；束縛箭定身 1／2.5／5s', () => {
    expect(levels('triple-shot', 2, s => s.physicalScale ?? 1)).toEqual([0.3, 0.6, 1]);
    expect(levels('binding-arrow', 4, s => [s.power, s.physicalScale ?? 1, s.applyDebuff!.duration])).toEqual([[20, 0.3, 1000], [20, 0.6, 2500], [20, 1, 5000]]);
  });

  it('穿透箭雨技能攻擊力 11／22／37、無視防禦 20／35／50%（說明文字跟著改）', () => {
    expect(levels('arrow-rain', 6, s => [s.power, s.ignoreDefensePercent, s.description])).toEqual([
      [11, 20, '無視目標 20% 防禦'], [22, 35, '無視目標 35% 防禦'], [37, 50, '無視目標 50% 防禦'],
    ]);
  });
});

describe('騎士職業技能（§ 56.5）', () => {
  const levels = <T>(id: string, i: number, pick: (s: Skill) => T) =>
    [1, 2, 3].map(l => pick(applyStarLevel(skill(id), atLevel('knight', i, l as 1 | 2 | 3))));

  it('A 組物理技：技能攻擊力不乘，物理段 ×0.3／0.6／1', () => {
    expect(levels('shield-bash', 0, s => [s.power, s.physicalScale ?? 1])).toEqual([[32, 0.3], [32, 0.6], [32, 1]]);
  });

  it('盾擊暈眩 0.5／1／1.5s，持盾 1／2／3s', () => {
    expect(levels('shield-bash', 0, s => [s.applyDebuff!.duration, s.applyDebuff!.shieldDuration])).toEqual([[500, 1000], [1000, 2000], [1500, 3000]]);
  });

  it('裂傷斬流血 70%（雙手 85%）→ 21／42／70%（25／51／85%）', () => {
    expect(levels('rend', 1, s => [s.applyDebuff!.dotDamagePercent, s.applyDebuff!.twoHandedDotDamagePercent]))
      .toEqual([[0.21, 0.25], [0.42, 0.51], [0.7, 0.85]]);
  });

  it('鋼鐵護盾減傷 10／25／40%', () => {
    expect(levels('iron-shield', 2, s => s.buffModifiers![0].value)).toEqual([10, 25, 40]);
  });

  it('挑釁降攻 −6／−12／−20%；血濺咒殺減速 −3／−6／−10%', () => {
    expect(levels('taunt', 3, s => s.applyDebuff!.modifiers![0].value)).toEqual([-6, -12, -20]);
    expect(levels('blood-curse', 5, s => s.applyDebuff!.modifiers![0].value)).toEqual([-3, -6, -10]);
  });

  it('血濺咒殺技能攻擊力不變；隨機打 1／2／4 下、扣 HP 25／20／15%（說明文字跟著改）', () => {
    expect(levels('blood-curse', 5, s => [s.power, s.randomHits, s.selfHpCostPercent, s.description])).toEqual([
      [40, 1, 25, '扣自身最大 HP 25%，對 4 格內隨機打 1 下（可重複命中）'],
      [40, 2, 20, '扣自身最大 HP 20%，對 4 格內隨機打 2 下（可重複命中）'],
      [40, 4, 15, '扣自身最大 HP 15%，對 4 格內隨機打 4 下（可重複命中）'],
    ]);
  });

  it('血濺咒殺強化（+X 下）與血濺斬擊照樣依等級', () => {
    const boost = [{ ability: { type: 'blood_curse_boost', params: { hits: 2 } } as Ability }];
    expect(resolveSkill(skill('blood-curse'), boost, atLevel('knight', 5, 1)).randomHits).toBe(3);
    const slash = resolveSkill(skill('blood-curse'), [{ ability: { type: 'blood_slash', params: {} } as Ability }], atLevel('knight', 5, 2));
    expect([slash.hits, slash.randomHits, slash.selfHpCostPercent, slash.physicalScale ?? 1]).toEqual([1, 2, 20, 1]);
  });

  it('復仇之刃自身攻擊力上限 20／35／50%', () => {
    expect(levels('vengeance', 6, s => s.selfBuff!.scaleByMissingHp!.maxPercent)).toEqual([20, 35, 50]);
  });
});

describe('說明文字跟著等級改數字', () => {
  it('增益、debuff、自身增益、回魔的數字依序替換', () => {
    expect(applyStarLevel(skill('iron-shield'), atLevel('knight', 2, 1)).buffEffect).toBe('減傷10%');
    expect(applyStarLevel(skill('hawk-eye'), atLevel('elf', 3, 1)).buffEffect).toBe('命中+1,遠攻+1');
    expect(applyStarLevel(skill('rend'), atLevel('knight', 1, 1)).applyDebuff!.description).toBe('每秒 21% 物理傷害（雙手武器 25%）');
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

  it('裂傷斬、血濺咒殺依技能線節點數（強化＋等級）決定冷卻', () => {
    const line = (i: number, n: number) => owner('knight', [`knight-magic${i}-boost0`, `knight-magic${i}-level0`, `knight-magic${i}-boost1`, `knight-magic${i}-level1`].slice(0, n));
    expect([0, 1, 2, 3, 4].map(n => applyStarCooldown(skill('rend'), line(1, n)).cooldown)).toEqual([20000, 17000, 14000, 11000, 8000]);
    expect([0, 1, 2, 3, 4].map(n => applyStarCooldown(skill('blood-curse'), line(5, n)).cooldown)).toEqual([20000, 18000, 16000, 14000, 12000]);
  });

  it('精準射擊、火矢附魔、鷹眼依技能線節點數：20／15／10／6.5／3s', () => {
    const line = (i: number, n: number) => owner('elf', [`elf-magic${i}-boost0`, `elf-magic${i}-level0`, `elf-magic${i}-boost1`, `elf-magic${i}-level1`].slice(0, n));
    for (const [id, i] of [['precise-shot', 0], ['fire-arrow', 1], ['hawk-eye', 3]] as const) {
      expect([0, 1, 2, 3, 4].map(n => applyStarCooldown(skill(id), line(i, n)).cooldown), id).toEqual([20000, 15000, 10000, 6500, 3000]);
    }
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
    expect(resolveSkill(skill('iron-shield'), ring, owner('knight')).buffModifiers![0].value).toBe(12);
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
  it('I／II／III 為表列 ×0.3／0.6／1', () => {
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
