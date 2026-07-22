import { Container } from 'pixi.js';
import { PixiApp } from './PixiApp';
import { FloorLayer } from './layers/FloorLayer';
import { WallLayer } from './layers/WallLayer';
import { PathLayer } from './layers/PathLayer';
import { EntityLayer } from './layers/EntityLayer';
import { EffectLayer } from './layers/EffectLayer';
import type { MapData } from '../models/mapControl';

export class GameScene {
  private pixiApp: PixiApp;
  public floorLayer: FloorLayer;
  public wallLayer: WallLayer;
  public pathLayer: PathLayer;
  public entityLayer: EntityLayer;
  public effectLayer: EffectLayer;

  constructor(pixiApp: PixiApp) {
    this.pixiApp = pixiApp;
    const world = pixiApp.worldContainer;

    this.floorLayer = new FloorLayer();
    this.pathLayer = new PathLayer();
    this.entityLayer = new EntityLayer();
    this.wallLayer = new WallLayer();
    this.effectLayer = new EffectLayer();

    world.addChild(this.floorLayer.container);
    world.addChild(this.pathLayer.container);
    // Walls and entities share the same sorted container for correct depth sorting
    world.addChild(this.entityLayer.container);
    world.addChild(this.effectLayer.container);
  }

  loadMap(mapData: MapData): void {
    this.floorLayer.buildFromMap(mapData);
    this.wallLayer.buildInto(this.entityLayer.container, mapData);
    this.pathLayer.clear();
    this.effectLayer.clear();
  }

  destroy(): void {
    this.floorLayer.destroy();
    this.wallLayer.destroy();
    this.pathLayer.destroy();
    this.entityLayer.destroy();
    this.effectLayer.destroy();
  }
}
