/**
 * 隨機技能模型（`07-affix-ability.md`）：適用部位、選池、各管道數值、顯示。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import {
  ABILITY_DEFINITIONS,
  ABILITY_CHANCE,
  isAbilitySlot,
  getAbilityCommonPool,
  getAbilityClassPool,
  getCraftAbilityOptions,
  getAbilityWeaponValue,
  resolveParamRange,
  rollAbility,
  findClassSkillAbility,
  formatAbilityDisplay,
  formatAbilityRange,
  getAbilityDefinition,
  isAbilityType,
  type Ability,
} from '../ability';
import { CLASS_SKILLS } from '../classSkills';

afterEach(() => { vi.restoreAllMocks(); });

const T5_SWORD = { slot: 'rightHand', tier: 5, smallMonsterDamage: 15, largeMonsterDamage: 12 };
const KNIGHT_ONLY = { ...T5_SWORD, requiredClass: ['knight'] };
const typesOf = (pool: string, group = 'weapon') => ABILITY_DEFINITIONS.filter(d => d.group === group && d.pool === pool).map(d => d.type);
const T5_RING = { slot: 'ring1', tier: 5 };

describe('適用部位與階級（§ 7S.1）', () => {
  it('T3 以上的右手武器、項鍊、戒指才有池；項鍊與戒指共用飾品組', () => {
    expect(isAbilitySlot({ slot: 'rightHand', tier: 3 })).toBe(true);
    expect(isAbilitySlot({ slot: 'rightHand', tier: 2 })).toBe(false);
    expect(isAbilitySlot({ slot: 'leftHand', tier: 5 })).toBe(false);
    expect(isAbilitySlot({ slot: 'helmet', tier: 5 })).toBe(false);
    expect(getAbilityCommonPool({ slot: 'necklace', tier: 6 })).toEqual(typesOf('common', 'accessory'));
    expect(getAbilityCommonPool(T5_RING)).toEqual(typesOf('common', 'accessory'));
  });

  it('武器組：共通 4 種、各職業 3 種；飾品組：共通 5 種、職業 2~4 種（§ 7S.5）', () => {
    expect(typesOf('common')).toEqual(['bonus_damage', 'skill_splash', 'combo_strike', 'focus_strike']);
    for (const cls of ['knight', 'elf', 'elementalist', 'priest', 'thief']) expect(typesOf(cls), cls).toHaveLength(3);
    expect(typesOf('common', 'accessory')).toEqual(['low_hp_regen', 'low_mp_regen', 'thorns', 'rage', 'calm']);
    expect(typesOf('knight', 'accessory')).toEqual(['shield_bash_boost', 'iron_shield_boost']);
    expect(typesOf('elf', 'accessory')).toEqual(['fire_arrow_boost', 'hawk_eye_boost', 'leap_shot_boost']);
    expect(typesOf('elementalist', 'accessory')).toEqual(['mana_shield_boost', 'mana_spring_boost']);
    expect(typesOf('priest', 'accessory')).toHaveLength(4);
    expect(typesOf('thief', 'accessory')).toEqual(['deadly_strike_boost', 'smoke_bomb_boost', 'precision_strike_boost', 'dodge_counter_boost']);
  });

  it('職業技能的 skillId 都對得到該職業的職業魔法', () => {
    for (const def of ABILITY_DEFINITIONS.filter(d => d.pool !== 'common')) {
      const skill = CLASS_SKILLS.find(s => s.id === def.skillId);
      expect(skill?.className, def.type).toBe(def.pool);
    }
  });

  it('飾品的職業池只出飾品組', () => {
    expect(getAbilityClassPool(T5_RING, 'knight')).toEqual(typesOf('knight', 'accessory'));
    expect(getCraftAbilityOptions(T5_RING, 'elf')).toEqual([...typesOf('common', 'accessory'), ...typesOf('elf', 'accessory')]);
  });

  it('職業不能裝備該武器時沒有職業池', () => {
    expect(getAbilityClassPool(KNIGHT_ONLY, 'knight')).toEqual(typesOf('knight'));
    expect(getAbilityClassPool(KNIGHT_ONLY, 'thief')).toEqual([]);
    expect(getAbilityClassPool(T5_SWORD, 'thief')).toEqual(typesOf('thief'));
    expect(getAbilityClassPool(T5_SWORD, undefined)).toEqual([]);
  });
});

describe('抽取（§ 7S.2）', () => {
  it('商店／掉落：30% 才出', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ABILITY_CHANCE / 100);
    expect(rollAbility(T5_SWORD, { channel: 'drop', className: 'knight' })).toBeUndefined();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(rollAbility(T5_SWORD, { channel: 'drop', className: 'knight' })).toBeDefined();
  });

  it('共通／職業各 50%；職業池為空時一律共通', () => {
    const seq = (values: number[]) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => values[i++] ?? 0); };
    seq([0, 0.4, 0]);
    expect(getAbilityDefinition(rollAbility(T5_SWORD, { channel: 'drop', className: 'knight' })!.type)!.pool).toBe('knight');
    seq([0, 0.6, 0]);
    expect(getAbilityDefinition(rollAbility(T5_SWORD, { channel: 'drop', className: 'knight' })!.type)!.pool).toBe('common');
    seq([0, 0.4, 0]);
    expect(getAbilityDefinition(rollAbility(KNIGHT_ONLY, { channel: 'drop', className: 'elf' })!.type)!.pool).toBe('common');
  });

  it('掉落：參數在區間內，秒數依 0.1 秒單位', () => {
    for (let i = 0; i < 200; i++) {
      const a = rollAbility(T5_SWORD, { channel: 'drop', className: 'elf' });
      if (!a) continue;
      const def = getAbilityDefinition(a.type)!;
      for (const p of def.params) {
        const [, max] = resolveParamRange(p, T5_SWORD);
        expect(a.params[p.key]).toBeGreaterThanOrEqual(p.min);
        expect(a.params[p.key]).toBeLessThanOrEqual(max);
        expect((a.params[p.key] - p.min) % (p.step ?? 1)).toBe(0);
      }
    }
  });

  it('商店：每個參數取最弱值（↓ 取上限）', () => {
    const seq = (values: number[]) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => values[i++] ?? 0); };
    // 共通池第 3 條＝追打傷害（N ↓）
    seq([0, 0.6, 0.5]);
    expect(rollAbility(T5_SWORD, { channel: 'shop', className: 'knight' })).toEqual({ type: 'combo_strike', params: { every: 10, bonus: 10 } });
  });

  it('製作：必定帶指定技能、數值最弱；不在可選範圍則不給', () => {
    expect(rollAbility(KNIGHT_ONLY, { channel: 'craft', className: 'knight', chosen: 'bonus_damage' }))
      .toEqual({ type: 'bonus_damage', params: { chance: 5, damage: 5 } });
    expect(rollAbility(KNIGHT_ONLY, { channel: 'craft', className: 'knight', chosen: 'vengeance_boost' }))
      .toEqual({ type: 'vengeance_boost', params: { percent: 10 } });
    expect(rollAbility(KNIGHT_ONLY, { channel: 'craft', className: 'knight', chosen: 'backstab_boost' })).toBeUndefined();
    expect(rollAbility(KNIGHT_ONLY, { channel: 'craft', className: 'knight', chosen: 'iron_shield_boost' })).toBeUndefined();
    expect(rollAbility(KNIGHT_ONLY, { channel: 'craft', className: 'knight' })).toBeUndefined();
    expect(getCraftAbilityOptions(KNIGHT_ONLY, 'knight')).toEqual([...typesOf('common'), ...typesOf('knight')]);
  });

  it('追加傷害上限為武器值×1.5 四捨五入；上限 ≤ 5 時固定 5', () => {
    const range = (t: object) =>
      resolveParamRange(getAbilityDefinition('bonus_damage')!.params.find(p => p.key === 'damage')!, { slot: 'rightHand', tier: 3, ...t });
    expect(getAbilityWeaponValue(T5_SWORD)).toBe(14);
    expect(range(T5_SWORD)).toEqual([5, 21]);
    expect(range({ smallMonsterDamage: 18, largeMonsterDamage: 16 })).toEqual([5, 26]);
    expect(range({ smallMonsterDamage: 4, largeMonsterDamage: 3 })).toEqual([5, 6]);
    expect(range({ smallMonsterDamage: 3, largeMonsterDamage: 3 })).toEqual([5, 5]);
  });

  it('seed 中所有 T3+ 右手武器都有共通池', () => {
    for (const t of EQUIPMENT_SEEDS.filter(t => t.slot === 'rightHand' && (t.tier ?? 0) >= 3)) {
      expect(getAbilityCommonPool(t).length, t.name).toBe(4);
    }
  });
});

describe('同技能多件（§ 7S.3）', () => {
  it('職業技能取第一個參數較好的一件；同值依部位順序', async () => {
    const gear = [
      { slot: 'ring2', ability: { type: 'iron_shield_boost' as const, params: { reduction: 24 } } },
      { slot: 'ring1', ability: { type: 'iron_shield_boost' as const, params: { reduction: 22 } } },
      { slot: 'necklace', ability: { type: 'iron_shield_boost' as const, params: { reduction: 24 } } },
    ];
    expect(findClassSkillAbility(gear, 'knight', 'iron-shield')).toBe(gear[2].ability);
    const mana = [
      { slot: 'ring1', ability: { type: 'blood_mana_boost' as const, params: { hpCost: 7 } } },
      { slot: 'ring2', ability: { type: 'blood_mana_boost' as const, params: { hpCost: 3 } } },
    ];
    expect(findClassSkillAbility(mana, 'priest', 'blood-mana')).toBe(mana[1].ability);
  });

  it('數值類加總；平靜取最大、怒氣衰減取最小', async () => {
    const { sumAbilityParam, maxAbilityParam, minAbilityParam } = await import('../ability');
    const gear: { slot: string; ability: Ability }[] = [
      { slot: 'ring1', ability: { type: 'thorns', params: { percent: 30 } } },
      { slot: 'ring2', ability: { type: 'thorns', params: { percent: 40 } } },
      { slot: 'necklace', ability: { type: 'calm', params: { rate: 7 } } },
      { slot: 'ring1', ability: { type: 'rage', params: { decay: 12 } } },
      { slot: 'ring2', ability: { type: 'rage', params: { decay: 6 } } },
    ];
    expect(sumAbilityParam(gear, 'thorns', 'percent')).toBe(70);
    expect(maxAbilityParam(gear, 'calm', 'rate')).toBe(7);
    expect(minAbilityParam(gear, 'rage', 'decay')).toBe(6);
  });
});

describe('職業技能生效（§ 7S.3）', () => {
  it('只有該職業裝備時生效', () => {
    const gear = [{ ability: { type: 'rend_boost' as const, params: { percent: 20 } } }];
    expect(findClassSkillAbility(gear, 'knight', 'rend')).toEqual(gear[0].ability);
    expect(findClassSkillAbility(gear, 'elf', 'rend')).toBeUndefined();
    expect(findClassSkillAbility(gear, 'knight', 'shield-bash')).toBeUndefined();
  });
});

describe('顯示（§ 7S.7）', () => {
  it('名稱：效果，參數代入', () => {
    expect(formatAbilityDisplay({ type: 'focus_strike', params: { percent: 12 } }))
      .toBe('專注打擊：對同一隻怪每命中 1 下，之後對牠的傷害 +1.2%（上限 +100%）');
    expect(formatAbilityDisplay({ type: 'bonus_damage', params: { chance: 8, damage: 12 } })).toBe('追加傷害：命中 8% 機率追加 12 傷害');
    expect(formatAbilityDisplay({ type: 'binding_arrow_boost', params: { cooldown: 1500, root: 2000 } }))
      .toBe('束縛箭強化：束縛箭冷卻 −1.5 秒、定身 +2.0 秒');
    expect(formatAbilityDisplay({ type: 'holy_domain_boost', params: { mp: 10, cooldown: 7000 } }))
      .toBe('神聖領域強化：神聖領域 MP 消耗 −10、冷卻 −7 秒');
  });

  it('Wiki 數值欄', () => {
    expect(formatAbilityRange(getAbilityDefinition('bonus_damage')!)).toBe('5~15%、5~武器值×1.5');
    expect(formatAbilityRange(getAbilityDefinition('focus_strike')!)).toBe('0.5~1.5%');
    expect(formatAbilityRange(getAbilityDefinition('binding_arrow_boost')!)).toBe('1.0~2.0 秒、1.0~3.0 秒');
    expect(formatAbilityRange(getAbilityDefinition('smoke_bomb_boost')!)).toBe('—');
  });

  it('型別判定', () => {
    expect(isAbilityType('rend_boost')).toBe(true);
    expect(isAbilityType('hit_stun')).toBe(false);
  });
});

describe('Wiki 效果敘述', () => {
  it('參數以區間代入，越小越好的參數加註', async () => {
    const { formatAbilityTemplate } = await import('../ability');
    expect(formatAbilityTemplate(getAbilityDefinition('bonus_damage')!)).toBe('命中 5~15% 機率追加 5~武器值×1.5 傷害');
    expect(formatAbilityTemplate(getAbilityDefinition('focus_strike')!)).toBe('對同一隻怪每命中 1 下，之後對牠的傷害 +0.5~1.5%（上限 +100%）');
    expect(formatAbilityTemplate(getAbilityDefinition('combo_strike')!)).toBe('每第 5~10（越小越好） 次出手傷害 +10~50%');
    expect(formatAbilityTemplate(getAbilityDefinition('binding_arrow_boost')!)).toBe('束縛箭冷卻 −1.0~2.0 秒、定身 +1.0~3.0 秒');
  });
});

describe('Wiki 數值區間標示', () => {
  it('區間片段標 range，其餘為一般文字', async () => {
    const { formatAbilityTemplateParts } = await import('../ability');
    expect(formatAbilityTemplateParts(getAbilityDefinition('rage')!).filter(p => p.range).map(p => p.text)).toEqual(['5~15']);
    expect(formatAbilityTemplateParts(getAbilityDefinition('bonus_damage')!)).toEqual([
      { text: '命中 ' }, { text: '5~15%', range: true }, { text: ' 機率追加 ' }, { text: '5~武器值×1.5', range: true }, { text: ' 傷害' },
    ]);
  });
});

describe('tooltip Alt 數值區間（34-ui-guidelines § 34.2）', () => {
  it('每個參數值後接區間；武器值上限依該件模板', async () => {
    const { formatAbilityDisplayParts } = await import('../ability');
    const ability: Ability = { type: 'bonus_damage', params: { chance: 8, damage: 12 } };
    expect(formatAbilityDisplayParts(ability, T5_SWORD)).toEqual([
      { text: '追加傷害：' }, { text: '命中 ' }, { text: '8%' }, { text: '(5 ~ 15%)', range: true },
      { text: ' 機率追加 ' }, { text: '12' }, { text: '(5 ~ 21)', range: true }, { text: ' 傷害' },
    ]);
  });

  it('秒數參數只在上限帶單位', async () => {
    const { formatAbilityDisplayParts } = await import('../ability');
    const ranges = formatAbilityDisplayParts({ type: 'binding_arrow_boost', params: { cooldown: 1500, root: 2000 } }, T5_SWORD)
      .filter(p => p.range).map(p => p.text);
    expect(ranges).toEqual(['(1.0 ~ 2.0 秒)', '(1.0 ~ 3.0 秒)']);
  });

  it('非區間片段串起來等於 formatAbilityDisplay', async () => {
    const { formatAbilityDisplayParts } = await import('../ability');
    for (const def of ABILITY_DEFINITIONS) {
      const ability: Ability = { type: def.type, params: Object.fromEntries(def.params.map(p => [p.key, p.min])) };
      const text = formatAbilityDisplayParts(ability, T5_SWORD).filter(p => !p.range).map(p => p.text).join('');
      expect(text).toBe(formatAbilityDisplay(ability));
    }
  });
});
