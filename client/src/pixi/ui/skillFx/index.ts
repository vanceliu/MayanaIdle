/**
 * 技能特效（`48-vfx.md` § 48.7）與 Buff／Debuff 場上特效（§ 48.8）。
 *
 * 對外只從這裡進 —— 呼叫端不需要知道數字、形狀、判定分在哪三個檔案。
 */
export {
  SKILL_FX_ART, SKILL_FX_PROTOTYPES, MARK_COLORS, MARK_KINDS, SHIELD_KINDS,
  EMBLEM_KINDS, BUFF_EMBLEM_BY_CATEGORY, BUFF_SHIELD_BY_CATEGORY,
  BUFF_AURA_COLOR, DEBUFF_AURA_COLOR, DEBUFF_TINT, DEBUFF_TINT_PRIORITY,
  resolveDebuffTint, resolveDebuffAccent, resolveBuffEmblem, resolveBuffShield,
  tilesToGroundRadius, lighten,
  hitShakeOffset,
  HIT_REACTION_ART, hitFlashAlpha, deathFadeState,
} from './geometry';
export type {
  SkillFxPrototype, SkillFxArt, MarkKind, ShieldKind, EmblemKind,
  CastParams, TravelParams, ImpactParams, BurstParams, NovaParams,
  DropParams, HealParams, AuraParams, MarkParams, DotTickParams, ShieldParams,
  EmblemParams, HitReactionArt,
} from './geometry';

export {
  DROP_FX_SKILL_IDS, MELEE_FX_SKILL_IDS, VOLLEY_FX_SKILL_IDS, CHAIN_FX_SKILL_IDS,
  SKILL_FX_OVERRIDES,
  MELEE_FX_RANGE,
  resolveSkillFxPlan, resolveNormalAttackFxPlan, resolveAuraColor, resolveChainStyle,
} from './skillFxStyle';
export type {
  SkillFxInput, SkillFxPlan, SkillFxContext, SkillFxDelivery, SkillFxLanding,
  SkillFxChainStyle, SkillFxTrailFx, SkillFxOverride,
  SkillFxWeaponAction,
} from './skillFxStyle';

export {
  SkillFxManager, MAX_ACTIVE_SKILL_FX, DEFAULT_SKILL_FX_SPEED, travelDurationMs,
} from './SkillFxManager';
export type { SkillFxSpawnOpts } from './SkillFxManager';

export { playSkillFx } from './playSkillFx';
export type { PlaySkillFxOpts, SkillFxTarget } from './playSkillFx';

export { drawProjectileHead } from './drawSkillFx';

export {
  HIT_LIFT,
  resolveEnchantElement, resolveAttackFxContext,
  resolvePlayerAttackFxPlan, resolveMonsterAttackFxPlan, resolveMuzzleOffset,
} from './combatFx';

export {
  STUN_TAG, StatusMarkTracker, resolveStatusMark, resolveStatusTint,
} from './statusFx';
export type { StatusFxTarget } from './statusFx';
