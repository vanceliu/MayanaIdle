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

### 近戰判定改為相鄰格

定案規格：

- 近戰（射程 ≤ 1.5）的出手判定與落腳格判定一律**以格為單位判相鄰**（含斜角，Chebyshev ≤ 1），
  不用真實座標的歐氏距離
- 射程 > 1.5（技能、弓）維持真實座標歐氏距離
- 出手判定與落腳格判定**必須用同一個函式**，不可各寫一份
- 玩家與怪物同一條規則
- 成因：角色停在格與格之間時真實距離可能是 1.52，剛好超出 1.5，而
  `findAttackPosition` 的起點格只用真實座標判一次 → 回 null → 目標被清掉 →
  重選同一隻 → 不出手也不移動的死結

階段：

1. 共用判定函式 `isWithinAttackRange()`（`systems/lineOfSight.ts`）
2. 玩家側接上：`playerCombatFSM`（出手／已就位）、`pathfinding`（`findAttackPosition`／`isAttackPosition`）、`targeting`（射程 gate）
3. 怪物側接上：`monsterCombatFSM` 的 inRange、`gameLoop` 的停下距離與「附近有怪」判定
4. 測試：更新 `movementDeadlock.test.ts` 至新規則，新增死角掃描回歸（各地圖死角數必須為 0）
5. 文件同步：`41-arpg-combat.md` § 3.1／§ 4.3、`38-map-control.md` § 38.5／§ 38.7、`25-monster-system.md` § 25.8

### 強化入口從鐵匠鋪搬到背包

定案規格：

- 強化改由背包點卷軸執行，鐵匠鋪只留裝備製作與製作追蹤
- 卷軸兩段式點擊後進入「指定目標」模式，log（`system` 頻道）提示選擇目標，結果亦進 log
- 取消：Esc、再點該卷軸、點不可強化的目標。模式中所有點擊由模式接管，不觸發原本的使用／裝備
- 可指定範圍＝背包內（含裝備中），倉庫不可
- **無確認框**，點下即結算
- 背包分頁列工具列新增「機率」按鈕，同一套指定目標模式；點裝備開視窗，列出普通／＋／－ 三種卷軸的判定格、成功率、失敗後果
- 強化演出（`48-vfx.md` § 48.4）錨定到背包格
- 野外可強化。新手 NPC 強化分頁不變
- 武器強化與防具強化維持兩套獨立公式

階段：

1. 強化結算抽成 `systems/` 模組 + store action（三種卷軸判定、統計計數、裝備消失），鐵匠鋪改呼叫新路徑，行為不變
2. 背包指定目標模式（狀態機、log、取消、非法目標、與拖曳／右鍵互斥）接上 action
3. 強化演出錨定背包格，沿用 `useOneShotFx`，樣式仍只在 `App.css`
4. 機率按鈕與視窗
5. 移除鐵匠鋪強化分頁
6. 文件同步：`35-inventory-constraints.md` § 35.5.1／§ 35.13、`13-town.md` § 13.5、`34-ui-guidelines.md`、`48-vfx.md` § 48.4、`39-batch-sell.md`、`17-mvp-priority.md`、`INDEX.md`
