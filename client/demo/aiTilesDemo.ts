/**
 * AI 地圖素材預覽（`38-map-control.md` § 38.9「素材來源」）。
 *
 * 素材直接讀 `assets-src/` 的單張檔案（`scripts/comfy/genTiles.mjs` 產出），以 Canvas 2D 鋪整張地圖；
 * 繪製邏輯與遊戲第三代背景 render 共用 `src/pixi/gen3/`。
 */
import type { MapData, MapTheme } from '../src/models/mapControl';
import { ASSET_SCALE } from '../scripts/comfy/tileSpec.mjs';
import { FLOOR_TEXTURE_NAMES, bakeFloor, floorBounds, type FloorTextures, type Raster } from '../src/pixi/gen3/floorBake';
import { OBJECT_NAMES, byObjectName, planObjects, type ObjectName } from '../src/pixi/gen3/objectPlan';
import { createWallPainter, drawStump } from '../src/pixi/gen3/wallPaint';

const tileUrls = import.meta.glob<string>('../assets-src/tiles/object/*.png', { eager: true, query: '?url', import: 'default' });
const textureUrls = import.meta.glob<string>('../assets-src/ai-textures/*.png', { eager: true, query: '?url', import: 'default' });
const mapModules = import.meta.glob<MapData>('../src/maps/*.json', { import: 'default' });

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1, -4);

/** `<theme>-<name>_<n>` → URL */
const OBJECT_URL_BY_NAME = new Map(Object.entries(tileUrls).map(([path, url]) => [fileName(path), url]));
/** `<theme>-<name>` → URL */
const TEXTURE_URL_BY_NAME = new Map(Object.entries(textureUrls).map(([path, url]) => [fileName(path), url]));

/** 主題的全部素材（材質在前） */
export function themeAssetUrls(theme: MapTheme): { name: string; url: string }[] {
  const prefix = `${theme}-`;
  return [...TEXTURE_URL_BY_NAME, ...OBJECT_URL_BY_NAME]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, url]) => ({ name, url }));
}

/** 已有 AI 地面材質的主題 */
export const AI_THEMES = [...TEXTURE_URL_BY_NAME.keys()]
  .filter(name => name.endsWith('-ground'))
  .map(name => name.slice(0, -'-ground'.length)) as MapTheme[];

export async function listMaps(themes: MapTheme[]): Promise<MapData[]> {
  const maps = await Promise.all(Object.values(mapModules).map(load => load()));
  return maps
    .filter(map => map.theme && themes.includes(map.theme))
    .sort((a, b) => themes.indexOf(a.theme!) - themes.indexOf(b.theme!) || a.id.localeCompare(b.id));
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`載入失敗：${url}`));
      img.src = url;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

async function loadTextureImage(theme: MapTheme, name: string): Promise<HTMLImageElement | null> {
  const url = TEXTURE_URL_BY_NAME.get(`${theme}-${name}`);
  return url ? loadImage(url) : null;
}

async function loadTexture(theme: MapTheme, name: string): Promise<Raster | null> {
  const img = await loadTextureImage(theme, name);
  if (!img) return null;
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

async function loadObjects(theme: MapTheme, name: string): Promise<HTMLImageElement[]> {
  const urls: string[] = [];
  for (let i = 0; OBJECT_URL_BY_NAME.has(`${theme}-${name}_${i}`); i++) urls.push(OBJECT_URL_BY_NAME.get(`${theme}-${name}_${i}`)!);
  return Promise.all(urls.map(loadImage));
}

/** 地圖上方留給牆與物件的高度（世界像素） */
const TOP_MARGIN = 80;

export async function renderMap(canvas: HTMLCanvasElement, map: MapData, zoom: number): Promise<void> {
  const theme = map.theme ?? 'grassland';
  const loaded = await Promise.all(FLOOR_TEXTURE_NAMES.map(async name => [name, await loadTexture(theme, name)] as const));
  const textures = Object.fromEntries(loaded.filter(([, raster]) => raster !== null)) as FloorTextures;
  if (!textures.ground) throw new Error(`缺少地面材質：${theme}-ground`);

  const bounds = floorBounds(map);
  const raster = bakeFloor(map, textures, bounds, ASSET_SCALE);
  const floor = new OffscreenCanvas(raster.width, raster.height);
  floor.getContext('2d')!.putImageData(new ImageData(raster.data as ImageDataArray, raster.width, raster.height), 0, 0);

  const view = { x: bounds.x, y: bounds.y - TOP_MARGIN, width: bounds.width, height: bounds.height + TOP_MARGIN };
  const scale = zoom * (window.devicePixelRatio || 1);
  canvas.width = Math.round(view.width * scale);
  canvas.height = Math.round(view.height * scale);
  canvas.style.width = `${view.width * zoom}px`;
  canvas.style.height = `${view.height * zoom}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
  ctx.fillStyle = '#111';
  ctx.fillRect(view.x, view.y, view.width, view.height);
  ctx.drawImage(floor, bounds.x, bounds.y, raster.width / ASSET_SCALE, raster.height / ASSET_SCALE);

  const sprites = Object.fromEntries(await Promise.all(OBJECT_NAMES.map(async name => [name, await loadObjects(theme, name)] as const))) as Record<ObjectName, HTMLImageElement[]>;
  const sizes = byObjectName(name => sprites[name].map(img => ({ width: img.width, height: img.height })));
  const [stone, top, side] = await Promise.all(['wall-stone', 'wall-top', 'wall-side'].map(name => loadTextureImage(theme, name)));
  const wall = createWallPainter(ctx, { stone, top, side });

  for (const placement of planObjects(map, sizes)) {
    switch (placement.kind) {
      case 'sprite': {
        const { sx, sy, width, height, flip } = placement;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(flip, 1);
        ctx.drawImage(sprites[placement.name][placement.variant], -width / 2, -height, width, height);
        ctx.restore();
        break;
      }
      case 'wall':
        wall(placement.x, placement.y, placement.isBlockAt);
        break;
      case 'stump': {
        const img = sprites.pillar[placement.variant];
        drawStump(ctx, { image: img, x: 0, y: 0, width: img.width, height: img.height }, placement.x, placement.y);
        break;
      }
    }
  }
}
