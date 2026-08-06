/**
 * PWA 註冊（`34-ui-guidelines.md` § 34.8）。
 *
 * 目的是「裝到主畫面之後仍然打得開」—— 存檔本來就在 IndexedDB，
 * 只要程式碼與素材進得了快取，離線就是完整可玩。
 */

import { BUILD_INFO } from './buildInfo';

/** Service Worker 的路徑（GitHub Pages 部署在子路徑底下，作用範圍必須跟著它） */
const SW_URL = '/MayanaIdle/sw.js';

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  /*
   * **開發模式不註冊**：Service Worker 會把 Vite 的模組路徑一起快取住，
   * HMR 之後畫面停在舊版，而且症狀看起來像「改了沒生效」，非常難查。
   * 順手把可能殘留的註冊解掉，免得換過分支的機器被前一次的 build 卡住。
   */
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => r.unregister()))
      .catch(() => { /* 解不掉就算了，不影響開發 */ });
    return;
  }

  /*
   * 帶上 build commit：檔名不同的 Service Worker 會被瀏覽器視為新的 worker
   * 而自動更新，SW 也直接拿這個字串當快取版本（見 `public/sw.js`）。
   */
  const url = `${SW_URL}?v=${BUILD_INFO.commit}`;

  // 等 load 之後再註冊：註冊本身會搶頻寬，不該跟首屏資源競爭
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope: '/MayanaIdle/' }).catch((err: unknown) => {
      // 註冊失敗只代表沒有離線能力，遊戲照常運作，不可讓它中斷開機流程
      console.warn('[PWA] Service Worker 註冊失敗', err);
    });
  });
}
