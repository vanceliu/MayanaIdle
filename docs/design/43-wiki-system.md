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
│   ├── TalentsPage.tsx   — 自動天賦（三種類型的條件／動作、鑲材總表、合成鏈）
│   ├── DropsPage.tsx     — 掉落總覽
│   └── CreditsPage.tsx   — 第三方素材來源與授權
```

## 3. 資料來源

| Wiki 頁面 | 資料來源 |
|-----------|---------|
| 武器 | `EQUIPMENT_SEEDS`（`isWeaponEquipment(slot, type)`） |
| 防具 | `EQUIPMENT_SEEDS`（`isArmorEquipment(slot, type)`，含盾牌／魔導書／臂甲） |
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
| 自動天賦 | `COMBAT_*` / `PERSISTENT_*` / `SCRIPT_DEBUFF_LABELS`（`models/scriptEngine`）、`VILLAGE_*_LABELS`（`models/villageScript`）—— 條件與動作名稱與編輯器共用同一份常數，判定頻率為硬編碼文字（規格見 `03-combat.md` § 3.12~3.14、`49-village-script.md`；鑲材總表見 `51-auto-talent.md`） |
| 素材來源 | `ASSET_CREDITS`（`client/src/wiki/data/assetCredits.ts`），與 `client/src/assets/CREDITS.md` 同步維護 |

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
- `getWikiEquipmentPath(name)` — 裝備名稱轉詳細頁路徑（防具走 `/wiki/armor`，武器走 `/wiki/weapons`）。
  跨頁連到裝備詳細頁一律用這個，不可自行判斷 `type === 'armor'`（會把副手防具連錯頁）

## 4. 頁面功能

### 4.1 武器頁 (WeaponsPage)
- 列表模式：名稱、類型、對小怪／對大怪、**射程**、命中、額攻、材質、安定值、雙手、附加效果、職業限制、取得方式、掉落來源
- 詳細模式：`/wiki/weapons/:name`，含完整屬性、強化資訊
- 篩選：武器類型、材質、取得方式、關鍵字
- 排序：攻擊力、安定值、等級
- **不含盾牌／魔導書／臂甲**：三者分類是防具（`06-equipment.md` § 副手裝備），列在防具頁

### 4.2 防具頁 (ArmorPage)
- 列表模式：名稱、部位、防禦力、格擋率、**魔攻**、**材質**、安定值、附加屬性、職業限制、取得方式、掉落來源
- 詳細模式：`/wiki/armor/:name`
- 篩選：部位、取得方式、關鍵字
- 含左手三種副手防具；「部位」欄對副手不顯示 `leftHand`，而是分成盾牌／魔導書／臂甲三類，
  篩選與排序同樣以此三類為單位

### 4.2.1 詞綴頁 (AffixesPage)

版面原則：**一條詞綴只出現一次**。詞綴的「效果 ＋ 適用部位 ＋ 數值區間」全部集中在
〈詞綴一覽〉；階級與掉落機率是與詞綴種類無關的維度，各自獨立成節，不再重列一次詞綴清單。
表格一律控制在 4 欄以內，避免橫向捲動。

四個區塊：

1. **基本規則**：插槽數、同件不可重複、品質放大公式、強化上限（`DEFAULT_MAX_AFFIX_TIER`）、
   商店硬上限（`SHOP_MAX_AFFIX_TIER`）、特殊詞綴佔插槽。數字一律 import 常數，不寫死。
2. **詞綴一覽**：依 `07-affix.md` § 7.4 的分類小標分組（攻擊類／防禦類／補給類／掉落類／
   盾牌專屬／飾品盾牌專屬／特殊詞綴），每組一張 4 欄窄表：詞綴／適用部位／效果／數值區間。
   - 效果敘述與分類小標存在 `AFFIX_DEFINITIONS` 的 `description`／`group` 欄位，
     **不在 Wiki 端另寫一份**（否則會與 § 7.4 drift）
   - 數值區間 = `getAffixTierTable(type)` 的 T1 下限 ~ T7 上限，魔法抗性自動顯示 § 7.3.1 的專屬區間
   - 特殊詞綴同表列出，數值欄改顯示「固定效果 · Lv.N+ 掉落」
   - 附「適用部位」下拉篩選；選定部位時同時顯示該部位的可選詞綴數（`getAffixPoolForSlot`），
     取代舊版的 ✓／— 矩陣表
   - 分類對應的裝備欄位以文字說明：**魔導書與臂甲雖佔左手欄位，走的是防具詞綴池**
     （§ 7.6、`getAffixCategoryForSlot`），不可寫成武器
3. **階級數值**：T1~T7 的通用區間 + `AFFIX_TIER_OVERRIDES` 專屬區間（目前為魔法抗性）+ 取得方式。
   節末附滿值粗體顯示的說明（§ 7.3.2）：判定看未加品質的原始數值、特殊詞綴一律粗體
4. **掉落機率**：Tier 權重（一般怪物／Boss 對照，權重換算百分比）與特殊詞綴出現機率（含 Boss ×2）
5. **印記**：六種印記的作用與限制（`46-sigil.md`）。表格一律 import `SIGIL_DEFINITIONS`
   與 `ENHANCE_SIGIL_RATES`（`models/sigil.ts`），不在 Wiki 端重寫規則或機率。
   印記本身的重量／賣價／掉落率走道具頁（§ 4.5）與掉落頁，不在此重列

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
- 列表欄位：名稱、類型（藥水/卷軸/**印記**/材料/副本道具/魔法書）、說明、**用途**、重量、**購買價格**、**售價**
- 篩選：類型、用途（全部／僅有用途素材／僅純販售素材）、名稱關鍵字
- **「印記」是顯示層的虛擬類型**：印記在 seed 裡歸 `scroll`（`30-items.md` § 30.2），
  但玩家要查印記時不會想到去翻卷軸。`ItemDefinition.category` **不可為了 Wiki 的分類而改** ——
  那份 category 還被背包分類、批量販售的素材篩選吃著。
  Wiki 端以 `isSigilItemId()` 覆寫顯示與篩選，選「卷軸」時不會再看到印記
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
  顏色講稀有度、用途講這個道具拿去做什麼，不可合併成同一個欄位。
  用途不等於「進得了裝備配方」—— **六種印記都有用途**（印記師的各種加工），
  但一個都不在配方裡，所以詳細頁的裝備清單是選擇性的
- 詳細頁在有用途時列出「用途」區塊，並把配方素材連到對應的武器／防具詳細頁

### 4.6 技能頁 (SkillsPage)
- 通用魔法列表：等級、類型、屬性、目標、**射程**、威力、MP、冷卻、**持續**
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

### 4.12 自動天賦 (TalentsPage)
- 三種類型的判定時機與優先順序、各自的條件／動作對照表
- 天賦格與天賦配置規則、可照抄的範例配置
- 條件與動作名稱由 `models` 的標籤常數渲染，與編輯器共用同一份 ——
  面板改名 Wiki 會跟著動。判定頻率等數字為硬編碼文字
- **鑲材總表**：全部鑲材的 tier、型態（指定／池／自選）、適用類型、取得管道。
  **必須列出玩家尚未取得的** —— 編輯器只顯示已持有的（`51-auto-talent.md` § 51.10），
  「還有什麼可以刷」只有 Wiki 回答得了
- 合成鏈與成功率表、掉落 tier 的區域分帶（來源：`51-auto-talent.md`、`27-drop-table.md` § 27.9）

### 4.13 掉落 (DropsPage)
- 全區域掉落一覽（導航用，主要透過怪物/地圖頁查看）

### 4.14 素材來源 (CreditsPage)
- 列出版庫中收錄的**第三方素材**：用途、素材名稱、作者、授權、來源 URL、版庫路徑
- 授權與來源皆為可點擊外部連結（`target="_blank"` + `rel="noopener noreferrer"`）
- 呈現 CC BY 3.0 要求的標注文字原文
- 資料來源為 `client/src/wiki/data/assetCredits.ts` 的 `ASSET_CREDITS`；**新增第三方素材時必須同步更新**此常數與對應的 `client/src/assets/CREDITS.md`
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
/wiki/scripts      → ScriptsPage
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
| ScriptsPage | 判定頻率、優先順序、各條件的說明文字（名稱本身走常數） | `systems/scriptRunner.ts`、`systems/villageScriptRunner.ts`、`stores/gameStore.ts` |

### 已修正項目

- AttributesPage 職業初始屬性已對齊 `models/character.ts` 的 `CLASS_BASE_ATTRIBUTES`
- CombatPage 的「防禦上限 65」已修正為 `DAMAGE_REDUCTION_CAP`（75），並補上魔法傷害與魔法抗性
- 屬性上限說明已修正為兩段式：建角上限 18、Lv.51+ 上限 35

## 9. 擴充指引

新增 Wiki 頁面步驟：
1. 在 `client/src/wiki/pages/` 新增頁面元件
2. 在 `client/src/wiki/components/WikiLayout.tsx` 的 `NAV_ITEMS` 加入導覽項目
3. 在 `client/src/wiki/pages/WikiHome.tsx` 的 `CATEGORIES` 加入卡片
4. 在主路由設定加入對應 route
5. 若需新資料 hook，加入 `client/src/wiki/hooks/useWikiData.ts`
