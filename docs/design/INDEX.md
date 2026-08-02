# MayanaIdle 設計文件索引

> **AI 必讀**：實作任何功能前，必須先查閱此索引找到對應文件，閱讀完整規格後再動手。不可憑記憶或假設實作。
>
> **要改版本號或部署前**，先讀 `docs/RELEASE.md`（操作手冊：三種版本的差異、部署順序、會遇到的問題）。

---

## 快速查找表

### 依功能查找

| 要實作的功能 | 必讀文件 | 章節 |
|---|---|---|
| 背包系統限制（容量/負重/互動/顯示） | `35-inventory-constraints.md` | 全文 |
| 武器強化 | `06-equipment.md` | § 6.9 |
| 防具強化 | `06-equipment.md` | § 6.10 |
| 裝備品質提升 | `08-quality.md` | 全文 |
| 詞綴系統（Tier/數值/pool） | `07-affix.md` | 全文 |
| 裝備掉落/詞綴生成 | `07-affix.md` | § 7.3 |
| 裝備部位/左右手規則 | `06-equipment.md` | § 6.2~6.5 |
| 武器類型/職業限制 | `06-equipment.md` | § 6.6~6.7 |
| 武器屬性結構 | `06-equipment.md` | § 6.8 |
| 武器傷害（小怪/大怪） | `06-equipment.md` | § 6.11 |
| 裝備取得（商店/鐵匠製作） | `06-equipment-acquire.md` | 全文 |
| 武器模板清單 | `06-equipment-weapons.md` | 索引頁（連結各子文件） |
| 防具模板清單 | `06-equipment-armor.md` | 全文 |
| 戰鬥公式（攻擊/防禦/命中/迴避） | `21-combat-formula.md` | 全文 |
| 角色屬性（六大屬性/換算） | `20-attributes.md` | 全文 |
| 角色職業/初始屬性 | `04-character.md` | § 4.2 |
| 技能系統規則 | `05-skill.md` | 全文 |
| 基礎魔法（50 個，1~10 級） | `22-basic-magic.md` | 全文 |
| 職業魔法（5 職業各 5 級） | `23-class-magic.md` | 全文 |
| Buff/Debuff 系統（疊加/控場/DoT/UI） | `24-buff-debuff.md` | 全文 |
| 角色 Debuff（中毒/流血/詛咒/虛弱/減速/暈眩） | `24-buff-debuff.md` | § 24.4, § 24.10 |
| Debuff 解除手段（道具/免疫詞綴） | `24-buff-debuff.md` | § 24.10 |
| 怪物 Debuff 能力（已併入怪物屬性表） | `25-monster-system.md` | § 25.8（能力值）、§ 25.9（原則/規則） |
| 免疫詞綴（特殊詞綴） | `07-affix.md` | § 7.10 |
| 狀態解除道具（解毒/止血/淨化） | `30-items.md` | § 狀態解除道具 |
| 戰鬥腳本 / 常駐腳本（自動戰鬥 AI） | `03-combat.md` | § 3.12（戰鬥腳本）、§ 3.13（常駐腳本＋緊急撤退） |
| 怪物種族/體型/元素 | `25-monster-system.md` | 全文 |
| 元素系統（屬性/克制/傷害顏色） | `42-element-system.md` | 全文 |
| 怪物生成/Pressure 機制 | `26-spawn-pressure.md` | 全文 |
| 怪物素質表 | `28-monster-stats.md` | 全文 |
| 怪物掉落表 | `27-drop-table.md` | 全文 |
| 道具定義（藥水/卷軸/材料） | `30-items.md` | 全文 |
| 城鎮設施（雜貨店/鐵匠/旅館等） | `13-town.md` | § 13.3~13.10 |
| 新手 NPC（新手裝備/強化/領取限制） | `13-town.md` | § 13.11 |
| 回城卷軸/死亡機制 | `13-town.md` | § 13.8 |
| 副本系統/地圖結構 | `09-dungeon.md` | 全文 |
| HP/MP 自然回復 | `29-regen.md` | 全文 |
| 陣營系統 | `10-faction.md` | 全文 |
| 公會系統 | `11-guild.md` | 全文 |
| 寵物系統 | `12-pet.md` | 全文 |
| 成就/排行榜 | `14-endgame.md` | 全文 |
| 核心循環 | `02-core-loop.md` | 全文 |
| 戰鬥系統（自動/手動） | `03-combat.md` | 全文 |
| 資料結構設計 | `18-data-schema.md` | 全文 |
| 技術方向 | `16-tech.md` | 全文 |
| 前端架構（目錄/狀態/資料流/組件） | `16-tech-frontend-architecture.md` | 全文 |
| 帳號與多角色系統（角色選擇/登出/倉庫共用） | `19-account-character.md` | 全文 |
| 線上化架構（tick/事件驅動/DB策略/scaling） | `98-online-architecture.md` | 全文 |
| 城鎮面板 UI 規範 | `34-ui-guidelines.md` | 全文 |
| 每日任務系統（冒險者工會） | `36-quest-system.md` | 全文 |
| 角色統計數據（成就計數） | `37-statistics.md` | 全文 |
| 地圖控制系統（俯瞰視角/移動/紅點生成/環境主題） | `38-map-control.md` | 全文，地形 catalog 見 § 38.4 |
| 地圖設計（主題地形配方/佈局原型/硬性約束） | `38-map-control.md` | § 38.11~§ 38.12 |
| 批量販售（依等級一鍵販售/裝備顏色等級） | `39-batch-sell.md` | 全文 |
| DPS 預測 / 職業輸出平衡健檢 | `44-dps-prediction.md` | 全文 |
| 遺產系統（舊角色唯讀封存） | `45-legacy-archive.md` | 全文 |
| 資料版本淘汰（CURRENT_DATA_VERSION） | `19-account-character.md` | § 19.9 |

### 依限制查找

| 需要確認的限制 | 必讀文件 |
|---|---|
| AI 不可做的事 | `99-ai-constraints.md` § 99.1 |
| 背包系統限制（容量/負重/互動/顯示/禁止） | `35-inventory-constraints.md` |
| 暫不考慮的系統 | `15-excluded.md` |
| MVP 開發順序 | `17-mvp-priority.md` |
| 世界觀禁止方向 | `01-worldview.md` |

---

## 文件完整清單（依分類）

### 基礎設定

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `00-overview.md` | 文件用途/基本資訊 | 遊戲定位、核心方向 |
| `01-worldview.md` | 世界觀 | 兩大王國、禁止方向 |
| `02-core-loop.md` | 核心循環 | 探索→戰鬥→掉落→強化 loop |

### 角色與職業

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `04-character.md` | 五職業定義 | 初始屬性、職業特性 |
| `20-attributes.md` | 屬性系統 | 六大屬性、換算公式、負重 |
| `05-skill.md` | 技能規則 | 學習限制、MP 消耗、冷卻 |
| `22-basic-magic.md` | 基礎魔法 | 50 個魔法、1~10 級 |
| `23-class-magic.md` | 職業魔法 | 5 職業各 5 級 |
| `19-account-character.md` | 帳號與多角色 | 角色格數、角色選擇、登出、倉庫共用 |

### 裝備系統

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `06-equipment.md` | 裝備核心系統 | 部位、武器類型、**強化規則**、壞刀 |
| `06-equipment-acquire.md` | 裝備取得 | 商店購買/鐵匠製作、價格表 |
| `06-equipment-weapons.md` | 武器模板索引 | 各武器類型子文件連結 |
| `06-equipment-weapons-onesword.md` | 單手劍（25） | 屬性、職業限制 |
| `06-equipment-weapons-dagger.md` | 匕首（12） | 屬性、職業限制 |
| `06-equipment-weapons-oneaxe.md` | 單手斧（8） | 屬性、職業限制 |
| `06-equipment-weapons-mace.md` | 單手鈍器（8） | 屬性、職業限制 |
| `06-equipment-weapons-staff.md` | 法杖（14） | 屬性、職業限制 |
| `06-equipment-weapons-twosword.md` | 雙手劍（11） | 屬性、職業限制 |
| `06-equipment-weapons-twoaxe.md` | 雙手斧（10） | 屬性、職業限制 |
| `06-equipment-weapons-bow.md` | 弓（17） | 屬性、職業限制 |
| `06-equipment-weapons-twostaff.md` | 雙手法杖（8） | 屬性、職業限制 |
| `06-equipment-weapons-dualblade.md` | 雙刀（7） | 屬性、職業限制 |
| `06-equipment-weapons-claw.md` | 鋼爪（7） | 屬性、職業限制 |
| `06-equipment-weapons-shield.md` | 盾牌（6） | 防禦力、格擋率 |
| `06-equipment-armor.md` | 防具模板 | 全防具清單、屬性 |
| `07-affix.md` | 詞綴系統 | T1~T7 數值、詞綴 pool、生成規則 |
| `08-quality.md` | 品質系統 | 0%~20%、品質石、影響範圍 |

### 戰鬥系統

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `03-combat.md` | 戰鬥系統 | 手動/自動/Pressure |
| `21-combat-formula.md` | 戰鬥公式 | 物理/魔法攻擊、防禦減傷、命中迴避 |
| `24-buff-debuff.md` | Buff/Debuff 系統 | 疊加規則、控場、DoT、Boss 免疫、UI 顯示 |
| `44-dps-prediction.md` | DPS 預測報告 | Lv.75 滿裝 vs 百柱死神：屬性分配、BiS、擊殺時間、職業落差 |

### 怪物系統

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `25-monster-system.md` | 怪物系統 | 種族、體型（元素已移至 42） |
| `26-spawn-pressure.md` | 怪物生成 | Pressure 公式、生成數量 |
| `27-drop-table.md` | 掉落表 | 區域掉落池、Boss 掉落 |
| `28-monster-stats.md` | 怪物素質 | HP/攻/防/經驗值 |
| `42-element-system.md` | 元素系統 | 元素類型、克制關係、傷害顏色規則 |

### 世界與城鎮

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `09-dungeon.md` | 副本/地圖 | 區域結構、層數、Boss |
| `13-town.md` | 城鎮系統 | 設施功能、**回城卷軸**、**死亡機制**、**鐵匠鋪**、**新手 NPC** |
| `29-regen.md` | HP/MP 回復 | 自然回復公式 |
| `30-items.md` | 道具系統 | 藥水、卷軸、材料、重量 |

### 社交與成長

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `10-faction.md` | 陣營 | 兩陣營、Lv30 開啟 |
| `11-guild.md` | 公會 | 公會功能 |
| `12-pet.md` | 寵物 | 寵物定位 |
| `14-endgame.md` | 成就/排行榜 | 長期目標 |
| `36-quest-system.md` | 每日任務系統 | 冒險者工會、40 個任務、每日重置、獎勵機制 |
| `37-statistics.md` | 角色統計數據 | 殺敵數、BOSS討伐、死亡、強化、任務完成、金幣獲得 |
| `38-map-control.md` | 地圖控制系統 | 等距俯瞰地圖、地形 catalog、移動/尋路、紅點生成、環境主題地形配方 |
| `39-batch-sell.md` | 批量販售系統 | 依等級分類批量販售、裝備顏色等級、素材 Tier 篩選 |

### 技術架構

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `16-tech.md` | 技術方向 | React/Vite/TypeScript/PostgreSQL |
| `16-tech-frontend-architecture.md` | 前端架構 | 目錄結構、狀態管理、資料流、計時器、組件職責 |
| `18-data-schema.md` | 資料結構 | 模板 vs 實例、DB 設計、帳號角色關係 |
| `34-ui-guidelines.md` | UI 統一規範 | 城鎮面板統一樣式、卡片行佈局、裝備組件使用規則 |
| `35-inventory-constraints.md` | 背包系統限制 | 容量/負重/互動方式/Tooltip/快捷鍵/禁止事項 |
| `43-wiki-system.md` | In-App Wiki 系統 | Wiki 架構、頁面清單、資料來源、路由、擴充指引 |

### 專案管理與限制

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `15-excluded.md` | 排除系統 | 不做的功能 |
| `17-mvp-priority.md` | MVP 順序 | 五階段優先順序 |
| `98-online-architecture.md` | 線上化架構設計 | 統一 tick、事件驅動、資料分層、Buffer 策略、Auto-scaling |
| `99-ai-constraints.md` | AI 限制 | 67 條限制 + 待補規格 |

---

## 連動關係圖

實作時修改一個系統，必須檢查連動文件：

```
06-equipment.md ←→ 07-affix.md ←→ 08-quality.md ←→ 13-town.md（鐵匠鋪）
       ↕                                                    ↕
06-equipment-acquire.md                              30-items.md（材料/卷軸）
       ↕
06-equipment-weapons.md / 06-equipment-armor.md ←→ 28-monster-stats.md（武器強度 vs 怪物防禦）

03-combat.md ←→ 04-character.md ←→ 05-skill.md ←→ 20-attributes.md
       ↕                                    ↕
21-combat-formula.md                 22-basic-magic.md / 23-class-magic.md
       ↕                                                        ↕
24-buff-debuff.md ←→ 25-monster-system.md（怪物 debuff / Boss 控場免疫 / 怪物 debuff 能力表）
       ↕                                                        ↕
07-affix.md（免疫詞綴 § 7.10）←→ 30-items.md（狀態解除道具）←→ 13-town.md（雜貨店商品清單）
       ↕
16-tech-frontend-architecture.md（Icon 系統 / BuffBar / 浮動面板視窗 / Tooltip）
                                                                ↕
                                        27-drop-table.md ←→ 13-town.md（職業工會任務）

25-monster-system.md ←→ 26-spawn-pressure.md ←→ 28-monster-stats.md
                ↕
42-element-system.md ←→ 05-skill.md / 22-basic-magic.md / 23-class-magic.md / 40-pixijs-migration.md
                                                        ↕
                                                  27-drop-table.md ←→ 30-items.md
                                                        ↕
                                                  06-equipment-acquire.md（區域素材→製作配方）

04-character.md § 4.9（經驗曲線）←→ 28-monster-stats.md（怪物經驗值全表依此推算）
       ↕
09-dungeon.md（等級分佈）←→ 99-ai-constraints.md 第 26 條

19-account-character.md ←→ 04-character.md（職業/初始配置）
       ↕
18-data-schema.md（User/Character 關係、character uuid）←→ 13-town.md（個人倉庫共用）
       ↕
37-statistics.md（角色名稱唯一性／註冊 API／排行榜以 uuid 為 key）
       ↕
45-legacy-archive.md（資料版本淘汰 → 快照封存；統計欄位語意不可變更）

35-inventory-constraints.md ←→ 20-attributes.md（負重公式）
       ↕                              ↕
30-items.md（物品重量）         06-equipment.md（裝備穿脫）
       ↕                              ↕
13-town.md（倉庫/商店/鐵匠）   16-tech-frontend-architecture.md（BagPanel）
       ↕
34-ui-guidelines.md（顯示規範）←→ 18-data-schema.md（資料結構）

36-quest-system.md ←→ 13-town.md（冒險者工會設施）
       ↕                    ↕
27-drop-table.md（收集任務目標）  30-items.md（獎勵藥水/卷軸）
       ↕
28-monster-stats.md（擊殺任務目標）←→ 09-dungeon.md（區域對應）

38-map-control.md ←→ 03-combat.md / 41-arpg-combat.md（即時戰鬥、LOS、投射物）
       ↕                    ↕
26-spawn-pressure.md（合法生成地格）  09-dungeon.md（區域與 theme 對應）
       ↕                    ↕
40-pixijs-migration.md（theme palette / 分層渲染）←→ 16-tech-frontend-architecture.md（模組邊界）

44-dps-prediction.md（唯讀報告，被以下任一文件的數值變更所影響，需重跑驗算腳本）
  ← 21-combat-formula.md / 20-attributes.md / 04-character.md
  ← 07-affix.md / 08-quality.md / 06-equipment.md
  ← 22-basic-magic.md / 23-class-magic.md / 28-monster-stats.md / 41-arpg-combat.md

39-batch-sell.md ←→ 06-equipment-acquire.md（shopTier / craftTier 定義）
       ↕
13-town.md（雜貨店/武器店/防具店販售功能）
       ↕
30-items.md（素材 iconTier / sellPrice）←→ 34-ui-guidelines.md（面板統一樣式）
```
