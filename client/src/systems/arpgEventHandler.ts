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
} from './combat';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, type CombatLog } from '../stores/gameStore';
import { getSkillTemplate } from '../models/skillTemplate';

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

        if (skill.cleanse) {
          const cleansed = gs.activeEffects.filter(e => !(e.type === 'debuff' && e.target === 'player'));
          useGameStore.setState({ character: newChar, skills: newSkills, activeEffects: cleansed });
        } else {
          const filtered = gs.activeEffects.filter(
            e => !(e.type === 'buff' && e.category === buffEffect.category && e.target === 'player')
          );
          useGameStore.setState({ character: newChar, skills: newSkills, activeEffects: [...filtered, buffEffect] });
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
        activeEffects,
        targetIdx,
      );
      damage = result.damage;
      isCrit = result.isCritical;
      isMiss = !result.hit;
    } else if (skill) {
      if (skill.hits) {
        // Multi-hit physical skill
        const fireEnchant = hasActiveFireEnchant(activeEffects);
        for (let h = 0; h < skill.hits; h++) {
          const hitResult = calculatePhysicalSkillHit(
            character,
            weapon,
            monster,
            equippedGear,
            fireEnchant,
            skill.name,
            activeEffects,
            targetIdx,
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
          activeEffects,
          targetIdx,
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
        const alreadyPoisoned = gs.activeEffects.some(
          e => e.type === 'debuff' && e.category === 'poison' && e.target === 'monster' && e.targetMonsterId === targetId
        );
        if (!alreadyPoisoned) {
          const envenomTemplate = getSkillTemplate('envenom');
          const debuff = envenomTemplate?.onHitDebuff;
          if (debuff) {
            let dotDmg = debuff.dotDamage ?? 0;
            if (debuff.dotDamagePercent) {
              dotDmg = Math.floor(calculateBasePhysicalDamage(character, weapon, equippedGear, activeEffects) * debuff.dotDamagePercent);
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
            logs.push({ text: `淬毒觸發！${monster.name} ${debuff.name} ${debuff.dotDuration! / 1000}s（每秒 ${dotDmg}）`, type: 'player' });
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
          e => e.type === 'debuff' && e.category === debuffDef.category && e.target === 'monster' && e.targetMonsterId === targetId
        );

        if (!alreadyActive) {
          if (debuffDef.dotDamage || debuffDef.dotDamagePercent) {
            // DoT debuff (snapshot damage at cast time)
            const baseDmg = debuffDef.dotDamagePercent
              ? Math.floor(damage * debuffDef.dotDamagePercent / 100)
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
            logs.push({ text: `${monster.name} ${debuffDef.name} ${(debuffDef.dotDuration ?? 5000) / 1000}s（每秒 ${baseDmg}）`, type: 'player' });
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
            logs.push({ text: `${monster.name} ${debuffDef.name} ${debuffDef.duration / 1000}s`, type: 'player' });
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

  // Apply damage to player
  if (!result.dodged && result.damage > 0) {
    character.hp = Math.max(0, character.hp - result.damage);
  }

  let logText: string;
  if (result.dodged) {
    logText = `${monster.name} 的攻擊被閃避！`;
  } else {
    logText = `${monster.name} 造成 ${result.damage} 傷害`;
  }

  return {
    monsterId: event.monsterId,
    damage: result.damage,
    isDodged: result.dodged,
    isBlocked: false,
    log: { text: logText, type: 'monster' },
  };
}
