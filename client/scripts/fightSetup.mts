/**
 * 實戰模擬的天賦配置（`44-dps-prediction.md` § 44.12）：依技能盤點與校準結果排戰鬥天賦，
 * 補血、藥水、回魔、防守與輸出 buff 排常駐天賦。`simulateReaperFight.mts`、`simulateArena.mts` 共用。
 */
import { calculateHealAmount, getTotalDefense } from '../src/systems/combat';
import { getEffectiveMaxHp, getEffectiveMaxMp, POTION_CONFIG } from '../src/stores/gameStore';
import type { Character, ClassName } from '../src/models/character';
import type { TalentSlot, TalentSlotEntry } from '../src/models/talent';
import type { EquipmentInstance, EquippedGear, EquipSlot } from '../src/models/equipment';
import type { ActiveEffect } from '../src/models/effect';
import type { Skill } from '../src/models/skill';
import { TALENT_INSTALL_MAX } from '../src/models/talent';
import {
  buildCharacter, buildRotation, calibrate, designEffectiveInt, getSkillPlan, preCombatBuffs, resolveLoadout,
  type Loadout, type RotationEntry, type SimContext,
} from './reaperShared.mts';

/** 魔力護盾的施放策略：常駐（到期重放）或危險時才開 */
export type ManaShieldPolicy = 'always' | 'danger';
export const KNIGHT_HP_TARGET = 50;
/** 技能補血與高耗魔防守技的門檻：HP 低於這個百分比才放（藥水不花 MP，另依可補量喝） */
export const DANGER_HP = 50;
/** 高耗魔、持續短的防守技：只在危險時放 */
export const DANGER_ONLY_CATEGORIES = new Set(['invincible', 'sanctuary']);
export const MANA_SHIELD_CATEGORY = 'mana-shield';

/** 魔力護盾的施放策略：常駐（到期重放）或危險時才開 */

/** 防守／續航類 buff：效果結束就由常駐天賦重放 */
export const SUSTAIN_BUFF_CATEGORIES = new Set([
  'mana-shield', 'mana-spring', 'defense-buff', 'protect-shield', 'holy-shield', 'sanctuary', 'evasion', 'invincible',
]);


export function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

// ---------------------------------------------------------------- 天賦格

let slotSeq = 0;

export function entry(ruleId: string, params: Record<string, unknown> | null = null): TalentSlotEntry {
  return { ruleId, params } as TalentSlotEntry;
}

export function slot(type: 'combat' | 'persistent', action: TalentSlotEntry, conditions: TalentSlotEntry[] = []): TalentSlot {
  slotSeq++;
  return {
    id: slotSeq, characterId: 1, tier: 3, assignedType: type, templateId: 'default', order: slotSeq, enabled: true,
    conditions: [...conditions, null, null, null].slice(0, 3), action,
  } as TalentSlot;
}

/** 缺血量 ≥ 補量才補 → 「HP 低於 (1 − 補量／上限)」 */
function refillThreshold(amount: number, maxHp: number): number {
  return Math.max(1, Math.floor((1 - amount / maxHp) * 100));
}

export interface FightSetup {
  className: ClassName;
  loadout: Loadout;
  character: Character;
  gear: EquippedGear;
  skills: Skill[];
  effects: ActiveEffect[];
  slots: TalentSlot[];
  rules: string[];
}

export function toEquipped(gear: (EquipmentInstance | null)[]): EquippedGear {
  const out: EquippedGear = {};
  gear.forEach((g, i) => {
    if (!g) return;
    const item = { ...g, id: i + 1 };
    const slotKey = (g.slot === ('ring' as EquipSlot) ? 'ring1' : g.slot) as EquipSlot;
    out[slotKey] = item;
  });
  return out;
}

export function buildSetup(
  className: ClassName, raw: Loadout, seed: number, manaShield: ManaShieldPolicy = 'always', ctx?: SimContext,
  /** 騎士藥水只在 HP 低於 `KNIGHT_HP_TARGET` 時喝（維持殘血吃復仇之刃加成）；false 時同其他職業 */
  knightHoldsLowHp = true,
): FightSetup {
  slotSeq = 0;
  const plan = getSkillPlan(className, ctx?.level);
  const effects = [...preCombatBuffs(className, ctx?.level), plan.speed.effect];
  const character = { ...(ctx?.character ?? buildCharacter(className)), id: 1 };
  const loadout = resolveLoadout(character, effects, raw);
  const effInt = ctx ? ctx.effectiveInt(loadout.gear) : designEffectiveInt(className, loadout.gear);
  const { order } = calibrate(
    character, loadout, buildRotation(className, loadout.weapon, ctx?.level), effects, effInt, seed, ctx?.monster,
  );

  const learned = plan.items.filter(i => i.handling !== 'over_budget').map(i => i.skill);
  const skills: Skill[] = learned.map(s => ({ ...s, lastUsedAt: -1e9 }) as Skill);
  const gear = toEquipped(loadout.gear);
  const maxHp = getEffectiveMaxHp(character, gear, effects);
  const rules: string[] = [
    `有效最大 HP ${maxHp}／MP ${getEffectiveMaxMp(character, gear, effects)}／裝備防禦 ${getTotalDefense(loadout.gear)}`,
  ];
  const isKnight = className === 'knight';

  // 戰鬥：輪替（攻擊技能依校準排序）→ 普攻
  const combat: TalentSlot[] = [];
  const persistent: TalentSlot[] = [];
  const attackEntries = order.filter((e: RotationEntry) => e.kind !== 'self_buff');
  for (const e of attackEntries.slice(0, TALENT_INSTALL_MAX - 1)) {
    const selfHpCost = learned.find(x => x.id === e.id)?.selfHpCostPercent;
    const conds = isKnight && selfHpCost ? [entry('hp_above', { value: KNIGHT_HP_TARGET })] : [];
    combat.push(slot('combat', entry('skill', { skillId: e.id }), conds));
  }
  // 位移、控場、只上毒、自扣血的技能，價值不在直接傷害（木樁校準會篩掉），實戰照樣施放
  for (const s of learned) {
    if (s.type !== 'attack' || combat.length >= TALENT_INSTALL_MAX - 1) continue;
    if (!(s.dash || s.retreat || s.applyDebuff?.root || s.dotOnly || s.selfHpCostPercent)) continue;
    if (combat.some(c => (c.action?.params as { skillId?: string })?.skillId === s.id)) continue;
    const conds = isKnight && s.selfHpCostPercent ? [entry('hp_above', { value: KNIGHT_HP_TARGET })] : [];
    combat.push(slot('combat', entry('skill', { skillId: s.id }), conds));
  }
  combat.push(slot('combat', entry('normal_attack')));
  const nameOf = (id: string | undefined) => (id ? learned.find(s => s.id === id)?.name ?? id : '普攻');
  rules.push(`戰鬥：${combat.map(c => nameOf((c.action?.params as { skillId?: string } | null)?.skillId)).join(' → ')}`);

  // 常駐：補血（危險時、每點 MP 補最多的一招）→ 藥水 → 回魔 → 防守／續航 buff → 輸出 buff
  const heal = learned
    .filter(s => s.type === 'heal' && s.power > 0)
    .map(s => ({ s, amount: calculateHealAmount(character, s.power, loadout.gear, effects) }))
    .sort((a, b) => b.amount / Math.max(1, b.s.mpCost) - a.amount / Math.max(1, a.s.mpCost) || b.amount - a.amount)[0];
  if (heal) {
    persistent.push(slot('persistent', entry('heal_skill', { skillId: heal.s.id }), [entry('hp_below', { value: DANGER_HP })]));
    rules.push(`${heal.s.name}（每 MP 補 ${fmt(heal.amount / Math.max(1, heal.s.mpCost))}）：HP 低於 ${DANGER_HP}%`);
  }
  const potionThreshold = isKnight && knightHoldsLowHp ? KNIGHT_HP_TARGET : refillThreshold(POTION_CONFIG.orange.healMax, maxHp);
  persistent.push(slot('persistent', entry('potion', { potionType: 'orange' }), [entry('hp_below', { value: potionThreshold })]));
  rules.push(`橙色藥水：HP 低於 ${potionThreshold}%`);

  // 同 category 的 buff 互相覆蓋（`24-buff-debuff.md` § 24.3.1），只放等級最高的那個
  const bestOfCategory = new Map<string, Skill>();
  for (const s of learned) {
    if (s.type !== 'buff' || !s.buffCategory) continue;
    const cur = bestOfCategory.get(s.buffCategory);
    if (!cur || s.level > cur.level) bestOfCategory.set(s.buffCategory, s as Skill);
  }
  for (const s of learned) {
    if (s.type !== 'buff') continue;
    if (s.buffCategory && bestOfCategory.get(s.buffCategory)?.id !== s.id) continue;
    if (s.mpRestorePercent) {
      const mpThreshold = Math.floor(100 - s.mpRestorePercent);
      persistent.push(slot('persistent', entry('buff_skill', { skillId: s.id }),
        [entry('mp_below', { value: mpThreshold }), entry('hp_above', { value: 50 })]));
      rules.push(`${s.name}：MP 低於 ${mpThreshold}% 且 HP 高於 50%`);
      continue;
    }
    const isSustain = SUSTAIN_BUFF_CATEGORIES.has(s.buffCategory ?? '');
    const isRotationBuff = order.some((e: RotationEntry) => e.kind === 'self_buff' && e.id === s.id);
    if (!isSustain && !isRotationBuff) continue;
    const dangerOnly = DANGER_ONLY_CATEGORIES.has(s.buffCategory ?? '')
      || (s.buffCategory === MANA_SHIELD_CATEGORY && manaShield === 'danger');
    const conds = [entry('buff_not_active', { skillId: s.id })];
    if (dangerOnly) conds.unshift(entry('hp_below', { value: DANGER_HP }));
    persistent.push(slot('persistent', entry('buff_skill', { skillId: s.id }), conds));
    rules.push(dangerOnly ? `${s.name}：HP 低於 ${DANGER_HP}% 且效果不在時` : `${s.name}：效果結束就重放`);
  }

  return { className, loadout, character, gear, skills, effects, slots: [...combat, ...persistent], rules };
}

