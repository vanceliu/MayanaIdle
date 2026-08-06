/**
 * Service Worker（`34-ui-guidelines.md` § 34.8 / `16-tech-frontend-architecture.md` § 32.18）。
 *
 * 目的是「裝到主畫面之後仍然打得開」。存檔本來就在 IndexedDB，
 * 只要程式碼與素材進得了快取，離線就能完整遊玩 —— 這是單機期最划算的一項。
 *
 * **不做 `skipWaiting()`**：遊戲跑起來之後才換掉 Service Worker，
 * 會讓 lazy chunk（Wiki）去要一份已經被新版部署換掉的檔名而 404。
 * 新版在下一次完全關閉分頁後生效，慢一點但不會把進行中的一局弄壞。
 */

/*
 * 快取版本直接取自註冊時帶的 `?v=<build commit>`。
 *
 * 這同時解決兩件事：檔名不同的 Service Worker 會被瀏覽器視為新的 worker 而自動更新，
 * 且不必為了寫死版本號另外加一個 build plugin。
 */
const BUILD = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `mayana-${BUILD}`;

/** 這個 SW 的作用範圍（GitHub Pages 部署在子路徑底下） */
const SCOPE = new URL(self.registration.scope).pathname;

self.addEventListener('install', event => {
  // 外殼先抓起來，第一次離線開啟才有東西可以用
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll([
      SCOPE,
      `${SCOPE}manifest.webmanifest`,
      `${SCOPE}icons/icon-192.png`,
      `${SCOPE}icons/icon-512.png`,
    ])).catch(() => {
      // 任何一項抓不到都不該讓安裝失敗（離線安裝、素材改名都可能發生）；
      // 少的那幾項之後由 fetch handler 補進來
    }),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 舊版本的快取整包丟掉：資產檔名帶 content hash，留著只是佔空間
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('mayana-') && n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // 跨網域一律不碰：排行榜 API 的回應快取起來只會讓玩家看到過期名次
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;

  /*
   * 導覽（開啟頁面）走 network-first：index.html 沒有 content hash，
   * 快取優先會讓玩家一直停在舊版，而舊版指向的資產檔名早就被部署換掉。
   */
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put(SCOPE, fresh.clone());
        return fresh;
      } catch {
        // 離線：回上一次成功載入的頁面
        return (await caches.match(SCOPE)) || Response.error();
      }
    })());
    return;
  }

  /*
   * 其餘同源資源走 cache-first。資產檔名帶 content hash（`vite.config.ts`），
   * 同一個檔名的內容永遠一樣，重新驗證沒有意義。
   */
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    // 只存成功的完整回應：opaque 與 206 存進去會在下次讀取時壞掉
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  })());
});
