/**
 * AI 原圖 → 遊戲素材的後處理（`38-map-control.md` § 38.9「素材來源」）。
 *
 * 影像格式一律為 `{ width, height, data }`（RGBA8888，與 pngjs 相同）。
 */
import { PNG } from 'pngjs';
import { FLOOR_PERIOD, FLOOR_TEXELS_PER_TILE } from './tileSpec.mjs';

export function createImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

export function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

export function encodePng(img) {
  const png = new PNG({ width: img.width, height: img.height, colorType: 6 });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

/** 面積平均縮圖；色彩以 alpha 加權，alpha 取平均（保留柔和邊緣） */
export function boxDownscale(img, width, height) {
  const out = createImage(width, height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          const alpha = img.data[i + 3];
          r += img.data[i] * alpha; g += img.data[i + 1] * alpha; b += img.data[i + 2] * alpha;
          a += alpha; n++;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/**
 * 可循環化，水平、垂直分兩步：每步與沿該軸錯開半張的自身混合，邊緣（距邊 < 1/4 張）漸變為錯位圖、中央保留原圖。
 * 分軸處理使錯位圖的接縫（位於中央）永遠落在權重為原圖的區域。
 */
export function makeSeamless(img) {
  const blendAxis = (src, horizontal) => {
    const { width, height } = src;
    const out = createImage(width, height);
    const size = horizontal ? width : height;
    const band = size / 4;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = horizontal ? x : y;
        const w = Math.min(1, Math.min(t, size - 1 - t) / band);
        const i = (y * width + x) * 4;
        const j = horizontal
          ? (y * width + (x + Math.floor(width / 2)) % width) * 4
          : (((y + Math.floor(height / 2)) % height) * width + x) * 4;
        for (let c = 0; c < 4; c++) out.data[i + c] = Math.round(src.data[i + c] * w + src.data[j + c] * (1 - w));
      }
    }
    return out;
  };
  return blendAxis(blendAxis(img, true), false);
}

/** 色溢：彩度 ≥ SPILL_MIN_CHROMA 且色相與背景相差 ≤ SPILL_HUE_DEGREES 的像素（背景色調的陰影與反光） */
const SPILL_MIN_CHROMA = 40;
const SPILL_HUE_DEGREES = 30;

/** RGB 色相（度）與彩度（max − min） */
function hueChroma(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
  if (chroma === 0) return { hue: 0, chroma };
  const hue = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return { hue: hue * 60, chroma };
}

/**
 * 以四角中位色為背景鍵出：從外框連通、色差 ≤ tolerance 或屬色溢者，以及全圖色差 ≤ enclosedTolerance 者（被物件圍住的背景）設為透明；
 * 再去掉貼著透明、色差 ≤ 2 倍 tolerance 的一圈混色邊。
 */
export function keyOutBackground(img, tolerance = 60, enclosedTolerance = 25) {
  const { width, height } = img;
  const out = createImage(width, height);
  img.data.copy(out.data);
  const at = (x, y) => (y * width + x) * 4;
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const bg = [0, 1, 2].map(c => corners.map(i => img.data[i + c]).sort((a, b) => a - b)[2]);
  const bgDistance = i => Math.hypot(img.data[i] - bg[0], img.data[i + 1] - bg[1], img.data[i + 2] - bg[2]);
  const bgHue = hueChroma(bg[0], bg[1], bg[2]).hue;
  const isSpill = i => {
    const { hue, chroma } = hueChroma(img.data[i], img.data[i + 1], img.data[i + 2]);
    const diff = Math.abs(hue - bgHue);
    return chroma >= SPILL_MIN_CHROMA && Math.min(diff, 360 - diff) <= SPILL_HUE_DEGREES;
  };

  const stack = [];
  const visit = (x, y) => {
    const i = at(x, y);
    if (out.data[i + 3] === 0 || (bgDistance(i) > tolerance && !isSpill(i))) return;
    out.data[i + 3] = 0;
    stack.push(x, y);
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  while (stack.length > 0) {
    const y = stack.pop(), x = stack.pop();
    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }
  for (let i = 0; i < out.data.length; i += 4) {
    if (bgDistance(i) <= enclosedTolerance) out.data[i + 3] = 0;
  }
  const fringe = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = at(x, y);
      if (out.data[i + 3] === 0) continue;
      const touchesBg = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some(j => out.data[j + 3] === 0);
      if (touchesBg && bgDistance(i) <= tolerance * 2) fringe.push(i);
    }
  }
  for (const i of fringe) out.data[i + 3] = 0;
  return out;
}

/** 裁到不透明像素的外接矩形 */
export function cropToContent(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('鍵出後沒有剩下任何像素');
  return crop(img, minX, minY, maxX - minX + 1, maxY - minY + 1);
}

/** 雜點門檻：不透明連通區塊面積小於最大區塊的此比例者刪除 */
export const SPECK_RATIO = 0.005;

/** 刪除零碎小塊：以 8 連通標記不透明像素，面積 < 最大區塊 × SPECK_RATIO 的區塊設為透明 */
export function removeSpecks(img) {
  const { width, height } = img;
  const out = createImage(width, height);
  img.data.copy(out.data);
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || img.data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length > 0) {
      const p = stack.pop();
      size++;
      const x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (label[q] !== -1 || img.data[q * 4 + 3] === 0) continue;
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  const minSize = Math.max(0, ...sizes) * SPECK_RATIO;
  for (let p = 0; p < width * height; p++) {
    if (label[p] !== -1 && sizes[label[p]] < minSize) out.data[p * 4 + 3] = 0;
  }
  return out;
}

/** 補外框：在輪廓外補 width 像素寬的 color 外框（與牆外框同色） */
export const OUTLINE = { width: 2, color: [20, 20, 20] };

/** 平滑輪廓：alpha ≥ 128 為內部，3×3 平均兩次後以 0.5 為界重新二值化（去掉毛邊），alpha 只留 0／255 */
export function smoothMask(img) {
  const { width, height } = img;
  let mask = Float32Array.from({ length: width * height }, (_, p) => (img.data[p * 4 + 3] >= 128 ? 1 : 0));
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) sum += mask[ny * width + nx];
          }
        }
        next[y * width + x] = sum / 9;
      }
    }
    mask = next;
  }
  const out = createImage(width, height);
  img.data.copy(out.data);
  for (let p = 0; p < width * height; p++) out.data[p * 4 + 3] = mask[p] >= 0.5 ? 255 : 0;
  return out;
}

/** 在輪廓外補一圈外框（見 OUTLINE）：先 smoothMask，外框外緣抗鋸齒；畫布四周各擴 width 像素 */
export function addOutline(source) {
  const img = smoothMask(source);
  const pad = OUTLINE.width;
  const out = createImage(img.width + pad * 2, img.height + pad * 2);
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= img.width || y >= img.height ? 0 : img.data[(y * img.width + x) * 4 + 3]);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      let nearest = Infinity;
      for (let dy = -pad - 1; dy <= pad + 1; dy++) {
        for (let dx = -pad - 1; dx <= pad + 1; dx++) {
          if (alphaAt(x - pad + dx, y - pad + dy) >= 128) nearest = Math.min(nearest, Math.hypot(dx, dy));
        }
      }
      const ring = Math.max(0, Math.min(1, pad + 0.5 - nearest));
      const o = (y * out.width + x) * 4;
      const sx = x - pad, sy = y - pad;
      const a = alphaAt(sx, sy) / 255;
      const src = a > 0 ? (sy * img.width + sx) * 4 : -1;
      const alpha = a + ring * (1 - a);
      if (alpha === 0) continue;
      for (let c = 0; c < 3; c++) {
        const top = src >= 0 ? img.data[src + c] * a : 0;
        out.data[o + c] = Math.round((top + OUTLINE.color[c] * ring * (1 - a)) / alpha);
      }
      out.data[o + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

/** AI 原圖 → 單一物件 sprite（寬 ≤ maxWidth，等比例，邊緣保留半透明）；outline 時補外框 */
export function processObject(raw, maxWidth, { outline = false } = {}) {
  const cropped = cropToContent(removeSpecks(keyOutBackground(raw)));
  const scale = Math.min(1, maxWidth / cropped.width);
  const sprite = boxDownscale(cropped, Math.max(1, Math.round(cropped.width * scale)), Math.max(1, Math.round(cropped.height * scale)));
  return outline ? addOutline(sprite) : sprite;
}

/** 材質原圖四周裁掉的比例（模型常在邊緣畫框或暗角） */
export const TEXTURE_BORDER_CROP = 0.06;

/** 裁出 (x, y) 起、寬 width、高 height 的區域 */
export function crop(img, x, y, width, height) {
  const out = createImage(width, height);
  for (let row = 0; row < height; row++) {
    img.data.copy(out.data, row * width * 4, ((y + row) * img.width + x) * 4, ((y + row) * img.width + x + width) * 4);
  }
  return out;
}

/** AI 原圖 → 無縫地板材質（四周裁掉 TEXTURE_BORDER_CROP → 錯位混合 → 縮成 FLOOR_PERIOD 格一週期） */
export function processFloorTexture(raw) {
  const size = FLOOR_PERIOD * FLOOR_TEXELS_PER_TILE;
  const margin = Math.round(Math.min(raw.width, raw.height) * TEXTURE_BORDER_CROP);
  return boxDownscale(makeSeamless(crop(raw, margin, margin, raw.width - 2 * margin, raw.height - 2 * margin)), size, size);
}
