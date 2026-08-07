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

### 裝備欄緊湊化（兩欄部位格）

裝備欄維持獨立面板，**不併入詳細狀態**（分頁會強制二選一，且詳細狀態之後只會更長）。
欄位排法由單欄條列改成兩欄部位格，詞綴與數值收進既有的 hover tooltip。

- [x] 階段 1：`EquipmentPanel.tsx` 改兩欄部位格 —— 格子只印部位名 + 裝備名（Tier 色與背包同一套 `getEquipmentInstanceTierColor`），不再印 compact 數值；點兩下卸下的語意不變
- [x] 階段 2：`App.css` 的 `.equipped-list` / `.equip-slot` 系列改 grid 兩欄
- [x] 階段 3：`PANEL_WIDTHS.equipment` 由 360 調成 280
- [x] 階段 4：`EquipmentPanel.test.tsx` 更新，並補「格子不印數值」的新測試
- [x] 階段 5：文件同步 `16-tech-frontend-architecture.md`（§ 32.15 寬度表、組件表的 `EquipmentPanel` 描述）
- [x] 追加：選取狀態由格內金色側條改成**整格金色外框**，與 `.bag-cell.is-selected` 同一套
      （格子本身已有邊框，再加內側條會兩條線打架）；`is-selected` 改掛在 `.equip-slot` 上
