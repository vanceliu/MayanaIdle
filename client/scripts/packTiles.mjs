/**
 * 等距地形圖集打包器（含交界過渡磚合成）。
 *
 * ⚠️ 目前 `client/assets-src/tiles/` 已清空——素材整批移除，執行本腳本會找不到輸入。
 * 腳本本身保留：找到新的一整套等距素材後，放進 assets-src 即可直接沿用，
 * 選型需求見 `docs/design/38-map-control.md` § 38.9。
 *
 * 把 client/assets-src/tiles/ 下的散裝 PNG 打包成單一 spritesheet（texture atlas）。
 *
 *   node scripts/packTiles.mjs
 *
 * 輸出 client/src/assets/tiles/atlas/tiles.png + tiles.json（PixiJS spritesheet 格式）。
 *
 * 為什麼要打包：同一張 texture 的 sprite 才能合併成一次 draw call。等距地圖動輒上百格，
 * 散檔載入等於上百次 draw call，打包後是 1 次。
 *
 * 排版採「先依高度分列」的 shelf packing：素材以 64×32 與 32×32 為主，高度種類少，
 * 這種排法已接近最佳，而且完全確定性（同樣輸入必得同樣輸出，git diff 才穩定）。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';


const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', 'assets-src', 'tiles');
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'tiles', 'atlas');
const OUT_NAME = 'tiles';

/** 圖片之間的透明間隔，避免取樣時鄰圖像素滲進來（texture bleeding） */
const PADDING = 2;
/** 圖集寬度；高度會長到剛好容納，再進位到 2 的次方 */
const ATLAS_WIDTH = 2048;
/** 超過這個高度就該拆多張圖集了，直接報錯而不是默默產出巨圖 */
const MAX_ATLAS_HEIGHT = 4096;


// ─────────────────────────────────────────────────────────────────────────────
// 地形交界過渡磚（自動合成）
//
// 兩種地板直接相鄰會出現一刀切的直角硬邊。這裡把「鄰居地形」沿著菱形的
// 對應邊緣，以帶抖動的邊界混進基底地形，產生自然的交界。
//
// 為什麼用合成而不是引入現成的交界磚：現成素材（如 Kenney 的水岸磚）是扁平
// 向量風，跟 Stone Soup 的像素風混在同一畫面會露餡。自己合成則永遠同風格，
// 而且任何地形配對都能生。
//
// mask 為 4 bit，對應等距鄰居：bit0 NW / bit1 NE / bit2 SE / bit3 SW。
// ─────────────────────────────────────────────────────────────────────────────

/** 鄰居地形沿邊緣侵入的深度（0~1，1 為整格） */
const BLEND_BAND = 0.42;
/** 邊界抖動幅度；像素風要有不規則邊才不會像用尺畫的 */
const BLEND_JITTER = 0.16;

function pixelHash(x, y) {
  const h = Math.imul(x * 374761393 + y * 668265263, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

/** 四條邊的「由該邊往內的深度」：0 在邊上、1 在中心 */
function edgeDepths(u, v) {
  return [
    1 - (-u - v), // bit0 NW：左上邊
    1 - (u - v),  // bit1 NE：右上邊
    1 - (u + v),  // bit2 SE：右下邊
    1 - (v - u),  // bit3 SW：左下邊
  ];
}

function blendTransition(base, over, mask) {
  const out = new PNG({ width: 64, height: 32, colorType: 6 });
  out.data.fill(0);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      if (base.data[i + 3] === 0) continue; // 菱形外
      const u = (x + 0.5 - 32) / 32;
      const v = (y + 0.5 - 16) / 16;
      const depths = edgeDepths(u, v);
      let nearest = Infinity;
      for (let bit = 0; bit < 4; bit++) {
        if (mask & (1 << bit)) nearest = Math.min(nearest, depths[bit]);
      }
      const threshold = BLEND_BAND + (pixelHash(x, y) - 0.5) * BLEND_JITTER;
      const src = nearest < threshold && over.data[i + 3] > 0 ? over : base;
      out.data[i] = src.data[i];
      out.data[i + 1] = src.data[i + 1];
      out.data[i + 2] = src.data[i + 2];
      out.data[i + 3] = base.data[i + 3];
    }
  }
  return out;
}

/** 由主題表推出需要哪些地形配對，避免產生用不到的組合 */
function transitionPairs(themes) {
  const pairs = new Set();
  for (const t of Object.values(themes)) {
    for (const other of [t.water, t.waterEdge, t.grass, t.sand]) {
      if (other && other !== t.ground) pairs.add(`${t.ground}|${other}`);
    }
  }
  return [...pairs].sort();
}

function listPngs(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listPngs(full));
    else if (entry.endsWith('.png')) out.push(full);
  }
  return out;
}

/**
 * 部分 DCSS 原始 PNG 在 IEND 之後帶有幾個 byte 的雜訊，pngjs 會直接拋
 * 「unrecognised content at end of stream」。截到 IEND 為止再交給 pngjs。
 */
function readPng(file) {
  const buf = readFileSync(file);
  let offset = 8; // 跳過 PNG signature
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    offset += 12 + length; // length(4) + type(4) + data + crc(4)
    if (type === 'IEND') break;
  }
  return PNG.sync.read(offset < buf.length ? buf.subarray(0, offset) : buf);
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * 把來源像素整塊搬進圖集。逐列複製、不做混色 —— 來源已含 alpha，
 * 任何混色都會讓半透明邊緣（LPC 的陰影）失真。
 * 註：PNG.sync.read 回傳的是純物件，沒有 pngjs 實例上的 bitblt。
 */
function blit(src, dst, dstX, dstY) {
  for (let row = 0; row < src.height; row++) {
    const from = row * src.width * 4;
    const to = ((dstY + row) * dst.width + dstX) * 4;
    src.data.copy(dst.data, to, from, from + src.width * 4);
  }
}

const files = listPngs(SRC_DIR)
  // 用 / 當分隔，Windows 上也產出一致的 frame 名稱
  .map(full => ({ full, name: relative(SRC_DIR, full).split(sep).join('/') }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (files.length === 0) {
  console.error(`找不到任何 PNG：${SRC_DIR}`);
  process.exit(1);
}

const sprites = files.map(({ full, name }) => {
  const png = readPng(full);
  return { name, png, w: png.width, h: png.height };
});

// 合成交界過渡磚。基底一律取各地形的變體 0，確保同一配對的過渡磚彼此連續。
// 主題對照表要跟著新素材一起重寫；表還不存在時只打包原始磚，不合成過渡磚。
const themePath = join(HERE, '..', 'src', 'pixi', 'themeTiles.json');
const themes = existsSync(themePath) ? JSON.parse(readFileSync(themePath, 'utf8')) : null;
const bySheet = new Map();
for (const sprite of sprites) {
  const m = /^floor\/(.+)_0\.png$/.exec(sprite.name);
  if (m) bySheet.set(m[1], sprite.png);
}
let generated = 0;
for (const pair of themes ? transitionPairs(themes) : []) {
  const [baseName, overName] = pair.split('|');
  const base = bySheet.get(baseName);
  const over = bySheet.get(overName);
  if (!base || !over) {
    console.error(`過渡磚缺少來源地形：${baseName} 或 ${overName}`);
    process.exit(1);
  }
  for (let mask = 1; mask <= 15; mask++) {
    const png = blendTransition(base, over, mask);
    sprites.push({ name: `edge/${baseName}__${overName}_${mask}.png`, png, w: 64, h: 32 });
    generated++;
  }
}
console.log(themes
  ? `合成交界過渡磚 ${generated} 塊（${transitionPairs(themes).length} 組配對 × 15 種方向）`
  : '找不到 themeTiles.json，略過交界過渡磚合成');

// 依高度分列：同高度的排在同一列，列內橫向排。高度降冪讓大圖先落位，減少碎片。
const order = [...sprites].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));

let cursorX = PADDING;
let cursorY = PADDING;
let shelfHeight = 0;
for (const sprite of order) {
  if (sprite.w + PADDING * 2 > ATLAS_WIDTH) {
    console.error(`單張圖寬度 ${sprite.w} 超過圖集寬度 ${ATLAS_WIDTH}：${sprite.name}`);
    process.exit(1);
  }
  if (cursorX + sprite.w + PADDING > ATLAS_WIDTH) {
    cursorX = PADDING;
    cursorY += shelfHeight + PADDING;
    shelfHeight = 0;
  }
  sprite.x = cursorX;
  sprite.y = cursorY;
  cursorX += sprite.w + PADDING;
  if (sprite.h > shelfHeight) shelfHeight = sprite.h;
}

const usedHeight = cursorY + shelfHeight + PADDING;
const atlasHeight = nextPowerOfTwo(usedHeight);
if (atlasHeight > MAX_ATLAS_HEIGHT) {
  console.error(`圖集高度 ${atlasHeight} 超過上限 ${MAX_ATLAS_HEIGHT}，需要拆成多張`);
  process.exit(1);
}

const atlas = new PNG({ width: ATLAS_WIDTH, height: atlasHeight, colorType: 6 });
atlas.data.fill(0);
for (const sprite of order) {
  blit(sprite.png, atlas, sprite.x, sprite.y);
}

const frames = {};
for (const sprite of sprites) {
  frames[sprite.name] = {
    frame: { x: sprite.x, y: sprite.y, w: sprite.w, h: sprite.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: sprite.w, h: sprite.h },
    sourceSize: { w: sprite.w, h: sprite.h },
  };
}

const sheet = {
  frames,
  meta: {
    image: `${OUT_NAME}.png`,
    format: 'RGBA8888',
    size: { w: ATLAS_WIDTH, h: atlasHeight },
    scale: '1',
    // 像素風必須用 nearest，否則放大會糊掉；載入端要據此設定 texture source
    scaleMode: 'nearest',
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, `${OUT_NAME}.png`), PNG.sync.write(atlas));
writeFileSync(join(OUT_DIR, `${OUT_NAME}.json`), `${JSON.stringify(sheet, null, 2)}\n`);

const spriteArea = sprites.reduce((sum, s) => sum + s.w * s.h, 0);
const atlasArea = ATLAS_WIDTH * atlasHeight;
const pngBytes = statSync(join(OUT_DIR, `${OUT_NAME}.png`)).size;

console.log(`打包 ${sprites.length} 張 → ${ATLAS_WIDTH}×${atlasHeight}`);
console.log(`  填充率 ${((spriteArea / atlasArea) * 100).toFixed(1)}%（padding ${PADDING}px）`);
console.log(`  PNG ${(pngBytes / 1024).toFixed(0)} KB，GPU 記憶體約 ${((atlasArea * 4) / 1024 / 1024).toFixed(1)} MB`);
console.log(`  輸出 ${relative(join(HERE, '..'), OUT_DIR)}/`);
