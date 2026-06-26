import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { WikiLayout } from './wiki/components/WikiLayout'
import { WikiHome } from './wiki/pages/WikiHome'
import { WeaponsPage } from './wiki/pages/WeaponsPage'
import { ArmorPage } from './wiki/pages/ArmorPage'
import { MonstersPage } from './wiki/pages/MonstersPage'
import { MapsPage } from './wiki/pages/MapsPage'
import { CraftingPage } from './wiki/pages/CraftingPage'
import { ExpTablePage } from './wiki/pages/ExpTablePage'
import { SkillsPage } from './wiki/pages/SkillsPage'
import { AttributesPage } from './wiki/pages/AttributesPage'
import { CombatPage } from './wiki/pages/CombatPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/MayanaIdle">
      <Routes>
        <Route path="/wiki" element={<WikiLayout />}>
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
        </Route>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
