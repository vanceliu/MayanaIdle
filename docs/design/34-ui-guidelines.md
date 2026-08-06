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
├── .panel-scroll             — **唯一的捲動區**
│   └── .shop-items           — 物品列表容器
│       └── .shop-item        — 單個物品卡片行
│           ├── .shop-item-info    — 左側：物品資訊
│           └── .shop-item-actions — 右側：數量步進器（買賣面板不放動作鈕）
└── .shop-cart-footer         — 底部動作列（買賣／存取面板）      ┐ 固定頁腳
    ├── .shop-cart-info       — 左側：已選摘要 + 擋下原因         │ 不捲動
    ├── .shop-cart-amount     — 右側：合計金額                    │
    └── .shop-cart-btn        — 右側：唯一的動作按鈕              ┘
```

### 捲動規則（必守）

- **視窗本體不捲動**：`.town-modal-body` 為 `overflow: hidden`，捲軸一律由面板內的 `.panel-scroll` 提供。
  這樣持有金幣、頁籤、分類篩選才會固定在最上面，不會被清單推走。
- **表頭 = 狀態與篩選器**：資源列、頁籤、分類篩選都屬於表頭，**不可放進 `.panel-scroll`**。
- **頁腳 = 動作列**：`.shop-cart-footer` 同樣在 `.panel-scroll` **外面**，不會被清單捲走。
- **排版順序不允許為了固定而重排**：若篩選列必須留在清單中段（如冒險者工會的難度分級落在
  「進行中的任務」之後），改用 `.panel-sticky` 釘在捲動區頂端，不要把它搬到表頭。
- 每個城鎮設施面板都必須有 `.panel-scroll`；結構有測試把關。

### 底部動作列（購物車模式）

**適用面板**：雜貨店、武器店、防具店、倉庫（即「一次可以處理多個項目」的買賣存取面板）。
鐵匠鋪、魔法學院、新手 NPC 等**每列一次性動作**（強化／學習／製作，成本各不相同）
維持列內按鈕，不套用此模式。

| 規則 | 說明 |
|---|---|
| 動作鈕數量 | 全視窗**只有一顆**，固定在面板右下角 |
| 列上的操作 | 只有數量步進器（`QtyStepper`），**不放動作鈕** |
| 預設數量 | **0**（未選取）；數量歸零即代表該列不結帳 |
| 唯一裝備 | 數量上限固定 **1**，介面仍與可堆疊物品一致 |
| 「全部」 | 只把數量拉到上限，**不執行動作** |
| 金額位置 | 動作鈕**左邊**，`var(--accent-gold)`；出售／取出加 `+` 號 |
| 摘要 | 可堆疊：`已選 N 種 · 共 M 個`；裝備：`已選 N 件`；未選：`未選擇任何項目` |
| 擋下條件 | 金幣不足 / 背包欄位不足時按鈕 disabled，並在摘要下方以 `var(--accent-danger)` 說明原因 |
| 容量檢查 | 多品項要**先算合計**再判定：只有背包沒有的品項才佔新格（`35-inventory-constraints.md` § 35.3.2） |
| 結帳後 | 清空已選數量、**自動關閉設施視窗**（`closeFacility()`） |

> 批量販售（依 Tier 一鍵掃貨）是獨立工具，仍保留在出售頁清單內的自己的按鈕。

> **動作鈕必須整顆停在底部常駐 HUD 帶之上。** 快捷格與面板按鈕列的 z-index 是 800，
> 永遠壓在視窗之上（`16-tech-frontend-architecture.md` § 32.15.1），動作列一旦伸進去
> 就變成看得到卻點不到。`.town-modal-overlay` 的下緣保留區讀 `--hud-band-bottom`
> 這個量測值，**不可改回寫死的 px**。

### 設計原則

1. **卡片行佈局**：每個物品/裝備為一橫列卡片（`.shop-item`），左側顯示資訊、右側顯示操作
2. **不使用 master-detail**：不採用「先選擇再展開詳情」的模式，所有資訊直接展示在列表中
   （購物車模式只在列上選數量，不會把詳情收起來，符合本原則）
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
| 雜貨店 | `.shop-panel` | — | 數量步進器 + 底部「購買／賣出」動作列 |
| 武器店 | `.shop-panel` | — | `<EquipmentTemplateDetail>` / `<EquipmentDetail>`；步進器上限 1 + 底部「購買／出售」動作列 |
| 防具店 | `.shop-panel` | — | 同武器店 |
| 鐵匠鋪 | `.shop-panel .blacksmith-panel` | `.bs-shop-item` | 資源列、操作按鈕含消耗/成功率（列內動作，不套購物車） |
| 旅館 | `.shop-panel .inn-panel` | — | — |
| 倉庫 | `.shop-panel .storage-panel` | — | 數量步進器 + 底部「存入／取出」動作列；金幣存取另有獨立輸入列 |
| 新手 NPC | `.starter-npc-panel` | `.starter-row` | 強化進度格、已擁有／未擁有 badge（列內動作） |

### 頁籤樣式

- 容器：`.shop-tabs`（flex, gap 4px）
- 按鈕：基礎背景 `var(--bg-card)`，active 狀態 `var(--accent-primary-dim)` + 紫色邊框
- 鐵匠鋪允許使用相同的 `.shop-tabs` 樣式

## 34.2 裝備資訊組件

### 基本規則

**所有顯示裝備詳情的地方必須統一使用共用組件，禁止自行渲染裝備屬性。**

- `<EquipmentDetail item={...} />` — 裝備實例（含強化、品質、詞綴）
- `<EquipmentDetail item={...} compact />` — 精簡模式（隱藏重量、部位、材質、可用職業、**詞綴**）
- `<EquipmentTemplateDetail template={...} />` — 裝備模板（商店購買用）

### 使用場景

| 場景 | 組件 | compact | 說明 |
|---|---|---|---|
| 裝備欄浮動視窗（EquipmentPanel） | `EquipmentDetail` | `compact` | 資訊精簡，不顯示重量/部位/材質/職業/詞綴；完整內容走 hover tooltip |
| 背包 tooltip（BagPanel） | `EquipmentDetail` | — | 完整顯示 |
| 背包列表（Inventory） | `EquipmentDetail` | — | 完整顯示 |
| 武器店/防具店 | `EquipmentDetail` / `EquipmentTemplateDetail` | — | 完整顯示 |
| 鐵匠鋪（武器/防具強化） | `EquipmentDetail` | — | 完整顯示 |
| 印記師（詞綴/品質） | `EquipmentDetail` | — | 完整顯示 |
| 鐵匠鋪（製作） | 自訂摘要 | — | 配方資訊，非裝備實例 |

### 裝備顯示欄位（EquipmentDetail）

完整模式顯示以下欄位（按順序，僅有值時顯示）：

1. **裝備名稱** + 強化等級（如 `破曉之刃 +6`）
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
18. **詞綴列表**（Tier 色階顯示）— compact 隱藏（十個欄位各印四條會把裝備欄灌爆，改由 tooltip 呈現）
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

滿值詞綴（`.max-roll`）與特殊詞綴（`.special`）加 `font-weight: 700`，規則見 `07-affix.md` § 7.3.2。

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
| 攻擊 | 物理(小怪)、物理(大怪)、元素刻印、技能元素、攻速加成、冷卻縮減 |
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
| 鐵匠鋪（武器/防具強化） | ✗ |
| 印記師（詞綴/品質） | ✗ |
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

## 34.6 顯示設定（介面大小 / 文字大小）

入口在右下系統列的 ⚙ 按鈕（`GameToolbar`），開啟 `SettingsModal`。
**不是浮動視窗** —— 設定是偶爾開一次的東西，不需要一邊玩一邊開著，
所以不佔用 `PanelKey`（`16-tech-frontend-architecture.md` § 32.15）。

### 兩個倍率

| 設定 | CSS 變數 | 作用範圍 | 範圍 |
|---|---|---|---|
| 介面大小 | `--ui-scale` | HUD 內容、城鎮設施列與視窗、浮動視窗、戰鬥日誌、置中彈窗 | 80%~150%，每 5% 一級 |
| 文字大小 | `--font-scale` | 所有 `--fs-*` token | 同上 |

- **遊戲畫面（Pixi 地圖）不縮放**：縮放它等於改變可視範圍，是另一種功能。
- **兩者預設互不影響**：`zoom` 會連字一起放大，所以縮放層裡把 `--fs-*` 先除以
  `--ui-scale`，經過 `zoom` 之後淨值仍是「基準 × `--font-scale`」。
  「介面小、字大」或反過來都做得到。
- 勾選**「介面與文字一起縮放」**（`linkScales`）後兩條滑桿同步，拉任一條兩邊一起變；
  勾選當下以介面大小為準把文字拉齊。

### 實作限制

- `zoom` 一律套在**內容盒**，不可套在 `.hud` 這種定位層 ——
  縮放定位層會連 `top/left/bottom` 的貼邊距離一起放大，HUD 島會離角落愈來愈遠。
- `--fs-*` 的縮放補償**必須在縮放層重新宣告**，不可只寫在 `:root`：
  自訂屬性的 `var()` 在宣告的元素上就完成代換，寫在 `:root` 會把當下的 `--ui-scale` 烤死。
- 縮放層裡的彈窗要 `createPortal` 到 `body`，否則會吃到兩次縮放，
  且 `position: fixed` 的遮罩範圍會算錯。
- **縮放層內不可直接寫 `vh` / `vw`**：`zoom` 不改變 viewport 單位的計算值，卻會把渲染結果
  乘上倍率 —— `max-height: 82vh` 在 1.5 倍時實際畫成 123vh，視窗直接爆出畫面。
  一律用 `calc(N * var(--vh-unit, 1vh))`（`--vh-unit` / `--vw-unit` 在縮放層宣告為
  `calc(1vh / var(--ui-scale))`）。同理，縮放層讀未縮放外層的 `100%` 時要除以 `--ui-scale`。
- 拖曳座標（`FloatingWindow`／`CombatLogWindow`）必須用 `getElementScale()` 換算：
  指標事件是視窗座標（含縮放），`left/top` 是版面座標，不換算會愈拖愈偏。
- 設定存 localStorage 全域 key（`mayana_ui_scale`／`mayana_font_scale`／`mayana_scale_linked`），
  與角色無關，換角色不必重設。

### 浮動視窗位置

設定視窗另有「重設視窗位置」——浮動面板的座標會自動記住
（`16-tech-frontend-architecture.md` § 32.15），換到不同大小的瀏覽器視窗時按比例還原。
版面亂掉時用這顆按鈕回到預設停靠位置。

## 34.7 技能面板（SkillPanel）

### 格子全開原則

**學得到的**技能格一律全部畫出來，不因未習得而留空：

| 區塊 | 格數 | 排列 |
|---|---|---|
| 基礎魔法 | 該職業上限（見下） | 每列一個魔法等級，列首標 `Lv1`~`Lv{上限}` |
| 職業魔法 | 5 | 第 N 格固定對應職業魔法第 N 級，不隨已習得數量位移 |

- 未習得：`.skill-cell.locked` —— 壓暗（`opacity: 0.4`），仍顯示技能名稱與元素圓點
- 已習得：`.skill-cell.learned` —— 亮起（紫色邊框與底色）
- 標題右側計數只算已習得數量，分母是該職業上限（如妖精 `3/30`）

### 基礎魔法依職業裁切（必守）

超過該職業學習上限的級數**整列不畫**（`05-skill.md` § 5.3）——
畫出來也永遠是暗的，只會讓玩家以為總有一天學得到。

| 職業 | 顯示到 | 格數 |
|---|---|---|
| 元素師 / 牧師 | Lv10 | 50 |
| 妖精 | Lv6 | 30 |
| 盜賊 | Lv4 | 20 |
| 騎士 | Lv1 | 5 |

上限一律讀 `CLASS_MAGIC_RESTRICTIONS`（`client/src/models/skillRestrictions.ts`）的
`maxLevel` / `maxSkills`，面板不得自己寫死級數。

註：角色等級造成的「現在還不能學」（`getLearnableMaxLevel`）**不裁切** ——
那只是還沒到，之後學得到，照樣以暗態顯示。

### 職業魔法資料來源

面板顯示的職業技能一律取自 `CLASS_SKILLS`（`client/src/models/classSkills.ts`），
依 `className` 過濾、依 `classLevel` 對位。**不得在面板內另寫一份職業技能清單** ——
兩份清單必然不同步。

### Tooltip

已習得與未習得共用同一個 tooltip，完整顯示威力／射程／MP／冷卻等數值，
差別只在底部狀態列：已習得 `.skill-tooltip-status.learned`、未習得 `.skill-tooltip-status.locked`。
未習得也看得到完整數值，玩家才能規劃學習路線。

## 34.8 行動裝置支援

規範全文見 `47-mobile.md`。本節不重述 —— 斷點、觸控互動、指標拖放、
行動版版面與 PWA 都在那份文件。
