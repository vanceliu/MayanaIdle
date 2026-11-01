import { describe, it, expect } from 'vitest';
import {
  applyDamageToMonster, applyMonsterAffixes, bloodthirstHeal, MONSTER_AFFIX_ORDER, monsterAffixLabels, monsterLogName,
  monsterRewardMultiplier, pickVenomDebuff, rollMonsterAffixCount, rollMonsterAffixes, thornsReflectBase, tickMonsterRegen,
} from '../monsterAffix';
import type { MonsterInstance } from '../monster';

function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function monster(over: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '哥布林', level: 50, currentHp: 1000, maxHp: 1000,
    attackMin: 100, attackMax: 151, defense: 33, exp: 100,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...over,
  };
}

describe('詞綴數與機率（25 § 25.12.1）', () => {
  it('各區段對應的詞綴數', () => {
    expect(rollMonsterAffixCount(60, () => 0.049)).toBe(1);
    expect(rollMonsterAffixCount(60, () => 0.05)).toBe(2);
    expect(rollMonsterAffixCount(60, () => 0.089)).toBe(2);
    expect(rollMonsterAffixCount(60, () => 0.09)).toBe(3);
    expect(rollMonsterAffixCount(60, () => 0.12)).toBe(4);
    expect(rollMonsterAffixCount(60, () => 0.1399)).toBe(4);
    expect(rollMonsterAffixCount(60, () => 0.14)).toBe(0);
  });

  it('等級未開放的區段作廢，不併入較少詞綴', () => {
    expect(rollMonsterAffixCount(29, () => 0.06)).toBe(0);
    expect(rollMonsterAffixCount(29, () => 0.01)).toBe(1);
    expect(rollMonsterAffixCount(30, () => 0.06)).toBe(2);
    expect(rollMonsterAffixCount(39, () => 0.1)).toBe(0);
    expect(rollMonsterAffixCount(40, () => 0.1)).toBe(3);
    expect(rollMonsterAffixCount(49, () => 0.13)).toBe(0);
    expect(rollMonsterAffixCount(50, () => 0.13)).toBe(4);
  });
});

describe('詞綴抽取（25 § 25.12.2）', () => {
  it('不重複，且依詞綴表順序排列', () => {
    // r=0.13 → 4 個；每次都抽池尾
    const roll = rollMonsterAffixes(60, [], seq(0.13, 0.999, 0.999, 0.999, 0.999, 0));
    expect(roll.affixes).toEqual(['regen', 'shield', 'gale', 'thorns']);
    expect(new Set(roll.affixes).size).toBe(4);
  });

  it('抽到劇毒／撕裂時決定附加的 debuff', () => {
    // r=0.01 → 1 個；index 3＝venom；50% 判定 0.2 → 中毒
    const roll = rollMonsterAffixes(10, [], seq(0.01, 0.35, 0.2));
    expect(roll).toEqual({ affixes: ['venom'], venom: 'poison' });
  });

  it('原本有中毒給流血、原本有流血給中毒', () => {
    expect(pickVenomDebuff(['poison'], () => 0)).toBe('bleed');
    expect(pickVenomDebuff(['curse', 'bleed'], () => 0.99)).toBe('poison');
    expect(pickVenomDebuff([], () => 0.6)).toBe('bleed');
  });

  it('詞綴表共 10 種', () => {
    expect(MONSTER_AFFIX_ORDER).toHaveLength(10);
  });
});

describe('屬性加成（25 § 25.12.2）', () => {
  it('狂暴、迅捷、巨大、堅硬、護盾', () => {
    const inst = applyMonsterAffixes(monster(), { affixes: ['frenzy', 'swift', 'giant', 'hardened', 'shield'] });
    expect(inst.attackMin).toBe(110);
    expect(inst.attackMax).toBe(166);
    expect(inst.attackInterval).toBe(902);
    expect(inst.maxHp).toBe(1200);
    expect(inst.currentHp).toBe(1200);
    expect(inst.defense).toBe(39);
    // 護盾以套用巨大後的最大 HP 計
    expect(inst.shieldMax).toBe(240);
    expect(inst.shieldRemaining).toBe(240);
  });

  it('劇毒／撕裂排在原本的 debuff 之後，觸發率 15%', () => {
    const inst = applyMonsterAffixes(
      monster({ debuffs: [{ type: 'curse', chance: 12 }] }),
      { affixes: ['venom'], venom: 'bleed' },
    );
    expect(inst.debuffs).toEqual([{ type: 'curse', chance: 12 }, { type: 'bleed', chance: 15 }]);
  });

  it('沒有詞綴時回傳原實例', () => {
    const base = monster();
    expect(applyMonsterAffixes(base, { affixes: [] })).toBe(base);
  });
});

describe('戰鬥效果（25 § 25.12.3）', () => {
  it('護盾先吸收，溢出才扣 HP', () => {
    const inst = monster({ shieldMax: 200, shieldRemaining: 50 });
    expect(applyDamageToMonster(inst, 80)).toBe(30);
    expect(inst.shieldRemaining).toBe(0);
    expect(inst.currentHp).toBe(970);
    expect(applyDamageToMonster(inst, 20)).toBe(20);
    expect(inst.currentHp).toBe(950);
  });

  it('嗜血：扣血量 20%，不超過最大 HP', () => {
    const inst = monster({ affixes: ['bloodthirst'], currentHp: 900 });
    expect(bloodthirstHeal(inst, 59)).toBe(11);
    expect(inst.currentHp).toBe(911);
    inst.currentHp = 995;
    expect(bloodthirstHeal(inst, 100)).toBe(5);
    expect(bloodthirstHeal(monster({ currentHp: 500 }), 100)).toBe(0);
  });

  it('再生：每滿 1000ms 回 2%，最少 1', () => {
    const inst = monster({ affixes: ['regen'], currentHp: 500 });
    expect(tickMonsterRegen(inst, 600)).toBe(0);
    expect(tickMonsterRegen(inst, 600)).toBe(20);
    expect(inst.currentHp).toBe(520);
    const tiny = monster({ affixes: ['regen'], currentHp: 10, maxHp: 30 });
    expect(tickMonsterRegen(tiny, 1000)).toBe(1);
  });

  it('再生：死亡後不回復', () => {
    const dead = monster({ affixes: ['regen'], currentHp: 0 });
    expect(tickMonsterRegen(dead, 5000)).toBe(0);
    expect(dead.currentHp).toBe(0);
  });

  it('荊棘：反彈基數 30%（floor）', () => {
    expect(thornsReflectBase(monster({ affixes: ['thorns'] }), 47)).toBe(14);
    expect(thornsReflectBase(monster(), 47)).toBe(0);
  });
});

describe('顯示與獎勵（25 § 25.12.4、§ 25.12.5）', () => {
  it('日誌名「詞綴 原名」，劇毒／撕裂依實際 debuff', () => {
    expect(monsterLogName(monster({ affixes: ['bloodthirst', 'frenzy'] }))).toBe('嗜血 狂暴 哥布林');
    expect(monsterLogName(monster({ affixes: ['venom'], venom: 'bleed' }))).toBe('撕裂 哥布林');
    expect(monsterLogName(monster())).toBe('哥布林');
    expect(monsterAffixLabels(monster({ affixes: ['venom', 'shield'], venom: 'poison' }))).toEqual(['劇毒', '護盾']);
  });

  it('獎勵倍率依詞綴數', () => {
    expect(monsterRewardMultiplier(monster())).toBe(1);
    expect(monsterRewardMultiplier(monster({ affixes: ['giant'] }))).toBe(1.05);
    expect(monsterRewardMultiplier(monster({ affixes: ['giant', 'regen'] }))).toBe(1.07);
    expect(monsterRewardMultiplier(monster({ affixes: ['giant', 'regen', 'gale'] }))).toBe(1.09);
    expect(monsterRewardMultiplier(monster({ affixes: ['giant', 'regen', 'gale', 'thorns'] }))).toBe(1.1);
  });
});
