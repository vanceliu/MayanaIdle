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

### 怪物詠唱（分支 `talent-simplify`）

規格見 `25-monster-system.md` § 25.11。

| 階段 | 內容 | 狀態 |
|---|---|---|
| A | `monsterCombatFSM.ts`：加 `casting` 狀態與詠唱常數 | 完成 |
| B | `arpgEngine.ts`：`monster_attack` 事件帶 `damageMultiplier`；`ScriptMonsterView` 帶 `casting` | 完成 |
| C | `combat.ts`：`calculateMonsterAttack` 吃倍率 | 完成 |
| D | `pixi/ui/CastBar.ts` ＋ `MonsterEntity`：怪物頭上的詠唱條 | 完成 |
| E | `target_casting` 接上 evaluator，解除 `blocked` | 完成 |
| F | 文件連動：`25-monster-system.md`、`51-auto-talent.md`、`48-vfx.md`、`INDEX.md` | 完成 |
| G | 測試；`npx tsc -b` ＋ `vitest` 全綠 | 完成 |

### 自動天賦簡化（分支 `talent-simplify`，僅改設計文件）

規格見 `51-auto-talent.md`。

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | § 51.4~51.5 改寫：刪三型態／roll 綁定／池上限／升級／兌換／降階／一實體一格 | 完成 |
| 2 | § 51.4.5~51.4.11 的 tier 欄改為主題分組；能力階梯塌成完整版 | 完成 |
| 3 | § 51.3.2~51.3.4 放寬：天賦格維持實體換裝，條件與動作自由複製 | 完成 |
| 4 | § 51.6 掉落改為只剩天賦格；§ 51.7 起始配置去除鑲材份數 | 完成 |
| 5 | § 51.8 背包天賦分頁、§ 51.11 鑲材實例表刪除；§ 51.10 UI 分頁調整 | 完成 |
| 6 | § 51.13 連動清單重寫為實際改動清單 | 完成 |
| 7 | 連動文件 15 份全部改到位 | 完成 |

### 實作階段（分支 `talent-simplify`）

規格見 `51-auto-talent.md`，資料落點見 `18-data-schema.md` § 18.9。

| 階段 | 內容 | 狀態 |
|---|---|---|
| A | `models/talent.ts`：刪 tier／form／池上限／掉率／子集；新增 `group` | 完成 |
| B | `db/seed/talentSeeds.ts`：89 筆塌成 81 筆，改以 `ruleId` 為鍵 | 完成 |
| C | `db/database.ts`：刪 `talentAffixes` 表，`talentSlots` 加 `conditions`／`action` | 完成 |
| D | `stores/talentStore.ts`：刪鑲材實例與升級／兌換／降階，只留天賦格 | 完成 |
| E | `systems/talentRules.ts`：改讀天賦格欄位 | 完成 |
| F | `systems/talentDrops.ts`：刪鑲材掉落，只留天賦格 | 完成 |
| G | `components/TalentEditor.tsx`：選單改列全部定義 | 完成 |
| H | `components/TalentFusion.tsx`：只剩天賦格合成 | 完成 |
| I | `components/BagTalentTab.tsx`、`models/talentBag.ts`：只列未安裝天賦格 | 完成 |
| J | Wiki：刪 `TalentAffixesPage`，`TalentsPage` 去除鑲材段 | 完成 |
| K | 測試清理與新增；`npx tsc -b` ＋ `vitest` 全綠 | 完成 |

### 龍之谷拆區（分支 `talent-simplify`）

龍之谷地表拆成龍之谷外圍（Lv.30~35）與龍之谷（Lv.36~40）。
規格見 `09-dungeon.md` § 9.8、`28-monster-stats.md` § 28.6、`27-drop-table.md`、`30-items.md`。

| 階段 | 內容 | 狀態 |
|---|---|---|
| A | 設計文件：`09` / `25` / `27` / `28` / `30` / `36` / `38` / `06-equipment-acquire` | 完成 |
| B | `mapData.ts` 新區、`mapDesignRules.ts` 個性、`dragon-valley-outskirts.json` | 完成 |
| C | `monsterSeeds.ts`：新怪 4 隻、飛龍升 Lv.40、巨人補 seed、骷髏系改無屬性 | 完成 |
| D | `itemSeeds.ts` 龍蛻碎片；`dropSeeds.ts` 外圍掉落表 | 完成 |
| E | `adventurerQuest.ts` 任務池；`sigilDrops.test.ts` 區域清單 | 完成 |
| F | `assignCraftMaterials.mts --write`：T4 區帶加入外圍 | 完成 |
| G | `dragonValleySplit.test.ts`；`npx tsc -b` ＋ `vitest` 全綠 | 完成 |

### 灰脊城鎮（分支 `talent-simplify`）

灰脊山脈新增第四座城鎮 `greyridge-town`，三階梯版面、12 設施全套、無新手指導員。
規格見 `13-town.md` § 13.2~13.2.1、`36-quest-system.md` § 36.12.2。

| 階段 | 內容 | 狀態 |
|---|---|---|
| A | 設計文件：`01` / `09` / `13` / `30` / `36` / `38` / `46` | 完成 |
| B | `mapData.ts` region＋zone＋`getNearestTown`；`greyridge-town.json` | 完成 |
| C | `itemSeeds.ts` 灰脊回城卷軸；`townScroll.ts` | 完成 |
| D | `adventurerQuest.ts` 任務池（龍之谷與百柱塔改為灰脊專屬）；`AdventurerGuild.tsx` 鎮名 | 完成 |
| E | 測試：`townMaps` / `trainingGround` / `townScroll` / `adventurerQuestSystem` / `mapData` / `regionGroup` / `mapDataControl` / `dragonValleySplit` | 完成 |
| F | `npx tsc -b` ＋ `vitest` 全綠 | 完成 |

### 龍谷地間產出分化（分支 `talent-simplify`）

龍谷地間定位為金幣與賣錢素材產地，遠古地監維持 T6 裝備獵場。
重疊等級帶（Lv.45~50）的單位擊殺收益比值目標 1.5×。遠古地監不動。

| 階段 | 內容 | 狀態 |
|---|---|---|
| A | `dropSeeds.ts`：龍谷地間 1~7F 金幣掉落量 | 完成 |
| B | `09-dungeon.md` § 9.10、`INDEX.md` 補上兩座副本的產出定位 | 完成 |
| C | `dungeonYieldSplit.test.ts`；`npx tsc -b` ＋ `vitest` 全綠 | 完成 |

### 尚未清理的殘留

`components/CombatScriptEditor.tsx`、`PersistentScriptEditor.tsx`、`VillageScriptEditor.tsx`、
`ScriptEditor.tsx` 四個舊編輯器已無使用端（只剩測試檔引用），可刪。
`scriptTemplates[].combatRules`／`persistentRules`／`villageRules` 三個陣列已無人讀取。

