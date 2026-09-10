/**
 * 遊戲迴圈的移動與生成層。兩層結構（`97-selfhosted-server.md` § 97.7.1）：
 *
 * - 每玩家：`tickPlayerPre`（回復、回鍋、HP/MP 門檻）與 `tickPlayerPost`（玩家移動、效果到期）
 * - 每實例：`tickInstanceWorld`（佔位表、生成、怪物移動）
 *
 * `gameLoopTick` 是本機（一人實例）的組合入口；server 由 `systems/worldTick.ts` 逐層呼叫。
 */
import type { Position, MapData } from '../models/mapControl';
import type { MapMonster } from '../stores/mapMonsterStore';
import { MAX_TRACK_DISTANCE, DESPAWN_DISTANCE } from '../stores/mapMonsterStore';
import type { MapMonsterState } from '../stores/mapMonsterStore';
import { getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { defaultSession, type Session } from '../stores/session';
import { calculatePressure, partyMaxMonsters } from './pressure';
import { drainRestedExp } from './restedExp';
import { findPath, findAttackPosition, canMoveBetween } from './pathfinding';
import { hasLineOfSight, isWithinAttackRange } from './lineOfSight';
import { gameNow, advanceMs, TICK_MS } from '../core/clock';
import { playerOccupantId } from '../models/unit';
import type { OccupationManager } from './occupationManager';
import {
  ensureInstance, instanceElapsedMinutes, memberIdOf, monsterTargetPosition, presentMembers, type MapInstance,
} from './mapInstance';

const ATTACK_RANGE_MELEE = 1.5;
const DOT_TICK_INTERVAL = 1000;
/** 回鍋加倍存量的落帳週期 */
const RESTED_TICK_MS = 10_000;

/** 本機入口：推進時鐘後跑完一人實例的整個移動層 */
export function gameLoopTick(deltaMs: number, session: Session = defaultSession) {
  advanceMs(deltaMs);
  const instance = ensureInstance(session);
  snapshotPrevPlayerPosition(session);
  snapshotPrevMonsterPositions(instance);
  if (!session.game.getState().character) return;
  tickPlayerPre(deltaMs, session);
  tickInstanceWorld(deltaMs, instance);
  tickPlayerPost(deltaMs, session);
}

/** 回復與常駐天賦（與地圖無關）、回鍋加倍、HP/MP 門檻的恢復等待 */
export function tickPlayerPre(deltaMs: number, session: Session): void {
  const loop = session.loop;
  if (!session.game.getState().character) return;

  // === 回復與常駐天賦：角色在就跑（原 setInterval 併入 tick）===
  tickCharacterTimers(deltaMs, session);

  const mapStore = session.mapControl.getState();
  const monsterStore = session.mapMonster.getState();
  const gameState = session.game.getState();
  const map = mapStore.currentMap;
  if (!map || !gameState.character) return;

  const playerPos = mapStore.playerPosition;

  // === 回鍋加倍存量：以實時扣減，並持續更新離線基準（`04-character.md` § 4.11）===
  // 每幀寫一次會讓整棵訂閱 character 的 UI 每幀重繪，所以累積到 RESTED_TICK_MS 才落一次。
  loop.restedTickTimer += deltaMs;
  if (loop.restedTickTimer >= RESTED_TICK_MS) {
    const drained = drainRestedExp(gameState.character, loop.restedTickTimer, Date.now());
    loop.restedTickTimer = 0;
    if (drained !== gameState.character) session.game.setState({ character: drained });
  }

  // === HP/MP threshold check ===
  const ch = gameState.character;
  const effMaxHp = getEffectiveMaxHp(ch, gameState.equippedGear);
  const effMaxMp = getEffectiveMaxMp(ch, gameState.equippedGear);
  const hpPct = (ch.hp / effMaxHp) * 100;
  const mpPct = effMaxMp > 0 ? (ch.mp / effMaxMp) * 100 : 100;
  const belowThreshold = hpPct <= gameState.afterCombatHpThreshold || mpPct <= gameState.afterCombatMpThreshold;
  const aboveResume = hpPct >= gameState.afterCombatHpResumeThreshold && mpPct >= gameState.afterCombatMpResumeThreshold;

  // Only trigger pause in idle state (no nearby monsters in attack range)
  const hasNearbyMonster = monsterStore.monsters.some(
    m => isWithinAttackRange(playerPos, m.position, ATTACK_RANGE_MELEE),
  );
  const isIdle = !hasNearbyMonster;
  const paused = mapStore.paused;

  if (belowThreshold && !paused && isIdle) {
    session.mapControl.getState().setPaused(true);
    session.mapControl.getState().setAutoMove(false);
    const existing = session.game.getState().combatLogs;
    session.game.setState({
      combatLogs: [...existing.slice(-199), { text: 'HP/MP 低於門檻，等待恢復中...', type: 'system' }],
    });
    loop.pauseLogShown = true;
  } else if (belowThreshold && paused && !loop.pauseLogShown) {
    // Already paused on load — show log once
    const existing = session.game.getState().combatLogs;
    session.game.setState({
      combatLogs: [...existing.slice(-199), { text: 'HP/MP 低於門檻，等待恢復中...', type: 'system' }],
    });
    loop.pauseLogShown = true;
  } else if (aboveResume && paused) {
    session.mapControl.getState().setPaused(false);
    if (gameState.searchMode === 'auto') {
      session.mapControl.getState().setAutoMove(true);
    }
    const existing = session.game.getState().combatLogs;
    session.game.setState({
      combatLogs: [...existing.slice(-199), { text: '恢復完畢，繼續探索', type: 'system' }],
    });
    loop.pauseLogShown = false;
  }

  // Pause interrupted by monster approaching
  const pausedNow = session.mapControl.getState().paused;
  if (pausedNow && hasNearbyMonster && !loop.combatInterruptLogShown) {
    const existing = session.game.getState().combatLogs;
    session.game.setState({
      combatLogs: [...existing.slice(-199), { text: '等待被打斷，進入戰鬥中', type: 'system' }],
    });
    loop.combatInterruptLogShown = true;
  } else if (pausedNow && !hasNearbyMonster) {
    loop.combatInterruptLogShown = false;
  } else if (!pausedNow) {
    loop.combatInterruptLogShown = false;
  }
}

/** 實例層：佔位表重建、生成、怪物移動（每 tick 一次，不論成員數） */
export function tickInstanceWorld(deltaMs: number, instance: MapInstance): void {
  const members = presentMembers(instance);
  if (members.length === 0) return;
  const map = members[0].mapControl.getState().currentMap!;
  const monsterStore = instance.mapMonster.getState();
  const occupation = instance.occupation;

  // === Rebuild occupation map ===
  occupation.clear();
  const anchors: Position[] = [];
  for (const m of members) {
    const pos = m.mapControl.getState().playerPosition;
    anchors.push(pos);
    occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'player', playerOccupantId(memberIdOf(m)));
  }
  for (const m of monsterStore.monsters) {
    occupation.register({ x: Math.round(m.position.x), y: Math.round(m.position.y) }, 'monster', m.id);
  }

  // === Spawn monsters：任一在場成員不在恢復等待中就生 ===
  const anyActive = members.some(m => !m.mapControl.getState().paused);
  if (anyActive) {
    const { pressure } = calculatePressure(instance.kills);
    const maxMonsters = partyMaxMonsters(pressure, members.length);
    // 生成隻數分布與 Boss 門檻仍以停留時間為輸入（`26-spawn-pressure.md` § 26.2、§ 26.4）
    const elapsedMinutes = instanceElapsedMinutes(instance);
    monsterStore.setMaxMonsters(maxMonsters);
    const anchor = members.find(m => !m.mapControl.getState().paused) ?? members[0];
    monsterStore.spawnTick(deltaMs, map, anchor.mapControl.getState().playerPosition, pressure, elapsedMinutes, anchors);
  }

  // === Move monsters (always, not affected by player pause) ===
  moveMonstersSafe(
    deltaMs, map,
    m => monsterTargetPosition(instance, m.id, m.position),
    instance.mapMonster.getState(), occupation,
  );
}

/** 玩家移動、效果到期與 DoT 計時 */
export function tickPlayerPost(deltaMs: number, session: Session): void {
  const gameState = session.game.getState();
  if (!gameState.character || !session.mapControl.getState().currentMap) return;
  movePlayerSafe(deltaMs, session);
  tickDotsAndEffects(deltaMs, session);
}

/** 回復（5000／6000ms）與常駐天賦（300ms）各自累積，滿週期即觸發 */
export const PERSISTENT_TICK_MS = TICK_MS;

function tickCharacterTimers(deltaMs: number, session: Session) {
  const game = session.game.getState();
  if (game.regenActive) game.tickRegen(deltaMs);
  if (game.persistentLoopActive) {
    const loop = session.loop;
    loop.persistentAcc += deltaMs;
    let guard = 0;
    while (loop.persistentAcc >= PERSISTENT_TICK_MS && guard < 5) {
      loop.persistentAcc -= PERSISTENT_TICK_MS;
      guard++;
      session.game.getState().tickPersistent();
    }
    if (guard === 5) loop.persistentAcc = 0;
  }
}

/** 本 tick 開始前把位置存成「上一 tick」，渲染端據此插值 */
export function snapshotPrevPlayerPosition(session: Session): void {
  const mapStore = session.mapControl.getState();
  if (mapStore.prevPlayerPosition !== mapStore.playerPosition) {
    session.mapControl.setState({ prevPlayerPosition: mapStore.playerPosition });
  }
}

export function snapshotPrevMonsterPositions(instance: MapInstance): void {
  const monsters = instance.mapMonster.getState().monsters;
  if (monsters.length > 0) {
    instance.mapMonster.setState({ monsters: monsters.map(m => m.prevPosition === m.position ? m : { ...m, prevPosition: m.position }) });
  }
}

function tickDotsAndEffects(deltaMs: number, session: Session) {
  const now = gameNow();
  const gs = session.game.getState();

  // Clear expired effects
  const activeEffects = gs.activeEffects;
  const stillActive = activeEffects.filter(e => now < e.startTime + e.duration);
  if (stillActive.length !== activeEffects.length) {
    session.game.setState({ activeEffects: stillActive });
  }

  // DoT timer accumulation (actual DoT damage is processed in tickMemberCombat)
  const loop = session.loop;
  loop.dotTickTimer += deltaMs;
  if (loop.dotTickTimer >= DOT_TICK_INTERVAL) {
    loop.dotTickTimer = 0;
    loop.dotTickReady = true;
  }
}

export function consumeDotTick(session: Session = defaultSession): boolean {
  const loop = session.loop;
  if (loop.dotTickReady) {
    loop.dotTickReady = false;
    return true;
  }
  return false;
}

function movePlayerSafe(deltaMs: number, session: Session) {
  const occupation = session.loop.occupation;
  const store = session.mapControl.getState();
  const selfId = playerOccupantId(memberIdOf(session));

  if (!store.isMoving) {
    return;
  }

  const { currentPath, pathIndex, playerPosition, moveSpeed } = store;
  if (currentPath.length === 0 || pathIndex >= currentPath.length) {
    session.mapControl.setState({ isMoving: false });
    return;
  }

  const moveDistance = (moveSpeed * deltaMs) / 1000;
  let remaining = moveDistance;
  let pos = { ...playerPosition };
  let idx = pathIndex;

  while (remaining > 0 && idx < currentPath.length) {
    const next = currentPath[idx];
    const nextTile = { x: Math.round(next.x), y: Math.round(next.y) };

    // Check if next tile is occupied by a monster
    if (occupation.isOccupiedByType(nextTile, 'monster')) {
      /*
       * 停在怪物前一格，位置**維持原地不回拉**。路徑一併清掉 ——
       * 留著會讓下一次追擊沿同一條被擋死的路重算。
       */
      occupation.unregister({ x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) });
      occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'player', selfId);
      session.mapControl.setState({
        isMoving: false,
        currentPath: [],
        pathIndex: 0,
        playerPosition: pos,
      });
      return;
    }

    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= remaining) {
      pos = { x: next.x, y: next.y };
      remaining -= dist;
      idx++;
    } else {
      const ratio = remaining / dist;
      pos = { x: pos.x + dx * ratio, y: pos.y + dy * ratio };
      remaining = 0;
    }
  }

  // Update occupation
  occupation.unregister({ x: Math.round(playerPosition.x), y: Math.round(playerPosition.y) });
  occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'player', selfId);

  session.mapControl.setState({
    playerPosition: pos,
    pathIndex: idx,
  });
}

/**
 * 怪物移動。每隻怪追自己的目標成員（`targetPosOf`）；
 * 回 null 的怪沒有可追的對象，原地待機。
 */
export function moveMonstersSafe(
  deltaMs: number,
  map: MapData,
  targetPosOf: (monster: MapMonster) => Position | null,
  monsterStore: MapMonsterState,
  occupation: OccupationManager,
) {
  if (monsterStore.monsters.length === 0) return;

  const updated: MapMonster[] = [];
  const TRIGGER_DISTANCE = 1.2;
  const ASTAR_DISTANCE = 8;
  const PATH_RECALC_INTERVAL = 5000;
  const PLAYER_MOVE_THRESHOLD = 2;

  for (const monster of monsterStore.monsters) {
    const playerPos = targetPosOf(monster);
    if (!playerPos) {
      updated.push(monster);
      continue;
    }
    const dist = Math.sqrt(
      (monster.position.x - playerPos.x) ** 2 +
      (monster.position.y - playerPos.y) ** 2,
    );

    /*
     * `26-spawn-pressure.md` § 26.8 的三段：追蹤 / 原地待機 / 移除。
     * 戰鬥中的怪物一律保留，不論距離。
     */
    if (!monsterStore.combatMonsterIds.includes(monster.id)) {
      if (dist > DESPAWN_DISTANCE) continue;
      if (dist > MAX_TRACK_DISTANCE) {
        updated.push({ ...monster, path: [], pathIndex: 0, pathRecalcTimer: 0 });
        continue;
      }
    }

    /*
     * 停在**打得到**的位置就好，不必貼身 —— 遠程與魔法怪有自己的射程
     * （`41-arpg-combat.md` § 5.2）。射程還沒回填時退回近戰距離。
     */
    const stopDistance = monster.attackRange ?? TRIGGER_DISTANCE;
    if (isWithinAttackRange(monster.position, playerPos, stopDistance)
      && hasLineOfSight(monster.position, playerPos, map)) {
      updated.push(monster);
      continue;
    }

    let { path, pathIndex, pathRecalcTimer, lastPathPlayerPos } = monster;
    const { moveTimer } = monster;
    pathRecalcTimer += deltaMs;

    // Pathfinding
    if (dist <= ASTAR_DISTANCE) {
      const playerMoved = Math.sqrt(
        (playerPos.x - lastPathPlayerPos.x) ** 2 +
        (playerPos.y - lastPathPlayerPos.y) ** 2,
      ) >= PLAYER_MOVE_THRESHOLD;
      const timerExpired = pathRecalcTimer >= PATH_RECALC_INTERVAL;
      const needsRecalc = playerMoved || timerExpired || path.length === 0 || pathIndex >= path.length;

      if (needsRecalc) {
        const monsterSnapped = { x: Math.round(monster.position.x), y: Math.round(monster.position.y) };
        const occupiedSet = occupation.getOccupiedSet(monster.id);
        /*
         * 落腳格一律對**雙方的真實座標**算，不可餵四捨五入後的格心 ——
         * 停在格與格之間時會挑到「尋路說已就位、攻擊判定說超出射程」的位置，
         * 怪物與角色就此互相僵住。
         */
        const attackPosition = findAttackPosition(
          map,
          playerPos,
          monster.position,
          stopDistance,
          occupiedSet,
        );
        const newPath = attackPosition
          ? findPath(map, monsterSnapped, attackPosition, occupiedSet)
          : null;
        if (newPath && newPath.length > 0) {
          path = newPath;
          pathIndex = 0;
        } else {
          /*
           * 走不到（`attackPosition` 為 null）與**已在該站的格子**（`findPath` 回空）
           * 都要清掉舊路徑 —— 留著會讓怪物沿上一次的目的地繼續走，離玩家愈走愈遠。
           */
          path = [];
          pathIndex = 0;
        }
        pathRecalcTimer = 0;
        lastPathPlayerPos = { ...playerPos };
      }
    } else {
      // Greedy: one step toward player
      if (path.length === 0 || pathIndex >= path.length) {
        const mx = Math.round(monster.position.x);
        const my = Math.round(monster.position.y);
        let bestX = mx;
        let bestY = my;
        let bestDist = Math.sqrt((mx - playerPos.x) ** 2 + (my - playerPos.y) ** 2);

        const dirs = [
          { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
          { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
        ];

        for (const dir of dirs) {
          const nx = mx + dir.x;
          const ny = my + dir.y;
          if (!canMoveBetween(map, { x: mx, y: my }, { x: nx, y: ny })) continue;
          if (!occupation.canMoveTo({ x: nx, y: ny }, monster.id)) continue;
          const d = Math.sqrt((nx - playerPos.x) ** 2 + (ny - playerPos.y) ** 2);
          if (d < bestDist) {
            bestDist = d;
            bestX = nx;
            bestY = ny;
          }
        }

        if (bestX !== mx || bestY !== my) {
          path = [{ x: bestX, y: bestY }];
          pathIndex = 0;
        } else {
          updated.push({ ...monster, path: [], pathIndex: 0, pathRecalcTimer, lastPathPlayerPos, moveTimer });
          continue;
        }
      }
    }

    // Move along path with collision check
    if (path.length === 0 || pathIndex >= path.length) {
      updated.push({ ...monster, path, pathIndex, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      continue;
    }

    const moveDistance = (monster.speed * deltaMs) / 1000;
    let remaining = moveDistance;
    let pos = { ...monster.position };
    let idx = pathIndex;
    let blocked = false;

    while (remaining > 0 && idx < path.length) {
      const next = path[idx];
      const nextTile = { x: Math.round(next.x), y: Math.round(next.y) };

      if (!occupation.canMoveTo(nextTile, monster.id)) {
        blocked = true;
        break;
      }

      const dx = next.x - pos.x;
      const dy = next.y - pos.y;
      const stepDist = Math.sqrt(dx * dx + dy * dy);

      if (stepDist <= remaining) {
        pos = { x: next.x, y: next.y };
        remaining -= stepDist;
        idx++;
      } else {
        const ratio = remaining / stepDist;
        pos = { x: pos.x + dx * ratio, y: pos.y + dy * ratio };
        remaining = 0;
      }
    }

    // 被別的怪擋住：原地停住，丟掉這條路，下一次重算才會繞開
    if (blocked) {
      path = [];
      idx = 0;
    }

    // Update occupation
    occupation.unregister({ x: Math.round(monster.position.x), y: Math.round(monster.position.y) });
    occupation.register({ x: Math.round(pos.x), y: Math.round(pos.y) }, 'monster', monster.id);

    updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
  }

  monsterStore.setMonsters(updated);
}
