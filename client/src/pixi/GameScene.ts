import { PixiApp } from './PixiApp';
import { FloorLayer } from './layers/FloorLayer';
import { FloorLayerGen2 } from './layers/FloorLayerGen2';
import { ObjectOutlineLayer } from './layers/ObjectOutlineLayer';
import { WallLayer } from './layers/WallLayer';
import { PathLayer } from './layers/PathLayer';
import { EntityLayer } from './layers/EntityLayer';
import { EffectLayer } from './layers/EffectLayer';
import { BACKGROUND_RENDER_GENERATION } from './backgroundRender';
import type { MapData } from '../models/mapControl';

export class GameScene {
  /** 依 `BACKGROUND_RENDER_GENERATION`：第一代 `FloorLayer`、第二代 `FloorLayerGen2` */
  public floorLayer: FloorLayer | FloorLayerGen2;
  /** 只有第二代背景 render 有 */
  public objectOutlineLayer: ObjectOutlineLayer | null;
  public wallLayer: WallLayer;
  public pathLayer: PathLayer;
  public entityLayer: EntityLayer;
  public effectLayer: EffectLayer;

  constructor(pixiApp: PixiApp) {
    const world = pixiApp.worldContainer;
    const gen2 = BACKGROUND_RENDER_GENERATION === 2;

    this.floorLayer = gen2 ? new FloorLayerGen2() : new FloorLayer();
    this.objectOutlineLayer = gen2 ? new ObjectOutlineLayer() : null;
    this.pathLayer = new PathLayer();
    this.entityLayer = new EntityLayer();
    this.wallLayer = new WallLayer();
    this.effectLayer = new EffectLayer();

    world.addChild(this.floorLayer.container);
    if (this.objectOutlineLayer) world.addChild(this.objectOutlineLayer.mergedContainer);
    world.addChild(this.pathLayer.container);
    // Walls and entities share the same sorted container for correct depth sorting
    world.addChild(this.entityLayer.container);
    world.addChild(this.effectLayer.container);
  }

  loadMap(mapData: MapData): void {
    if (this.floorLayer instanceof FloorLayerGen2) this.floorLayer.buildFromMap(mapData);
    else this.floorLayer.buildFromMap(mapData, this.entityLayer.container);
    this.objectOutlineLayer?.clear();
    this.wallLayer.buildInto(this.entityLayer.container, mapData);
    this.objectOutlineLayer?.build(this.entityLayer.container, this.wallLayer.objects);
    this.pathLayer.clear();
    this.effectLayer.clear();
  }

  /** 地板格線（`34-ui-guidelines.md` § 34.6）；第一代背景 render 格線固定顯示，不受影響 */
  setFloorGrid(visible: boolean): void {
    if (this.floorLayer instanceof FloorLayerGen2) this.floorLayer.setGridVisible(visible);
  }

  destroy(): void {
    this.floorLayer.destroy();
    this.objectOutlineLayer?.destroy();
    this.wallLayer.destroy();
    this.pathLayer.destroy();
    this.entityLayer.destroy();
    this.effectLayer.destroy();
  }
}
