/**
 * 離線地圖生成腳本（`38-map-control.md` § 38.11、§ 38.12）
 *
 *   npx vite-node scripts/generateMaps.ts [-- <mapId> ...]
 *
 * 只在開發期手動執行，產物是提交進版控的靜態 JSON。**執行期不做任何隨機地圖生成**。
 * 亂數為 deterministic PRNG（seed 由 map id 決定），同一份程式碼永遠產出同一張地圖。
 *
 * 保留既有 id / name / width / height / theme，只重寫 tiles 與 spawnPoint。
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MapData, Position } from '../src/models/mapControl';
import { TileType } from '../src/models/mapControl';
import { validateMapData } from '../src/models/mapDataControl';
import {
  ACCENT_MAX_FEATURE_SHARE,
  BOSS_OPEN_AREA_SIZE,
  CLUSTER_MAX_SIZE,
  CLUSTER_MIN_SIZE,
  DECOR_FLOOR_MAX_WALKABLE_SHARE,
  DECOR_FLOOR_TILES,
  DOMINANT_MIN_FEATURE_SHARE,
  MAP_DESIGN_PROFILES,
  OPEN_AREA_SIZE,
  THEME_TERRAIN_PALETTES,
  type DensityGrade,
  type LayoutArchetype,
  type MapDesignProfile,
  findFirstViolation,
  formatViolations,
  getTargetWalkableRatio,
} from '../src/models/mapDesignRules';

const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data/maps');

/** 手工設計的地圖（Step 3），腳本不覆寫 */
const HAND_AUTHORED = new Set<string>([]);

const MAX_SEED_ATTEMPTS = 50;
/** 分享率留的安全邊際，避免踩在門檻上被浮點數判掉 */
const DOMINANT_TARGET_SHARE = 0.58;
const ACCENT_TARGET_SHARE = 0.17;
/** spawnPoint 半徑 5 格內的可通行率，比規範門檻 70% 再高一些 */
const SPAWN_NEAR_TARGET_RATIO = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic PRNG（禁止 Math.random）
// ─────────────────────────────────────────────────────────────────────────────

function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  range(minInclusive: number, maxInclusive: number): number {
    return minInclusive + this.int(maxInclusive - minInclusive + 1);
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  shuffled<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 地形預算：把「目標可通行率 + 主導地形比例」換算成各地形的格數
// ─────────────────────────────────────────────────────────────────────────────

interface FeatureBudget {
  /** 障礙地形 → 格數（不可通行，決定可通行率） */
  obstacles: Map<TileType, number>;
  /** 裝飾地面 → 格數（可通行但不可生怪） */
  decor: Map<TileType, number>;
  obstacleTotal: number;
}

function isDecorFloor(tile: TileType): boolean {
  return DECOR_FLOOR_TILES.includes(tile);
}

/**
 * 依 § 38.11.1 的比例規則分配地形格數。
 *
 * 障礙總量由可通行率決定（不可調整），裝飾地面總量是自由變數 —— 掃描它來找出
 * 同時滿足「主導 ≥ 50%」「點綴各 ≤ 20%」「裝飾地面 ≤ 35% 可通行格」的組合。
 */
function planFeatureBudget(
  profile: MapDesignProfile,
  palette: readonly TileType[],
  innerCount: number,
): FeatureBudget | null {
  const targetWalkable = getTargetWalkableRatio(profile);
  const obstacleTotal = Math.round(innerCount * (1 - targetWalkable));
  const walkableCount = innerCount - obstacleTotal;

  const obstacleTypes = palette.filter(tile => !isDecorFloor(tile));
  const decorTypes = palette.filter(isDecorFloor);
  const dominant = profile.dominantTerrain;
  const dominantIsDecor = isDecorFloor(dominant);

  const decorCap = Math.floor(walkableCount * DECOR_FLOOR_MAX_WALKABLE_SHARE);

  for (let decorTotal = 0; decorTotal <= decorCap; decorTotal++) {
    const featureTotal = obstacleTotal + decorTotal;
    if (featureTotal === 0) continue;

    const obstacles = new Map<TileType, number>();
    const decor = new Map<TileType, number>();

    if (dominantIsDecor) {
      // 主導是裝飾地面：全部 decor 給主導，障礙全部當點綴平均分配
      const accentTypes = obstacleTypes;
      if (accentTypes.length === 0) continue;
      if (decorTotal / featureTotal < DOMINANT_TARGET_SHARE) continue;
      if (!distributeEvenly(obstacles, accentTypes, obstacleTotal, featureTotal)) continue;
      decor.set(dominant, decorTotal);
    } else {
      // 主導是障礙：主導拿走大部分障礙額度，其餘障礙與 decor 當點綴
      const dominantCount = Math.min(obstacleTotal, Math.ceil(featureTotal * DOMINANT_TARGET_SHARE));
      if (dominantCount / featureTotal < DOMINANT_MIN_FEATURE_SHARE) continue;
      const accentObstacleTotal = obstacleTotal - dominantCount;
      const accentObstacleTypes = obstacleTypes.filter(tile => tile !== dominant);
      if (accentObstacleTotal > 0 && accentObstacleTypes.length === 0) continue;
      if (!distributeEvenly(obstacles, accentObstacleTypes, accentObstacleTotal, featureTotal)) continue;
      obstacles.set(dominant, (obstacles.get(dominant) ?? 0) + dominantCount);
      if (decorTotal > 0) {
        if (decorTypes.length === 0) continue;
        if (!distributeEvenly(decor, decorTypes, decorTotal, featureTotal)) continue;
      }
    }

    const usedTypes = [...obstacles.keys(), ...decor.keys()].filter(tile => (obstacles.get(tile) ?? decor.get(tile) ?? 0) > 0);
    if (profile.density !== 'sparse' && new Set(usedTypes).size < 2) continue;
    if (usedTypes.length === 0) continue;

    return { obstacles, decor, obstacleTotal };
  }
  return null;
}

/** 把 total 平均分給 types，任一份額超過點綴上限就失敗 */
function distributeEvenly(
  target: Map<TileType, number>,
  types: readonly TileType[],
  total: number,
  featureTotal: number,
): boolean {
  if (total === 0) return true;
  if (types.length === 0) return false;
  const base = Math.floor(total / types.length);
  let remainder = total % types.length;
  for (const tile of types) {
    const count = base + (remainder-- > 0 ? 1 : 0);
    if (count / featureTotal > ACCENT_TARGET_SHARE) return false;
    if (count > 0) target.set(tile, (target.get(tile) ?? 0) + count);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 佈局骨架：各原型的障礙叢形狀與排列
// ─────────────────────────────────────────────────────────────────────────────

interface ClusterShape {
  minSize: number;
  maxSize: number;
  /** 傾向拉長的程度：0 = 團塊，1 = 長條 */
  elongation: number;
}

const ARCHETYPE_CLUSTER_SHAPE: Record<LayoutArchetype, ClusterShape> = {
  // 自然地貌受 § 38.12 的叢大小限制（3~24）約束
  'open': { minSize: CLUSTER_MIN_SIZE, maxSize: 8, elongation: 0.1 },
  'semi-open': { minSize: 6, maxSize: CLUSTER_MAX_SIZE, elongation: 0.35 },
  'cavern': { minSize: 6, maxSize: CLUSTER_MAX_SIZE, elongation: 0.5 },
  // 人造結構豁免叢大小限制
  'pillar-hall': { minSize: 1, maxSize: 4, elongation: 0 },
  'room-corridor': { minSize: 6, maxSize: 40, elongation: 0.8 },
};

/** 密集地圖用較大的叢，避免「滿地小碎塊」的雜訊感 */
function getClusterSizeRange(archetype: LayoutArchetype, density: DensityGrade): [number, number] {
  const shape = ARCHETYPE_CLUSTER_SHAPE[archetype];
  if (density === 'sparse') return [shape.minSize, Math.max(shape.minSize, Math.round(shape.maxSize * 0.5))];
  if (density === 'standard') return [shape.minSize, Math.max(shape.minSize, Math.round(shape.maxSize * 0.75))];
  return [shape.minSize, shape.maxSize];
}

// ─────────────────────────────────────────────────────────────────────────────
// 地圖建構
// ─────────────────────────────────────────────────────────────────────────────

class Canvas {
  readonly tiles: number[][];
  /** 保留區：開闊空地與 spawn 淨空區，永不放障礙 */
  private readonly reserved: boolean[][];

  constructor(readonly width: number, readonly height: number) {
    this.tiles = [];
    this.reserved = [];
    for (let y = 0; y < height; y++) {
      const row: number[] = [];
      const reservedRow: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        row.push(isEdge ? TileType.Boundary : TileType.Ground);
        reservedRow.push(false);
      }
      this.tiles.push(row);
      this.reserved.push(reservedRow);
    }
  }

  isInner(x: number, y: number): boolean {
    return x >= 1 && y >= 1 && x < this.width - 1 && y < this.height - 1;
  }

  isReserved(x: number, y: number): boolean {
    return this.isInner(x, y) && this.reserved[y][x];
  }

  reserveRect(x0: number, y0: number, size: number): void {
    for (let y = y0; y < y0 + size; y++) {
      for (let x = x0; x < x0 + size; x++) {
        if (this.isInner(x, y)) this.reserved[y][x] = true;
      }
    }
  }

  isObstacle(x: number, y: number): boolean {
    if (!this.isInner(x, y)) return true; // 邊界視為障礙
    return this.tiles[y][x] !== TileType.Ground;
  }

  /** 內部的非地面格（不含邊界），用於叢間距判定 */
  hasInnerObstacle(x: number, y: number): boolean {
    return this.isInner(x, y) && this.tiles[y][x] !== TileType.Ground;
  }
}

/**
 * 叢聚放置：以隨機生長產生一叢障礙，並強制與既有叢維持 § 38.12 的 2 格通道。
 * 不使用逐格均勻散佈 —— 那會產生滿地 1 格縫隙的假迷宮，怪物到處卡住。
 */
function growCluster(
  canvas: Canvas,
  random: Random,
  tile: TileType,
  size: number,
  elongation: number,
  enforceMinSize: boolean,
): Position[] | null {
  const start = findClusterSeed(canvas, random);
  if (!start) return null;

  const cells: Position[] = [start];
  const claimed = new Set<string>([`${start.x},${start.y}`]);
  const bias = random.next() < 0.5 ? { x: 1, y: 0 } : { x: 0, y: 1 };

  while (cells.length < size) {
    const from = cells[random.int(cells.length)];
    const direction = random.next() < elongation
      ? bias
      : random.pick([{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]);
    const candidate = {
      x: from.x + direction.x * (random.next() < 0.5 ? 1 : -1),
      y: from.y + direction.y * (random.next() < 0.5 ? 1 : -1),
    };
    const key = `${candidate.x},${candidate.y}`;
    if (claimed.has(key)) continue;
    if (!canPlaceClusterCell(canvas, candidate, claimed)) break;
    claimed.add(key);
    cells.push(candidate);
  }

  if (enforceMinSize && cells.length < CLUSTER_MIN_SIZE) return null;
  for (const cell of cells) canvas.tiles[cell.y][cell.x] = tile;
  return cells;
}

function findClusterSeed(canvas: Canvas, random: Random): Position | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = {
      x: random.range(1, canvas.width - 2),
      y: random.range(1, canvas.height - 2),
    };
    if (canPlaceClusterCell(canvas, candidate, new Set())) return candidate;
  }
  return null;
}

/** 該格可否成為新叢的一部分：不可保留、且與「其他叢」的 Chebyshev 距離 ≥ 3 */
function canPlaceClusterCell(canvas: Canvas, cell: Position, ownCells: Set<string>): boolean {
  if (!canvas.isInner(cell.x, cell.y)) return false;
  if (canvas.isReserved(cell.x, cell.y)) return false;
  if (canvas.hasInnerObstacle(cell.x, cell.y)) return false;

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (ownCells.has(`${x},${y}`)) continue;
      if (canvas.hasInnerObstacle(x, y)) return false;
    }
  }
  return true;
}

/** 保留開闊空地；回傳 spawn 用的空地中心 */
function reserveOpenAreas(canvas: Canvas, random: Random, profile: MapDesignProfile): Position | null {
  const spawnAreaSize = Math.max(BOSS_OPEN_AREA_SIZE, OPEN_AREA_SIZE + 2);
  const extraAreas = profile.density === 'dense' || profile.density === 'very-dense' ? 1 : 0;

  const spawnArea = placeReservedSquare(canvas, random, spawnAreaSize);
  if (!spawnArea) return null;

  for (let i = 0; i < extraAreas; i++) {
    placeReservedSquare(canvas, random, OPEN_AREA_SIZE);
  }

  return {
    x: spawnArea.x + Math.floor(spawnAreaSize / 2),
    y: spawnArea.y + Math.floor(spawnAreaSize / 2),
  };
}

function placeReservedSquare(canvas: Canvas, random: Random, size: number): Position | null {
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = random.range(1, canvas.width - 1 - size);
    const y = random.range(1, canvas.height - 1 - size);
    let overlaps = false;
    for (let dy = -1; dy <= size && !overlaps; dy++) {
      for (let dx = -1; dx <= size; dx++) {
        if (canvas.isReserved(x + dx, y + dy)) { overlaps = true; break; }
      }
    }
    if (overlaps) continue;
    canvas.reserveRect(x, y, size);
    return { x, y };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 修補：把生成後殘留的結構問題補掉
// ─────────────────────────────────────────────────────────────────────────────

/** 1 格寬長廊 → 拆掉造成夾擊的障礙，把通道拓寬到 2 格 */
function widenNarrowCorridors(canvas: Canvas): void {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        if (canvas.isObstacle(x, y)) continue;
        const narrowH = canvas.isObstacle(x - 1, y) && canvas.isObstacle(x + 1, y);
        const narrowV = canvas.isObstacle(x, y - 1) && canvas.isObstacle(x, y + 1);
        if (!narrowH && !narrowV) continue;

        const candidates: Position[] = narrowH
          ? [{ x: x - 1, y }, { x: x + 1, y }]
          : [{ x, y: y - 1 }, { x, y: y + 1 }];
        for (const candidate of candidates) {
          if (canvas.hasInnerObstacle(candidate.x, candidate.y)) {
            canvas.tiles[candidate.y][candidate.x] = TileType.Ground;
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) break;
  }
}

/** 保留不可達的走行格會讓 validateMapData 失敗 —— 直接清掉擋路的障礙 */
function repairConnectivity(canvas: Canvas, spawn: Position): void {
  for (let pass = 0; pass < 8; pass++) {
    const reachable = floodWalkable(canvas, spawn);
    const orphans: Position[] = [];
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        if (canvas.isObstacle(x, y)) continue;
        if (!reachable.has(`${x},${y}`)) orphans.push({ x, y });
      }
    }
    if (orphans.length === 0) return;

    // 清掉孤島與主體之間最短的障礙牆
    for (const orphan of orphans) {
      for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
        const wall = { x: orphan.x + direction.x, y: orphan.y + direction.y };
        const beyond = { x: orphan.x + direction.x * 2, y: orphan.y + direction.y * 2 };
        if (!canvas.hasInnerObstacle(wall.x, wall.y)) continue;
        if (canvas.isObstacle(beyond.x, beyond.y)) continue;
        if (!reachable.has(`${beyond.x},${beyond.y}`)) continue;
        canvas.tiles[wall.y][wall.x] = TileType.Ground;
        break;
      }
    }
  }
}

function floodWalkable(canvas: Canvas, start: Position): Set<string> {
  const visited = new Set<string>();
  if (canvas.isObstacle(start.x, start.y)) return visited;
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const direction of [
      { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
      { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
    ]) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key) || canvas.isObstacle(next.x, next.y)) continue;
      // 防切牆角
      if (direction.x !== 0 && direction.y !== 0) {
        if (canvas.isObstacle(current.x + direction.x, current.y)) continue;
        if (canvas.isObstacle(current.x, current.y + direction.y)) continue;
      }
      visited.add(key);
      queue.push(next);
    }
  }
  return visited;
}

/** spawnPoint 周圍要夠開闊：怪物最小生成距離是 5 格 */
function clearSpawnSurroundings(canvas: Canvas, spawn: Position): void {
  const cells: { position: Position; distance: number }[] = [];
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const position = { x: spawn.x + dx, y: spawn.y + dy };
      if (!canvas.isInner(position.x, position.y)) continue;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) continue;
      if (distance <= 3) canvas.tiles[position.y][position.x] = TileType.Ground;
      cells.push({ position, distance });
    }
  }

  const total = cells.length;
  const blocked = cells.filter(cell => canvas.hasInnerObstacle(cell.position.x, cell.position.y));
  const needClear = Math.ceil(total * (1 - SPAWN_NEAR_TARGET_RATIO));
  if (blocked.length <= needClear) return;

  // 由近而遠清掉多餘的障礙
  blocked.sort((a, b) => a.distance - b.distance);
  for (const cell of blocked.slice(0, blocked.length - needClear)) {
    canvas.tiles[cell.position.y][cell.position.x] = TileType.Ground;
  }
}

/** 修補會改變障礙數量，最後依實際差額補放或移除，把可通行率拉回目標 */
function rebalanceObstacles(
  canvas: Canvas,
  random: Random,
  budget: FeatureBudget,
  profile: MapDesignProfile,
  enforceMinSize: boolean,
): void {
  const dominant = profile.dominantTerrain;
  const fallback = isDecorFloor(dominant)
    ? [...budget.obstacles.keys()][0]
    : dominant;
  if (fallback === undefined) return;

  const [minSize, maxSize] = getClusterSizeRange(profile.archetype, profile.density);
  const elongation = ARCHETYPE_CLUSTER_SHAPE[profile.archetype].elongation;

  for (let attempt = 0; attempt < 60; attempt++) {
    const current = countObstacles(canvas);
    const deficit = budget.obstacleTotal - current;
    if (Math.abs(deficit) <= Math.max(2, Math.round(budget.obstacleTotal * 0.02))) return;

    if (deficit > 0) {
      const size = Math.min(deficit, random.range(minSize, maxSize));
      if (!growCluster(canvas, random, fallback, Math.max(size, minSize), elongation, enforceMinSize)) return;
    } else {
      if (!removeSmallestCluster(canvas)) return;
    }
  }
}

function countObstacles(canvas: Canvas): number {
  let count = 0;
  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      if (canvas.hasInnerObstacle(x, y)) count++;
    }
  }
  return count;
}

function removeSmallestCluster(canvas: Canvas): boolean {
  const seen = new Set<string>();
  let smallest: Position[] | null = null;

  for (let y = 1; y < canvas.height - 1; y++) {
    for (let x = 1; x < canvas.width - 1; x++) {
      const key = `${x},${y}`;
      if (seen.has(key) || !canvas.hasInnerObstacle(x, y)) continue;
      const cluster: Position[] = [];
      const stack: Position[] = [{ x, y }];
      seen.add(key);
      while (stack.length > 0) {
        const current = stack.pop()!;
        cluster.push(current);
        for (const direction of [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
          const next = { x: current.x + direction.x, y: current.y + direction.y };
          const nextKey = `${next.x},${next.y}`;
          if (seen.has(nextKey) || !canvas.hasInnerObstacle(next.x, next.y)) continue;
          seen.add(nextKey);
          stack.push(next);
        }
      }
      if (!smallest || cluster.length < smallest.length) smallest = cluster;
    }
  }

  if (!smallest) return false;
  for (const cell of smallest) canvas.tiles[cell.y][cell.x] = TileType.Ground;
  return true;
}

/** 裝飾地面鋪在剩餘地面上，成片而非零散 */
function paintDecorFloors(canvas: Canvas, random: Random, budget: FeatureBudget): void {
  for (const [tile, target] of budget.decor) {
    let placed = 0;
    for (let attempt = 0; attempt < 4000 && placed < target; attempt++) {
      const seed = {
        x: random.range(1, canvas.width - 2),
        y: random.range(1, canvas.height - 2),
      };
      if (canvas.tiles[seed.y][seed.x] !== TileType.Ground) continue;

      const patchSize = Math.min(target - placed, random.range(3, 12));
      const cells: Position[] = [seed];
      canvas.tiles[seed.y][seed.x] = tile;
      placed++;

      while (cells.length < patchSize && placed < target) {
        const from = cells[random.int(cells.length)];
        const direction = random.pick([{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]);
        const next = { x: from.x + direction.x, y: from.y + direction.y };
        if (!canvas.isInner(next.x, next.y)) break;
        if (canvas.tiles[next.y][next.x] !== TileType.Ground) break;
        canvas.tiles[next.y][next.x] = tile;
        cells.push(next);
        placed++;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 單張地圖生成
// ─────────────────────────────────────────────────────────────────────────────

function generateTiles(
  source: MapData,
  profile: MapDesignProfile,
  seed: number,
): { tiles: number[][]; spawnPoint: Position } | null {
  const random = new Random(seed);
  const palette = THEME_TERRAIN_PALETTES[source.theme!];
  const innerCount = (source.width - 2) * (source.height - 2);
  const budget = planFeatureBudget(profile, palette, innerCount);
  if (!budget) return null;

  const canvas = new Canvas(source.width, source.height);
  const spawn = reserveOpenAreas(canvas, random, profile);
  if (!spawn) return null;

  const [minSize, maxSize] = getClusterSizeRange(profile.archetype, profile.density);
  const elongation = ARCHETYPE_CLUSTER_SHAPE[profile.archetype].elongation;
  const enforceMinSize = ARCHETYPE_CLUSTER_SHAPE[profile.archetype].minSize >= CLUSTER_MIN_SIZE;

  // 依預算逐種地形放叢，主導地形先放以確保它拿到最好的位置
  const ordered = [...budget.obstacles.entries()]
    .sort((a, b) => (b[0] === profile.dominantTerrain ? 1 : 0) - (a[0] === profile.dominantTerrain ? 1 : 0));

  for (const [tile, target] of ordered) {
    let placed = 0;
    for (let attempt = 0; attempt < 3000 && placed < target; attempt++) {
      const size = Math.min(target - placed, random.range(minSize, maxSize));
      const cluster = growCluster(canvas, random, tile, Math.max(size, 1), elongation, enforceMinSize);
      if (cluster) placed += cluster.length;
    }
  }

  widenNarrowCorridors(canvas);
  clearSpawnSurroundings(canvas, spawn);
  repairConnectivity(canvas, spawn);
  rebalanceObstacles(canvas, random, budget, profile, enforceMinSize);
  widenNarrowCorridors(canvas);
  clearSpawnSurroundings(canvas, spawn);
  repairConnectivity(canvas, spawn);
  paintDecorFloors(canvas, random, budget);

  if (canvas.tiles[spawn.y][spawn.x] !== TileType.Ground) return null;
  return { tiles: canvas.tiles, spawnPoint: spawn };
}

interface GenerationResult {
  id: string;
  ok: boolean;
  attempts: number;
  detail: string;
}

function generateMap(source: MapData): GenerationResult {
  const profile = MAP_DESIGN_PROFILES[source.id];
  if (!profile) {
    return { id: source.id, ok: false, attempts: 0, detail: '沒有 MAP_DESIGN_PROFILES 指派' };
  }

  let lastDetail = '未產生任何候選';
  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt++) {
    const seed = hashString(`${source.id}#${attempt}`);
    const generated = generateTiles(source, profile, seed);
    if (!generated) {
      lastDetail = '骨架生成失敗（放不下開闊空地或地形預算不可行）';
      continue;
    }

    const candidate: MapData = { ...source, tiles: generated.tiles, spawnPoint: generated.spawnPoint };
    try {
      validateMapData(candidate, candidate.id);
    } catch (error) {
      lastDetail = `validateMapData: ${(error as Error).message}`;
      continue;
    }

    const violations = findFirstViolation(candidate, profile);
    if (violations.length > 0) {
      lastDetail = formatViolations(candidate.id, violations);
      continue;
    }

    writeMap(candidate);
    return { id: source.id, ok: true, attempts: attempt, detail: '' };
  }

  return { id: source.id, ok: false, attempts: MAX_SEED_ATTEMPTS, detail: lastDetail };
}

function writeMap(map: MapData): void {
  const rows = map.tiles.map(row => `    [${row.join(',')}]`).join(',\n');
  const json = `{
  "id": ${JSON.stringify(map.id)},
  "name": ${JSON.stringify(map.name)},
  "width": ${map.width},
  "height": ${map.height},
  "theme": ${JSON.stringify(map.theme)},
  "spawnPoint": { "x": ${map.spawnPoint.x}, "y": ${map.spawnPoint.y} },
  "tiles": [
${rows}
  ]
}
`;
  writeFileSync(join(MAPS_DIR, `${map.id}.json`), json, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const requested = process.argv.slice(2).filter(argument => !argument.startsWith('-'));
  const files = readdirSync(MAPS_DIR).filter(file => file.endsWith('.json')).sort();

  const results: GenerationResult[] = [];
  for (const file of files) {
    const source = JSON.parse(readFileSync(join(MAPS_DIR, file), 'utf8')) as MapData;
    if (requested.length > 0 && !requested.includes(source.id)) continue;
    if (requested.length === 0 && HAND_AUTHORED.has(source.id)) continue;
    results.push(generateMap(source));
  }

  const failed = results.filter(result => !result.ok);
  for (const result of results.filter(result => result.ok)) {
    console.log(`✓ ${result.id}（第 ${result.attempts} 次嘗試）`);
  }
  for (const result of failed) {
    console.log(`✗ ${result.id}\n${result.detail}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} 張地圖產出成功`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
