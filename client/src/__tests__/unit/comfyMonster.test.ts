/** AI 怪物三視圖後處理（`25-monster-system.md` § 25.2.2） */
import { describe, expect, it } from 'vitest';
import { createImage } from '../../../scripts/comfy/postprocess.mjs';
import type { RgbaImage as Img } from '../../../scripts/comfy/postprocess.mjs';
import { zImageWorkflow } from '../../../scripts/comfy/comfyClient.mjs';
import { MONSTER_JOBS } from '../../../scripts/comfy/monsterJobs.mjs';
import { bodyBottom, mirror, processMonster, splitViews, trimLegs } from '../../../scripts/comfy/monsterPostprocess.mjs';
import { MONSTER_SEEDS } from '../../db/seed/monsterSeeds';

const BG: [number, number, number] = [255, 0, 255];

function canvas(width: number, height: number, background: [number, number, number, number] = [0, 0, 0, 0]): Img {
  const img = createImage(width, height);
  for (let i = 0; i < img.data.length; i += 4) img.data.set(background, i);
  return img;
}

function rect(img: Img, x: number, y: number, w: number, h: number, color: [number, number, number] = [40, 120, 40]): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) img.data.set([...color, 255], (yy * img.width + xx) * 4);
  }
}

/** 身體 40×30，底下兩條 6×20 的腿 */
function legged(img: Img, x: number, y: number): void {
  rect(img, x, y, 40, 30);
  rect(img, x + 4, y + 30, 6, 20);
  rect(img, x + 30, y + 30, 6, 20);
}

describe('splitViews', () => {
  it('依空白欄切成左到右三張，各自裁到內容', () => {
    const img = canvas(300, 80);
    rect(img, 10, 10, 30, 40);
    rect(img, 100, 5, 60, 50);
    rect(img, 220, 10, 30, 45);
    expect(splitViews(img).map(v => [v.width, v.height])).toEqual([[30, 40], [60, 50], [30, 45]]);
  });

  it('窄縫不切開同一視圖、多出的小塊捨棄', () => {
    const img = canvas(400, 80);
    rect(img, 10, 10, 30, 40);
    rect(img, 44, 10, 10, 10);
    rect(img, 120, 10, 40, 40);
    rect(img, 220, 10, 40, 40);
    rect(img, 330, 10, 4, 4);
    expect(splitViews(img).map(v => v.width)).toEqual([44, 40, 40]);
  });

  it('相鄰視圖欄位重疊（尾巴伸到下一張底下）仍各自切開', () => {
    const img = canvas(300, 80);
    rect(img, 10, 10, 60, 40);
    rect(img, 100, 10, 60, 30);
    rect(img, 160, 35, 50, 5);
    rect(img, 200, 0, 60, 30);
    expect(splitViews(img).map(v => [v.width, v.height])).toEqual([[60, 40], [110, 30], [60, 30]]);
  });

  it('不足三個視圖時丟錯', () => {
    const img = canvas(200, 50);
    rect(img, 10, 10, 30, 30);
    rect(img, 120, 10, 30, 30);
    expect(() => splitViews(img)).toThrow();
  });
});

describe('bodyBottom／trimLegs', () => {
  it('身體下緣為腿之上的最後一列，裁腿後只剩身體', () => {
    const img = canvas(40, 50);
    legged(img, 0, 0);
    expect(bodyBottom(img)).toBe(29);
    const out = trimLegs(img);
    expect([out.width, out.height]).toEqual([40, 30]);
  });

  it('region 只以底部區域的最寬列為準：頭比身體寬時不會把身體當成腿', () => {
    const img = canvas(80, 100);
    rect(img, 0, 0, 80, 40);
    rect(img, 20, 40, 40, 50);
    rect(img, 25, 90, 8, 10);
    rect(img, 47, 90, 8, 10);
    expect(bodyBottom(img)).toBe(39);
    expect(bodyBottom(img, 0.75, { region: 0.3 })).toBe(89);
    expect(trimLegs(img, { region: 0.3, coverage: 0.75 }).height).toBe(90);
  });

  it('stub 保留部分腿長', () => {
    const img = canvas(40, 50);
    legged(img, 0, 0);
    expect(trimLegs(img, { stub: 0.5 }).height).toBe(40);
  });
});

describe('mirror', () => {
  it('水平翻轉', () => {
    const img = canvas(3, 1);
    rect(img, 0, 0, 1, 1, [255, 0, 0]);
    expect([...mirror(img).data.subarray(8, 12)]).toEqual([255, 0, 0, 255]);
  });
});

describe('processMonster', () => {
  const raw = () => {
    const img = canvas(600, 200, [...BG, 255]);
    legged(img, 40, 60);
    legged(img, 260, 60);
    legged(img, 480, 60);
    return img;
  };

  it('三視圖同比例縮放，裁腿版較矮、未裁腿版對齊高度上限；不補外框、邊緣 alpha 只有 0／255', () => {
    const views = processMonster(raw(), { maxHeight: 25 });
    for (const view of ['front', 'side', 'back'] as const) {
      expect(views[view].full.height).toBe(25);
      expect(views[view].trimmed.height).toBe(15);
      const alphas = new Set<number>();
      for (let i = 3; i < views[view].full.data.length; i += 4) alphas.add(views[view].full.data[i]);
      expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
    }
  });

  it("legs 'keep' 時裁腿版即未裁腿版", () => {
    const views = processMonster(raw(), { legs: 'keep', maxHeight: 25 });
    expect(views.front.trimmed).toBe(views.front.full);
  });
});

describe('zImageWorkflow', () => {
  it('文生圖以空白 latent 起始、denoise 1', () => {
    const wf = zImageWorkflow({ prompt: 'p', width: 64, height: 32, seed: 1 }) as Record<string, { inputs: Record<string, unknown> }>;
    expect(wf.sample.inputs.latent_image).toEqual(['latent', 0]);
    expect(wf.sample.inputs.denoise).toBe(1);
    expect(wf.load).toBeUndefined();
  });

  it('給 image 時以上傳圖編碼為起始 latent、套用 denoise', () => {
    const wf = zImageWorkflow({ prompt: 'p', width: 64, height: 32, seed: 1, image: 'base.png', denoise: 0.7 }) as Record<string, { inputs: Record<string, unknown> }>;
    expect(wf.latent).toBeUndefined();
    expect(wf.load.inputs.image).toBe('base.png');
    expect(wf.encode.inputs.pixels).toEqual(['load', 0]);
    expect(wf.sample.inputs.latent_image).toEqual(['encode', 0]);
    expect(wf.sample.inputs.denoise).toBe(0.7);
  });
});

describe('MONSTER_JOBS', () => {
  it('有底圖的項目有 img2img 強度、側面原圖朝右；角色剪影底圖的項目裁腿', () => {
    const based = MONSTER_JOBS.filter(job => job.base);
    expect(based.length).toBeGreaterThan(0);
    for (const job of based) {
      expect(job.denoise).toBeGreaterThan(0);
      expect(job.denoise).toBeLessThan(1);
      expect(job.sideFacesLeft).toBe(false);
      if ((job.base?.shape ?? 'pawn') === 'pawn') expect(job.legs).toBe('trim');
    }
  });

  it('id 對得到怪物、key 不重複', () => {
    const ids = new Set(MONSTER_SEEDS.map(m => m.id));
    for (const job of MONSTER_JOBS) expect(ids.has(job.id)).toBe(true);
    expect(new Set(MONSTER_JOBS.map(job => job.key)).size).toBe(MONSTER_JOBS.length);
  });
});
