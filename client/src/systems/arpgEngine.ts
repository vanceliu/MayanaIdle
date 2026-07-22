import type { Position, MapData } from '../models/mapControl';
import type { MonsterInstance } from '../models/monster';
import type { Character } from '../models/character';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { CombatAction } from '../models/scriptEngine';
import type { EquipmentInstance } from '../models/equipment';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInfo } from './playerCombatFSM';
import type { MonsterAttackConfig } from './monsterCombatFSM';
import {
  type PlayerCombatContext,
  createPlayerCombatContext,
  tickPlayerCombat,
  getWeaponAttackConfig,
} from './playerCombatFSM';
import {
  type MonsterCombatContext,
  createMonsterCombatContext,
  tickMonsterCombat,
  DEFAULT_MONSTER_ATTACK_CONFIG,
} from './monsterCombatFSM';
import { getDistance, findTargetsInRadius } from './lineOfSight';
import { evaluateCombatScript, type CombatScriptContext } from './scriptRunner';
import { getPlayerAttackInterval, getSkillCooldownReduction } from './combat';

export interface ArpgMonster {
  instance: MonsterInstance;
  mapMonster: MapMonster;
  combatCtx: MonsterCombatContext;
  attackConfig: MonsterAttackConfig;
}

export interface ArpgEngineState {
  playerCtx: PlayerCombatContext;
  monsters: Map<string, ArpgMonster>;
  active: boolean;
}

export function createArpgEngine(): ArpgEngineState {
  return {
    playerCtx: createPlayerCombatContext(),
    monsters: new Map(),
    active: false,
  };
}

export interface ArpgTickInput {
  playerPos: Position;
  character: Character;
  skills: Skill[];
  activeEffects: ActiveEffect[];
  equippedGear: (EquipmentInstance | null)[];
  combatRules: { enabled: boolean; condition: any; action: CombatAction; id: string }[];
  mapMonsters: MapMonster[];
  monsterInstances: Map<string, MonsterInstance>;
  map: MapData;
  deltaMs: number;
}

export interface PlayerAttackEvent {
  type: 'player_attack';
  action: CombatAction;
  targetMonsterIds: string[];
  skill?: Skill;
}

export interface MonsterAttackEvent {
  type: 'monster_attack';
  monsterId: string;
}

export interface MoveToEvent {
  type: 'move_to';
  target: Position;
}

export type ArpgEvent = PlayerAttackEvent | MonsterAttackEvent | MoveToEvent;

export function tickArpgEngine(
  engine: ArpgEngineState,
  input: ArpgTickInput,
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  const {
    playerPos, character, skills, activeEffects, equippedGear,
    combatRules, mapMonsters, monsterInstances, map, deltaMs,
  } = input;

  // Sync monster combat contexts
  syncMonsterContexts(engine, mapMonsters, monsterInstances);

  // Determine weapon type for attack config
  const weapon = equippedGear[0];
  const weaponType = weapon?.baseType;
  const attackConfig = getWeaponAttackConfig(weaponType);

  // Update player attack cooldown from gear
  engine.playerCtx.attackCooldown = getPlayerAttackInterval(equippedGear, activeEffects);

  // Build monster info for player FSM
  const monsterInfos: MonsterInfo[] = [];
  for (const [id, arpgMonster] of engine.monsters) {
    monsterInfos.push({
      index: monsterInfos.length,
      position: arpgMonster.mapMonster.position,
      alive: arpgMonster.instance.currentHp > 0,
    });
  }

  // Tick player combat FSM
  const playerResult = tickPlayerCombat(
    engine.playerCtx,
    playerPos,
    monsterInfos,
    attackConfig,
    map,
    deltaMs,
  );

  if (playerResult.action === 'move_to' && playerResult.moveTarget) {
    events.push({ type: 'move_to', target: playerResult.moveTarget });
  }

  if (playerResult.action === 'attack') {
    // Use script to decide skill
    const aliveMonsters = Array.from(engine.monsters.values())
      .filter(m => m.instance.currentHp > 0)
      .map(m => m.instance);

    const scriptCtx: CombatScriptContext = {
      character,
      monsters: aliveMonsters,
      skills,
      now: Date.now(),
      cooldownReduction: getSkillCooldownReduction(equippedGear),
    };

    const scriptAction = evaluateCombatScript(combatRules, scriptCtx);
    const action: CombatAction = scriptAction ?? { type: 'normal_attack' };

    // Determine targets
    const targetIds = resolveTargets(engine, action, skills, playerPos, input);

    if (targetIds.length > 0) {
      const skill = action.type === 'skill'
        ? skills.find(s => s.id === action.skillId)
        : undefined;

      events.push({
        type: 'player_attack',
        action,
        targetMonsterIds: targetIds,
        skill,
      });
    }
  }

  // Tick each monster FSM
  for (const [id, arpgMonster] of engine.monsters) {
    if (arpgMonster.instance.currentHp <= 0) continue;

    const result = tickMonsterCombat(
      arpgMonster.combatCtx,
      arpgMonster.mapMonster.position,
      playerPos,
      arpgMonster.attackConfig,
      map,
      deltaMs,
    );

    if (result.action === 'attack') {
      events.push({ type: 'monster_attack', monsterId: id });
    }
  }

  return events;
}

function syncMonsterContexts(
  engine: ArpgEngineState,
  mapMonsters: MapMonster[],
  monsterInstances: Map<string, MonsterInstance>,
): void {
  const currentIds = new Set(mapMonsters.map(m => m.id));

  // Remove despawned
  for (const id of engine.monsters.keys()) {
    if (!currentIds.has(id)) {
      engine.monsters.delete(id);
    }
  }

  // Add new
  for (const mm of mapMonsters) {
    if (!engine.monsters.has(mm.id)) {
      const instance = monsterInstances.get(mm.id);
      if (!instance) continue;

      engine.monsters.set(mm.id, {
        instance,
        mapMonster: mm,
        combatCtx: createMonsterCombatContext(),
        attackConfig: {
          attackType: instance.attackType,
          attackRange: instance.attackRange,
          attackInterval: instance.attackInterval,
        },
      });
    } else {
      // Update position reference
      const existing = engine.monsters.get(mm.id)!;
      existing.mapMonster = mm;
      const inst = monsterInstances.get(mm.id);
      if (inst) existing.instance = inst;
    }
  }
}

function resolveTargets(
  engine: ArpgEngineState,
  action: CombatAction,
  skills: Skill[],
  playerPos: Position,
  input: ArpgTickInput,
): string[] {
  const aliveMonsters = Array.from(engine.monsters.entries())
    .filter(([, m]) => m.instance.currentHp > 0);

  if (aliveMonsters.length === 0) return [];

  // Find primary target (nearest or FSM selected)
  const targetIdx = engine.playerCtx.targetMonsterIdx;
  let primaryId: string | null = null;

  if (targetIdx !== null) {
    const monsterEntries = Array.from(engine.monsters.entries());
    if (targetIdx < monsterEntries.length) {
      primaryId = monsterEntries[targetIdx][0];
    }
  }

  if (!primaryId) {
    // Fallback to nearest
    let minDist = Infinity;
    for (const [id, m] of aliveMonsters) {
      const d = getDistance(playerPos, m.mapMonster.position);
      if (d < minDist) {
        minDist = d;
        primaryId = id;
      }
    }
  }

  if (!primaryId) return [];

  // Single target or no skill
  if (action.type === 'normal_attack') {
    return [primaryId];
  }

  if (action.type === 'skill' && action.skillId) {
    const skill = skills.find(s => s.id === action.skillId);
    if (!skill) return [primaryId];

    // Single target skill
    if (skill.target === 'single') {
      return [primaryId];
    }

    // AOE skill
    if (skill.target === 'aoe') {
      const aoeRadius = skill.aoeMax ?? 3;
      const maxTargets = skill.aoeMax ?? 3;

      // Determine center
      const primaryMonster = engine.monsters.get(primaryId);
      if (!primaryMonster) return [primaryId];

      // Check if this is self-centered (melee AOE like ice nova)
      // Heuristic: if skill has no projectile concept and is short range, it's self-centered
      const isSelfCentered = skill.element !== 'none' && !skill.power; // Will refine later
      // For now: use target-centered for all AOE skills
      const center = primaryMonster.mapMonster.position;

      const candidates = aliveMonsters
        .filter(([id]) => id !== primaryId)
        .map(([id, m], idx) => ({
          position: m.mapMonster.position,
          index: idx,
          id,
        }));

      const nearbyIndices = findTargetsInRadius(
        center,
        aoeRadius,
        candidates.map((c, i) => ({ position: c.position, index: i })),
        maxTargets - 1, // -1 because primary is already included
      );

      const targetIds = [primaryId];
      for (const idx of nearbyIndices) {
        targetIds.push(candidates[idx].id);
      }
      return targetIds;
    }
  }

  return [primaryId];
}
