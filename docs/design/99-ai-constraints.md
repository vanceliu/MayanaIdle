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

### 自動天賦系統：實作（`51-auto-talent.md` 已定稿，13 份連動文件已同步）

**前置已完成**：設計定稿、連動文件同步（commit 0f35ee6）。本階段起動程式。

**不可先行實作**：`51-auto-talent.md` § 51.4.4 阻擋中的兩個鑲材
（目標正在詠唱、切換目標：召喚本體）—— 怪物側機制未做，兩者必須與機制同階段。

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | `models/talent.ts`＋`models/mailbox.ts` 型別；`db/seed/talentSeeds.ts` 鑲材定義 89 筆 | ✅ 完成 |
| 2 | Dexie v18：`talentAffixes`／`talentSlots`／`mailbox` 三張表（**只建表**） | ✅ 完成 |
| 3 | `stores/talentStore.ts`：持有鑲材、天賦格、安裝／拆下、鑲嵌／卸下、合成；**起始配置與舊規則重置在角色載入時處理**（upgrade 拿不到角色上下文）。**含 22 個測試** | ✅ 完成 |
| 4 | 取得：升級補發天賦格信、`systems/talentDrops.ts` 鑲材與天賦格掉落（tier 區域分帶、抽取規則）、角色載入時的初始化。**含 16 個測試** | ✅ 完成 |
| 5 | 判定改接：新增 `systems/talentRules.ts` adapter（天賦格→既有規則形狀），三個 runner 接點改讀它。**evaluator 完全不動**。含 11 個測試 | ✅ 完成 |
| 6 | 零前置的新條件：戰鬥 15、常駐 9、補給 5；含 Wiki 說明與 13 個測試。**`hp_dropped_recently` 延到階段 7**（需保留短期 HP 歷程，不是零前置） | ✅ 完成 |
| 7 | 接線項：戰鬥 ctx 帶 `activeEffects` → 目標 debuff／控場免疫／護盾；`hp_dropped_recently` 的 HP 取樣（常駐 loop 維護，不進 store）。含 8 個測試 | ✅ 完成 |
| 8 | 引擎新能力：`targeting.ts` 目標選擇策略（6 種）、`playerCombatFSM` 走位與鎖定目標。**切換目標與走位消耗出手機會**。含 10 個測試 | ✅ 完成 |
| 9 | 補給新動作：使用旅館（價格與手動共用 `INN_PRICES`）、僅門檻版販售、素材白名單、多組購買欄位。含 5 個測試 | ✅ 完成 |
| 10 | UI：天賦面板四分頁（`TalentEditor` ＋ `TalentFusion`），取代三個舊腳本編輯器 | ✅ 完成 |
| 11 | UI：背包分頁列（一般／天賦）、`BagTalentTab` 鑲材清單與篩選、樣式 | ✅ 完成 |
| 12 | Wiki：`ScriptsPage` → `TalentsPage`，加鑲材總表（89 筆，含未取得與「尚未開放」標記）、合成成功率、掉落分帶。含 3 個測試 | ✅ 完成 |
| 13 | 測試：判定、合成機率、掉落分帶與抽取、遷移防線、一實體一格 | ✅ 完成（隨各階段補齊，共 8 個新測試檔） |

**信箱（`52-mailbox.md`）併在階段 4**：首版**只做天賦格發放**（§ 52.0），
不做公告分頁、補償、里程碑與其他項目型別。天賦格的等級發放是它唯一的內容來源。

| 階段 | 內容 | 狀態 |
|---|---|---|
| 4a | `mailbox` 表 ＋ `systems/mailbox.ts` 發放／領取／清理，`stores/mailboxStore.ts`。**含 12 個測試** | ✅ 完成 |
| 4b | 信箱面板 ＋ `PanelDock` 按鈕與未領封數徽章；領取後天賦格進背包（未安裝） | ✅ 完成 |
| 4c | 換版清理：`BUILD_INFO.version` 改變時刪已領取的信，**未領取一律保留**。已接進角色載入 | ✅ 完成 |

**驗證**：13 階段全數完成。`npx tsc -b` 乾淨、`npx vitest run` **234 檔 2967 個測試全過**、
0 個 unhandled rejection。

**尚未清理的殘留**（等實機驗證過再刪，免得要回退時沒得看）：

| 檔案 | 狀態 |
|---|---|
| `components/CombatScriptEditor.tsx` | 已無人使用，只剩兩個測試檔還在引用 |
| `components/PersistentScriptEditor.tsx` | 已無人使用 |
| `components/VillageScriptEditor.tsx` | 已無人使用 |
| `components/ScriptEditor.tsx` | 原本就標 legacy |
| `scriptTemplates[].combatRules` 等三個陣列 | 判定已改讀天賦格，欄位還在但沒人讀 |

**還沒做的**：`51-auto-talent.md` § 51.4.1 的 `params` 欄位（玩家設的 X%／N／技能名）
目前只有資料層，**編輯器還不能改參數** —— 鑲材鑲進去之後用的是預設值。
下一步要在 `TalentEditor` 加參數編輯。

### 未排入階段的既有問題

與自動天賦、介面風格都無關，尚未安排：

- **低血量警示不存在**：`App.css` 只有負重的 `.weight-bar.is-critical`，
  HP 沒有對應 class —— HP 8% 與 HP 78% 除了長度外完全一樣。
  對比預算花在永遠不變的框上，真正該喊的地方是啞的
- **`:focus-visible` 為 0**：`App.css` 有 3 個 `:focus`（全在輸入框且接 `outline: none`），
  沒有任何 `:focus-visible`，鍵盤焦點在加粗彩框之後更看不見
- **面板圖示用 emoji**：`PANEL_ICONS`（`stores/panelWindowStore.ts`）與 `TownView` 的
  `FACILITIES` 用 emoji，專案已有 SVG 圖示系統（`GameIcon` + `assets/icons/`）卻沒用在這兩處；
  `panelWindowStore.ts` 註解記錄的「圖示撞號兩次」即其症狀
