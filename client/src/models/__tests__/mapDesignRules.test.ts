import { describe, it, expect } from 'vitest';
import type { MapData, MapTheme, Position } from '../mapControl';
import { TileType } from '../mapControl';
import { loadAllMaps, clearMapCache } from '../mapDataControl';
import {
  ARCHETYPE_BASE_WALKABLE_RATIO,
  DENSITY_WALKABLE_OFFSET,
  MAP_DESIGN_PROFILES,
  THEME_TERRAIN_PALETTES,
  type MapDesignProfile,
  checkClustering,
  checkCorridorWidth,
  checkDeadEnds,
  checkDetourDistance,
  checkDominantTerrain,
  checkLowObstacleBypass,
  checkOpenAreas,
  checkSpawnClearance,
  checkSpawnableRatio,
  checkThemePalette,
  checkThemeTerrain,
  checkWalkableRatio,
  countDisjointOpenSquares,
  getMapDesignProfile,
  getTargetWalkableRatio,
  getTerrainStats,
} from '../mapDesignRules';

// ─────────────────────────────────────────────────────────────────────────────
// 測試用地圖建構工具（人工構造的小地圖，不碰既有 50 張正式地圖）
// ─────────────────────────────────────────────────────────────────────────────

const CHAR_TO_TILE: Readonly<Record<string, number>> = {
  '#': TileType.Boundary,
  '.': TileType.Ground,
  'W': TileType.Wall,
  'd': TileType.Decoration,
  'T': TileType.Tree,
  'R': TileType.Rock,
  'P': TileType.Pillar,
  '~': TileType.Water,
  'L': TileType.Lava,
  'X': TileType.Chasm,
  'g': TileType.Grass,
  's': TileType.Sand,
  'c': TileType.Carpet,
};

interface MapOptions {
  theme?: MapTheme;
  spawnPoint?: Position;
}

/** 由 ASCII 圖建構地圖，適合測試結構性規則（通道、死路、叢聚） */
function asciiMap(rows: string[], options: MapOptions = {}): MapData {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = rows.map(row => [...row].map(char => {
    const tile = CHAR_TO_TILE[char];
    if (tile === undefined) throw new Error(`Unknown map character: "${char}"`);
    return tile;
  }));
  return {
    id: 'test-map',
    name: 'test',
    width,
    height,
    theme: options.theme ?? 'grassland',
    tiles,
    spawnPoint: options.spawnPoint ?? { x: 1, y: 1 },
  };
}

/** 建立全地面地圖（外圍為邊界），適合測試比例類規則 */
function blankMap(width: number, height: number, options: MapOptions = {}): MapData {
  const tiles: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      row.push(isEdge ? TileType.Boundary : TileType.Ground);
    }
    tiles.push(row);
  }
  return {
    id: 'test-map',
    name: 'test',
    width,
    height,
    theme: options.theme ?? 'grassland',
    tiles,
    spawnPoint: options.spawnPoint ?? { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  };
}

function fillRect(map: MapData, x0: number, y0: number, x1: number, y1: number, tile: number): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) map.tiles[y][x] = tile;
  }
}

function profile(overrides: Partial<MapDesignProfile> = {}): MapDesignProfile {
  return {
    archetype: 'open',
    density: 'standard',
    dominantTerrain: TileType.Tree,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('getTerrainStats', () => {
  it('只統計外圍邊界以內的格子', () => {
    const stats = getTerrainStats(blankMap(10, 8));
    expect(stats.innerCount).toBe(8 * 6);
    expect(stats.walkableCount).toBe(48);
    expect(stats.spawnableCount).toBe(48);
    expect(stats.walkableRatio).toBe(1);
    expect(stats.spawnableRatio).toBe(1);
  });

  it('可生成率以可通行格為分母，裝飾地面可走但不可生怪', () => {
    const map = blankMap(10, 8);
    fillRect(map, 1, 1, 8, 3, TileType.Grass); // 24 格草叢
    const stats = getTerrainStats(map);
    expect(stats.walkableCount).toBe(48);
    expect(stats.spawnableCount).toBe(24);
    expect(stats.spawnableRatio).toBe(0.5);
  });

  it('特色地形不含地面與邊界', () => {
    const map = blankMap(10, 8);
    map.tiles[2][2] = TileType.Tree;
    map.tiles[3][3] = TileType.Rock;
    const stats = getTerrainStats(map);
    expect(stats.featureCount).toBe(2);
    expect(stats.featureTypes).toEqual([TileType.Tree, TileType.Rock].sort((a, b) => a - b));
  });
});

describe('getTargetWalkableRatio', () => {
  it('目標可通行率 = 佈局原型基準 + 密度偏移', () => {
    expect(getTargetWalkableRatio(profile({ archetype: 'open', density: 'sparse' })))
      .toBeCloseTo(ARCHETYPE_BASE_WALKABLE_RATIO.open + DENSITY_WALKABLE_OFFSET.sparse, 10);
  });

  it('文件中的代表案例：dawn-plains 96%、demon-forest 62%', () => {
    expect(getTargetWalkableRatio(MAP_DESIGN_PROFILES['dawn-plains'])).toBeCloseTo(0.96, 10);
    expect(getTargetWalkableRatio(MAP_DESIGN_PROFILES['demon-forest'])).toBeCloseTo(0.62, 10);
  });

  it('極密柱廳仍高於絕對下限 45%', () => {
    expect(getTargetWalkableRatio(MAP_DESIGN_PROFILES['hundred-pillar-71-80f'])).toBeCloseTo(0.58, 10);
  });
});

describe('checkWalkableRatio', () => {
  it('落在容差內視為合規', () => {
    const map = blankMap(10, 8); // 48 格內部
    map.tiles[2][2] = TileType.Tree;
    map.tiles[4][6] = TileType.Tree; // 46/48 = 95.8%，目標 96%
    expect(checkWalkableRatio(map, profile({ density: 'sparse' }))).toEqual([]);
  });

  it('超出容差時回報 walkable-ratio', () => {
    const map = blankMap(10, 8); // 100% 可通行，目標 96%
    const violations = checkWalkableRatio(map, profile({ density: 'sparse' }));
    expect(violations.map(v => v.rule)).toContain('walkable-ratio');
  });

  it('低於絕對下限時額外回報 walkable-ratio-floor', () => {
    const map = blankMap(10, 8);
    fillRect(map, 1, 1, 8, 4, TileType.Wall); // 只剩 16/48 = 33%
    const rules = checkWalkableRatio(map, profile({ archetype: 'room-corridor', density: 'very-dense' })).map(v => v.rule);
    expect(rules).toContain('walkable-ratio-floor');
  });
});

describe('checkSpawnableRatio', () => {
  it('全地面通過', () => {
    expect(checkSpawnableRatio(blankMap(10, 8))).toEqual([]);
  });

  it('裝飾地面過多時不通過', () => {
    const map = blankMap(10, 8);
    fillRect(map, 1, 1, 8, 3, TileType.Carpet); // 可生成率 50% < 60%
    expect(checkSpawnableRatio(map).map(v => v.rule)).toEqual(['spawnable-ratio']);
  });

  it('恰好達到 60% 視為通過', () => {
    const map = blankMap(11, 7); // 內部 9×5 = 45
    fillRect(map, 1, 1, 9, 2, TileType.Grass); // 18 格草叢 → 27/45 = 60%
    const stats = getTerrainStats(map);
    expect(stats.spawnableRatio).toBeCloseTo(0.6, 10);
    expect(checkSpawnableRatio(map)).toEqual([]);
  });
});

describe('checkThemePalette', () => {
  it('色盤內的地形通過', () => {
    const map = blankMap(10, 8, { theme: 'grassland' });
    map.tiles[2][2] = TileType.Tree;
    map.tiles[3][3] = TileType.Water;
    expect(checkThemePalette(map)).toEqual([]);
  });

  it('色盤外的地形不通過（草原不使用牆壁）', () => {
    const map = blankMap(10, 8, { theme: 'grassland' });
    map.tiles[2][2] = TileType.Wall;
    expect(checkThemePalette(map).map(v => v.rule)).toEqual(['theme-palette']);
  });

  it('每個主題的色盤都非空', () => {
    for (const [theme, palette] of Object.entries(THEME_TERRAIN_PALETTES)) {
      expect(palette.length, theme).toBeGreaterThan(0);
    }
  });
});

describe('checkThemeTerrain', () => {
  it('標準密度需要至少 2 種特色地形', () => {
    const map = blankMap(10, 8);
    map.tiles[2][2] = TileType.Tree;
    expect(checkThemeTerrain(map, profile({ density: 'standard' })).map(v => v.rule))
      .toEqual(['theme-terrain']);
  });

  it('空曠密度豁免', () => {
    const map = blankMap(10, 8);
    map.tiles[2][2] = TileType.Tree;
    expect(checkThemeTerrain(map, profile({ density: 'sparse' }))).toEqual([]);
  });

  it('完全沒有特色地形時，連空曠也不通過', () => {
    expect(checkThemeTerrain(blankMap(10, 8), profile({ density: 'sparse' })).map(v => v.rule))
      .toEqual(['theme-terrain']);
  });
});

describe('checkDominantTerrain', () => {
  it('主導地形達標且點綴未超標時通過', () => {
    const map = blankMap(12, 10);
    fillRect(map, 2, 2, 5, 3, TileType.Tree); // 8 格樹
    map.tiles[6][6] = TileType.Rock;          // 1 格岩石 = 11%
    expect(checkDominantTerrain(map, profile({ dominantTerrain: TileType.Tree }))).toEqual([]);
  });

  it('主導地形不足 50% 時不通過', () => {
    const map = blankMap(12, 10);
    map.tiles[2][2] = TileType.Tree;
    fillRect(map, 4, 4, 7, 5, TileType.Rock); // 岩石 8 格 > 樹 1 格
    expect(checkDominantTerrain(map, profile({ dominantTerrain: TileType.Tree })).map(v => v.rule))
      .toContain('dominant-terrain');
  });

  it('點綴地形超過 20% 時不通過', () => {
    const map = blankMap(12, 10);
    fillRect(map, 2, 2, 6, 2, TileType.Tree); // 5 格樹 = 55.6%
    fillRect(map, 2, 5, 5, 5, TileType.Rock); // 4 格岩石 = 44.4%
    expect(checkDominantTerrain(map, profile({ dominantTerrain: TileType.Tree })).map(v => v.rule))
      .toContain('accent-terrain');
  });

  it('裝飾地面當主導時另受可通行格 35% 上限約束', () => {
    const map = blankMap(12, 10, { theme: 'forest' });
    fillRect(map, 1, 1, 10, 4, TileType.Grass); // 40 格草叢 / 80 可通行 = 50%
    const violations = checkDominantTerrain(map, profile({ dominantTerrain: TileType.Grass }));
    expect(violations.map(v => v.rule)).toContain('decor-floor-share');
  });
});

describe('checkCorridorWidth', () => {
  it('2 格寬通道通過', () => {
    const map = asciiMap([
      '############',
      '#..........#',
      '#..WW..WW..#',
      '#..WW..WW..#',
      '#..WW..WW..#',
      '#..........#',
      '############',
    ]);
    expect(checkCorridorWidth(map)).toEqual([]);
  });

  it('1 格寬短捷徑（3 格）通過', () => {
    const map = asciiMap([
      '############',
      '#..........#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..........#',
      '############',
    ]);
    expect(checkCorridorWidth(map)).toEqual([]);
  });

  it('1 格寬長廊（5 格）不通過', () => {
    const map = asciiMap([
      '############',
      '#..........#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..WW.WW...#',
      '#..........#',
      '############',
    ]);
    const violations = checkCorridorWidth(map);
    expect(violations.map(v => v.rule)).toEqual(['corridor-width']);
    expect(violations[0].positions).toHaveLength(5);
  });
});

describe('checkSpawnClearance', () => {
  it('開闊起點通過', () => {
    expect(checkSpawnClearance(blankMap(20, 15, { spawnPoint: { x: 9, y: 7 } }))).toEqual([]);
  });

  it('半徑 3 格內有障礙時不通過', () => {
    const map = blankMap(20, 15, { spawnPoint: { x: 9, y: 7 } });
    map.tiles[7][11] = TileType.Rock; // 距離 2
    const violations = checkSpawnClearance(map);
    expect(violations.map(v => v.rule)).toContain('spawn-clearance');
    expect(violations[0].positions).toEqual([{ x: 11, y: 7 }]);
  });

  it('半徑 5 格內可通行不足 70% 時不通過', () => {
    const spawn = { x: 9, y: 7 };
    const map = blankMap(20, 15, { spawnPoint: spawn });
    // 只擋半徑 3 之外、5 之內的左半邊，確保淨空區仍然乾淨
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 0; dx++) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 3 && distance <= 5) map.tiles[spawn.y + dy][spawn.x + dx] = TileType.Rock;
      }
    }
    const messages = checkSpawnClearance(map).map(v => v.message);
    expect(messages.some(m => m.includes('半徑 5'))).toBe(true);
    expect(messages.some(m => m.includes('半徑 3'))).toBe(false);
  });
});

describe('checkDeadEnds', () => {
  it('開闊地圖沒有死路', () => {
    expect(checkDeadEnds(blankMap(20, 15))).toEqual([]);
  });

  it('封閉小口袋計為死路', () => {
    const map = asciiMap([
      '########',
      '#......#',
      '#.WWWW.#',
      '#.W..W.#',
      '#.WWWW.#',
      '#......#',
      '########',
    ]);
    const violations = checkDeadEnds(map);
    expect(violations.map(v => v.rule)).toEqual(['dead-ends']);
    expect(violations[0].positions).toHaveLength(2);
  });
});

describe('checkClustering', () => {
  const denseProfile = profile({ archetype: 'semi-open', density: 'dense', dominantTerrain: TileType.Rock });

  it('空曠與標準密度不套用叢聚規則', () => {
    const map = blankMap(20, 15);
    map.tiles[5][5] = TileType.Rock; // 單格障礙
    expect(checkClustering(map, profile({ density: 'sparse' }))).toEqual([]);
    expect(checkClustering(map, profile({ density: 'standard' }))).toEqual([]);
  });

  it('柱廳型豁免叢大小（柱陣本來就是單格規則排列）', () => {
    const map = blankMap(20, 15);
    for (let y = 2; y <= 12; y += 3) {
      for (let x = 2; x <= 17; x += 3) map.tiles[y][x] = TileType.Pillar;
    }
    expect(checkClustering(map, profile({ archetype: 'pillar-hall', density: 'very-dense' }))).toEqual([]);
  });

  it('房間走廊型豁免叢大小（房間牆體本來就是長條牆帶）', () => {
    const map = blankMap(20, 15);
    fillRect(map, 2, 2, 16, 2, TileType.Wall); // 15 格長牆
    expect(checkClustering(map, profile({ archetype: 'room-corridor', density: 'dense' }))).toEqual([]);
  });

  it('間距規則對人造結構一樣適用（間距 1 的柱陣會讓怪物塞車）', () => {
    const map = blankMap(20, 15);
    for (let y = 2; y <= 12; y += 2) {
      for (let x = 2; x <= 17; x += 2) map.tiles[y][x] = TileType.Pillar;
    }
    expect(checkClustering(map, profile({ archetype: 'pillar-hall', density: 'very-dense' })).map(v => v.rule))
      .toContain('cluster-gap');
  });

  it('成叢且間隔足夠時通過', () => {
    const map = blankMap(20, 15);
    fillRect(map, 2, 2, 3, 3, TileType.Rock); // 4 格
    fillRect(map, 7, 2, 8, 3, TileType.Rock); // 4 格，間隔 3 格
    expect(checkClustering(map, denseProfile)).toEqual([]);
  });

  it('單格障礙不成叢', () => {
    const map = blankMap(20, 15);
    map.tiles[5][5] = TileType.Rock;
    expect(checkClustering(map, denseProfile).map(v => v.rule)).toContain('cluster-size');
  });

  it('自然地貌的障礙叢超過 24 格不通過', () => {
    const map = blankMap(20, 15);
    fillRect(map, 2, 2, 7, 6, TileType.Rock); // 30 格
    expect(checkClustering(map, denseProfile).map(v => v.rule)).toContain('cluster-size');
  });

  it('24 格以內的障礙叢通過', () => {
    const map = blankMap(20, 15);
    fillRect(map, 2, 2, 6, 5, TileType.Rock); // 20 格
    expect(checkClustering(map, denseProfile)).toEqual([]);
  });

  it('叢間僅隔 1 格不通過', () => {
    const map = blankMap(20, 15);
    fillRect(map, 2, 2, 3, 3, TileType.Rock);
    fillRect(map, 5, 2, 6, 3, TileType.Rock); // 中間只有 x=4 一格
    expect(checkClustering(map, denseProfile).map(v => v.rule)).toContain('cluster-gap');
  });
});

describe('checkOpenAreas / countDisjointOpenSquares', () => {
  it('開闊地圖有多塊互不重疊的 6×6 空地', () => {
    expect(countDisjointOpenSquares(blankMap(20, 15), 6)).toBeGreaterThanOrEqual(2);
  });

  it('密集地圖需要 2 塊空地', () => {
    const map = blankMap(20, 15);
    fillRect(map, 1, 5, 18, 5, TileType.Wall);
    fillRect(map, 1, 10, 18, 10, TileType.Wall); // 縱向最多 4 格連續，放不下 6×6
    expect(countDisjointOpenSquares(map, 6)).toBe(0);
    expect(checkOpenAreas(map, profile({ density: 'dense' })).map(v => v.rule)).toContain('open-areas');
  });

  it('Boss 層另外要求一塊 8×8', () => {
    const map = blankMap(20, 15);
    fillRect(map, 1, 8, 18, 8, TileType.Wall); // 上半 7 格高、下半 5 格高 → 沒有 8×8
    expect(countDisjointOpenSquares(map, 6)).toBeGreaterThanOrEqual(1);
    expect(checkOpenAreas(map, profile({ density: 'sparse', isBossFloor: true })).map(v => v.rule))
      .toContain('boss-open-area');
  });
});

describe('checkDetourDistance', () => {
  it('緊湊地圖通過', () => {
    expect(checkDetourDistance(blankMap(20, 15))).toEqual([]);
  });

  it('大地圖的對角直線距離不會誤判（比例制而非絕對值）', () => {
    // 40×30 空地圖的對角直線距離就有 37 格，絕對上限 40 會讓大地圖幾乎不能放障礙
    expect(checkDetourDistance(blankMap(40, 30))).toEqual([]);
  });

  it('繞過單塊岩石的短距離繞行在寬容值內', () => {
    const map = blankMap(20, 15);
    fillRect(map, 8, 6, 10, 8, TileType.Rock);
    expect(checkDetourDistance(map)).toEqual([]);
  });

  it('蛇形長廊超過繞行上限', () => {
    const map = blankMap(40, 30, { spawnPoint: { x: 1, y: 1 } });
    fillRect(map, 1, 1, 38, 28, TileType.Wall);
    for (let y = 1; y <= 27; y += 2) fillRect(map, 1, y, 38, y, TileType.Ground);
    let connectAtRight = true;
    for (let y = 2; y <= 26; y += 2) {
      map.tiles[y][connectAtRight ? 38 : 1] = TileType.Ground;
      connectAtRight = !connectAtRight;
    }
    expect(checkDetourDistance(map).map(v => v.rule)).toEqual(['detour-distance']);
  });
});

describe('checkLowObstacleBypass', () => {
  it('小水塘不觸發檢查', () => {
    const map = blankMap(20, 15, { theme: 'swamp' });
    fillRect(map, 5, 5, 6, 7, TileType.Water); // 6 格 < 8
    expect(checkLowObstacleBypass(map)).toEqual([]);
  });

  it('大湖有繞行通道時通過', () => {
    const map = blankMap(20, 15, { theme: 'swamp' });
    fillRect(map, 5, 5, 8, 8, TileType.Water); // 16 格
    expect(checkLowObstacleBypass(map)).toEqual([]);
  });

  it('橫貫地圖的水域把兩側完全隔開', () => {
    const map = blankMap(20, 15, { theme: 'swamp' });
    fillRect(map, 1, 7, 18, 7, TileType.Water);
    const violations = checkLowObstacleBypass(map);
    expect(violations.map(v => v.rule)).toEqual(['low-obstacle-bypass']);
    expect(violations[0].message).toContain('完全隔開');
  });
});

describe('MAP_DESIGN_PROFILES', () => {
  it('涵蓋 50 張地圖', () => {
    expect(Object.keys(MAP_DESIGN_PROFILES)).toHaveLength(50);
  });

  it('每張正式地圖都有 profile，且主導地形在該 theme 的色盤內', async () => {
    clearMapCache();
    const maps = await loadAllMaps();
    expect(maps).toHaveLength(50);

    for (const map of maps) {
      const designProfile = getMapDesignProfile(map.id);
      expect(designProfile, `${map.id} 缺少 profile`).toBeDefined();
      const palette = THEME_TERRAIN_PALETTES[map.theme!];
      expect(palette, `${map.id} 的 theme "${map.theme}" 沒有色盤`).toBeDefined();
      expect(palette, `${map.id} 的主導地形 ${designProfile!.dominantTerrain} 不在色盤內`)
        .toContain(designProfile!.dominantTerrain);
    }
  });

  it('Boss 層一律為空曠密度', () => {
    const bossFloors = ['ivory-tower-5f', 'misty-cave-3f', 'underwater-prison-4f', 'dragon-valley-7f', 'ancient-dungeon-9f'];
    for (const id of bossFloors) {
      expect(MAP_DESIGN_PROFILES[id].isBossFloor, id).toBe(true);
      expect(MAP_DESIGN_PROFILES[id].density, id).toBe('sparse');
    }
    const marked = Object.entries(MAP_DESIGN_PROFILES)
      .filter(([, value]) => value.isBossFloor)
      .map(([id]) => id);
    expect(marked.sort()).toEqual([...bossFloors].sort());
  });

  it('所有目標可通行率都高於絕對下限', () => {
    for (const [id, designProfile] of Object.entries(MAP_DESIGN_PROFILES)) {
      expect(getTargetWalkableRatio(designProfile), id).toBeGreaterThanOrEqual(0.45);
    }
  });

  it('同主題的地圖不會在主導地形與密度上完全同質', async () => {
    clearMapCache();
    const maps = await loadAllMaps();
    const byTheme = new Map<MapTheme, string[]>();
    for (const map of maps) {
      const list = byTheme.get(map.theme!) ?? [];
      list.push(map.id);
      byTheme.set(map.theme!, list);
    }

    for (const [theme, ids] of byTheme) {
      if (ids.length < 2) continue;
      const signatures = ids.map(id => {
        const p = MAP_DESIGN_PROFILES[id];
        return `${p.density}/${p.dominantTerrain}`;
      });
      expect(new Set(signatures).size, `${theme} 的地圖個性完全同質`).toBe(signatures.length);
    }
  });
});
