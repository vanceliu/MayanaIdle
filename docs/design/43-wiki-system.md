# 43 — In-App Wiki 系統

## 1. 概述

遊戲內建 Wiki 系統，提供玩家查閱所有遊戲資料（怪物、武器、防具、道具、技能、地圖、製作等）。
資料來源為 seed 資料與 models 常數，**非後端 API**，頁面以 React 元件直接讀取靜態資料渲染。

路由前綴：`/wiki`

## 2. 架構

```
client/src/wiki/
├── components/
│   ├── WikiLayout.tsx    — 整體版面（header + sidebar nav + <Outlet>）
│   ├── WikiLayout.css
│   └── WikiTable.css     — 共用表格樣式
├── data/
│   └── assetCredits.ts   — 第三方素材標注資料（非遊戲資料，故不放 hooks）
├── hooks/
│   └── useWikiData.ts    — 資料存取 hook（直接 import seed/model）
├── pages/
│   ├── WikiHome.tsx      — 首頁（分類卡片導覽）
│   ├── WikiHome.css
│   ├── WeaponsPage.tsx   — 武器列表 + 單件詳細
│   ├── ArmorPage.tsx     — 防具列表 + 單件詳細
│   ├── AffixesPage.tsx   — 詞綴適用部位、階級數值、掉落權重
│   ├── MonstersPage.tsx  — 怪物列表 + 單隻詳細（含掉落）
│   ├── MapsPage.tsx      — 地圖/區域結構
│   ├── ItemsPage.tsx     — 道具列表 + 單件詳細
│   ├── SkillsPage.tsx    — 通用魔法 + 職業專屬技能
│   ├── CraftingPage.tsx  — 鐵匠鋪配方
│   ├── ExpTablePage.tsx  — 等級經驗表
│   ├── AttributesPage.tsx— 屬性公式說明
│   ├── CombatPage.tsx    — 戰鬥計算公式
│   ├── QuestsPage.tsx    — 任務系統
│   ├── DropsPage.tsx     — 掉落總覽
│   └── CreditsPage.tsx   — 第三方素材來源與授權
```

## 3. 資料來源

| Wiki 頁面 | 資料來源 |
|-----------|---------|
| 武器 | `EQUIPMENT_SEEDS`（`type !== 'armor'`） |
| 防具 | `EQUIPMENT_SEEDS`（`type === 'armor'`） |
| 戰鬥計算 | `BASE_CHARACTER_DEFENSE`、`DAMAGE_REDUCTION_CAP`、`MAGIC_DEFENSE_EFFECTIVENESS`、`MAGIC_DEFENSE_CONTRIBUTION_CAP`（`systems/combat`）、`ACCESSORY_MAGIC_RESIST_PER_LEVEL`（`systems/enhancement`） |
| 詞綴 | `AFFIX_DEFINITIONS`、`SPECIAL_AFFIX_DEFINITIONS`、`AFFIX_TIERS`、`AFFIX_TIER_OVERRIDES`、`getTierWeights`／`getBossTierWeights`、`getSpecialAffixChance`（`models/affix`） |
| 怪物 | `MONSTER_SEEDS` |
| 地圖 | `ZONES`、`REGIONS`（`models/mapData`） |
| 道具 | `ITEM_DEFINITIONS` |
| 技能 | `SKILL_CATALOG`、`CLASS_SKILLS`、`CLASS_MAGIC_RESTRICTIONS` |
| 製作 | `CRAFTING_RECIPES`（`db/seed`） |
| 經驗表 | `getExpToNextLevel()`（`systems/levelUp`）—— 公式定義見 `04-character.md` § 4.9 |
| 屬性公式 | 硬編碼文字（對應 `systems/combat.ts` 計算） |
| 掉落 | `DROP_TABLE_SEEDS`、`BOSS_DROP_TABLE_SEEDS` |
| 任務 | `QUEST_TEMPLATES`、guild 相關 seed |
| 素材來源 | `ASSET_CREDITS`（`wiki/data/assetCredits.ts`），與 `client/src/assets/tiles/CREDITS.md` 同步維護 |

### useWikiData.ts 提供的 hook

- `useMonsterList()` / `useMonstersByArea(area)`
- `useWeaponList()` / `useArmorList()`
- `useEquipmentByName(name)` / `useEquipmentById(id)`
- `useDropTableByArea(area)` / `useBossDropTableByName(bossName)`
- `useDropSourceForItem(itemName)` / `useDropSourceForItemId(id)`
- `useZones()` / `useRegions()` / `useRegionById(id)`
- `getDropRate(dropValue)` — 將 dropValue 換算為百分比字串
- `getDropItemName(drop)` — 從 drop entry 取得顯示名稱
- `getAreaDisplayName(areaId)` — 區域 ID 轉中文名

## 4. 頁面功能

### 4.1 武器頁 (WeaponsPage)
- 列表模式：名稱、類型、對小怪／對大怪、**射程**、命中、額攻、材質、安定值、雙手、附加效果、職業限制、取得方式、掉落來源
- 詳細模式：`/wiki/weapons/:name`，含完整屬性、強化資訊
- 篩選：武器類型、材質、取得方式、關鍵字
- 排序：攻擊力、安定值、等級

### 4.2 防具頁 (ArmorPage)
- 列表模式：名稱、部位、防禦力、格擋率、安定值、附加屬性、職業限制
- 詳細模式：`/wiki/armor/:name`
- 篩選：部位、取得方式、關鍵字

### 4.2.1 詞綴頁 (AffixesPage)

- **適用部位對照表**：每個詞綴 × 武器／一般防具／盾牌／飾品 的 ✓／— 矩陣，
  外加各分類的可選詞綴總數。玩家要判斷「這個詞綴能不能出在這件裝備上」時看這張表。
- **分類對應部位**：說明 weapon／armor／shield／accessory 各自涵蓋哪些裝備欄位
  （飾品的裝備類型與一般防具同為 `armor`，但詞綴池獨立）
- **階級數值表**：通用區間 + `AFFIX_TIER_OVERRIDES` 的專屬區間（目前為魔法抗性）並列
- **掉落階級權重**：一般怪物／Boss 兩列對照，權重換算為百分比顯示
- **特殊詞綴**：清單、最低區域等級、各區域的出現機率（含 Boss ×2）

> 全頁不另存一份資料，一律從 `models/affix.ts` 讀取並即時計算，確保與實作同步。
> 新增或移除詞綴時本頁自動反映，無須改動頁面程式。

### 4.3 怪物頁 (MonstersPage)
- 列表：名稱、等級、HP、攻擊、防禦、經驗、屬性、種族、體型、Boss 標記、出沒區域
- 詳細頁：`/wiki/monsters/:name`，含掉落表（一般區域掉落 / Boss 專屬掉落 / 技能書掉落）
- 篩選：區域、屬性、種族、關鍵字
- 排序：等級、HP、防禦、經驗

### 4.4 地圖頁 (MapsPage)
- 區域列表：Zone → Region 層級結構
- 詳細頁：`/wiki/maps/:areaId`，含怪物分佈、掉落總覽、樓層資訊

### 4.5 道具頁 (ItemsPage)
- 列表欄位：名稱、類型（藥水/卷軸/材料/副本道具/魔法書）、說明、**用途**、重量、**購買價格**、**售價**
- 篩選：類型、用途（全部／僅有用途素材／僅純販售素材）、名稱關鍵字
- 詳細頁：`/wiki/items/:name`，同樣列出購買價格與售價，並附取得方式（商店/掉落/Boss/技能書池）
- 價格一律取自 `ITEM_DEFINITIONS`：
  - 購買價格 = `buyPrice`，無值顯示 `—`
  - 售價 = `sellPrice`；`noSell: true` 顯示「不可販售」，與「沒填價格」明確區分
  - **素材只有 `sellPrice` 沒有 `buyPrice`**，故售價欄不可省略，否則整批素材價格全空
- 圖示與顏色一律經由 `resolveItemIcon()`（`models/iconMap.ts`）取自 seed：
  `icon` / `iconColor` → `iconType` / `iconTier` → 類別預設值。
  **不可在 Wiki 端用道具名稱猜測圖示** —— 該作法會讓同一道具在背包與 Wiki 顯示成兩種樣子
  （曾導致解毒藥水／止血繃帶／淨化藥水在 Wiki 全部顯示為紅藥水圖）。
- 素材顏色圖例語意依 `39-batch-sell.md` § 39.3 的 iconTier 1~7 定義，色碼取自 `MATERIAL_TIER_COLORS`
- 「用途」欄取自 `systems/craftMaterialUsage.ts` 的 `formatMaterialUsage()`
  （`30-items.md` § 製作用途標記）。這是與顏色**互相獨立**的維度：
  顏色講稀有度、用途講進不進得了配方，不可合併成同一個欄位
- 詳細頁在有用途時列出「用途」區塊，並把配方素材連到對應的武器／防具詳細頁

### 4.6 技能頁 (SkillsPage)
- 通用魔法列表：等級、類型、屬性、目標、**射程**、威力、MP、冷卻
- 職業魔法學習限制表
- 職業專屬技能（按職業分組）：含需求武器、技能書名稱

### 4.7 鐵匠鋪 (CraftingPage)
- 製作配方列表：成品、所需材料與數量、材料來源區域連結

### 4.8 經驗表 (ExpTablePage)
- Lv.1~100 升級所需經驗、累計經驗

### 4.9 屬性公式 (AttributesPage)
- STR/DEX/CON/INT/WIS 各屬性效果公式文字說明

### 4.10 戰鬥計算 (CombatPage)

分區列出各項公式：物理攻擊、技能攻擊（魔法）、命中率、玩家防禦減傷、魔法抗性、
迴避率、爆擊、格擋、攻擊速度、元素克制關係。

- **各項上限直接 import `systems/combat.ts` 的常數**（`DAMAGE_REDUCTION_CAP`、
  `MAGIC_DEFENSE_EFFECTIVENESS`、`MAGIC_DEFENSE_CONTRIBUTION_CAP` 等），不再寫死數字
- 物理與魔法減傷並列，明確標示裝備防禦對魔法只有一半效力（貢獻上限 37.5%）
- 魔法抗性獨立成一節，說明「加進魔法減傷率」與「降低詛咒／虛弱／減速機率」兩個用途
- 公式敘述本身仍為文字，變更公式時需人工同步（有測試檢查關鍵常數與區塊是否存在）

### 4.11 任務 (QuestsPage)
- 冒險者工會等階、任務類型、獎勵

### 4.12 掉落 (DropsPage)
- 全區域掉落一覽（導航用，主要透過怪物/地圖頁查看）

### 4.13 素材來源 (CreditsPage)
- 列出版庫中收錄的**第三方素材**：用途、素材名稱、作者、授權、來源 URL、版庫路徑
- 授權與來源皆為可點擊外部連結（`target="_blank"` + `rel="noopener noreferrer"`）
- 呈現 CC BY 3.0 要求的標注文字原文
- 資料來源為 `wiki/data/assetCredits.ts` 的 `ASSET_CREDITS`；**新增第三方素材時必須同步更新**此常數與對應的 `CREDITS.md`
- 資料與元件分檔的原因：同一檔案同時匯出元件與常數會違反 `react-refresh/only-export-components`

## 5. 共用元件與樣式

- **WikiLayout** — 左側 sidebar 導覽列（NavLink），右側 `<Outlet>` 內容區
- **WikiTable.css** — 統一深色主題表格樣式（排序 header、數值靠右、badge、filter 控件）
- **GameIcon** — 裝備/道具圖示元件（SVG icon + 顏色）

## 6. 路由配置

Wiki 路由掛載於主應用 Router 下：

```
/wiki              → WikiHome
/wiki/weapons      → WeaponsPage (list)
/wiki/weapons/:name → WeaponsPage (detail)
/wiki/armor        → ArmorPage (list)
/wiki/armor/:name  → ArmorPage (detail)
/wiki/affixes      → AffixesPage
/wiki/monsters     → MonstersPage (list)
/wiki/monsters/:monsterName → MonstersPage (detail)
/wiki/maps         → MapsPage (list)
/wiki/maps/:areaId → MapsPage (detail)
/wiki/items        → ItemsPage (list)
/wiki/items/:name  → ItemsPage (detail)
/wiki/skills       → SkillsPage
/wiki/crafting     → CraftingPage
/wiki/exp-table    → ExpTablePage
/wiki/attributes   → AttributesPage
/wiki/combat       → CombatPage
/wiki/quests       → QuestsPage
/wiki/drops        → DropsPage
/wiki/credits      → CreditsPage
```

## 7. 資料正確性保證

Wiki 頁面直接 import seed 常數與 model 定義，**不存在複製資料**的問題。
只要 seed 資料更新，Wiki 自動反映最新內容。

硬編碼文字頁面（屬性公式、戰鬥計算）需人工維護與 `systems/combat.ts` 同步。

## 8. 已知差異與待修正

以下為 Wiki 頁面中的硬編碼文字，若底層公式變更需手動同步：

| 頁面 | 硬編碼內容 | 對應實作 |
|------|-----------|---------|
| AttributesPage | 屬性效果公式描述、初始屬性表 | `models/character.ts`、`systems/combat.ts` |
| CombatPage | 公式敘述文字（各項上限已改為 import 常數） | `systems/combat.ts` |
| SkillsPage | 職業學習條件文字 | `models/skillRestrictions.ts` |
| QuestsPage | 整頁硬編碼（任務類型、Boss 列表等） | 部分為未實作的設計前瞻內容 |

### 已修正項目

- AttributesPage 職業初始屬性已對齊 `models/character.ts` 的 `CLASS_BASE_ATTRIBUTES`
- CombatPage 的「防禦上限 65」已修正為 `DAMAGE_REDUCTION_CAP`（75），並補上魔法傷害與魔法抗性
- 屬性上限說明已修正為兩段式：建角上限 18、Lv.51+ 上限 35

## 9. 擴充指引

新增 Wiki 頁面步驟：
1. 在 `wiki/pages/` 新增頁面元件
2. 在 `wiki/components/WikiLayout.tsx` 的 `NAV_ITEMS` 加入導覽項目
3. 在 `wiki/pages/WikiHome.tsx` 的 `CATEGORIES` 加入卡片
4. 在主路由設定加入對應 route
5. 若需新資料 hook，加入 `wiki/hooks/useWikiData.ts`
