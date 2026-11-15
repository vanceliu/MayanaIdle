/** 圖集 WebP 檔頭尺寸（`38-map-control.md` § 38.9「第三代實作限制」） */
import { describe, expect, it } from 'vitest';
import { webpSize } from '../../../scripts/comfy/webp.mjs';

function riff(chunk: string, payload: number[]): Buffer {
  const body = Buffer.from([...Buffer.from('WEBP'), ...Buffer.from(chunk), 0, 0, 0, 0, ...payload]);
  return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), body]);
}

describe('webpSize', () => {
  it('VP8X（有損＋透明度）：畫布寬高各減一存 24 位元', () => {
    const payload = [0x10, 0, 0, 0, ...[1023, 977].flatMap(v => [v & 0xff, (v >> 8) & 0xff, v >> 16])];
    expect(webpSize(riff('VP8X', payload))).toEqual({ width: 1024, height: 978 });
  });

  it('VP8L（無損）：14 位元寬高各減一', () => {
    const bits = (300 - 1) | ((200 - 1) << 14);
    expect(webpSize(riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff]))).toEqual({ width: 300, height: 200 });
  });

  it('不是 WebP 時丟錯', () => {
    expect(() => webpSize(riff('ABCD', [0, 0, 0, 0]))).toThrow();
  });
});
