/**
 * 怪物美術素材（`25-monster-system.md` § 25.2.2「載入」）。
 *
 * 每個產圖批次一張圖集＋ frame JSON（`scripts/comfy/packMonsters.mjs` 產出），
 * 怪物第一次出現時載入所屬圖集，切出三視圖後以素材為單位快取在記憶體。
 */
import artIndex from '../../../assets/monsters/index.json';
import { MONSTER_SEEDS } from '../../../db/seed/monsterSeeds';
import type { MonsterTemplate } from '../../../models/monster';
import type { MonsterView } from './monsterArt';

export interface AtlasFrame { x: number; y: number; w: number; h: number }

/** `batch-<NN>.json`：素材 key → 三視圖 frame */
export type MonsterBatchManifest = Record<string, Record<MonsterView, AtlasFrame>>;

/** `index.json`：素材 key → 所屬圖集與產圖用的怪物 id */
export type MonsterArtIndex = Record<string, { batch: string; id: number }>;

/** 殘影系列共用原版素材：殘影怪物 id → 原版怪物 id */
export const MONSTER_ART_ALIASES: Readonly<Record<number, number>> = {
  185: 143,
  186: 151,
  187: 157,
  188: 163,
  189: 169,
  190: 174,
  191: 179,
  192: 184,
};

/**
 * 怪物模板 id → 素材 key：殘影先換成原版 id；清單有該 id 用它的素材，
 * 否則用同名怪物的素材（不同地區的同名怪物共用一套）；都沒有回傳 null（畫球）。
 */
export function buildMonsterArtKeys(templates: readonly MonsterTemplate[], index: MonsterArtIndex): Map<number, string> {
  const keyById = new Map(Object.entries(index).map(([key, { id }]) => [id, key]));
  const nameById = new Map(templates.map(t => [t.id, t.name]));
  const keyByName = new Map<string, string>();
  for (const [id, key] of keyById) {
    const name = nameById.get(id);
    if (name && !keyByName.has(name)) keyByName.set(name, key);
  }
  const result = new Map<number, string>();
  for (const template of templates) {
    if (template.id === undefined) continue;
    const source = MONSTER_ART_ALIASES[template.id] ?? template.id;
    const key = keyById.get(source) ?? keyByName.get(nameById.get(source) ?? '');
    if (key) result.set(template.id, key);
  }
  return result;
}

const ART_KEYS = buildMonsterArtKeys(MONSTER_SEEDS, artIndex as MonsterArtIndex);

/** 該怪物模板的素材 key；沒有素材回傳 null */
export function monsterArtKey(templateId: number): string | null {
  return ART_KEYS.get(templateId) ?? null;
}

export type MonsterArtImages = Record<MonsterView, HTMLCanvasElement>;

const DIR = '../../../assets/monsters/';
const imageUrls = import.meta.glob<string>('../../../assets/monsters/batch-*.webp', { query: '?url', import: 'default' });
const manifests = import.meta.glob<MonsterBatchManifest>('../../../assets/monsters/batch-*.json', { import: 'default' });

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`怪物圖集載入失敗：${url}`));
    image.src = url;
  });
}

function cut(image: CanvasImageSource, frame: AtlasFrame): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  canvas.getContext('2d')!.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  return canvas;
}

const batchCache = new Map<string, Promise<{ image: HTMLImageElement; manifest: MonsterBatchManifest }>>();
const artCache = new Map<string, Promise<MonsterArtImages>>();

function loadBatch(batch: string): Promise<{ image: HTMLImageElement; manifest: MonsterBatchManifest }> {
  let pending = batchCache.get(batch);
  if (!pending) {
    const loadUrl = imageUrls[`${DIR}${batch}.webp`];
    const loadManifest = manifests[`${DIR}${batch}.json`];
    if (!loadUrl || !loadManifest) return Promise.reject(new Error(`沒有怪物圖集：${batch}`));
    pending = Promise.all([loadUrl().then(loadImage), loadManifest()]).then(([image, manifest]) => ({ image, manifest }));
    pending.catch(() => batchCache.delete(batch));
    batchCache.set(batch, pending);
  }
  return pending;
}

/** 載入素材的三視圖（同素材共用同一份；失敗時不快取，下次重試） */
export function loadMonsterArt(key: string): Promise<MonsterArtImages> {
  let pending = artCache.get(key);
  if (!pending) {
    const entry = (artIndex as MonsterArtIndex)[key];
    if (!entry) return Promise.reject(new Error(`沒有怪物素材：${key}`));
    pending = loadBatch(entry.batch).then(({ image, manifest }) => {
      const frames = manifest[key];
      return { front: cut(image, frames.front), side: cut(image, frames.side), back: cut(image, frames.back) };
    });
    pending.catch(() => artCache.delete(key));
    artCache.set(key, pending);
  }
  return pending;
}
