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

### 自動天賦簡化（分支 `talent-simplify`，僅改設計文件）

天賦格是唯一資源；條件與動作全部內建、開局全開、無 tier、無實體、無掉落、無綁定。

| 階段 | 內容 | 狀態 |
|---|---|---|
| 1 | § 51.4~51.5 改寫：刪三型態／roll 綁定／池上限／升級／兌換／降階／一實體一格 | 完成 |
| 2 | § 51.4.5~51.4.11 的 tier 欄改為主題分組；能力階梯塌成完整版 | 完成 |
| 3 | § 51.3.2~51.3.4 放寬：天賦格維持實體換裝，條件與動作自由複製 | 完成 |
| 4 | § 51.6 掉落改為只剩天賦格；§ 51.7 起始配置去除鑲材份數 | 完成 |
| 5 | § 51.8 背包天賦分頁、§ 51.11 鑲材實例表刪除；§ 51.10 UI 分頁調整 | 完成 |
| 6 | § 51.13 連動清單重寫為實際改動清單 | 完成 |
| 7 | 連動文件 15 份全部改到位 | 完成 |

- 一般怪的天賦掉落歸零後**不補回饋**，文件註明為已知取捨
- 長尾條件保留 `pending`，語意改為「未開放，選單不出現」
- 天賦格 T4 上限、`MULTI_GROUP_MAX = 3` 均維持

### 實作階段（分支 `talent-simplify`）

`TalentAffixInstance` 整個消失，條件與動作改為天賦格上的欄位
`{ ruleId, params }`，定義表以 **`ruleId` 為鍵**（塌陷後不再重複）。

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

**DB 遷移是 v22**：`talentAffixes` 整張表刪除，內容搬進天賦格欄位，
對照表在 `db/migrations/talentAffixLegacy.ts`。**天賦格本身不動**。

**能力塌陷的對應**（同 `ruleId` 的多階合成一筆，取完整版）：
`skill`（2003/2004/2006，`skill_class_only` 刪除）、`buff_skill`（2103/2106）、
`buy_item`（2204/2214）、`withdraw_item`（2205/2215）、
`sell_materials`／`sell_equipment`（刪 `*_threshold_only`）。

### 尚未清理的殘留

`components/CombatScriptEditor.tsx`、`PersistentScriptEditor.tsx`、`VillageScriptEditor.tsx`、
`ScriptEditor.tsx` 四個舊編輯器已無使用端（只剩測試檔引用），可刪。
`scriptTemplates[].combatRules`／`persistentRules`／`villageRules` 三個陣列已無人讀取。

