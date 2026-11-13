import type { PlayerAttackEvent, MonsterAttackEvent } from './arpgEngine';
import { applyDamageToMonster, bloodthirstHeal, monsterLogName } from '../models/monsterAffix';
import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import { resolveDebuffDuration, resolveDotDamagePercent, resolveMpAfterSelfCast, resolveSelfHpCost, type Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { EquipmentInstance } from '../models/equipment';
import type { MapMonster } from '../stores/mapMonsterStore';
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculatePhysicalSnapshotSkill,
  calculateMonsterAttack,
  calculateBasePhysicalDamage,
  getEquippedWeapon,
  isShieldEquipped,
  hasActiveFireEnchant,
  calculateMpRestored,
  absorbWithShield,
  absorbWithManaShield,
  getSkillSideValue,
  consumeEvadeCharge,
  getTotalMagicResist,
  getWeaponHitCount,
  getSkillCooldownReduction,
  calculateHealAmount,
  getAffixBonusesFromGear,
  type HitBreakdown,
} from './combat';
import {
  getErosion,
  getOnHitRestore,
  getWeaponDebuffAffixes,
  AFFIX_DEBUFF_CHANCE,
  AFFIX_DEBUFF_DURATION_MS,
  HIT_DOWN_CATEGORY,
  DEFENSE_DOWN_CATEGORY,
  HIT_DOWN_STAT,
  ATTACK_SPLASH_RADIUS,
  BRAND_ELEMENT_ZH,
  ELEMENT_DOWN_STAT,
  elementDownCategory,
  type BrandElement,
  type WeaponDebuffAffixType,
} from '../models/affix';
import {
  sumUniqueAffix,
  rollUniqueStruckBuffs,
} from '../models/uniqueAffix';
import { findAbility, sumAbilityParam, ABILITY_SPLASH_RADIUS } from '../models/ability';
import {
  advanceCombo, applyComboBonus, comboKey, isBasicAttackClass, isDirectDamageSkill, isSingleTargetSkill,
  applyFocusStrike, clearFocusTarget, focusKey, consumeCalm, gainRage, shortenCooldown, splashDamage,
} from './abilityCombat';
import { getDistance } from './lineOfSight';
import { applyAbilityToSkill, applyAbilityToSkills, withNextAttackBonus, ENVENOM_DOT_BONUS_STAT, NEXT_ATTACK_BONUS_CATEGORY, NEXT_ATTACK_BONUS_STAT } from '../models/abilitySkill';
import { getEffectiveMaxHp, getEffectiveMaxMp, type CombatLog } from '../stores/gameStore';
import { defaultSession, type Session } from '../stores/session';
import { getSkillTemplate } from '../models/skillTemplate';
import { rollMonsterDebuff, applyPlayerDebuff, applyPlayerBuff } from './playerDebuffSystem';
import { getEffectiveGearArray } from './gear';
import { random } from '../core/rng';
import { gameNow } from '../core/clock';

/** § 24.6 Boss 控場免疫冷卻 */
export const BOSS_CC_IMMUNE_MS = 10_000;

/** § 7.4 元素侵蝕的 DoT：每秒一跳、持續 5 秒、存續期間不可刷新 */
export const EROSION_CATEGORY = 'dot-erosion';
export const EROSION_TICK_MS = 1000;
export const EROSION_DURATION_MS = 5000;

/** 命中下降／防禦下降／元素下降在怪物身上的 debuff 定義（`07-affix.md` § 7.9）；元素下降依元素各一個 category */
function weaponDebuffDef(type: WeaponDebuffAffixType, element?: BrandElement): { category: string; stat: string; name: string; sign: 1 | -1 } {
  if (type === 'hit_down') return { category: HIT_DOWN_CATEGORY, stat: HIT_DOWN_STAT, name: '命中下降', sign: -1 };
  if (type === 'defense_down') return { category: DEFENSE_DOWN_CATEGORY, stat: 'defense', name: '防禦下降', sign: -1 };
  return { category: elementDownCategory(element!), stat: ELEMENT_DOWN_STAT, name: `${BRAND_ELEMENT_ZH[element!]}屬性下降`, sign: 1 };
}

/** 併入隊友施加的全隊共用詞綴 debuff（`07-affix.md` § 7.9）；只含怪物身上的 debuff，不影響角色自身的判定 */
function withPartyAffixDebuffs(activeEffects: ActiveEffect[], ctx: ArpgEventContext): ActiveEffect[] {
  return ctx.partyAffixDebuffs?.length ? [...activeEffects, ...ctx.partyAffixDebuffs] : activeEffects;
}

function isActiveOnMonster(e: ActiveEffect, targetId: string, now: number): boolean {
  return e.type === 'debuff' && e.target === 'monster' && e.targetMonsterId === targetId
    && now < e.startTime + e.duration;
}

/**
 * T7 命中回血／回魔／擊殺回血（`07-affix-tier7.md` § 7T.4）加回角色，回傳日誌。
 * 角色已死亡時不回 HP。普攻／技能與怪物 DoT 擊殺共用。
 */
export function applyUniqueAffixRestore(session: Session, hpGain: number, mpGain: number): CombatLog[] {
  if (hpGain <= 0 && mpGain <= 0) return [];
  const gs = session.game.getState();
  const c = gs.character;
  if (!c) return [];
  const maxHp = getEffectiveMaxHp(c, gs.equippedGear, gs.activeEffects);
  const maxMp = getEffectiveMaxMp(c, gs.equippedGear, gs.activeEffects);
  const hp = c.hp > 0 ? Math.min(maxHp, c.hp + hpGain) : c.hp;
  const mp = Math.min(maxMp, c.mp + mpGain);
  if (hp === c.hp && mp === c.mp) return [];
  session.game.setState({ character: { ...c, hp, mp } });
  const logs: CombatLog[] = [];
  if (hp > c.hp) logs.push({ text: `獨有詞綴回復 ${hp - c.hp} HP`, type: 'system' });
  if (mp > c.mp) logs.push({ text: `獨有詞綴回復 ${mp - c.mp} MP`, type: 'system' });
  return logs;
}

/** § 7.9 普攻回血／技能回血：每個目標每一下命中各回 `floor(該下最終傷害 × X%)` */
export function lifestealAmount(damages: DamageResult[], percent: number): number {
  if (percent <= 0) return 0;
  let total = 0;
  for (const d of damages) {
    for (const h of d.hits) if (!h.isMiss && h.damage > 0) total += Math.floor(h.damage * percent / 100);
  }
  return total;
}

/** 把普攻回血／技能回血加回角色（不超過有效最大 HP；角色已死亡時不回），回傳日誌 */
function applyAffixLifesteal(session: Session, amount: number, name: string): CombatLog[] {
  if (amount <= 0) return [];
  const gs = session.game.getState();
  const c = gs.character;
  if (!c || c.hp <= 0) return [];
  const hp = Math.min(getEffectiveMaxHp(c, gs.equippedGear, gs.activeEffects), c.hp + amount);
  if (hp <= c.hp) return [];
  session.game.setState({ character: { ...c, hp } });
  return [{ text: `${name}回復 ${hp - c.hp} HP`, type: 'player' }];
}

export interface SelfBuffApplyResult {
  effects: ActiveEffect[];
  description: string;
}

/** 平靜（§ 7S.5）：冷卻中技能的剩餘冷卻縮短 X%；有任何技能被縮短時回 true */
function shortenCoolingSkills(session: Session, gear: (EquipmentInstance | null)[], percent: number, now: number): boolean {
  const gs = session.game.getState();
  const character = gs.character;
  if (!character) return false;
  const cdr = getSkillCooldownReduction(character, gear, gs.activeEffects);
  const effective = applyAbilityToSkills(gs.skills, gear, character.className);
  let changed = false;
  const skills = gs.skills.map((s, i) => {
    const cooldown = Math.floor(effective[i].cooldown * (1 - Math.min(cdr, 50) / 100));
    const lastUsedAt = shortenCooldown(s.lastUsedAt, cooldown, percent, now);
    if (lastUsedAt === s.lastUsedAt) return s;
    changed = true;
    return { ...s, lastUsedAt };
  });
  if (changed) session.game.setState({ skills });
  return changed;
}

/** 取出並移除生效中的「下一次攻擊技能」加成%；沒有時回 0 */
function consumeNextAttackBonus(session: Session): number {
  const now = gameNow();
  const { activeEffects } = session.game.getState();
  const effect = activeEffects.find(e => e.category === NEXT_ATTACK_BONUS_CATEGORY && now < e.startTime + e.duration);
  if (!effect) return 0;
  session.game.setState({ activeEffects: activeEffects.filter(e => e !== effect) });
  return effect.modifiers?.find(m => m.stat === NEXT_ATTACK_BONUS_STAT)?.value ?? 0;
}

/**
 * 施加攻擊技能附帶的自身 buff（§ 23.3 復仇之刃、§ 23.7 背刺）。
 * `scaleByMissingHp` 依施放當下的已損失血量比率決定加成，加成為 0 時不施加。
 */
export function applySkillSelfBuff(
  skill: Skill,
  character: Character,
  activeEffects: ActiveEffect[],
  now: number = gameNow(),
  session: Session = defaultSession,
): SelfBuffApplyResult | null {
  const def = skill.selfBuff;
  if (!def) return null;

  const modifiers = [...(def.modifiers ?? [])];
  let description = def.description;

  if (def.scaleByMissingHp) {
    const { equippedGear, activeEffects } = session.game.getState();
    const maxHp = getEffectiveMaxHp(character, equippedGear, activeEffects);
    const missingPercent = maxHp > 0 ? (1 - character.hp / maxHp) * 100 : 0;
    const bonus = Math.floor(Math.min(def.scaleByMissingHp.maxPercent, Math.max(0, missingPercent)));
    if (bonus <= 0) return null;
    modifiers.push({ stat: def.scaleByMissingHp.stat, value: bonus, isPercent: true });
    description = `${def.description}（本次 +${bonus}%）`;
  }

  if (modifiers.length === 0) return null;

  const effect: ActiveEffect = {
    id: `self-buff-${def.category}-${now}`,
    sourceSkillId: skill.id,
    sourceSkillName: skill.name,
    category: def.category,
    type: 'buff',
    target: 'player',
    modifiers,
    startTime: now,
    duration: def.duration,
    tags: [],
    name: def.name,
    description,
  };

  // 同 category 互蓋（§ 24.3.1）
  const filtered = activeEffects.filter(
    e => !(e.type === 'buff' && e.target === 'player' && e.category === def.category)
  );
  return { effects: [...filtered, effect], description };
}

export interface ArpgEventContext {
  /** 省略＝client 的 defaultSession */
  session?: Session;
  character: Character;
  equippedGear: (EquipmentInstance | null)[];
  activeEffects: ActiveEffect[];
  skills: Skill[];
  monsterInstances: Map<string, MonsterInstance>;
  mapMonsters: MapMonster[];
  /** 同地圖隊友施加在怪物身上的命中下降／防禦下降／元素下降（`07-affix.md` § 7.9），併入判定 */
  partyAffixDebuffs?: ActiveEffect[];
}

export interface DamageResult {
  targetId: string;
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
  killed: boolean;
  /**
   * 逐下明細。**長度至少 1**，一般攻擊就是一筆。
   *
   * 多下判定（雙持雙擊、多段技能）要讓畫面一下跳一個數字
   * （`48-vfx.md` § 48.7.3）—— 只有合計的話，「第二下 MISS」表現不出來。
   */
  hits: HitBreakdown[];
  /** 隨機技能的擴散傷害（`07-affix-ability.md` § 7S.4）：不觸發荊棘反彈 */
  splash?: boolean;
}

export interface PlayerAttackResult {
  damages: DamageResult[];
  logs: CombatLog[];
  skillUsed?: Skill;
  healAmount?: number;
  mpRestored?: number;
  hpRestored?: number;
}

export interface MonsterAttackResult {
  monsterId: string;
  damage: number;
  isDodged: boolean;
  isBlocked: boolean;
  log: CombatLog;
  debuffLog?: CombatLog;
  shieldLog?: CombatLog;
  /** § 7.4 受擊回復觸發的日誌 */
  restoreLogs?: CombatLog[];
  /** 飾品隨機技能荊棘反彈（`07-affix-ability.md` § 7S.5） */
  thorns?: { damage: number; killed: boolean };
}

/**
 * 這次出手依序打誰。一般技能＝目標清單照順序各一下；
 * 隨機多擊（`41-arpg-combat.md` § 3.4）＝每下從**還活著**的候選中取後放回抽 1 隻，
 * 候選全死就提前結束。
 */
export function* attackSequence(
  candidates: string[],
  skill: Pick<Skill, 'randomHits'> | undefined,
  monsterInstances: Map<string, MonsterInstance>,
): Generator<string> {
  if (!skill?.randomHits) {
    yield* candidates;
    return;
  }
  for (let i = 0; i < skill.randomHits; i++) {
    const alive = candidates.filter(id => (monsterInstances.get(id)?.currentHp ?? 0) > 0);
    if (alive.length === 0) return;
    yield alive[Math.floor(random() * alive.length)];
  }
}

export function processPlayerAttack(
  event: PlayerAttackEvent,
  ctx: ArpgEventContext,
): PlayerAttackResult {
  const session = ctx.session ?? defaultSession;
  const { character, equippedGear, activeEffects } = ctx;
  const damages: DamageResult[] = [];
  const logs: CombatLog[] = [];
  const weapon = getEquippedWeapon(equippedGear);
  let drainDamage = 0;
  /** T7 命中回血／回魔／擊殺回血（`07-affix-tier7.md`），所有目標結算完再一次加回 */
  let uniqueHpGain = 0;
  let uniqueMpGain = 0;

  // § 7S.5 職業池：以施放當下的武器改寫技能數值（呼叫端已改寫時結果相同）
  const skill = event.skill ? applyAbilityToSkill(event.skill, equippedGear, character.className) : undefined;

  // Handle buff/heal skills — these target the player, not monsters
  if (skill && (skill.type === 'buff' || skill.type === 'heal')) {
    const now = gameNow();
    const gs = session.game.getState();
    const skillIdx = gs.skills.findIndex(s => s.id === skill.id);

    if (skill.type === 'buff') {
      const buffDuration = skill.buffDuration;
      // 自身 HP 消耗（`23-class-magic.md` § 23.5 魔力湧泉）：穿透減傷與護盾，最低留 1
      const hpCost = resolveSelfHpCost(skill, character.hp, getEffectiveMaxHp(character, gs.equippedGear, gs.activeEffects));
      if (hpCost > 0) logs.push({ text: `${skill.name} 消耗 ${hpCost} HP`, type: 'player' });
      const effMaxMp = getEffectiveMaxMp(character, gs.equippedGear, gs.activeEffects);
      const mpAfter = resolveMpAfterSelfCast(skill, character.mp, effMaxMp);
      if (skill.mpRestorePercent) logs.push({ text: `${skill.name} 回復 ${mpAfter - Math.max(0, character.mp - skill.mpCost)} MP`, type: 'player' });
      const newChar = { ...character, mp: mpAfter, hp: character.hp - hpCost };
      const newSkills = [...gs.skills];
      if (skillIdx >= 0) newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };

      if (buffDuration) {
        const buffEffect: ActiveEffect = {
          id: `buff-${skill.id}-${now}`,
          sourceSkillId: skill.id,
          sourceSkillName: skill.name,
          category: skill.buffCategory ?? skill.id,
          type: 'buff',
          target: 'player',
          modifiers: skill.buffModifiers ?? [],
          startTime: now,
          duration: buffDuration,
          tags: [],
          name: skill.name,
          description: skill.buffEffect ?? '',
        };
        if (skill.hotAmount) buffEffect.hot = { amount: skill.hotAmount, interval: 1000 };
        if (skill.invincible) buffEffect.invincible = true;
        if (skill.immuneDebuff) buffEffect.immuneDebuff = true;
        if (skill.evadeCharges) buffEffect.evadeCharges = skill.evadeCharges;
        const shieldMod = buffEffect.modifiers?.find(m => m.stat === 'shield_absorb');
        const shieldPower = skill.shieldPower;
        if (shieldMod) {
          buffEffect.shieldRemaining = shieldMod.value + (shieldPower
            ? getSkillSideValue(character, shieldPower, getEffectiveGearArray(character, gs.activeEffects, gs.equippedGear), gs.activeEffects)
            : 0);
        }

        if (skill.cleanse) {
          const cleansed = gs.activeEffects.filter(e => !(e.type === 'debuff' && e.target === 'player'));
          session.game.setState({ character: newChar, skills: newSkills, activeEffects: cleansed });
        } else {
          const applied = applyPlayerBuff(gs.activeEffects, buffEffect);
          const effects = withNextAttackBonus(applied.effects, skill, now);
          session.game.setState({ character: newChar, skills: newSkills, activeEffects: effects });
          if (applied.cancelledSlow) logs.push({ text: `${skill.name} 解除了減速`, type: 'debuff-self' });
        }
      } else {
        session.game.setState({ character: newChar, skills: newSkills });
      }

      logs.push({ text: `施放 ${skill.name}`, type: 'player' });
    } else if (skill.type === 'heal' && skill.power) {
      const allGear = getEffectiveGearArray(character, gs.activeEffects, gs.equippedGear);
      const effMaxHp = getEffectiveMaxHp(character, gs.equippedGear, gs.activeEffects);
      // § 21.4c：與常駐腳本／快捷格共用 `calculateHealAmount()`，不可各算各的
      const effectiveHeal = calculateHealAmount(character, skill.power, allGear, gs.activeEffects);
      const healed = Math.min(effMaxHp - character.hp, effectiveHeal);

      const newChar = { ...character, hp: character.hp + healed, mp: character.mp - skill.mpCost };
      const newSkills = [...gs.skills];
      if (skillIdx >= 0) newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };

      session.game.setState({ character: newChar, skills: newSkills });
      logs.push({ text: `施放 ${skill.name} 回復 ${healed} HP`, type: 'player' });
      return { damages: [], logs, skillUsed: skill, healAmount: healed };
    }

    return { damages: [], logs, skillUsed: skill };
  }

  const effectsForDamage = withPartyAffixDebuffs(activeEffects, ctx);

  // § 7S.5 精神匯聚強化：下一次攻擊技能的傷害加成，本次施放即消耗
  const nextAttackBonus = skill && isDirectDamageSkill(skill) ? consumeNextAttackBonus(session) : 0;
  const damagePercent = (skill?.abilityDamagePercent ?? 0) + nextAttackBonus;

  // 自身 HP 消耗（`23-class-magic.md` § 23.3 血濺咒殺）：不是受到傷害，穿透減傷與護盾，最低留 1
  if (skill?.selfHpCostPercent) {
    const gs = session.game.getState();
    const self = gs.character!;
    const cost = resolveSelfHpCost(skill, self.hp, getEffectiveMaxHp(self, gs.equippedGear, gs.activeEffects));
    if (cost > 0) {
      session.game.setState({ character: { ...self, hp: self.hp - cost } });
      logs.push({ text: `${skill.name} 消耗 ${cost} HP`, type: 'player' });
    }
  }

  /** 只上毒的技能（毒霧，含強化後的立即傷害）沒有「命中」：不觸發追加傷害、元素侵蝕、武器 debuff、T7 命中類 */
  const procs = !skill?.dotOnly && !skill?.instantDotTicks;

  // § 7S.5 追打：普攻類每一下計 1；技能類每施放一次計 1，觸發時該次施放的全部目標加成
  const comboAbility = findAbility(equippedGear, 'combo_strike');
  const comboStateKey = comboKey(weapon, character);
  const focusAbility = findAbility(equippedGear, 'focus_strike');
  const focusStateKey = focusKey(character);
  const basicAttackClass = isBasicAttackClass(event, skill);
  const castComboBonus = comboAbility && !basicAttackClass && isDirectDamageSkill(skill)
    ? advanceCombo(session.loop, comboAbility, comboStateKey)
    : 0;

  for (const targetId of attackSequence(event.targetMonsterIds, skill, ctx.monsterInstances)) {
    const monster = ctx.monsterInstances.get(targetId);
    if (!monster || monster.currentHp <= 0) continue;

    const targetIdx = ctx.mapMonsters.findIndex(m => m.id === targetId);

    let damage = 0;
    let isCrit = false;
    let isMiss = false;
    /** 逐下明細。魔法技能只有一下，統一在最後補齊 */
    let hits: HitBreakdown[] = [];

    if (event.action.type === 'normal_attack') {
      const result = calculatePlayerAttack(
        character,
        weapon,
        monster,
        equippedGear,
        effectsForDamage,
        targetIdx,
        targetId,
      );
      damage = result.damage;
      isCrit = result.isCritical;
      isMiss = !result.hit;
      hits = result.hits;
    } else if (skill) {
      if (skill.dotOnly) {
        // § 23.7 毒霧：不造成直接傷害，只施加 `applyDebuff`
        damage = 0;
      } else if (skill.instantDotTicks && skill.applyDebuff?.dotDamagePercent) {
        // § 7S.5 毒霧強化：DoT 快照值 × 跳數一次打出，不吃防禦、不爆擊
        const perTick = Math.max(1, Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * skill.applyDebuff.dotDamagePercent));
        damage = perTick * skill.instantDotTicks;
        isMiss = false;
      } else if (skill.hits) {
        /**
         * 多段物理技能（目前只有三連射）。
         *
         * **每一發獨立判定命中**（`23-class-magic.md` § 23.4：「每箭獨立判定命中」，
         * 與雙刀／鋼爪的雙擊同一條規則，`21-combat-formula.md` § 21.4）——
         * 未命中的那一發回傳 0 傷害，不影響其他發。
         *
         * 只有**每一發都沒中**才算 MISS。任一發沒中就整筆作廢的話，
         * 打中的那幾發會連傷害一起被丟掉（後面是 `!isMiss && damage > 0` 才扣血）。
         */
        const fireEnchant = hasActiveFireEnchant(effectsForDamage);
        let anyHit = false;
        hits = [];
        for (let h = 0; h < skill.hits; h++) {
          const hitResult = calculatePhysicalSkillHit(
            character,
            weapon,
            monster,
            equippedGear,
            fireEnchant,
            skill.name,
            effectsForDamage,
            targetIdx,
            skill.ignoreDefensePercent ?? 0,
            targetId,
          );
          damage += hitResult.damage;
          if (hitResult.isCritical) isCrit = true;
          if (hitResult.hit) anyHit = true;
          hits.push({
            damage: hitResult.damage,
            isCrit: hitResult.isCritical,
            isMiss: !hitResult.hit,
          });
        }
        isMiss = !anyHit;
      } else if (skill.physicalSnapshot) {
        // § 21.4a：技能攻擊力 + 當下基礎物理傷害，仍然必定命中；不吃火矢附魔（`23-class-magic.md` § 23.1.1）
        const result = calculatePhysicalSnapshotSkill(
          character,
          skill.power,
          skill.element,
          weapon,
          monster,
          equippedGear,
          skill.name,
          effectsForDamage,
          targetIdx,
          skill.ignoreDefensePercent ?? 0,
          targetId,
        );
        damage = result.damage;
        isCrit = result.isCritical;
        isMiss = false;
      } else {
        // Magic skill
        const result = calculateSkillAttack(
          character,
          skill.power,
          skill.element,
          monster,
          equippedGear,
          skill.name,
          effectsForDamage,
          targetIdx,
          skill.ignoreDefensePercent ?? 0,
          targetId,
        );
        damage = result.damage;
        isCrit = result.isCritical;
        isMiss = false; // Magic skills don't miss
      }
    }

    /*
     * 單下判定的技能（魔法、快照型物理）不填 `hits`，這裡補一筆。
     * **必須在追加傷害、日誌與傷害明細之前補** —— 補在 `damages.push` 的參數裡的話，
     * 下面的日誌迴圈跑的還是空陣列，火球那類技能會完全沒有日誌。
     */
    if (hits.length === 0) hits = [{ damage, isCrit, isMiss }];

    if (damagePercent > 0 && !isMiss) {
      hits = hits.map(h => (h.isMiss ? h : { ...h, damage: applyComboBonus(h.damage, damagePercent) }));
      damage = hits.reduce((sum, h) => sum + h.damage, 0);
    }

    if (comboAbility && !isMiss && procs) {
      hits = hits.map(h => {
        if (h.isMiss) return h;
        const bonus = basicAttackClass ? advanceCombo(session.loop, comboAbility, comboStateKey) : castComboBonus;
        if (bonus > 0) logs.push({ text: `追打！傷害 +${bonus}%`, type: 'player' });
        return bonus > 0 ? { ...h, damage: applyComboBonus(h.damage, bonus), combo: true } : h;
      });
      damage = hits.reduce((sum, h) => sum + h.damage, 0);
    }

    // § 7S.5 專注打擊：逐下套用該怪的層數加成，結算後加層
    if (focusAbility && !isMiss && procs) {
      const boosted = applyFocusStrike(session.loop, focusAbility, focusStateKey, targetId, hits,
        id => (ctx.monsterInstances.get(id)?.currentHp ?? 0) > 0);
      hits = hits.map((h, i) => ({ ...h, damage: boosted[i] }));
      damage = hits.reduce((sum, h) => sum + h.damage, 0);
    }

    // § 7S.5 追加傷害：每下命中各擲一次，加在該下最終傷害
    const bonusDamage = findAbility(equippedGear, 'bonus_damage');
    if (bonusDamage && !isMiss && procs) {
      hits = hits.map(h => (!h.isMiss && random() * 100 < bonusDamage.params.chance
        ? { ...h, damage: h.damage + bonusDamage.params.damage }
        : h));
      damage = hits.reduce((sum, h) => sum + h.damage, 0);
    }
    const landedHits = hits.filter(h => !h.isMiss).length;

    // Apply damage
    if (!isMiss && damage > 0) {
      applyDamageToMonster(monster, damage);
      if (skill?.mpDrainRatio) drainDamage += damage;
    }

    const killed = monster.currentHp <= 0;
    if (killed) clearFocusTarget(session.loop, targetId);

    // On-hit poison trigger (normal attack + Envenom buff active)
    if (event.action.type === 'normal_attack' && !isMiss && !killed) {
      const poisonBuff = activeEffects.find(
        e => e.type === 'buff' && e.target === 'player' && e.category === 'poison-enchant'
      );
      if (poisonBuff) {
        const now = gameNow();
        const gs = session.game.getState();
        const envenomTemplate = getSkillTemplate('envenom');
        const debuff = envenomTemplate?.onHitDebuff;
        // § 24.3.2 DoT 不可刷新：中毒存續期間不重複施加，也不重複輸出日誌
        const alreadyPoisoned = !!debuff && gs.activeEffects.some(
          e => e.type === 'debuff' && e.category === debuff.category
            && e.target === 'monster' && e.targetMonsterId === targetId
            && now < e.startTime + e.duration
        );
        if (!alreadyPoisoned) {
          if (debuff) {
            let dotDmg = debuff.dotDamage ?? 0;
            if (debuff.dotDamagePercent) {
              // § 24.4.5：DoT 傷害於施加當下快照，最低 1 點
              // § 7S.5 淬毒強化：加成在施放淬毒時寫進 buff
              const boost = poisonBuff.modifiers?.find(m => m.stat === ENVENOM_DOT_BONUS_STAT)?.value ?? 0;
              const percent = debuff.dotDamagePercent * (100 + boost) / 100;
              dotDmg = Math.max(1, Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * percent));
            }
            const poisonEffect: ActiveEffect = {
              id: `debuff-${debuff.category}-${targetId}-${now}`,
              sourceSkillId: 'envenom',
              sourceSkillName: '淬毒',
              category: debuff.category,
              type: 'debuff',
              target: 'monster',
              targetIdx,
              targetMonsterId: targetId,
              dot: { damage: dotDmg, element: debuff.dotElement!, interval: debuff.dotInterval!, totalDuration: debuff.dotDuration! },
              startTime: now,
              duration: debuff.dotDuration!,
              tags: debuff.tags,
              name: debuff.name,
              description: `每秒 ${dotDmg} 傷害`,
            };
            gs.addEffect(poisonEffect);
            logs.push({ text: `淬毒觸發！${monsterLogName(monster)} ${debuff.name} ${debuff.dotDuration! / 1000}s（每秒 ${dotDmg}）`, type: 'debuff-enemy' });
          }
        }
      }
    }

    // § 7.4 元素侵蝕：命中後依觸發率上 DoT。普攻與魔法命中都判定；
    // 雙持武器一次攻擊打兩下，因此判定兩次（同淬毒的兩次判定，§ 23.7）。
    if (!isMiss && !killed && procs) {
      const erosion = getErosion(weapon?.affixes, weapon?.quality ?? 0);
      if (erosion) {
        const now = gameNow();
        const gs = session.game.getState();
        // § 24.3.2 DoT 不可刷新：存續期間不重複施加
        const alreadyEroded = gs.activeEffects.some(
          e => e.type === 'debuff' && e.category === EROSION_CATEGORY
            && e.target === 'monster' && e.targetMonsterId === targetId
            && now < e.startTime + e.duration
        );
        if (!alreadyEroded) {
          const rolls = event.action.type === 'normal_attack' ? getWeaponHitCount(weapon) : 1;
          let triggered = false;
          for (let r = 0; r < rolls && !triggered; r++) {
            if (random() * 100 < erosion.chance) triggered = true;
          }
          if (triggered) {
            gs.addEffect({
              id: `debuff-${EROSION_CATEGORY}-${targetId}-${now}`,
              sourceSkillId: 'element-erosion',
              sourceSkillName: '元素侵蝕',
              category: EROSION_CATEGORY,
              type: 'debuff',
              target: 'monster',
              targetIdx,
              targetMonsterId: targetId,
              dot: {
                damage: erosion.damage,
                element: erosion.element,
                interval: EROSION_TICK_MS,
                totalDuration: EROSION_DURATION_MS,
              },
              startTime: now,
              duration: EROSION_DURATION_MS,
              tags: ['eroded'],
              name: '元素侵蝕',
              description: `每秒 ${erosion.damage} 傷害`,
            });
            logs.push({
              text: `元素侵蝕觸發！${monsterLogName(monster)} 受侵蝕 ${EROSION_DURATION_MS / 1000}s（每秒 ${erosion.damage}）`,
              type: 'debuff-enemy',
            });
          }
        }
      }
    }

    // § 7.9 命中下降／防禦下降／元素下降：判定次數同元素侵蝕；同一隻怪同 category 後施放覆蓋並刷新時間
    if (!isMiss && !killed && procs) {
      const rolls = event.action.type === 'normal_attack' ? getWeaponHitCount(weapon) : 1;
      for (const proc of getWeaponDebuffAffixes(weapon?.affixes, weapon?.quality ?? 0)) {
        let triggered = false;
        for (let r = 0; r < rolls && !triggered; r++) {
          if (random() * 100 < AFFIX_DEBUFF_CHANCE) triggered = true;
        }
        if (!triggered) continue;
        const def = weaponDebuffDef(proc.type, proc.element);
        const now = gameNow();
        const gs = session.game.getState();
        session.game.setState({
          activeEffects: gs.activeEffects.filter(
            e => !(e.category === def.category && isActiveOnMonster(e, targetId, now)),
          ),
        });
        session.game.getState().addEffect({
          id: `debuff-${def.category}-${targetId}-${now}`,
          sourceSkillId: proc.type,
          sourceSkillName: def.name,
          category: def.category,
          type: 'debuff',
          target: 'monster',
          targetIdx,
          targetMonsterId: targetId,
          modifiers: [{ stat: def.stat, value: def.sign * proc.value, isPercent: true }],
          startTime: now,
          duration: AFFIX_DEBUFF_DURATION_MS,
          tags: [],
          name: def.name,
          description: `${def.name} ${proc.value.toFixed(1)}%`,
        });
        logs.push({
          text: `${def.name}觸發！${monsterLogName(monster)} ${def.name} ${proc.value.toFixed(1)}% ${AFFIX_DEBUFF_DURATION_MS / 1000}s`,
          type: 'debuff-enemy',
        });
      }
    }

    // § 7T.4 T7 命中類：每下命中判定一次
    if (!isMiss && procs) {
      uniqueHpGain += landedHits * sumUniqueAffix(equippedGear, 'hit_heal');
      uniqueMpGain += landedHits * sumUniqueAffix(equippedGear, 'hit_mana');
      if (killed) uniqueHpGain += sumUniqueAffix(equippedGear, 'kill_heal');
    }
    damages.push({ targetId, damage, isCrit, isMiss, killed, hits });

    // Build log
    const actionName = skill ? skill.name : '攻擊';
    /**
     * **一下一行**（`21-combat-formula.md` § 21.4：每下獨立判定命中與爆擊）。
     *
     * 擠成一行會變成一串加號，而且爆擊只能標在整行上 ——
     * 分開之後哪一下爆、哪一下沒中，一眼就看得到。
     */
    for (const h of procs ? hits : []) {
      logs.push(h.isMiss
        ? { text: `${actionName} ${monsterLogName(monster)} MISS！`, type: 'miss' }
        : {
            text: `${actionName} 對 ${monsterLogName(monster)} 造成 ${h.damage} 傷害${h.isCrit ? '（暴擊）' : ''}`,
            type: 'player',
          });
    }

    /* 每一下都沒中就沒有後續 —— 擊敗、debuff、吸血都不該發生 */
    if (!isMiss) {
      if (killed) {
        logs.push({ text: `${monsterLogName(monster)} 被擊敗！`, type: 'system' });
      }

      // Apply skill debuff on hit (DoT or stat modifier)
      if (!killed && skill?.applyDebuff && !skill.instantDotTicks) {
        const debuffDef = skill.applyDebuff;
        const now = gameNow();
        const gs = session.game.getState();

        // Check if same category debuff already active on this target
        const alreadyActive = gs.activeEffects.some(
          e => e.type === 'debuff' && e.category === debuffDef.category
            && e.target === 'monster' && e.targetMonsterId === targetId
            && now < e.startTime + e.duration
        );

        // § 24.3.1：純數值修正的 debuff 同 category 由後施放覆蓋前者（刷新時間）
        // DoT（§ 24.3.2）與控場（§ 24.3.3）維持「存續期間不可重新施加」
        const isRefreshable = !debuffDef.dotDamage && !debuffDef.dotDamagePercent && !debuffDef.stun && !debuffDef.root;
        if (alreadyActive && isRefreshable) {
          session.game.setState({
            activeEffects: gs.activeEffects.filter(
              e => !(e.type === 'debuff' && e.category === debuffDef.category && e.target === 'monster' && e.targetMonsterId === targetId)
            ),
          });
        }

        if (!alreadyActive || isRefreshable) {
          if (debuffDef.dotDamage || debuffDef.dotDamagePercent) {
            // DoT debuff (snapshot damage at cast time)
            // § 23.3 裂傷斬：每秒 70% 物理傷害（快照制）— 基準為角色物理傷害，與 § 23.7 淬毒一致
            // § 24.4.5：DoT 傷害於施加當下快照，最低 1 點
            const dotPercent = resolveDotDamagePercent(debuffDef, weapon?.isTwoHanded === true);
            const baseDmg = dotPercent
              ? Math.max(1, Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * dotPercent))
              : debuffDef.dotDamage ?? 0;

            const debuffEffect: ActiveEffect = {
              id: `debuff-${debuffDef.category}-${targetId}-${now}`,
              sourceSkillId: skill.id,
              sourceSkillName: skill.name,
              category: debuffDef.category,
              type: 'debuff',
              target: 'monster',
              targetIdx,
              targetMonsterId: targetId,
              dot: { damage: baseDmg, element: debuffDef.dotElement ?? skill.element, interval: debuffDef.dotInterval ?? 1000, totalDuration: debuffDef.dotDuration ?? 5000 },
              startTime: now,
              duration: debuffDef.dotDuration ?? 5000,
              tags: debuffDef.tags,
              name: debuffDef.name,
              description: `每秒 ${baseDmg} 傷害`,
            };
            gs.addEffect(debuffEffect);
            if (!alreadyActive) logs.push({ text: `${monsterLogName(monster)} ${debuffDef.name} ${(debuffDef.dotDuration ?? 5000) / 1000}s（每秒 ${baseDmg}）`, type: 'debuff-enemy' });
          } else if ((debuffDef.stun || debuffDef.root) && debuffDef.duration) {
            // 控場 debuff：暈眩（§ 24.5.1）、定身（§ 24.5.1b）
            const stunDuration = resolveDebuffDuration(debuffDef, isShieldEquipped(equippedGear)) ?? debuffDef.duration;
            // § 24.6：Boss 被控場後 10 秒內免疫任何控場效果
            if (monster.isBoss && monster.ccImmuneUntil !== undefined && monster.ccImmuneUntil > now) {
              logs.push({ text: `${monsterLogName(monster)} 免疫控場！`, type: 'debuff-enemy' });
            } else {
              const stunEffect: ActiveEffect = {
                id: `debuff-${debuffDef.category}-${targetId}-${now}`,
                sourceSkillId: skill.id,
                sourceSkillName: skill.name,
                category: debuffDef.category,
                type: 'debuff',
                target: 'monster',
                targetIdx,
                targetMonsterId: targetId,
                ...(debuffDef.stun ? { stun: true } : { root: true }),
                modifiers: debuffDef.modifiers,
                startTime: now,
                duration: stunDuration,
                tags: debuffDef.tags,
                name: debuffDef.name,
                description: debuffDef.description,
              };
              gs.addEffect(stunEffect);
              if (monster.isBoss) monster.ccImmuneUntil = now + BOSS_CC_IMMUNE_MS;
              if (!alreadyActive) logs.push({ text: `${skill.name} 命中！${monsterLogName(monster)} ${debuffDef.name} ${stunDuration / 1000}s`, type: 'debuff-enemy' });
            }
          } else if (debuffDef.modifiers && debuffDef.duration) {
            // Stat modifier debuff
            const debuffEffect: ActiveEffect = {
              id: `debuff-${debuffDef.category}-${targetId}-${now}`,
              sourceSkillId: skill.id,
              sourceSkillName: skill.name,
              category: debuffDef.category,
              type: 'debuff',
              target: 'monster',
              targetIdx,
              targetMonsterId: targetId,
              modifiers: debuffDef.modifiers,
              startTime: now,
              duration: debuffDef.duration,
              tags: debuffDef.tags,
              name: debuffDef.name,
              description: debuffDef.description,
            };
            gs.addEffect(debuffEffect);
            if (!alreadyActive) logs.push({ text: `${monsterLogName(monster)} ${debuffDef.name} ${debuffDef.duration / 1000}s`, type: 'debuff-enemy' });
          }
        }
      }
    }
  }

  // 攻擊技能附帶的自身 buff（復仇之刃、背刺）：傷害結算後才施加，不作用於本次技能（`23-class-magic.md` § 23.1.1）
  if (skill?.selfBuff) {
    const applied = applySkillSelfBuff(skill, character, session.game.getState().activeEffects, gameNow(), session);
    if (applied) {
      session.game.setState({ activeEffects: applied.effects });
      logs.push({ text: `${skill.name}：${applied.description}`, type: 'player' });
    }
  }

  // § 7S.5 單體技能擴散：主目標 3 格內其他怪受該下最終傷害 X%；計入回復、不觸發命中類效果
  const splash = findAbility(equippedGear, 'skill_splash');
  const primary = damages[0];
  if (splash && isSingleTargetSkill(skill) && damages.length === 1 && !primary.isMiss && primary.damage > 0) {
    const center = ctx.mapMonsters.find(m => m.id === primary.targetId)?.position;
    const amount = splashDamage(primary.damage, splash);
    for (const other of center && amount > 0 ? ctx.mapMonsters : []) {
      if (other.id === primary.targetId || getDistance(center!, other.position) > ABILITY_SPLASH_RADIUS) continue;
      const inst = ctx.monsterInstances.get(other.id);
      if (!inst || inst.currentHp <= 0) continue;
      applyDamageToMonster(inst, amount);
      if (skill?.mpDrainRatio) drainDamage += amount;
      const killed = inst.currentHp <= 0;
      damages.push({ targetId: other.id, damage: amount, isCrit: false, isMiss: false, killed, hits: [{ damage: amount, isCrit: false, isMiss: false }], splash: true });
      logs.push({ text: `擴散對 ${monsterLogName(inst)} 造成 ${amount} 傷害`, type: 'player' });
      if (killed) logs.push({ text: `${monsterLogName(inst)} 被擊敗！`, type: 'system' });
    }
  }

  // § 7.9 普攻擴散：主目標每一下最終傷害（含爆擊）× X%；必定命中、不爆擊、不扣防禦、不觸發命中類效果
  const attackSplash = event.action.type === 'normal_attack' ? getAffixBonusesFromGear(equippedGear).attack_splash : 0;
  const struck = damages[0];
  if (attackSplash > 0 && struck && !struck.isMiss) {
    const amounts = struck.hits
      .filter(h => !h.isMiss && h.damage > 0)
      .map(h => Math.floor(h.damage * attackSplash / 100))
      .filter(a => a > 0);
    const center = ctx.mapMonsters.find(m => m.id === struck.targetId)?.position;
    for (const other of center && amounts.length > 0 ? ctx.mapMonsters : []) {
      if (other.id === struck.targetId || getDistance(center!, other.position) > ATTACK_SPLASH_RADIUS) continue;
      const inst = ctx.monsterInstances.get(other.id);
      if (!inst || inst.currentHp <= 0) continue;
      const hits: HitBreakdown[] = [];
      for (const amount of amounts) {
        if (inst.currentHp <= 0) break;
        applyDamageToMonster(inst, amount);
        hits.push({ damage: amount, isCrit: false, isMiss: false });
      }
      const total = hits.reduce((sum, h) => sum + h.damage, 0);
      const killed = inst.currentHp <= 0;
      damages.push({ targetId: other.id, damage: total, isCrit: false, isMiss: false, killed, hits, splash: true });
      logs.push({ text: `普攻擴散對 ${monsterLogName(inst)} 造成 ${total} 傷害`, type: 'player' });
      if (killed) logs.push({ text: `${monsterLogName(inst)} 被擊敗！`, type: 'system' });
    }
  }

  // § 7.9 普攻回血／技能回血：含擴散、追加傷害、追打、專注打擊，依本次招式歸類
  if (procs) {
    const affixBonuses = getAffixBonusesFromGear(equippedGear);
    const percent = basicAttackClass ? affixBonuses.attack_lifesteal : affixBonuses.skill_lifesteal;
    logs.push(...applyAffixLifesteal(session, lifestealAmount(damages, percent), basicAttackClass ? '普攻回血' : '技能回血'));
  }

  logs.push(...applyUniqueAffixRestore(session, uniqueHpGain, uniqueMpGain));

  // Update skill cooldown in store
  if (skill) {
    const now = gameNow();
    const gs = session.game.getState();
    const skillIdx = gs.skills.findIndex(s => s.id === skill.id);
    if (skillIdx >= 0) {
      const newSkills = [...gs.skills];
      newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };
      const mpAfterCost = gs.character!.mp - skill.mpCost;
      const mpRestored = calculateMpRestored(
        drainDamage,
        skill.mpDrainRatio,
        mpAfterCost,
        getEffectiveMaxMp(gs.character!, gs.equippedGear, gs.activeEffects),
      );

      // Lifesteal: restore HP from damage dealt
      let hpRestored = 0;
      if (skill.lifestealPercent) {
        const totalDamage = damages.filter(d => !d.isMiss).reduce((sum, d) => sum + d.damage, 0);
        const lifestealAmount = Math.floor(totalDamage * skill.lifestealPercent / 100);
        const effMaxHp = getEffectiveMaxHp(gs.character!, gs.equippedGear, gs.activeEffects);
        hpRestored = Math.min(effMaxHp - gs.character!.hp, lifestealAmount);
      }

      const newChar = { ...gs.character!, mp: mpAfterCost + mpRestored, hp: gs.character!.hp + hpRestored };
      session.game.setState({ skills: newSkills, character: newChar });
      if (mpRestored > 0) {
        logs.push({ text: `${skill.name} 回復 ${mpRestored} MP`, type: 'player' });
      }
      if (hpRestored > 0) {
        logs.push({ text: `${skill.name} 吸血回復 ${hpRestored} HP`, type: 'player' });
      }
      return { damages, logs, skillUsed: skill, mpRestored, hpRestored };
    }
  }

  return { damages, logs, skillUsed: skill };
}

export function processMonsterAttack(
  event: MonsterAttackEvent,
  ctx: ArpgEventContext,
): MonsterAttackResult | null {
  const session = ctx.session ?? defaultSession;
  const monster = ctx.monsterInstances.get(event.monsterId);
  if (!monster || monster.currentHp <= 0) return null;

  const { character, equippedGear, activeEffects } = ctx;
  const monsterIdx = ctx.mapMonsters.findIndex(m => m.id === event.monsterId);

  let result = calculateMonsterAttack(
    monster,
    character,
    equippedGear,
    withPartyAffixDebuffs(activeEffects, ctx),
    monsterIdx,
    // 詠唱攻擊帶倍率，瞬發不帶（`25-monster-system.md` § 25.11）
    event.damageMultiplier ?? 1,
    event.monsterId,
  );

  // 煙霧彈的絕對迴避（`23-class-magic.md` § 23.7）：本來會受傷的一擊改為 MISS，用掉一次
  if (!result.dodged && result.damage > 0) {
    const remaining = consumeEvadeCharge(session.game.getState().activeEffects);
    if (remaining) {
      session.game.setState({ activeEffects: remaining });
      result = { ...result, dodged: true, hit: false, damage: 0 };
    }
  }

  // 護盾吸收（§ 24.4.9）：在所有減傷之後、實際扣血之前
  let actualDamage = result.damage;
  let shieldLog: CombatLog | undefined;
  if (!result.dodged && result.damage > 0) {
    const gsForShield = session.game.getState();
    const shield = absorbWithShield(result.damage, gsForShield.activeEffects);
    if (shield.absorbed > 0) {
      actualDamage = shield.damage;
      session.game.setState({ activeEffects: shield.effects });
      shieldLog = shield.broken
        ? { text: `聖光護盾吸收 ${shield.absorbed} 傷害後破裂`, type: 'system' }
        : { text: `聖光護盾吸收 ${shield.absorbed} 傷害`, type: 'system' };
    }

    // 魔力護盾（`23-class-magic.md` § 23.5）：聖光護盾之後，剩餘傷害的 30% 改扣 MP
    const mana = absorbWithManaShield(actualDamage, character.mp, session.game.getState().activeEffects);
    if (mana.mpUsed > 0 || mana.broken) {
      actualDamage = mana.damage;
      character.mp -= mana.mpUsed;
      if (mana.broken) session.game.setState({ activeEffects: mana.effects });
      const text = `魔力護盾承擔 ${mana.mpUsed} 傷害${mana.broken ? '，MP 耗盡護盾解除' : ''}`;
      shieldLog = shieldLog ? { ...shieldLog, text: `${shieldLog.text}；${text}` } : { text, type: 'system' };
    }
  }

  // Apply damage to player
  if (!result.dodged && actualDamage > 0) {
    const before = character.hp;
    character.hp = Math.max(0, character.hp - actualDamage);
    // 嗜血詞綴（`25-monster-system.md` § 25.12.3）：以實際扣到的 HP 計
    bloodthirstHeal(monster, before - character.hp);
  }

  // § 7S.5 飾品隨機技能：被命中（迴避不算）時荊棘反彈、累積怒氣、消耗平靜
  let thorns: { damage: number; killed: boolean } | undefined;
  const abilityLogs: CombatLog[] = [];
  if (!result.dodged && result.damage > 0) {
    const now = gameNow();
    // 荊棘反彈與荊棘傷害詞綴的 X 相加（`07-affix.md` § 7.9）
    const percent = sumAbilityParam(equippedGear, 'thorns', 'percent') + getAffixBonusesFromGear(equippedGear).thorns;
    const reflect = Math.floor(result.damage * percent / 100);
    if (reflect > 0 && monster.currentHp > 0) {
      applyDamageToMonster(monster, reflect);
      thorns = { damage: reflect, killed: monster.currentHp <= 0 };
      abilityLogs.push({ text: `荊棘反彈對 ${monsterLogName(monster)} 造成 ${reflect} 傷害`, type: 'player' });
      if (thorns.killed) abilityLogs.push({ text: `${monsterLogName(monster)} 被擊敗！`, type: 'system' });
    }
    const rage = gainRage(session.loop, equippedGear, result.damage, now);
    if (rage) session.game.setState({ activeEffects: applyPlayerBuff(session.game.getState().activeEffects, rage, now).effects });
    const calm = consumeCalm(session.loop, equippedGear, character.areaEnteredAt, now);
    if (calm > 0 && shortenCoolingSkills(session, equippedGear, calm, now)) {
      abilityLogs.push({ text: `平靜 ${calm}：冷卻中的技能縮短 ${calm}%`, type: 'system' });
    }
  }

  let logText: string;
  if (result.dodged) {
    logText = `${monsterLogName(monster)} 的攻擊被閃避！`;
  } else {
    logText = `${monsterLogName(monster)} 造成 ${actualDamage} 傷害`;
  }

  // § 7.4 受擊回血／受擊回魔：**受到傷害**時判定（被迴避就不算）。
  // 同一條詞綴可以出現在多個部位，每件各自判定一次。
  const restoreLogs: CombatLog[] = [];
  if (!result.dodged && actualDamage > 0) {
    const gs = session.game.getState();
    const maxHp = getEffectiveMaxHp(character, gs.equippedGear, gs.activeEffects);
    const maxMp = getEffectiveMaxMp(character, gs.equippedGear, gs.activeEffects);
    let hpGain = 0;
    for (const r of getOnHitRestore(equippedGear, 'on_hit_hp')) {
      if (random() * 100 < r.chance) hpGain += Math.max(1, Math.floor(maxHp * r.percent / 100));
    }
    let mpGain = 0;
    for (const r of getOnHitRestore(equippedGear, 'on_hit_mp')) {
      if (random() * 100 < r.chance) mpGain += Math.max(1, Math.floor(maxMp * r.percent / 100));
    }
    if (hpGain > 0 && character.hp > 0) {
      const before = character.hp;
      character.hp = Math.min(maxHp, character.hp + hpGain);
      const healed = character.hp - before;
      if (healed > 0) restoreLogs.push({ text: `受擊回血觸發！回復 ${healed} HP`, type: 'system' });
    }
    if (mpGain > 0) {
      const before = character.mp;
      character.mp = Math.min(maxMp, character.mp + mpGain);
      const gained = character.mp - before;
      if (gained > 0) restoreLogs.push({ text: `受擊回魔觸發！回復 ${gained} MP`, type: 'system' });
    }
  }

  // 命中後判定角色 debuff（§ 24.4.2 / § 25.9.2）
  let debuffLog: CombatLog | undefined;
  if (!result.dodged) {
    const gs = session.game.getState();
    const magicResist = getTotalMagicResist(character, equippedGear, gs.activeEffects);
    const roll = rollMonsterDebuff(monster, equippedGear, gs.activeEffects, gameNow(), magicResist);
    if (roll.resisted) {
      debuffLog = { text: `魔法抗性擋下了 ${monsterLogName(monster)} 的負面效果`, type: 'debuff-self' };
    } else if (roll.effect) {
      const applied = applyPlayerDebuff(gs.activeEffects, roll.effect);
      session.game.setState({ activeEffects: applied.effects });
      debuffLog = applied.cancelledSpeedBuff
        ? { text: `${monsterLogName(monster)} 的減速抵銷了你的加速效果`, type: 'debuff-self' }
        : { text: `${monsterLogName(monster)} 使你 ${roll.effect.name} ${roll.effect.duration / 1000}s`, type: 'debuff-self' };
    }
  }

  // § 7T.4 T7 受擊觸發：受到傷害才判定，同種類刷新時間。排在 debuff 判定之後，不影響這一下
  if (!result.dodged && actualDamage > 0) {
    const now = gameNow();
    const buffs = rollUniqueStruckBuffs(equippedGear, now);
    if (buffs.length > 0) {
      let effects = session.game.getState().activeEffects;
      for (const buff of buffs) {
        effects = applyPlayerBuff(effects, buff, now).effects;
        restoreLogs.push({ text: `${buff.name}觸發！${buff.description} ${buff.duration / 1000}s`, type: 'system' });
      }
      session.game.setState({ activeEffects: effects });
    }
  }

  restoreLogs.push(...abilityLogs);
  return {
    monsterId: event.monsterId,
    damage: actualDamage,
    isDodged: result.dodged,
    isBlocked: false,
    log: { text: logText, type: 'monster' },
    debuffLog,
    shieldLog,
    ...(restoreLogs.length ? { restoreLogs } : {}),
    ...(thorns ? { thorns } : {}),
  };
}
