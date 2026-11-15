import { Container, ImageSource, Rectangle, Sprite, Texture } from 'pixi.js';
import type { MapData } from '../../models/mapControl';
import { bakeMapAtlas, type AtlasCell } from '../gen3/mapAtlas';
import { planObjects, type ObjectName } from '../gen3/objectPlan';
import type { ThemeAssets } from '../gen3/themeAssets';
import { createWallPainter, drawStump, stumpBounds, wallBounds, type Ctx2D } from '../gen3/wallPaint';

/** 主題圖集的 Pixi 貼圖與各物件變體的 frame（同一份主題素材共用） */
const themeTextures = new WeakMap<ThemeAssets, Record<string, Texture[]>>();

function objectTextures(assets: ThemeAssets): Record<string, Texture[]> {
  let textures = themeTextures.get(assets);
  if (!textures) {
    const source = new ImageSource({ resource: assets.image });
    textures = Object.fromEntries(Object.entries(assets.objects).map(([name, sprites]) => [name, sprites.map(sprite =>
      new Texture({ source, frame: new Rectangle(sprite.x, sprite.y, sprite.width, sprite.height) }))]));
    themeTextures.set(assets, textures);
  }
  return textures;
}

/**
 * 第三代背景 render 的背景物（`38-map-control.md` § 38.9）：物件取主題圖集，
 * 牆塊與斷柱柱基畫進地圖專用圖集；全部放進 `EntityLayer` 依深度排序。
 */
export class ObjectLayerGen3 {
  private sprites: Sprite[] = [];
  private pageTextures: Texture[] = [];

  /** scale：地圖圖集的點陣像素 ÷ 世界像素 */
  buildInto(container: Container, mapData: MapData, assets: ThemeAssets, scale: number): void {
    this.removeFrom(container);
    const textures = objectTextures(assets);
    const painters = new Map<Ctx2D, ReturnType<typeof createWallPainter>>();
    const painterFor = (ctx: Ctx2D) => {
      let painter = painters.get(ctx);
      if (!painter) painters.set(ctx, painter = createWallPainter(ctx, assets.wallImages));
      return painter;
    };

    const cells: (AtlasCell & { depth: number })[] = [];
    for (const placement of planObjects(mapData, assets.sizes)) {
      switch (placement.kind) {
        case 'sprite': {
          const texture = textures[placement.name as ObjectName][placement.variant];
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5, 1);
          sprite.position.set(placement.sx, placement.sy);
          sprite.scale.set(placement.flip * placement.width / texture.width, placement.height / texture.height);
          sprite.zIndex = placement.depth;
          this.add(container, sprite);
          break;
        }
        case 'wall': {
          const { x, y, isBlockAt } = placement;
          cells.push({ rect: wallBounds(x, y), depth: placement.depth, draw: ctx => painterFor(ctx)(x, y, isBlockAt) });
          break;
        }
        case 'stump': {
          const { x, y } = placement;
          const source = assets.objects.pillar[placement.variant];
          cells.push({ rect: stumpBounds(source, x, y), depth: placement.depth, draw: ctx => drawStump(ctx, source, x, y) });
          break;
        }
      }
    }

    const { pages, cells: packed } = bakeMapAtlas(cells, scale);
    this.pageTextures = pages.map(page => new Texture({ source: new ImageSource({ resource: page }) }));
    cells.forEach(({ rect, depth }, i) => {
      const cell = packed[i];
      const sprite = new Sprite(new Texture({
        source: this.pageTextures[cell.page].source,
        frame: new Rectangle(cell.x, cell.y, cell.width, cell.height),
      }));
      sprite.position.set(rect.x, rect.y);
      sprite.scale.set(1 / scale);
      sprite.zIndex = depth;
      this.add(container, sprite);
    });
  }

  removeFrom(container: Container): void {
    for (const sprite of this.sprites) {
      container.removeChild(sprite);
      sprite.destroy();
    }
    this.sprites = [];
    for (const texture of this.pageTextures) texture.destroy(true);
    this.pageTextures = [];
  }

  private add(container: Container, sprite: Sprite): void {
    this.sprites.push(sprite);
    container.addChild(sprite);
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites = [];
    for (const texture of this.pageTextures) texture.destroy(true);
    this.pageTextures = [];
  }
}
