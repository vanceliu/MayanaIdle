# 34. UI 統一規範

## 34.1 城鎮面板通用樣式

所有城鎮設施（雜貨店、武器店、防具店、鐵匠鋪、旅館、倉庫等）的面板 UI 必須遵循統一風格。

### 面板結構

```
.shop-panel                   — 撐滿視窗高度的 flex column
├── .shop-greeting            — NPC 問候語（斜體、左邊框）      ┐
├── .shop-gold / .bs-resources — 資源顯示列                     │ 固定表頭
├── .shop-tabs                — 頁籤列（購買/出售 或 功能分頁） │ 不捲動
├── .bs-craft-categories      — 分類篩選列（武器店／防具店／鐵匠製作）┘
└── .panel-scroll             — **唯一的捲動區**
    └── .shop-items           — 物品列表容器
        └── .shop-item        — 單個物品卡片行
            ├── .shop-item-info    — 左側：物品資訊
            └── .shop-item-actions — 右側：操作按鈕
```

### 捲動規則（必守）

- **視窗本體不捲動**：`.town-modal-body` 為 `overflow: hidden`，捲軸一律由面板內的 `.panel-scroll` 提供。
  這樣持有金幣、頁籤、分類篩選才會固定在最上面，不會被清單推走。
- **表頭 = 狀態與篩選器**：資源列、頁籤、分類篩選都屬於表頭，**不可放進 `.panel-scroll`**。
- **排版順序不允許為了固定而重排**：若篩選列必須留在清單中段（如冒險者工會的難度分級落在
  「進行中的任務」之後），改用 `.panel-sticky` 釘在捲動區頂端，不要把它搬到表頭。
- 每個城鎮設施面板都必須有 `.panel-scroll`；結構由
  `client/src/components/__tests__/TownPanelScroll.test.tsx` 把關。

### 設計原則

1. **卡片行佈局**：每個物品/裝備為一橫列卡片（`.shop-item`），左側顯示資訊、右側顯示操作
2. **不使用 master-detail**：不採用「先選擇再展開詳情」的模式，所有資訊直接展示在列表中
3. **統一色彩語意**：
   - 金幣/價格：`var(--accent-gold)`
   - 問候語：`var(--accent-info)` + 斜體 + 左邊框
   - 危險警告：`var(--accent-danger)`
   - 成功訊息：`var(--accent-gold)` + 左邊框
   - 裝備基礎屬性/職業：`var(--accent-info)`（藍綠色）
4. **統一間距**：物品列表 gap 6px，卡片 padding 10px 12px
5. **hover 反饋**：卡片 hover 時 border-color 加深

### 各面板差異

| 面板 | 根 class | 額外 class | 特殊元素 |
|---|---|---|---|
| 雜貨店 | `.shop-panel` | — | 買1/買10 按鈕 |
| 武器店 | `.shop-panel` | — | `<EquipmentTemplateDetail>` / `<EquipmentDetail>` |
| 防具店 | `.shop-panel` | — | 同武器店 |
| 鐵匠鋪 | `.shop-panel .blacksmith-panel` | `.bs-shop-item` | 資源列、操作按鈕含消耗/成功率 |
| 旅館 | `.shop-panel .inn-panel` | — | — |
| 倉庫 | `.shop-panel .storage-panel` | — | 存取操作 |

### 頁籤樣式

- 容器：`.shop-tabs`（flex, gap 4px）
- 按鈕：基礎背景 `var(--bg-card)`，active 狀態 `var(--accent-primary-dim)` + 紫色邊框
- 鐵匠鋪允許使用相同的 `.shop-tabs` 樣式

## 34.2 裝備資訊組件

### 基本規則

**所有顯示裝備詳情的地方必須統一使用共用組件，禁止自行渲染裝備屬性。**

- `<EquipmentDetail item={...} />` — 裝備實例（含強化、品質、詞綴）
- `<EquipmentDetail item={...} compact />` — 精簡模式（隱藏重量、部位、材質、可用職業）
- `<EquipmentTemplateDetail template={...} />` — 裝備模板（商店購買用）

### 使用場景

| 場景 | 組件 | compact | 說明 |
|---|---|---|---|
| 裝備欄浮動視窗（EquipmentPanel） | `EquipmentDetail` | `compact` | 資訊精簡，不顯示重量/部位/材質/職業 |
| 背包 tooltip（BagPanel） | `EquipmentDetail` | — | 完整顯示 |
| 背包列表（Inventory） | `EquipmentDetail` | — | 完整顯示 |
| 武器店/防具店 | `EquipmentDetail` / `EquipmentTemplateDetail` | — | 完整顯示 |
| 鐵匠鋪（強化/品質/詞綴） | `EquipmentDetail` | — | 完整顯示 |
| 鐵匠鋪（製作） | 自訂摘要 | — | 配方資訊，非裝備實例 |

### 裝備顯示欄位（EquipmentDetail）

完整模式顯示以下欄位（按順序，僅有值時顯示）：

1. **裝備名稱** + 強化等級（如 `月光長劍 +6`）
2. **部位**（如 `右手`、`右手（雙手）`）— compact 隱藏
3. **攻擊力**（武器）：`基礎+強化/基礎+強化` 格式（如 `9+6/8+6`）
4. **防禦力**（防具）：`基礎+強化` 格式（如 `11+4`）
5. **格擋率**（盾牌）：`格擋率: X%`
6. **攻擊成功**（武器）：模板值 + 強化加成（每+2→+1）
7. **額外攻擊**（武器）：模板固定值
8. **魔法攻擊**（法杖強化 or 魔導書）
9. **HP+**（項鍊/戒指/盾牌等）
10. **MP+**（項鍊/戒指/法杖等）
11. **回血+**（裝備固有回血量）
12. **回魔+**（裝備固有回魔量）
13. **負重+**（腰帶）
14. **額外屬性**（如 `力量+1`、`敏捷+1`）
15. **材質**（武器）— compact 隱藏
16. **重量** — compact 隱藏
17. **品質%**（強化過的裝備）
18. **詞綴列表**（Tier 色階顯示）
19. **可用職業** — compact 隱藏

### 詞綴 Tier 顏色

所有顯示詞綴的地方必須使用統一色階，定義見 `07-affix.md` § 7.3。

| Tier | 顏色 | CSS class |
|---|---|---|
| T1 | 灰色 `#6B7280` | `.tier-1` |
| T2 | 亮灰 `#9CA3AF` | `.tier-2` |
| T3 | 綠色 `#4ADE80` | `.tier-3` |
| T4 | 黃色 `#FACC15` | `.tier-4` |
| T5 | 橙色 `#FB923C` | `.tier-5` |
| T6 | 紅色 `#EF4444` | `.tier-6` |
| T7 | 紫色 `#A855F7` + 光暈 | `.tier-7` |

CSS class 對應：`.affix-tag.tier-X`、`.equip-detail-affix.tier-X`、`.tooltip-affix.tier-X` 三者顏色必須一致。

## 34.3 狀態面板（StatusPanel）

### Bar 結構

位於**畫面左上角的浮動 HUD**（`.hud-topleft`，見 `16-tech-frontend-architecture.md`
§ 32.3），`BuffBar` 接在卡片下方。四條**由上往下堆疊**：

```
.status-panel
├── .char-header          — 角色名 + 職業 + 等級
└── .bars                 — flex column，四列
    ├── .bar.hp-bar       — HP 血量條（紅色漸層）
    ├── .bar.mp-bar       — MP 魔力條（藍色漸層）
    ├── .bar.exp-bar      — EXP 經驗條（黃色漸層）
    └── .bar-row          — 負重條 + 防禦值同一列
        ├── .bar.weight-bar  — 負重（依比例變色，超重轉紅並顯示 ⚠ 無法攻擊）
        └── .defense-value   — 防禦: N（靠右）
```

順序（由上往下）：名稱/職業/等級 → HP → MP → EXP → 負重＋防禦。

- **防禦不獨立成一列**：它是被動數值，跟負重共用一行就夠。
- `.bars` 是 `flex-direction: column`；`.bar` 必須是 `flex: 0 0 auto`，
  **不可用 `flex: 1`** —— 直向堆疊時 `flex-basis: 0` 會讓四條在自動高度的容器裡塌掉
  （`.bar-row` 內的負重條例外，要 `flex: 1 1 auto` 才會把防禦值推到右邊）。

**不顯示「目前區域」**：已由頂部地圖選擇器「目前: 區域名 ▼」呈現，避免重複。

### 負重計算

- 公式：`負重上限 = (有效STR/2 × 100) + (有效VIT/2 × 100) + 裝備bonusWeight`
- 當前負重 = 所有身上裝備 weight + 背包裝備 weight + 背包道具（重量×數量）+ 藥水（重量×數量）
- 顯示格式：`{current}/{max} ({percent}%)`
- 正常：灰色漸層 `#6B7280 → #9CA3AF`
- 超重：紅色漸層（同 HP bar）——**僅視覺提示，無遊戲懲罰**（見 `35-inventory-constraints.md` § 35.2）
- 防禦值顯示在**負重條那一列的右側**，使用 `var(--accent-info)` 藍綠色

### 詳細狀態面板（CharacterStats）

「詳細狀態」浮動視窗（由底部 PanelDock 開啟），分區顯示角色戰鬥相關數值：

| 區塊 | 顯示項目 |
|---|---|
| 基礎屬性 | STR、AGI、VIT、SPI、INT、CHA |
| 攻擊 | 物理(小怪)、物理(大怪)、普攻元素、技能元素、攻速加成、冷卻縮減 |
| 防禦 | 防禦值、減傷率、**魔法減傷率**、**魔法抗性**、迴避率、命中率、格擋率 |
| 爆擊 | 爆擊率、爆擊傷害 |
| 回復 | 每次回血、每次回魔、補血效果、藥水效果 |

- 格擋率 = 盾牌基礎格擋率 + 格擋率詞綴加總（上限 50%）
- 未裝備盾牌時格擋率為 0%

### 欄位 Tooltip（必要）

**每一個欄位的標籤都必須有 tooltip**，hover 後說明該欄位的意義。缺少 tooltip 視為缺陷。

結構（`StatRow` 元件）：

```
.stat-row
├── .tooltip-trigger      — Tooltip 包裹層（position="right"）
│   └── .stat-label       — 欄位名稱，虛線底線 + cursor: help
└── .stat-value           — 數值
```

Tooltip 內容分三段，`formula` 與 `note` 可省略：

| 區塊 | class | 內容 |
|---|---|---|
| 標題 | `.stat-tip-title` | 欄位名稱 |
| 說明 | `.stat-tip-desc` | 這個欄位「是什麼」，用玩家看得懂的話 |
| 公式 | `.stat-tip-formula` | 怎麼算出來的（等寬字、深色底） |
| 補充 | `.stat-tip-note` | 上限、生效條件、與其他欄位的關係 |

**撰寫原則**：

- 「來源」與「結果」的欄位必須互相指涉。例如**魔法抗性**是來源之一，
  **魔法減傷率**是最終結果 —— 兩者的 tooltip 都要說明彼此關係，否則玩家看到兩個相似名稱會混淆
- 若欄位目前無效果（例如 CHA），要在 note 明說「尚未實作」
- 顯示值若已含上限（爆擊率 75%、迴避 35%、格擋 50%、冷卻縮減 50%），要在 note 標明

> **實作注意**：`.stat-label` 外層有 Tooltip 產生的 `.tooltip-trigger`，
> 因此 CSS 與測試都**不可使用位置選擇器**（`span:first-child` / `parentElement` + 索引），
> 一律用 `.stat-label` / `.stat-value` 明確 class。

### 重量顯示規則

裝備重量在以下場景顯示：

| 場景 | 顯示重量 |
|---|---|
| 雜貨店 | ✓ |
| 武器店/防具店 | ✓ |
| 鐵匠鋪（製作） | ✓ |
| 鐵匠鋪（強化/品質/詞綴） | ✗ |
| 背包（BagPanel tooltip） | ✓ |
| 背包列表（Inventory） | ✓ |
| 裝備欄浮動視窗（EquipmentPanel） | ✗（compact 模式） |

## 34.4 結果訊息

操作結果統一使用以下樣式：

- 背景：`var(--bg-inset)`
- 文字顏色：`var(--accent-gold)`
- 左邊框：3px solid `var(--accent-gold)`
- 位置：操作列表上方（非底部）

## 34.5 空狀態

列表無內容時顯示 `<p className="empty-text">` 提示文字。
