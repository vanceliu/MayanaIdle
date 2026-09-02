import { describe, it, expect } from 'vitest';
import { TALENT_PARAM_FIELDS, defaultParams, getParamFields } from '../talentParams';
import { MONSTER_DEBUFF_TAG_LABELS, SCRIPT_DEBUFF_LABELS } from '../scriptEngine';
import { ELEMENT_LABELS, RACE_LABELS } from '../monster';
import { REGIONS } from '../mapData';
import { SKILL_CATALOG } from '../skill';
import { CLASS_SKILLS, isClassMagic } from '../classSkills';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { TALENT_RULE_DEFS } from '../../db/seed/talentSeeds';

/**
 * 鑲材選項的**值域**（`51-auto-talent.md` § 51.4.1）。
 *
 * 覆蓋率由 `talentSeamCoverage.test.ts` 把關，這裡把關的是另一件事：
 * 下拉選單給的每一個值，執行期真的比得到。兩者對不上時規則永遠不成立，
 * 而且不會報錯 —— 只有玩家會發現那條規則沒動作。
 */

const WEAPON_TYPES = new Set(
  EQUIPMENT_SEEDS.filter(e => e.slot === 'rightHand').map(e => e.type),
);

/** 技能實際會掛在怪物身上的 tag（§ 24.4.1 下半） */
const MONSTER_TAGS = new Set<string>([
  ...SKILL_CATALOG.flatMap(s => s.applyDebuff?.tags ?? []),
  ...CLASS_SKILLS.flatMap(c => [
    ...(c.skill.applyDebuff?.tags ?? []),
    ...(c.skill.onHitDebuff?.tags ?? []),
  ]),
]);

const REGION_IDS = new Set(REGIONS.map(r => r.id));

/**
 * `ruleId.欄位` → 該欄位的合法值域。
 *
 * `null` ＝ 值只在本檔內流通（比較方向、反轉旗標這類），沒有外部值域可比。
 * **每個 select 欄位都必須在這張表裡**，漏一個下面的完整性測試就會紅。
 */
const VALUE_DOMAINS: Record<string, Set<string> | null> = {
  'weapon_type_is.match': WEAPON_TYPES,
  'current_area_is.match': REGION_IDS,
  'debuff_active.debuffType': new Set(Object.keys(SCRIPT_DEBUFF_LABELS)),
  'target_has_debuff.match': MONSTER_TAGS,
  'target_lacks_debuff.match': MONSTER_TAGS,
  'switch_target_by_debuff.match': MONSTER_TAGS,
  'switch_target_by_debuff.invert': null,
  'target_race.match': new Set(Object.keys(RACE_LABELS)),
  'target_element.match': new Set(Object.keys(ELEMENT_LABELS)),
  'field_has_race.match': new Set([...Object.keys(RACE_LABELS), ...Object.keys(ELEMENT_LABELS)]),
  'switch_target_by_kind.match': new Set([...Object.keys(RACE_LABELS), ...Object.keys(ELEMENT_LABELS)]),
  'target_attack_type.match': new Set(['melee', 'ranged', 'magic']),
  'target_size.match': new Set(['small', 'large']),
  'in_town.match': new Set(['town', 'field']),
  'potion.potionType': new Set(['red', 'orange', 'white']),
  'refill_to_percent.potionType': new Set(['red', 'orange', 'white']),
  'potion_cooldown_ready.potionType': new Set(['red', 'orange', 'white']),
  'speed_potion.speedPotionType': new Set(['green', 'enhanced-green']),
  'target_distance.compare': null,
  'target_defense.compare': null,
  'target_level_diff.compare': null,
};

describe('鑲材參數的選項值域', () => {
  it('每個 select 欄位都登記了值域', () => {
    const missing: string[] = [];
    for (const [ruleId, fields] of Object.entries(TALENT_PARAM_FIELDS)) {
      for (const f of fields) {
        if (f.kind !== 'select') continue;
        const key = `${ruleId}.${f.key}`;
        if (!(key in VALUE_DOMAINS)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it('每個選項值都是執行期比得到的值', () => {
    const bad: string[] = [];
    for (const [ruleId, fields] of Object.entries(TALENT_PARAM_FIELDS)) {
      for (const f of fields) {
        if (f.kind !== 'select') continue;
        const domain = VALUE_DOMAINS[`${ruleId}.${f.key}`];
        if (!domain) continue;
        for (const o of f.options) {
          if (!domain.has(o.value)) bad.push(`${ruleId}.${f.key} = ${o.value}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('每個 select 的預設值也在自己的選項裡', () => {
    for (const fields of Object.values(TALENT_PARAM_FIELDS)) {
      for (const f of fields) {
        if (f.kind !== 'select') continue;
        expect(f.options.map(o => o.value)).toContain(f.def);
      }
    }
  });

  it('怪物 debuff 標籤表與技能資料完全一致', () => {
    expect([...Object.keys(MONSTER_DEBUFF_TAG_LABELS)].sort()).toEqual([...MONSTER_TAGS].sort());
  });

  it('讀 match 的規則都有欄位可填', () => {
    // `current_area_is` 曾經漏掉欄位，條件因此永遠不成立
    for (const ruleId of ['current_area_is', 'target_has_debuff', 'weapon_type_is']) {
      expect(getParamFields(ruleId).some(f => f.key === 'match')).toBe(true);
    }
  });
});

describe('技能選單的範圍', () => {
  const skills = [
    ...SKILL_CATALOG.map(s => ({ ...s, lastUsedAt: 0 })),
    ...CLASS_SKILLS.map(c => ({ ...c.skill, lastUsedAt: 0 })),
  ];

  function pick(filter: string) {
    return skills.filter(sk => {
      switch (filter) {
        case 'attack': return sk.type === 'attack';
        case 'heal': return sk.type === 'heal';
        case 'buff': return sk.type === 'buff';
        case 'classMagic': return sk.type === 'attack' && isClassMagic(sk.id);
        default: return true;
      }
    });
  }

  it('施放治癒只列治癒技能', () => {
    const names = pick('heal').map(s => s.name);
    expect(names).toContain('治癒');
    expect(names).not.toContain('冷卻縮減');
    expect(names).not.toContain('祝福武器');
  });

  it('施放 Buff 只列 buff 技能', () => {
    const names = pick('buff').map(s => s.name);
    expect(names).toContain('祝福武器');
    expect(names).not.toContain('治癒');
    expect(names).not.toContain('中治癒');
  });

  it('職業魔法只列該系統的攻擊技能', () => {
    const ids = pick('classMagic').map(s => s.id);
    expect(ids).toContain('shield-bash');
    expect(ids).not.toContain('wind-blade');
  });

  it('治癒／Buff／職業魔法三種鑲材各自用對篩選器', () => {
    const filterOf = (ruleId: string) =>
      getParamFields(ruleId).find(f => f.kind === 'skill' && f.key === 'skillId');
    expect(filterOf('heal_skill')).toMatchObject({ filter: 'heal' });
    expect(filterOf('buff_skill')).toMatchObject({ filter: 'buff' });
    expect(filterOf('skill')).toMatchObject({ filter: 'attack' });
  });

  it('負重超過三類型共用，補給分頁也能鑲', () => {
    const def = TALENT_RULE_DEFS.find(d => d.ruleId === 'weight_over');
    expect(def?.appliesTo).toEqual(expect.arrayContaining(['combat', 'persistent', 'supply']));
    expect(getParamFields('weight_over')[0]).toMatchObject({ key: 'value', suffix: '%' });
  });

  it('技能就緒是共用條件，範圍依分頁決定', () => {
    const def = TALENT_RULE_DEFS.find(d => d.ruleId === 'skill_ready');
    expect(def?.appliesTo).toEqual(expect.arrayContaining(['combat', 'persistent']));
    expect(getParamFields('skill_ready')[0]).toMatchObject({ filter: 'byTalentType' });
  });
});

describe('走位動作', () => {
  it('只有保持距離與進逼（`15-excluded.md` § 15.6）', () => {
    const movement = TALENT_RULE_DEFS.filter(d => d.group === 'movement').map(d => d.ruleId);
    expect(movement).toEqual(['keep_distance', 'close_in']);
  });

  it('保持距離的距離留空，由引擎補成武器射程', () => {
    expect(getParamFields('keep_distance')[0]).toMatchObject({ key: 'distance', def: null });
    expect(defaultParams('keep_distance')).toEqual({});
    expect(defaultParams('close_in')).toEqual({ distance: 2 });
  });
});
