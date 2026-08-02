/**
 * 建置資訊：由 `vite.config.ts` 的 `define` 在建置時注入。
 *
 * 用途是回報問題時能一眼確認玩家跑的是哪一版 —— 例如判斷是不是卡在快取的舊 bundle。
 * 注意：這與 IndexedDB 的 schema 版本（`db/database.ts` 的 `this.version(n)`）無關，兩者各自獨立。
 *
 * vitest 沒有套用 `define`，故以 typeof 判斷後退回 'dev'，測試環境不會噴 ReferenceError。
 */

declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_INFO = {
  version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
  commit: typeof __BUILD_COMMIT__ !== 'undefined' ? __BUILD_COMMIT__ : 'dev',
  time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '',
} as const;

/** 畫面上顯示用的短字串，例如 `v0.0.0 · a1b2c3d`；開發模式為 `dev · dev` */
export function formatBuildLabel(): string {
  const version = BUILD_INFO.version === 'dev' ? 'dev' : `v${BUILD_INFO.version}`;
  return `${version} · ${BUILD_INFO.commit}`;
}

/** hover 時顯示的完整建置時間（本地時區） */
export function formatBuildTime(): string {
  if (!BUILD_INFO.time) return '開發模式';
  const date = new Date(BUILD_INFO.time);
  return Number.isNaN(date.getTime()) ? BUILD_INFO.time : `建置於 ${date.toLocaleString()}`;
}
