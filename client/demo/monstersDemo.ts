/**
 * AI 怪物美術調校頁（`25-monster-system.md` § 25.2.2）。
 *
 * 素材直接讀 `assets-src/monsters/`（`scripts/comfy/genMonsters.mjs` 產出）；朝向、縮放用 `src/pixi/entities/monster/monsterArt.ts`，
 * 外框依顯示大小烤成貼圖（`artOutline.ts`）。
 * 上方：每隻怪物的四方向（正面、右、背面、左）；下方：怪物在玩家周圍遊走（實際比例）。
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { MONSTER_JOBS } from '../scripts/comfy/monsterJobs.mjs';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import { DEFAULT_LASH } from '../src/models/appearance';
import type { MonsterSize } from '../src/models/monster';
import { MONSTER_RADIUS } from '../src/pixi/entities/MonsterEntity';
import { bakeOutlinedCanvas, outlinedArtLayout, type OutlinedArtLayout } from '../src/pixi/entities/monster/artOutline';
import { MONSTER_ART_SIZE_RATIO, MONSTER_VIEW_BY_DIRECTION, monsterArtScale, monsterArtSize, monsterShadowRadius, type MonsterView } from '../src/pixi/entities/monster/monsterArt';
import type { PawnLook } from '../src/pixi/entities/pawn/drawPawn';
import { facingFromDelta } from '../src/pixi/entities/pawn/facing';
import type { PawnDirectionId } from '../src/pixi/entities/pawn/geometry';
import { resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import { PawnSprite } from '../src/pixi/entities/pawn/PawnSprite';
import { TILE_H, TILE_W, worldToScreen } from '../src/pixi/utils/isometric';

const spriteUrls = import.meta.glob<string>('../assets-src/monsters/*.png', { eager: true, query: '?url', import: 'default' });
const URL_BY_NAME = new Map(Object.entries(spriteUrls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

export interface MonsterArtParams {
  /** 裁腿版或未裁腿版 */
  trimmed: boolean;
  /** 三視圖中最高的一張的高度 = 怪物球直徑 × 倍率（小型／大型各一） */
  sizeRatioSmall: number;
  sizeRatioLarge: number;
  /** 最寬的一張超過這個寬度（格）時整體縮小 */
  maxWidthTiles: number;
  shadow: boolean;
  /** 影子寬度 = 當下朝向的顯示寬度 × shadowWidth */
  shadowWidth: number;
  shadowAlpha: number;
  /** 旁邊畫現行的怪物球對照 */
  showBall: boolean;
  /** 外框寬（世界像素），大小怪一致 */
  outlinePx: number;
}

export const DEFAULT_PARAMS: MonsterArtParams = {
  trimmed: false,
  sizeRatioSmall: MONSTER_ART_SIZE_RATIO.small,
  sizeRatioLarge: MONSTER_ART_SIZE_RATIO.large,
  maxWidthTiles: 1,
  shadow: true,
  shadowWidth: 0.8,
  shadowAlpha: 0.3,
  showBall: false,
  outlinePx: 1,
};

const DIRECTIONS: PawnDirectionId[] = ['front', 'right', 'back', 'left'];
const VIEWS: MonsterView[] = ['front', 'side', 'back'];
const MONSTER_COLOR = 0xff6b6b;
const GROUND_COLOR = 0x6f8a4a;
const GRID_COLOR = 0x587038;
const FIELD = 8;
const WALK_SPEED = 1.6;

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

type ArtSet = 'trimmed' | 'full';

interface MonsterArt {
  key: string;
  group: string;
  name: string;
  size: MonsterSize;
  images: Record<ArtSet, Record<MonsterView, HTMLImageElement>>;
}

interface OutlinedTexture {
  texture: Texture;
  layout: OutlinedArtLayout;
}

/** 依顯示縮放與外框寬烤出的貼圖，參數不變時重用 */
class OutlineCache {
  private readonly entries = new Map<string, OutlinedTexture>();

  get(art: MonsterArt, set: ArtSet, view: MonsterView, scale: number, outlinePx: number): OutlinedTexture {
    const id = `${art.key}|${set}|${view}|${scale}|${outlinePx}`;
    let entry = this.entries.get(id);
    if (!entry) {
      entry = bakeOutlined(art.images[set][view], scale, outlinePx);
      this.entries.set(id, entry);
    }
    return entry;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.texture.destroy(true);
    this.entries.clear();
  }
}

function bakeOutlined(image: HTMLImageElement, scale: number, outlinePx: number): OutlinedTexture {
  const layout = outlinedArtLayout(image, scale, outlinePx);
  return { texture: Texture.from(bakeOutlinedCanvas(image, layout, () => document.createElement('canvas'))), layout };
}

/** 一隻怪物的顯示：影子、對照球、sprite；朝向由外部設定 */
class ArtActor {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly ball = new Graphics();
  private readonly sprite = new Sprite();
  private readonly art: MonsterArt;
  private readonly outlines: OutlineCache;
  facing: PawnDirectionId = 'front';

  constructor(art: MonsterArt, outlines: OutlineCache) {
    this.art = art;
    this.outlines = outlines;
    this.container.addChild(this.shadow, this.ball, this.sprite);
  }

  apply(params: MonsterArtParams): void {
    const r = MONSTER_RADIUS[this.art.size];
    this.ball.clear();
    if (params.showBall) this.ball.circle(-TILE_W * 0.6, -r, r).fill({ color: MONSTER_COLOR }).stroke({ color: 0x000000, width: 1.5 });

    const setName: ArtSet = params.trimmed ? 'trimmed' : 'full';
    const set = this.art.images[setName];
    const { view, mirrored } = MONSTER_VIEW_BY_DIRECTION[this.facing];
    const ratio = this.art.size === 'large' ? params.sizeRatioLarge : params.sizeRatioSmall;
    const scale = monsterArtScale(VIEWS.map(v => set[v]), monsterArtSize(this.art.size, ratio), TILE_W * params.maxWidthTiles);
    const { texture, layout } = this.outlines.get(this.art, setName, view, scale, params.outlinePx);
    this.sprite.texture = texture;
    this.sprite.anchor.set(layout.anchorX, layout.anchorY);
    this.sprite.scale.set(mirrored ? -layout.spriteScale : layout.spriteScale, layout.spriteScale);

    this.shadow.clear();
    if (params.shadow) {
      const { rx, ry } = monsterShadowRadius(set[view].width * scale, params.shadowWidth);
      this.shadow.ellipse(0, 0, rx, ry).fill({ color: 0x000000, alpha: params.shadowAlpha });
    }
  }
}

interface Walker {
  actor: ArtActor;
  x: number;
  y: number;
  tx: number;
  ty: number;
  waitMs: number;
}

export class MonsterArtStage {
  private readonly app = new Application();
  private canvas!: HTMLCanvasElement;
  private readonly world = new Container();
  private arts: MonsterArt[] = [];
  private lineup: ArtActor[] = [];
  private walkers: Walker[] = [];
  private fieldOrigin = { x: 0, y: 0 };
  private readonly outlines = new OutlineCache();
  params: MonsterArtParams = { ...DEFAULT_PARAMS };

  async init(canvas: HTMLCanvasElement, width: number): Promise<void> {
    this.canvas = canvas;
    await this.app.init({
      canvas,
      width,
      height: 600,
      background: 0x1c2b1c,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.app.stage.addChild(this.world);
    this.arts = await loadArts();
    this.app.ticker.add(ticker => this.tick(ticker.deltaMS));
  }

  /** 產圖批次（`MONSTER_JOBS` 的 group，依清單順序） */
  get groups(): string[] {
    return [...new Set(this.arts.map(art => art.group))];
  }

  /** 換成指定批次的怪物 */
  show(group: string, width: number, zoom: number): void {
    for (const child of this.world.removeChildren()) child.destroy({ children: true });
    this.lineup = [];
    this.walkers = [];
    const arts = this.arts.filter(art => art.group === group);
    this.buildLineup(arts);
    this.buildField(arts);
    this.apply();
    this.layout(width, zoom);
  }

  private buildLineup(arts: MonsterArt[]): void {
    const step = TILE_W * 0.85, cellW = step * 4 + TILE_W * 0.5, cellH = 84, perRow = 2;
    arts.forEach((art, i) => {
      const cx = (i % perRow) * cellW, cy = Math.floor(i / perRow) * cellH;
      const label = new Text({ text: art.name, style: { fill: 0xe8e0c8, fontSize: 10 } });
      label.position.set(cx, cy);
      this.world.addChild(label);
      DIRECTIONS.forEach((facing, d) => {
        const actor = new ArtActor(art, this.outlines);
        actor.facing = facing;
        actor.container.position.set(cx + step * (d + 0.5), cy + cellH - 12);
        this.world.addChild(actor.container);
        this.lineup.push(actor);
      });
    });
    this.fieldOrigin = { x: cellW * perRow / 2, y: Math.ceil(arts.length / perRow) * cellH + 40 };
  }

  private buildField(arts: MonsterArt[]): void {
    const field = new Container();
    field.sortableChildren = true;
    field.position.set(this.fieldOrigin.x, this.fieldOrigin.y);
    const ground = new Graphics();
    const corner = (x: number, y: number) => { const p = worldToScreen(x, y); return [p.sx, p.sy - TILE_H / 2]; };
    ground.poly([...corner(0, 0), ...corner(FIELD, 0), ...corner(FIELD, FIELD), ...corner(0, FIELD)]).fill({ color: GROUND_COLOR });
    for (let i = 0; i <= FIELD; i++) {
      ground.moveTo(...(corner(i, 0) as [number, number])).lineTo(...(corner(i, FIELD) as [number, number]));
      ground.moveTo(...(corner(0, i) as [number, number])).lineTo(...(corner(FIELD, i) as [number, number]));
    }
    ground.stroke({ color: GRID_COLOR, width: 0.5, alpha: 0.6 });
    ground.zIndex = -1;
    field.addChild(ground);

    const player = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    const center = worldToScreen(FIELD / 2 - 0.5, FIELD / 2 - 0.5);
    player.container.position.set(center.sx, center.sy);
    player.container.zIndex = FIELD - 1;
    field.addChild(player.container);

    for (const art of arts) {
      const actor = new ArtActor(art, this.outlines);
      const x = randomCoord(), y = randomCoord();
      this.walkers.push({ actor, x, y, tx: x, ty: y, waitMs: Math.random() * 1500 });
      field.addChild(actor.container);
    }
    this.world.addChild(field);
  }

  private tick(deltaMs: number): void {
    for (const w of this.walkers) {
      const dx = w.tx - w.x, dy = w.ty - w.y, dist = Math.hypot(dx, dy);
      if (w.waitMs > 0) {
        w.waitMs -= deltaMs;
      } else if (dist < 0.05) {
        w.tx = randomCoord();
        w.ty = randomCoord();
        w.waitMs = 400 + Math.random() * 1600;
      } else {
        const step = Math.min(dist, WALK_SPEED * deltaMs / 1000);
        w.x += (dx / dist) * step;
        w.y += (dy / dist) * step;
        w.actor.facing = facingFromDelta(dx, dy) ?? w.actor.facing;
      }
      const p = worldToScreen(w.x, w.y);
      w.actor.container.position.set(p.sx, p.sy);
      w.actor.container.zIndex = w.x + w.y;
      w.actor.apply(this.params);
    }
  }

  /** 參數變更後重畫；外框貼圖依新參數重烤 */
  apply(): void {
    this.outlines.clear();
    for (const actor of this.lineup) actor.apply(this.params);
    for (const w of this.walkers) w.actor.apply(this.params);
  }

  /** 畫布高度依內容延展 */
  layout(width: number, zoom: number): void {
    this.world.scale.set(zoom);
    const bounds = this.world.getLocalBounds();
    const height = Math.ceil(bounds.height * zoom + 32);
    this.canvas.style.height = `${height}px`;
    this.app.renderer.resize(width, height);
    this.world.position.set(Math.round((width - bounds.width * zoom) / 2 - bounds.x * zoom), Math.round(16 - bounds.y * zoom));
  }

  exportJson(): string {
    return JSON.stringify(this.params, null, 2);
  }
}

const randomCoord = () => 1 + Math.random() * (FIELD - 2);

async function loadArts(): Promise<MonsterArt[]> {
  const arts: MonsterArt[] = [];
  for (const job of MONSTER_JOBS) {
    const template = MONSTER_SEEDS.find(m => m.id === job.id);
    const urls = VIEWS.flatMap(view => [URL_BY_NAME.get(`${job.key}-${view}`), URL_BY_NAME.get(`${job.key}-${view}-full`)]);
    if (!template || urls.some(url => !url)) continue;
    const load = async (name: string) => {
      const img = new Image();
      img.src = URL_BY_NAME.get(name)!;
      await img.decode();
      return img;
    };
    const images = { trimmed: {}, full: {} } as MonsterArt['images'];
    for (const view of VIEWS) {
      images.trimmed[view] = await load(`${job.key}-${view}`);
      images.full[view] = await load(`${job.key}-${view}-full`);
    }
    const sizeLabel = template.size === 'large' ? '大' : '小';
    arts.push({ key: job.key, group: job.group, name: `${job.id} ${template.name}（${sizeLabel}${template.isBoss ? '・Boss' : ''}）`, size: template.size, images });
  }
  return arts;
}
