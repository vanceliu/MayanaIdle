/**
 * 職業池隨機技能對職業技能數值的改寫（`07-affix-ability.md` § 7S.5 職業池）。
 *
 * 一律以施放當下的武器為準（§ 7S.3「生效時點」）：戰鬥、天賦判定、快捷列都經過
 * `applyAbilityToSkills()`，存回 store 的仍是原技能（只更新 `lastUsedAt`）。
 */
import type { ClassName } from './character';
import type { Skill, SkillDebuffDef } from './skill';
import type { ActiveEffect, StatModifier } from './effect';
import { ABILITY_DEFINITIONS, ABILITY_FIRE_ARROW_BONUS, ABILITY_POISON_MIST_TICKS, findClassSkillAbility, type Ability } from './ability';

type GearLike = { ability?: Ability } | null | undefined;

/** 火矢附魔強化：非弓也附加 +15（`systems/combat.ts` 的 `fireEnchantApplies()`） */
export const FIRE_ENCHANT_ANY_WEAPON_STAT = 'fire_damage_any_weapon';
/** 精神匯聚強化：下一次攻擊技能傷害加成的 buff（§ 7S.5 牧師） */
export const NEXT_ATTACK_BONUS_CATEGORY = 'ability-next-attack';
export const NEXT_ATTACK_BONUS_STAT = 'next_attack_damage';
/** 淬毒強化：施放淬毒時寫進 buff 的毒傷加成%，命中上毒時讀取 */
export const ENVENOM_DOT_BONUS_STAT = 'envenom_dot_bonus';

const scale = (value: number, percent: number) => value * (100 + percent) / 100;
/** 說明文字的數字：整數照印，其餘取一位小數 */
const num = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const modValue = (s: Skill, stat: string) => s.buffModifiers?.find(m => m.stat === stat)?.value ?? 0;

function scaleDebuff(def: SkillDebuffDef | undefined, patch: (d: SkillDebuffDef) => SkillDebuffDef): SkillDebuffDef | undefined {
  return def ? patch(def) : def;
}

function setModifier(mods: StatModifier[] | undefined, stat: string, value: (prev: number) => number): StatModifier[] {
  const list = [...(mods ?? [])];
  const idx = list.findIndex(m => m.stat === stat);
  if (idx >= 0) list[idx] = { ...list[idx], value: value(list[idx].value) };
  return list;
}

const lessCooldown = (skill: Skill, ms: number) => Math.max(0, skill.cooldown - ms);
const lessMp = (skill: Skill, mp: number) => Math.max(0, skill.mpCost - mp);

type Transform = (skill: Skill, p: Record<string, number>) => Skill;

const TRANSFORMS: Partial<Record<Ability['type'], Transform>> = {
  shield_bash_boost: (s, p) => ({
    ...s,
    applyDebuff: scaleDebuff(s.applyDebuff, d => ({
      ...d,
      ...(d.duration !== undefined ? { duration: Math.floor(scale(d.duration, p.percent)) } : {}),
      ...(d.shieldDuration !== undefined ? { shieldDuration: Math.floor(scale(d.shieldDuration, p.percent)) } : {}),
    })),
  }),
  rend_boost: (s, p) => ({
    ...s,
    applyDebuff: scaleDebuff(s.applyDebuff, d => {
      const one = scale(d.dotDamagePercent ?? 0, p.percent);
      const two = scale(d.twoHandedDotDamagePercent ?? 0, p.percent);
      return {
        ...d,
        dotDamagePercent: one,
        twoHandedDotDamagePercent: two,
        description: `每秒 ${num(one * 100)}% 物理傷害（雙手武器 ${num(two * 100)}%）`,
      };
    }),
  }),
  iron_shield_boost: (s, p) => ({
    ...s,
    buffModifiers: setModifier(s.buffModifiers, 'damageReduction', () => p.reduction),
    buffEffect: `減傷${p.reduction}%`,
  }),
  blood_curse_boost: (s, p) => {
    const hits = (s.randomHits ?? 0) + p.hits;
    return {
      ...s,
      randomHits: hits,
      description: `扣自身最大 HP ${s.selfHpCostPercent}%，對 ${s.aoeRadius} 格內隨機打 ${hits} 下（可重複命中）`,
    };
  },
  /** 走普攻公式：每下一發，獨立判定命中與爆擊，屬性取武器元素（`arpgEventHandler` 的多段物理分支） */
  blood_slash: s => ({
    ...s, hits: 1, power: 0, element: 'none',
    description: `扣自身最大 HP ${s.selfHpCostPercent}%，對 ${s.aoeRadius} 格內隨機打 ${s.randomHits} 下（可重複命中），走普攻公式`,
  }),
  vengeance_boost: (s, p) => (s.selfBuff ? {
    ...s,
    selfBuff: {
      category: s.selfBuff.category, name: s.selfBuff.name, duration: s.selfBuff.duration,
      description: `攻擊力 +${p.percent}%`,
      modifiers: [{ stat: 'attack_power', value: p.percent, isPercent: true }],
    },
  } : s),

  fire_arrow_boost: s => ({
    ...s,
    buffEffect: `攻擊附加火屬性，額外 +${ABILITY_FIRE_ARROW_BONUS} 火傷害`,
    buffModifiers: [...(s.buffModifiers ?? []), { stat: FIRE_ENCHANT_ANY_WEAPON_STAT, value: ABILITY_FIRE_ARROW_BONUS, isPercent: false }],
  }),
  triple_shot_boost: (s, p) => ({ ...s, hits: (s.hits ?? 0) + p.arrows }),
  hawk_eye_boost: (s, p) => {
    const buffModifiers = setModifier(s.buffModifiers, 'ranged_attack', v => v + p.ranged);
    const shown = { ...s, buffModifiers };
    return { ...shown, buffEffect: `命中+${modValue(shown, 'hit')},遠攻+${modValue(shown, 'ranged_attack')}` };
  },
  binding_arrow_boost: (s, p) => ({
    ...s,
    cooldown: lessCooldown(s, p.cooldown),
    applyDebuff: scaleDebuff(s.applyDebuff, d => ({ ...d, ...(d.duration !== undefined ? { duration: d.duration + p.root } : {}) })),
  }),
  leap_shot_boost: (s, p) => ({ ...s, cooldown: lessCooldown(s, p.cooldown) }),
  /** 走普攻公式：每個目標一發，獨立判定命中與爆擊，吃火矢附魔（`arpgEventHandler` 的多段物理分支） */
  arrow_rain_boost: s => ({
    ...s, hits: 1, power: 0,
    description: `走普攻公式、受火矢附魔影響，無視目標 ${s.ignoreDefensePercent ?? 0}% 防禦`,
  }),

  mana_drain_boost: (s, p) => ({ ...s, abilityDamagePercent: p.percent }),
  element_boost_boost: (s, p) => ({ ...s, cooldown: lessCooldown(s, p.cooldown) }),
  mana_shield_boost: (s, p) => ({
    ...s,
    buffEffect: `${s.buffEffect ?? ''}，減傷 ${p.reduction}%`,
    buffModifiers: [...(s.buffModifiers ?? []), { stat: 'damageReduction', value: p.reduction, isPercent: true }],
  }),
  mana_spring_boost: (s, p) => {
    const buffModifiers = setModifier(s.buffModifiers, 'mp_regen_max_percent', v => scale(v, p.regen));
    const hpCost = (s.selfHpCostPercent ?? 0) * (100 - p.hpCost) / 100;
    const regen = modValue({ ...s, buffModifiers }, 'mp_regen_max_percent');
    return {
      ...s,
      buffModifiers,
      selfHpCostPercent: hpCost,
      buffEffect: `每次回魔另加最大 MP ${num(regen)}%，施放扣最大 HP ${num(hpCost)}%`,
    };
  },
  element_storm_boost: (s, p) => ({ ...s, mpCost: lessMp(s, p.mp), abilityDamagePercent: p.damage }),

  holy_shield_boost: (s, p) => ({
    ...s,
    buffModifiers: setModifier(s.buffModifiers, 'shield_absorb', v => v + p.absorb),
    buffEffect: `吸收 ${modValue(s, 'shield_absorb') + p.absorb}＋技能攻擊力 ${s.shieldPower ?? 0} 的傷害`,
    ...(s.buffDuration !== undefined ? { buffDuration: s.buffDuration + p.duration } : {}),
  }),
  spirit_gathering_boost: (s, p) => ({
    ...s,
    nextAttackBonusPercent: p.percent,
    buffEffect: `${s.buffEffect ?? ''}；下一次攻擊技能傷害 +${p.percent}%`,
  }),
  group_heal_boost: (s, p) => ({ ...s, mpCost: lessMp(s, p.mp), power: Math.floor(scale(s.power, p.power)) }),
  holy_judgment_boost: (s, p) => ({
    ...s,
    power: Math.floor(scale(s.power, p.power)),
    ...(s.maxTargets !== undefined ? { maxTargets: s.maxTargets + p.targets } : {}),
  }),
  blood_mana_boost: (s, p) => ({
    ...s,
    selfHpCostPercent: p.hpCost,
    description: `扣最大 HP ${p.hpCost}%，回復最大 MP ${s.mpRestorePercent ?? 0}%`,
  }),
  holy_smite_boost: (s, p) => ({
    ...s,
    dash: true,
    dashOptional: true,
    description: `突進至目標相鄰格，${s.description ?? ''}`,
    applyDebuff: { category: 'stun', name: '暈眩', description: '無法行動', duration: p.stun, stun: true, tags: ['stunned'] },
  }),
  holy_domain_boost: (s, p) => ({ ...s, mpCost: lessMp(s, p.mp), cooldown: lessCooldown(s, p.cooldown) }),

  envenom_boost: (s, p) => ({
    ...s,
    buffEffect: `普攻附毒，物理傷害${num(scale((s.onHitDebuff?.dotDamagePercent ?? 0) * 100, p.percent))}%每秒持續${(s.onHitDebuff?.dotDuration ?? 0) / 1000}s`,
    buffModifiers: [...(s.buffModifiers ?? []), { stat: ENVENOM_DOT_BONUS_STAT, value: p.percent, isPercent: true }],
  }),
  deadly_strike_boost: (s, p) => ({ ...s, ...(s.buffDuration !== undefined ? { buffDuration: s.buffDuration + p.duration } : {}) }),
  smoke_bomb_boost: s => {
    const evadeCharges = (s.evadeCharges ?? 0) + 1;
    return { ...s, evadeCharges, buffEffect: `絕對迴避怪物攻擊 ${evadeCharges} 次` };
  },
  precision_strike_boost: (s, p) => ({
    ...s,
    buffModifiers: [
      ...setModifier(s.buffModifiers, 'crit_rate', v => v + p.crit),
      { stat: 'defense', value: p.defense, isPercent: false },
    ],
    buffEffect: `命中+${modValue(s, 'hit')},爆擊+${modValue(s, 'crit_rate') + p.crit}%,防禦+${p.defense}`,
  }),
  backstab_boost: (s, p) => (s.selfBuff ? { ...s, selfBuff: { ...s.selfBuff, duration: s.selfBuff.duration + p.duration } } : s),
  poison_mist_boost: s => ({
    ...s,
    dotOnly: false,
    instantDotTicks: ABILITY_POISON_MIST_TICKS,
    description: `對自身 ${s.aoeRadius} 格內的怪物立即造成 ${ABILITY_POISON_MIST_TICKS} 秒份毒傷（每秒 ${num((s.applyDebuff?.dotDamagePercent ?? 0) * 100)}% 物理傷害）`,
  }),
  dodge_counter_boost: (s, p) => ({ ...s, description: `${s.description ?? ''}，${p.chance}% 機率再追加 1 次` }),
};

const CLASS_ABILITY_SKILL_IDS = new Set(ABILITY_DEFINITIONS.filter(d => d.skillId).map(d => d.skillId!));

/** 單一技能套用職業池隨機技能；無對應時回傳原物件 */
export function applyAbilityToSkill(skill: Skill, gear: readonly GearLike[], className: ClassName | undefined): Skill {
  if (!CLASS_ABILITY_SKILL_IDS.has(skill.id)) return skill;
  const ability = findClassSkillAbility(gear, className, skill.id);
  const transform = ability ? TRANSFORMS[ability.type] : undefined;
  return transform ? transform(skill, ability!.params) : skill;
}

/** 技能清單套用；裝備沒有職業池技能時回傳原陣列 */
export function applyAbilityToSkills(skills: Skill[], gear: readonly GearLike[], className: ClassName | undefined): Skill[] {
  const hasClassAbility = gear.some(g => g?.ability && ABILITY_DEFINITIONS.some(d => d.type === g.ability!.type && d.skillId));
  if (!hasClassAbility) return skills;
  return skills.map(s => applyAbilityToSkill(s, gear, className));
}

/** 精神匯聚強化（`07-affix-ability.md` § 7S.5）：施放後掛「下一次攻擊技能 +X%」，持續同該技能 buff */
export function withNextAttackBonus(effects: ActiveEffect[], skill: Skill, now: number): ActiveEffect[] {
  if (!skill.nextAttackBonusPercent) return effects;
  const bonus: ActiveEffect = {
    id: `buff-${NEXT_ATTACK_BONUS_CATEGORY}-${now}`,
    sourceSkillId: skill.id,
    sourceSkillName: skill.name,
    category: NEXT_ATTACK_BONUS_CATEGORY,
    type: 'buff',
    target: 'player',
    modifiers: [{ stat: NEXT_ATTACK_BONUS_STAT, value: skill.nextAttackBonusPercent, isPercent: true }],
    startTime: now,
    duration: skill.buffDuration ?? 0,
    tags: [],
    name: '精神匯聚強化',
    description: `下一次攻擊技能傷害 +${skill.nextAttackBonusPercent}%`,
  };
  return [...effects.filter(e => e.category !== NEXT_ATTACK_BONUS_CATEGORY), bonus];
}
