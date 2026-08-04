import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** 建置時取 git short SHA；在沒有 git 的環境（例如從 tarball 建置）退回 'unknown' */
function gitCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/MayanaIdle/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    /**
     * 預設 500 是給「一般網站」的通用值 —— 那類站在意的是首次開啟的秒數。
     * 這是放置遊戲，開一次跑好幾小時，首屏多零點幾秒不是問題。
     *
     * 現在每個 chunk 邊界都是刻意切的，唯一超標的是 vendor-pixi（約 504 kB）：
     * 它是單一函式庫，拆不開、也不該拆（拆了就失去「穩定不變的一整塊」這個性質）。
     * 門檻設在它之上，讓真正失控的 chunk 仍然會叫 —— 一個永遠在響的警告等於沒有警告。
     */
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        /**
         * 把「幾乎不會變的第三方函式庫」與「每次部署都會變的自家程式碼」分開。
         *
         * 目的不是加快首次載入，是**快取粒度**：檔名帶 content hash，全部打成一包時
         * 改一行程式就整包換名字，回訪玩家要重抓 1.4 MB；拆開後 vendor 檔名不變，
         * 直接命中快取或 304，只有 app chunk 需要重抓。
         *
         * GitHub Pages 固定 `max-age=600` 且無法自訂 headers，這點更重要 ——
         * 超過 10 分鐘一定會回源驗證，此時「檔名有沒有變」就是要不要重傳的唯一依據。
         *
         * 規則以模組路徑判定，結果與模組載入順序無關，hash 才會穩定。
         */
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('node_modules/pixi.js') || id.includes('node_modules/@pixi')) {
              return 'vendor-pixi'
            }
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
              return 'vendor-react'
            }
            if (id.includes('node_modules/dexie')) return 'vendor-dexie'
            return
          }
          // seed 是資料，改動時機（數值平衡）與遊戲邏輯不同，各自獨立失效
          if (id.includes('/src/db/seed/')) return 'game-seed'
        },
      },
    },
  },
})
