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

---

## 99.2 進行中的分階段計畫（角色外觀）

> 完成並確認後刪除本節。中斷時從未打勾的那一階接續。

**目標**：把 `PlayerEntity` / `NpcEntity` 的 `Graphics.circle()` 換成 RimWorld 式的無腳剪影，
並在創角流程讓玩家選髮型、微調該髮型的少數參數、選膚色與髮色。

**規格已寫進設計文件**，這裡不重述（重述必然與來源不同步）：

| 要查什麼 | 去哪 |
|---|---|
| 髮型清單、可調範圍、睫毛、色票、四朝向 | `04-character.md` § 4.10 |
| `appearance` 欄位與四個落點（**匯入必須逐欄位列出**） | `18-data-schema.md` § 18.7 |
| 創角流程的外觀步驟 | `19-account-character.md` § 19.4 |
| 渲染方式（烘 RenderTexture／朝向由位移推算／怪物維持圓形） | `40-pixijs-migration.md` § 10 |
| 遺產快照帶外觀 | `45-legacy-archive.md` § 45.2 |

**階段**：

- [x] 1. `client/demo/pawn.html` 參數調校頁（13 髮型 × 4 朝向）、
       `client/demo/pawn-draw.js` 繪製核心（移植到 Pixi 的單位）、
       `client/demo/character-create.html` 創角 UI 模擬 —— **版面與可調範圍已定案**
- [x] 2. `04-character.md` § 4.10 外觀規格、`18-data-schema.md` § 18.7 欄位與落點、
       `19-account-character.md` § 19.4／§ 19.9、`45-legacy-archive.md` § 45.2、
       `40-pixijs-migration.md` § 10 決策與檔案結構、`INDEX.md` 查找表與連動圖
- [ ] 3. `models/appearance.ts` —— 髮型清單、逐髮型可調項與範圍、預設值、驗證
- [ ] 4. `pixi/entities/pawn/` —— 由 demo 移植的繪製，烘成 RenderTexture（每造型 × 4 朝向）
- [ ] 5. `CharacterCreate.tsx` —— 外觀區塊與即時預覽
- [ ] 6. `PlayerEntity` 套用角色外觀；朝向由位移推算
- [ ] 7. `NpcEntity` 依設施給固定外觀
- [ ] 8. 測試：外觀驗證、烘焙產出、朝向推算、preset 引用完整性

**移植注意**：demo 用 Canvas 2D，Pixi Graphics 沒有 `clip`，但目前的畫法已不需要 clip；
`roundRect` 的逐角半徑陣列 Pixi 不支援，需改用 `arcTo` 或路徑自行組。
