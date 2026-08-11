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
   同理，**設定表指涉道具或裝備一律存 id**（卷軸、狀態解除道具、印記、技能書、
   `craftMaterials`、`craftPrerequisiteWeapon`、任務獎勵、快捷鍵設定），名稱只用於顯示。
   共用倉庫的**金幣不是物品**，存在獨立的 `warehouseGold` 表，不混進倉庫物品表。
   唯一例外是 `getRequiredScrollItemId()` 依樓層區段組出卷軸名再換 id，
   換算只發生在該函式內，且由 `itemIdIntegrity.test.ts` 全段掃過

## 99.2 進行中的分階段計畫（完成後刪除）

### 介面風格調整：粗線條 + 提高彩度（與角色 sprite 對齊）

**動機**：角色 sprite 是近黑粗描邊 + 高飽和色塊，介面是 1px 藍灰細線 + 低飽和 dark HUD，
兩者對比策略不一致，角色看起來像貼在別的遊戲上。

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | 建 `client/demo/ui-style.html` + `uiStyleDemo.ts` 調校頁：現況 vs 候選並排，可即時調線寬／描邊色／飽和度／面板亮度／圓角／分區色相，含地圖與角色同畫面對照 | ✅ 完成 |
| 2 | 使用者在調校頁定案參數（**未定案前不可動 `src/`**） | ⏸ 等使用者 |
| 3 | `App.css` 抽 token：`--border-width-*`、`--outline-dark`，替換現有 136 處硬編碼 border | 未開始 |
| 4 | `pixi/mapThemes.ts` 地圖色同步（只改 CSS 會讓介面卡通化、地圖仍是灰褐色） | 未開始 |
| 5 | 更新 `34-ui-guidelines.md`（色彩語意／線條規範），補樣式回歸測試 | 未開始 |

**限制**：
- 調校頁只吃 `src/App.css`，候選樣式寫在 demo 頁的 `<style>` 內，階段 2 定案前不進 `src/`
- 調色只做同一組色的 S 倍率 / L 偏移，**不動 H**、不引入新色票
- `--text-*` 不跟著調（低飽和灰藍拉飽和度會整片泛藍，且直接動到對比度）
- 線寬要決定吃不吃 `--ui-scale`（縮到 80% 時粗框會顯胖，見 `34-ui-guidelines.md` § 34.6）

**階段 1 的結論（供階段 2 選擇）**：
輪廓要成立，線與面必須有明度差。現在面板是近黑（L≈8%），**近黑描邊在上面等於看不見** ——
只加粗線寬不會變粗獷，只會變糊。兩條互斥路線：

| 路線 | 做法 | 代價 |
|---|---|---|
| A/B 亮邊 | 面板維持近黑，描邊改亮色 | 改動最小；輪廓感是「發光的線」，不是角色那種厚塗描邊 |
| C/D 提亮面板 | 描邊維持近黑，面板 L 拉高 | 與角色 sprite 同一套語言，一致性最好；面板一亮文字對比就掉，`--text-*` 要一併重估 |

**面板是主體（使用者確認）**，因此走 A/B（暗底亮框）；RimWorld 那種「介面退到看不見」
不適用 —— 它成立的前提是面板只是查資料的工具。

**分區色相**（「彩一點」的真正來源，已進調校頁）：
整體拉飽和度只會讓紫的更紫；分區色相才會被感覺到。五個區色**就是既有的 accent token**，不新增色票：

| 區 | 色 | 表面 |
|---|---|---|
| 角色 / 系統 | `--accent-primary` | `.status-panel`、`.panel-dock` |
| 導航 | `--accent-info` | `.map-selector` |
| 村莊 | `--accent-success` | `.town-npc-bar` |
| 戰鬥 | `--accent-danger` | `.combat-log-window` |
| 物品 / 商店 | `--accent-gold` | `.quick-slot-bar`、`.shop-items` |

- 區色**只上框、標題、active 態，不上內容文字** —— § 34.1 已把 gold＝金幣、
  danger＝危險、info＝裝備基礎屬性 綁成語意色，同一個色不可同時當「區域」與「語意」
- **只上容器、不上每顆按鈕**，否則村莊列變成 12 個綠框（那是裝飾，不是分區）
- `.town-npc-bar` 與 `.shop-items` 目前**沒有容器框**，分區方案需要補上，否則這兩區沒有落點

階段 3 另需處理三處沒走 token 的硬編碼色（滑桿吃不到）：
`.hud-topleft .status-panel`、`.combat-log-title`、`.combat-log-overlay .combat-log` 的 background。
