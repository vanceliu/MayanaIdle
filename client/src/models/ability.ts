/**
 * 隨機技能（`docs/design/07-affix-ability.md`）。
 *
 * 存在實例的 `ability` 欄位，不佔詞綴洞、不吃品質、不受理印記。
 * 素質凍結由 `systems/gear.ts` 的 `getEffectiveGear()` 處理。
 */
import type { ClassName } from './character';
import { random } from '../core/rng';
import type { DisplayPart } from './affix';

export type AbilityType =
  // 武器共通池（§ 7S.5）
  | 'bonus_damage'
  | 'skill_splash'
  | 'combo_strike'
  | 'focus_strike'
  // 騎士
  | 'shield_bash_boost'
  | 'rend_boost'
  | 'iron_shield_boost'
  | 'blood_curse_boost'
  | 'blood_slash'
  | 'vengeance_boost'
  // 妖精
  | 'fire_arrow_boost'
  | 'triple_shot_boost'
  | 'hawk_eye_boost'
  | 'binding_arrow_boost'
  | 'leap_shot_boost'
  | 'arrow_rain_boost'
  // 元素師
  | 'mana_drain_boost'
  | 'element_boost_boost'
  | 'mana_shield_boost'
  | 'mana_spring_boost'
  | 'element_storm_boost'
  // 牧師
  | 'holy_shield_boost'
  | 'spirit_gathering_boost'
  | 'group_heal_boost'
  | 'holy_judgment_boost'
  | 'blood_mana_boost'
  | 'holy_smite_boost'
  | 'holy_domain_boost'
  // 盜賊
  | 'envenom_boost'
  | 'deadly_strike_boost'
  | 'smoke_bomb_boost'
  | 'precision_strike_boost'
  | 'backstab_boost'
  | 'poison_mist_boost'
  | 'dodge_counter_boost'
  // 飾品共通池
  | 'low_hp_regen'
  | 'low_mp_regen'
  | 'thorns'
  | 'rage'
  | 'calm';

/** 參數值以整數儲存；秒數以毫秒儲存；`tenths` 參數以 0.1% 儲存 */
export interface Ability {
  type: AbilityType;
  params: Record<string, number>;
}

export type AbilityPool = 'common' | ClassName;
/** 武器組（攻擊）／飾品組（防禦，項鍊與戒指共用）（§ 7S.5） */
export type AbilityGroup = 'weapon' | 'accessory';

/** `weaponValue`：區間上限為武器值 × `weaponValueScale`（§ 7S.2「數值單位」） */
export interface AbilityParamDef {
  key: string;
  min: number;
  max: number | 'weaponValue';
  /** `max: 'weaponValue'` 的倍數，預設 1；乘完四捨五入 */
  weaponValueScale?: number;
  /** 抽取單位，預設 1；秒數參數為 100（0.1 秒）或 1000（1 秒） */
  step?: number;
  unit: '%' | 's' | '';
  /** 數值越小越好（§ 7S.2「最弱值」標 ↓） */
  lowerIsBetter?: boolean;
  /** 以 0.1% 為單位（儲存值 ÷ 10 為 %） */
  tenths?: boolean;
}

export interface AbilityDefinition {
  type: AbilityType;
  name: string;
  group: AbilityGroup;
  pool: AbilityPool;
  /** 職業池技能對應的職業技能 id（`models/classSkills.ts`） */
  skillId?: string;
  params: AbilityParamDef[];
  /** 效果敘述，`{key}` 代入參數 */
  description: string;
}

/** 商店／掉落的出現機率（§ 7S.2） */
export const ABILITY_CHANCE = 30;
export const ABILITY_MIN_TIER = 3;
/** 「5~武器值」的下限，上限 ≤ 此值時固定為此值 */
export const ABILITY_WEAPON_VALUE_MIN = 5;
/** 擴散半徑（格） */
export const ABILITY_SPLASH_RADIUS = 3;
/** 專注打擊的加成上限（%） */
export const ABILITY_FOCUS_MAX_PERCENT = 100;
/** 火矢附魔強化：非弓的附加火傷害 */
export const ABILITY_FIRE_ARROW_BONUS = 15;
/** 毒霧強化：一次打出的秒數 */
export const ABILITY_POISON_MIST_TICKS = 10;
/** 怒氣上限與怒氣狀態的加成（§ 7S.5） */
export const ABILITY_RAGE_MAX = 100;
export const ABILITY_RAGE_MAGIC_RESIST = 10;
export const ABILITY_RAGE_DEFENSE = 5;
/** 平靜上限 */
export const ABILITY_CALM_MAX = 100;
/** 低血／低魔回復的門檻（有效最大值的 %） */
export const ABILITY_LOW_RESOURCE_PERCENT = 50;

const ms = (key: string, minSec: number, maxSec: number, stepSec: number): AbilityParamDef =>
  ({ key, min: minSec * 1000, max: maxSec * 1000, step: stepSec * 1000, unit: 's' });

export const ABILITY_DEFINITIONS: AbilityDefinition[] = [
  { type: 'bonus_damage', name: '追加傷害', group: 'weapon', pool: 'common',
    params: [
      { key: 'chance', min: 5, max: 15, unit: '%' },
      { key: 'damage', min: 5, max: 'weaponValue', weaponValueScale: 1.5, unit: '' },
    ],
    description: '命中 {chance} 機率追加 {damage} 傷害' },
  { type: 'skill_splash', name: '單體技能擴散', group: 'weapon', pool: 'common',
    params: [{ key: 'percent', min: 15, max: 25, unit: '%' }],
    description: `單體技能命中時，${ABILITY_SPLASH_RADIUS} 格內其他怪受到該下傷害 {percent}` },
  { type: 'combo_strike', name: '追打傷害', group: 'weapon', pool: 'common',
    params: [{ key: 'every', min: 5, max: 10, unit: '', lowerIsBetter: true }, { key: 'bonus', min: 10, max: 50, unit: '%' }],
    description: '每第 {every} 次出手傷害 +{bonus}' },
  { type: 'focus_strike', name: '專注打擊', group: 'weapon', pool: 'common',
    params: [{ key: 'percent', min: 5, max: 15, unit: '%', tenths: true }],
    description: `對同一隻怪每命中 1 下，之後對牠的傷害 +{percent}（上限 +${ABILITY_FOCUS_MAX_PERCENT}%）` },

  { type: 'shield_bash_boost', name: '盾擊強化', group: 'accessory', pool: 'knight', skillId: 'shield-bash',
    params: [{ key: 'percent', min: 20, max: 30, unit: '%' }], description: '盾擊暈眩時間 +{percent}' },
  { type: 'rend_boost', name: '裂傷斬強化', group: 'weapon', pool: 'knight', skillId: 'rend',
    params: [{ key: 'percent', min: 10, max: 30, unit: '%' }], description: '裂傷斬流血傷害 +{percent}' },
  { type: 'iron_shield_boost', name: '鋼鐵護盾強化', group: 'accessory', pool: 'knight', skillId: 'iron-shield',
    params: [{ key: 'reduction', min: 42, max: 50, unit: '%' }], description: '鋼鐵護盾減傷改為 {reduction}' },
  { type: 'blood_curse_boost', name: '血濺咒殺強化', group: 'weapon', pool: 'knight', skillId: 'blood-curse',
    params: [{ key: 'hits', min: 1, max: 4, unit: '' }], description: '血濺咒殺打擊次數 +{hits}' },
  { type: 'blood_slash', name: '血濺斬擊', group: 'weapon', pool: 'knight', skillId: 'blood-curse',
    params: [], description: '血濺咒殺改走普攻公式' },
  { type: 'vengeance_boost', name: '復仇之刃強化', group: 'weapon', pool: 'knight', skillId: 'vengeance',
    params: [{ key: 'percent', min: 10, max: 20, unit: '%' }], description: '復仇之刃增益改為固定攻擊力 +{percent}' },

  { type: 'fire_arrow_boost', name: '火矢附魔強化', group: 'accessory', pool: 'elf', skillId: 'fire-arrow',
    params: [], description: `火矢附魔非弓也附加火屬性傷害 +${ABILITY_FIRE_ARROW_BONUS}` },
  { type: 'triple_shot_boost', name: '三連射強化', group: 'weapon', pool: 'elf', skillId: 'triple-shot',
    params: [{ key: 'arrows', min: 1, max: 2, unit: '' }], description: '三連射箭數 +{arrows}' },
  { type: 'hawk_eye_boost', name: '鷹眼強化', group: 'accessory', pool: 'elf', skillId: 'hawk-eye',
    params: [{ key: 'ranged', min: 1, max: 3, unit: '' }], description: '鷹眼遠程攻擊力再 +{ranged}' },
  { type: 'binding_arrow_boost', name: '束縛箭強化', group: 'weapon', pool: 'elf', skillId: 'binding-arrow',
    params: [ms('cooldown', 1, 2, 0.1), ms('root', 1, 3, 0.1)], description: '束縛箭冷卻 −{cooldown}、定身 +{root}' },
  { type: 'leap_shot_boost', name: '後躍射擊強化', group: 'accessory', pool: 'elf', skillId: 'leap-shot',
    params: [ms('cooldown', 1, 3, 0.1)], description: '後躍射擊冷卻 −{cooldown}' },
  { type: 'arrow_rain_boost', name: '穿透箭雨強化', group: 'weapon', pool: 'elf', skillId: 'arrow-rain',
    params: [], description: '穿透箭雨改走普攻公式，受火矢附魔影響' },

  { type: 'mana_drain_boost', name: '魔力奪取強化', group: 'weapon', pool: 'elementalist', skillId: 'mana-drain',
    params: [{ key: 'percent', min: 10, max: 30, unit: '%' }], description: '魔力奪取傷害 +{percent}' },
  { type: 'element_boost_boost', name: '元素增幅強化', group: 'weapon', pool: 'elementalist', skillId: 'element-boost',
    params: [ms('cooldown', 1, 10, 1)], description: '元素增幅冷卻 −{cooldown}' },
  { type: 'mana_shield_boost', name: '魔力護盾強化', group: 'accessory', pool: 'elementalist', skillId: 'mana-shield',
    params: [{ key: 'reduction', min: 5, max: 15, unit: '%' }], description: '魔力護盾期間減傷 +{reduction}' },
  { type: 'mana_spring_boost', name: '魔力湧泉強化', group: 'accessory', pool: 'elementalist', skillId: 'mana-spring',
    params: [{ key: 'regen', min: 1, max: 10, unit: '%' }, { key: 'hpCost', min: 1, max: 10, unit: '%' }],
    description: '魔力湧泉回魔 +{regen}、扣血 −{hpCost}' },
  { type: 'element_storm_boost', name: '元素風暴強化', group: 'weapon', pool: 'elementalist', skillId: 'element-storm',
    params: [{ key: 'mp', min: 1, max: 20, unit: '' }, { key: 'damage', min: 1, max: 20, unit: '%' }],
    description: '元素風暴 MP 消耗 −{mp}、傷害 +{damage}' },

  { type: 'holy_shield_boost', name: '聖光護盾強化', group: 'accessory', pool: 'priest', skillId: 'holy-shield',
    params: [{ key: 'absorb', min: 10, max: 100, unit: '' }, ms('duration', 1, 5, 1)],
    description: '聖光護盾吸收 +{absorb}、持續 +{duration}' },
  { type: 'spirit_gathering_boost', name: '精神匯聚強化', group: 'weapon', pool: 'priest', skillId: 'high-heal',
    params: [{ key: 'percent', min: 1, max: 20, unit: '%' }], description: '精神匯聚後下一次攻擊技能傷害 +{percent}' },
  { type: 'group_heal_boost', name: '群體治癒強化', group: 'accessory', pool: 'priest', skillId: 'group-heal',
    params: [{ key: 'mp', min: 5, max: 15, unit: '' }, { key: 'power', min: 20, max: 40, unit: '%' }],
    description: '群體治癒 MP 消耗 −{mp}、技能攻擊力 +{power}' },
  { type: 'holy_judgment_boost', name: '聖光審判強化', group: 'weapon', pool: 'priest', skillId: 'holy-judgment',
    params: [{ key: 'targets', min: 1, max: 2, unit: '' }, { key: 'power', min: 10, max: 30, unit: '%' }],
    description: '聖光審判目標 +{targets}、技能攻擊力 +{power}' },
  { type: 'blood_mana_boost', name: '血魔轉換強化', group: 'accessory', pool: 'priest', skillId: 'blood-mana',
    params: [{ key: 'hpCost', min: 1, max: 10, unit: '%', lowerIsBetter: true }], description: '血魔轉換扣血改為 {hpCost}' },
  { type: 'holy_smite_boost', name: '神聖懲擊強化', group: 'weapon', pool: 'priest', skillId: 'holy-smite',
    params: [ms('stun', 1, 3, 0.1)], description: '神聖懲擊改為突進並暈眩 {stun}' },
  { type: 'holy_domain_boost', name: '神聖領域強化', group: 'accessory', pool: 'priest', skillId: 'holy-domain',
    params: [{ key: 'mp', min: 5, max: 15, unit: '' }, ms('cooldown', 5, 15, 1)],
    description: '神聖領域 MP 消耗 −{mp}、冷卻 −{cooldown}' },

  { type: 'envenom_boost', name: '淬毒強化', group: 'weapon', pool: 'thief', skillId: 'envenom',
    params: [{ key: 'percent', min: 50, max: 80, unit: '%' }], description: '淬毒毒傷害 +{percent}' },
  { type: 'deadly_strike_boost', name: '致命一擊強化', group: 'accessory', pool: 'thief', skillId: 'deadly-strike',
    params: [ms('duration', 1, 5, 1)], description: '致命一擊持續 +{duration}' },
  { type: 'smoke_bomb_boost', name: '煙霧彈強化', group: 'accessory', pool: 'thief', skillId: 'smoke-bomb',
    params: [], description: '煙霧彈絕對迴避次數 +1' },
  { type: 'precision_strike_boost', name: '精準打擊強化', group: 'accessory', pool: 'thief', skillId: 'precision-strike',
    params: [{ key: 'defense', min: 1, max: 5, unit: '' }, { key: 'crit', min: 1, max: 10, unit: '%' }],
    description: '精準打擊另加防禦 +{defense}、爆擊率 +{crit}' },
  { type: 'backstab_boost', name: '背刺強化', group: 'weapon', pool: 'thief', skillId: 'backstab',
    params: [ms('duration', 1, 5, 1)], description: '背刺增益持續 +{duration}' },
  { type: 'poison_mist_boost', name: '毒霧強化', group: 'weapon', pool: 'thief', skillId: 'poison-mist',
    params: [], description: `毒霧改為立即造成 ${ABILITY_POISON_MIST_TICKS} 秒份的傷害` },
  { type: 'dodge_counter_boost', name: '閃避反擊強化', group: 'accessory', pool: 'thief', skillId: 'dodge-counter',
    params: [{ key: 'chance', min: 5, max: 10, unit: '%' }], description: '閃避反擊 {chance} 機率再追加 1 次普攻' },

  { type: 'low_hp_regen', name: '低血回復', group: 'accessory', pool: 'common',
    params: [{ key: 'regen', min: 10, max: 20, unit: '' }],
    description: `HP 低於 ${ABILITY_LOW_RESOURCE_PERCENT}% 時回血 +{regen}` },
  { type: 'low_mp_regen', name: '低魔回復', group: 'accessory', pool: 'common',
    params: [{ key: 'regen', min: 10, max: 20, unit: '' }],
    description: `MP 低於 ${ABILITY_LOW_RESOURCE_PERCENT}% 時回魔 +{regen}` },
  { type: 'thorns', name: '荊棘反彈', group: 'accessory', pool: 'common',
    params: [{ key: 'percent', min: 20, max: 60, unit: '%' }],
    description: '被命中時反彈受到傷害的 {percent}' },
  { type: 'rage', name: '怒氣', group: 'accessory', pool: 'common',
    params: [{ key: 'decay', min: 5, max: 15, unit: '', lowerIsBetter: true }],
    description: `被命中時累積等同受到傷害的怒氣（上限 ${ABILITY_RAGE_MAX}），每秒減少 {decay}；有怒氣時魔法抗性 +${ABILITY_RAGE_MAGIC_RESIST}、防禦 +${ABILITY_RAGE_DEFENSE}` },
  { type: 'calm', name: '平靜', group: 'accessory', pool: 'common',
    params: [{ key: 'rate', min: 5, max: 10, unit: '' }],
    description: `未被命中時每秒累積平靜 {rate}（上限 ${ABILITY_CALM_MAX}）；被命中時消耗全部平靜，冷卻中的技能剩餘冷卻縮短同等 %` },
];

const DEFINITION_BY_TYPE = new Map(ABILITY_DEFINITIONS.map(d => [d.type, d]));

export function getAbilityDefinition(type: AbilityType): AbilityDefinition | undefined {
  return DEFINITION_BY_TYPE.get(type);
}

export function isAbilityType(value: unknown): value is AbilityType {
  return typeof value === 'string' && DEFINITION_BY_TYPE.has(value as AbilityType);
}

/** 各部位所屬的技能組（§ 7S.5） */
const ABILITY_SLOT_GROUP: Readonly<Record<string, AbilityGroup>> = {
  rightHand: 'weapon', necklace: 'accessory', ring1: 'accessory', ring2: 'accessory',
};

export type AbilityTemplate = {
  slot: string;
  tier?: number;
  requiredClass?: string[];
  smallMonsterDamage?: number | null;
  largeMonsterDamage?: number | null;
};

/** 該模板的部位與階級可帶隨機技能（不看池是否為空） */
export function isAbilitySlot(template: Pick<AbilityTemplate, 'slot' | 'tier'>): boolean {
  return (template.tier ?? 0) >= ABILITY_MIN_TIER && ABILITY_SLOT_GROUP[template.slot] !== undefined;
}

function canClassUse(template: AbilityTemplate, className: ClassName): boolean {
  return !template.requiredClass || template.requiredClass.length === 0 || template.requiredClass.includes(className);
}

function poolOf(group: AbilityGroup, pool: AbilityPool): AbilityType[] {
  return ABILITY_DEFINITIONS.filter(d => d.group === group && d.pool === pool).map(d => d.type);
}

export function getAbilityCommonPool(template: AbilityTemplate): AbilityType[] {
  return isAbilitySlot(template) ? poolOf(ABILITY_SLOT_GROUP[template.slot], 'common') : [];
}

/** 職業池：職業不能裝備此模板時為空（§ 7S.2「選池」） */
export function getAbilityClassPool(template: AbilityTemplate, className: ClassName | undefined): AbilityType[] {
  if (!className || !isAbilitySlot(template) || !canClassUse(template, className)) return [];
  return poolOf(ABILITY_SLOT_GROUP[template.slot], className);
}

/** 鐵匠鋪可指定的技能（§ 7S.6）：共通池 ＋ 製作角色的職業池 */
export function getCraftAbilityOptions(template: AbilityTemplate, className: ClassName | undefined): AbilityType[] {
  return [...getAbilityCommonPool(template), ...getAbilityClassPool(template, className)];
}

/** 武器值：`(小怪 + 大怪) / 2` 四捨五入，不含強化（`07-affix.md` § 7.9） */
export function getAbilityWeaponValue(template: AbilityTemplate): number {
  const s = template.smallMonsterDamage ?? 0;
  const l = template.largeMonsterDamage ?? 0;
  return Math.round((s + l) / 2);
}

export function resolveParamRange(def: AbilityParamDef, template: AbilityTemplate): [number, number] {
  if (def.max !== 'weaponValue') return [def.min, def.max];
  return [def.min, Math.max(def.min, Math.round(getAbilityWeaponValue(template) * (def.weaponValueScale ?? 1)))];
}

/** 區間上限的文字：數值，或 `武器值`／`武器值×1.5` */
export function formatParamMax(def: AbilityParamDef): string {
  if (def.max !== 'weaponValue') return formatParam(def, def.max);
  return def.weaponValueScale && def.weaponValueScale !== 1 ? `武器值×${def.weaponValueScale}` : '武器值';
}

export type AbilityRollMode = 'weakest' | 'random';

function rollParams(def: AbilityDefinition, template: AbilityTemplate, mode: AbilityRollMode): Record<string, number> {
  const params: Record<string, number> = {};
  for (const p of def.params) {
    const [min, max] = resolveParamRange(p, template);
    if (mode === 'weakest') {
      params[p.key] = p.lowerIsBetter ? max : min;
      continue;
    }
    const step = p.step ?? 1;
    const steps = Math.floor((max - min) / step);
    params[p.key] = min + Math.floor(random() * (steps + 1)) * step;
  }
  return params;
}

export type AbilityChannel = 'shop' | 'craft' | 'drop';

export interface AbilityRollContext {
  channel: AbilityChannel;
  /** 取得的角色職業（§ 7S.2「選池」） */
  className?: ClassName;
  /** 鐵匠製作指定的技能（§ 7S.6） */
  chosen?: AbilityType;
  /** 必定帶（不擲 `ABILITY_CHANCE`）：競技場擬態武器（`55-arena.md` § 55.9） */
  guaranteed?: boolean;
}

/**
 * 實例生成時抽隨機技能（§ 7S.2）。不出時回 undefined。
 * 製作：`chosen` 必須在 `getCraftAbilityOptions()` 內，否則回 undefined（呼叫端先驗證）。
 */
export function rollAbility(template: AbilityTemplate, ctx: AbilityRollContext): Ability | undefined {
  const common = getAbilityCommonPool(template);
  if (common.length === 0) return undefined;

  if (ctx.channel === 'craft') {
    if (!ctx.chosen || !getCraftAbilityOptions(template, ctx.className).includes(ctx.chosen)) return undefined;
    return { type: ctx.chosen, params: rollParams(DEFINITION_BY_TYPE.get(ctx.chosen)!, template, 'weakest') };
  }

  if (!ctx.guaranteed && random() * 100 >= ABILITY_CHANCE) return undefined;
  const classPool = getAbilityClassPool(template, ctx.className);
  const pool = classPool.length > 0 && random() < 0.5 ? classPool : common;
  const type = pool[Math.floor(random() * pool.length)];
  const mode: AbilityRollMode = ctx.channel === 'shop' ? 'weakest' : 'random';
  return { type, params: rollParams(DEFINITION_BY_TYPE.get(type)!, template, mode) };
}

/** 製作需要指定技能（§ 7S.6）：該部位池不為空 */
export function craftRequiresAbility(template: AbilityTemplate): boolean {
  return getAbilityCommonPool(template).length > 0;
}

type GearLike = { ability?: Ability; slot?: string } | null | undefined;

/** 同技能多件時的部位順序（§ 7S.3） */
const ABILITY_SLOT_ORDER = ['rightHand', 'necklace', 'ring1', 'ring2'];

/** 生效中的指定技能；同種類多件時回傳全部（戒指各自生效，§ 7S.3） */
export function collectAbilities(gear: readonly GearLike[], type: AbilityType): Ability[] {
  const out: Ability[] = [];
  for (const g of gear) if (g?.ability?.type === type) out.push(g.ability);
  return out;
}

export function findAbility(gear: readonly GearLike[], type: AbilityType): Ability | undefined {
  return gear.find(g => g?.ability?.type === type)?.ability;
}

/** 職業技能強化：裝備者職業與技能池相符才生效（§ 7S.3「職業技能」） */
export function findClassSkillAbility(
  gear: readonly GearLike[], className: ClassName | undefined, skillId: string,
): Ability | undefined {
  let best: { ability: Ability; def: AbilityDefinition; order: number } | undefined;
  for (const g of gear) {
    const def = g?.ability ? DEFINITION_BY_TYPE.get(g.ability.type) : undefined;
    if (def?.skillId !== skillId || def.pool !== className) continue;
    const candidate = { ability: g!.ability!, def, order: ABILITY_SLOT_ORDER.indexOf(g!.slot ?? '') };
    if (!best || betterAbility(candidate, best)) best = candidate;
  }
  return best?.ability;
}

/** 多件同職業技能取數值較好的一件：比第一個參數（↓ 取小），同值依部位順序（§ 7S.3） */
function betterAbility(
  a: { ability: Ability; def: AbilityDefinition; order: number },
  b: { ability: Ability; def: AbilityDefinition; order: number },
): boolean {
  const first = a.def.params[0];
  if (first) {
    const va = a.ability.params[first.key] ?? 0;
    const vb = b.ability.params[first.key] ?? 0;
    if (va !== vb) return first.lowerIsBetter ? va < vb : va > vb;
  }
  return a.order < b.order;
}

/** 數值類技能的參數加總（§ 7S.3：低血／低魔回復、荊棘反彈） */
export function sumAbilityParam(gear: readonly GearLike[], type: AbilityType, key: string): number {
  let total = 0;
  for (const g of gear) if (g?.ability?.type === type) total += g.ability.params[key] ?? 0;
  return total;
}

/** 越大越好的參數取最大值（平靜累積，§ 7S.3）；沒有時回 0 */
export function maxAbilityParam(gear: readonly GearLike[], type: AbilityType, key: string): number {
  let best = 0;
  for (const g of gear) if (g?.ability?.type === type) best = Math.max(best, g.ability.params[key] ?? 0);
  return best;
}

/** 越小越好的參數取最小值（怒氣衰減，§ 7S.3）；沒有時回 undefined */
export function minAbilityParam(gear: readonly GearLike[], type: AbilityType, key: string): number | undefined {
  let best: number | undefined;
  for (const g of gear) {
    if (g?.ability?.type !== type) continue;
    const v = g.ability.params[key] ?? 0;
    best = best === undefined ? v : Math.min(best, v);
  }
  return best;
}

export function formatParam(def: AbilityParamDef, value: number): string {
  if (def.unit === '%') return def.tenths ? `${(value / 10).toFixed(1)}%` : `${value}%`;
  if (def.unit === 's') {
    const seconds = value / 1000;
    return `${(def.step ?? 1000) < 1000 ? seconds.toFixed(1) : seconds} 秒`;
  }
  return String(value);
}

/** 效果敘述，參數代入數值 */
export function formatAbilityEffect(ability: Ability): string {
  const def = DEFINITION_BY_TYPE.get(ability.type);
  if (!def) return '';
  return def.params.reduce(
    (text, p) => text.replace(`{${p.key}}`, formatParam(p, ability.params[p.key] ?? 0)),
    def.description,
  );
}

/** tooltip 用的一行（§ 7S.7）：`名稱：效果` */
export function formatAbilityDisplay(ability: Ability): string {
  const def = DEFINITION_BY_TYPE.get(ability.type);
  return def ? `${def.name}：${formatAbilityEffect(ability)}` : '';
}

/** 這件裝備上該參數的區間：`(5 ~ 10%)`、`(1.5 ~ 3.0 秒)` */
function formatParamRange(def: AbilityParamDef, template: AbilityTemplate): string {
  const [min, max] = resolveParamRange(def, template);
  return `(${formatParam(def, min)} ~ ${formatParam(def, max)})`.replace(/ 秒 ~/, ' ~').replace(/% ~/, ' ~');
}

/** tooltip 一行的顯示片段：每個參數值後接一段區間；非區間片段串起來即 `formatAbilityDisplay()` */
export function formatAbilityDisplayParts(ability: Ability, template: AbilityTemplate): DisplayPart[] {
  const def = DEFINITION_BY_TYPE.get(ability.type);
  if (!def) return [];
  const parts: DisplayPart[] = [{ text: `${def.name}：` }];
  for (const piece of def.description.split(/(\{[a-zA-Z]+\})/)) {
    const param = def.params.find(p => `{${p.key}}` === piece);
    if (!param) {
      if (piece) parts.push({ text: piece });
      continue;
    }
    parts.push({ text: formatParam(param, ability.params[param.key] ?? 0) });
    parts.push({ text: formatParamRange(param, template), range: true });
  }
  return parts;
}

/** Wiki 用的數值欄：`A 5~15%、B 5~武器值×1.5`；無參數為 `—` */
export function formatAbilityRange(def: AbilityDefinition): string {
  if (def.params.length === 0) return '—';
  return def.params.map(p => {
    const max = formatParamMax(p);
    const min = formatParam(p, p.min);
    return `${min}~${max}`.replace(/ 秒~/, '~').replace(/%~/, '~');
  }).join('、');
}

/** Wiki 用的效果敘述片段：`range: true` 的片段是代入的數值區間 */
export function formatAbilityTemplateParts(def: AbilityDefinition): { text: string; range?: true }[] {
  const parts: { text: string; range?: true }[] = [];
  for (const piece of def.description.split(/(\{[a-zA-Z]+\})/)) {
    const param = def.params.find(p => `{${p.key}}` === piece);
    if (!param) {
      if (piece) parts.push({ text: piece });
      continue;
    }
    const range = `${formatParam(param, param.min)}~${formatParamMax(param)}`.replace(/ 秒~/, '~').replace(/%~/, '~');
    parts.push({ text: range, range: true });
    if (param.lowerIsBetter) parts.push({ text: '（越小越好）' });
  }
  return parts;
}

/** Wiki 用的效果敘述：參數以區間代入（例：`命中 5~15% 機率追加 5~武器值×1.5 傷害`） */
export function formatAbilityTemplate(def: AbilityDefinition): string {
  return formatAbilityTemplateParts(def).map(p => p.text).join('');
}
