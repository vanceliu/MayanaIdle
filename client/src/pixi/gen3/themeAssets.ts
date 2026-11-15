/**
 * 第三代背景 render 的主題素材（`38-map-control.md` § 38.9「第三代實作限制」）。
 *
 * 每主題一張圖集＋ frame JSON（`scripts/comfy/packAssets.mjs` 產出），進入該主題地圖時才載入；
 * 載入後依 frame 切出地板材質點陣、牆面材質、物件區塊，以主題為單位快取在記憶體。
 */
import type { MapTheme } from '../../models/mapControl';
import { FLOOR_TEXTURE_NAMES, type FloorTextures, type Raster } from './floorBake';
import { byObjectName, type ObjectName, type ObjectSizes } from './objectPlan';
import type { SpriteSource, WallImages } from './wallPaint';

export interface AtlasFrame { x: number; y: number; w: number; h: number }

/** `<theme>.json`：材質名 → frame；物件名 → 各變體 frame */
export interface ThemeManifest {
  textures: Record<string, AtlasFrame>;
  objects: Record<string, AtlasFrame[]>;
}

export interface ThemeAssets {
  /** 整張圖集 */
  image: HTMLImageElement;
  floorTextures: FloorTextures;
  wallImages: WallImages;
  objects: Record<ObjectName, SpriteSource[]>;
  sizes: ObjectSizes;
}

const DIR = '../../assets/map-gen3/';
const imageUrls = import.meta.glob<string>('../../assets/map-gen3/*.webp', { query: '?url', import: 'default' });
const manifests = import.meta.glob<ThemeManifest>('../../assets/map-gen3/*.json', { import: 'default' });

export function hasThemeAssets(theme: MapTheme): boolean {
  return `${DIR}${theme}.webp` in imageUrls && `${DIR}${theme}.json` in manifests;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`圖集載入失敗：${url}`));
    image.src = url;
  });
}

function cut(image: CanvasImageSource, frame: AtlasFrame): OffscreenCanvas {
  const canvas = new OffscreenCanvas(frame.w, frame.h);
  canvas.getContext('2d')!.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  return canvas;
}

function toRaster(canvas: OffscreenCanvas): Raster {
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

/** 由圖集與 manifest 切出主題素材 */
export function sliceThemeAssets(image: HTMLImageElement, manifest: ThemeManifest): ThemeAssets {
  const textureCanvas = (name: string) => (manifest.textures[name] ? cut(image, manifest.textures[name]) : null);
  const floorTextures = Object.fromEntries(FLOOR_TEXTURE_NAMES.flatMap(name => {
    const canvas = textureCanvas(name);
    return canvas ? [[name, toRaster(canvas)]] : [];
  })) as FloorTextures;
  const objects = byObjectName(name => (manifest.objects[name] ?? [])
    .map((frame): SpriteSource => ({ image, x: frame.x, y: frame.y, width: frame.w, height: frame.h })));
  return {
    image,
    floorTextures,
    wallImages: { stone: textureCanvas('wall-stone'), top: textureCanvas('wall-top'), side: textureCanvas('wall-side') },
    objects,
    sizes: byObjectName(name => objects[name].map(({ width, height }) => ({ width, height }))),
  };
}

const cache = new Map<MapTheme, Promise<ThemeAssets>>();

/** 載入主題素材（同主題共用同一份；失敗時不快取，下次重試） */
export function loadThemeAssets(theme: MapTheme): Promise<ThemeAssets> {
  let pending = cache.get(theme);
  if (!pending) {
    const loadUrl = imageUrls[`${DIR}${theme}.webp`];
    const loadManifest = manifests[`${DIR}${theme}.json`];
    if (!loadUrl || !loadManifest) return Promise.reject(new Error(`沒有第三代素材：${theme}`));
    pending = Promise.all([loadUrl().then(loadImage), loadManifest()])
      .then(([image, manifest]) => sliceThemeAssets(image, manifest));
    pending.catch(() => cache.delete(theme));
    cache.set(theme, pending);
  }
  return pending;
}
