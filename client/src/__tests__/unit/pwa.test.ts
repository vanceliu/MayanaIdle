// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * PWA 設定的把關（`16-tech-frontend-architecture.md` § 32.18）。
 *
 * 這些檔案不經過 TypeScript 也不經過 Vite，打錯字不會有任何編譯錯誤 ——
 * 症狀是「裝不起來」或「離線一片白」，而且要拿真手機才看得到。
 */

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const BASE = '/MayanaIdle/';

describe('manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  it('start_url 與 scope 都在部署的子路徑底下', () => {
    // GitHub Pages 部署在 /MayanaIdle/；寫成 '/' 會讓安裝後的捷徑開到 404
    expect(manifest.start_url).toBe(BASE);
    expect(manifest.scope).toBe(BASE);
  });

  it('standalone 顯示模式（隱藏網址列才有多出來的可視高度）', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('底色與 --bg-deepest 一致，啟動畫面不會閃白', () => {
    expect(manifest.background_color).toBe('#0A0A1A');
    expect(manifest.theme_color).toBe('#0A0A1A');
  });

  it('方向不鎖定：直向優先但橫向也要能玩', () => {
    expect(manifest.orientation).toBe('any');
  });

  it('備齊 192／512 的 maskable 圖示', () => {
    const sizes = manifest.icons.filter((i: { purpose?: string }) => i.purpose?.includes('maskable'))
      .map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('圖示路徑是相對的（會依 scope 解析），不可寫成絕對根路徑', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), icon.src).toBe(false);
    }
  });
});

describe('index.html', () => {
  const html = read('index.html');

  it('掛上 manifest 與 iOS 專用的 apple-touch-icon', () => {
    // iOS 不讀 manifest 的 icons，少了這條主畫面圖示會變成網頁截圖
    expect(html).toContain(`<link rel="manifest" href="${BASE}manifest.webmanifest" />`);
    expect(html).toMatch(/rel="apple-touch-icon"/);
  });

  it('viewport 帶 viewport-fit=cover（安全區讓位的前提）', () => {
    expect(html).toContain('viewport-fit=cover');
  });
});

describe('service worker', () => {
  const sw = read('public/sw.js');
  /** 註解裡本來就會提到這些名字（說明「為什麼不用」），斷言只能看真正的程式碼 */
  const code = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('不做 skipWaiting：中途換版會讓 lazy chunk 要到已被換掉的檔名而 404', () => {
    expect(code).not.toMatch(/skipWaiting\s*\(/);
  });

  it('導覽走 network-first：index.html 沒有 content hash，快取優先會卡在舊版', () => {
    const nav = code.slice(code.indexOf("request.mode === 'navigate'"));
    // fetch 在前、caches.match 在後 = network-first
    expect(nav.indexOf('await fetch(request)')).toBeLessThan(nav.indexOf('caches.match'));
  });

  it('跨網域一律不碰（排行榜 API 快取起來會顯示過期名次）', () => {
    expect(code).toContain('url.origin !== self.location.origin');
  });

  it('只處理 GET', () => {
    expect(code).toContain("request.method !== 'GET'");
  });

  it('不使用 import／import.meta（public 下的檔案不經過 Vite 處理）', () => {
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toContain('import.meta');
  });
});

describe('app icon', () => {
  const svg = read('public/icons/app-icon.svg');

  /**
   * XML 註解裡不可出現連續兩個 ASCII 連字號。違反時整份 SVG 解析失敗，
   * 而且是**靜默**的 —— 圖示變成空白，沒有任何錯誤訊息。
   * 曾經因為註解裡寫了 CSS 變數名（帶兩個連字號的前綴）而踩到。
   */
  it('註解裡沒有連續兩個 ASCII 連字號', () => {
    for (const comment of svg.match(/<!--[\s\S]*?-->/g) ?? []) {
      expect(comment.slice(4, -3)).not.toContain('--');
    }
  });
});
