# 99. AI 生成內容時的總限制

AI 後續協助 MayanaIdle 時，應遵守以下限制：

1. 不要設計成推關制放置 RPG
2. 不要設計討伐魔王主線
3. 不要加入離線收益，除非使用者要求
4. 不要加入轉生系統
5. 不要加入付費系統
6. 不要加入被動技能
7. 不要加入圖鑑與裝備收藏
8. 不要把副本分類成金幣、經驗、裝備、材料副本
9. 不要加入城鎮建設
10. 不要把寵物設計成傭兵或完整隊伍角色
11. 不要把裝備部位設計成單手武器、雙手武器、盾牌三個欄位
12. 必須使用左手與右手兩個手部欄位
13. 雙手武器必須佔用另一隻手
14. 裝備品質預設為 0%
15. 裝備品質初始上限為 20%
16. 裝備品質只影響詞綴數值與販售價格
17. 武器必須考慮對小怪與對大怪的基本傷害
18. 戰鬥方向是 ARPG，怪物會隨停留時間增加（Pressure 機制見 `26-spawn-pressure.md`）
19. 自動行為分為兩套腳本：戰鬥腳本（攻擊、技能施放）與常駐腳本（喝水、回城、buff），合併涵蓋攻擊、技能、補血、喝水、換目標
20. 遊戲優先以 Web 實作，架構不宜過度複雜
21. 陣營為兩大王國：艾爾薩斯王國與瓦爾登聯邦，不可新增第三陣營
22. 兩陣營在機制上完全平衡，不可設計陣營專屬裝備或技能
23. 陣營選擇在等級 30 開啟，選擇後不可更改
24. 不要將兩國設定為善惡對立
25. 不要加入第三方邪惡勢力作為共同敵人來化解兩國衝突
26. 等級無硬上限，但經驗曲線設計使大多數玩家自然停留在 50~60 附近
27. 後期成長以裝備詞綴、品質、魔法書為主要驅動，不可設計等級突破或覺醒系統
28. 區域地圖結構已定義（見 `09-dungeon.md`），不可新增未定義的大區域
29. 所有區域不設陣營進入限制，任何玩家皆可前往
30. 同名怪物跨區域時強度根據地圖等級調整，不可為同一怪物設計多個獨立模板
31. 武器元素屬性由附魔系統賦予，武器出生時為無屬性
32. 武器強化與防具強化為兩套獨立系統（見 `06-equipment.md` § 6.9、§ 6.10）
33. 武器材質決定種族克制，不決定武器強弱
34. 戰鬥中不追加新怪物，一次遇敵打完一批
35. 額外屬性最多 +2，不複合，單一屬性出現
36. 魔法學院必須依職業及等級限制學習，具體規則見 `05-skill.md` § 7.5
37. 騎士等級 50 以前不能學習任何基礎魔法
38. 妖精最高只能學到 6 級基礎魔法（30 個），每 8 級可學習或升級
39. 盜賊最高只能學到 4 級基礎魔法（20 個），每 8 級可學習或升級
40. 元素師每 4 級可學習或升級，最高 10 級（50 個）
41. 牧師每 5 級可學習或升級，最高 10 級（50 個）
42. 初始技能只有元素師和牧師擁有風刃（1 級基礎魔法），其他職業無初始魔法
43. 鐵匠鋪只能在城鎮設施中使用，不可作為常駐 UI 面板
44. UI 右側面板僅顯示背包與技能，不可放入城鎮設施功能
45. 回城必須消耗回城卷軸，無卷軸則無法回城
46. 回城卷軸綁定特定城鎮，從該城鎮雜貨店購買
47. 死亡後傳送至最近城鎮，HP 恢復 50%，停留在城鎮內不自動回去探索
48. 鐵匠鋪必須能看到玩家身上裝備與背包裝備
49. 每個帳號最多可建立 4 個角色（暫定），不可超出此上限
50. 倉庫系統分為「個人倉庫」與「共用倉庫」兩種
51. 個人倉庫綁定角色（Character），僅該角色可存取，匯出角色時一起帶走
52. 共用倉庫綁定帳號（User），同帳號所有角色可存取，匯出角色時不帶走
53. 跨角色轉移裝備必須透過共用倉庫中轉（A 存入共用倉庫 → B 取出）
54. 金幣各角色獨立，共用倉庫提供存放金幣功能供跨角色轉移
52. 登出功能為返回角色選擇畫面，不是關閉遊戲
53. 背包固定 100 格，不可擴充、不可新增背包擴充系統
54. 背包不可新增拖拽（Drag & Drop）、物品篩選/搜尋、多頁分頁功能
55. 背包不可做成獨立彈窗，必須固定在右側面板
56. 所有物品進入背包的入口都必須做容量檢查（掉落/購買/製作/取出/脫裝/獎勵）
57. 藥水冷卻為全域共用：使用任一藥水 → 所有藥水進入該藥水的冷卻時間
58. 背包僅透過格子數量上限（100 格）限制，負重懲罰已實作（負重條僅資訊顯示）
59. 背包詳細限制規格見 `35-inventory-constraints.md`
60. 武器的「額外攻擊」(extraAttack) 是加算至武器基傷的固定數值，不是多段攻擊次數。本遊戲無多段攻擊機制，每回合固定攻擊 1 次

---

## 99.2 當前實作計畫（Phase Tracking）

> AI 中斷後可依此接續，完成後由使用者確認刪除。

### Phase：倉庫系統重構（個人倉庫 + 共用倉庫）

**目標**：將現有單一倉庫拆分為「個人倉庫（角色層級）」與「共用倉庫（帳號層級）」，修正跨角色看不到裝備的 bug，並確保匯出/匯入邊界正確。

**設計文件已更新**：
- `99-ai-constraints.md` — 第 50-54 條改為雙倉庫規則
- `19-account-character.md` — § 19.7 改為雙倉庫設計
- `13-town.md` — § 13.8 拆分個人/共用倉庫說明
- `35-inventory-constraints.md` — § 35.12 更新倉庫互動規則

**實作步驟**：

- [ ] Step 1：DB schema 更新 — `equipmentInstances` 加 `storageType: 'personal' | 'shared'` 欄位；`warehouses` 表加 `storageType` 欄位
- [ ] Step 2：`Storage.tsx` UI 拆分為兩個 tab（個人倉庫 / 共用倉庫）
- [ ] Step 3：`depositEquip` / `withdrawEquip` 修正 — 存入共用倉庫時 `ownerId` 改為 userId，個人倉庫保持 characterId
- [ ] Step 4：`selectCharacter` 載入邏輯修正 — 個人倉庫查 `ownerId = characterId + inStorage`，共用倉庫查 `ownerId = userId + inStorage`
- [ ] Step 5：`saveGame` 確認材料/金幣的倉庫存取也區分個人/共用
- [ ] Step 6：`characterTransfer.ts` 修正 — 匯出包含個人倉庫裝備，排除共用倉庫裝備；匯入時過濾 `storageType: 'shared'`
- [ ] Step 7：DB migration / seed 更新（既有倉庫資料預設遷移為共用倉庫）
- [ ] Step 8：撰寫相關 unit/integration test
- [ ] Step 9：驗證跨角色共用倉庫存取正常、匯出匯入邊界正確

---

### Phase：新手 NPC 與新手裝備系統

**目標**：在薄暮村新增新手 NPC，提供職業對應的新手裝備（不可存倉庫、不可販售），並提供專屬低價強化服務。

**設計文件已更新**：
- `13-town.md` — § 13.11 新手 NPC 完整規格

**實作步驟**：

- [ ] Step 1：`equipment.ts` model 更新 — `EquipmentInstance` 新增 `isStarterGear?: boolean` 欄位
- [ ] Step 2：`seed.ts` 新增新手裝備模板（5 職業共 22 件，`acquireType: 'starter'`）
- [ ] Step 3：`database.ts` 新增 `acquireType: 'starter'` 類型；DB migrate 支援新欄位
- [ ] Step 4：`gameStore.ts` 新增新手 NPC 相關邏輯：
  - `claimStarterGear(characterClass)` — 領取新手裝備（檢查等級 ≤ 30、補領缺少的）
  - `enhanceStarterGear(equipId)` — 新手裝備強化（消耗 500G、上限為安定值）
- [ ] Step 5：`gameStore.ts` 修正既有邏輯 — 倉庫存入/販售時檢查 `isStarterGear` 阻擋
- [ ] Step 6：新增 `StarterNpc.tsx` 組件 — NPC 對話、領取裝備列表、強化介面
- [ ] Step 7：`TownView.tsx` 新增新手 NPC 設施入口（僅薄暮村顯示）
- [ ] Step 8：撰寫 unit test — 領取限制（等級 > 30 不可領）、補領邏輯、強化上限、倉庫/販售阻擋
- [ ] Step 9：整合測試 — 完整流程驗證（建角→領取→強化→丟棄→補領）

---

## 分階段計畫：建立 itemTemplates 正規化（已完成 ✓）

**目標**：將非裝備道具（藥水、卷軸、素材、技能書等）從純 runtime 常數提升為 DB 層的 `itemTemplates` table，所有關聯改用固定 `id` 而非 `itemName` 字串，確保跨環境資料一致性。

**前提**：角色全面重練，不需要考慮 migration 或向下相容。

**Phase 1 — 資料層**

- [x] Step 1：`items.ts` — `ItemDefinition` interface 加上 `id: number`（必填）
- [x] Step 2：`ITEM_DEFINITIONS` 搬至 `db/seed/itemSeeds.ts`，每筆加固定 id（1~143）
- [x] Step 3：`database.ts` — schema 新增 `itemTemplates: 'id, name, category'`（version 9）
- [x] Step 4：`seed.ts` — 移除所有 legacy migration 邏輯，`performSeed()` 只做乾淨的首次寫入
- [x] Step 5：`seed.ts` — 新增 `itemTemplates` 的 seed 邏輯
- [x] 額外：`seed.ts` 拆分為 `db/seed/` 資料夾（monsterSeeds, equipmentSeeds, dropSeeds, itemSeeds, index）

**Phase 2 — 關聯改造**

- [x] Step 5-6：`DROP_TABLE_SEEDS` / `BOSS_DROP_TABLE_SEEDS` 加 `itemTemplateId` + `equipmentTemplateId`
- [x] Step 7：`DropTableEntry` / `BossDropTableEntry` 移除 `itemName`，`itemType` 簡化為 `'gold' | 'equipment' | 'item'`
- [x] Step 8：`CharacterBagEntry` / `CharacterStorageEntry` / `WarehouseEntry` 加 `itemTemplateId`
- [x] Step 9：Boss 動態裝備掉落改用 `equipmentPool: 'weapon' | 'armor'`

**Phase 3 — 邏輯層**

- [x] Step 10：掉落系統 — 改用 `itemTemplateId` / `equipmentTemplateId` 查詢
- [x] Step 11：商店系統 — 買入時帶 `itemTemplateId`
- [x] Step 12：背包/倉庫 — 載入/存入帶 `itemTemplateId`
- [x] Step 13：新增 `getItemById(id)` helper
- [x] Step 14：`characterTransfer.ts` — 匯入時 name-based 重新對應 templateId
- [x] Step 15-17：`wiki/hooks/useWikiData.ts` + wiki pages 改用 id-based 查詢，移除 `Omit` type alias

**Phase 4 — 驗證**

- [x] Step 18：TypeScript 編譯通過
- [x] Step 19：既有 unit test 全部通過（573 tests）
- [x] Step 20：新增 itemTemplates 相關 test（9 tests：seed 正確性、id 唯一性、lookup 正確性）
- [x] Step 21：完整流程驗證通過

---

### Phase：地圖控制系統（Map Control）

**目標**：將現有「探索中...」純文字狀態視覺化為 Isometric 45° 俯瞰視角地圖，玩家藍點可點擊移動或自動走動，怪物紅點自動生成並靠近玩家觸發戰鬥。

**設計文件**：`38-map-control.md`

**Phase 1 — 基礎地圖渲染與移動（已完成 ✓）**

- [x] Step 1：建立地圖資料結構 — `MapData` interface、`Position` type、`TileType` enum
- [x] Step 2：建立測試地圖資料 — 開闊型（曙光草原）+ 迷宮型（象牙塔 1F），20×15 格
- [x] Step 3：Canvas Isometric 地圖渲染組件 — 菱形 tile、3D 牆壁、depth sorting
- [x] Step 4：玩家藍點顯示（depth sorted，被牆壁正確遮擋）
- [x] Step 5：A* 八方向尋路演算法（防切牆角、octile heuristic）
- [x] Step 6：點擊移動 — Isometric 座標反算、即時改變目的地
- [x] Step 7：自動隨機移動 — 隨機選目標格，到達後重新選目標
- [x] Step 8：Camera follow — 玩家永遠在畫面中心，tile 固定大小
- [x] Step 9：UI 佈局調整 — 地圖佔中間主區域，log 縮至下方（可調 3 段大小 overlay）
- [x] Step 10：撰寫 unit test — pathfinding 11 tests + mapData 8 tests

**Phase 2 — 怪物系統（紅點）（已完成 ✓）**

- [x] Step 1：紅點生成邏輯 — 每秒 15% 機率、生成在距離玩家 ≥5 格的可通行格
- [x] Step 2：紅點移動 — A* 尋路（每 3 秒重算路徑）、平滑插值、1 格/秒
- [x] Step 3：碰撞偵測 — 紅點與玩家距離 ≤1.2 格觸發戰鬥
- [x] Step 4：戰鬥觸發整合 — 紅點保留至戰鬥結束才消失、切換 combat phase
- [x] Step 5：怪物種類決定 — 觸發時依區域怪物池 roll（沿用 spawnMapCombat）
- [x] Step 6：紅點上限控制 — 同時存在上限 3 隻（基礎值）
- [x] Step 7：紅點消失規則 — 距離超過 15 格消失
- [x] Step 8：Depth sorting — 紅點被牆壁正確遮擋
- [x] Step 9：戰鬥後等待 — HP/MP 持續檢查，低於門檻暫停生成但紅點仍移動
- [x] Step 10：禁用舊 rollEncounter 系統 — 遇敵全由紅點碰撞觸發
- [x] Step 11：戰鬥中地圖持續顯示、怪物 HP 列表水平排列固定一行

**Phase 3 — Pressure 整合與狀態管理**

- [ ] Step 1：Pressure 影響紅點上限 — `同時上限 = 3 + Pressure`
- [ ] Step 2：Pressure 影響生成頻率 — `頻率倍率 = 1 + Pressure × 0.2`
- [ ] Step 3：回城/死亡 — 清除所有紅點、重置地圖狀態
- [ ] Step 4：地圖切換 — 進入不同區域/樓層載入對應地圖
- [ ] Step 5：撰寫 integration test — Pressure 連動、狀態切換完整流程

**Phase 4 — 各區域地圖與視覺打磨**

- [ ] Step 1：為各區域設計對應固定地圖
- [ ] Step 2：視覺動畫 — 紅點生成淡入/消失淡出、戰鬥觸發閃爍
- [ ] Step 3：整體 UI 打磨 — 配色、地形紋理

---

## 資料版本控制（已完成 ✓）

**機制**：
- `config.ts` 定義 `CURRENT_DATA_VERSION`（目前為 2）
- 新建角色自動帶 `dataVersion: CURRENT_DATA_VERSION`
- 選擇角色時偵測：若 `dataVersion` 不存在或低於 `CURRENT_DATA_VERSION`，自動刪除角色及其資料
- 角色匯出時帶上 `dataVersion`
- 角色匯入時檢查：若 `dataVersion` 不存在或低於 `CURRENT_DATA_VERSION`，拒絕匯入並提示版本過舊

**全域倍率**：
- `config.ts` 同時管理 `GOLD_RATE_MULTIPLIER`、`DROP_RATE_MULTIPLIER`（預設 1.0）
- 掉落計算公式：`最終倍率 = (1 + 角色裝備加成%) × 全域倍率`

---
