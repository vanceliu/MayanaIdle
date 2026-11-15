/** 第三代背景 render 物件配置（`38-map-control.md` § 38.9「素材來源」） */
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { ASSET_SCALE } from '../../../../scripts/comfy/tileSpec.mjs';
import { byObjectName, planObjects, type ObjectSizes, type SpritePlacement } from '../objectPlan';

const { Ground: G, Boundary: B, Wall: W, Tree: T, Pillar: P, Grass: S } = TileType;

const testMap: MapData = {
  id: 'gen3-plan', name: 'Gen3 Plan', width: 7, height: 5, theme: 'grassland',
  spawnPoint: { x: 1, y: 1 },
  tiles: [
    [B, B, B, B, B, B, B],
    [B, G, T, G, P, P, B],
    [B, S, G, W, G, G, B],
    [B, G, G, W, G, G, B],
    [B, B, B, B, B, B, B],
  ],
};

const size = (width: number, height: number) => ({ width, height });
const sizes = (wallRocks = 0): ObjectSizes => byObjectName(name => (name === 'wall-rock'
  ? Array.from({ length: wallRocks }, () => size(140, 80))
  : [size(80, 100), size(90, 110), size(70, 90)]));

describe('planObjects', () => {
  it('同一張圖結果固定，依深度由後往前排', () => {
    const first = planObjects(testMap, sizes()).map(({ kind, depth }) => ({ kind, depth }));
    const second = planObjects(testMap, sizes()).map(({ kind, depth }) => ({ kind, depth }));
    expect(second).toEqual(first);
    expect(first.map(p => p.depth)).toEqual([...first.map(p => p.depth)].sort((a, b) => a - b));
  });

  it('無岩塊素材的主題：邊界與內牆全是立體塊，鄰格判斷含牆與邊界', () => {
    const walls = planObjects(testMap, sizes()).filter(p => p.kind === 'wall');
    expect(walls).toHaveLength(22);
    const inner = walls.find(p => p.x === 3 && p.y === 2)!;
    expect(inner.isBlockAt(0, 1)).toBe(true);
    expect(inner.isBlockAt(1, 0)).toBe(false);
    expect(inner.depth).toBe(5);
  });

  it('有岩塊素材的主題：邊界仍是立體塊，非砌石內牆改放岩塊', () => {
    const plan = planObjects(testMap, sizes(6));
    const innerWalls = plan.filter(p => p.kind === 'wall' && p.x === 3 && (p.y === 2 || p.y === 3));
    const rocks = plan.filter((p): p is SpritePlacement => p.kind === 'sprite' && p.name === 'wall-rock');
    expect(plan.filter(p => p.kind === 'wall')).toHaveLength(20 + innerWalls.length);
    expect(innerWalls.length + rocks.length).toBe(2);
  });

  it('樹的寬高 = 素材尺寸 ÷ ASSET_SCALE × 縮放（0.85～1.15）', () => {
    const tree = planObjects(testMap, sizes()).find((p): p is SpritePlacement => p.kind === 'sprite' && p.name === 'tree')!;
    const source = sizes().tree[tree.variant];
    const scale = tree.width / (source.width / ASSET_SCALE);
    expect(scale).toBeGreaterThanOrEqual(0.85);
    expect(scale).toBeLessThanOrEqual(1.15);
    expect(tree.height).toBeCloseTo(source.height / ASSET_SCALE * scale);
  });

  it('成對石柱：一格柱基、一格碎塊', () => {
    const plan = planObjects(testMap, sizes());
    const stumps = plan.filter(p => p.kind === 'stump');
    const rubble = plan.filter((p): p is SpritePlacement => p.kind === 'sprite' && p.name === 'rubble');
    expect(stumps).toHaveLength(1);
    expect(rubble).toHaveLength(1);
    expect(stumps[0].depth + rubble[0].depth).toBeCloseTo(5 + 6, 0);
  });

  it('草叢格放 3～5 株小草；缺素材的物件不放', () => {
    const tufts = planObjects(testMap, sizes()).filter(p => p.kind === 'sprite' && p.name === 'tuft');
    expect(tufts.length).toBeGreaterThanOrEqual(3);
    expect(tufts.length).toBeLessThanOrEqual(5);
    const noTrees = { ...sizes(), tree: [] };
    expect(planObjects(testMap, noTrees).some(p => p.kind === 'sprite' && p.name === 'tree')).toBe(false);
  });
});
