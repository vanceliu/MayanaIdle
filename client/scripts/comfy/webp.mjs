/**
 * 圖集輸出為 WebP（`38-map-control.md` § 38.9「第三代實作限制」）：呼叫 libwebp 的 `cwebp`（需先安裝，macOS：`brew install webp`）。
 *
 * 影像格式同 `postprocess.mjs`：`{ width, height, data }`（RGBA8888）。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng } from './postprocess.mjs';

/** 有損品質；透明度一律無損 */
export const WEBP_QUALITY = 90;

/** RGBA 影像 → WebP 位元組 */
export function encodeWebp(img, quality = WEBP_QUALITY) {
  const dir = mkdtempSync(join(tmpdir(), 'mayana-webp-'));
  try {
    const src = join(dir, 'in.png');
    const out = join(dir, 'out.webp');
    writeFileSync(src, encodePng(img));
    execFileSync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '100', '-exact', src, '-o', out]);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** WebP 檔頭的畫布尺寸（VP8X／VP8L／VP8） */
export function webpSize(bytes) {
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  throw new Error(`不是 WebP：${chunk}`);
}
