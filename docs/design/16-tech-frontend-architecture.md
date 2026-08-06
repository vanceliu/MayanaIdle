# 32. 前端架構設計

## 32.1 技術棧

| 層級 | 技術 | 版本 | 用途 |
|---|---|---|---|
| 框架 | React | 19 | UI 渲染 |
| 建置工具 | Vite | 8 | 開發伺服器 + 打包 |
| 語言 | TypeScript | 6 | 型別安全 |
| 狀態管理 | Zustand | 5 | 全域狀態（單一 store） |
| 離線資料庫 | Dexie | 4 | IndexedDB ORM（單機模式） |
| 測試 | Vitest + Testing Library | — | 單元 / 組件測試 |
| 樣式 | 純 CSS + Design Token | — | 無 Tailwind、無 CSS-in-JS |

---

## 32.2 專案目錄結構

```
client/
├── index.html
├── vite.config.ts
├── package.json
├── src/
│   ├── main.tsx              # 應用入口
│   ├── App.tsx               # 根組件（Phase 路由 + 版面）
│   ├── App.css               # 全域樣式（Design Token + 所有組件樣式）
│   ├── index.css             # 最小 reset
│   ├── stores/
│   │   ├── gameStore.ts      # Zustand 全域 Store
│   │   ├── mapControlStore.ts # 地圖/玩家位置/移動
│   │   ├── mapMonsterStore.ts # 地圖怪物生成與移動
│   │   ├── monsterHudStore.ts # 怪物列表 HUD 唯讀快照（§ 24.8.3）
│   │   └── panelWindowStore.ts # 浮動面板視窗開關 / 位置 / z 順序（§ 32.15）
│   ├── models/               # 資料模型 + 常數 + 純函數
│   │   ├── character.ts      # 角色、職業、屬性
│   │   ├── monster.ts        # 怪物模板 / 實例型別
│   │   ├── equipment.ts      # 裝備模板 / 實例、部位
│   │   ├── affix.ts          # 詞綴定義、Tier、生成邏輯
│   │   ├── skill.ts          # 技能目錄（50 技能 Lv1~10）、冷卻判定
│   │   ├── skillRestrictions.ts # 職業魔法學習限制
│   │   ├── skillTemplate.ts  # 技能模板定義
│   │   ├── classSkills.ts    # 職業技能定義
│   │   ├── scriptEngine.ts   # 腳本規則型別 + 預設腳本
│   │   ├── area.ts           # Zone / Region / Floor 型別
│   │   ├── mapData.ts        # 地圖常數（6 Zone、全面 area ID 分離）
│   │   ├── crafting.ts       # 製作相關型別（CraftTier, CraftMaterial, CRAFT_TIER_NAMES）
│   │   ├── items.ts          # 道具定義（ItemCategory、重量、getItemWeight）
│   │   ├── iconMap.ts        # Icon 映射（ITEM/EQUIP/EFFECT/SKILL_ICON_MAP）
│   │   ├── effect.ts         # ActiveEffect 型別定義
│   │   ├── quest.ts          # 任務型別定義
│   │   └── townScroll.ts     # 回城卷軸
│   ├── systems/              # 遊戲邏輯（純函數，不依賴 React）
│   │   ├── combat.ts         # 戰鬥計算（命中/迴避/傷害）
│   │   ├── pressure.ts       # Pressure 怪物生成機制
│   │   ├── levelUp.ts        # 經驗值 / 升級
│   │   ├── drops.ts          # 掉落判定 + 裝備生成
│   │   ├── regen.ts          # HP/MP 自然回復
│   │   ├── navigation.ts     # 地圖移動驗證
│   │   ├── scriptRunner.ts   # 腳本引擎（條件 → 動作）
│   │   ├── questSystem.ts    # 任務系統邏輯
│   │   ├── classSkillBookDrop.ts # 職業技能書掉落判定
│   │   ├── characterTransfer.ts  # 角色轉移邏輯
│   │   └── templateSync.ts   # 模板同步（DB 版本升級）
│   ├── hooks/                # 跨組件共用的 React hook
│   │   ├── useAutoScrollLog.ts   # 戰鬥日誌自動捲到底
│   │   ├── useEquipmentTemplates.ts # 裝備模板快取
│   │   └── useHudBand.ts     # 量測底部常駐 HUD 帶寬（§ 32.15.1）
│   ├── db/                   # 資料庫層
│   │   ├── database.ts       # Dexie schema 定義
│   │   └── seed.ts           # 初始化種子資料
│   ├── assets/
│   │   └── icons/            # Game-icons.net SVG 檔案
│   ├── components/           # React UI 組件
│   │   ├── CharacterCreate.tsx
│   │   ├── CharacterSelect.tsx  # 角色選擇畫面
│   │   ├── StatusPanel.tsx
│   │   ├── BuffBar.tsx       # 角色 Buff icon 列
│   │   ├── MonsterListOverlay.tsx # 地圖上方浮動怪物列表（含 debuff icon 列）
│   │   ├── FloatingWindow.tsx # 通用可拖曳浮動視窗（§ 32.15）
│   │   ├── PanelDock.tsx     # 底部面板按鈕列（§ 32.15）
│   │   ├── PanelWindows.tsx  # 浮動視窗容器（五個面板，§ 32.15）
│   │   ├── QuestTracker.tsx  # 任務按鈕（PanelDock）+ 任務內容（浮動視窗，§ 36.10.3）
│   │   ├── CharacterStats.tsx
│   │   ├── BattleView.tsx
│   │   ├── ExploreBar.tsx    # 探索控制列（自動/手動搜尋、探索/戰鬥指示）
│   │   ├── EquipmentPanel.tsx
│   │   ├── EquipmentInfo.tsx    # 統一裝備資訊顯示元件
│   │   ├── BagPanel.tsx
│   │   ├── SkillPanel.tsx
│   │   ├── CombatScriptEditor.tsx   # 戰鬥腳本編輯
│   │   ├── PersistentScriptEditor.tsx # 常駐腳本編輯
│   │   ├── ScriptEditor.tsx       # 舊版腳本編輯器（legacy）
│   │   ├── ScriptEditorPanel.tsx  # 自動腳本按鈕（PanelDock）+ 內容（浮動視窗，§ 32.16）
│   │   ├── AttributeUpModal.tsx # Lv50+ 屬性配點浮動視窗
│   │   ├── GameIcon.tsx      # 統一 icon 渲染元件
│   │   ├── Tooltip.tsx       # 通用 Tooltip 元件
│   │   ├── MapNavigation.tsx
│   │   ├── TownView.tsx
│   │   ├── QuickSlotBar.tsx
│   │   ├── Inventory.tsx     # 裝備背包列表元件
│   │   └── town/
│   │       ├── GeneralStore.tsx
│   │       ├── WeaponShop.tsx
│   │       ├── ArmorShop.tsx
│   │       ├── Inn.tsx
│   │       ├── MagicAcademy.tsx
│   │       ├── ClassGuild.tsx
│   │       ├── TownBlacksmith.tsx
│   │       └── Storage.tsx
│   ├── wiki/                 # 遊戲內建 Wiki 系統
│   │   ├── components/
│   │   │   └── WikiLayout.tsx
│   │   ├── hooks/
│   │   │   └── useWikiData.ts
│   │   └── pages/
│   │       ├── WikiHome.tsx
│   │       ├── ArmorPage.tsx
│   │       ├── AttributesPage.tsx
│   │       ├── CombatPage.tsx
│   │       ├── CraftingPage.tsx
│   │       ├── DropsPage.tsx
│   │       ├── ExpTablePage.tsx
│   │       ├── ItemsPage.tsx
│   │       ├── MapsPage.tsx
│   │       ├── MonstersPage.tsx
│   │       ├── SkillsPage.tsx
│   │       └── WeaponsPage.tsx
│   └── __tests__/
│       └── integration/
│           └── gameFlow.test.ts
```

---

## 32.3 應用架構

### Phase 路由

不使用 URL Router，以 `GamePhase` 狀態驅動畫面切換：

```
GamePhase = 'title' | 'characterSelect' | 'create' | 'explore' | 'combat' | 'result' | 'dead'
```

| Phase | 渲染內容 |
|---|---|
| `title` | 標題畫面 |
| `characterSelect` | 角色選擇畫面（最多 4 格位） |
| `create` | 角色建立（職業選擇 + 屬性配點） |
| `explore` / `combat` / `dead` | 單欄全寬遊戲主畫面 |

### 滿版遊戲畫面 + 浮動 HUD

遊戲畫面（`.stage-area`）鋪滿整個視窗，所有 HUD 以絕對定位疊在四角。
版面不再切成「頂部／中間／底部」三條 —— 那會讓地圖被兩條實心列夾住，
而 HUD 疊在畫面上是 ARPG 的通用做法（Diablo／PoE）。

```
┌───────────────────────────────────────────────────────────────────┐
│ ┌ .hud-topleft ────────┐        [怪物卡]        ┌ .hud-topright ┐ │
│ │ AA 元素師 Lv.8       │                        │「目前: 區域 ▼」│ │
│ │ ▓▓▓ HP ▓▓▓▓▓▓▓▓▓▓▓▓ │                        └───────────────┘ │
│ │ ▓▓▓ MP ▓▓▓▓▓▓▓▓▓▓▓▓ │                                          │
│ │ ▓▓▓ EXP ▓▓▓▓▓▓▓▓▓▓▓ │     .stage-area（滿版，inset: 0）        │
│ │ ▓ 負重 ▓  防禦: N    │     BattleView（Pixi canvas）            │
│ │ [⚡][🛡] ← BuffBar    │       城鎮也是一張地圖（§ 99.6）          │
│ └──────────────────────┘                                          │
│                                                                   │
│ ┌ CombatLogWindow ─────┐                                          │
│ │ 戰鬥紀錄          ⚙ │        ┌ .hud-bottomcenter ┐             │
│ │ 風刃 對 野牛 造成 9  │        │ [自動搜尋][手動搜尋]│             │
│ │ 野牛 被擊敗！    [▲] │        │ [1][2][3]...[0]    │             │
│ └──────────────────────┘        └────────────────────┘             │
│                                          ┌ .hud-bottomright ────┐ │
│                                          │[任務][詳細狀態][裝備]│ │
│                                          │[背包][技能][自動腳本]│ │
│                                          │ v0.0.1 Wiki 匯出 登出│ │
└──────────────────────────────────────────┴──────────────────────┴─┘
        ↓ PanelDock 按鈕開關 → 可拖曳、可多開、無遮罩的浮動視窗
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ 裝備欄     ✕ │  │ 背包       ✕ │  │ 自動腳本   ✕ │  六個面板一律
│ ...          │  │ ...          │  │ ...          │  走同一套機制
└──────────────┘  └──────────────┘  └──────────────┘  （§ 32.16）
```

**HUD 島（`.hud`）：** 全部 `position: absolute` + `z-index: 20`，貼在四角：

| 島 | 內容 |
|---|---|
| `.hud-topleft` | `StatusPanel`（角色卡）＋ `BuffBar`（接在卡片下方） |
| `.hud-topright` | `MapNavigation`（寬度必須與下拉選單一致，見下） |
| `CombatLogWindow` | 左下角，**可拖曳**（見 § 32.3.1） |
| `.hud-bottomcenter` | `ExploreBar` ＋ `QuickSlotBar`（10 格一排） |
| `.hud-bottomright` | `PanelDock`（3×2）＋ `GameToolbar`（版本號在 Wiki 左邊） |

> **HUD 容器不可吃滑鼠事件。** `.town-view` 曾因為保留舊的 `height: 100%`
> 又改成絕對定位，變成一塊 830×滿高的透明板壓在地圖上，玩家完全點不到地圖與 NPC。
> 容器一律 `pointer-events: none`，只有裡面的按鈕／面板 `pointer-events: auto`。
> **四個 `.hud-*` 島同樣適用**：島的盒子包含島內元素之間的空隙，以及城鎮那格
> `visibility: hidden` 的 `ExploreBar` 佔位，全都是看不見卻會擋點擊的區域 ——
> `.hud-bottomcenter` 的右緣曾剛好切在商店購買鈕中間，導致按鈕只有右側十幾 px
> 點得動。`CombatLogWindow` 雖然也掛 `.hud`，但它是實體視窗，不在此列。
> 改完要用 `document.elementFromPoint()` 驗「真滑鼠會打到誰」——
> 用 `dispatchEvent` 直接對 canvas 派事件會繞過命中測試，測不出這種問題。

**地圖選擇器：** 觸發鈕與下拉選單**必須同寬**（都 340px）。
選單另設 `min-width` 會比鈕寬，貼在右上角時直接頂出視窗外。

**城鎮與野外的一致性：** 城鎮沒有探索控制，但 `ExploreBar` 仍包在
`.explore-bar-slot` 內以 `visibility: hidden` 保留位置（`.is-hidden`），
否則快捷格會上下位移。不可改用「城鎮不渲染 ExploreBar」的寫法。

#### § 32.3.1 戰鬥紀錄視窗（CombatLogWindow）

常駐日誌是一個獨立的可拖曳視窗，城鎮與野外共用同一份
（`TownView`／`BattleView` 都不自己渲染日誌）。

- **預設停在左下角**；拖曳標題列可移動，位置存在 `localStorage`
  （`mayana.combatLogPos`），雙擊標題列或選單裡的「回到預設位置」可復原。
- 位置會夾在視窗內，至少留 40px 在畫面上 —— 拖到螢幕外就再也抓不回來。
- 標題列右側 `⚙` 展開視窗設定。**之後這個視窗要加的選項一律往 `.log-menu`
  多加一列，不要再往標題列塞控制項。** 目前有「背景透明度」（0~100 對應
  背景 alpha 0~0.95，存 `mayana.combatLogOpacity`）與「回到預設位置」。
- `▲` 循環三段大小：原大小 → 40vh → 70vh。視窗釘在左下角，長高就是往上長、
  蓋在遊戲畫面上（這是刻意的，見 § 99 的「日誌浮動是刻意設計」）。
- 讀取透明度時**不可寫成 `Number(getItem(...))`**：沒存過時 `getItem` 回 `null`，
  `Number(null)` 是 0，會被當成「使用者把透明度調到 0」，第一次開遊戲背景會全透明。

#### § 32.3.2 實體懸停名稱

滑鼠移到任何實體球體（玩家／怪物／NPC）上，頭上顯示名稱。

- 名稱**釘在球體上並跟著它移動**，不跟游標跑。
- 命中判定與標籤錨點都必須用**渲染時的小數座標**，不可取整到格子 ——
  玩家與怪物移動中畫在格子之間，取整會讓錨點差到半格（32px），永遠碰不到。
- 只有「名稱文字」進 React state；位置每幀由 ticker 直接寫 `transform`
  （走合成層、不觸發 layout），避免每幀 re-render。

### 背包面板（BagPanel）

固定 5 欄的 grid，格數依腰帶動態變動（基礎 50，最高 65）。可拖放自由擺放，位置只存在於當下 session（見 `35-inventory-constraints.md` § 35.1.3）。無收合功能，由浮動視窗 body 統一捲動。
- 有物品的格子顯示圖標 + 名稱 + 數量（badge 位於右上角）
- 空格保留邊框（與技能面板風格一致）
- 頂部顯示金幣資訊
- Hover 顯示 tooltip，右鍵可設快捷鍵或丟棄
- 「整理」按鈕：依類型排序（藥水 → 卷軸 → 素材 → 魔法書 → 裝備），同類按名稱排列，空格推到後方。toggle 開關，再按一次恢復原始順序
- Icon 渲染邏輯：potion 走專用路徑（顏色區分）、equipment 走裝備 icon、其餘一律走 `getItemIcon(getItemIconKey(name, type))`（排除法，新增類型無需改渲染代碼）

### 技能面板（SkillPanel）

以行為單位顯示，每行左側標示等級（Lv1~Lv10），每行 5 格。分為兩個獨立區塊：

1. **基礎魔法** — 10 行 × 5 格 = 50 格。每格對應 `SKILL_CATALOG` 的固定位置（按 level 分行，行內按 catalog 順序），已學習顯示內容，未學習顯示空格
2. **職業魔法** — 1 行 × 5 格。已習得的職業技能依序填入

每格顯示：元素色點、技能名稱（不顯示等級，由列首標示）。Hover 顯示 tooltip（威力/MP/冷卻/效果）。

`SKILL_CATALOG` 共 50 個技能（Lv1~10，每級 5 個），定義於 `models/skill.ts`。

### 格子統一樣式

背包與技能面板共用相同的格子視覺風格：
- 背景：`var(--bg-inset)`
- 邊框：`1px solid var(--border-subtle)`
- 最小高度：42px
- 間距：3px
- 空格保留邊框，不隱藏

---

## 32.4 狀態管理

### Store 設計（Zustand）

單一 Store（`gameStore.ts`），無 middleware，狀態結構：

| 類別 | 欄位 | 說明 |
|---|---|---|
| 核心 | `phase`, `character`, `monsters` | 遊戲階段、角色、當前怪物 |
| 使用者 | `userId`, `characterList` | 當前使用者 ID、角色列表（多角色支援） |
| 裝備 | `equippedGear`, `inventory` | 已裝備 / 背包裝備 |
| 背包 | `bagItems: BagItem[]` | 統一管理所有背包物品（藥水/卷軸/素材/魔法書） |
| 技能 | `skills` | 當前已學技能 |
| 效果 | `activeEffects` | 角色 buff + 怪物 debuff（ActiveEffect[]） |
| 戰鬥 | `combatLogs`, `selectedTargetIdx`, `lastDropResult` | 戰鬥日誌 / 目標 / 掉落結果 |
| 計時器 | `gameLoopId`, `hpRegenId`, `mpRegenId`, `persistentLoopId` | 各 interval ID |
| 腳本 | `combatRules`, `persistentRules`, `emergencyRetreat` | 戰鬥/常駐/緊急撤退 |
| 藥水 | `lastPotionUsedAt`, `lastPotionCooldown` | 藥水冷卻追蹤 |
| 戰鬥後 | `afterCombatHpThreshold`, `afterCombatMpThreshold`, `afterCombatHpResumeThreshold`, `afterCombatMpResumeThreshold` | 戰鬥後等待/恢復閾值（HP/MP %） |
| 搜尋 | `searchMode`, `isManualSearching`, `manualSearchId` | 自動/手動搜尋模式與狀態 |
| 快捷 | `quickSlots` | 10 格快捷鍵（鍵盤 1~9 與 0；藥水／狀態解除道具／卷軸／裝備，見 `35-inventory-constraints.md` § 35.7） |
| 倉庫 | `storedEquipment`, `storedMaterials`, `warehouseGold` | 城鎮倉庫（帳號共用） |

### BagItem 型別

```typescript
interface BagItem {
  name: string;
  type: 'material' | 'potion' | 'scroll' | 'spellbook';
  amount: number;
}
```

所有消耗品（藥水、卷軸、素材、魔法書）統一使用 `bagItems` 陣列管理，不再有獨立的 potions 計數器。

### 背包容量

- `BAG_BASE_SLOTS = 50` + `getBagMaxSlots(equippedGear)`（每個 BagItem 佔 1 格，裝備實例各佔 1 格；腰帶擴充見 `35-inventory-constraints.md` § 35.1）
- 掉落時背包已滿且無法堆疊 → 丟棄並顯示戰鬥日誌「背包已滿」
- Helpers：`getBagUsedSlots()`, `isBagFull()`, `getPotionCount()`, `addPotionToBag()`, `consumePotionFromBag()`
- **所有物品進入背包的入口都必須做容量檢查**：
  - 怪物掉落（`gameStore.ts` dropQueue 內）
  - 武器商店購買（`WeaponShop.tsx` `buyWeapon`）
  - 防具商店購買（`ArmorShop.tsx` `buyArmor`）
  - 雜貨店購買（`GeneralStore.tsx` `canAddToBag` + `buyBagItem`）
  - 鐵匠鋪製作裝備（`TownBlacksmith.tsx` `handleCraft`）
  - 魔法學院製作魔法書（`MagicAcademy.tsx`）
  - 倉庫取出（`Storage.tsx` `withdrawEquip` / `withdrawMaterial`）
  - 脫下裝備（`gameStore.ts` `unequipItem`）
  - 職業工會任務獎勵技能書（`gameStore.ts` `completeQuest`）
- 已有同名消耗品堆疊時不佔新格子，允許直接累加數量

### Store Actions

| Action | 說明 |
|---|---|
| `discardBagItem(name)` | 丟棄背包素材（amount - 1，歸零移除） |
| `discardInventoryItem(id)` | 丟棄背包裝備（從 inventory 移除 + 刪除 DB 記錄） |
| `saveState()` | 統一持久化（呼叫 saveGame + saveLocalPreferences） |

### 戰鬥日誌管理

- 統一使用 `addLog(logs, entry)` helper 新增紀錄
- 上限常數 `MAX_LOGS = 200`
- helper 負責 push + 超限截斷，其他地方不碰截斷邏輯

---

## 32.5 資料流

### 單機模式（當前）

```
┌──────────────┐     seed / load / save     ┌──────────────────┐
│  IndexedDB   │ ←──────────────────────────→│  Zustand Store   │
│  (Dexie)     │                             │                  │
└──────────────┘                             └────────┬─────────┘
                                                      │
                                              useGameStore(selector)
                                                      │
                                                      ▼
                                             ┌────────────────┐
                                             │ React 組件     │
                                             │ (呈現 + 互動)  │
                                             └────────────────┘
```

**寫入時機：**
- 角色建立
- 裝備穿脫
- 區域切換
- 升級（經驗/等級/HP/MP/金幣）
- 所有城鎮操作（購買、出售、製作、學習、休息、倉庫存取）
- 背包丟棄操作
- 戰鬥勝利 / 死亡

**持久化分層：**

| 儲存位置 | 內容 | 時機 |
|---|---|---|
| IndexedDB (Dexie) | 角色數值、bagItems、裝備實例、倉庫 | `saveState()` 呼叫時 |
| localStorage | 腳本規則、快捷鍵、戰鬥後等待閾值 | `saveLocalPreferences()` 呼叫時 |

`saveState()` 會同時觸發兩者，所有城鎮組件在 setState 後統一呼叫 `useGameStore.getState().saveState()`。

**不寫入的狀態：**
- 戰鬥中的即時 HP/MP 變化（僅勝利或死亡時存檔）
- 戰鬥日誌
- 計時器 ID

### 線上模式（未來）

```
┌──────────────┐                   ┌───────────────┐
│ React 組件   │ ←── state ────── │ Zustand Store │
└──────┬───────┘                   └───────┬───────┘
       │                                   │
       │ action                     sync / event
       ▼                                   ▼
┌──────────────┐     WebSocket      ┌──────────────┐
│  API Layer   │ ←────────────────→ │   Server     │
│  (client)    │     Socket.IO      │  (Node.js)   │
└──────────────┘                    └──────┬───────┘
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ PostgreSQL   │
                                    │  (Prisma)    │
                                    └──────────────┘
```

**線上化原則：**

| 項目 | 單機 | 線上 |
|---|---|---|
| 資料來源 | IndexedDB (Dexie) | Server API + WebSocket |
| 戰鬥計算 | Client 端 setInterval | Server 事件驅動 |
| 掉落判定 | Client rollDrops() | Server 計算，推送結果 |
| 裝備操作 | Client 直接寫 DB | Client 請求 → Server 驗證 → 回傳結果 |
| 計時器 | Client setInterval | Server 事件排程（避免高頻輪詢） |
| 腳本執行 | Client scriptRunner | Server 執行（防作弊） |
| 藥水使用 | Client 扣除 | Server 驗證冷卻 + 扣除 |

**遷移策略：**
1. 抽出 API Layer（adapter pattern），Store actions 呼叫 adapter 而非直接操作 DB
2. 單機模式 adapter 對接 Dexie，線上模式 adapter 對接 REST + WebSocket
3. 戰鬥系統改為事件驅動（server push），client 僅負責呈現

---

## 32.6 計時器架構

| 計時器 | 間隔 | 觸發條件 | 職責 |
|---|---|---|---|
| Game Loop | 每幀（PixiJS Ticker） | 地圖載入 + explore phase | 怪物生成、移動、FSM tick、戰鬥計算 |
| HP Regen | 5000ms | 角色存活時 | VIT 基礎回血（戰鬥中減半） |
| MP Regen | 6000ms | 角色存活時 | SPI 基礎回魔（戰鬥中減半） |
| Player Attack | 1200ms | `combat` phase | 玩家攻擊（腳本驅動） |
| Monster Attack | 1200ms (offset 600ms) | `combat` phase | 怪物攻擊 |
| Potion Timer | 300ms | 任何狀態 | 常駐腳本判定（藥水/buff/治癒） |

生命週期：
- 探索計時器隨 `startExploring()` / `stopExploring()` 啟停
- 回復計時器隨 `startRegen()` / `stopRegen()` 啟停
- 戰鬥計時器隨 `spawnCombat()` 建立，`clearCombatTimers()` 統一清除

---

## 32.7 腳本引擎

### 架構

腳本分為三層：

```
CombatRule[]     → evaluateCombatScript(rules, context) → CombatAction | null
PersistentRule[] → evaluatePersistentScript(rules, context) → PersistentAction | null
EmergencyRetreat → evaluateEmergencyRetreat(retreat, context) → RetreatAction | null
```

- 規則由上而下逐條評估，第一個條件符合且動作可執行的規則被選中
- 戰鬥腳本：player attack timer 觸發（攻擊、技能）
- 常駐腳本：persistent loop 觸發（喝水、buff、治癒），任何狀態下生效
- 緊急撤退：獨立判定（HP 低於閾值 → 回城）

### 戰鬥腳本條件類型

| 條件 | 參數 | 說明 |
|---|---|---|
| `always` | — | 永遠成立 |
| `monster_count_gte` | 數量 | 怪物數量 ≥ N |
| `monster_hp_below` | 閾值 (%) | 任一存活怪物 HP 低於百分比 |
| `monster_hp_above` | 閾值 (%) | 任一存活怪物 HP 高於百分比 |
| `mp_above` | 閾值 (%) | 角色 MP 高於百分比 |
| `mp_below` | 閾值 (%) | 角色 MP 低於百分比 |
| `skill_ready` | skillId | 指定技能冷卻完畢 |

### 戰鬥腳本動作類型

| 動作 | 參數 | 說明 |
|---|---|---|
| `skill` | skillId | 施放指定技能 |
| `normal_attack` | — | 普通攻擊 |

### 常駐腳本條件類型

| 條件 | 參數 | 說明 |
|---|---|---|
| `hp_below` | 閾值 (%) | HP 低於百分比 |
| `hp_above` | 閾值 (%) | HP 高於百分比 |
| `mp_below` | 閾值 (%) | MP 低於百分比 |
| `mp_above` | 閾值 (%) | MP 高於百分比 |
| `buff_not_active` | skillId | 指定 buff 未激活 |
| `speed_not_active` | — | 加速效果未激活 |
| `skill_ready` | skillId | 指定技能冷卻完畢 |
| `debuff_active` | debuffType | 指定狀態生效中（poison / bleed / curse_weaken / slow） |

### 常駐腳本動作類型

| 動作 | 參數 | 說明 |
|---|---|---|
| `potion` | potionType | 使用指定藥水（red/orange/white） |
| `speed_potion` | speedPotionType | 使用加速藥水（green/enhanced-green） |
| `heal_skill` | skillId | 施放治癒技能 |
| `buff_skill` | skillId | 施放 buff 技能 |
| `cure_item` | cureItemName | 使用狀態解除道具（解毒藥水/止血繃帶/淨化藥水） |

> 減速無解除道具，以 `speed_potion` 對沖（見 `24-buff-debuff.md` § 24.4.6）

### 緊急撤退

- 啟用開關 + HP 閾值（%）
- 動作：回城（指定卷軸 or 任意卷軸）— 瞬移逃跑已移除
- 僅戰鬥中生效

### 戰鬥後等待

- `afterCombatHpThreshold`（HP ≤ N% 時暫停行動）
- `afterCombatMpThreshold`（MP ≤ N% 時暫停行動）
- `afterCombatHpResumeThreshold`（HP ≥ N% 時恢復行動）
- `afterCombatMpResumeThreshold`（MP ≥ N% 時恢復行動）
- 設定值持久化至 localStorage

---

## 32.8 組件職責

### 核心組件

| 組件 | 職責 |
|---|---|
| `App` | DB 初始化、角色讀取、Phase 路由、版面結構 |
| `CharacterSelect` | 角色選擇畫面（最多 4 格位、建立/刪除/選擇） |
| `CharacterCreate` | 職業選擇、屬性配點、角色命名 |
| `StatusPanel` | 左上角浮動 HUD：角色名/職業/等級一列，HP/MP/EXP/負重＋防禦 四條由上往下堆疊 |
| `BuffBar` | 角色 buff/debuff icon 垂直欄，浮於 `.stage-area` 左上，每秒刷新倒數，hover tooltip |
| `FloatingWindow` | 通用可拖曳浮動視窗（標題列拖曳、點擊置頂、✕ 關閉、無遮罩） |
| `PanelDock` | 底部面板按鈕列（詳細狀態/裝備欄/背包/技能 + 自動腳本觸發鈕） |
| `PanelWindows` | 依 `panelWindowStore` 渲染六個面板的浮動視窗 |
| `QuestTracker` | `QuestTrackerButton`（PanelDock 內，帶任務數量 badge）+ `QuestTrackerContent`（浮動視窗內容） |
| `CharacterStats` | 六大屬性詳細數值、戰鬥數據（含詞綴 + buff + 裝備 regen 加成） |
| `BattleView` | Pixi 地圖容器、戰鬥日誌（含 log 大小切換） |
| `ExploreBar` | 探索控制（自動/手動搜尋）、探索/戰鬥指示、死亡橫幅；位於頂部 HUD |
| `MonsterListOverlay` | 地圖 canvas 上方置中浮動怪物列表：每隻怪一張卡片（名稱 + HP 條 + debuff icon 列），Boss 特殊底色，攻擊目標金框高亮（§ 24.8.3） |
| `EquipmentPanel` | 10 格裝備欄位顯示、穿脫操作 |
| `EquipmentInfo` | 統一裝備資訊顯示元件（名稱、攻擊/防禦、材質、品質、詞綴、職業），供商店/倉庫/背包共用 |
| `BagPanel` | 背包 grid（無收合），格數 = 50 + 腰帶擴充，支援拖放自由擺放（不持久化），GameIcon + tooltip + 右鍵選單，數量 badge 右上角 |
| `Inventory` | 裝備背包列表元件 |
| `CombatScriptEditor` | 戰鬥腳本規則 CRUD（僅攻擊技能/普攻） |
| `PersistentScriptEditor` | 常駐腳本規則 CRUD（喝水/加速藥水/buff/治癒） |
| `ScriptEditor` | 舊版腳本編輯器（legacy，供遷移保留） |
| `ScriptEditorPanel` | `ScriptEditorButton`（PanelDock 內，帶規則數量 badge）+ `ScriptEditorContent`（浮動視窗內容，含常駐/戰鬥兩個 tab，§ 32.16） |
| `AttributeUpModal` | Lv50+ 屬性配點浮動視窗，有未分配點數時自動顯示 |
| `GameIcon` | 統一 SVG icon 渲染（name, size, color），支援 Game-icons.net + Lucide |
| `Tooltip` | 通用 hover tooltip，用於 buff/裝備/物品/技能 |
| `MapNavigation` | 頂部 HUD 下拉式地圖選擇器（Zone → Region → Floor） |
| `TownView` | 疊在城鎮地圖上的設施快捷列 + 設施 Modal（地圖上的 NPC 見 § 13.2.1） |
| `QuickSlotBar` | 10 格快捷按鈕，GameIcon + 藥水顏色 + 數量顯示（見 `35-inventory-constraints.md` § 35.7） |
| `SkillPanel` | 技能面板：列首標示等級，5×10 基礎魔法（固定位置對應 SKILL_CATALOG）+ 5×1 職業魔法 |

### 城鎮設施組件

| 組件 | 職責 |
|---|---|
| `GeneralStore` | 購買/販售藥水、回城卷軸、強化卷軸（買1/買10）。磨刀石已下架，見 `06-equipment.md` § 壞刀機制 |
| `WeaponShop` | 按武器類型分類購買武器（含類型篩選 tab） |
| `ArmorShop` | 按部位購買防具 |
| `Inn` | 休息回復 HP/MP（完全休息/HP/MP 三種選項） |
| `MagicAcademy` | 兩個 tab：「學習魔法」（金幣學 1~3 級 / 魔法書學 4~10 級）、「製作魔法書」（碎片 + 材料合成） |
| `ClassGuild` | 職業技能書學習（消耗背包中的技能書） |
| `TownBlacksmith` | 裝備強化 / 製作 |
| `Storage` | 裝備與素材倉庫（帳號共用） |

所有城鎮組件在 setState 後統一呼叫 `useGameStore.getState().saveState()` 確保持久化。

### Wiki 系統組件

| 組件 | 職責 |
|---|---|
| `WikiLayout` | Wiki 頁面共用版面（側邊導航 + 內容區） |
| `WikiHome` | Wiki 首頁（功能總覽） |
| `ArmorPage` | 防具資料查詢 |
| `AttributesPage` | 屬性說明 |
| `CombatPage` | 戰鬥系統說明 |
| `CraftingPage` | 製作系統資料 |
| `DropsPage` | 掉落表查詢 |
| `ExpTablePage` | 經驗值表 |
| `ItemsPage` | 道具資料查詢 |
| `MapsPage` | 地圖資料查詢 |
| `MonstersPage` | 怪物資料查詢 |
| `SkillsPage` | 技能資料查詢 |
| `WeaponsPage` | 武器資料查詢 |

Hook：`useWikiData` — 從 DB 讀取模板資料供 Wiki 頁面使用。

**MagicAcademy 魔法書製作配方：**

| 魔法書 | 可學等級 | 碎片需求 | 材料需求 |
|---|---|---|---|
| 基礎魔法書 | 4~5 | 3 魔法書碎片 | 5 魔法書材料（基礎） |
| 中階魔法書 | 6~7 | 5 魔法書碎片 | 5 魔法書材料（中階） |
| 高階魔法書 | 8 | 10 魔法書碎片 | 10 魔法書材料（高階） |
| 稀有魔法書（上）| 9 | 20 魔法書碎片 | 20 魔法書材料（稀有） |
| 稀有魔法書（下）| 10 | 40 魔法書碎片 | 40 魔法書材料（稀有） |

---

## 32.9 樣式設計

### Design Token（CSS 自訂屬性）

```css
/* 色彩 */
--color-primary: #7C3AED        /* 主色（深紫） */
--color-bg-dark: #0F0F1A        /* 深色背景 */
--color-hp: #EF4444             /* HP 紅 */
--color-mp: #3B82F6             /* MP 藍 */
--color-exp: #F59E0B            /* EXP 金 */
--color-success: #10B981        /* 成功綠 */
--color-danger: #EF4444         /* 危險紅 */

/* 字型 */
--font-display: 'Chakra Petch'  /* 標題/顯示 */
--font-body: 'Noto Sans TC'    /* 本文/中文 */
--font-mono: 'Fira Code'       /* 等寬/數值 */
```

### 詞綴 Tier 顏色

| Tier | 顏色 | CSS Class |
|---|---|---|
| T1 | 灰色 | `.tier-1` |
| T2 | 亮灰 | `.tier-2` |
| T3 | 綠色 | `.tier-3` |
| T4 | 黃色 | `.tier-4` |
| T5 | 橙色 | `.tier-5` |
| T6 | 紅色 | `.tier-6` |
| T7 | 紫色 + 光暈 | `.tier-7` |

### 命名慣例

- BEM-like 風格：`.monster-card.dead`, `.affix-tag.tier-3`
- 動畫：`fadeIn`, `pulse`, `logFadeIn`, `glowPulse`
- 支援 `prefers-reduced-motion`

---

## 32.10 資料庫 Schema（單機模式）

使用 Dexie（IndexedDB ORM），Database: `MayanaIdleDB`

| Table | Primary Key | 索引 | 用途 |
|---|---|---|---|
| `users` | `++id` | `createdAt` | 使用者帳號 |
| `characters` | `++id` | `name, className, createdAt, userId` | 角色存檔 |
| `monsterTemplates` | `++id` | `name, area, level` | 怪物模板 |
| `equipmentTemplates` | `++id` | `name, type, slot` | 裝備模板（武器+防具+盾+飾品統一） |
| `equipmentInstances` | `++id` | `templateId, ownerId, equipped` | 裝備實例 |
| `dropTables` | `++id` | `area, itemType` | 掉落表（按 area ID 分離） |
| `bossDropTables` | `++id` | `bossName, itemType` | Boss 專屬掉落表 |
| `characterBag` | `++id` | `characterId, name, type` | 背包物品（BagItem 持久化） |
| `characterStorage` | `++id` | `characterId, name, type` | 角色個人倉庫 |
| `warehouses` | `++id` | `userId, name, type` | 帳號共用倉庫（素材 + 金幣） |

初始化：`seedDatabase()` 在 App mount 時執行，若 DB 空則寫入種子資料。

**localStorage 儲存（per character）：**

Key: `mayana_prefs_${characterId}`

| 欄位 | 說明 |
|---|---|
| `combatRules` | 戰鬥腳本規則 |
| `persistentRules` | 常駐腳本規則 |
| `emergencyRetreat` | 緊急撤退設定 |
| `quickSlots` | 快捷鍵配置 |
| `afterCombatHpThreshold` | 戰鬥後等待 HP 閾值 |
| `afterCombatMpThreshold` | 戰鬥後等待 MP 閾值 |
| `afterCombatHpResumeThreshold` | 戰鬥後恢復行動 HP 閾值 |
| `afterCombatMpResumeThreshold` | 戰鬥後恢復行動 MP 閾值 |

---

## 32.10a 副本地圖結構（mapData.ts）

多層副本使用 Region + `floors[]` 結構，seed area 以 `${regionId}-${floor}f` 格式對應各層。百柱塔維持獨立 Region。

| 副本 | 結構 | Region ID | Seed Area 格式 |
|---|---|---|---|
| 象牙塔 | 5 層 | `ivory-tower` | `ivory-tower-1f` ~ `ivory-tower-5f` |
| 龍谷地間 | 7 層 | `dragon-valley` | `dragon-valley-1f` ~ `dragon-valley-7f` |
| 遠古地監 | 9 層 | `ancient-dungeon` | `ancient-dungeon-1f` ~ `ancient-dungeon-9f` |
| 朦朧洞窟 | 3 層 | `misty-cave` | `misty-cave-1f` ~ `misty-cave-3f` |
| 水下監獄 | 4 層 | `underwater-prison` | `underwater-prison-1f` ~ `underwater-prison-4f` |
| 百柱塔 | 10 段（每 10 層一段） | 獨立 Region | `hundred-pillar-1-10f` ~ `hundred-pillar-91-100f` |

**掉落表分離原則：**
- 每個 area ID 有獨立的 dropTable 記錄
- 同副本不同樓層可掉落不同材料（例：象牙塔 2~3F 掉中階/高階材料，4~5F 掉稀有材料）
- 魔法書碎片掉率：雪原 5%、象牙塔各層 8%

---

## 32.11 設計原則

1. **Phase 驅動而非 URL 路由** — 單畫面遊戲不需要 URL 分頁
2. **單一 Store、無 middleware** — 簡單直觀，適合個人/小團隊
3. **Models 與 Systems 純函數** — 不依賴 React，可獨立測試
4. **內容即程式碼** — 怪物/裝備/配方以 TypeScript 常數定義，seed 進 IndexedDB
5. **計時器驅動遊戲循環** — 多個獨立 `setInterval`，適合 Idle 類遊戲（不需 rAF 精度）
6. **戰鬥日誌統一管理** — 所有 log 透過 `addLog` 入口，常數 `MAX_LOGS` 控制上限
7. **線上化預備** — 未來透過 adapter pattern 抽換資料來源，client 端邏輯不變

---

## 32.12 Icon 系統

### 資源來源

| 素材庫 | 授權 | 用途 |
|---|---|---|
| [Game-icons.net](https://game-icons.net) | CC BY 3.0 | buff/debuff icon、物品 icon、技能 icon |
| [Lucide Icons](https://lucide.dev) | ISC | 通用 UI（按鈕、導航、關閉等） |

### 目錄結構

```
client/src/assets/icons/
├── buffs/          # buff 相關 icon（精準、火焰、護盾…）
├── debuffs/        # debuff 相關 icon（暈眩、流血、毒…）
├── items/          # 物品 icon（藥水、卷軸、素材…）
├── equipment/      # 裝備 icon（武器類型、防具部位）
└── skills/         # 技能 icon
```

### `<GameIcon>` 元件規範

```typescript
interface GameIconProps {
  name: string;       // icon 名稱（對應檔名，不含 .svg）
  size?: number;      // 像素，預設 32
  color?: string;     // CSS color，預設 currentColor
  className?: string; // 額外 CSS class
}
```

- 以 inline SVG 渲染（非 `<img>`），支援 CSS 顏色覆蓋
- SVG 內部 fill/stroke 統一使用 `currentColor`
- 支援 `size` prop 同時設定 width/height

### Icon 映射（iconMap.ts）

```typescript
// buff/debuff category → icon name 映射
const EFFECT_ICON_MAP: Record<string, string> = {
  'accuracy': 'buffs/on-target',
  'fire-enchant': 'buffs/flaming-arrow',
  'defense-buff': 'buffs/shield-reflect',
  'speed': 'buffs/sprint',
  'crit-buff': 'buffs/crosshair',
  'cd-reduction': 'buffs/lightning-helix',
  'element-boost': 'buffs/embrassed-energy',
  'holy-shield': 'buffs/holy-symbol',
  'evasion': 'buffs/dodging',
  'poison-enchant': 'buffs/vile-fluid',
  'atk-debuff': 'buffs/fire-shield',
  'stun': 'debuffs/stoned-skull',
  'bleeding': 'debuffs/bleeding-wound',
  'poisoned': 'debuffs/poison-gas',
  'defense-down': 'debuffs/broken-shield',
};

// 物品 icon 映射
const ITEM_ICON_MAP: Record<string, string> = {
  'red-potion': 'items/standing-potion',
  'orange-potion': 'items/bubbling-flask',
  'white-potion': 'items/potion-ball',
  'scroll': 'items/scroll-unfurled',
  'town-scroll': 'items/tied-scroll',
  'spellbook': 'items/spell-book',
  'stone': 'items/cut-diamond',
  'whetstone': 'items/clay-brick',
  'material': 'items/cut-diamond',
  'key': 'items/three-keys',
};

// 裝備 icon 映射
const EQUIP_ICON_MAP: Record<string, string> = { ... };

// 技能元素 icon 映射
const SKILL_ICON_MAP: Record<string, string> = { ... };
```

**取得函數：**
- `getItemIcon(itemType)` — 物品 icon 路徑
- `getEquipIcon(equipType)` — 裝備 icon 路徑
- `getEffectIcon(category)` — buff/debuff icon 路徑
- `getSkillIcon(element)` — 技能元素 icon 路徑

### 物品 Icon 分類規則（BagPanel）

BagPanel 的 icon 渲染使用排除法：
1. `potionType` 存在 → 藥水專用路徑（帶顏色）
2. `type === 'equipment'` → 裝備 icon 路徑
3. 其他一律 → `getItemIcon(getItemIconKey(name, type))`

`getItemIconKey` 判斷邏輯：

| 條件 | Icon Key | 圖示 |
|------|----------|------|
| `type === 'spellbook'` | `spellbook` | 魔法書 |
| `type === 'scroll'` | `scroll` | 卷軸 |
| 名稱含「磨刀石」 | `whetstone` | 磚塊 |
| 名稱含其他「石」 | `stone` | 鑽石 |
| 其他 material | `material` | 鑽石（預設） |

### 道具重量規則（items.ts）

- `ItemCategory`: `'potion' | 'scroll' | 'material' | 'spellbook'`
- 所有重量 > 1 的道具減半（`Math.floor`），重量 = 1 的不變
- 魔法書重量：10
- `getItemWeight(name)` 函數查詢道具重量

### QuickSlotBar Icon

快捷鍵欄位使用 `<GameIcon>` 搭配藥水顏色渲染，取代純色塊：
- 紅色藥水 → `standing-potion` + `#DC2626`
- 橙色藥水 → `bubbling-flask` + `#F59E0B`
- 白色藥水 → `potion-ball` + `#E2E8F0`

---

## 32.13 Tooltip 元件

### `<Tooltip>` 通用規範

```typescript
interface TooltipProps {
  content: React.ReactNode;   // tooltip 內容（支援 JSX）
  children: React.ReactNode;  // 觸發元素
  position?: 'top' | 'bottom' | 'left' | 'right';  // 預設 'top'
  delay?: number;             // hover 延遲（ms），預設 200
}
```

- 以 hover 觸發，非 click
- 使用 Portal 渲染至 body，避免 overflow 裁切
- 自動偵測邊界翻轉位置
- 樣式：`var(--bg-card)` 背景、`var(--border)` 邊框、`var(--shadow-card)` 陰影

### Buff Tooltip 內容格式

```
┌──────────────────────┐
│ 🔥 火矢附魔          │  ← 效果名稱 + icon
│ 火屬性傷害 +15       │  ← 效果描述
│ 剩餘: 4:28           │  ← 剩餘時間
│ 來源: 火矢附魔 (Lv3) │  ← 來源技能
└──────────────────────┘
```

---

## 32.14 BuffBar 元件

### 位置

`.stage-area` 左上角絕對定位，垂直往下延伸（見 `24-buff-debuff.md` § 24.8.1）。
探索與城鎮共用同一容器，因此兩種情境下 buff 位置一致。
容器 `pointer-events: none` 不擋地圖點擊，icon 自身開啟 hover tooltip。

### 行為

- 讀取 Zustand store 中的 `activeEffects[]`（`type === 'buff'` 且 `target === 'player'`）
- 每秒（`setInterval(1000)`）重新計算各 buff 剩餘時間
- 過期清除不在 UI 層處理，由戰鬥 tick 統一移除

### 顯示規則

| 條件 | 顯示 |
|---|---|
| buff 數量 ≤ 8 | 全部顯示 |
| buff 數量 > 8 | 顯示前 8 個 + `+N` 計數 badge |
| 剩餘 < 5s | icon 閃爍（`animation: blink 0.5s infinite`） |
| 剩餘 ≥ 60s | 格式 `M:SS`（如 `4:58`） |
| 剩餘 < 60s | 格式 `Ns`（如 `42s`） |

### Store 擴充

`gameStore.ts` 新增欄位：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `activeEffects` | `ActiveEffect[]` | 角色 + 怪物的所有活動效果 |

新增 actions：

| Action | 說明 |
|---|---|
| `addEffect(effect)` | 新增效果，同 category buff 互蓋 |
| `removeEffect(id)` | 移除指定效果 |
| `clearExpiredEffects()` | 清除所有已過期效果（戰鬥 tick 呼叫） |

---

## 32.14a MonsterListOverlay 元件

### 位置

地圖 canvas 內、上方置中浮動（`.map-canvas-container` 的絕對定位子節點，與 Pixi canvas 為 sibling）。

完整顯示規格見 `24-buff-debuff.md` § 24.8.3。

### 資料流

怪物實體數值（`MonsterInstance`）由 `PixiGame` 的 ticker 以 ref 持有，React 層讀不到，
因此由 ticker 每 100ms 節流發佈唯讀快照到 `monsterHudStore`：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `entries` | `MonsterHudEntry[]` | id / name / currentHp / maxHp / isBoss，順序同生成順序 |
| `targetId` | `string \| null` | `PlayerCombatContext.targetMonsterId` |

- `publish(entries, targetId)` 內做淺層比對，內容未變則不寫入 store（避免無謂 re-render）
- 換地圖與組件卸載時呼叫 `clear()`
- Debuff 直接讀 `gameStore.activeEffects`（`type === 'debuff' && target === 'monster' && targetMonsterId === id`）

---

## 32.15 浮動面板視窗系統（PanelDock / FloatingWindow）

原本的左側分頁（詳細狀態 / 裝備欄）與右側分頁（背包 / 技能）已取消，
四個面板改為底部 `PanelDock` 按鈕觸發的可拖曳浮動視窗，讓 stage 左右滿版。

### 面板清單

| PanelKey | 標題 | 內容組件 | 預設寬度 |
|---|---|---|---|
| `stats` | 詳細狀態 | `CharacterStats` | 340px |
| `equipment` | 裝備欄 | `EquipmentPanel` | 360px |
| `bag` | 背包 | `BagPanel` | 420px |
| `skill` | 技能 | `SkillPanel` | 420px |
| `quest` | 進行中的任務 | `QuestTrackerContent` | 320px |
| `script` | 自動腳本 | `ScriptEditorContent` | 480px |

內容組件本身不變（拖放、右鍵選單、tooltip 行為完全沿用）。

`quest` 與 `script` 與其他四個共用同一套視窗機制（可拖曳、可多開、點擊置頂），差別在：
- 兩者的按鈕要顯示數量 badge，由 `QuestTrackerButton` / `ScriptEditorButton` 自行渲染，
  因此不在 `DOCK_PANEL_KEYS` 內，不走 PanelDock 的泛用按鈕迴圈
- `quest` 視窗加 `.is-translucent` 半透明修飾，預設位置在 stage 右上角（§ 36.10.3）
- `script` 視窗加 `.is-script` 固定高度修飾（§ 32.16）

### 視窗行為

- **可多開**：四個面板彼此獨立，無互斥
- **無遮罩**：不擋住 idle 進行中的畫面，也不擋「背包拖到地圖上＝丟棄」（§ 35.5.3）
- **可拖曳**：僅標題列可拖，位置夾制在 viewport 內；開啟時先把預設座標夾回可視範圍
- **點擊置頂**：z-index 由 `panelWindowStore.order` 決定（`PANEL_Z_BASE = 300`，末端最上層）
- **關閉**：標題列右上 ✕。標題列的 pointer capture 會讓 ✕ 的 `pointerup` 改派到標題列，
  因此 `handleDragStart` 必須在 target 位於 `.floating-window-close` 內時直接 return，否則 click 不觸發
- **位置持久化**：拖曳後的座標存 localStorage（`mayana_panel_positions`），全域 key、與角色無關 ——
  那是「這台機器上的使用習慣」而不是角色資料。**開關狀態與 z 順序仍不持久化**
  （每次進遊戲從乾淨畫面開始，與背包格子順序一致）

#### 位置持久化的三個必要細節

| 問題 | 作法 |
|---|---|
| 拖曳時每個 `pointermove` 都呼叫 `setPosition` | 寫入 **debounce 300ms**；另外掛 `pagehide` 立即 flush，關分頁不掉最後一筆 |
| 換到不同大小的瀏覽器視窗 | 存檔一併記下**當時的視窗尺寸**，載入時 `scalePositions()` 等比例換算。<br>只換算左上角，超出邊界交給 `FloatingWindow` 掛載時的 clamp 收尾 |
| 存檔壞掉／新增 PanelKey 後缺格 | `restoreLayout()` **逐面板**驗證，壞的那一格退回預設值，<br>不整份丟掉 —— 舊存檔缺新面板是正常升級路徑 |

存檔格式：

```json
{ "viewport": { "w": 1920, "h": 1080 },
  "positions": { "stats": { "x": 24, "y": 120 }, "...": {} } }
```

沒有 `viewport` 欄位（舊格式）或當下取不到視窗尺寸時，維持絕對座標不換算。
逃生門：顯示設定的「重設視窗位置」→ `resetPositions()`，清存檔並回到預設停靠位置。

### 狀態（`stores/panelWindowStore.ts`）

| 欄位 / Action | 說明 |
|---|---|
| `open: Record<PanelKey, boolean>` | 各面板開關 |
| `positions: Record<PanelKey, {x,y}>` | 各面板左上角座標 |
| `order: PanelKey[]` | z 順序，末端為最上層 |
| `toggle(key)` | 開 ↔ 關；開啟時同時置頂 |
| `openPanel(key)` / `closePanel(key)` | 明確開 / 關（關閉保留位置） |
| `focusPanel(key)` | 置頂，不改開關狀態 |
| `setPosition(key, pos)` | 更新座標（夾制由 `FloatingWindow` 負責） |
| `closeAll()` | 全部關閉 |
| `resetPositions()` | 回到預設停靠位置並清掉 localStorage 存檔 |

### 結構

```tsx
<PanelDock>              // 底部按鈕列（與 QuickSlotBar 同排）
  <QuestTrackerButton /> + [詳細狀態][裝備欄][背包][技能] + <ScriptEditorButton />
</PanelDock>

<PanelWindows>           // 依 store.open 渲染
  <FloatingWindow panelKey="stats">     <CharacterStats /></FloatingWindow>
  <FloatingWindow panelKey="equipment"> <EquipmentPanel /></FloatingWindow>
  <FloatingWindow panelKey="bag">       <BagPanel /></FloatingWindow>
  <FloatingWindow panelKey="skill">     <SkillPanel /></FloatingWindow>
  <FloatingWindow panelKey="quest"  className="is-translucent"><QuestTrackerContent /></FloatingWindow>
  <FloatingWindow panelKey="script" className="is-script">    <ScriptEditorContent /></FloatingWindow>
</PanelWindows>
```

---

### 32.15.1 視窗層級（windowLayerStore）

畫面上會互相重疊的「視窗」不只浮動面板，還有**戰鬥日誌、城鎮設施視窗、地圖選擇器**。
四者共用 `stores/windowLayerStore.ts` 的同一個堆疊順序：**點到誰誰就到最上層**。

| 層 | z-index | 說明 |
|---|---|---|
| 地圖／角色卡等一般 HUD | 20 | 不參與堆疊 |
| 視窗帶狀區間 | 500 + 順序 | 浮動面板、戰鬥日誌、城鎮設施視窗、地圖選擇器 |
| 常駐 HUD 控制 | 800 | 快捷格、面板按鈕列 —— **永遠壓在視窗之上**，否則開了設施視窗就點不到 |

- 各視窗根元素以 inline `style={{ zIndex }}` 讀取，`onPointerDown` 呼叫 `focusWindow(key)`。
- **不可再靠 CSS 寫死 z-index 決勝負**：`.town-view` 與 `.hud` 都是 20 時只能比 DOM 順序，
  結果戰鬥日誌永遠蓋住城鎮設施視窗（點武器店也蓋不過去）。
- `focusWindow` 對已在頂端的視窗不寫入狀態，避免每次 pointerdown 觸發整批視窗重繪。

**視窗必須主動讓開底部的常駐 HUD 帶。** 常駐 HUD 是 800，永遠贏，所以城鎮設施視窗的
底部動作列（§ 34.1）只要伸進那條帶子就變成「看得到、點不到」。帶寬**不可寫死**：
快捷格會隨視窗寬度換行、整條 HUD 又吃 `--ui-scale`，實測 152~190px 都出現過。

- `hooks/useHudBand.ts` 的 `useHudBandBottom()` 量 `.hud-bottomcenter` 與
  `.hud-bottomright` 的**島內元素**（不是島本身，`visibility: hidden` 的佔位格跳過），
  取最上緣算出帶寬寫進 `--hud-band-bottom`，`.town-modal-overlay` 的 padding 讀它。
- **`zoom` 改變不會觸發 `ResizeObserver`**（版面盒沒變，只有算繪結果被乘上倍率），
  所以 hook 另外訂閱 `settingsStore.uiScale`，靠 effect 重跑重量。

---

## 32.16 自動腳本浮動視窗（ScriptEditorPanel）

> **設計變更（使用者要求）**：原本明定「腳本編輯為設定用途，維持置中 overlay modal、
> 非 `FloatingWindow`」。因 modal 無法移動、且會遮住 idle 進行中的畫面，
> 已改為與其他面板一致的可拖曳浮動視窗。**不可再改回 modal 形式。**

### 觸發

- 底部 `PanelDock` 最右側顯示「自動腳本」按鈕（含規則數量 badge，沿用 `.panel-dock-btn` 樣式）
- 點擊按鈕開關 `PanelKey = 'script'` 浮動視窗；`script` 與 `quest` 同理不在 `DOCK_PANEL_KEYS`
  內（按鈕要帶 badge，由 `ScriptEditorButton` 自行渲染）

### 行為

- 完全沿用 § 32.15 的視窗行為：標題列拖曳（位置夾制在 viewport 內）、可多開、
  點擊置頂、右上角 ✕ 關閉、**無遮罩**、開關與位置不持久化
- 視窗寬 480px、高 `82vh`（`.floating-window.is-script`）。
  固定高度是為了讓 tab 列釘在頂端、只有規則清單捲動 ——
  若沿用 `.floating-window-body` 預設的 auto 高度 + `overflow-y`，捲動會發生在 body 上而把 tab 一起帶走
- 內容為兩個 tab：常駐腳本 + 戰鬥腳本，預設為常駐腳本（tab 選擇為視窗內 local state，關閉即重置）
- 常駐腳本含：規則 CRUD、排序、緊急撤退設定、戰鬥後等待/恢復閾值（HP/MP %）
- 戰鬥後等待閾值修改後自動 saveState 持久化
- 關閉後腳本規則保留（state 存在 Zustand，不隨視窗 unmount 消失）

### 組件

| 匯出 | 說明 |
|---|---|
| `ScriptEditorButton` | PanelDock 內的觸發鈕（帶規則數量 badge） |
| `ScriptEditorContent` | 視窗內容（tab 列 + `PersistentScriptEditor` / `CombatScriptEditor`），由 `PanelWindows` 包在 `FloatingWindow` 內渲染 |

## 32.17 行動裝置模組邊界

行動裝置支援走**響應式單一版面**，規範全文見 `34-ui-guidelines.md` § 34.8。
這裡只定模組邊界：

| 模組 | 職責 | 邊界 |
|---|---|---|
| `hooks/useViewport.ts` | `isMobile` / `isTouch` / `orientation` 的**唯一真相來源** | 其他元件不得自己 `matchMedia` 或讀 `window.innerWidth` |
| `hooks/useLongPress.ts` | 長按＝右鍵。右鍵路徑與長按進同一個 handler | 不碰版面，只產生一組 pointer handlers |
| `stores/dragStore.ts` | 指標拖放的狀態與落點命中測試 | 只知道 `data-drop-kind` 這個 DOM 契約，不知道背包／快捷格的語意 |
| `components/DragGhost.tsx` | 跟著指標跑的殘影 | 掛在 `GameLayout` 最外層，portal 到 body（來源面板會被 `zoom` 縮放） |
| `hooks/useHudBand.ts` | `--hud-band-bottom` / `--hud-band-top` 的量測 | 帶子成形（手機）時量整條帶子，否則逐一量島內元素 |

`.hud-topbar` / `.hud-bottombar` 兩個容器在桌機是 `display: contents` ——
容器從版面樹上消失，四座島仍各自貼角，§ 32.3 的版面一個 px 都沒有改變。
用它而不是條件渲染，是為了不讓兩種版面各長一份 JSX。

## 32.18 PWA（可安裝／離線）

規範見 `34-ui-guidelines.md` § 34.8，這裡只定模組邊界與硬性要求。

| 檔案 | 角色 |
|---|---|
| `public/manifest.webmanifest` | 安裝資訊（名稱、圖示、`start_url`／`scope` 都在 `/MayanaIdle/` 底下） |
| `public/sw.js` | Service Worker。**不經過 Vite 處理**，因此不可用 `import`／`import.meta.env` |
| `public/icons/` | `app-icon.svg`（來源）＋ 由它產出的 192／512 PNG |
| `src/registerServiceWorker.ts` | 註冊入口，由 `main.tsx` 在開機時呼叫 |

| 要求 | 原因 |
|---|---|
| SW 註冊網址帶 `?v=<build commit>` | 檔名不同瀏覽器才會視為新的 worker 而自動更新；SW 直接拿這個字串當快取版本，不必為了寫死版本號另加 build plugin |
| **開發模式不註冊，並主動解除既有註冊** | SW 會把 Vite 的模組路徑一起快取，HMR 之後畫面停在舊版，症狀看起來像「改了沒生效」 |
| **不做 `skipWaiting()`** | 遊戲跑起來之後才換掉 SW，會讓 lazy chunk（Wiki）去要一份已被新版部署換掉的檔名而 404 |
| 導覽請求 network-first | `index.html` 沒有 content hash，快取優先會讓玩家一直停在舊版，而舊版指向的資產早就被換掉 |
| 其餘同源資源 cache-first | 資產檔名帶 content hash，同一個檔名的內容永遠一樣，重新驗證沒有意義 |
| 跨網域一律不碰 | 排行榜 API 的回應快取起來只會讓玩家看到過期名次 |
| 圖示 SVG 的註解不可有連續兩個 ASCII 連字號 | XML 註解語法限制，違反時整份 SVG 解析失敗、圖示靜默變空白 |

存檔本來就在 IndexedDB，因此「程式碼與素材進得了快取」等於**離線完整可玩**。

## 32.15 環境地圖模組邊界

- `models/mapControl.ts`：MapData、theme、tile catalog、通行/生成/高度 contract。
- `models/mapDataControl.ts`：靜態 JSON lazy load、runtime validation、cache；未知 ID 不 fallback。
- `systems/pathfinding.ts` / `lineOfSight.ts`：只依賴上述純資料 contract，不依賴 React、Zustand 或 Pixi。
- `pixi/mapRenderPlan.ts`：將 MapData 轉成純 draw plan；`mapThemes.ts` 管理視覺色盤。
- JSON 保持靜態內容與單一 numeric tiles grid，便於未來 server/CDN 發佈且避免 gameplay 與 renderer 各自維護 elevation。
