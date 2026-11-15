/**
 * AI 怪物三視圖 → 怪物 sprite 的後處理（`25-monster-system.md` § 25.2.2）。
 *
 * 影像格式同 `postprocess.mjs`：`{ width, height, data }`（RGBA8888）。
 */
import { boxDownscale, createImage, crop, cropToContent, keyOutBackground, removeSpecks, smoothMask } from './postprocess.mjs';

/** 原圖由左到右的視圖順序 */
export const MONSTER_VIEWS = ['front', 'side', 'back'];

/** AI 原圖尺寸 */
export const MONSTER_RAW = { width: 1536, height: 640 };

/** 身體下緣：由下往上第一列不透明寬度 ≥ 最寬列 × 此比例 */
export const LEG_BODY_COVERAGE = 0.6;

/** 裁腿後保留的腿長比例（0＝裁到身體下緣） */
export const LEG_STUB = 0;

/** 輸出 sprite 高度上限（素材像素，密度 `ASSET_SCALE`）；寬度上限為其 2 倍 */
export const MONSTER_MAX_HEIGHT = 96;

/** 小塊與最近視圖的水平間距（px）超過此值即捨棄 */
const VIEW_JOIN_GAP = 24;

const alphaAt = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

/** 8 連通標記不透明像素 → 每塊的像素索引、面積與水平範圍 */
function components(img) {
  const { width, height } = img;
  const label = new Int32Array(width * height).fill(-1);
  const found = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || img.data[start * 4 + 3] === 0) continue;
    const id = found.length;
    const pixels = [start];
    let x0 = Infinity, x1 = -Infinity;
    label[start] = id;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      const x = p % width, y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (label[q] !== -1 || img.data[q * 4 + 3] === 0) continue;
          label[q] = id;
          pixels.push(q);
        }
      }
    }
    found.push({ pixels, x0, x1 });
  }
  return found;
}

const horizontalGap = (a, b) => Math.max(0, a.x0 - b.x1 - 1, b.x0 - a.x1 - 1);

/**
 * 已去背的三視圖原圖 → 由左到右三張視圖（各自裁到內容）。
 * 以連通區塊切：面積由大到小，中心不落在已選區塊水平範圍內者為視圖主體，取三塊；
 * 其餘小塊併入水平間距最近的主體，間距 > VIEW_JOIN_GAP 者捨棄。
 */
export function splitViews(img) {
  const parts = components(img).sort((a, b) => b.pixels.length - a.pixels.length);
  const views = [];
  const rest = [];
  for (const part of parts) {
    const center = (part.x0 + part.x1) / 2;
    if (views.length < MONSTER_VIEWS.length && !views.some(v => center >= v.x0 && center <= v.x1)) {
      views.push({ x0: part.x0, x1: part.x1, parts: [part] });
    } else {
      rest.push(part);
    }
  }
  if (views.length < MONSTER_VIEWS.length) throw new Error(`只切出 ${views.length} 個視圖`);
  const bodies = views.map(v => ({ x0: v.x0, x1: v.x1 }));
  for (const part of rest) {
    const gaps = bodies.map(body => horizontalGap(part, body));
    const nearest = gaps.indexOf(Math.min(...gaps));
    if (gaps[nearest] <= VIEW_JOIN_GAP) views[nearest].parts.push(part);
  }
  return views
    .sort((a, b) => a.x0 - b.x0)
    .map(view => {
      const out = createImage(img.width, img.height);
      for (const part of view.parts) {
        for (const p of part.pixels) img.data.copy(out.data, p * 4, p * 4, p * 4 + 4);
      }
      return cropToContent(out);
    });
}

/** 身體下緣的列（見 LEG_BODY_COVERAGE）；最寬列只在底部 region（佔高度比例，預設整張）內找 */
export function bodyBottom(img, coverage = LEG_BODY_COVERAGE, { region = 1 } = {}) {
  const widths = Array.from({ length: img.height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < img.width; x++) if (alphaAt(img, x, y) >= 128) count++;
    return count;
  });
  const threshold = Math.max(...widths.slice(Math.floor(img.height * (1 - region)))) * coverage;
  let row = img.height - 1;
  while (row > 0 && widths[row] < threshold) row--;
  return row;
}

/** 裁掉身體下緣以下的腿，保留腿長 × stub */
export function trimLegs(img, { coverage = LEG_BODY_COVERAGE, stub = LEG_STUB, region = 1 } = {}) {
  const body = bodyBottom(img, coverage, { region });
  const height = Math.min(img.height, body + 1 + Math.round((img.height - 1 - body) * stub));
  return cropToContent(crop(img, 0, 0, img.width, height));
}

/** 左右鏡像 */
export function mirror(img) {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      img.data.copy(out.data, (y * img.width + img.width - 1 - x) * 4, (y * img.width + x) * 4, (y * img.width + x) * 4 + 4);
    }
  }
  return out;
}

/**
 * 三視圖原圖 → { front, side, back }，每個視圖 { trimmed, full }（full 為未裁腿）。
 * 側面統一朝右（sideFacesLeft 時鏡像）；三視圖與裁腿前後共用同一縮放比例，再平滑邊緣；不補外框（外框於顯示時依最終大小繪製，見 `artOutline.ts`）。
 * enclosedTolerance 傳給 `keyOutBackground`（被物件圍住的背景）；legTrim（{ region, coverage }）覆寫裁腿判定（見 `trimLegs`）。
 */
export function processMonster(raw, { legs = 'trim', sideFacesLeft = true, maxHeight = MONSTER_MAX_HEIGHT, enclosedTolerance, legTrim } = {}) {
  const views = splitViews(removeSpecks(keyOutBackground(raw, undefined, enclosedTolerance)));
  if (sideFacesLeft) views[1] = mirror(views[1]);
  const scale = Math.min(1, maxHeight / Math.max(...views.map(v => v.height)), (maxHeight * 2) / Math.max(...views.map(v => v.width)));
  const finish = img => smoothMask(boxDownscale(img, Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale))));
  return Object.fromEntries(MONSTER_VIEWS.map((name, i) => {
    const full = finish(views[i]);
    return [name, { full, trimmed: legs === 'trim' ? finish(trimLegs(views[i], legTrim)) : full }];
  }));
}
