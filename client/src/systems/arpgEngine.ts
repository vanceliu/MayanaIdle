import type { Position, MapData } from '../models/mapControl';
import type { MonsterInstance } from '../models/monster';
import type { Character } from '../models/character';
import type { Skill } from '../models/skill';
import type { ActiveEffect } from '../models/effect';
import type { CombatAction, CombatRule } from '../models/scriptEngine';
import type { EquipmentInstance } from '../models/equipment';
import type { MapMonster } from '../stores/mapMonsterStore';
import type { MonsterInfo } from './playerCombatFSM';
import type { MonsterAttackConfig } from './monsterCombatFSM';
import { getWeightStatus, getOverweightMessage, type BagItemLike } from './weight';
import {
  type PlayerCombatContext,
  createPlayerCombatContext,
  tickPlayerCombat,
  getWeaponAttackConfig,
  getScriptChaseRange,
} from './playerCombatFSM';
import {
  type MonsterCombatContext,
  createMonsterCombatContext,
  tickMonsterCombat,
} from './monsterCombatFSM';
import { resolveActionTargets } from './targeting';
import type { MonsterAttackType } from '../models/monster';
import { evaluateCombatScript, skillMeetsWeaponRequirement, type CombatScriptContext, type ScriptMonsterView, type HpSample } from './scriptRunner';
import { pickTargetBy, type TargetPickCandidate, type TargetStrategy } from './targeting';
import { isNonAttackAction } from '../models/scriptEngine';
import { canUseSkill } from '../models/skill';
import { getPlayerAttackInterval, getSkillCooldownReduction, getMonsterDebuffModifierById, getEquippedWeapon } from './combat';
import { isPlayerStunned } from './playerDebuffSystem';

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
  /**
   * 玩家從快捷格指定、要在下一個攻擊 tick 施放的**攻擊技能**（`03-combat.md` § 3.6.2）。
   *
   * 放在引擎狀態而不是每 tick 的 input：指令下達與攻擊 tick 之間隔著不定幀數
   * （要等冷卻、等走進射程），每 tick 傳一次的話呼叫端無從得知哪一幀真的用掉了它。
   */
  manualSkillId: string | null;
}

export function createArpgEngine(): ArpgEngineState {
  return {
    playerCtx: createPlayerCombatContext(),
    monsters: new Map(),
    active: false,
    manualSkillId: null,
  };
}

/**
 * 玩家點怪指定目標（§ 3.6.1）。回傳是否採納。
 *
 * 屍體與不在場上的怪一律不採納，維持原目標 —— 指令作廢比清空目標安全，
 * 後者會讓角色站著發呆一個 tick。
 */
export function applyManualTarget(engine: ArpgEngineState, monsterId: string): boolean {
  const target = engine.monsters.get(monsterId);
  if (!target || target.instance.currentHp <= 0) return false;
  engine.playerCtx.targetMonsterId = monsterId;
  return true;
}

/** 玩家從快捷格指定攻擊技能。重複指定只保留最後一次（§ 3.6.2） */
export function queueManualSkill(engine: ArpgEngineState, skillId: string): void {
  engine.manualSkillId = skillId;
}

/**
 * 手動指定的技能此刻能不能出。查不到、不是攻擊技能、CD／MP／武器不符一律回 null。
 *
 * 按下的當下已經擋過一次（`gameStore.useQuickSlot`），這裡是第二道 ——
 * 指令排到出手之間可能隔了好幾秒，MP 早就被腳本用掉了。
 */
function resolveManualAttackSkill(
  skillId: string | null,
  skills: Skill[],
  mp: number,
  now: number,
  cooldownReduction: number,
  weaponType: string | undefined,
): Skill | null {
  if (!skillId) return null;
  const skill = skills.find(s => s.id === skillId);
  if (!skill || skill.type !== 'attack') return null;
  if (!skillMeetsWeaponRequirement(skill, weaponType)) return null;
  return canUseSkill(skill, mp, now, cooldownReduction) ? skill : null;
}

export interface ArpgTickInput {
  playerPos: Position;
  character: Character;
  skills: Skill[];
  activeEffects: ActiveEffect[];
  equippedGear: (EquipmentInstance | null)[];
  combatRules: CombatRule[];
  mapMonsters: MapMonster[];
  monsterInstances: Map<string, MonsterInstance>;
  map: MapData;
  deltaMs: number;
  /** 背包內容，用於負重判定（§ 20.7）。未提供時視為不超重 */
  bagItems?: BagItemLike[];
  /** 共用條件用（`51-auto-talent.md` § 51.4.5）。未提供時對應條件一律不成立 */
  effectiveMaxHp?: number;
  weightPercent?: number;
  hpHistory?: HpSample[];
}

export interface PlayerAttackEvent {
  type: 'player_attack';
  action: CombatAction;
  targetMonsterIds: string[];
  skill?: Skill;
  attackType?: MonsterAttackType;
}

export interface MonsterAttackEvent {
  type: 'monster_attack';
  monsterId: string;
  attackType?: MonsterAttackType;
  projectileSpeed?: number;
}

export interface MoveToEvent {
  type: 'move_to';
  target: Position;
  range: number;
}

/**
 * 超重擋下了這次出手（§ 20.7）。
 * 每次出手判定都會發一次，讓玩家知道自己為什麼打不出去。
 */
export interface OverweightBlockedEvent {
  type: 'overweight_blocked';
  message: string;
}

export type ArpgEvent = PlayerAttackEvent | MonsterAttackEvent | MoveToEvent | OverweightBlockedEvent;

export function tickArpgEngine(
  engine: ArpgEngineState,
  input: ArpgTickInput,
): ArpgEvent[] {
  const events: ArpgEvent[] = [];
  const {
    playerPos, character, skills, activeEffects, equippedGear,
    combatRules, mapMonsters, monsterInstances, map, deltaMs,
    effectiveMaxHp, weightPercent, hpHistory,
  } = input;

  // Sync monster combat contexts
  syncMonsterContexts(engine, mapMonsters, monsterInstances);

  // Determine weapon type for attack config
  const weapon = getEquippedWeapon(equippedGear);
  const weaponType = weapon?.type !== 'armor' ? weapon?.type : undefined;
  const attackConfig = getWeaponAttackConfig(weaponType);
  // attackConfig.range 之後會被技能撐開，普通攻擊的判定要用武器原值
  const weaponRange = attackConfig.range;

  // Pre-evaluate script to determine effective attack range
  // If script would use a ranged skill, extend the range
  const aliveForScript = buildScriptMonsters(engine);

  // 追擊距離看「腳本啟用的規則會用到什麼」，與此刻剛好選中哪一招無關。
  // 少了這一條，技能全在冷卻時射程會塌回武器射程，遠程職業就會往怪身上蹭（§ 3.1）
  attackConfig.chaseRange = getScriptChaseRange(combatRules, skills, attackConfig.range);

  const cooldownReduction = getSkillCooldownReduction(character, equippedGear, activeEffects);

  /*
   * 手動指定的技能優先於腳本（§ 3.6.3），因此追擊距離與「有沒有事可做」都要先看它 ——
   * 少了這一步，玩家指定一招射程比腳本更遠的技能時，角色會照腳本的射程走位，
   * 走到定位才發現要放的是另一招。
   */
  const manualSkill = resolveManualAttackSkill(
    engine.manualSkillId, skills, character.mp, Date.now(), cooldownReduction, weaponType,
  );

  let hasExecutableAction = true;
  if (aliveForScript.length > 0) {
    const scriptCtx: CombatScriptContext = {
      character,
      monsters: aliveForScript,
      skills,
      now: Date.now(),
      cooldownReduction,
      weaponType,
      playerPos,
      primaryTargetId: engine.playerCtx.targetMonsterId ?? null,
      weaponRange,
      // 目標身上的 debuff／護盾條件要靠它（`51-auto-talent.md` § 51.4.10 的「接線」項）
      activeEffects,
      effectiveMaxHp,
      weightPercent,
      hpHistory,
    };
    const nextAction: CombatAction | null = manualSkill
      ? { type: 'skill', skillId: manualSkill.id }
      : evaluateCombatScript(combatRules, scriptCtx);
    hasExecutableAction = nextAction !== null;
    if (nextAction?.type === 'skill' && nextAction.skillId) {
      const skill = skills.find(s => s.id === nextAction.skillId);
      if (skill && skill.type === 'attack' && skill.range && skill.range > attackConfig.range) {
        attackConfig.range = skill.range;
        attackConfig.attackType = 'ranged';
      }
    }
  }

  // Update player attack cooldown from gear
  engine.playerCtx.attackCooldown = getPlayerAttackInterval(equippedGear, activeEffects);

  // Build monster info for player FSM
  const monsterInfos: MonsterInfo[] = [];
  for (const [id, arpgMonster] of engine.monsters) {
    monsterInfos.push({
      id,
      index: monsterInfos.length,
      position: arpgMonster.mapMonster.position,
      alive: arpgMonster.instance.currentHp > 0,
    });
  }

  // Tick player combat FSM（暈眩中暫停攻擊計時器）
  const playerStunned = isPlayerStunned(activeEffects);
  const playerResult = tickPlayerCombat(
    engine.playerCtx,
    playerPos,
    monsterInfos,
    attackConfig,
    map,
    deltaMs,
    playerStunned,
    hasExecutableAction,
  );

  if (playerResult.action === 'move_to' && playerResult.moveTarget && playerResult.moveRange !== undefined) {
    events.push({ type: 'move_to', target: playerResult.moveTarget, range: playerResult.moveRange });
  }

  if (playerResult.action === 'attack') {
    // Use combat script to decide attack action
    const scriptCtx: CombatScriptContext = {
      character,
      monsters: buildScriptMonsters(engine),
      skills,
      now: Date.now(),
      cooldownReduction,
      weaponType,
      playerPos,
      primaryTargetId: engine.playerCtx.targetMonsterId ?? null,
      weaponRange,
      // 目標身上的 debuff／護盾條件要靠它（`51-auto-talent.md` § 51.4.10 的「接線」項）
      activeEffects,
      effectiveMaxHp,
      weightPercent,
      hpHistory,
    };

    /*
     * 手動指定只對**這一個**攻擊 tick 有效（§ 3.6.2），因此無論用不用得成都先清掉。
     * 留著會變成「按一次放兩次」：指令等在那裡，下一個 tick 又被撿起來。
     */
    const manualId = engine.manualSkillId;
    engine.manualSkillId = null;

    /**
     * 腳本評估不出動作就**不出手**，不可退回普通攻擊。
     *
     * 退回普攻會直接無視玩家的設定：關掉普通攻擊規則的人，只要怪走進武器射程
     * 就會被迫貼身平A（`41-arpg-combat.md`：「玩家關掉普通攻擊就代表不打算貼身」）。
     * 新角色的預設腳本本來就內建一條啟用的普通攻擊（`DEFAULT_COMBAT_SCRIPT`），
     * 不需要在引擎裡再補一層看不見的退路。
     *
     * 正常情況下這裡不會是 null —— `tickPlayerCombat` 在 `hasExecutableAction === false`
     * 時就不會發 `attack` 了；只有「評估兩次之間剛好有技能轉好／條件變動」的極短競態會落到這裡。
     */
    // § 3.6.3 優先權：手動指定的技能 → 戰鬥腳本 → 不動作
    const action: CombatAction | null =
      manualId && manualSkill && manualSkill.id === manualId
        ? { type: 'skill', skillId: manualId }
        : evaluateCombatScript(combatRules, scriptCtx);

    // 超重時無法攻擊也無法施放魔法（§ 20.7）。攻擊冷卻照樣走完才判定，
    // 所以訊息的頻率等同出手頻率，不會每個 frame 洗版。
    const weight = getWeightStatus(character, equippedGear, input.bagItems ?? []);
    if (action && isNonAttackAction(action.type) && action.type !== 'wait') {
      /*
       * 切換目標與走位（§ 51.4.9）。**消耗這次出手機會**，與「不動作」同性質 ——
       * 一個天賦格只有一個實作槽，先切目標再打就是兩格兩個 tick。
       * 超重不擋這些：走位與改打誰不是攻擊，超重的人更需要跑。
       */
      applyNonAttackAction(engine, action, scriptCtx, playerPos, activeEffects);
    } else if (!action) {
      // 沒有可執行動作：原地待命，什麼事都不做
    } else if (weight.overweight) {
      events.push({ type: 'overweight_blocked', message: getOverweightMessage(weight) });
    } else if (action.type === 'skill' && action.skillId) {
      const skill = skills.find(s => s.id === action.skillId);
      if (skill && (skill.type === 'buff' || skill.type === 'heal')) {
        events.push({
          type: 'player_attack',
          action,
          targetMonsterIds: [],
          skill,
          attackType: attackConfig.attackType,
        });
      } else {
        const targetIds = resolveTargets(engine, action, skills, playerPos, skill?.range ?? weaponRange);
        if (targetIds.length > 0) {
          events.push({
            type: 'player_attack',
            action,
            targetMonsterIds: targetIds,
            skill,
            attackType: attackConfig.attackType,
          });
        }
      }
    } else {
      // 普通攻擊只有武器射程 —— resolveTargets 若不看距離，
      // 遠程站位下會變成「12 格外平A」
      const targetIds = resolveTargets(engine, action, skills, playerPos, weaponRange);
      if (targetIds.length > 0) {
        events.push({
          type: 'player_attack',
          action,
          targetMonsterIds: targetIds,
          attackType: attackConfig.attackType,
        });
      }
    }
  }

  // Tick each monster FSM
  for (const [id, arpgMonster] of engine.monsters) {
    if (arpgMonster.instance.currentHp <= 0) continue;
    /*
     * 木樁不還手（`50-training-ground.md` § 50.4.1）。整個 FSM 都跳過而不是只丟掉
     * attack 事件 —— 跑 FSM 會讓它進入 chase 狀態並累積攻擊計時器，
     * 哪天有人把「木樁反擊模式」接回來時會突然一次噴出一整排攻擊。
     */
    if (arpgMonster.instance.isTrainingDummy) continue;

    // Check if this monster is stunned
    const isStunned = activeEffects.some(
      e => e.type === 'debuff' && e.target === 'monster' && e.stun && e.targetMonsterId === id
    );

    // 減速 debuff：攻速百分比換算為攻擊間隔（冰系魔法）
    const slowPercent = getMonsterDebuffModifierById(activeEffects, id, 'attack_speed');
    const attackConfigForTick = slowPercent !== 0
      ? {
          ...arpgMonster.attackConfig,
          attackInterval: Math.floor(
            arpgMonster.attackConfig.attackInterval / Math.max(0.1, 1 + slowPercent / 100)
          ),
        }
      : arpgMonster.attackConfig;

    const result = tickMonsterCombat(
      arpgMonster.combatCtx,
      arpgMonster.mapMonster.position,
      playerPos,
      attackConfigForTick,
      map,
      deltaMs,
      isStunned,
    );

    if (result.action === 'attack') {
      events.push({
        type: 'monster_attack',
        monsterId: id,
        attackType: arpgMonster.attackConfig.attackType,
        projectileSpeed: arpgMonster.instance.projectileSpeed,
      });
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

/** 引擎狀態 → 戰鬥腳本看到的怪（只留活怪，帶 id 與位置） */
function buildScriptMonsters(engine: ArpgEngineState): ScriptMonsterView[] {
  const views: ScriptMonsterView[] = [];
  for (const [id, m] of engine.monsters) {
    if (m.instance.currentHp > 0) {
      views.push({ id, instance: m.instance, position: m.mapMonster.position });
    }
  }
  return views;
}

function resolveTargets(
  engine: ArpgEngineState,
  action: CombatAction,
  skills: Skill[],
  playerPos: Position,
  /** 這個動作自己的射程。主目標超出就不出手，不可沿用 FSM 被技能撐開的值 */
  maxRange: number,
): string[] {
  return resolveActionTargets({
    candidates: buildScriptMonsters(engine).map(m => ({ id: m.id, position: m.position })),
    playerPos,
    primaryTargetId: engine.playerCtx.targetMonsterId ?? null,
    action,
    skills,
    maxRange,
  });
}

/** 切換目標／走位動作的實際效果（`51-auto-talent.md` § 51.4.9） */
function applyNonAttackAction(
  engine: ArpgEngineState,
  action: CombatAction,
  ctx: CombatScriptContext,
  playerPos: Position,
  activeEffects: ActiveEffect[],
): void {
  const now = Date.now();

  if (action.type === 'lock_target') {
    // 鎖定：把當下的目標釘住，FSM 不再改挑最近的一隻
    engine.playerCtx.lockedTargetId = engine.playerCtx.targetMonsterId ?? null;
    return;
  }

  const strategy = TARGET_STRATEGY_OF[action.type];
  if (strategy) {
    const candidates: TargetPickCandidate[] = ctx.monsters.map(m => ({
      id: m.id,
      position: m.position,
      hpPercent: m.instance.maxHp > 0 ? (m.instance.currentHp / m.instance.maxHp) * 100 : 0,
      race: m.instance.race,
      element: m.instance.element,
      debuffTags: activeEffects
        .filter(e => e.target === 'monster' && e.targetMonsterId === m.id && now - e.startTime < e.duration)
        .flatMap(e => e.tags),
    }));
    const picked = pickTargetBy(strategy, candidates, playerPos, action.match);
    // 挑不到就維持原目標 —— 切不成不該讓角色變成沒有目標
    if (picked) {
      engine.playerCtx.targetMonsterId = picked;
      engine.playerCtx.lockedTargetId = null;
    }
    return;
  }

  // 走位：只設意圖，實際移動由 FSM 在下一幀處理
  if (action.type === 'keep_distance' || action.type === 'close_in' || action.type === 'disengage') {
    engine.playerCtx.moveIntent = { kind: action.type, distance: action.distance };
  }
}

const TARGET_STRATEGY_OF: Partial<Record<string, TargetStrategy>> = {
  switch_target_lowest_hp: 'lowest_hp',
  switch_target_highest_hp: 'highest_hp',
  switch_target_farthest: 'farthest',
  switch_target_by_kind: 'by_kind',
};
