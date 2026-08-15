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

### 掛機點拆成「位置」與「待返回旗標」

`lastHuntLocation` 改為進入非城鎮區域時記錄；新增 `huntReturnPending`，
只有自動回城（補給天賦 `return_town`、緊急撤退、常駐天賦 `use_town_scroll`）設起，
進入非城鎮區域時清除。`return_to_hunt` 可執行條件加上該旗標。
`HuntLocation` 刪除 `x, y`。

- [x] Phase 1 設計文件：`49-village-script.md` § 49.3 / § 49.5（`51-auto-talent.md` 無可執行條件欄，不需改）
- [x] Phase 2 型別與判定：`models/villageScript.ts`、`systems/villageScriptRunner.ts`
- [x] Phase 3 gameStore：記錄時機搬到 `navigateTo` / `changeArea`，三個自動回城端設旗標，旗標進 prefs 存讀
- [x] Phase 4 Wiki 文案：`wiki/talentRuleDescriptions.ts` 四條描述
- [x] Phase 5 測試：`villageScript.test.ts` 旗標判定、`stores/__tests__/huntReturn.test.ts` 手動／自動回城行為，`npx tsc -b` ＋ 3258 測試全綠

### 存檔缺漏與時序修正

- [x] Phase 1 `runVillageScriptTick()` 的 `use_inn` 補 `saveState()`
- [x] Phase 2 `saveGame()` 串成佇列，寫入順序等於呼叫順序，單次失敗不卡死後續
- [x] Phase 3 測試：`innSupplyPersist.test.ts`、`saveQueue.test.ts`，`npx tsc -b` ＋ 3264 測試全綠

### 存檔紀律稽核

- [x] Phase 1 稽核完成，漏存五處：`usePotion`、`usePotionByType`、`useSpeedPotion`、`useCureItem`、`castSelfSkill`
- [x] Phase 2 五處補 `saveState()`
- [x] Phase 3 `talentInitReady()` 取代 fire-and-forget，五個測試檔改用它
- [x] Phase 4 `consumablePersist.test.ts` ＋ `npx tsc -b` ＋ 3270 測試全綠

### 移除走位動作「脫離」並修正保持距離

規格見 `15-excluded.md` § 15.6 與 `51-auto-talent.md` § 51.4.9。
舊存檔含 `disengage` 的規則整條刪除；保持距離的落點改走 `findNearestWalkable`。

- [x] Phase 1 設計文件：`51-auto-talent.md` § 51.4.4／§ 51.4.9、`25-monster-system.md` § 25.11、`15-excluded.md`
- [x] Phase 2 型別與定義：`scriptEngine.ts`、`talentParams.ts`、`talentSeeds.ts`、`iconMap.ts`、`talentRuleDescriptions.ts`
- [x] Phase 3 判定與執行：`scriptRunner.ts`、`arpgEngine.ts`、`playerCombatFSM.ts`、`combatCommandStore.ts`、`gameStore.ts`
- [x] Phase 4 走位落點修正：`PixiGame.tsx` 走位事件不經 `findAttackPosition`，落點失敗保留目標
- [x] Phase 5 舊存檔遷移：DB v24 清空動作為 `disengage` 的天賦格
- [x] Phase 6 `keepDistanceMove.test.ts` ＋ `npx tsc -b` ＋ 3279 測試全綠
