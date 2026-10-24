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

### 線上狀態同步瘦身（`97-selfhosted-server.md` § 97.2「狀態同步」）

規格：每次推送一則 `frame`（`now` 僅 tick 推送帶）；store 欄位分 `set`／`merge`／`append`；
`game.combatLogs` 走 append、`game.character` 走 merge、`mapMonster.monsters` 只送顯示欄位且內容不變不送；
`combat` 只送新怪完整資料、變動血量、變動的目標與詠唱；`PROTOCOL_VERSION` 升 `'3'`。

- [x] P1 共用 codec（`client/src/net/syncCodec.ts`）＋ 單元測試
- [x] P2 server：`collectPatches` 改欄位編碼、`flush` 改單一 `frame`、combat delta；`resetPatches` 一併清；測試
- [x] P3 client：`mirror.ts` 套用 `frame`、怪物還原與 prev 位置；`clockSync` 測試改寫；新增套用測試
- [x] P4 `npx tsc -b`、client／server vitest 全綠；60 秒流量量測前後對照
- [x] P5 文件：97 § 97.2 狀態同步、§ 97.3 備案清單、`INDEX.md`

### CI 測試與打包提速（`docs/RELEASE.md`）

規格：client `*.test.ts` 用 node 環境、`*.test.tsx` 與標註 `@vitest-environment jsdom` 的檔用 jsdom；
server 測試的 argon2 用最低成本（正式參數不變）；桌面版封存壓縮等級 6；打包與測試並行，Release 等兩者。
地圖測試條件執行不做。

- [x] C1 client vitest 拆 node／jsdom 兩個 project，需要 DOM 的 `.ts` 測試加標註；全綠
- [x] C2 server `setPasswordHashCost()` ＋ 測試 setup 降成本；全綠
- [x] C3 `package.mjs` 壓縮等級 6
- [x] C4 `release.yml`：`build` 不等 `test`，`release` 等 `test` 與 `build`
- [x] C5 `docs/RELEASE.md` 同步；量測前後對照

### 飾品詞綴池移除防禦力（`07-affix.md` § 7.6）

規格：飾品（項鍊／戒指）詞綴池去掉防禦力（12 種）；既有飾品上的防禦力詞綴保留不轉換。

- [x] R1 防禦力的 `category` 移除 `'accessory'`
- [x] R2 wiki `AffixesPage` 說明文字
- [x] R3 測試：飾品池無防禦力、生成 200 件飾品不出防禦力、wiki 篩選
- [x] R4 文件：07 § 7.4／§ 7.6
- [x] R5 `npx tsc -b`、vitest 全綠

### 斷線重連回到原角色（`97-selfhosted-server.md` § 97.5「斷線重連」）

規格：自動重連登入後直接選回斷線前遊戲中的角色；斷線前停在角色選擇、被踢除、主動回清單或登出不選回；
選角失敗退回角色選擇。記錄只在記憶體，重新整理頁面不適用。只改 client，協定版本不變。

- [x] D1 文件：97 § 97.5、`INDEX.md`
- [x] D2 `connection.ts`：斷線記下角色 id，登入後送 `select_character`，失敗改送 `characters`
- [x] D3 測試：遊戲中斷線選回、角色選擇中斷線不選、被踢不選、選角失敗退回清單、登出後不選
- [x] D4 `npx tsc -b`、client／server vitest 全綠

跨多次對話的實作**開工前**先在這裡寫下定案規格與分階段清單（見 `CLAUDE.md`）：
中斷後靠它接續，全部完成並經使用者確認後刪除。
