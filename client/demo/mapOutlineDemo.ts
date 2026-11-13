/**
 * 背景 render 調校頁（`38-map-control.md` § 38.9）。
 *
 * 繪製本體都在 `client/src/pixi/`：第一代＝`FloorLayer` / `WallLayer`，
 * 第二代＝`FloorLayerGen2` / `ObjectOutlineLayer` / `MonsterEntity` 的外框參數。
 * 本頁只把滑桿值組成 `Gen2Style` 傳進去；遊戲採用的值是 `GEN2_STYLE`。
 */
import { Application, Container } from 'pixi.js';
import { DEFAULT_LASH } from '../src/models/appearance';
import { getTileDefinition, type MapData, type MapTheme } from '../src/models/mapControl';
import { GEN2_STYLE, type Gen2Style } from '../src/pixi/backgroundRender';
import { MAP_THEME_PALETTES } from '../src/pixi/mapThemes';
import { FloorLayer } from '../src/pixi/layers/FloorLayer';
import { FloorLayerGen2 } from '../src/pixi/layers/FloorLayerGen2';
import { ObjectOutlineLayer } from '../src/pixi/layers/ObjectOutlineLayer';
import { WallLayer, tileVariance } from '../src/pixi/layers/WallLayer';
import { MonsterEntity } from '../src/pixi/entities/MonsterEntity';
import { resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import type { PawnLook } from '../src/pixi/entities/pawn/drawPawn';
import { PawnSprite } from '../src/pixi/entities/pawn/PawnSprite';
import { worldToScreen } from '../src/pixi/utils/isometric';

const mapModules = import.meta.glob<MapData>('../src/maps/*.json', { import: 'default' });

export const MAP_IDS: string[] = Object.keys(mapModules)
  .map(path => path.slice(path.lastIndexOf('/') + 1, -5))
  .sort();

export const THEMES = Object.keys(MAP_THEME_PALETTES) as MapTheme[];

export async function loadMap(id: string): Promise<MapData> {
  const key = Object.keys(mapModules).find(path => path.endsWith(`/${id}.json`));
  if (!key) throw new Error(`map not found: ${id}`);
  return await mapModules[key]();
}

export interface MapOutlineParams {
  /** 顯示第一代背景 render */
  showGen1: boolean;
  showActors: boolean;
  /** 第二代地板格線（遊戲內由設定切換） */
  floorGrid: boolean;
  outlineColor: string;
  objectOutlineWidth: number;
  hpBarOutlineWidth: number;
  terrainEdgeWidth: number;
  terrainEdgeAlpha: number;
}

export const DEFAULT_PARAMS: MapOutlineParams = {
  showGen1: false,
  showActors: true,
  floorGrid: false,
  outlineColor: `#${GEN2_STYLE.outlineColor.toString(16).padStart(6, '0')}`,
  objectOutlineWidth: GEN2_STYLE.objectOutlineWidth,
  hpBarOutlineWidth: GEN2_STYLE.hpBarOutlineWidth,
  terrainEdgeWidth: GEN2_STYLE.terrainEdgeWidth,
  terrainEdgeAlpha: GEN2_STYLE.terrainEdgeAlpha,
};

const DEMO_LOOK: PawnLook = {
  hair: 'twin',
  skin: '#e3b585',
  hairColor: '#6b4fa0',
  eyeColor: '#3a2f4a',
  cloth: '#8b6fc4',
  eyes: 'dots',
  lash: { ...DEFAULT_LASH, on: 1 },
  cap: resolveCapCfg('twin', undefined),
};

export class MapOutlineStage {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly floor = new Container();
  private readonly merged = new Container();
  private readonly sorted = new Container();
  private floorLayer: FloorLayer | FloorLayerGen2 | null = null;
  private outlineLayer: ObjectOutlineLayer | null = null;
  private wallLayer: WallLayer | null = null;
  private actors: { destroy(): void }[] = [];
  private map: MapData | null = null;
  private drag: { x: number; y: number } | null = null;
  params: MapOutlineParams = { ...DEFAULT_PARAMS };

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await this.app.init({
      canvas,
      width,
      height,
      background: 0x1a1a2e,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.sorted.sortableChildren = true;
    this.world.addChild(this.floor, this.merged, this.sorted);
    this.app.stage.addChild(this.world);

    canvas.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, y: e.clientY }; });
    window.addEventListener('pointerup', () => { this.drag = null; });
    window.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.world.x += e.clientX - this.drag.x;
      this.world.y += e.clientY - this.drag.y;
      this.drag = { x: e.clientX, y: e.clientY };
    });
  }

  setMap(map: MapData): void {
    this.map = map;
    this.apply();
    this.center();
  }

  layout(width: number, height: number, zoom: number): void {
    this.app.renderer.resize(width, height);
    this.world.scale.set(zoom);
    this.center();
  }

  center(): void {
    if (!this.map) return;
    const mid = worldToScreen((this.map.width - 1) / 2, (this.map.height - 1) / 2);
    const z = this.world.scale.x;
    this.world.x = this.app.screen.width / 2 - mid.sx * z;
    this.world.y = this.app.screen.height / 2 - mid.sy * z;
  }

  get style(): Gen2Style {
    const p = this.params;
    return {
      outlineColor: Number.parseInt(p.outlineColor.slice(1), 16),
      objectOutlineWidth: p.objectOutlineWidth,
      hpBarOutlineWidth: p.hpBarOutlineWidth,
      terrainEdgeWidth: p.terrainEdgeWidth,
      terrainEdgeAlpha: p.terrainEdgeAlpha,
    };
  }

  /** 與 `GameScene` 相同的組裝順序 */
  apply(): void {
    const map = this.map;
    if (!map) return;
    this.clear();
    const style = this.params.showGen1 ? null : this.style;

    if (style) {
      const floor = new FloorLayerGen2(style);
      floor.setGridVisible(this.params.floorGrid);
      floor.buildFromMap(map);
      this.floorLayer = floor;
      this.outlineLayer = new ObjectOutlineLayer(style);
      this.merged.addChild(this.outlineLayer.mergedContainer);
    } else {
      const floor = new FloorLayer();
      floor.buildFromMap(map);
      this.floorLayer = floor;
    }
    this.floor.addChild(this.floorLayer.container);

    this.wallLayer = new WallLayer();
    this.wallLayer.buildInto(this.sorted, map);
    this.outlineLayer?.build(this.sorted, this.wallLayer.objects);

    if (this.params.showActors) this.placeActors(map, style);
  }

  exportJson(): string {
    const { showGen1: _, showActors: __, floorGrid: ___, ...rest } = this.params;
    return JSON.stringify(rest, null, 2);
  }

  private clear(): void {
    for (const actor of this.actors) actor.destroy();
    this.actors = [];
    this.outlineLayer?.destroy();
    this.outlineLayer = null;
    this.wallLayer?.destroy();
    this.wallLayer = null;
    this.floorLayer?.destroy();
    this.floorLayer = null;
    this.merged.removeChildren();
    this.floor.removeChildren();
    this.sorted.removeChildren();
  }

  private placeActors(map: MapData, style: Gen2Style | null): void {
    const player = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    const { sx, sy } = worldToScreen(map.spawnPoint.x, map.spawnPoint.y);
    player.container.position.set(sx, sy);
    player.container.zIndex = map.spawnPoint.x + map.spawnPoint.y + 0.5;
    this.sorted.addChild(player.container);
    this.actors.push({ destroy: () => player.container.destroy({ children: true }) });

    const spots: { x: number; y: number }[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (getTileDefinition(map.tiles[y][x])?.spawnable && tileVariance(x, y, 999) < 0.03) spots.push({ x, y });
      }
    }
    spots.slice(0, 12).forEach((spot, i) => {
      const monster = new MonsterEntity(`demo-${i}`, i === 0, i % 4 === 1 ? 'large' : 'small', style);
      monster.updatePosition(spot);
      monster.updateHp(3 + (i % 5), 8);
      this.sorted.addChild(monster.container);
      this.actors.push(monster);
    });
  }
}
