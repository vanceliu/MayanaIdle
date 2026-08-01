import type { PlayerAttackEvent, MonsterAttackEvent } from './arpgEngine';
import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { EquipmentInstance } from '../models/equipment';
import type { MapMonster } from '../stores/mapMonsterStore';
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculateMonsterAttack,
  calculateBasePhysicalDamage,
  hasActiveFireEnchant,
  getAffixBonusesFromGear,
  calculateMpRestored,
  absorbWithShield,
  getTotalMagicResist,
} from './combat';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, type CombatLog } from '../stores/gameStore';
import { getSkillTemplate } from '../models/skillTemplate';
import { rollMonsterDebuff, applyPlayerDebuff, applyPlayerBuff } from './playerDebuffSystem';

/** § 24.6 Boss 控場免疫冷卻 */
export const BOSS_CC_IMMUNE_MS = 10_000;

export interface SelfBuffApplyResult {
  effects: ActiveEffect[];
  description: string;
}

/**
 * 施加攻擊技能附帶的自身 buff（§ 23.3 復仇之刃、§ 23.7 背刺）。
 * `scaleByMissingHp` 依施放當下的已損失血量比率決定加成，加成為 0 時不施加。
 */
export function applySkillSelfBuff(
  skill: Skill,
  character: Character,
  activeEffects: ActiveEffect[],
  now: number = Date.now(),
): SelfBuffApplyResult | null {
  const def = skill.selfBuff;
  if (!def) return null;

  const modifiers = [...(def.modifiers ?? [])];
  let description = def.description;

  if (def.scaleByMissingHp) {
    const maxHp = getEffectiveMaxHp(character, useGameStore.getState().equippedGear);
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
  character: Character;
  equippedGear: (EquipmentInstance | null)[];
  activeEffects: ActiveEffect[];
  skills: Skill[];
  monsterInstances: Map<string, MonsterInstance>;
  mapMonsters: MapMonster[];
}

export interface DamageResult {
  targetId: string;
  damage: number;
  isCrit: boolean;
  isMiss: boolean;
  killed: boolean;
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
}

export function processPlayerAttack(
  event: PlayerAttackEvent,
  ctx: ArpgEventContext,
): PlayerAttackResult {
  const { character, equippedGear, activeEffects } = ctx;
  const damages: DamageResult[] = [];
  const logs: CombatLog[] = [];
  const weapon = equippedGear[0] ?? null;
  let drainDamage = 0;

  const skill = event.skill;

  // Handle buff/heal skills — these target the player, not monsters
  if (skill && (skill.type === 'buff' || skill.type === 'heal')) {
    const now = Date.now();
    const gs = useGameStore.getState();
    const skillIdx = gs.skills.findIndex(s => s.id === skill.id);

    if (skill.type === 'buff') {
      const template = getSkillTemplate(skill.id);
      const buffDuration = template?.buffDuration ?? skill.buffDuration;
      const newChar = { ...character, mp: character.mp - skill.mpCost };
      const newSkills = [...gs.skills];
      if (skillIdx >= 0) newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };

      if (buffDuration) {
        const buffEffect: ActiveEffect = {
          id: `buff-${skill.id}-${now}`,
          sourceSkillId: skill.id,
          sourceSkillName: skill.name,
          category: template?.buffCategory ?? skill.buffCategory ?? skill.id,
          type: 'buff',
          target: 'player',
          modifiers: template?.buffModifiers ?? skill.buffModifiers ?? [],
          startTime: now,
          duration: buffDuration,
          tags: [],
          name: skill.name,
          description: template?.buffEffect ?? skill.buffEffect ?? '',
        };
        const hotAmount = template?.hotAmount ?? skill.hotAmount;
        if (hotAmount) buffEffect.hot = { amount: hotAmount, interval: 1000 };
        if (template?.invincible ?? skill.invincible) buffEffect.invincible = true;
        if (template?.immuneDebuff ?? skill.immuneDebuff) buffEffect.immuneDebuff = true;
        const shieldMod = buffEffect.modifiers?.find(m => m.stat === 'shield_absorb');
        if (shieldMod) buffEffect.shieldRemaining = shieldMod.value;

        if (skill.cleanse) {
          const cleansed = gs.activeEffects.filter(e => !(e.type === 'debuff' && e.target === 'player'));
          useGameStore.setState({ character: newChar, skills: newSkills, activeEffects: cleansed });
        } else {
          const applied = applyPlayerBuff(gs.activeEffects, buffEffect);
          useGameStore.setState({ character: newChar, skills: newSkills, activeEffects: applied.effects });
          if (applied.cancelledSlow) logs.push({ text: `${skill.name} 解除了減速`, type: 'debuff-self' });
        }
      } else {
        useGameStore.setState({ character: newChar, skills: newSkills });
      }

      logs.push({ text: `施放 ${skill.name}`, type: 'player' });
    } else if (skill.type === 'heal' && skill.healAmount) {
      const allGear = Object.values(gs.equippedGear).filter(Boolean) as EquipmentInstance[];
      const healBonuses = getAffixBonusesFromGear(allGear);
      const effMaxHp = getEffectiveMaxHp(character, gs.equippedGear);
      const effectiveHeal = Math.floor(skill.healAmount * (1 + healBonuses.heal_effect / 100));
      const healed = Math.min(effMaxHp - character.hp, effectiveHeal);

      const newChar = { ...character, hp: character.hp + healed, mp: character.mp - skill.mpCost };
      const newSkills = [...gs.skills];
      if (skillIdx >= 0) newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };

      useGameStore.setState({ character: newChar, skills: newSkills });
      logs.push({ text: `施放 ${skill.name} 回復 ${healed} HP`, type: 'player' });
      return { damages: [], logs, skillUsed: skill, healAmount: healed };
    }

    return { damages: [], logs, skillUsed: skill };
  }

  // 攻擊技能附帶的自身 buff（復仇之刃、背刺）——
  // 於傷害結算「前」施加，本次攻擊也吃得到加成。
  let effectsForDamage = activeEffects;
  if (skill?.selfBuff) {
    const applied = applySkillSelfBuff(skill, character, useGameStore.getState().activeEffects);
    if (applied) {
      useGameStore.setState({ activeEffects: applied.effects });
      effectsForDamage = applied.effects;
      logs.push({ text: `${skill.name}：${applied.description}`, type: 'player' });
    }
  }

  for (const targetId of event.targetMonsterIds) {
    const monster = ctx.monsterInstances.get(targetId);
    if (!monster || monster.currentHp <= 0) continue;

    const targetIdx = ctx.mapMonsters.findIndex(m => m.id === targetId);

    let damage = 0;
    let isCrit = false;
    let isMiss = false;

    if (event.action.type === 'normal_attack') {
      const result = calculatePlayerAttack(
        character,
        weapon,
        monster,
        equippedGear,
        effectsForDamage,
        targetIdx,
      );
      damage = result.damage;
      isCrit = result.isCritical;
      isMiss = !result.hit;
    } else if (skill) {
      if (skill.hits) {
        // Multi-hit physical skill
        const fireEnchant = hasActiveFireEnchant(effectsForDamage);
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
          );
          damage += hitResult.damage;
          if (hitResult.isCritical) isCrit = true;
          if (!hitResult.hit) isMiss = true;
        }
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
        );
        damage = result.damage;
        isCrit = result.isCritical;
        isMiss = false; // Magic skills don't miss
      }
    }

    // Apply damage
    if (!isMiss && damage > 0) {
      monster.currentHp = Math.max(0, monster.currentHp - damage);
      if (skill?.mpDrainRatio) drainDamage += damage;
    }

    const killed = monster.currentHp <= 0;

    // On-hit poison trigger (normal attack + Envenom buff active)
    if (event.action.type === 'normal_attack' && !isMiss && !killed) {
      const poisonBuff = activeEffects.find(
        e => e.type === 'buff' && e.target === 'player' && e.category === 'poison-enchant'
      );
      if (poisonBuff) {
        const now = Date.now();
        const gs = useGameStore.getState();
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
              dotDmg = Math.max(1, Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * debuff.dotDamagePercent));
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
            logs.push({ text: `淬毒觸發！${monster.name} ${debuff.name} ${debuff.dotDuration! / 1000}s（每秒 ${dotDmg}）`, type: 'debuff-enemy' });
          }
        }
      }
    }

    damages.push({ targetId, damage, isCrit, isMiss, killed });

    // Build log
    const actionName = skill ? skill.name : '攻擊';
    if (isMiss) {
      logs.push({ text: `${actionName} ${monster.name} MISS！`, type: 'miss' });
    } else {
      const critText = isCrit ? '（暴擊）' : '';
      logs.push({ text: `${actionName} 對 ${monster.name} 造成 ${damage} 傷害${critText}`, type: 'player' });
      if (killed) {
        logs.push({ text: `${monster.name} 被擊敗！`, type: 'system' });
      }

      // Apply skill debuff on hit (DoT or stat modifier)
      if (!killed && skill?.applyDebuff) {
        const debuffDef = skill.applyDebuff;
        const now = Date.now();
        const gs = useGameStore.getState();

        // Check if same category debuff already active on this target
        const alreadyActive = gs.activeEffects.some(
          e => e.type === 'debuff' && e.category === debuffDef.category
            && e.target === 'monster' && e.targetMonsterId === targetId
            && now < e.startTime + e.duration
        );

        // § 24.3.1：純數值修正的 debuff 同 category 由後施放覆蓋前者（刷新時間）
        // DoT（§ 24.3.2）與控場（§ 24.3.3）維持「存續期間不可重新施加」
        const isRefreshable = !debuffDef.dotDamage && !debuffDef.dotDamagePercent && !debuffDef.stun;
        if (alreadyActive && isRefreshable) {
          useGameStore.setState({
            activeEffects: gs.activeEffects.filter(
              e => !(e.type === 'debuff' && e.category === debuffDef.category && e.target === 'monster' && e.targetMonsterId === targetId)
            ),
          });
        }

        if (!alreadyActive || isRefreshable) {
          if (debuffDef.dotDamage || debuffDef.dotDamagePercent) {
            // DoT debuff (snapshot damage at cast time)
            // § 23.3 裂傷斬：每秒 50% 物理傷害（快照制）— 基準為角色物理傷害，與 § 23.7 淬毒一致
            // § 24.4.5：DoT 傷害於施加當下快照，最低 1 點
            const baseDmg = debuffDef.dotDamagePercent
              ? Math.max(1, Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * debuffDef.dotDamagePercent))
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
            if (!alreadyActive) logs.push({ text: `${monster.name} ${debuffDef.name} ${(debuffDef.dotDuration ?? 5000) / 1000}s（每秒 ${baseDmg}）`, type: 'debuff-enemy' });
          } else if (debuffDef.stun && debuffDef.duration) {
            // 控場 debuff（§ 24.5.1）
            // § 24.6：Boss 被控場後 30 秒內免疫任何控場效果
            if (monster.isBoss && monster.ccImmuneUntil !== undefined && monster.ccImmuneUntil > now) {
              logs.push({ text: `${monster.name} 免疫控場！`, type: 'debuff-enemy' });
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
                stun: true,
                modifiers: debuffDef.modifiers,
                startTime: now,
                duration: debuffDef.duration,
                tags: debuffDef.tags,
                name: debuffDef.name,
                description: debuffDef.description,
              };
              gs.addEffect(stunEffect);
              if (monster.isBoss) monster.ccImmuneUntil = now + BOSS_CC_IMMUNE_MS;
              if (!alreadyActive) logs.push({ text: `${skill.name} 命中！${monster.name} ${debuffDef.name} ${debuffDef.duration / 1000}s`, type: 'debuff-enemy' });
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
            if (!alreadyActive) logs.push({ text: `${monster.name} ${debuffDef.name} ${debuffDef.duration / 1000}s`, type: 'debuff-enemy' });
          }
        }
      }
    }
  }

  // Update skill cooldown in store
  if (skill) {
    const now = Date.now();
    const gs = useGameStore.getState();
    const skillIdx = gs.skills.findIndex(s => s.id === skill.id);
    if (skillIdx >= 0) {
      const newSkills = [...gs.skills];
      newSkills[skillIdx] = { ...newSkills[skillIdx], lastUsedAt: now };
      const mpAfterCost = gs.character!.mp - skill.mpCost;
      const mpRestored = calculateMpRestored(
        drainDamage,
        skill.mpDrainRatio,
        mpAfterCost,
        getEffectiveMaxMp(gs.character!, gs.equippedGear),
      );

      // Lifesteal: restore HP from damage dealt
      let hpRestored = 0;
      if (skill.lifestealPercent) {
        const totalDamage = damages.filter(d => !d.isMiss).reduce((sum, d) => sum + d.damage, 0);
        const lifestealAmount = Math.floor(totalDamage * skill.lifestealPercent / 100);
        const effMaxHp = getEffectiveMaxHp(gs.character!, gs.equippedGear);
        hpRestored = Math.min(effMaxHp - gs.character!.hp, lifestealAmount);
      }

      const newChar = { ...gs.character!, mp: mpAfterCost + mpRestored, hp: gs.character!.hp + hpRestored };
      useGameStore.setState({ skills: newSkills, character: newChar });
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
  const monster = ctx.monsterInstances.get(event.monsterId);
  if (!monster || monster.currentHp <= 0) return null;

  const { character, equippedGear, activeEffects } = ctx;
  const monsterIdx = ctx.mapMonsters.findIndex(m => m.id === event.monsterId);

  const result = calculateMonsterAttack(
    monster,
    character,
    equippedGear,
    activeEffects,
    monsterIdx,
  );

  // 護盾吸收（§ 24.4.9）：在所有減傷之後、實際扣血之前
  let actualDamage = result.damage;
  let shieldLog: CombatLog | undefined;
  if (!result.dodged && result.damage > 0) {
    const gsForShield = useGameStore.getState();
    const shield = absorbWithShield(result.damage, gsForShield.activeEffects);
    if (shield.absorbed > 0) {
      actualDamage = shield.damage;
      useGameStore.setState({ activeEffects: shield.effects });
      shieldLog = shield.broken
        ? { text: `聖光護盾吸收 ${shield.absorbed} 傷害後破裂`, type: 'system' }
        : { text: `聖光護盾吸收 ${shield.absorbed} 傷害`, type: 'system' };
    }
  }

  // Apply damage to player
  if (!result.dodged && actualDamage > 0) {
    character.hp = Math.max(0, character.hp - actualDamage);
  }

  let logText: string;
  if (result.dodged) {
    logText = `${monster.name} 的攻擊被閃避！`;
  } else {
    logText = `${monster.name} 造成 ${actualDamage} 傷害`;
  }

  // 命中後判定角色 debuff（§ 24.4.2 / § 25.9.2）
  let debuffLog: CombatLog | undefined;
  if (!result.dodged) {
    const gs = useGameStore.getState();
    const magicResist = getTotalMagicResist(character, equippedGear, gs.activeEffects);
    const roll = rollMonsterDebuff(monster, equippedGear, gs.activeEffects, Date.now(), magicResist);
    if (roll.resisted) {
      debuffLog = { text: `魔法抗性擋下了 ${monster.name} 的負面效果`, type: 'debuff-self' };
    } else if (roll.effect) {
      const applied = applyPlayerDebuff(gs.activeEffects, roll.effect);
      useGameStore.setState({ activeEffects: applied.effects });
      debuffLog = applied.cancelledSpeedBuff
        ? { text: `${monster.name} 的減速抵銷了你的加速效果`, type: 'debuff-self' }
        : { text: `${monster.name} 使你 ${roll.effect.name} ${roll.effect.duration / 1000}s`, type: 'debuff-self' };
    }
  }

  return {
    monsterId: event.monsterId,
    damage: actualDamage,
    isDodged: result.dodged,
    isBlocked: false,
    log: { text: logText, type: 'monster' },
    debuffLog,
    shieldLog,
  };
}
