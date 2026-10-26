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

### T5 配方重複材料修正（`06-equipment-acquire.md` § 6A.3）

規格：同一配方材料不可重複；象牙塔的鄰區為古戰場。1011／1126 第 4 種改骷髏兵箭簇×3、1112／1127 改亡魂騎士碎甲×3、1113 改殭屍碎骨×3。

- [x] M1 `equipmentSeeds.ts` 5 份配方
- [x] M2 文件：§ 6A.3、單手劍／雙手杖／雙刀配方欄
- [x] M3 測試：製作配方 `itemId` 不重複
- [x] M4 `npx tsc -b`、client vitest 全綠

### 一般詞綴新增三種 ＋ T7 獨有詞綴（`07-affix.md` § 7.4／§ 7.6、`07-affix-tier7.md`）

規格：一般池加命中下降／防禦下降（武器，命中 10% 觸發、3 秒、通用 Tier 表）與迴避（防具類，T1~T7＝1~7%）；
命中下降＝被該怪攻擊時角色迴避 +X、不受 35% 上限。T7 裝備另有一條獨有詞綴（實例欄位 `uniqueAffix`），
取得當下固定、印記不可動、不吃品質、隨素質需求凍結；同類只取數值最高者（同值依部位順序），其餘劃線；
受擊觸發 buff 10%／5 秒／刷新；命中類比照元素侵蝕判定；追加傷害加在最終傷害；舊 T7 實例由 server 遷移補抽。

- [x] U1 文件：07 § 7.4／§ 7.5／§ 7.6／§ 7.3.1、`07-affix-tier7.md` 正式規格、21／24／46／18／43／INDEX
- [x] U2 模型：一般池三種（定義、階級表、顯示）＋ `models/uniqueAffix.ts`（定義、抽取、顯示、同類去重）
- [x] U3 生成：掉落 T7 帶獨有詞綴；server SQLite 遷移補抽舊 T7 實例
- [x] U4 凍結與去重：`getEffectiveGear()` 清凍結件與落敗件的獨有詞綴；最小固定點的全屬性取最大值
- [x] U5 數值接入：爆擊／攻速／掉寶／魔抗／額外防禦／迴避／全屬性／全免疫；迴避與格擋改共用函式（戰鬥＝面板）
- [x] U6 觸發接入：命中（回血／回魔／追加傷害／暈眩、命中下降／防禦下降）、擊殺回血、受擊 buff
- [x] U7 UI：裝備 tooltip（(獨) 列、分隔線、劃線）、Wiki 詞綴頁與武器／防具頁
- [x] U8 測試；`npx tsc -b`、client／server vitest 全綠

### 怪物攻擊力曲線重調（`28-monster-stats.md` § 28.1）

規格：seed 基礎值（不含全域倍率）。一般怪 Lv.30 以下不動；Lv.31~60 該級典型攻擊上限 `C(L) = 36 × (150/36)^((L−30)/30)`，
每隻怪下限與上限 × `C(L) ÷ 該級一般怪現行攻擊上限中位數`。百柱塔 91~100F 一般怪升 Lv.80，攻擊 × `200/102`（最強死之執行者上限 200）。
Boss Lv.31~57 該級最強者上限 = `round(C(L) × 1.3)`，同級其餘等比；Lv.60 Boss × 1.25；百柱死神升 Lv.80、攻擊 250~300。
Lv.80 怪經驗不變（2,736／17,478）。91~100F 區域等級 80。

- [x] K1 `monsterSeeds.ts` 攻擊力與等級、`mapData.ts` 91~100F 區域等級
- [x] K2 測試：`bossAttackAnchor.test.ts` 改新錨點；其他受影響測試
- [x] K3 文件：28 § 28.1／各表／§ 28.10、09、27、36、04、44 § 44.2、INDEX
- [x] K4 `npx tsc -b`、client／server vitest 全綠（本計畫範圍）
- [x] K5 44 § 44.7 重跑 `simulateReaperKill.mts`（含新詞綴、粗排改輪替加權）

### 詞綴洞 ＋ 新增印記／封印印記（`07-affix.md` § 7.1、`46-sigil.md`）

規格：每件 4 個詞綴洞（實例 `affixSlots`，未設＝4）；掉落 1~4 條均等（含 Boss／T7），商店與製作固定 4 條。
新增印記（id 161）：空洞加一條，T1~T5 均等（商店裝 T3）、特殊詞綴看角色等級，必定成功，洞滿不受理。
封印印記（id 162）：指定一條，70% 成功移出洞外標 `sealed`、排到最後、原洞空出（`(封)`、吃品質、其他印記都不能動、混沌保留），
30% 失敗該詞綴與洞永久毀壞；一件最多封一條；特殊詞綴與額外屬性也可封。
混沌不看既有條數，重抽到填滿所有可用洞（封印詞綴不佔洞、保留）。兩種印記掉率同刺針（Lv.31+ 一般 1%／Boss 5%）、500G、重量 0。舊存檔視為 4 洞，不遷移。

- [x] S1 文件：07、46、27 § 27.8、30、06-equipment-acquire、18、13 § 13.13、35、43、INDEX
- [x] S2 模型：`affixSlots`／`sealed`、掉落條數、`generateAffixes` 排除種類、顯示 `(封)`
- [x] S3 印記：新增／封印的判定與結算、混沌保留封印、其他印記擋封印詞綴；store `applySigil`
- [x] S4 資料：道具 161／162、Lv.31+ 49 區與 16 隻 Boss 的掉落條目
- [x] S5 UI：tooltip 空洞／毀壞、印記師（洞列、第四列選單、封印確認）、Wiki
- [x] S6 測試；`npx tsc -b`、lint、client／server vitest 全綠

### 仇恨範圍與弓射程（`41-arpg-combat.md`、`25-monster-system.md` § 25.8）

規格：怪物仇恨範圍 8 → 10 格（脫離 15 格不變）；玩家弓普攻射程 15 → 10 格；三連射、穿透箭雨射程 15 → 10 格。
法系技能、怪物弓箭手 10 格／魔法怪 8 格、A* 尋路門檻 8 格不變。Wiki 讀常數自動同步。

- [x] A1 `monsterCombatFSM.ts` aggroRange、`equipment.ts` 弓射程、`classSkills.ts` 兩招弓技能
- [x] A2 測試：弓射程、弓技能射程、仇恨 10 格邊界
- [x] A3 文件：41、25、97、23、INDEX
- [x] A4 `npx tsc -b`、client／server vitest 全綠

跨多次對話的實作**開工前**先在這裡寫下定案規格與分階段清單（見 `CLAUDE.md`）：
中斷後靠它接續，全部完成並經使用者確認後刪除。
