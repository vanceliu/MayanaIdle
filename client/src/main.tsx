import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initDisplaySettings } from './stores/settingsStore'
import { registerServiceWorker } from './registerServiceWorker'

// 開機就把存下來的介面／文字倍率套進 CSS 變數，避免先用預設大小閃一下
initDisplaySettings()

// 離線可玩 + 可安裝到主畫面（`47-mobile.md`）。開發模式會自行跳過
registerServiceWorker()

/**
 * Wiki 動態載入：多數玩家不會開 Wiki，沒必要讓它進主 bundle。
 * `/wiki/*` 比 `/*` 更具體，React Router 依具體度排序，不受宣告順序影響。
 */
const WikiRoutes = lazy(() => import('./wiki/WikiRoutes'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/MayanaIdle">
      <Routes>
        <Route
          path="/wiki/*"
          element={
            <Suspense fallback={<div className="wiki-loading">載入中…</div>}>
              <WikiRoutes />
            </Suspense>
          }
        />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
