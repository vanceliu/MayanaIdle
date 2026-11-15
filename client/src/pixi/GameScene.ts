import { PixiApp } from './PixiApp';
import { FloorLayerGen2 } from './layers/FloorLayerGen2';
import { FloorLayerGen3 } from './layers/FloorLayerGen3';
import { ObjectLayerGen3 } from './layers/ObjectLayerGen3';
import { ObjectOutlineLayer } from './layers/ObjectOutlineLayer';
import { WallLayer } from './layers/WallLayer';
import { PathLayer } from './layers/PathLayer';
import { EntityLayer } from './layers/EntityLayer';
import { EffectLayer } from './layers/EffectLayer';
import type { BackgroundRenderGeneration } from './backgroundRender';
import { floorBounds } from './gen3/floorBake';
import { FloorBakeAbortedError, bakeFloorAsync, disposeFloorBakeWorker } from './gen3/floorBakeClient';
import { hasThemeAssets, loadThemeAssets } from './gen3/themeAssets';
import { ASSET_SCALE } from '../../scripts/comfy/tileSpec.mjs';
import type { MapData } from '../models/mapControl';

/** 依畫面版本組裝的背景（`38-map-control.md` § 38.9「背景 render 代別」） */
type Background =
  | { generation: 2; floor: FloorLayerGen2; outline: ObjectOutlineLayer; walls: WallLayer }
  | { generation: 3; floor: FloorLayerGen3; objects: ObjectLayerGen3 };

export class GameScene {
  public pathLayer: PathLayer;
  public entityLayer: EntityLayer;
  public effectLayer: EffectLayer;
  private background: Background;
  private readonly world: PixiApp['worldContainer'];
  private currentMap: MapData | null = null;
  private floorGridVisible = false;
  /** 第三代烘焙倍率：renderer resolution，上限 ASSET_SCALE */
  private readonly bakeScale: number;
  /** 每次 loadMap 遞增；非同步結果回來時不符即丟棄 */
  private mapToken = 0;

  constructor(pixiApp: PixiApp, generation: BackgroundRenderGeneration) {
    const world = pixiApp.worldContainer;
    this.world = world;
    this.bakeScale = Math.min(ASSET_SCALE, pixiApp.app.renderer.resolution);

    this.background = createBackground(generation);
    this.pathLayer = new PathLayer();
    this.entityLayer = new EntityLayer();
    this.effectLayer = new EffectLayer();

    this.attachBackground();
    world.addChild(this.pathLayer.container);
    // Walls and entities share the same sorted container for correct depth sorting
    world.addChild(this.entityLayer.container);
    world.addChild(this.effectLayer.container);
  }

  get generation(): BackgroundRenderGeneration {
    return this.background.generation;
  }

  loadMap(mapData: MapData): void {
    this.currentMap = mapData;
    this.buildBackground(mapData);
    this.pathLayer.clear();
    this.effectLayer.clear();
  }

  /** 換畫面版本（`34-ui-guidelines.md` § 34.6「畫面版本」）：拆掉舊背景、在目前地圖建新背景，實體與特效不動 */
  setGeneration(generation: BackgroundRenderGeneration): void {
    if (generation === this.background.generation) return;
    this.mapToken++;
    this.destroyBackground();
    this.background = createBackground(generation);
    this.attachBackground();
    this.background.floor.setGridVisible(this.floorGridVisible);
    if (this.currentMap) this.buildBackground(this.currentMap);
  }

  /** 地板與背景物：地板在世界最底層，第二代合併外框層緊接其上；背景物放進實體層 */
  private attachBackground(): void {
    this.world.addChildAt(this.background.floor.container, 0);
    if (this.background.generation === 2) this.world.addChildAt(this.background.outline.mergedContainer, 1);
  }

  private buildBackground(mapData: MapData): void {
    const token = ++this.mapToken;
    const background = this.background;
    if (background.generation === 2) {
      background.floor.buildFromMap(mapData);
      background.outline.clear();
      background.walls.buildInto(this.entityLayer.container, mapData);
      background.outline.build(this.entityLayer.container, background.walls.objects);
    } else {
      this.loadGen3(background, mapData, token);
    }
  }

  /** 先顯示底色；主題素材與烘焙完成後換上（`38-map-control.md` § 38.9「第三代實作限制」） */
  private loadGen3(background: Extract<Background, { generation: 3 }>, mapData: MapData, token: number): void {
    background.floor.showPlaceholder(mapData);
    background.objects.removeFrom(this.entityLayer.container);
    const theme = mapData.theme ?? 'grassland';
    if (!hasThemeAssets(theme)) return;
    const bounds = floorBounds(mapData);
    const current = () => token === this.mapToken;
    loadThemeAssets(theme)
      .then(assets => {
        if (!current()) return;
        background.objects.buildInto(this.entityLayer.container, mapData, assets, this.bakeScale);
        return bakeFloorAsync(mapData, assets.floorTextures, bounds, this.bakeScale).then(raster => {
          if (current()) background.floor.setBaked(raster, bounds, this.bakeScale);
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof FloorBakeAbortedError)) console.warn('[背景] 第三代素材載入失敗', error);
      });
  }

  /** 地板格線（`34-ui-guidelines.md` § 34.6） */
  setFloorGrid(visible: boolean): void {
    this.floorGridVisible = visible;
    this.background.floor.setGridVisible(visible);
  }

  private destroyBackground(): void {
    const background = this.background;
    background.floor.destroy();
    if (background.generation === 2) {
      background.outline.destroy();
      background.walls.destroy();
    } else {
      disposeFloorBakeWorker();
      background.objects.destroy();
    }
  }

  destroy(): void {
    this.mapToken++;
    this.destroyBackground();
    this.pathLayer.destroy();
    this.entityLayer.destroy();
    this.effectLayer.destroy();
  }
}

function createBackground(generation: BackgroundRenderGeneration): Background {
  return generation === 3
    ? { generation: 3, floor: new FloorLayerGen3(), objects: new ObjectLayerGen3() }
    : { generation: 2, floor: new FloorLayerGen2(), outline: new ObjectOutlineLayer(), walls: new WallLayer() };
}
