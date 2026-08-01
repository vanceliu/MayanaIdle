import { describe, it, expect } from 'vitest';
import { applySkillSelfBuff } from '../arpgEventHandler';
import { getDebuffImmunityRate, hasDebuffImmunityBuff } from '../playerDebuffSystem';
import { getSkillTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { ActiveEffect } from '../../models/effect';
import type { Skill } from '../../models/skill';

function char(hp: number, maxHp: number): Character {
  return {
    name: 'T', className: 'knight', level: 50, exp: 0, expToNext: 100,
    hp, maxHp, mp: 100, maxMp: 100,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [],
    areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

const withLastUsed = (id: string): Skill => ({ ...getSkillTemplate(id)!, lastUsedAt: 0 });

describe('復仇之刃 selfBuff（§ 23.3，使用者定案版）', () => {
  const vengeance = () => withLastUsed('vengeance');

  it('技能定義帶有 scaleByMissingHp，上限 50%、持續 10 秒', () => {
    expect(vengeance().selfBuff).toMatchObject({
      category: 'vengeance',
      duration: 10000,
      scaleByMissingHp: { stat: 'attack_power', maxPercent: 50 },
    });
  });

  it('滿血時不施加 buff', () => {
    expect(applySkillSelfBuff(vengeance(), char(100, 100), [], 1000)).toBeNull();
  });

  it('損失 30% 血量 → 攻擊力 +30%', () => {
    const r = applySkillSelfBuff(vengeance(), char(70, 100), [], 1000);
    expect(r!.effects[0].modifiers).toContainEqual({ stat: 'attack_power', value: 30, isPercent: true });
  });

  it('損失 80% 血量仍以 50% 為上限', () => {
    const r = applySkillSelfBuff(vengeance(), char(20, 100), [], 1000);
    expect(r!.effects[0].modifiers).toContainEqual({ stat: 'attack_power', value: 50, isPercent: true });
  });

  it('剛好 50% 血量 → +50%（邊界）', () => {
    const r = applySkillSelfBuff(vengeance(), char(50, 100), [], 1000);
    expect(r!.effects[0].modifiers).toContainEqual({ stat: 'attack_power', value: 50, isPercent: true });
  });

  it('同 category 互蓋，不會累積兩個復仇 buff', () => {
    const first = applySkillSelfBuff(vengeance(), char(70, 100), [], 1000)!;
    const second = applySkillSelfBuff(vengeance(), char(40, 100), first.effects, 2000)!;
    const vengeanceBuffs = second.effects.filter(e => e.category === 'vengeance');
    expect(vengeanceBuffs).toHaveLength(1);
    expect(vengeanceBuffs[0].modifiers).toContainEqual({ stat: 'attack_power', value: 50, isPercent: true });
  });
});

describe('背刺 selfBuff（§ 23.7，使用者定案版）', () => {
  const backstab = () => withLastUsed('backstab');

  it('固定 +50% 攻擊力、持續 5 秒', () => {
    expect(backstab().selfBuff).toMatchObject({
      category: 'backstab',
      duration: 5000,
      modifiers: [{ stat: 'attack_power', value: 50, isPercent: true }],
    });
  });

  it('不受血量影響，滿血也照樣施加', () => {
    const r = applySkillSelfBuff(backstab(), char(100, 100), [], 1000);
    expect(r).not.toBeNull();
    expect(r!.effects[0].duration).toBe(5000);
    expect(r!.effects[0].modifiers).toContainEqual({ stat: 'attack_power', value: 50, isPercent: true });
  });
});

describe('神聖領域免疫負面狀態（§ 23.6）', () => {
  const holyDomain = (): ActiveEffect => ({
    id: 'hd', sourceSkillId: 'holy-domain', sourceSkillName: '神聖領域',
    category: 'sanctuary', type: 'buff', target: 'player',
    startTime: 1000, duration: 10000, tags: [], name: '神聖領域',
    description: '', immuneDebuff: true,
  });

  it('技能定義帶有 immuneDebuff', () => {
    expect(getSkillTemplate('holy-domain')!.immuneDebuff).toBe(true);
  });

  it('生效期間所有 debuff 類型免疫率為 1', () => {
    const effects = [holyDomain()];
    for (const type of ['poison', 'bleed', 'curse', 'weaken', 'slow', 'stun'] as const) {
      expect(getDebuffImmunityRate(type, new Set(), effects, 5000), type).toBe(1);
    }
  });

  it('過期後不再免疫', () => {
    const effects = [holyDomain()];
    expect(hasDebuffImmunityBuff(effects, 20000)).toBe(false);
    expect(getDebuffImmunityRate('poison', new Set(), effects, 20000)).toBe(0);
  });

  it('沒有 buff 時維持原本的詞綴免疫判定', () => {
    expect(getDebuffImmunityRate('poison', new Set(), [], 5000)).toBe(0);
    expect(getDebuffImmunityRate('poison', new Set(['immune_poison']), [], 5000)).toBe(1);
  });
});
