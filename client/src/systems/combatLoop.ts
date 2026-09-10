/**
 * ARPG 戰鬥模擬的每 tick 入口（`41-arpg-combat.md`、`97-selfhosted-server.md` § 97.6、§ 97.7.1）。
 *
 * 只做判定與 store 更新，不碰 Pixi；演出需求以 `CombatVisual` 回傳，由 client 渲染層消費。
 * 兩層結構：
 * - 每實例：`tickInstanceCombat`（怪物實例建立、目標選擇、怪物 FSM）與 `applyMonsterAttacks`
 * - 每玩家：`tickMemberCombat`（手動指令、玩家 FSM 與腳本、出手結算、DoT）
 *
 * `tickCombat` 是本機（一人實例）的組合入口；server 由 `systems/worldTick.ts` 逐層呼叫。
 */
import type { Position } from '../models/mapControl';
import type { MonsterInstance, MonsterAttackType, ElementType } from '../models/monster';
import { isRangedAttackType } from '../models/monster';
import type { EquipmentInstance } from '../models/equipment';
import type { CombatLog } from '../stores/gameStore';
import { getEffectiveMaxHp, processMonsterDeath, waitForPendingDrops, type MonsterDeathOptions } from '../stores/gameStore';
import { talentCombatRules } from '../stores/talentStore';
import { useTrainingGroundStore } from '../stores/trainingGroundStore';
import { defaultSession, type Session } from '../stores/session';
import { getNearestTown } from '../models/mapData';
import { hasProjectilePath } from './lineOfSight';
import { consumeDotTick } from './gameLoop';
import { findAttackPosition, findNearestWalkable, isAttackPosition } from './pathfinding';
import {
  tickArpgEngine, applyManualTarget, queueManualSkill, syncMonsterContexts, tickMonsterEngines, isMonsterStunned,
  type MonsterAttackEvent,
} from './arpgEngine';
import { processPlayerAttack, processMonsterAttack, type DamageResult, type PlayerAttackResult } from './arpgEventHandler';
import { getEquippedWeapon, getPlayerAttackInterval, isPlayerInvincible, absorbWithShield, getMonsterDebuffModifierById } from './combat';
import { createMonsterFromTemplate } from './monsterSpawn';
import { getEffectiveGearArray } from './gear';
import { gameNow } from '../core/clock';
import { pick } from '../core/rng';
import { abortCast } from './monsterCombatFSM';
import {
  createCombatState, ensureInstance, findMember, leaveInstance, memberIdOf, memberPosition, presentMembers,
  resetPlayerCombat, type MapInstance,
} from './mapInstance';
import { createMonsterTargetState, recordMonsterDamage, resolveMonsterTarget, type MemberCandidate } from './monsterTargeting';
import { playerOccupantId } from '../models/unit';
import { getMonsterTemplates } from '../models/monsterTemplates';

export { createCombatState };

/**
 * 演出事件。`memberId` 指出是哪位成員的事（單機為 0）：
 * 隊友的出手、被打、DoT、治癒都要在隊友的剪影上演（§ 97.7.1 只渲染自己與隊友）。
 */
export type CombatVisual =
  | { kind: 'face'; memberId: number; target: Position }
  | {
      kind: 'player_attack';
      memberId: number;
      result: PlayerAttackResult;
      ranged: boolean;
      weapon: EquipmentInstance | null | undefined;
      playerPos: Position;
      /**
       * 每個被打到的目標在**判定當下**的位置。
       *
       * 渲染端不可回頭去 store 查：致命的那一擊在判定的同一個 tick 就把怪從 store 拿掉了，
       * 查不到就整段演出（武器揮擊、投射物、傷害數字、白閃、屍體保留）全部跳過。
       */
      targetPositions: Record<string, Position>;
      attackIntervalMs: number;
    }
  | {
      kind: 'monster_attack';
      monsterId: string;
      /** 被打的成員 */
      memberId: number;
      /** 攻擊者在判定當下的位置；投射物由此射出。同一 tick 死掉也還畫得出來 */
      attackerPos: Position | null;
      /** 被打的成員在判定當下的位置 */
      victimPos: Position;
      attackType: MonsterAttackType;
      /** 有視線才演投射物；沒有視線就退回近戰演出（傷害照樣結算） */
      ranged: boolean;
      damage: number;
      isDodged: boolean;
      crit: boolean;
      hasDebuff: boolean;
      projectileSpeed?: number;
      element?: ElementType;
    }
  | { kind: 'dot'; memberId: number; target: 'player' | 'monster'; monsterId?: string; damage: number; tags: readonly string[]; position: Position }
  | { kind: 'heal'; memberId: number; amount: number }
  /** 常駐天賦的自身施法（`48-vfx.md` § 48.8.5） */
  | { kind: 'self_cast'; memberId: number; skillId: string; healed: number };

const MAX_LOGS = 200;

defaultSession.combat = createCombatState();
ensureInstance(defaultSession);

function appendLogs(session: Session, logs: CombatLog[]): void {
  if (logs.length === 0) return;
  const existing = session.game.getState().combatLogs;
  session.game.setState({ combatLogs: [...existing.slice(-(MAX_LOGS - logs.length)), ...logs] });
}

/** 換地圖：玩家 FSM 歸零並離開實例（一人實例清空後沿用） */
export function resetCombat(session: Session = defaultSession): void {
  ensureInstance(session);
  resetPlayerCombat(session);
  leaveInstance(session);
}

/** 載入該區域的怪物模板到實例；先清空，換區時不可沿用上一區的模板 */
export function loadAreaTemplates(areaId: string, session: Session = defaultSession): void {
  const target = ensureInstance(session).areaTemplates;
  target.length = 0;
  target.push(...getMonsterTemplates(areaId));
}

/** 本機入口：一人實例的整個戰鬥層 */
export function tickCombat(deltaMs: number, session: Session = defaultSession): CombatVisual[] {
  const instance = ensureInstance(session);
  const attacks = tickInstanceCombat(deltaMs, instance);
  const visuals = tickMemberCombat(deltaMs, session);
  visuals.push(...applyMonsterAttacks(instance, attacks));
  return visuals;
}

/** 這隻怪的目標選擇狀態；沒有就建 */
function targetingOf(instance: MapInstance, monsterId: string) {
  let state = instance.targeting.get(monsterId);
  if (!state) {
    state = createMonsterTargetState();
    instance.targeting.set(monsterId, state);
  }
  return state;
}

/**
 * 實例層：怪物實例建立、FSM context 同步、目標選擇（§ 97.7.1）、怪物 FSM 推進。
 * 回傳的攻擊事件由 `applyMonsterAttacks` 在成員出手之後結算。
 */
export function tickInstanceCombat(deltaMs: number, instance: MapInstance): MonsterAttackEvent[] {
  const members = presentMembers(instance);
  if (members.length === 0) return [];
  const map = members[0].mapControl.getState().currentMap!;
  const monsterStore = instance.mapMonster.getState();
  const { monsterInstances, areaTemplates, engineMonsters, targeting } = instance;

  // Ensure monster instances exist
  for (const mm of monsterStore.monsters) {
    if (!monsterInstances.has(mm.id)) {
      const inst = createMonsterFromTemplate(mm, areaTemplates);
      // 模板未載入 → 這個 tick 先不建實例，下一個 tick 再試（不生假怪）
      if (!inst) continue;
      monsterInstances.set(mm.id, inst);
      // 射程回填到 MapMonster，移動邏輯才停得在射程上（`41-arpg-combat.md` § 5.2）
      if (mm.attackRange !== inst.attackRange) {
        monsterStore.setMonsterAttackRange(mm.id, inst.attackRange);
      }
    }
  }
  const activeIds = new Set(monsterStore.monsters.map(m => m.id));
  for (const id of monsterInstances.keys()) {
    if (!activeIds.has(id)) monsterInstances.delete(id);
  }
  for (const id of targeting.keys()) {
    if (!activeIds.has(id)) targeting.delete(id);
  }

  syncMonsterContexts({ monsters: engineMonsters }, instance.mapMonster.getState().monsters, monsterInstances);

  // 目標選擇：候選為在場且活著的成員
  const now = gameNow();
  const candidates: MemberCandidate[] = [];
  for (const m of members) {
    const ch = m.game.getState().character;
    if (ch && ch.hp > 0) candidates.push({ id: memberIdOf(m), position: memberPosition(m) });
  }
  for (const [id, am] of engineMonsters) {
    if (am.instance.currentHp <= 0 || am.instance.isTrainingDummy) continue;
    const state = targetingOf(instance, id);
    const previous = state.targetId;
    const engaged = am.combatCtx.state !== 'roaming';
    const next = resolveMonsterTarget(state, am.mapMonster.position, candidates, engaged, am.combatCtx.leashRange, now);
    // 詠唱中目標死亡或離線：中止，不出手，重選目標後重新讀條（§ 25.11.1）
    const lost = previous !== null && !candidates.some(c => c.id === previous);
    if (lost && next !== previous && am.combatCtx.state === 'casting') abortCast(am.combatCtx, 'chasing');
  }

  return tickMonsterEngines({ monsters: engineMonsters }, map, deltaMs, id => {
    const targetId = targeting.get(id)?.targetId ?? null;
    if (targetId === null) return null;
    const member = findMember(instance, targetId);
    if (!member || !member.mapControl.getState().currentMap) return null;
    // 控場來自任一成員的效果
    let stunned = false;
    let slowPercent = 0;
    for (const m of members) {
      const effects = m.game.getState().activeEffects;
      if (isMonsterStunned(effects, id)) stunned = true;
      slowPercent = Math.min(slowPercent, getMonsterDebuffModifierById(effects, id, 'attack_speed'));
    }
    return { memberId: targetId, position: memberPosition(member), stunned, slowPercent };
  });
}

/** 怪物攻擊結算：對目標成員的 session 判定，演出給實例全體 */
export function applyMonsterAttacks(instance: MapInstance, events: MonsterAttackEvent[]): CombatVisual[] {
  const visuals: CombatVisual[] = [];
  for (const event of events) {
    const session = event.targetMemberId === undefined ? presentMembers(instance)[0] : findMember(instance, event.targetMemberId);
    if (!session) continue;
    const gameState = session.game.getState();
    const mapStore = session.mapControl.getState();
    const monsterStore = session.mapMonster.getState();
    if (!gameState.character || !mapStore.currentMap) continue;
    const playerPos = mapStore.playerPosition;
    const currentMap = mapStore.currentMap;
    const monsterInstances = instance.monsterInstances;
    const allGear = getEffectiveGearArray(gameState.character, gameState.activeEffects, gameState.equippedGear) as any[];

    if (isRangedAttackType(event.attackType)) {
      const attacker = monsterStore.monsters.find(monster => monster.id === event.monsterId);
      if (!attacker || !hasProjectilePath(attacker.position, playerPos, currentMap)) continue;
    }
    const result = processMonsterAttack(event, {
      session,
      character: gameState.character,
      equippedGear: allGear,
      activeEffects: gameState.activeEffects,
      skills: gameState.skills,
      monsterInstances,
      mapMonsters: monsterStore.monsters,
    });
    if (!result) continue;

    const logs: CombatLog[] = [result.log];
    if (result.shieldLog) logs.push(result.shieldLog);
    if (result.debuffLog) logs.push(result.debuffLog);
    if (result.restoreLogs) logs.push(...result.restoreLogs);
    appendLogs(session, logs);

    const monster = monsterStore.monsters.find(m => m.id === event.monsterId);
    visuals.push({
      kind: 'monster_attack',
      monsterId: event.monsterId,
      memberId: memberIdOf(session),
      attackerPos: monster ? { ...monster.position } : null,
      victimPos: { ...playerPos },
      attackType: event.attackType ?? 'melee',
      ranged: isRangedAttackType(event.attackType)
        && !!monster
        && hasProjectilePath(monster.position, playerPos, currentMap),
      damage: result.isDodged ? 0 : result.damage,
      isDodged: result.isDodged,
      crit: (event.damageMultiplier ?? 1) > 1,
      hasDebuff: !!result.debuffLog,
      projectileSpeed: event.projectileSpeed,
      element: monsterInstances.get(event.monsterId)?.element,
    });

    const updatedChar = session.game.getState().character;
    if (updatedChar && updatedChar.hp <= 0) {
      handlePlayerDeath(session);
    }
  }
  return visuals;
}

/** 玩家層：手動指令、玩家 FSM 與腳本、出手結算、追擊走位、DoT */
export function tickMemberCombat(deltaMs: number, session: Session): CombatVisual[] {
  const visuals: CombatVisual[] = [];
  const instance = ensureInstance(session);
  const { engine, monsterInstances } = session.combat;
  const gameState = session.game.getState();
  const mapStore = session.mapControl.getState();
  const monsterStore = session.mapMonster.getState();

  if (!gameState.character || !mapStore.currentMap) return visuals;

  const memberId = memberIdOf(session);
  const playerPos = mapStore.playerPosition;
  const currentMap = mapStore.currentMap;
  const allGear = getEffectiveGearArray(gameState.character!, gameState.activeEffects, gameState.equippedGear) as any[];

  /*
   * 手動介入指令（§ 3.6）。**必須在 `tickArpgEngine` 之前消費**：
   * 引擎在同一個 tick 內就會用掉它們，晚一步等於玩家的操作永遠慢一幀。
   *
   * 也必須在實例層的怪物同步之後 —— `applyManualTarget` 查的是 `engine.monsters`，
   * 剛進場的怪還沒同步進去就會被當成「不在場上」而作廢。
   */
  const commands = session.combatCommand.getState();
  const manualTargetId = commands.consumeTarget();
  if (manualTargetId) applyManualTarget(engine, manualTargetId);
  const manualSkillId = commands.consumeSkill();
  if (manualSkillId) queueManualSkill(engine, manualSkillId);
  // 常駐天賦的走位（§ 51.4.9 T5）：只設意圖，實際移動由 FSM 下一 tick 處理
  const pendingMove = commands.consumeMove();
  if (pendingMove) engine.playerCtx.moveIntent = pendingMove;

  const events = tickArpgEngine(engine, {
    playerPos,
    character: gameState.character,
    skills: gameState.skills,
    activeEffects: gameState.activeEffects,
    equippedGear: allGear,
    // 規則來自天賦格（`51-auto-talent.md`），不再讀 template 的規則陣列
    combatRules: talentCombatRules(gameState.activeTemplateId, session.talent.getState().slots),
    effectiveMaxHp: getEffectiveMaxHp(gameState.character, gameState.equippedGear),
    mapMonsters: monsterStore.monsters,
    monsterInstances,
    map: mapStore.currentMap,
    bagItems: gameState.bagItems,
    deltaMs,
    // 怪物 FSM 由實例層推進（§ 97.7.1）
    skipMonsters: true,
  });

  // If player FSM is idle and autoMove (not paused), find next target
  if (engine.playerCtx.state === 'idle' && mapStore.autoMove && !mapStore.isMoving && !mapStore.paused) {
    session.mapControl.getState().pickRandomTarget();
  }

  const logs: CombatLog[] = [];
  const now = gameNow();

  for (const event of events) {
    switch (event.type) {
      case 'overweight_blocked': {
        // 每次出手判定都顯示一次（§ 20.7）
        logs.push({ text: event.message, type: 'system' });
        break;
      }
      case 'player_attack': {
        // Stop after reaching the current tile waypoint
        const mapCtrl2 = session.mapControl.getState();
        if (mapCtrl2.isMoving && mapCtrl2.currentPath.length > 0) {
          const nextIdx = mapCtrl2.pathIndex;
          // Keep only the next waypoint so player finishes stepping onto it, then stops
          if (nextIdx < mapCtrl2.currentPath.length) {
            session.mapControl.setState({
              currentPath: mapCtrl2.currentPath.slice(0, nextIdx + 1),
            });
          } else {
            session.mapControl.setState({ isMoving: false, currentPath: [], pathIndex: 0 });
          }
        }
        const attackEvent = isRangedAttackType(event.attackType)
          ? {
              ...event,
              targetMonsterIds: event.targetMonsterIds.filter(targetId => {
                const target = monsterStore.monsters.find(monster => monster.id === targetId);
                return target && hasProjectilePath(playerPos, target.position, currentMap);
              }),
            }
          : event;
        if (isRangedAttackType(event.attackType) && event.targetMonsterIds.length > 0 && attackEvent.targetMonsterIds.length === 0) break;

        // 轉向被打的那隻：攻擊方向與角色朝向必須一致。多目標時以第一個為準。
        const facingTarget = monsterStore.monsters.find(
          m => m.id === attackEvent.targetMonsterIds[0],
        );
        /**
         * 武器一律用 `getEquippedWeapon()` 取（`99-ai-constraints.md` § 99.1 第 5 條）——
         * `equippedGear` 是插入順序不是部位順序，用索引會靜默取到防具。
         */
        const held = getEquippedWeapon(allGear);

        // 轉向要在演出之前、而且不管這一招碰不碰武器都要轉（§ 48.6.1）
        if (facingTarget) visuals.push({ kind: 'face', memberId, target: facingTarget.position });

        const result = processPlayerAttack(attackEvent, {
          session,
          character: gameState.character,
          equippedGear: allGear,
          activeEffects: gameState.activeEffects,
          skills: gameState.skills,
          monsterInstances,
          mapMonsters: monsterStore.monsters,
        });
        logs.push(...result.logs);

        /* 座標要在**移除死怪之前**抄下來，這是致命一擊唯一還查得到位置的時機 */
        const targetPositions: Record<string, Position> = {};
        for (const dmg of result.damages) {
          const target = monsterStore.monsters.find(m => m.id === dmg.targetId);
          if (target) targetPositions[dmg.targetId] = { ...target.position };
        }

        visuals.push({
          kind: 'player_attack',
          memberId,
          result,
          ranged: isRangedAttackType(event.attackType),
          weapon: held,
          playerPos,
          targetPositions,
          attackIntervalMs: getPlayerAttackInterval(allGear, gameState.activeEffects),
        });

        for (const dmg of result.damages) {
          recordTrainingHits(monsterInstances.get(dmg.targetId), dmg);
          if (!dmg.isMiss) recordMonsterDamage(targetingOf(instance, dmg.targetId), memberId, dmg.damage, now);
          if (dmg.killed) {
            const inst = monsterInstances.get(dmg.targetId);
            const monsterIdx = monsterStore.monsters.findIndex(m => m.id === dmg.targetId);
            if (inst) handleMonsterDeath(inst, monsterIdx, dmg.targetId, session);
            removeMonster(session, dmg.targetId);
          }
        }
        stopTrainingIfNoDummiesLeft(session);
        break;
      }

      case 'monster_attack':
        // 由實例層的 `applyMonsterAttacks` 結算；`skipMonsters` 下不會出現
        break;

      case 'move_to': {
        // FSM wants player to chase a target
        if (mapStore.paused) break;
        const mapCtrl = session.mapControl.getState();
        if (mapCtrl.autoMove) {
          const map = mapCtrl.currentMap;
          if (map) {
            /*
             * 距離一律對**雙方的真實座標**算，不可用四捨五入後的格子 ——
             * 兩者最多差 0.7 格，用格子算會挑到「尋路說在射程內、FSM 說在射程外」的位置，
             * 角色站在那裡不動也不出手。
             *
             * 佔位表讓目的地與路徑都繞開別的怪，否則角色會走進死路、停在擋路的怪前面不動。
             */
            const playerPos = mapCtrl.playerPosition;
            const occupied = session.loop.occupation.getOccupiedSet(playerOccupantId(memberId));

            // 後退：`event.target` 就是落腳格，走不到就留在原地，不清目標
            if (event.exact) {
              const dest = findNearestWalkable(map, event.target, playerPos);
              if (dest) session.mapControl.getState().moveToTarget(dest, occupied);
              break;
            }

            const currentDest = mapCtrl.currentPath[mapCtrl.currentPath.length - 1];
            const keepCurrent = mapCtrl.isMoving && currentDest
              && isAttackPosition(map, currentDest, event.target, event.range, occupied);
            if (keepCurrent) break;

            const attackPosition = findAttackPosition(map, event.target, playerPos, event.range, occupied)
              ?? findAttackPosition(map, event.target, playerPos, event.range);
            if (attackPosition) {
              session.mapControl.getState().moveToTarget(attackPosition, occupied);
            } else {
              engine.playerCtx.targetMonsterId = null;
              engine.playerCtx.state = 'idle';
            }
          }
        }
        break;
      }
    }
  }

  appendLogs(session, logs);

  // === DoT tick (every 1000ms) ===
  if (consumeDotTick(session)) {
    processDotTick(session, visuals);
    processPlayerDotTick(session, visuals);
    processPlayerHotTick(session, visuals);
  }

  return visuals;
}

/** 從實例移除一隻怪（死亡） */
function removeMonster(session: Session, monsterId: string): void {
  session.combat.monsterInstances.delete(monsterId);
  const currentMonsters = session.mapMonster.getState().monsters;
  session.mapMonster.setState({ monsters: currentMonsters.filter(m => m.id !== monsterId) });
}

/**
 * 角色持續回復結算（聖域每秒回血 20）
 * 與 DoT 共用 1000ms tick；回復不超過有效最大 HP，死亡狀態不回復。
 */
function processPlayerHotTick(session: Session, visuals: CombatVisual[]) {
  const gs = session.game.getState();
  const now = gameNow();
  const hotEffects = gs.activeEffects.filter(
    e => e.type === 'buff' && e.target === 'player' && e.hot && now < e.startTime + e.duration
  );
  if (hotEffects.length === 0) return;

  const char = gs.character;
  if (!char || char.hp <= 0) return;

  const effMaxHp = getEffectiveMaxHp(char, gs.equippedGear);
  if (char.hp >= effMaxHp) return;

  const total = hotEffects.reduce((sum, e) => sum + (e.hot?.amount ?? 0), 0);
  const healed = Math.min(effMaxHp - char.hp, total);
  if (healed <= 0) return;

  session.game.setState({ character: { ...char, hp: char.hp + healed } });
  appendLogs(session, [{ text: `${hotEffects.map(e => e.name).join('、')} 回復 ${healed} HP`, type: 'system' }]);
  visuals.push({ kind: 'heal', memberId: memberIdOf(session), amount: healed });
}

/**
 * 角色 DoT 結算（中毒 / 流血）
 * § 24.4.4：無視防禦、不觸發爆擊、可致死
 */
function processPlayerDotTick(session: Session, visuals: CombatVisual[]) {
  const gs = session.game.getState();
  const now = gameNow();
  const dotEffects = gs.activeEffects.filter(
    e => e.type === 'debuff' && e.target === 'player' && e.dot && now < e.startTime + e.duration
  );
  if (dotEffects.length === 0) return;

  const char = gs.character;
  if (!char || char.hp <= 0) return;
  // 無敵期間免疫所有傷害，含 DoT
  if (isPlayerInvincible(gs.activeEffects, now)) return;

  const logs: CombatLog[] = [];
  let hp = char.hp;
  let effects = gs.activeEffects;
  const memberId = memberIdOf(session);
  for (const effect of dotEffects) {
    if (!effect.dot) continue;
    // 護盾同樣吸收 DoT 傷害（§ 24.4.9）
    const shield = absorbWithShield(effect.dot.damage, effects, now);
    effects = shield.effects;
    if (shield.absorbed > 0) {
      logs.push({ text: `聖光護盾吸收 ${shield.absorbed} 傷害${shield.broken ? '後破裂' : ''}`, type: 'system' });
    }
    const dmg = shield.damage;
    if (dmg <= 0) continue;
    hp = Math.max(0, hp - dmg);
    logs.push({ text: `${effect.name} 造成 ${dmg} 傷害`, type: 'debuff-self' });
    visuals.push({ kind: 'dot', memberId, target: 'player', damage: dmg, tags: effect.tags ?? [], position: { ...session.mapControl.getState().playerPosition } });
    if (hp <= 0) break;
  }

  session.game.setState({
    character: { ...session.game.getState().character!, hp },
    activeEffects: effects,
  });
  appendLogs(session, logs);

  if (hp <= 0) handlePlayerDeath(session);
}

function processDotTick(session: Session, visuals: CombatVisual[]) {
  const gs = session.game.getState();
  const instance = ensureInstance(session);
  const monsterInstances = session.combat.monsterInstances;
  const now = gameNow();
  const dotEffects = gs.activeEffects.filter(
    e => e.type === 'debuff' && e.target === 'monster' && e.dot && now < e.startTime + e.duration
  );

  if (dotEffects.length === 0) return;

  const logs: CombatLog[] = [];
  const memberId = memberIdOf(session);

  for (const effect of dotEffects) {
    if (!effect.dot) continue;
    // Use targetMonsterId for reliable lookup
    const monsterId = effect.targetMonsterId;
    if (!monsterId) continue;

    const inst = monsterInstances.get(monsterId);
    if (!inst || inst.currentHp <= 0) continue;

    inst.currentHp = Math.max(0, inst.currentHp - effect.dot.damage);
    const dotTarget = session.mapMonster.getState().monsters.find(m => m.id === monsterId);
    recordMonsterDamage(targetingOf(instance, monsterId), memberId, effect.dot.damage, now);
    // DoT 不判定命中，所以只累加傷害、不動命中率的分子分母（§ 50.5.2）
    if (inst.isTrainingDummy) {
      useTrainingGroundStore.getState().recordDamage(effect.dot.damage, 0, 0);
    }
    logs.push({ text: `${effect.name} 對 ${inst.name} 造成 ${effect.dot.damage} 傷害`, type: 'debuff-enemy' });
    visuals.push({
      kind: 'dot', memberId, target: 'monster', monsterId, damage: effect.dot.damage, tags: effect.tags ?? [],
      position: dotTarget ? { ...dotTarget.position } : session.mapControl.getState().playerPosition,
    });

    if (inst.currentHp <= 0) {
      const monsterIdx = session.mapMonster.getState().monsters.findIndex(m => m.id === monsterId);
      handleMonsterDeath(inst, monsterIdx, monsterId, session);
      removeMonster(session, monsterId);
      stopTrainingIfNoDummiesLeft(session);
    }
  }

  appendLogs(session, logs);
}

/**
 * 把一次攻擊結果記進試驗場的量測（`50-training-ground.md` § 50.5.2）。
 *
 * 只記木樁 —— 場地雖然不生怪，但這支被主戰鬥迴圈共用，
 * 不看旗標的話任何地圖的傷害都會被算進去。
 *
 * 命中率的分母走 `hits[]` 而不是「這次出手」：雙刀與鋼爪一次攻擊打兩下，
 * 每下獨立判定命中（`21-combat-formula.md` § 21.2），多段技能同理。
 */
function recordTrainingHits(inst: MonsterInstance | undefined, dmg: DamageResult): void {
  if (!inst?.isTrainingDummy) return;
  const hits = dmg.hits.length > 0 ? dmg.hits : [{ damage: dmg.damage, isCrit: dmg.isCrit, isMiss: dmg.isMiss }];
  let damage = 0;
  let landed = 0;
  for (const h of hits) {
    if (h.isMiss) continue;
    damage += h.damage;
    landed++;
  }
  useTrainingGroundStore.getState().recordDamage(damage, hits.length, landed);
}

/** 木樁全滅＝量測結束（§ 50.5.1）。沒在量測時 `stopIfRunning` 自己會忽略 */
function stopTrainingIfNoDummiesLeft(session: Session): void {
  const store = useTrainingGroundStore.getState();
  if (!store.measurement.running) return;
  if (session.mapMonster.getState().monsters.some(m => m.dummy)) return;
  store.stop();
}

/**
 * 掉落接收者（§ 97.7.1）：隊長模式「全隊」＝全隊在線成員不限地圖，「僅參與者」＝在場參與者；
 * 隨機分配給一人。沒有隊伍就是擊殺者本人。
 */
function pickDropReceiver(instance: MapInstance, participants: Session[], killer: Session): Session {
  const hook = instance.party;
  if (!hook) return killer;
  const pool = hook.dropMode() === 'all' ? hook.onlineMembers() : participants;
  if (pool.length === 0) return killer;
  return pick(pool);
}

/**
 * 怪物死亡的隊伍結算（§ 97.7.1）：參與者＝死亡時在線且在同一實例、活著的成員，不看傷害貢獻。
 * 經驗只在參與者之間平分；掉落隨機給一人。試驗場木樁零產出（`50-training-ground.md` § 50.4）。
 */
export function handleMonsterDeath(monster: MonsterInstance, monsterIdx: number, monsterId: string | undefined, session: Session = defaultSession) {
  const instance = ensureInstance(session);
  const killer = session.game.getState().character;
  if (!killer) return;

  const alive = presentMembers(instance).filter(m => (m.game.getState().character?.hp ?? 0) > 0);
  const participants = alive.length > 0 ? alive : [session];
  const kills = monster.isTrainingDummy ? instance.kills : ++instance.kills;
  const receiver = pickDropReceiver(instance, participants, session);
  const killArea = { regionId: killer.currentRegion, floor: killer.currentFloor, areaId: killer.currentArea };

  for (const p of participants) {
    settleMemberKill(p, monster, monsterIdx, monsterId, {
      expDivisor: participants.length,
      withDrops: p === receiver,
      instanceKills: kills,
      killArea,
    });
  }
}

function settleMemberKill(
  session: Session,
  monster: MonsterInstance,
  monsterIdx: number,
  monsterId: string | undefined,
  options: MonsterDeathOptions,
) {
  const get = session.game.getState;
  const set = (s: any) => session.game.setState(s);
  const gs = get();
  if (!gs.character) return;

  const allGear = getEffectiveGearArray(gs.character, gs.activeEffects, gs.equippedGear) as any[];
  const monsters = [monster];

  const result = processMonsterDeath(get, set, monsters, 0, { ...gs.character }, [...gs.combatLogs], allGear, session, options);

  set({
    character: result.char,
    combatLogs: result.logs.slice(-MAX_LOGS),
  });

  // Clear debuffs on this monster (use ID if available, fallback to index)
  const effects = get().activeEffects;
  const cleaned = effects.filter(e => {
    if (e.target !== 'monster') return true;
    if (monsterId && e.targetMonsterId) return e.targetMonsterId !== monsterId;
    return e.targetIdx !== monsterIdx;
  });
  if (cleaned.length !== effects.length) {
    set({ activeEffects: cleaned });
  }

  // 木樁沒有任何產出可存（§ 50.4.1）。debuff 清理仍要跑完，所以擋在這裡而不是提早 return
  if (monster.isTrainingDummy) return;

  // Auto-save after kill：掉落與任務進度在 processMonsterDeath 的 async 佇列裡才寫入 store，
  // 必須等佇列結算完再存。
  void waitForPendingDrops().then(() => {
    session.game.getState().saveState();
  });
}

export function handlePlayerDeath(session: Session = defaultSession) {
  const gs = session.game.getState();
  const char = gs.character;
  if (!char) return;

  const nearestTown = getNearestTown(char.currentRegion);

  // § 13.8：HP 恢復至「有效最大 HP」的 50%（含裝備 bonusHp 與最大HP%詞綴）
  const effMaxHp = getEffectiveMaxHp(char, gs.equippedGear);

  const updatedChar = {
    ...char,
    hp: Math.floor(effMaxHp * 0.5),
    currentArea: nearestTown.id,
    currentRegion: nearestTown.id,
    currentFloor: null,
    currentZone: nearestTown.zoneId,
    areaEnteredAt: gameNow(),
    mapPositionX: undefined,
    mapPositionY: undefined,
  };

  const stats = { ...gs.statistics, deathCount: gs.statistics.deathCount + 1 };

  session.game.setState({
    character: updatedChar,
    combatLogs: [
      ...gs.combatLogs.slice(-(MAX_LOGS - 1)),
      { text: `你倒下了...傳送至${nearestTown.name}`, type: 'system' },
    ],
    statistics: stats,
  });

  // 死亡即離開實例（§ 97.7.1）；一人實例隨之清空，隊伍實例續存
  ensureInstance(session);
  resetPlayerCombat(session);
  leaveInstance(session);
  session.game.getState().saveState();
}
