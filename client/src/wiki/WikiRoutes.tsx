import { Routes, Route, Navigate } from 'react-router-dom'
import { WikiLayout } from './components/WikiLayout'
import { WikiHome } from './pages/WikiHome'
import { WeaponsPage } from './pages/WeaponsPage'
import { ArmorPage } from './pages/ArmorPage'
import { MonstersPage } from './pages/MonstersPage'
import { MapsPage } from './pages/MapsPage'
import { CraftingPage } from './pages/CraftingPage'
import { ExpTablePage } from './pages/ExpTablePage'
import { SkillsPage } from './pages/SkillsPage'
import { AttributesPage } from './pages/AttributesPage'
import { CombatPage } from './pages/CombatPage'
import { AffixesPage } from './pages/AffixesPage'
import { ItemsPage } from './pages/ItemsPage'
import { QuestsPage } from './pages/QuestsPage'
import { TalentsPage } from './pages/TalentsPage'
import { CreditsPage } from './pages/CreditsPage'

/**
 * Wiki 的整棵路由樹，由 `main.tsx` 以 `React.lazy` 動態載入。
 *
 * 抽成獨立模組是為了只留**一個**動態 import 邊界 —— 17 個頁面都是 named export，
 * 逐頁 lazy 要寫 17 次 `.then(m => ({ default: m.X }))` 包裝，而且會切出 17 個
 * 零碎 chunk。整包一次載入對「進 Wiki 後會連續翻好幾頁」的使用方式也比較合理。
 *
 * 路徑相對於 `main.tsx` 的 `/wiki/*`。
 */
export default function WikiRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WikiLayout />}>
        <Route index element={<WikiHome />} />
        <Route path="weapons" element={<WeaponsPage />} />
        <Route path="weapons/:name" element={<WeaponsPage />} />
        <Route path="armor" element={<ArmorPage />} />
        <Route path="armor/:name" element={<ArmorPage />} />
        <Route path="monsters" element={<MonstersPage />} />
        <Route path="monsters/:monsterName" element={<MonstersPage />} />
        <Route path="maps" element={<MapsPage />} />
        <Route path="maps/:areaId" element={<MapsPage />} />
        <Route path="crafting" element={<CraftingPage />} />
        <Route path="exp-table" element={<ExpTablePage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="attributes" element={<AttributesPage />} />
        <Route path="combat" element={<CombatPage />} />
        <Route path="affixes" element={<AffixesPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="items/:itemName" element={<ItemsPage />} />
        <Route path="quests" element={<QuestsPage />} />
        <Route path="talents" element={<TalentsPage />} />
        {/* 舊路徑：自動腳本改名為自動天賦，外面貼出去的連結不該變成 404 */}
        <Route path="scripts" element={<Navigate to="/wiki/talents" replace />} />
        <Route path="credits" element={<CreditsPage />} />
      </Route>
    </Routes>
  )
}
