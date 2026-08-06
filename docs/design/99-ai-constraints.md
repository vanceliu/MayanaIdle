# 99. AI 生成內容時的總限制

## 99.1 限制清單

**這裡只放設計文件裡查不到的規則。** 所有能在設計文件讀到的規格（數值、公式、機制）
一律去該文件看，不在此重述 —— 重述必然與來源不同步。功能對應哪份文件見 `INDEX.md`。

1. 陣營只有艾爾薩斯王國與瓦爾登聯邦兩個，**不可新增第三陣營**（陣營規則見 `10-faction.md`）
2. **不可設計等級突破或覺醒系統**（等級無硬上限，見 `04-character.md` § 4.9）
3. 裝備模板一律**用 id 查表，不可用名字查**（禁用 `db.equipmentTemplates.where('name')`）——
   seed 換過 id 的品項會在玩家 IndexedDB 留下同名舊列，名字查表會撈到舊數值。
   孤兒模板由 `client/src/db/seed/purgeStaleTemplates.ts` 在每次 seed 後清除
4. 新手裝名單**只有 seed 一個來源**：`acquireType: 'starter'` + `requiredClass`
   （無 `requiredClass` = 全職業共用）。不可在程式碼另立硬編名單
5. 傳進戰鬥系統的 `equippedGear` 是**陣列，順序＝instance id 插入順序，不是部位順序**。
   取手持武器一律用 `systems/combat.ts` 的 `getEquippedWeapon()`，**禁用 `equippedGear[0]`** ——
   換掉新手武器後會靜默取到防具，武器基傷／額外攻擊／材質克制全部失效且不報錯
6. 技能的 `requiredWeaponType`（如三連射的【需裝備弓】）是**實際限制**，
   由 `scriptRunner.ts` 的 `meetsWeaponRequirement()` 在腳本選招時擋下，
   不可退化成只在 tooltip／Wiki 顯示的裝飾字
7. 背包／倉庫一律**用道具 id 查，不可用名字查**（禁用 `characterBag.where({ name })`、
   `bagItems.find(b => b.name === ...)`）—— 道具改名後舊名對不上，玩家存量等於消失。
   `BagItem.name` 與 `type` 是由 `itemId` 反查 seed 產生的顯示快取，一律經
   `models/bagItem.ts` 的 `makeBagItem()` 產生，不可手寫。
   同理，**設定表指涉道具一律存 id**（卷軸、狀態解除道具、印記、技能書、
   `craftMaterials`、任務獎勵、快捷鍵設定），名稱只用於顯示。
   唯一例外是 `getRequiredScrollItemId()` 依樓層區段組出卷軸名再換 id，
   換算只發生在該函式內，且由 `itemIdIntegrity.test.ts` 全段掃過

## 99.2 進行中的分階段計畫：行動裝置支援

> 這一節是**暫時的施工說明**，全部階段完成並經使用者確認後整節刪除。
> 中斷後接續實作時，從第一個未打勾的項目往下做。

**已確認的方向**：響應式單一版面（非獨立手機版）／直向優先、橫向也要能用／
PWA 排在版面完成之後。

### Phase 0 — 基礎設施

- [x] `client/src/hooks/useViewport.ts`：`isMobile`（<768px）／`isTouch`／`orientation`
      的**唯一真相來源**。其他元件不得自己寫 `matchMedia` 或讀 `window.innerWidth`
- [x] `--vh-unit` / `--vw-unit` 基底換成 `dvh` / `dvw`（手機網址列會吃掉可視高度）
- [x] `index.html` viewport 加 `viewport-fit=cover`；根版面吃 `env(safe-area-inset-*)`
- [x] `overscroll-behavior: none` 擋整頁下拉刷新

### Phase 1 — 觸控互動層（桌機行為不變）

- [x] `hooks/useLongPress.ts`：長按＝右鍵。`BagPanel` / `QuickSlotBar` 的
      `onContextMenu` 改走它，右鍵路徑保留
- [x] `Tooltip` 在觸控裝置支援 tap 開啟／點外面關閉，桌機仍走 hover
- [x] **背包與快捷格的拖放由 HTML5 DnD 改成 pointer-based**（滑鼠與觸控同一套）
- [x] 觸控命中區最小 44×44

### Phase 2 — 版面響應式

- [x] `FloatingWindow` 在 `isMobile` 時切「全螢幕 sheet」：停用拖曳、
      不套用位置持久化
- [x] HUD 四島直向重排：上方精簡狀態列＋區域選擇，下方 tab bar＋快捷格橫捲
- [x] 戰鬥日誌手機版改可展開抽屜（不可拖曳）
- [x] 城鎮設施視窗／`SettingsModal`／`AttributeUpModal` 等彈窗手機全螢幕
- [x] 寫死寬度（340 / 420 / 480px）改 `min(Npx, 100vw - gutter)`
- [x] 標題／選角／建角三頁響應式

### Phase 3 — 文件與測試

- [x] 新增 `47-mobile.md` 行動裝置適配（`34-ui-guidelines.md` § 34.8 只留指標）
- [x] `16-tech-frontend-architecture.md` § 32.3 補行動版 HUD 與 `useViewport` 模組邊界
- [x] `INDEX.md` 查表與連動關係圖同步
- [x] 測試：`useViewport` / `useLongPress` / pointer 拖放 / sheet 模式 / 斷點版面

### Phase 4 — PWA

- [x] manifest + service worker + icon + 離線快取

### 待使用者確認

- **手機的 `--ui-scale` 預設值**：實作後發現手機在 100%（桌機基準）下版面就成立，
  因此**沒有另設行動版預設值**，範圍仍是 80%~150%。
  若要為手機另訂基準，數值須由使用者指定，不可自行填。
- 全部階段確認無誤後，**整節（§ 99.2）刪除**。
