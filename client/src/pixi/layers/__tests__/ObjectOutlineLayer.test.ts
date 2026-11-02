/** 第二代背景 render 的背景物外框（`38-map-control.md` § 38.9） */
import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { TileType, type MapData } from '../../../models/mapControl';
import { OUTLINE_DEPTH_BIAS, ObjectOutlineLayer } from '../ObjectOutlineLayer';
import { WallLayer } from '../WallLayer';

const { Ground: G, Boundary: B, Wall: W, Tree: T, Rock: R } = TileType;

const testMap: MapData = {
  id: 'outline', name: 'Outline', width: 5, height: 4, theme: 'forest',
  spawnPoint: { x: 1, y: 1 },
  tiles: [
    [B, B, B, B, B],
    [B, G, T, W, B],
    [B, G, G, R, B],
    [B, B, B, B, B],
  ],
};

function build() {
  const entities = new Container();
  const unrelated = new Graphics();
  entities.addChild(unrelated);
  const walls = new WallLayer();
  walls.buildInto(entities, testMap);
  const outlines = new ObjectOutlineLayer();
  outlines.build(entities, walls.objects);
  return { entities, unrelated, walls, outlines };
}

describe('ObjectOutlineLayer', () => {
  it('牆與邊界的外框放進合併層，其餘物件的外框放進 EntityLayer', () => {
    const { entities, walls, outlines } = build();
    const mergedCount = walls.objects.filter(o => o.role === 'wall' || o.role === 'boundary').length;
    expect(mergedCount).toBe(15);
    expect(outlines.mergedContainer.children).toHaveLength(mergedCount);
    // 1 個無關物件 + 17 個物件本體 + 樹與岩石各 1 個外框
    expect(entities.children).toHaveLength(1 + walls.objects.length + 2);
  });

  it('物件外框的深度略小於本體，畫在本體之下', () => {
    const { entities, walls } = build();
    const tree = walls.objects.find(o => o.role === 'tree')!.graphic;
    const outline = entities.children.find(c => c !== tree && c.zIndex === tree.zIndex - OUTLINE_DEPTH_BIAS);
    expect(outline).toBeDefined();
    expect(outline!.children).toHaveLength(8);
  });

  it('剪影共用本體的 GraphicsContext', () => {
    const { walls, outlines } = build();
    const wall = walls.objects.find(o => o.role === 'wall')!.graphic;
    const contexts = outlines.mergedContainer.children.flatMap(c => c.children.map(s => (s as Graphics).context));
    expect(contexts).toContain(wall.context);
  });

  it('清除只移除外框，不動其他實體', () => {
    const { entities, unrelated, walls, outlines } = build();
    outlines.clear();
    expect(outlines.mergedContainer.children).toHaveLength(0);
    expect(entities.children).toHaveLength(1 + walls.objects.length);
    expect(entities.children).toContain(unrelated);
  });

  it('重建地圖不累積外框', () => {
    const { entities, walls, outlines } = build();
    outlines.clear();
    walls.buildInto(entities, testMap);
    outlines.build(entities, walls.objects);
    expect(entities.children).toHaveLength(1 + walls.objects.length + 2);
    expect(outlines.mergedContainer.children).toHaveLength(15);
  });
});
