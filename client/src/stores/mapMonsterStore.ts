import { create } from 'zustand';
import type { Position, MapData } from '../models/mapControl';
import { findPath, getRandomWalkablePosition, canMoveBetween } from '../systems/pathfinding';
import type { TrainingDummySpec } from '../models/trainingGround';

export interface MapMonster {
  id: string;
  position: Position;
  targetPosition: Position;
  speed: number;
  path: Position[];
  pathIndex: number;
  pathRecalcTimer: number;
  moveTimer: number;
  lastPathPlayerPos: Position;
  isBoss: boolean;
  /**
   * 攻擊射程（格）。遠程與魔法怪不必貼身（`41-arpg-combat.md` § 5.2）。
   * 生成當下還沒挑模板，所以由 `PixiGame` 建實例時回填。
   */
  attackRange?: number;
  /**
   * 試驗場木樁（`50-training-ground.md` § 50.4）。
   *
   * 木樁不從 `monsterTemplates` 抽，素質由玩家在面板上決定；
   * `createMonsterFromTemplate` 看到這欄就照它建實例。
   */
  dummy?: TrainingDummySpec;
}

const SPAWN_INTERVAL_MS = 1000;
const BASE_SPAWN_CHANCE = 0.15;
const BASE_MAX_MONSTERS = 3;
const MIN_SPAWN_DISTANCE = 5;
/** 超過此距離的怪物停止追蹤（原地待機），仍留在地圖上（見 `26-spawn-pressure.md` § 26.8） */
const MAX_TRACK_DISTANCE = 15;
/** 超過此距離的怪物才真正從地圖移除（見 `26-spawn-pressure.md` § 26.8） */
const DESPAWN_DISTANCE = 25;
const TRIGGER_DISTANCE = 1.2;
const MONSTER_SPEED = 1;
const PATH_RECALC_INTERVAL = 5000;
const ASTAR_DISTANCE = 8;
const PLAYER_MOVE_THRESHOLD = 2;
/** Boss 生成門檻：本次進區停留分鐘數（見 `26-spawn-pressure.md` § 26.4） */
export const BOSS_SPAWN_MIN_MINUTES = 5;
/** 滿足門檻後每次生成判定產生 Boss 的機率 */
export const BOSS_SPAWN_CHANCE = 0.1;

function rollSpawnCount(elapsedMinutes: number): number {
  const roll = Math.random();
  if (elapsedMinutes < 5) {
    // 1隻(80%), 2隻(15%), 3隻(5%)
    if (roll < 0.80) return 1;
    if (roll < 0.95) return 2;
    return 3;
  } else if (elapsedMinutes < 20) {
    // 1隻(60%), 2隻(30%), 3隻(10%)
    if (roll < 0.60) return 1;
    if (roll < 0.90) return 2;
    return 3;
  } else {
    // 20分鐘以上 (含30+): 1隻(50%), 2隻(25%), 3隻(25%)
    if (roll < 0.50) return 1;
    if (roll < 0.75) return 2;
    return 3;
  }
}

let monsterIdCounter = 0;
function nextMonsterId(): string {
  return `m_${++monsterIdCounter}`;
}

function distance(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export interface MapMonsterState {
  monsters: MapMonster[];
  maxMonsters: number;
  spawnTimer: number;
  paused: boolean;
  combatMonsterIds: string[];
  hasBossInPool: boolean;

  spawnTick: (deltaMs: number, map: MapData, playerPos: Position, pressure: number, elapsedMinutes?: number) => void;
  moveMonsters: (deltaMs: number, map: MapData, playerPos: Position) => void;
  checkCollisions: (playerPos: Position) => MapMonster[];
  setCombatMonsters: (ids: string[]) => void;
  clearCombatMonsters: () => void;
  clearAll: () => void;
  /** 試驗場：以指定參數在指定座標放一批木樁，並清掉場上原有的木樁（§ 50.4） */
  summonDummies: (spec: TrainingDummySpec, positions: Position[]) => void;
  setMaxMonsters: (max: number) => void;
  /** 建實例時回填射程，移動邏輯才停得在射程上 */
  setMonsterAttackRange: (id: string, attackRange: number) => void;
  setPaused: (paused: boolean) => void;
  setHasBossInPool: (has: boolean) => void;
}

export const useMapMonsterStore = create<MapMonsterState>((set, get) => ({
  monsters: [],
  maxMonsters: BASE_MAX_MONSTERS,
  spawnTimer: 0,
  paused: false,
  combatMonsterIds: [],
  hasBossInPool: false,

  spawnTick: (deltaMs, map, playerPos, pressure, elapsedMinutes = 0) => {
    const state = get();
    // 城鎮是安全區，永遠不生怪（§ 13.1、§ 13.2.1）。擋在最前面而不是靠呼叫端記得不要呼叫。
    if (map.theme === 'town') return;
    // 試驗場只有玩家自己召喚的木樁（`50-training-ground.md` § 50.3）。
    // 這是與城鎮不同的一條路：城鎮還要擋自動移動，試驗場必須允許。
    if (map.autoSpawn === false) return;
    if (state.paused) return;
    if (state.monsters.length >= state.maxMonsters) return;

    // 清場補位（`26-spawn-pressure.md` § 26.2）：場上全空時立即判定且必定成功。
    // 沒有它，擊殺速度快於判定間隔的角色會停在空地上等下一個週期再擲 15%，
    // DPS 完全兌現不到擊殺速率。
    const isRefill = state.monsters.length === 0;

    if (!isRefill) {
      const newTimer = state.spawnTimer + deltaMs;
      const frequencyMultiplier = 1 + pressure * 0.2;
      const adjustedInterval = SPAWN_INTERVAL_MS / frequencyMultiplier;
      if (newTimer < adjustedInterval) {
        set({ spawnTimer: newTimer });
        return;
      }
    }

    set({ spawnTimer: 0 });

    if (!isRefill && Math.random() > BASE_SPAWN_CHANCE) return;

    // Determine spawn count based on elapsed time (partySize=1 baseline)
    const spawnCount = rollSpawnCount(elapsedMinutes);

    for (let i = 0; i < spawnCount; i++) {
      const currentMonsters = get().monsters;
      if (currentMonsters.length >= get().maxMonsters) break;

      // Determine if this spawn is a boss
      const bossAlreadyOnMap = currentMonsters.some(m => m.isBoss);
      let isBoss = false;
      if (state.hasBossInPool && !bossAlreadyOnMap && elapsedMinutes >= BOSS_SPAWN_MIN_MINUTES) {
        isBoss = Math.random() < BOSS_SPAWN_CHANCE;
      }

      // Find a spawn position at least MIN_SPAWN_DISTANCE from player
      let attempts = 0;
      while (attempts < 20) {
        attempts++;
        const pos = getRandomWalkablePosition(map, playerPos);
        if (!pos) continue;
        if (distance(pos, playerPos) >= MIN_SPAWN_DISTANCE) {
          const monster: MapMonster = {
            id: nextMonsterId(),
            position: { ...pos },
            targetPosition: { ...playerPos },
            speed: MONSTER_SPEED,
            path: [],
            pathIndex: 0,
            pathRecalcTimer: 0,
            moveTimer: 0,
            lastPathPlayerPos: { ...playerPos },
            isBoss,
          };
          set({ monsters: [...get().monsters, monster] });
          break;
        }
      }
    }
  },

  moveMonsters: (deltaMs, map, playerPos) => {
    const state = get();
    if (state.monsters.length === 0) return;

    const updated: MapMonster[] = [];
    const playerSnapped = { x: Math.round(playerPos.x), y: Math.round(playerPos.y) };

    // Build occupation map: tiles occupied by monsters or player
    const occupied = new Set<string>();
    occupied.add(`${playerSnapped.x},${playerSnapped.y}`);
    for (const m of state.monsters) {
      occupied.add(`${Math.round(m.position.x)},${Math.round(m.position.y)}`);
    }

    for (const monster of state.monsters) {
      if (state.combatMonsterIds.includes(monster.id)) {
        updated.push(monster);
        continue;
      }

      /*
       * 木樁不移動、也不脫離（§ 50.4.1）。這一段必須擋在脫離判定之前 ——
       * 玩家跑到場地另一頭時，木樁不可以就這樣消失，量測會直接斷掉。
       */
      if (monster.dummy) {
        occupied.add(`${Math.round(monster.position.x)},${Math.round(monster.position.y)}`);
        updated.push(monster);
        continue;
      }

      const distToPlayerNow = distance(monster.position, playerPos);

      // 超過脫離距離：從地圖移除
      if (distToPlayerNow > DESPAWN_DISTANCE) {
        continue;
      }

      // 超過追蹤距離：原地待機，保留在地圖上（仍佔格，避免其他怪物穿過）
      if (distToPlayerNow > MAX_TRACK_DISTANCE) {
        occupied.add(`${Math.round(monster.position.x)},${Math.round(monster.position.y)}`);
        updated.push({ ...monster, path: [], pathIndex: 0, pathRecalcTimer: 0 });
        continue;
      }

      // Stop moving if already within melee attack range of player
      if (distToPlayerNow <= TRIGGER_DISTANCE) {
        occupied.add(`${Math.round(monster.position.x)},${Math.round(monster.position.y)}`);
        updated.push(monster);
        continue;
      }

      // Remove self from occupied for pathfinding purposes
      const selfTile = `${Math.round(monster.position.x)},${Math.round(monster.position.y)}`;
      occupied.delete(selfTile);

      let { path, pathIndex, pathRecalcTimer, lastPathPlayerPos } = monster;
      const { moveTimer } = monster;
      pathRecalcTimer += deltaMs;

      if (distToPlayerNow <= ASTAR_DISTANCE) {
        // Near player: use A* pathfinding
        const playerMoved = distance(playerPos, lastPathPlayerPos) >= PLAYER_MOVE_THRESHOLD;
        const timerExpired = pathRecalcTimer >= PATH_RECALC_INTERVAL;
        const needsRecalc = playerMoved || timerExpired || path.length === 0 || pathIndex >= path.length;

        if (needsRecalc) {
          const monsterSnapped = { x: Math.round(monster.position.x), y: Math.round(monster.position.y) };
          const newPath = findPath(map, monsterSnapped, playerSnapped, occupied);
          if (newPath && newPath.length > 0) {
            path = newPath;
            pathIndex = 0;
          }
          pathRecalcTimer = 0;
          lastPathPlayerPos = { ...playerPos };
        }

        // Move along A* path
        if (path.length === 0 || pathIndex >= path.length) {
          occupied.add(selfTile);
          updated.push({ ...monster, path, pathIndex, pathRecalcTimer, lastPathPlayerPos, moveTimer });
          continue;
        }

        const moveDistance = (monster.speed * deltaMs) / 1000;
        let remaining = moveDistance;
        let pos = { ...monster.position };
        let idx = pathIndex;

        while (remaining > 0 && idx < path.length) {
          const next = path[idx];
          // Check if next tile is occupied
          const nextKey = `${Math.round(next.x)},${Math.round(next.y)}`;
          if (occupied.has(nextKey)) {
            break; // Stop, tile is taken
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

        // Re-add to occupied with new position
        occupied.add(`${Math.round(pos.x)},${Math.round(pos.y)}`);
        updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      } else {
        // Far from player: greedy one-step with smooth interpolation (no A*)
        // Build a one-node path toward player if we don't have one
        if (path.length === 0 || pathIndex >= path.length) {
          const mx = Math.round(monster.position.x);
          const my = Math.round(monster.position.y);
          let bestX = mx;
          let bestY = my;
          let bestDist = distance({ x: mx, y: my }, playerPos);

          for (const dir of [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
            { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
          ]) {
            const nx = mx + dir.x;
            const ny = my + dir.y;
            if (!canMoveBetween(map, { x: mx, y: my }, { x: nx, y: ny })) continue;
            if (occupied.has(`${nx},${ny}`)) continue;
            const d = distance({ x: nx, y: ny }, playerPos);
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
            occupied.add(selfTile);
            updated.push({ ...monster, path: [], pathIndex: 0, pathRecalcTimer, lastPathPlayerPos, moveTimer });
            continue;
          }
        }

        // Smooth interpolation to next grid center
        const moveDistance = (monster.speed * deltaMs) / 1000;
        let remaining = moveDistance;
        let pos = { ...monster.position };
        let idx = pathIndex;

        while (remaining > 0 && idx < path.length) {
          const next = path[idx];
          const nextKey = `${Math.round(next.x)},${Math.round(next.y)}`;
          if (occupied.has(nextKey)) {
            break;
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

        occupied.add(`${Math.round(pos.x)},${Math.round(pos.y)}`);
        updated.push({ ...monster, position: pos, path, pathIndex: idx, pathRecalcTimer, lastPathPlayerPos, moveTimer });
      }
    }

    set({ monsters: updated });
  },

  checkCollisions: (playerPos) => {
    const state = get();
    return state.monsters.filter(m =>
      !state.combatMonsterIds.includes(m.id) &&
      distance(m.position, playerPos) <= TRIGGER_DISTANCE
    );
  },

  setCombatMonsters: (ids) => {
    set({ combatMonsterIds: ids });
  },

  clearCombatMonsters: () => {
    const { combatMonsterIds } = get();
    set(state => ({
      monsters: state.monsters.filter(m => !combatMonsterIds.includes(m.id)),
      combatMonsterIds: [],
    }));
  },

  clearAll: () => {
    set({ monsters: [], spawnTimer: 0 });
  },

  summonDummies: (spec, positions) => {
    const dummies: MapMonster[] = positions.map(position => ({
      id: nextMonsterId(),
      position: { ...position },
      targetPosition: { ...position },
      speed: 0,
      path: [],
      pathIndex: 0,
      pathRecalcTimer: 0,
      moveTimer: 0,
      lastPathPlayerPos: { ...position },
      isBoss: false,
      dummy: { ...spec },
    }));
    set(state => ({
      // 舊木樁一律清掉：留著會讓下一次量測混到上一批的參數
      monsters: [...state.monsters.filter(m => !m.dummy), ...dummies],
      combatMonsterIds: [],
    }));
  },

  setMonsterAttackRange: (id, attackRange) => {
    set(state => ({
      monsters: state.monsters.map(m => (m.id === id ? { ...m, attackRange } : m)),
    }));
  },

  setMaxMonsters: (max) => {
    set({ maxMonsters: max });
  },

  setPaused: (paused) => {
    set({ paused });
  },

  setHasBossInPool: (has) => {
    set({ hasBossInPool: has });
  },
}));
