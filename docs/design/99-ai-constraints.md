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

跨多次對話的實作**開工前**先在這裡寫下定案規格與分階段清單（見 `CLAUDE.md`）：
中斷後靠它接續，全部完成並經使用者確認後刪除。

### 遊戲時鐘固定 UTC+8

定案規格：
- 競技場票券場時段（`55-arena.md` § 55.4）與懸賞更新時刻（`53-bounty-contract.md` § 53.4）以固定 UTC+8 計算，與 server、client 的時區無關；server 維持 UTC
- 新時段沒有材料時不可改進非票券場（§ 55.4 不變）

- [x] C1 `models/gameClock.ts`；`arena.ts`、`bounty.ts` 時段函式改用它；NPC 與懸賞分頁的時刻顯示改用 `formatGameTime`
- [x] C2 測試：時段以 UTC+8 判定、結果與執行環境時區無關
- [x] C3 文件：55 § 55.4、53 § 53.4、Wiki 競技場頁與任務頁
- [ ] C4 使用者確認後刪除本節

### 競技場最低推薦裝備（Wiki）

定案規格：
- 標準：單人清完第 30 波，5 場至少 4 場；段位 T4～T6、五職業
- 另列達標場次打到第 30 波的橙色藥水用量（中位、最多）
- 配裝階梯（由弱到強，取第一個達標的階）：前一階裝備 +0 → 該階製作品 +0 → 該階製作品 武器 +6／防具 +5 → 同前且詞綴取製作上限；製作品詞綴取該階製作的平均階級（`06-equipment-acquire.md` § 6A.6）
- 結果寫進 `44-dps-prediction.md` § 44.5；Wiki 競技場頁顯示「段位 × 職業 → 最低推薦裝備、橙色藥水」

- [x] L1 `simulateArena.mts`：`--target-wave`、`--ladder`
- [x] L2 跑 T4～T6 × 五職業
- [x] L3 44 § 44.5 寫結果；43 § 4.12.1 Wiki 規格
- [x] L4 Wiki 競技場頁表格＋測試
- [ ] L5 使用者確認後刪除本節
