/**
 * 怪物美術的顯示貼圖（`25-monster-system.md` § 25.2.2「外框」「外框色」）：
 * 依顯示縮放與外框色把視圖烤成含外框的貼圖，同一組參數只烤一次。
 */
import { Texture } from 'pixi.js';
import { bakeOutlinedCanvas, outlinedArtLayout, type OutlinedArtLayout } from './artOutline';
import { MONSTER_ART_OUTLINE_PX } from './monsterArt';

export interface MonsterArtTexture {
  texture: Texture;
  layout: OutlinedArtLayout;
}

const cache = new WeakMap<HTMLCanvasElement, Map<string, MonsterArtTexture>>();

/** 視圖 image 以 scale 顯示、外框色 color 的貼圖 */
export function monsterArtTexture(image: HTMLCanvasElement, scale: number, color: string): MonsterArtTexture {
  let byParams = cache.get(image);
  if (!byParams) {
    byParams = new Map();
    cache.set(image, byParams);
  }
  const id = `${scale}|${color}`;
  let entry = byParams.get(id);
  if (!entry) {
    const layout = outlinedArtLayout(image, scale, MONSTER_ART_OUTLINE_PX);
    const canvas = bakeOutlinedCanvas(image, layout, () => document.createElement('canvas'), color);
    entry = { texture: Texture.from(canvas), layout };
    byParams.set(id, entry);
  }
  return entry;
}
