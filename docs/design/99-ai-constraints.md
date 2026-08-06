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

---

## 99.2 進行中的分階段計畫（詞綴強化移交印記師，完成後刪除本節）

使用者決策（規格來源，實作不得偏離）：

1. **強化石 → 「精鍊印記」**（改名，不是新道具）。規則、掉落來源、任務獎勵、
   重量 2、賣價 50G **一律不變**；只把 `category` 由 `material` 改為 `scroll`
2. **強化印記 → 「突破印記」**（純改名，T5→T6 10%／T6→T7 2%、失敗回 T1 全不變）
3. **品質石 → 「工藝印記」**，品質提升一併移到印記師。**保留 50,000G**（§ 46.8
   「印記不消耗金幣」為此開一條例外）；+1%、上限 20%、必定成功等數值全不變。
   category 同樣只改為 `scroll`，重量 2、賣價 50G 不變
4. 詞綴相關操作**全部移到印記師**，鐵匠鋪只剩武器強化／防具強化／裝備製作
5. 印記師分頁：原「強化印記」分頁改為升階分頁，同一份詞綴清單依 Tier 自動分派 ——
   T1~T4（商店裝 T1~T2）用精鍊印記、100%；T5／T6 用突破印記、10%／2%；到頂顯示已滿。
   品質提升另開一個分頁（對象是整件裝備，不是單條詞綴）

- [x] P1 設計文件：`46-sigil.md`（§ 46.1 分工表、§ 46.2 清單、§ 46.6 精鍊、§ 46.7 突破、
      工藝印記與金幣例外）、`13-town.md`（§ 13.5 鐵匠鋪 ＋ § 13.13 印記師）、
      `08-quality.md` § 8.3、`07-affix.md` § 7.2、`06-equipment-acquire.md` § 6A.6、
      `30-items.md`、`27-drop-table.md`、`36-quest-system.md`、`39-batch-sell.md`、
      `35-inventory-constraints.md`、`09-dungeon.md`、`34-ui-guidelines.md`、
      `43-wiki-system.md`、`INDEX.md`
- [x] P2 資料層：`itemSeeds.ts` id 9／10 改名＋改 category、id 150 改名；
      Dexie v14 upgrade 把 `characterBag`／`characterStorage` 的三個舊名改新名並修正 `type`；
      `craftMaterialUsage.ts` 用途字串；冒險者工會任務獎勵（`AdventurerGuild.tsx` 顯示名、
      `models/adventurerQuest.ts` 的 `RewardType` 註解與權重表說明，獎勵仍以 id 9／10 查表）
- [x] P3 系統層：`models/sigil.ts` 加 `temper`（精鍊印記）與 `polish`（工藝印記）定義、
      `applyTemperSigil`；邏輯自 `TownBlacksmith` 的 `handleAffixEnhance`／`handleQuality`
      原樣搬移（升階：Tier +1、依新 Tier 重骰數值、100%、受 `maxAffixTier` 夾住、
      特殊詞綴不受理；品質：+1%、上限 20%、50,000G）；`canUseSigil` 的提示字改新名
- [x] P4 UI：`SigilMaster.tsx` 升階分頁依 Tier 分派 ＋ 新增品質分頁 ＋ 資源列顯示三種印記與金幣；
      `TownBlacksmith.tsx` 移除詞綴與品質分頁；Wiki 印記表／道具頁／任務頁名稱
- [x] P5 測試：`sigil.test.ts` 補精鍊／工藝印記案例、DB 遷移測試、
      既有測試（批量販售保護、craftMaterialUsage、dbIntegrity、drops、鐵匠鋪）改名同步
