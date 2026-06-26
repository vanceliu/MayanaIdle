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
50. 個人倉庫綁定帳號（User），同帳號所有角色共用同一個倉庫
51. 倉庫可存放物品與金幣，角色身上金幣各自獨立
52. 登出功能為返回角色選擇畫面，不是關閉遊戲
53. 背包固定 100 格，不可擴充、不可新增背包擴充系統
54. 背包不可新增拖拽（Drag & Drop）、物品篩選/搜尋、多頁分頁功能
55. 背包不可做成獨立彈窗，必須固定在右側面板
56. 所有物品進入背包的入口都必須做容量檢查（掉落/購買/製作/取出/脫裝/獎勵）
57. 藥水冷卻為全域共用：使用任一藥水 → 所有藥水進入該藥水的冷卻時間
58. 背包僅透過格子數量上限（100 格）限制，負重懲罰暫不實作（負重條僅資訊顯示）
59. 背包詳細限制規格見 `35-inventory-constraints.md`

---

## 背包系統完善實作計劃

> 參考規格文件：`35-inventory-constraints.md`
> 目標：將背包系統中尚未實作的限制補齊，確保所有入口的容量/負重檢查完整。

### Phase B1：負重系統 ✅（暫時停用）

- [x] 負重懲罰暫不實作，僅保留 UI 資訊顯示
- [x] 負重條超重時紅色視覺提示（已有實作，僅作資訊用途）

### Phase B2：背包已滿容量檢查補齊 ✅（實作前已完成）

- [x] 怪物掉落入口：背包已滿 → 丟棄掉落物 + 戰鬥日誌提示
- [x] 商店購買入口：背包已滿 → 禁止購買 + 提示
- [x] 鐵匠鋪製作入口：背包已滿 → 禁止製作 + 提示
- [x] 魔法學院製作入口：背包已滿 → 禁止製作 + 提示
- [x] 倉庫取出入口：背包已滿 → 禁止取出 + 提示
- [x] 脫下裝備入口：背包已滿 → 禁止卸除 + 提示
- [x] 任務獎勵入口：背包已滿 → 禁止交任務 + 提示
- [x] 堆疊例外：同名消耗品即使格數 100 仍可累加

### Phase B3：藥水冷卻系統 ✅

- [x] BagPanel 點擊使用藥水時檢查全域冷卻（`usePotionByType` 加入 cooldown 檢查）
- [x] QuickSlotBar 快捷鍵使用時檢查全域冷卻（透過 `usePotionByType`）
- [ ] 冷卻期間格子/快捷欄顯示冷卻狀態（半透明遮罩或計時）— 待 UI 細化
- [x] 冷卻時間：紅色 600ms、橙色 900ms、白色 1500ms

### Phase B4：背包格數警告顯示 ✅

- [x] Header 格數顯示：>= 90 格 → 黃色警告
- [x] Header 格數顯示：= 100 格 → 紅色危險
- [ ] 堆疊數量 badge：amount > 1 時才顯示 — 待確認現有行為

### Phase B5：裝備穿脫互斥檢查 ✅（修復 + 強化）

- [x] 裝備雙手武器時檢查副手是否有裝備 → 有則阻止 + 提示（已有，修正執行順序）
- [x] 裝備副手時檢查是否已裝備雙手武器 → 有則阻止 + 提示（已有，修正執行順序）
- [x] 修復 equipItem 雙手武器檢查 DB 同步 bug（檢查移至 unequip 前）
- [x] unequipItem 背包已滿時顯示提示訊息
- [x] 職業限制檢查 + 等級限制檢查（已有實作）

### Phase B6：測試 ✅

- [x] 負重超重懲罰 unit test（`weight.test.ts` 10 tests）
- [x] 所有入口容量檢查 unit test（已有 `bagCapacity.test.ts`）
- [x] TypeScript 零錯誤
- [x] 全測試通過（482 tests）

### Phase B7：設計文件同步 ✅

- [x] 建立 `35-inventory-constraints.md` 完整規格
- [x] 更新 `INDEX.md` 加入 `35-inventory-constraints.md`
- [x] 確認連動文件（20/30/06/13/16）無衝突

---

## 實作進度：設計文件 vs 實作衝突修正

> 開始日期：2026-06-25
> 最後更新：2026-06-26
> 衝突報告：`docs/design/CONFLICTS.md`

### Phase 1：High 嚴重衝突（13/13 完成） ✅

- [x] H-1: gameStore 魔法攻擊改用 `calculateSkillAttack`（元素乘區/暴擊/克制）
- [x] H-2: 藥水冷卻改為全域共用（`lastPotionCooldown`）
- [x] H-3: Pressure 公式改回 30min base, +1/10min
- [x] H-4: seed.ts 7 隻怪物元素修正（dark/earth/wind）
- [x] H-5: 設計文件 5 隻怪物體型改為 small（對齊實作）
- [x] H-6: MonsterInstance 加 `isBoss`，spawn 時複製，rollDrops 傳入
- [x] H-7: 龍谷7F/遠古9F Boss 強化卷軸 dropValue 改為 100
- [x] H-8: 防具強化公式改為 `1/(target-1)`
- [x] H-9: 聖光術改為 cleanse debuff（`cleanse: true`）
- [x] H-10: 所有職業技能補上 `buffCategory` + `buffModifiers`
- [x] H-11: 鋼鐵護盾補上 `damageReduction: 20%` modifier
- [x] H-12: 挑釁怒吼改為 attack type（power:20）+ atk-debuff modifier
- [x] H-13: 新增 `useSpeedPotion` + speed buff 互斥

### Phase 2：Medium 中度衝突（11/14 完成，3 項保留/延後） ✅

- [x] M-1: 保留現狀（5% 基礎迴避已足夠）
- [x] M-2: 聖域新增 `hotAmount: 20` + `buffCategory: 'sanctuary'`
- [x] M-3: 天雷/末日烈焰 `aoeMin: 1`（命中全體，上限10）
- [x] M-4: 絕對屏障新增 `invincible: true`
- [x] M-5: 保留現狀（商店不給詞綴）
- [x] M-6: 製作 fallback 改為 `isHandSlot ? 6 : 4`
- [x] M-7: drops.ts 新增 `stability: template.stability`
- [x] M-8: 4 個區域金幣修正為設計值
- [x] M-9: 16 個 Lv.30+ 區域補上武器/防具強化卷軸
- [x] M-10: 非 Boss 區域品質石/強化石統一改回 50
- [x] M-11: 朦朧洞窟/水下監獄分層
  - [x] mapData.ts: 保留原結構（dungeon region + floors），spawn/drop 邏輯自動組合 `{regionId}-{floor}f`
  - [x] gameStore.ts: spawnCombat + rollDrops 改用 `${currentRegion}-${currentFloor}f` 作為 area ID
  - [x] seed.ts (monster): 新增 misty-cave-1f/2f/3f 和 underwater-prison-1f/2f/3f/4f 怪物
  - [x] seed.ts (drop): 各樓層獨立掉落表（金幣 200~350，銀礦/銀精華，裝備，強化卷軸）
  - [x] TypeScript 編譯通過

### Phase 4：全區域怪物 + 掉落資料補齊（進行中）

> 所有 dungeon 區域（非 floors 陣列型）需要在 seed.ts 補上 area-specific 怪物 + 掉落
> 完成後移除 spawnCombat 的 name-based fallback

**象牙塔（5 層）：**
- [x] ivory-tower-1f: 冰霜蜘蛛, 象牙巫師, 冰晶蝙蝠 (Lv.33~36)
- [x] ivory-tower-2f: 象牙巫師, 冰晶蝙蝠, 霜甲戰士 (Lv.36~38)
- [x] ivory-tower-3f: 霜甲戰士, 冰霜元素, 象牙魔導師 (Lv.38~40)
- [x] ivory-tower-4f: 冰霜元素, 象牙魔導師, 霜甲戰士 (Lv.40~42)
- [x] ivory-tower-5f: 冰霜元素, 象牙魔導師, 霜甲戰士, 象牙塔惡魔(Boss) (Lv.42~45)

**龍谷地間（7 層）：**
- [x] dragon-valley-1f: 高階骷髏警衛, 高階骷髏神射手, 高階骷髏鬥士, 剝皮蜘蛛 (Lv.40~43)
- [x] dragon-valley-2f: 同 1F (Lv.40~43)
- [x] dragon-valley-3f: 高階骷髏警衛, 高階骷髏神射手, 高階骷髏鬥士, 大莫蜘蛛 (Lv.43~46)
- [x] dragon-valley-4f: 同 3F (Lv.43~46)
- [x] dragon-valley-5f: 大莫蜘蛛, 死亡靈魂, 高階骷髏鬥士 (Lv.46~49)
- [x] dragon-valley-6f: 同 5F (Lv.46~49)
- [x] dragon-valley-7f: 大莫蜘蛛, 死亡靈魂, 死亡靈魂守衛, 安塔巨龍(Boss) (Lv.49~50)

**百柱塔（10 區間）：**
- [x] hundred-pillar-1-10f: 百柱蜘蛛, 百柱祕密, 百柱妖女, 百柱奇美拉, 百柱幻影, 毒之皇女(Boss) (Lv.45~52)
- [x] hundred-pillar-11-20f: 高階夢魘, 高階哥布林, 高階地靈, 高階爬蟲, 高階哥布林弓手, 高階哥布林戰士, 高階地靈之主, 哥布林之王(Boss) (Lv.45~52)
- [x] hundred-pillar-21-30f: 暗影潛伏者, 暗影蝙蝠, 暗影刺客, 暗影巫師, 暗影獵犬, 暗影吸血鬼(Boss) (Lv.45~52)
- [x] hundred-pillar-31-40f: 不死骷髏兵, 不死腐屍, 不死幽魂, 不死死靈騎士, 不死巫妖, 不死殭屍王(Boss) (Lv.52~57)
- [x] hundred-pillar-41-50f: 古代幼龍, 古代小型飛龍, 古代龍人, 古代雙頭龍, 古代龍騎兵, 龍王約特勒(Boss) (Lv.52~57)
- [x] hundred-pillar-51-60f: 怨念幽靈, 哭嚎女妖, 鬼魂遊蕩者, 冥界使者, 冥王哈馬斯(Boss) (Lv.52~57)
- [x] hundred-pillar-61-70f: 霜凍巨人, 霜凍狼, 冰晶元素, 霜凍女巫, 霜凍伊莉絲(Boss) (Lv.57~60)
- [x] hundred-pillar-71-80f: 熔岩巨獸, 火焰蜥蜴, 岩漿元素, 熔岩守衛, 熔岩伊弗利特(Boss) (Lv.57~60)
- [x] hundred-pillar-81-90f: 殘影毒之皇女, 殘影哥布林之王, 殘影暗影吸血鬼, 殘影不死殭屍王, 殘影龍王約特勒, 殘影冥王哈瑪斯, 殘影霜凍伊莉絲, 殘影熔岩伊弗利特, 守護者之主(Boss) (Lv.57~60)
- [x] hundred-pillar-91-100f: 精靈王衛兵, 死之信徒, 精靈王射手, 精靈王魔導士, 死之執行者, 百柱死神(Boss) (Lv.60)

**遠古地監（9 層）：**
- [x] ancient-dungeon-1f: 遠古囚犯, 遠古弓箭手 (Lv.45~50)
- [x] ancient-dungeon-2f: 同 1F (Lv.45~50)
- [x] ancient-dungeon-3f: 同 1F (Lv.45~50)
- [x] ancient-dungeon-4f: 封印殭屍, 遠古囚犯, 遠古弓箭手 (Lv.50~55)
- [x] ancient-dungeon-5f: 同 4F (Lv.50~55)
- [x] ancient-dungeon-6f: 同 4F (Lv.50~55)
- [x] ancient-dungeon-7f: 遠古凶獸, 遠古戰士, 遠古神射手, 遠古食人妖精 (Lv.55~60)
- [x] ancient-dungeon-8f: 同 7F (Lv.55~60)
- [x] ancient-dungeon-9f: 遠古凶獸, 遠古戰士, 遠古神射手, 遠古食人妖精, 遠古騎士(Boss) (Lv.55~60)

**完成後：**
- [x] 移除 spawnCombat 的 name-based fallback
- [x] TypeScript 編譯通過
- [x] 全測試通過（473 tests）

**備註：** 掉落表部分只有 misty-cave 和 underwater-prison 有分層掉落。其他地城（ivory-tower、dragon-valley、ancient-dungeon、百柱塔）的掉落表已在 seed.ts 中以原 area ID 存在，由 drop 查詢邏輯正確對應。
- [x] M-12: 飛龍元素已正確（wind）
- [x] M-13: Boss 金幣改為固定值（660 / 900）
- [x] M-14: 重命名為 `isHandSlot`，保留 deprecated alias

### Phase 3：Low 輕度衝突（7/7 完成） ✅

- [x] L-1: `getPlayerAttackInterval` 新增讀取 activeEffects 中 speed buff
- [x] L-2: 31-battle-script.md 統一為「不動作（等待下一輪）」
- [x] L-3: 已確認使用 `getEffectiveINT`（隨 H-1 修正）
- [x] L-4: 保留 requiredLevel 欄位做顯示用，不做等級限制
- [x] L-5: 移除 `+0 ~ +9` 誤導性註解
- [x] L-6: 已確認 `buffCategory: 'speed'`（隨 H-13 修正）
- [x] L-7: 已確認一致（600ms）

### 總結

- 34 項衝突中已解決 32 項
- 保留 2 項：M-1（設計決策）、M-5（設計決策）
- TypeScript 編譯通過

---

## 裝備模板同步機制（Template Sync）

> 目標：裝備基礎素質從模板（seed）即時讀取，DB 實例只儲存差異化數據。  
> 修改模板數值後，所有既有裝備自動生效，無需 DB migration。

### 架構設計

**模板（EquipmentTemplate，seed.ts / 記憶體）** — 提供基礎素質：

| 欄位 | 說明 |
|------|------|
| name | 裝備名稱 |
| type | 類型（武器/防具） |
| slot | 裝備欄位 |
| isTwoHanded | 是否雙手 |
| smallMonsterDamage | 基礎對小怪傷害 |
| largeMonsterDamage | 基礎對大怪傷害 |
| defense | 基礎防禦 |
| attackSuccess | 命中加成 |
| extraAttack | 額外攻擊 |
| magicAttack | 魔法攻擊 |
| bonusHp | HP+ |
| bonusMp | MP+ |
| hpRegen | 回血+ |
| mpRegen | 回魔+ |
| bonusWeight | 負重+ |
| bonusStats | 額外屬性（如力量+1） |
| blockRate | 格擋率 |
| weight | 物品重量 |
| material | 材質 |
| stability | 安定值 |
| requiredLevel | 需求等級 |
| requiredClass | 可用職業 |
| buyPrice | 購買價格 |

**實例（EquipmentInstance，IndexedDB）** — 只儲存差異化數據：

| 欄位 | 說明 |
|------|------|
| id | 實例唯一 ID |
| templateId | 引用模板 ID |
| ownerId | 持有角色 ID |
| equipped | 是否裝備中 |
| inStorage | 是否在倉庫 |
| quality | 品質 %（0~20） |
| enhancement | 強化等級 |
| affixes | 詞綴陣列（最多 4 條） |
| element | 附魔元素（武器限定） |

### 讀取時合併邏輯

```typescript
function resolveEquipment(instance: EquipmentInstance): ResolvedEquipment {
  const template = getTemplateById(instance.templateId);
  return {
    ...template,           // 基礎素質從模板讀取
    ...instance,           // 差異化數據覆蓋
    // 強化加成由 enhancement 計算
    // 詞綴效果由 affixes + quality 計算
  };
}
```

### 需要變更的模組

| 模組 | 變更內容 |
|------|----------|
| `models/equipment.ts` | `EquipmentInstance` 移除基礎素質欄位，新增 `ResolvedEquipment` 型別 |
| `stores/gameStore.ts` | 裝備讀取時呼叫 `resolveEquipment` 合併 |
| `systems/combat.ts` | 改讀 resolved 後的值 |
| `systems/drops.ts` | 生成實例時只存差異欄位 |
| `components/EquipmentInfo.tsx` | 顯示 resolved 後的值 |
| `components/StatusPanel.tsx` | 負重計算改讀 resolved 值 |
| `components/BagPanel.tsx` | Tooltip 改讀 resolved 值 |
| `components/town/*.tsx` | 鐵匠鋪/商店改讀 resolved 值 |
| `db/seed.ts` | 不變（模板來源） |
| `db/` | DB migration：既有實例移除冗餘基礎素質欄位 |

### Migration 策略

1. 新增 `resolveEquipment()` 函式，對外 API 不變
2. 逐步將各模組的直接讀取改為透過 resolve
3. 確認所有模組改完後，移除 DB 中的冗餘欄位
4. 清理 migration：DB 開啟時刪除舊欄位（或直接忽略）

### 限制

- 模板 ID 不可隨意變更（DB 實例引用）
- 模板刪除前必須確認無實例引用
- `resolveEquipment` 必須處理模板找不到的情況（防禦性程式）

---

### Phase 5：百柱塔通行卷軸 + 掉落表（進行中）

**已完成：**
- [x] `area.ts`: Region 介面新增 `entryScrollName` 欄位
- [x] `mapData.ts`: 百柱塔 11~100F 各區間設定 `entryScrollName`（百柱塔 11F/21F/.../91F 通行卷軸）
- [x] `gameStore.ts`: `changeArea` 檢查卷軸，無卷軸阻擋並提示，有則消耗
- [x] TypeScript 編譯通過

**待完成 — 百柱塔掉落表：**
- [ ] hundred-pillar-1-10f 掉落表（含「百柱塔 11F 通行卷軸」）
- [ ] hundred-pillar-11-20f 掉落表（含「百柱塔 21F 通行卷軸」）
- [ ] hundred-pillar-21-30f 掉落表（含「百柱塔 31F 通行卷軸」）
- [ ] hundred-pillar-31-40f 掉落表（含「百柱塔 41F 通行卷軸」）
- [ ] hundred-pillar-41-50f 掉落表（含「百柱塔 51F 通行卷軸」）
- [ ] hundred-pillar-51-60f 掉落表（含「百柱塔 61F 通行卷軸」）
- [ ] hundred-pillar-61-70f 掉落表（含「百柱塔 71F 通行卷軸」）
- [ ] hundred-pillar-71-80f 掉落表（含「百柱塔 81F 通行卷軸」）
- [ ] hundred-pillar-81-90f 掉落表（含「百柱塔 91F 通行卷軸」）
- [ ] hundred-pillar-91-100f 掉落表（最終層，無下一區卷軸）
- [ ] 確認 `27-drop-table.md` 百柱塔掉落設計
- [ ] 更新 seed.test.ts drop count
- [ ] TypeScript + 全測試通過

**待確認 — 其他缺掉落表的區域：**
- [x] ivory-tower-1f ~ 5f：已有掉落表 ✅
- [x] dragon-valley-1f ~ 7f：已有掉落表 ✅
- [x] ancient-dungeon-1f ~ 9f：已有掉落表 ✅
- 結論：只有百柱塔 10 個區間缺掉落表

---

## Wiki 查詢站實作計劃

> 開始日期：2026-06-26
> 目標：在現有 React app 中新增 `/wiki` 路由，提供遊戲資料查詢功能
> 設計原則：資料層抽象化，現階段直接讀 seed/model 資料，線上化後切換為 API fetch

### 架構決策

- **路由方案**：1A — 同一個 React app，加入 React Router，`/wiki/*` 為查詢站路由
- **資料來源**：2A — 直接引用現有 `db/seed.ts` 和 `models/` 中的靜態定義資料
- **資料抽象層**：所有查詢頁透過 `hooks/useWikiData.ts` 取資料，不直接 import seed
  - 現階段：hook 內部 import 靜態資料
  - 線上化後：hook 內部改為 fetch API，頁面元件零修改
- **風格**：與遊戲同風格（深色 RPG 感），表格為主、方便閱讀

### 頁面規劃

| 路由 | 功能 | 資料來源 |
|------|------|----------|
| `/wiki` | 首頁 / 分類導覽 | 靜態 |
| `/wiki/weapons` | 武器模板列表（篩選/排序） | `EQUIPMENT_SEEDS`（type=weapon） |
| `/wiki/armor` | 防具模板列表 | `EQUIPMENT_SEEDS`（type=armor） |
| `/wiki/monsters` | 怪物資料列表（依區域/等級篩選） | `MONSTER_SEEDS` |
| `/wiki/maps` | 地圖結構 + 等級對應 + 怪物分佈 | `mapData.ts` + `MONSTER_SEEDS` |
| `/wiki/exp-table` | 升級經驗表 | `models/character.ts` 經驗公式 |
| `/wiki/attributes` | 屬性說明 + 公式對照 | 設計文件整理 |
| `/wiki/skills` | 技能列表 + 職業限制 | `models/skill.ts` |
| `/wiki/drops` | 掉落表查詢（依區域） | `DROP_TABLE_SEEDS` |

### 技術實作

#### Phase W1：基礎架構
- [ ] 安裝 React Router (`react-router-dom`)
- [ ] `vite.config.ts` 加入 SPA fallback（GitHub Pages 用 `404.html` 導向）
- [ ] 建立 `/wiki` 路由結構 + Layout 元件（導覽列、側邊欄）
- [ ] 建立 `hooks/useWikiData.ts` 資料抽象層
- [ ] 遊戲本體包在 `/` 路由下，與 wiki 獨立
- [ ] 遊戲 UI 登出按鈕旁新增「Wiki」按鈕，點擊導航至 `/wiki` 首頁

#### Phase W2：核心頁面
- [ ] Wiki 首頁（分類卡片導覽）
- [ ] 武器列表頁（表格 + 篩選：材質/等級/雙手）
  - [ ] 武器詳情：安定值、強化成功率公式、強化失敗結果
  - [ ] 武器詳情：可附加詞綴列表 + 品質對詞綴數值的影響
- [ ] 防具列表頁（表格 + 篩選：部位/等級）
  - [ ] 防具詳情：安定值、強化成功率公式、強化失敗結果
  - [ ] 防具詳情：可附加詞綴列表 + 品質對詞綴數值的影響
- [ ] 怪物列表頁（表格 + 篩選：區域/等級/種族/元素/體型）
- [ ] 鐵匠鋪製作頁
  - [ ] 製作配方列表（成品 + 所需材料 + 所需金幣）
  - [ ] 材料來源連結（點擊材料 → 跳轉對應怪物掉落表/區域）

#### Phase W3：延伸頁面
- [ ] 地圖總覽頁（區域樹狀結構 + 等級範圍 + 怪物列表連結）
- [ ] 升級經驗表頁（Lv.1~100 各等級所需經驗 + 累計經驗）
- [ ] 技能列表頁（依職業分類 + 學習等級限制）
- [ ] 掉落表頁（依區域查詢掉落物 + 機率）

#### 跨頁連結規則（所有頁面通用）
- [ ] 怪物 ↔ 地圖：怪物頁顯示出沒區域（可點擊跳轉地圖），地圖頁顯示區域怪物（可點擊跳轉怪物）
- [ ] 怪物 → 掉落：怪物詳情顯示掉落的武器/防具/材料（可點擊跳轉對應裝備詳情）
- [ ] 武器/防具 → 掉落來源：裝備詳情顯示「哪些怪物/區域會掉落此裝備」（可點擊跳轉怪物/地圖）
- [ ] 鐵匠材料 → 掉落來源：材料顯示「哪些怪物掉落此材料」（可點擊跳轉怪物/地圖）
- [ ] 地圖 → 掉落表：地圖詳情顯示該區域所有可獲得的裝備/材料（可點擊跳轉裝備詳情）

#### Phase W4：輔助功能
- [ ] 屬性公式說明頁（STR/DEX/CON/INT/WIS 對應效果）
- [ ] 攻擊力計算說明頁
  - [ ] 物理攻擊力公式（基礎攻擊 + 武器 + STR/DEX 加成 + 強化加成）
  - [ ] 技能攻擊力公式（skill power + INT 加成 + 元素乘區 + 暴擊計算）
  - [ ] 命中/迴避/暴擊率公式
  - [ ] 防禦與傷害減免計算
- [ ] 強化系統說明（武器/防具各自的成功率公式 + 安定值影響）
- [ ] 搜尋功能（全站關鍵字搜尋）

#### Phase W5：測試 + 部署
- [ ] Wiki 頁面元件 unit test
- [ ] useWikiData hook unit test
- [ ] GitHub Pages 404.html SPA fallback
- [ ] TypeScript 編譯通過
- [ ] 全測試通過

### 限制

- 查詢站為純展示，不可修改任何遊戲資料
- 不做使用者登入/個人化功能
- 不重複定義數值，所有數據來自同一份 source of truth
- 線上化後只改 `useWikiData.ts` 內部實作，頁面元件不動
