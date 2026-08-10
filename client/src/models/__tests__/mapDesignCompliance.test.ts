import { describe, it, expect, beforeAll } from 'vitest';
import { TILE_DEFINITIONS, type MapData } from '../mapControl';
import { loadAllMaps, clearMapCache } from '../mapDataControl';
import {
  MAP_DESIGN_PROFILES,
  formatViolations,
  getTerrainStats,
  validateMapSafety,
  isDesignRegulatedMap,
} from '../mapDesignRules';

/**
 * 全地圖合規測試：50 張正式地圖都必須符合 38-map-control.md § 38.11、§ 38.12。
 *
 * 地圖逐張手繪（不使用生成器，見 § 38.12「產出方式」）。
 * 這支測試就是防止手改地圖或改動設計規則時退化的閘門；
 * 逐格定位違規用 `npx vite-node scripts/inspectMap.mts <mapId>`。
 */
describe('全地圖設計規範合規', () => {
  let allMaps: MapData[];
  let maps: MapData[];
  let townMaps: MapData[];

  beforeAll(async () => {
    clearMapCache();
    allMaps = await loadAllMaps();
    // 城鎮是安全區、試驗場是空地，§ 38.12 的密度／叢聚／生怪規範是為野外戰鬥訂的，
    // 兩者都不適用（§ 13.2.1、`50-training-ground.md` § 50.3）
    townMaps = allMaps.filter(map => map.theme === 'town');
    maps = allMaps.filter(isDesignRegulatedMap);
  });

  it('地圖數量與 profile 指派一致（城鎮與試驗場不進 profile）', () => {
    expect(maps).toHaveLength(Object.keys(MAP_DESIGN_PROFILES).length);
    for (const unregulated of allMaps.filter(map => !isDesignRegulatedMap(map))) {
      expect(MAP_DESIGN_PROFILES[unregulated.id as keyof typeof MAP_DESIGN_PROFILES]).toBeUndefined();
    }
  });

  it('城鎮地圖：NPC 有實體，站的格子擋路（載入驗證已擋，這裡再守一次）', () => {
    expect(townMaps.length).toBeGreaterThan(0);
    for (const town of townMaps) {
      expect(town.npcs?.length, `${town.id} 必須有 NPC`).toBeGreaterThan(0);
      for (const npc of town.npcs!) {
        const tile = town.tiles[npc.y][npc.x];
        expect(TILE_DEFINITIONS[tile as keyof typeof TILE_DEFINITIONS].walkable, `${town.id} 的 ${npc.name}`).toBe(false);
      }
    }
  });

  // checkDetourDistance 對每張圖做 all-pairs BFS，50 張跑下來單獨約 4 秒、
  // 與其他測試併行時可到 8 秒，會撞到 vitest 預設的 5 秒上限。
  it('每張地圖都符合設計規範', () => {
    const failures: string[] = [];
    for (const map of maps) {
      const violations = validateMapSafety(map);
      if (violations.length > 0) failures.push(formatViolations(map.id, violations));
    }
    expect(failures.join('\n\n')).toBe('');
  }, 30_000);

  it('地圖尺寸維持在三種規格內，且不超過上限 40×30', () => {
    const allowed = new Set(['20x15', '30x20', '40x30']);
    for (const map of maps) {
      expect(allowed.has(`${map.width}x${map.height}`), `${map.id} 尺寸 ${map.width}×${map.height}`).toBe(true);
    }
  });

  it('地圖之間確實有落差，不是平均分配地形', () => {
    const ratios = maps.map(map => getTerrainStats(map).walkableRatio);
    const spread = Math.max(...ratios) - Math.min(...ratios);
    // 最空曠的 dawn-plains 與最密的極密層之間應該有明顯差距
    expect(spread).toBeGreaterThan(0.3);
  });

  it('代表性地圖的地貌可辨識', () => {
    const byId = new Map(maps.map(map => [map.id, map]));
    const plains = getTerrainStats(byId.get('dawn-plains')!);
    const forest = getTerrainStats(byId.get('demon-forest')!);

    expect(plains.walkableRatio).toBeGreaterThan(0.9);  // 近乎純平原
    expect(forest.walkableRatio).toBeLessThan(0.68);    // 密不透風的樹林
  });
});
