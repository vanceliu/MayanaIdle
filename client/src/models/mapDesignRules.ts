/**
 * 地圖設計規則（`38-map-control.md` § 38.11、§ 38.12）
 *
 * 這裡實作的是「設計規範」層的檢查，與 `mapDataControl.ts` 的 `validateMapData`（資料格式與
 * 可達性的硬性驗證）分工：資料合法但設計不合規的地圖，會被本模組擋下。
 *
 * 純函式、無 PixiJS / Zustand 相依，供單元測試與離線生成腳本共用。
 */
import type { MapData, MapTheme, Position } from './mapControl';
import { TileType, isInBounds, isWalkableTile, isSpawnableTile } from './mapControl';

// ─────────────────────────────────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 這張地圖要不要受設計規範管（§ 38.11、§ 38.12）。
 *
 * 規範談的是「戰鬥地圖好不好打」——地形多樣性、掩體、繞路距離。
 * 兩種圖不在管轄範圍內，因為它們的空曠是刻意的、不是設計失誤：
 *
 * - **城鎮**（`theme === 'town'`）：沒有戰鬥
 * - **試驗場**（`autoSpawn === false`）：一整塊空地才量得準，
 *   放掩體反而會擋住投射物、污染 DPS（`50-training-ground.md` § 50.3）
 *
 * 這支是判定的唯一出處，測試與生成腳本一律走它，不要各自寫一份 filter。
 */
export function isDesignRegulatedMap(map: MapData): boolean {
  return map.theme !== 'town' && map.autoSpawn !== false;
}

/** 佈局原型（§ 38.12） */
export type LayoutArchetype = 'open' | 'semi-open' | 'pillar-hall' | 'room-corridor' | 'cavern';

/** 密度分級（§ 38.11.1） */
export type DensityGrade = 'sparse' | 'standard' | 'dense' | 'very-dense';

/** 單張地圖的個性指派（§ 38.11.2） */
export interface MapDesignProfile {
  archetype: LayoutArchetype;
  density: DensityGrade;
  /** 主導地形，必須取自該 theme 的地形色盤 */
  dominantTerrain: TileType;
  /** Boss 層需要更大的中央空地 */
  isBossFloor?: boolean;
}

export interface DesignViolation {
  rule: string;
  message: string;
  positions?: Position[];
}

export interface TerrainStats {
  /** 外圍邊界以內的格數 */
  innerCount: number;
  walkableCount: number;
  spawnableCount: number;
  /** 可通行格 ÷ 內部格數 */
  walkableRatio: number;
  /** 可生成格 ÷ 可通行格 */
  spawnableRatio: number;
  /** 各 tile 代碼的使用量（僅內部區域） */
  tileCounts: Map<number, number>;
  /** 特色地形總量（地面與邊界以外的全部） */
  featureCount: number;
  /** 使用到的特色地形種類 */
  featureTypes: TileType[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 常數（全部來自 38-map-control.md，不可自行調整）
// ─────────────────────────────────────────────────────────────────────────────

/** § 38.12 五種佈局原型的基準可通行率 */
export const ARCHETYPE_BASE_WALKABLE_RATIO: Readonly<Record<LayoutArchetype, number>> = {
  'open': 0.88,
  'semi-open': 0.78,
  'pillar-hall': 0.74,
  'room-corridor': 0.65,
  'cavern': 0.63,
};

/** § 38.12 密度分級對可通行率的偏移 */
export const DENSITY_WALKABLE_OFFSET: Readonly<Record<DensityGrade, number>> = {
  'sparse': 0.08,
  'standard': 0,
  'dense': -0.08,
  'very-dense': -0.16,
};

export const WALKABLE_RATIO_TOLERANCE = 0.03;
/** § 38.12 絕對下限，再低會讓 A* 收束到少數窄道 */
export const MIN_WALKABLE_RATIO = 0.45;
/** § 38.12 硬性約束 1 */
export const MIN_SPAWNABLE_RATIO = 0.60;
/** § 38.11.1 裝飾地面類當主導時，佔可通行格的上限 */
export const DECOR_FLOOR_MAX_WALKABLE_SHARE = 0.35;
/** § 38.11.1 主導地形佔特色地形總量的下限（只需領頭，不需壟斷） */
export const DOMINANT_MIN_FEATURE_SHARE = 0.30;
/**
 * § 38.11.1 色盤裡每種地形佔特色地形總量的下限。
 * 這條是地形豐富度的關鍵：沒有下限的話，最佳解永遠是「一種地形鋪滿」，
 * 明鏡森林就會變成 99% 湖水、零棵樹。
 */
export const MIN_TERRAIN_SHARE = 0.10;
export const MIN_FEATURE_TYPES = 2;

/**
 * § 38.12 叢聚分佈。只有下限沒有上限 —— 大森林、長岩壁本來就該是大的，
 * 限制上限只會讓地圖變成「同一個尺寸的團塊反覆出現」。
 */
export const CLUSTER_MIN_SIZE = 3;
export const MIN_CLUSTER_GAP = 2;

/** 叢大小限制只套用在自然地貌；人造結構（柱陣、房間牆體）豁免（§ 38.12） */
export const NATURAL_ARCHETYPES: readonly LayoutArchetype[] = ['open', 'semi-open', 'cavern'];

/** § 38.12 開闊空地 */
export const OPEN_AREA_SIZE = 6;
export const BOSS_OPEN_AREA_SIZE = 8;

/** § 38.12 硬性約束 2：1 格寬通道僅可用於短捷徑 */
export const MAX_NARROW_CORRIDOR_RUN = 3;
/**
 * § 38.12 硬性約束 5。
 *
 * 死路本身是合理的關卡設計——壁龕、小房間、裝飾性的凹角都會產生死路，
 * 真正不可接受的是「進不去也出不來」的格子，那由 `validateMapData` 的
 * 可達性驗證把關。這裡只擋「滿地碎口袋」讓自動漫遊一直卡角落的情況，
 * 因此門檻放寬到面積 ÷ 50（30×20 的圖允許 10 個）。
 */
export const DEAD_END_AREA_DIVISOR = 50;
/**
 * § 38.12 硬性約束 6：路徑長度 ≤ `2 × 直線格距 + DETOUR_SLACK`。
 * 採比例而非絕對值 —— 40×30 地圖的對角直線距離本身就有 37 格。
 */
export const DETOUR_RATIO_LIMIT = 2;
export const DETOUR_SLACK = 10;

/** 給定直線格距時允許的最長路徑 */
export function getDetourLimit(straightDistance: number): number {
  return DETOUR_RATIO_LIMIT * straightDistance + DETOUR_SLACK;
}

/** 八方向移動下的直線格距（Chebyshev） */
function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * § 38.12 硬性約束 3：spawnPoint 淨空區。
 * 距離種類必須與引擎的 `MIN_SPAWN_DISTANCE` 一致（歐幾里得）。
 */
export const SPAWN_CLEAR_RADIUS = 3;
export const SPAWN_NEAR_RADIUS = 5;
export const SPAWN_NEAR_MIN_WALKABLE_RATIO = 0.70;

/**
 * § 38.12 石柱密度：任一 4×4 範圍內最多 2 根。
 * 石柱是支撐結構不是障礙牆——一間 4×4 的房間立兩根就滿了，
 * 再多就成了柱林，讀起來不像廳室。
 */
export const PILLAR_WINDOW = 4;
export const MAX_PILLARS_PER_WINDOW = 2;

/** § 38.12 硬性約束 7：達到此大小的低窪障礙區才需檢查繞行 */
export const LOW_OBSTACLE_REGION_MIN_SIZE = 8;

/** 可走但不可生怪的裝飾地面（§ 38.4） */
export const DECOR_FLOOR_TILES: readonly TileType[] = [
  TileType.Decoration, TileType.Grass, TileType.Sand, TileType.Carpet,
];

/** 不阻擋視線與投射物的低窪障礙（§ 38.4） */
export const LOW_OBSTACLE_TILES: readonly TileType[] = [
  TileType.Water, TileType.Lava, TileType.Chasm,
];

/** § 38.11 各主題允許使用的地形色盤 */
export const THEME_TERRAIN_PALETTES: Readonly<Record<MapTheme, readonly TileType[]>> = {
  'grassland': [TileType.Tree, TileType.Grass, TileType.Rock, TileType.Water],
  'forest': [TileType.Tree, TileType.Grass, TileType.Water, TileType.Rock],
  'swamp': [TileType.Water, TileType.Grass, TileType.Tree],
  'snow': [TileType.Rock, TileType.Water, TileType.Tree, TileType.Decoration],
  'highland': [TileType.Rock, TileType.Chasm, TileType.Sand, TileType.Grass],
  'battlefield': [TileType.Wall, TileType.Chasm, TileType.Rock, TileType.Sand],
  'cave': [TileType.Wall, TileType.Rock, TileType.Water, TileType.Chasm],
  'prison': [TileType.Wall, TileType.Water, TileType.Carpet, TileType.Pillar, TileType.Rock, TileType.Decoration],
  'ancient': [TileType.Pillar, TileType.Wall, TileType.Carpet, TileType.Chasm, TileType.Rock, TileType.Water, TileType.Decoration],
  'dragon': [TileType.Lava, TileType.Rock, TileType.Sand, TileType.Chasm],
  'ivory': [TileType.Pillar, TileType.Wall, TileType.Carpet, TileType.Decoration],
  'tower': [TileType.Pillar, TileType.Carpet, TileType.Wall, TileType.Rock, TileType.Decoration],
  'frost-tower': [TileType.Pillar, TileType.Water, TileType.Carpet, TileType.Wall, TileType.Rock, TileType.Decoration],
  'lava-tower': [TileType.Lava, TileType.Pillar, TileType.Carpet, TileType.Wall, TileType.Rock, TileType.Decoration],
  // 城鎮：房舍（牆）＋ 門口地磚 ＋ 綠地 ＋ 水井。
  // 城鎮地圖不套用 § 38.12 的密度／叢聚規範（安全區不生怪），色盤仍在這裡登記。
  'town': [TileType.Wall, TileType.NpcStand, TileType.Grass, TileType.Water],
};

/**
 * § 38.11.2 全地圖個性指派表（54 張，逐張照抄，不得由主題推導）
 *
 * `isBossFloor` 依 `mapData.ts` 的 `isBossFloor` 欄位。
 */
export const MAP_DESIGN_PROFILES: Readonly<Record<string, MapDesignProfile>> = {
  // grassland
  'dawn-plains': { archetype: 'open', density: 'sparse', dominantTerrain: TileType.Grass },
  'green-valley': { archetype: 'open', density: 'standard', dominantTerrain: TileType.Tree },
  // forest
  'wind-woods': { archetype: 'semi-open', density: 'standard', dominantTerrain: TileType.Grass },
  'demon-forest': { archetype: 'semi-open', density: 'very-dense', dominantTerrain: TileType.Tree },
  'rotleaf-path': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Tree },
  'demon-altar': { archetype: 'semi-open', density: 'very-dense', dominantTerrain: TileType.Rock },
  'mirror-forest': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Water },
  'glimmer-shore': { archetype: 'semi-open', density: 'standard', dominantTerrain: TileType.Water },
  'shattered-mirror': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Rock },
  // swamp
  'misty-swamp': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Water },
  // snow
  'snow-field': { archetype: 'open', density: 'sparse', dominantTerrain: TileType.Rock },
  'snow-field-deep': { archetype: 'open', density: 'dense', dominantTerrain: TileType.Water },
  // highland
  'trial-highlands': { archetype: 'semi-open', density: 'standard', dominantTerrain: TileType.Rock },
  'trial-highlands-top': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Chasm },
  // battlefield
  'ancient-battlefield': { archetype: 'open', density: 'standard', dominantTerrain: TileType.Wall },
  // cave
  'misty-cave-1f': { archetype: 'cavern', density: 'sparse', dominantTerrain: TileType.Rock },
  'misty-cave-2f': { archetype: 'cavern', density: 'standard', dominantTerrain: TileType.Wall },
  'misty-cave-3f': { archetype: 'cavern', density: 'sparse', dominantTerrain: TileType.Water, isBossFloor: true },
  // prison
  'underwater-prison-1f': { archetype: 'room-corridor', density: 'standard', dominantTerrain: TileType.Wall },
  'underwater-prison-2f': { archetype: 'room-corridor', density: 'dense', dominantTerrain: TileType.Water },
  'underwater-prison-3f': { archetype: 'room-corridor', density: 'standard', dominantTerrain: TileType.Pillar },
  'underwater-prison-4f': { archetype: 'room-corridor', density: 'sparse', dominantTerrain: TileType.Pillar, isBossFloor: true },
  // ancient
  'ancient-dungeon-1f': { archetype: 'room-corridor', density: 'standard', dominantTerrain: TileType.Wall },
  'ancient-dungeon-2f': { archetype: 'room-corridor', density: 'dense', dominantTerrain: TileType.Pillar },
  'ancient-dungeon-3f': { archetype: 'room-corridor', density: 'sparse', dominantTerrain: TileType.Wall },
  'ancient-dungeon-4f': { archetype: 'room-corridor', density: 'dense', dominantTerrain: TileType.Chasm },
  'ancient-dungeon-5f': { archetype: 'room-corridor', density: 'standard', dominantTerrain: TileType.Pillar },
  'ancient-dungeon-6f': { archetype: 'room-corridor', density: 'dense', dominantTerrain: TileType.Wall },
  'ancient-dungeon-7f': { archetype: 'room-corridor', density: 'sparse', dominantTerrain: TileType.Chasm },
  'ancient-dungeon-8f': { archetype: 'room-corridor', density: 'very-dense', dominantTerrain: TileType.Pillar },
  'ancient-dungeon-9f': { archetype: 'room-corridor', density: 'sparse', dominantTerrain: TileType.Pillar, isBossFloor: true },
  // dragon
  'dragon-valley-surface': { archetype: 'semi-open', density: 'sparse', dominantTerrain: TileType.Rock },
  'dragon-valley-1f': { archetype: 'semi-open', density: 'standard', dominantTerrain: TileType.Lava },
  'dragon-valley-2f': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Rock },
  'dragon-valley-3f': { archetype: 'semi-open', density: 'standard', dominantTerrain: TileType.Sand },
  'dragon-valley-4f': { archetype: 'semi-open', density: 'very-dense', dominantTerrain: TileType.Lava },
  'dragon-valley-5f': { archetype: 'semi-open', density: 'sparse', dominantTerrain: TileType.Sand },
  'dragon-valley-6f': { archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Chasm },
  'dragon-valley-7f': { archetype: 'semi-open', density: 'sparse', dominantTerrain: TileType.Lava, isBossFloor: true },
  // ivory
  'ivory-tower-1f': { archetype: 'pillar-hall', density: 'standard', dominantTerrain: TileType.Pillar },
  'ivory-tower-2f': { archetype: 'pillar-hall', density: 'dense', dominantTerrain: TileType.Wall },
  'ivory-tower-3f': { archetype: 'pillar-hall', density: 'sparse', dominantTerrain: TileType.Decoration },
  'ivory-tower-4f': { archetype: 'pillar-hall', density: 'dense', dominantTerrain: TileType.Pillar },
  'ivory-tower-5f': { archetype: 'pillar-hall', density: 'sparse', dominantTerrain: TileType.Carpet, isBossFloor: true },
  // tower / frost-tower / lava-tower
  'hundred-pillar-1-10f': { archetype: 'pillar-hall', density: 'sparse', dominantTerrain: TileType.Pillar },
  'hundred-pillar-11-20f': { archetype: 'pillar-hall', density: 'standard', dominantTerrain: TileType.Pillar },
  'hundred-pillar-21-30f': { archetype: 'pillar-hall', density: 'dense', dominantTerrain: TileType.Wall },
  'hundred-pillar-31-40f': { archetype: 'pillar-hall', density: 'sparse', dominantTerrain: TileType.Wall },
  'hundred-pillar-41-50f': { archetype: 'pillar-hall', density: 'dense', dominantTerrain: TileType.Pillar },
  'hundred-pillar-51-60f': { archetype: 'pillar-hall', density: 'very-dense', dominantTerrain: TileType.Pillar },
  'hundred-pillar-61-70f': { archetype: 'pillar-hall', density: 'dense', dominantTerrain: TileType.Water },
  'hundred-pillar-71-80f': { archetype: 'pillar-hall', density: 'very-dense', dominantTerrain: TileType.Lava },
  'hundred-pillar-81-90f': { archetype: 'pillar-hall', density: 'standard', dominantTerrain: TileType.Wall },
  'hundred-pillar-91-100f': { archetype: 'pillar-hall', density: 'sparse', dominantTerrain: TileType.Carpet },
};

export function getMapDesignProfile(mapId: string): MapDesignProfile | undefined {
  return MAP_DESIGN_PROFILES[mapId];
}

/** 該 profile 的目標可通行率（原型基準 + 密度偏移） */
export function getTargetWalkableRatio(profile: MapDesignProfile): number {
  return ARCHETYPE_BASE_WALKABLE_RATIO[profile.archetype] + DENSITY_WALKABLE_OFFSET[profile.density];
}

// ─────────────────────────────────────────────────────────────────────────────
// 幾何與圖論工具
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTIONS_8: readonly Position[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

const DIRECTIONS_4: readonly Position[] = [
  { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
];

function isFeatureTile(tile: number): boolean {
  return tile !== TileType.Ground && tile !== TileType.Boundary;
}

function isDecorFloor(tile: number): boolean {
  return DECOR_FLOOR_TILES.includes(tile as TileType);
}

function isLowObstacle(tile: number): boolean {
  return LOW_OBSTACLE_TILES.includes(tile as TileType);
}

function walkable(map: MapData, x: number, y: number): boolean {
  return isWalkableTile(map, { x, y });
}

/**
 * 單步移動是否合法。斜走時兩側正交格皆須可通行（防切牆角），
 * 與 `mapDataControl.getReachablePositions` 的判定一致。
 */
export function canStep(map: MapData, from: Position, to: Position): boolean {
  if (!walkable(map, from.x, from.y) || !walkable(map, to.x, to.y)) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || (dx === 0 && dy === 0)) return false;
  if (dx !== 0 && dy !== 0) {
    if (!walkable(map, from.x + dx, from.y) || !walkable(map, from.x, from.y + dy)) return false;
  }
  return true;
}

interface WalkableGraph {
  /** 格子索引 → 節點編號，非可通行為 -1 */
  nodeAt: Int32Array;
  nodes: Position[];
}

function buildWalkableGraph(map: MapData): WalkableGraph {
  const nodeAt = new Int32Array(map.width * map.height).fill(-1);
  const nodes: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!walkable(map, x, y)) continue;
      nodeAt[y * map.width + x] = nodes.length;
      nodes.push({ x, y });
    }
  }
  return { nodeAt, nodes };
}

/** 從單一節點做 BFS，回傳到各節點的步數（不可達為 -1） */
function bfsFrom(map: MapData, graph: WalkableGraph, startNode: number): Int32Array {
  const distances = new Int32Array(graph.nodes.length).fill(-1);
  const queue = new Int32Array(graph.nodes.length);
  let head = 0;
  let tail = 0;
  distances[startNode] = 0;
  queue[tail++] = startNode;

  while (head < tail) {
    const current = queue[head++];
    const from = graph.nodes[current];
    for (const direction of DIRECTIONS_8) {
      const to = { x: from.x + direction.x, y: from.y + direction.y };
      if (!isInBounds(map, to)) continue;
      const next = graph.nodeAt[to.y * map.width + to.x];
      if (next < 0 || distances[next] >= 0) continue;
      if (!canStep(map, from, to)) continue;
      distances[next] = distances[current] + 1;
      queue[tail++] = next;
    }
  }
  return distances;
}

/** 連通元件標記：符合 predicate 的格子以 4-鄰接分群 */
function labelRegions(
  map: MapData,
  predicate: (tile: number, x: number, y: number) => boolean,
  innerOnly: boolean,
): { labelAt: Int32Array; regions: Position[][] } {
  const labelAt = new Int32Array(map.width * map.height).fill(-1);
  const regions: Position[][] = [];
  const minX = innerOnly ? 1 : 0;
  const minY = innerOnly ? 1 : 0;
  const maxX = innerOnly ? map.width - 2 : map.width - 1;
  const maxY = innerOnly ? map.height - 2 : map.height - 1;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (labelAt[y * map.width + x] >= 0) continue;
      if (!predicate(map.tiles[y][x], x, y)) continue;

      const label = regions.length;
      const region: Position[] = [];
      const stack: Position[] = [{ x, y }];
      labelAt[y * map.width + x] = label;

      while (stack.length > 0) {
        const current = stack.pop()!;
        region.push(current);
        for (const direction of DIRECTIONS_4) {
          const nx = current.x + direction.x;
          const ny = current.y + direction.y;
          if (nx < minX || ny < minY || nx > maxX || ny > maxY) continue;
          if (labelAt[ny * map.width + nx] >= 0) continue;
          if (!predicate(map.tiles[ny][nx], nx, ny)) continue;
          labelAt[ny * map.width + nx] = label;
          stack.push({ x: nx, y: ny });
        }
      }
      regions.push(region);
    }
  }
  return { labelAt, regions };
}

// ─────────────────────────────────────────────────────────────────────────────
// 統計
// ─────────────────────────────────────────────────────────────────────────────

export function getTerrainStats(map: MapData): TerrainStats {
  const tileCounts = new Map<number, number>();
  let innerCount = 0;
  let walkableCount = 0;
  let spawnableCount = 0;
  let featureCount = 0;

  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const tile = map.tiles[y][x];
      innerCount++;
      tileCounts.set(tile, (tileCounts.get(tile) ?? 0) + 1);
      if (isWalkableTile(map, { x, y })) walkableCount++;
      if (isSpawnableTile(map, { x, y })) spawnableCount++;
      if (isFeatureTile(tile)) featureCount++;
    }
  }

  const featureTypes = [...tileCounts.keys()]
    .filter(isFeatureTile)
    .sort((a, b) => a - b) as TileType[];

  return {
    innerCount,
    walkableCount,
    spawnableCount,
    walkableRatio: innerCount === 0 ? 0 : walkableCount / innerCount,
    spawnableRatio: walkableCount === 0 ? 0 : spawnableCount / walkableCount,
    tileCounts,
    featureCount,
    featureTypes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 個別檢查
// ─────────────────────────────────────────────────────────────────────────────

/** § 38.12 硬性約束 1：可生成格 ≥ 可通行格的 60% */
export function checkSpawnableRatio(map: MapData): DesignViolation[] {
  const stats = getTerrainStats(map);
  if (stats.spawnableRatio >= MIN_SPAWNABLE_RATIO) return [];
  return [{
    rule: 'spawnable-ratio',
    message: `可生成格佔可通行格 ${(stats.spawnableRatio * 100).toFixed(1)}%，`
      + `低於下限 ${MIN_SPAWNABLE_RATIO * 100}%（裝飾地面鋪太多會讓怪物生成頻繁失敗）`,
  }];
}

/** § 38.12 可通行率 = 原型基準 + 密度偏移，且不得低於絕對下限 */
export function checkWalkableRatio(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  const stats = getTerrainStats(map);
  const target = getTargetWalkableRatio(profile);
  const violations: DesignViolation[] = [];

  if (Math.abs(stats.walkableRatio - target) > WALKABLE_RATIO_TOLERANCE) {
    violations.push({
      rule: 'walkable-ratio',
      message: `可通行率 ${(stats.walkableRatio * 100).toFixed(1)}%，`
        + `目標 ${(target * 100).toFixed(1)}% ±${WALKABLE_RATIO_TOLERANCE * 100}%`
        + `（${profile.archetype} 基準 + ${profile.density} 偏移）`,
    });
  }
  if (stats.walkableRatio < MIN_WALKABLE_RATIO) {
    violations.push({
      rule: 'walkable-ratio-floor',
      message: `可通行率 ${(stats.walkableRatio * 100).toFixed(1)}% 低於絕對下限 ${MIN_WALKABLE_RATIO * 100}%`,
    });
  }
  return violations;
}

/** § 38.11 所有使用的特色地形都必須在該 theme 的色盤內 */
export function checkThemePalette(map: MapData): DesignViolation[] {
  const theme = map.theme;
  if (!theme) {
    return [{ rule: 'theme-palette', message: 'theme 未定義，無法檢查地形色盤' }];
  }
  const palette = THEME_TERRAIN_PALETTES[theme];
  const stats = getTerrainStats(map);
  const outside = stats.featureTypes.filter(tile => !palette.includes(tile));
  if (outside.length === 0) return [];
  return [{
    rule: 'theme-palette',
    message: `地形 ${outside.join(', ')} 不在 theme "${theme}" 的色盤內`
      + `（允許：${palette.join(', ')}）`,
  }];
}

/**
 * § 38.11.1 地形豐富度：色盤裡每種地形都要出現且各佔 ≥ 10%。
 * 「空曠」地圖的障礙量本來就少，只要求至少 2 種。
 */
export function checkThemeTerrain(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  const stats = getTerrainStats(map);
  if (stats.featureTypes.length === 0) {
    return [{ rule: 'theme-terrain', message: '未使用任何特色地形' }];
  }

  if (profile.density === 'sparse') {
    if (stats.featureTypes.length >= MIN_FEATURE_TYPES) return [];
    return [{
      rule: 'theme-terrain',
      message: `只用了 ${stats.featureTypes.length} 種特色地形，需要 ≥ ${MIN_FEATURE_TYPES} 種`,
    }];
  }

  const palette = map.theme ? THEME_TERRAIN_PALETTES[map.theme] : [];
  const violations: DesignViolation[] = [];
  for (const tile of palette) {
    const share = (stats.tileCounts.get(tile) ?? 0) / stats.featureCount;
    if (share < MIN_TERRAIN_SHARE) {
      violations.push({
        rule: 'terrain-variety',
        message: `色盤地形 ${tile} 只佔特色地形 ${(share * 100).toFixed(1)}%，`
          + `需 ≥ ${MIN_TERRAIN_SHARE * 100}%（地形必須混合，不是一種鋪滿）`,
      });
    }
  }
  return violations;
}

/** § 38.11.1 主導地形 ≥ 30% 且為最大宗；裝飾地面主導另有 35% 可通行格上限 */
export function checkDominantTerrain(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  const stats = getTerrainStats(map);
  const violations: DesignViolation[] = [];

  if (stats.featureCount === 0) {
    return [{ rule: 'dominant-terrain', message: '未使用任何特色地形，無法判定主導地形' }];
  }

  const dominantCount = stats.tileCounts.get(profile.dominantTerrain) ?? 0;
  const dominantShare = dominantCount / stats.featureCount;
  if (dominantShare < DOMINANT_MIN_FEATURE_SHARE) {
    violations.push({
      rule: 'dominant-terrain',
      message: `主導地形 ${profile.dominantTerrain} 佔特色地形 ${(dominantShare * 100).toFixed(1)}%，`
        + `需 ≥ ${DOMINANT_MIN_FEATURE_SHARE * 100}%`,
    });
  }

  for (const tile of stats.featureTypes) {
    if (tile === profile.dominantTerrain) continue;
    const count = stats.tileCounts.get(tile) ?? 0;
    if (count > dominantCount) {
      violations.push({
        rule: 'dominant-terrain',
        message: `${tile} 有 ${count} 格，超過主導地形 ${profile.dominantTerrain} 的 ${dominantCount} 格`,
      });
    }
  }

  if (isDecorFloor(profile.dominantTerrain) && stats.walkableCount > 0) {
    const walkableShare = dominantCount / stats.walkableCount;
    if (walkableShare > DECOR_FLOOR_MAX_WALKABLE_SHARE) {
      violations.push({
        rule: 'decor-floor-share',
        message: `裝飾地面 ${profile.dominantTerrain} 佔可通行格 ${(walkableShare * 100).toFixed(1)}%，`
          + `超過上限 ${DECOR_FLOOR_MAX_WALKABLE_SHARE * 100}%（會撞到可生成格下限）`,
      });
    }
  }

  return violations;
}

/**
 * § 38.12 硬性約束 2：1 格寬通道僅可用於長度 ≤ 3 的短捷徑。
 * 玩家與怪物佔位互斥，過長的窄廊會讓怪物排隊塞車。
 */
export function checkCorridorWidth(map: MapData): DesignViolation[] {
  const isNarrow = (x: number, y: number): boolean => {
    if (!walkable(map, x, y)) return false;
    const narrowHorizontal = !walkable(map, x - 1, y) && !walkable(map, x + 1, y);
    const narrowVertical = !walkable(map, x, y - 1) && !walkable(map, x, y + 1);
    return narrowHorizontal || narrowVertical;
  };

  const { regions } = labelRegions(map, (_tile, x, y) => isNarrow(x, y), false);
  return regions
    .filter(region => region.length > MAX_NARROW_CORRIDOR_RUN)
    .map(region => ({
      rule: 'corridor-width',
      message: `1 格寬通道連續 ${region.length} 格，上限 ${MAX_NARROW_CORRIDOR_RUN} 格`,
      positions: region,
    }));
}

/** § 38.12 硬性約束 3：spawnPoint 淨空區（歐幾里得距離，與引擎一致） */
export function checkSpawnClearance(map: MapData): DesignViolation[] {
  const spawn = map.spawnPoint;
  const violations: DesignViolation[] = [];
  const blocked: Position[] = [];
  let nearTotal = 0;
  let nearWalkable = 0;

  const radius = Math.ceil(SPAWN_NEAR_RADIUS);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const position = { x: spawn.x + dx, y: spawn.y + dy };
      if (!isInBounds(map, position)) continue;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const isWalkable = walkable(map, position.x, position.y);

      if (distance <= SPAWN_CLEAR_RADIUS && !isWalkable) blocked.push(position);
      if (distance <= SPAWN_NEAR_RADIUS) {
        nearTotal++;
        if (isWalkable) nearWalkable++;
      }
    }
  }

  if (blocked.length > 0) {
    violations.push({
      rule: 'spawn-clearance',
      message: `spawnPoint 半徑 ${SPAWN_CLEAR_RADIUS} 格內有 ${blocked.length} 個不可通行格，必須全部淨空`,
      positions: blocked,
    });
  }

  const nearRatio = nearTotal === 0 ? 0 : nearWalkable / nearTotal;
  if (nearRatio < SPAWN_NEAR_MIN_WALKABLE_RATIO) {
    violations.push({
      rule: 'spawn-clearance',
      message: `spawnPoint 半徑 ${SPAWN_NEAR_RADIUS} 格內可通行 ${(nearRatio * 100).toFixed(1)}%，`
        + `需 ≥ ${SPAWN_NEAR_MIN_WALKABLE_RATIO * 100}%（怪物最小生成距離為 5）`,
    });
  }

  return violations;
}

/** § 38.12 硬性約束 5：死路數量 ≤ 內部面積 ÷ DEAD_END_AREA_DIVISOR */
export function checkDeadEnds(map: MapData): DesignViolation[] {
  const stats = getTerrainStats(map);
  const limit = Math.floor(stats.innerCount / DEAD_END_AREA_DIVISOR);
  const deadEnds: Position[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!walkable(map, x, y)) continue;
      const from = { x, y };
      let exits = 0;
      for (const direction of DIRECTIONS_8) {
        if (canStep(map, from, { x: x + direction.x, y: y + direction.y })) exits++;
        if (exits > 1) break;
      }
      if (exits <= 1) deadEnds.push(from);
    }
  }

  if (deadEnds.length <= limit) return [];
  return [{
    rule: 'dead-ends',
    message: `死路 ${deadEnds.length} 個，上限 ${limit} 個（內部面積 ${stats.innerCount} ÷ ${DEAD_END_AREA_DIVISOR}）`,
    positions: deadEnds,
  }];
}

/** § 38.12 硬性約束 6：不得把地圖切成需要繞行超過 40 格的兩半 */
export function checkDetourDistance(map: MapData): DesignViolation[] {
  const graph = buildWalkableGraph(map);
  if (graph.nodes.length === 0) return [];

  for (let start = 0; start < graph.nodes.length; start++) {
    const distances = bfsFrom(map, graph, start);
    for (let end = start + 1; end < graph.nodes.length; end++) {
      const straight = chebyshev(graph.nodes[start], graph.nodes[end]);
      const limit = getDetourLimit(straight);
      if (distances[end] > limit) {
        return [{
          rule: 'detour-distance',
          message: `(${graph.nodes[start].x},${graph.nodes[start].y}) 到 `
            + `(${graph.nodes[end].x},${graph.nodes[end].y}) 直線 ${straight} 格但需繞行 `
            + `${distances[end]} 格，超過上限 ${limit}（怪物追蹤上限 15 格，紅點會在半路消失）`,
          positions: [graph.nodes[start], graph.nodes[end]],
        }];
      }
    }
  }
  return [];
}

/**
 * § 38.12 叢聚分佈。只套用在「密集」「極密」，柱廳型全面豁免
 * （柱陣的本質就是單格柱子的規則排列）。
 */
/**
 * § 38.12 石柱密度：任一 4×4 視窗內最多 2 **根**石柱。
 *
 * 石柱是支撐結構，一間 4×4 的房間立兩根就滿了；再多就成了柱林。
 * 數的是**根數不是格數**：倒塌石柱橫躺跨兩格，但它就是一根柱子，只算 1。
 * 直立與倒塌的差別只在「間距」規則（倒柱的正交成對是唯一允許相鄰的情況）。
 */
export function checkPillarDensity(map: MapData): DesignViolation[] {
  // 每根柱子取一個代表格：倒柱以兩半中座標較小者為代表，兩半都指向同一根
  const idOf = (x: number, y: number): string | null => {
    if (map.tiles[y][x] !== TileType.Pillar) return null;
    const axis = getFallenPillarAxis(map, x, y);
    if (!axis) return `${x},${y}`;
    const [dx, dy] = axis === 'horizontal' ? [1, 0] : [0, 1];
    const prev = { x: x - dx, y: y - dy };
    const isPair = isInBounds(map, prev) && map.tiles[prev.y][prev.x] === TileType.Pillar;
    return isPair ? `${prev.x},${prev.y}` : `${x},${y}`;
  };

  const offending: Position[] = [];
  for (let y = 0; y + PILLAR_WINDOW <= map.height; y++) {
    for (let x = 0; x + PILLAR_WINDOW <= map.width; x++) {
      const seen = new Set<string>();
      for (let dy = 0; dy < PILLAR_WINDOW; dy++) {
        for (let dx = 0; dx < PILLAR_WINDOW; dx++) {
          const id = idOf(x + dx, y + dy);
          if (id) seen.add(id);
        }
      }
      if (seen.size > MAX_PILLARS_PER_WINDOW) offending.push({ x, y });
    }
  }
  if (offending.length === 0) return [];
  return [{
    rule: 'pillar-density',
    message: `有 ${offending.length} 處 ${PILLAR_WINDOW}×${PILLAR_WINDOW} 範圍內超過 `
      + `${MAX_PILLARS_PER_WINDOW} 根石柱（石柱是支撐結構，過密會變成柱林；`
      + `倒塌石柱跨兩格但算一根）`,
    positions: offending,
  }];
}

export function getFallenPillarAxis(map: MapData, x: number, y: number): 'horizontal' | 'vertical' | null {
  if (map.tiles[y]?.[x] !== TileType.Pillar) return null;
  const isPillar = (px: number, py: number): boolean =>
    isInBounds(map, { x: px, y: py }) && map.tiles[py][px] === TileType.Pillar;

  const neighbours = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .filter(([dx, dy]) => isPillar(x + dx, y + dy));
  if (neighbours.length !== 1) return null;

  const [dx, dy] = neighbours[0];
  const [nx, ny] = [x + dx, y + dy];
  // 對方也必須只有這一個石柱鄰居，否則是三根以上連成的石堆
  const back = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .filter(([bx, by]) => isPillar(nx + bx, ny + by));
  if (back.length !== 1) return null;
  // 兩格都不可有斜向的石柱，否則會糊成一團
  for (const [cx, cy] of [[x, y], [nx, ny]]) {
    for (const [ox, oy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      if (isPillar(cx + ox, cy + oy)) return null;
    }
  }
  return dx !== 0 ? 'horizontal' : 'vertical';
}

/**
 * § 38.12「石柱是唯一例外」：石柱是人造結構，語彙是一根一根立著。
 * 相鄰（含斜向）的兩根石柱會糊成一團石塊，失去柱列的辨識度，
 * 因此最密的排法也必須至少間隔 1 格。
 *
 * **唯一的例外是倒塌石柱**：橫躺的柱身本來就跨兩格，
 * 正交成對且兩端各自沒有其他石柱鄰居時視為倒柱，不算違規。
 */
export function checkPillarSpacing(map: MapData): DesignViolation[] {
  const offending: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x] !== TileType.Pillar) continue;
      if (getFallenPillarAxis(map, x, y)) continue;   // 倒塌石柱
      // 只看右、下、右下、右上，避免同一對被回報兩次
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const next = { x: x + dx, y: y + dy };
        if (!isInBounds(map, next)) continue;
        if (map.tiles[next.y][next.x] === TileType.Pillar) offending.push({ x, y });
      }
    }
  }
  if (offending.length === 0) return [];
  return [{
    rule: 'pillar-spacing',
    message: `有 ${offending.length} 處石柱與另一根石柱相鄰，石柱之間至少要間隔 1 格`
      + `（倒塌石柱的正交成對除外）`,
    positions: offending,
  }];
}

export function checkClustering(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  if (profile.density !== 'dense' && profile.density !== 'very-dense') return [];

  const enforceSize = NATURAL_ARCHETYPES.includes(profile.archetype);
  const { labelAt, regions } = labelRegions(
    map,
    (_tile, x, y) => !walkable(map, x, y),
    true,
  );
  const violations: DesignViolation[] = [];

  for (const region of enforceSize ? regions : []) {
    if (region.length < CLUSTER_MIN_SIZE) {
      violations.push({
        rule: 'cluster-size',
        message: `障礙叢只有 ${region.length} 格，至少要 ${CLUSTER_MIN_SIZE} 格（避免滿地碎點）`,
        positions: region,
      });
    }
  }

  // 3×3 視窗內出現 2 個以上不同的叢 → 叢間隔 < 2 格
  const reported = new Set<string>();
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      const seen = new Set<number>();
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const label = labelAt[(y + dy) * map.width + (x + dx)];
          if (label >= 0) seen.add(label);
        }
      }
      if (seen.size < 2) continue;
      const key = [...seen].sort((a, b) => a - b).join('-');
      if (reported.has(key)) continue;
      reported.add(key);
      violations.push({
        rule: 'cluster-gap',
        message: `(${x},${y}) 附近的障礙叢間隔不足 ${MIN_CLUSTER_GAP} 格`,
        positions: [{ x, y }],
      });
    }
  }

  return violations;
}

/** § 38.12 開闊空地：一般 ≥ 1 塊 6×6，密集/極密 ≥ 2 塊，Boss 層另需 1 塊 8×8 */
export function checkOpenAreas(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  const required = profile.density === 'dense' || profile.density === 'very-dense' ? 2 : 1;
  const violations: DesignViolation[] = [];

  const found = countDisjointOpenSquares(map, OPEN_AREA_SIZE);
  if (found < required) {
    violations.push({
      rule: 'open-areas',
      message: `只有 ${found} 塊 ${OPEN_AREA_SIZE}×${OPEN_AREA_SIZE} 開闊空地，需要 ${required} 塊`,
    });
  }

  if (profile.isBossFloor && countDisjointOpenSquares(map, BOSS_OPEN_AREA_SIZE) < 1) {
    violations.push({
      rule: 'boss-open-area',
      message: `Boss 層需要至少一塊 ${BOSS_OPEN_AREA_SIZE}×${BOSS_OPEN_AREA_SIZE} 開闊空地，避免 Boss 卡在窄道`,
    });
  }

  return violations;
}

/** 找出互不重疊的全可通行正方形數量 */
export function countDisjointOpenSquares(map: MapData, size: number): number {
  const claimed = new Uint8Array(map.width * map.height);
  let count = 0;

  for (let y = 0; y + size <= map.height; y++) {
    for (let x = 0; x + size <= map.width; x++) {
      let ok = true;
      for (let dy = 0; dy < size && ok; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const index = (y + dy) * map.width + (x + dx);
          if (claimed[index] || !walkable(map, x + dx, y + dy)) { ok = false; break; }
        }
      }
      if (!ok) continue;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) claimed[(y + dy) * map.width + (x + dx)] = 1;
      }
      count++;
    }
  }
  return count;
}

/**
 * § 38.12 硬性約束 7：低窪障礙成片時至少留一條繞行通道。
 * 近戰無法跨越水池/岩漿/深淵，被隔開會完全打不到對面。
 */
export function checkLowObstacleBypass(map: MapData): DesignViolation[] {
  const { regions } = labelRegions(map, tile => isLowObstacle(tile), true);
  const graph = buildWalkableGraph(map);
  const violations: DesignViolation[] = [];

  for (const region of regions) {
    if (region.length < LOW_OBSTACLE_REGION_MIN_SIZE) continue;

    const shoreNodes = new Set<number>();
    for (const cell of region) {
      for (const direction of DIRECTIONS_8) {
        const position = { x: cell.x + direction.x, y: cell.y + direction.y };
        if (!isInBounds(map, position)) continue;
        const node = graph.nodeAt[position.y * map.width + position.x];
        if (node >= 0) shoreNodes.add(node);
      }
    }
    if (shoreNodes.size < 2) continue;

    const [first, ...rest] = [...shoreNodes];
    const distances = bfsFrom(map, graph, first);
    for (const node of rest) {
      if (distances[node] < 0) {
        violations.push({
          rule: 'low-obstacle-bypass',
          message: `${region.length} 格的低窪障礙區把 (${graph.nodes[first].x},${graph.nodes[first].y}) 與 `
            + `(${graph.nodes[node].x},${graph.nodes[node].y}) 完全隔開，近戰無法繞過`,
          positions: region,
        });
        break;
      }
      const limit = getDetourLimit(chebyshev(graph.nodes[first], graph.nodes[node]));
      if (distances[node] > limit) {
        violations.push({
          rule: 'low-obstacle-bypass',
          message: `繞過 ${region.length} 格的低窪障礙區需 ${distances[node]} 格，`
            + `超過上限 ${limit}`,
          positions: region,
        });
        break;
      }
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 彙整
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **安全檢查**：違反這些會讓引擎實際出問題（怪物塞車、生不出怪、紅點消失、走不到）。
 * 手工設計的地圖一律必須通過。由便宜排到昂貴。
 */
const SAFETY_CHECKS: readonly ((map: MapData) => DesignViolation[])[] = [
  checkSpawnableRatio,
  checkCorridorWidth,
  checkSpawnClearance,
  checkDeadEnds,
  checkLowObstacleBypass,
  checkDetourDistance,
];

/**
 * **設計指引**：關於地形比例與辨識度的建議，僅供參考不阻擋。
 *
 * 這些原本是程序生成的目標函數，實測證明「為了滿足數值而生成」產出的地圖
 * 只會是通過檢查的色塊拼貼，不是一個「地方」。地圖改為手工設計後，
 * 這些指標降格為事後參考，不再當成必須命中的目標。
 */
const GUIDANCE_CHECKS: readonly ((map: MapData, profile: MapDesignProfile) => DesignViolation[])[] = [
  map => checkThemePalette(map),
  map => checkPillarSpacing(map),
  map => checkPillarDensity(map),
  (map, profile) => checkWalkableRatio(map, profile),
  (map, profile) => checkThemeTerrain(map, profile),
  (map, profile) => checkDominantTerrain(map, profile),
  (map, profile) => checkClustering(map, profile),
  (map, profile) => checkOpenAreas(map, profile),
];

/** 引擎安全檢查，回傳完整違規清單（空陣列 = 安全） */
export function validateMapSafety(map: MapData): DesignViolation[] {
  return SAFETY_CHECKS.flatMap(check => check(map));
}

/** 遇到第一項違規就停手，供大量檢查時使用 */
export function findFirstSafetyViolation(map: MapData): DesignViolation[] {
  for (const check of SAFETY_CHECKS) {
    const violations = check(map);
    if (violations.length > 0) return violations;
  }
  return [];
}

/** 設計指引檢查，僅供人工參考，不應用來阻擋地圖 */
export function reviewMapDesign(map: MapData, profile: MapDesignProfile): DesignViolation[] {
  return GUIDANCE_CHECKS.flatMap(check => check(map, profile));
}

/** 供錯誤訊息使用的格式化輸出 */
export function formatViolations(mapId: string, violations: DesignViolation[]): string {
  if (violations.length === 0) return `${mapId}: 合規`;
  return `${mapId} 有 ${violations.length} 項違規：\n`
    + violations.map(v => `  [${v.rule}] ${v.message}`).join('\n');
}
