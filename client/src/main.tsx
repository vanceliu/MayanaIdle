import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

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
