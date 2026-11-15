/**
 * 怪物美術接進遊戲前的版面比較（`25-monster-system.md` § 25.2.2）：
 * 地圖上的 Boss 標示、畫面上方怪物卡片、Wiki 怪物詳細頁加圖。
 *
 * 地圖用遊戲的 `MonsterEntity`（血條、Boss 角位置與遊戲一致），只把球換成怪物圖；
 * 卡片與 Wiki 沿用遊戲的 CSS class。
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { MONSTER_JOBS } from '../scripts/comfy/monsterJobs.mjs';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';
import type { MonsterTemplate } from '../src/models/monster';
import { MonsterEntity } from '../src/pixi/entities/MonsterEntity';
import { ART_OUTLINE_COLOR, bakeOutlinedCanvas, outlinedArtLayout } from '../src/pixi/entities/monster/artOutline';
import { MONSTER_ART_SIZE_RATIO, monsterArtScale, monsterArtSize, type MonsterView } from '../src/pixi/entities/monster/monsterArt';
import { TILE_H, TILE_W } from '../src/pixi/utils/isometric';

const spriteUrls = import.meta.glob<string>('../assets-src/monsters/*-full.png', { eager: true, query: '?url', import: 'default' });
const URL_BY_NAME = new Map(Object.entries(spriteUrls).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]));

const VIEWS: MonsterView[] = ['front', 'side', 'back'];
const OUTLINE_PX = 1;
const BOSS_OUTLINE_COLOR = '#cc00cc';
const BOSS_RING_COLOR = 0xcc00cc;
/** 血條與怪物圖頂的間距（世界像素） */
const HEAD_GAP = 3;

/** 比較用的怪物：Boss 與一般怪、大小型各有 */
const SAMPLE_IDS = [151, 143, 169, 163, 145, 194];

export interface DemoMonster {
  template: MonsterTemplate;
  images: Record<MonsterView, HTMLImageElement>;
}

export async function loadMonsters(): Promise<DemoMonster[]> {
  const load = async (name: string) => {
    const img = new Image();
    img.src = URL_BY_NAME.get(name)!;
    await img.decode();
    return img;
  };
  const result: DemoMonster[] = [];
  for (const id of SAMPLE_IDS) {
    const job = MONSTER_JOBS.find(j => j.id === id)!;
    const template = MONSTER_SEEDS.find(m => m.id === id)!;
    const images = {} as Record<MonsterView, HTMLImageElement>;
    for (const view of VIEWS) images[view] = await load(`${job.key}-${view}-full`);
    result.push({ template, images });
  }
  return result;
}

const createCanvas = () => document.createElement('canvas');

/** 以 CSS 像素高 height 烤出含 1px 外框的圖（高 DPI 以 devicePixelRatio 取樣） */
export function outlinedImage(image: HTMLImageElement, height: number, color = ART_OUTLINE_COLOR, mirrored = false): HTMLCanvasElement {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const layout = outlinedArtLayout(image, height / image.height, OUTLINE_PX, dpr);
  const canvas = bakeOutlinedCanvas(image, layout, createCanvas, color);
  canvas.style.width = `${layout.width / dpr}px`;
  canvas.style.height = `${layout.height / dpr}px`;
  if (mirrored) canvas.style.transform = 'scaleX(-1)';
  return canvas;
}

export type BossMark = 'horns' | 'ring' | 'outline' | 'none';

export const BOSS_MARKS: { key: BossMark; label: string }[] = [
  { key: 'horns', label: 'A 保留角' },
  { key: 'ring', label: 'B 腳下紫光環' },
  { key: 'outline', label: 'C 紫色外框' },
  { key: 'none', label: 'D 不另標示（只有紫血條）' },
];

/** 遊戲實際接入：`MonsterEntity.setArt()` 走正式的圖集載入與貼圖；每欄一種強化詞綴數 */
export async function renderGameEntities(canvas: HTMLCanvasElement, zoom: number): Promise<void> {
  const ids = [151, 143, 169, 163, 145, 194, 1, 46];
  const cellW = TILE_W * 1.8, cellH = 84, labelH = 18, nameW = 96, affixCounts = [0, 1, 2, 3, 4];
  const app = new Application();
  await app.init({
    canvas, width: (nameW + cellW * affixCounts.length) * zoom, height: (labelH + cellH * ids.length) * zoom + 8,
    background: 0x3f5a2a, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  const world = new Container();
  world.scale.set(zoom);
  app.stage.addChild(world);
  affixCounts.forEach((n, c) => {
    const label = new Text({ text: `強化詞綴 ${n} 條`, style: { fill: 0xffffff, fontSize: 9 } });
    label.position.set(nameW + cellW * c + 8, 2);
    world.addChild(label);
  });
  const entities: MonsterEntity[] = [];
  ids.forEach((id, r) => {
    const template = MONSTER_SEEDS.find(m => m.id === id)!;
    const y = labelH + cellH * (r + 1) - 12;
    const name = new Text({ text: `${template.name}${template.isBoss ? '（Boss）' : ''}`, style: { fill: 0xffffff, fontSize: 9 } });
    name.position.set(4, y - 30);
    world.addChild(name);
    affixCounts.forEach((n, c) => {
      const entity = new MonsterEntity(`game-${id}-${n}`, template.isBoss, template.size);
      entity.container.position.set(nameW + cellW * (c + 0.5), y);
      entity.updateHp(0.7, 1);
      entity.setArt(id, n);
      world.addChild(entity.container);
      entities.push(entity);
    });
  });
  await new Promise<void>(resolve => {
    const check = () => (entities.every(e => e.hasArt) ? resolve() : setTimeout(check, 50));
    check();
  });
}

/** 地圖上的 Boss 標示比較：每列一隻怪、每欄一種標示 */
export async function renderMapMarks(canvas: HTMLCanvasElement, monsters: DemoMonster[], zoom: number): Promise<void> {
  const cellW = TILE_W * 2.2, cellH = 92, labelH = 18, nameW = 96;
  const width = (nameW + cellW * BOSS_MARKS.length) * zoom;
  const height = (labelH + cellH * monsters.length) * zoom + 8;
  const app = new Application();
  await app.init({ canvas, width, height, background: 0x3f5a2a, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
  const world = new Container();
  world.scale.set(zoom);
  app.stage.addChild(world);

  BOSS_MARKS.forEach((mark, c) => {
    const label = new Text({ text: mark.label, style: { fill: 0xffffff, fontSize: 9 } });
    label.position.set(nameW + cellW * c + 4, 2);
    world.addChild(label);
  });

  monsters.forEach((monster, r) => {
    const y = labelH + cellH * (r + 1) - 14;
    const name = new Text({ text: `${monster.template.name}${monster.template.isBoss ? '（Boss）' : ''}`, style: { fill: 0xffffff, fontSize: 9 } });
    name.position.set(4, y - 40);
    world.addChild(name);
    BOSS_MARKS.forEach((mark, c) => {
      const x = nameW + cellW * (c + 0.5);
      world.addChild(monsterWithMark(monster, mark.key, x, y));
    });
  });
}

function monsterWithMark(monster: DemoMonster, mark: BossMark, x: number, y: number): Container {
  const { template, images } = monster;
  const entity = new MonsterEntity(`demo-${template.id}-${mark}`, template.isBoss, template.size);
  entity.container.position.set(x, y);
  /* 子層：最底是目標環、最上是頭頂（Boss 角、血條、詠唱條）；中間是光暈、球、受擊白閃與它們的外框層 */
  const layers = entity.container.children;
  const overhead = layers[layers.length - 1] as Container;
  for (const layer of layers.slice(1, -1)) layer.visible = false;
  /* 頭頂：Boss 時前兩層是角的外框與角，之後是血條 */
  const hornLayers = template.isBoss ? overhead.children.slice(0, 2) : [];
  for (const layer of hornLayers) layer.visible = mark === 'horns';
  const healthBar = overhead.children[hornLayers.length];

  if (template.isBoss && mark === 'ring') {
    const ring = new Graphics()
      .ellipse(0, 0, TILE_W * 0.34, TILE_H * 0.34)
      .stroke({ color: BOSS_RING_COLOR, width: 2, alpha: 0.9 });
    entity.container.addChildAt(ring, 1);
  }

  const scale = monsterArtScale(VIEWS.map(v => images[v]), monsterArtSize(template.size, MONSTER_ART_SIZE_RATIO[template.size]));
  /* 血條移到怪物圖頂上方 HEAD_GAP 處（球體時血條壓在球上緣） */
  const artHeight = Math.max(...VIEWS.map(v => images[v].height)) * scale;
  overhead.y = -artHeight - HEAD_GAP - healthBar.y;
  const layout = outlinedArtLayout(images.front, scale, OUTLINE_PX);
  const color = template.isBoss && mark === 'outline' ? BOSS_OUTLINE_COLOR : ART_OUTLINE_COLOR;
  const sprite = new Sprite(Texture.from(bakeOutlinedCanvas(images.front, layout, createCanvas, color)));
  sprite.anchor.set(layout.anchorX, layout.anchorY);
  sprite.scale.set(layout.spriteScale);
  const shadow = new Graphics().ellipse(0, 0, images.front.width * scale * 0.4, images.front.width * scale * 0.4 * (TILE_H / TILE_W)).fill({ color: 0x000000, alpha: 0.3 });
  entity.container.addChildAt(shadow, 1);
  entity.container.addChildAt(sprite, entity.container.children.indexOf(overhead));
  entity.updateHp(0.7, 1);
  return entity.container;
}
