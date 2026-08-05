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

---

## 99.2 進行中的分階段計畫（印記系統，完成後刪除本節）

規格見 `46-sigil.md`。

- [x] P1 設計文件：新增 `46-sigil.md`；連動更新 `07-affix.md`、`30-items.md`、
      `27-drop-table.md` § 27.8、`13-town.md`（§ 13.3 設施清單 ＋ § 13.13 印記師）、
      `43-wiki-system.md`、`INDEX.md`
- [x] P2 資料層：`itemSeeds.ts` 加 4 種印記（id 147~150）、`dropSeeds.ts` 加 Lv.31+
      區域與 Boss 掉落條目、印記圖示 SVG ＋ CREDITS
- [x] P3 系統層：`models/sigil.ts` —— 四種印記的純函式與可用性判定
- [x] P4 UI：`components/town/SigilMaster.tsx`、`TownView.tsx` 設施註冊、
      三張城鎮地圖 JSON 的 NPC、Wiki 印記段落
- [x] P5 測試：`models/__tests__/sigil.test.ts`、掉落 seed 覆蓋率測試、
      `townMaps.test.ts` 的設施清單
