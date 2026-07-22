import type { ArpgEvent, PlayerAttackEvent, MonsterAttackEvent } from './arpgEngine';
import type { Character } from '../models/character';
import type { MonsterInstance } from '../models/monster';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { EquipmentInstance } from '../models/equipment';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { CombatLog } from './combat';
import {
  calculatePlayerAttack,
  calculateSkillAttack,
  calculatePhysicalSkillHit,
  calculateMonsterAttack,
  hasActiveFireEnchant,
} from './combat';

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

  const skill = event.skill;

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
    }

    const killed = monster.currentHp <= 0;

    damages.push({ targetId, damage, isCrit, isMiss, killed });

    // Build log
    const actionName = skill ? skill.name : '攻擊';
    if (isMiss) {
      logs.push({ text: `${actionName} ${monster.name} MISS！`, type: 'miss' });
    } else {
      const critText = isCrit ? '（暴擊）' : '';
      logs.push({ text: `對 ${monster.name} 造成 ${damage} 傷害${critText}`, type: 'player' });
      if (killed) {
        logs.push({ text: `${monster.name} 被擊敗！`, type: 'system' });
      }
    }
  }

  // Update skill cooldown
  if (skill) {
    skill.lastUsedAt = Date.now();
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
