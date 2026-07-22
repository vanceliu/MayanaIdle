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
│   │   └── gameStore.ts      # Zustand 全域 Store
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
│   │   ├── LeftPanelTabs.tsx # 分頁容器（詳細狀態 / 裝備欄）
│   │   ├── CharacterStats.tsx
│   │   ├── BattleView.tsx
│   │   ├── EquipmentPanel.tsx
│   │   ├── EquipmentInfo.tsx    # 統一裝備資訊顯示元件
│   │   ├── BagPanel.tsx
│   │   ├── RightPanel.tsx
│   │   ├── SkillPanel.tsx
│   │   ├── CombatScriptEditor.tsx   # 戰鬥腳本編輯
│   │   ├── PersistentScriptEditor.tsx # 常駐腳本編輯
│   │   ├── ScriptEditor.tsx       # 舊版腳本編輯器（legacy）
│   │   ├── ScriptEditorModal.tsx  # 浮動視窗（含戰鬥/常駐兩個 tab）
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
| `explore` / `combat` / `dead` | 三欄遊戲主畫面 |

### 三欄版面

```
┌──────────────────┬──────────────────────┬────────────────┐
│    左側面板       │      中央面板         │    右側面板     │
│   (330px)        │     (flex: 1)        │    (400px)      │
├─────────────────┼──────────────────────┼──────────────────┤
│ StatusPanel     │ MapNavigation (下拉)  │ [背包] [技能]    │
│ BuffBar         │ BattleView           │ ─────────────── │
│ LeftPanelTabs   │   或 TownView        │ BagPanel         │
│  ├ 詳細狀態     │ QuickSlotBar         │   或 SkillPanel  │
│  └ 裝備欄       │                      │                  │
│ [自動腳本] btn  │                      │                  │
└─────────────────┴──────────────────────┴──────────────────┘

浮動視窗（overlay）：
┌─────────────────────────────┐
│       ScriptEditorModal     │
│  （點擊「自動腳本」按鈕觸發）  │
│  [常駐腳本] [戰鬥腳本] tab   │
└─────────────────────────────┘
```

**左側面板結構：**
1. `StatusPanel` — 角色名/職業/等級 + HP/MP bar + 負重bar+防禦值 + EXP bar + 區域
2. `BuffBar` — 角色 buff icon 列（見 § 32.12）
3. `LeftPanelTabs` — 分頁切換「詳細狀態」(CharacterStats) 和「裝備欄」(EquipmentPanel)
4. 「自動腳本」按鈕 — 點擊彈出 `ScriptEditorModal` 浮動視窗（含常駐/戰鬥兩個 tab）

中央面板最上方為 `MapNavigation` 地圖選擇器，以「目前: 區域名 ▼」的下拉面板呈現，
點擊展開 Zone → Region → Floor 階層導航。

中央面板主內容根據 `region.type` 判斷：
- `town` → 顯示 `TownView`（城鎮設施）
- `field` / `dungeon` → 顯示 `BattleView`（戰鬥 / 探索）

### 右側面板分頁系統

右側面板使用 `RightPanel` 容器管理分頁切換：

| 分頁 | 組件 | 說明 |
|---|---|---|
| 背包 | `BagPanel` | 藥水/素材/卷軸/魔法書/裝備格子 |
| 技能 | `SkillPanel` | 基礎魔法 + 職業魔法列表 |

分頁 UI 使用 pill-style segmented control（與城鎮設施內部分頁一致）。

### 背包面板（BagPanel）

固定 5 欄 × 100 格的 grid。無收合功能，由右側面板統一捲動。
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
| 快捷 | `quickSlots` | 5 格快捷鍵（藥水） |
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

- `BAG_MAX_SLOTS = 100`（每個 BagItem 佔 1 格，裝備實例各佔 1 格）
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

### 常駐腳本動作類型

| 動作 | 參數 | 說明 |
|---|---|---|
| `potion` | potionType | 使用指定藥水（red/orange/white） |
| `speed_potion` | speedPotionType | 使用加速藥水（green/enhanced-green） |
| `heal_skill` | skillId | 施放治癒技能 |
| `buff_skill` | skillId | 施放 buff 技能 |

### 緊急撤退

- 啟用開關 + HP 閾值（%）
- 動作：回城（指定卷軸 or 任意卷軸）
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
| `StatusPanel` | 角色名/職業/等級、HP/MP 進度條、負重條+防禦值、EXP 進度條、區域 |
| `BuffBar` | 角色 buff icon 列，每秒刷新倒數，hover tooltip |
| `LeftPanelTabs` | 分頁容器，切換 CharacterStats / EquipmentPanel |
| `CharacterStats` | 六大屬性詳細數值、戰鬥數據（含詞綴 + buff + 裝備 regen 加成） |
| `BattleView` | 探索控制（自動/手動）、怪物卡片（含 debuff icon 列）、戰鬥日誌、死亡橫幅 |
| `EquipmentPanel` | 10 格裝備欄位顯示、穿脫操作 |
| `EquipmentInfo` | 統一裝備資訊顯示元件（名稱、攻擊/防禦、材質、品質、詞綴、職業），供商店/倉庫/背包共用 |
| `BagPanel` | 背包固定 100 格 grid（無收合），GameIcon + tooltip + 右鍵選單，數量 badge 右上角 |
| `Inventory` | 裝備背包列表元件 |
| `CombatScriptEditor` | 戰鬥腳本規則 CRUD（僅攻擊技能/普攻） |
| `PersistentScriptEditor` | 常駐腳本規則 CRUD（喝水/加速藥水/buff/治癒） |
| `ScriptEditor` | 舊版腳本編輯器（legacy，供遷移保留） |
| `ScriptEditorModal` | 浮動視窗，含常駐/戰鬥兩個 tab，按鈕觸發 overlay |
| `AttributeUpModal` | Lv50+ 屬性配點浮動視窗，有未分配點數時自動顯示 |
| `GameIcon` | 統一 SVG icon 渲染（name, size, color），支援 Game-icons.net + Lucide |
| `Tooltip` | 通用 hover tooltip，用於 buff/裝備/物品/技能 |
| `MapNavigation` | 中央面板頂部下拉式地圖選擇器（Zone → Region → Floor） |
| `TownView` | 城鎮 NPC 列表 + 設施 Modal |
| `QuickSlotBar` | 5 格快捷藥水按鈕，GameIcon + 藥水顏色 + 數量顯示 |
| `RightPanel` | 右側面板分頁容器（背包/技能切換） |
| `SkillPanel` | 技能面板：列首標示等級，5×10 基礎魔法（固定位置對應 SKILL_CATALOG）+ 5×1 職業魔法 |

### 城鎮設施組件

| 組件 | 職責 |
|---|---|
| `GeneralStore` | 購買/販售藥水、卷軸、磨刀石、強化卷軸（買1/買10） |
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
  'chain-cast': 'buffs/concentration-orb',
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

左側面板 `StatusPanel` 正下方、`LeftPanelTabs` 之上。

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

## 32.15 左側面板分頁（LeftPanelTabs）

### 行為

- 兩個分頁：「詳細狀態」、「裝備欄」
- 預設顯示「裝備欄」分頁
- 分頁 header 使用與 RightPanel 相同的 pill-style segmented control
- CharacterStats 和 EquipmentPanel 移除各自的 collapsible 行為，改為分頁內全展開

### 結構

```tsx
<LeftPanelTabs>
  ├ Tab "詳細狀態" → <CharacterStats />
  └ Tab "裝備欄"   → <EquipmentPanel />
</LeftPanelTabs>
```

---

## 32.16 ScriptEditor 浮動視窗（ScriptEditorModal）

### 觸發

- 左側面板底部顯示「自動腳本」按鈕（含規則數量 badge）
- 點擊按鈕彈出居中 overlay modal

### 行為

- Modal 背景半透明遮罩（`rgba(0,0,0,0.6)`），點擊遮罩關閉
- Modal 內容區固定寬度 480px，高度 85vh，內部可捲動
- 內容區（`.script-editor-content`）高度 100% 填滿 modal-body，無固定上限
- 右上角 × 關閉按鈕
- 內容為兩個 tab：常駐腳本 + 戰鬥腳本
- 常駐腳本含：規則 CRUD、排序、緊急撤退設定、戰鬥後等待/恢復閾值（HP/MP %）
- 戰鬥後等待閾值修改後自動 saveState 持久化
- 關閉後狀態保留（state 存在 Zustand，不隨 Modal unmount 消失）
