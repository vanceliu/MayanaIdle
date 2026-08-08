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
| **裝備中的裝備仍留在背包並佔格（基礎 60 格）** | `35-inventory-constraints.md` § 35.1、§ 35.9 | — |
| **印記不佔格也不計重（走底部抽屜）** | `35-inventory-constraints.md` § 35.20、`30-items.md` § 30.2 | — |
| **負重上限與超重懲罰（無法攻擊/施法）** | `20-attributes.md` § 20.7、`35-inventory-constraints.md` § 35.2 | — |
| 武器強化 | `06-equipment.md` | § 6.9 |
| 防具強化 | `06-equipment.md` | § 6.10 |
| 裝備品質提升（印記師） | `08-quality.md` | 全文 |
| 詞綴系統（Tier/數值/pool） | `07-affix.md` | 全文 |
| **印記（詞綴升階／重骰／品質）** | `46-sigil.md` | 全文 |
| 印記掉落率 | `27-drop-table.md` | § 27.8 |
| 印記師 NPC | `13-town.md` | § 13.13 |
| 裝備掉落/詞綴生成 | `07-affix.md` | § 7.3 |
| 詞綴滿值粗體顯示 | `07-affix.md` | § 7.3.2 |
| 裝備部位/左右手規則 | `06-equipment.md` | § 6.2~6.5 |
| 武器類型/職業限制 | `06-equipment.md` | § 6.6~6.7 |
| 武器屬性結構 | `06-equipment.md` | § 6.8 |
| 武器傷害（小怪/大怪） | `06-equipment.md` | § 6.11 |
| 裝備取得（商店/鐵匠製作） | `06-equipment-acquire.md` | 全文 |
| 裝備數量分配（各類型各階梯幾把） | `06-equipment-requirement.md` | 武器規格表 |
| 武器/防具素質曲線（TTK 校準） | `44-dps-prediction.md` | § 44.7 |
| **防具防禦目標（全套 +4 的總防禦）** | `06-equipment-armor.md` | 逐件清單 |
| 副手（盾牌/魔導書/臂甲）防禦上限 | `06-equipment-armor.md` | 左手區塊 |
| **三件的定位（防禦/續戰/屬性型）** | `06-equipment-armor.md` | 「定位」欄 |
| **商店售價（T2~T3 的區間與內插）** | `06-equipment-acquire.md` | § 6A.2 |
| **腰帶（格數/屬性/防禦的階梯）** | `06-equipment-armor.md`、`35-inventory-constraints.md` § 35.1 | — |
| **製作材料分配規則** | `06-equipment-acquire.md` | § 6A.3 |
| 製作費（T4 5萬/T5 10萬/T6 20萬） | `06-equipment-acquire.md` | § 6A.3 |
| **項鍊/戒指（HP/MP/回復/屬性上限）** | `06-equipment-armor.md` | — |
| 新手裝（T1，創角直接穿上） | `04-character.md` | § 4.3 |
| 回血/回魔/HP/MP 的部位上限 | `06-equipment-armor.md` | 逐件清單 |
| 額外屬性走向（各路線各部位） | `06-equipment-armor.md` | 逐件清單 |
| 職業效率反向補償（武器數值） | **已取消**（不做補償，見 `06-equipment-requirement.md` 的職業上限表） | — |
| 武器走向（攻擊/輔助/INT/SPI/STR/AGI 型） | `06-equipment-requirement.md` | — |
| T7 陣容（以武器類型為單位） | `06-equipment-requirement.md` | — |
| 各管道詞綴 Tier 上限（商店 T3） | `06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2 | — |
| 武器模板清單 | `06-equipment-weapons.md` | 索引頁（連結各子文件） |
| 防具模板清單 | `06-equipment-armor.md` | 全文 |
| 戰鬥公式（攻擊/防禦/命中/迴避） | `21-combat-formula.md` | 全文 |
| 角色屬性（六大屬性/換算） | `20-attributes.md` | 全文 |
| 角色職業/初始屬性 | `04-character.md` | § 4.2 |
| **角色外觀（髮型/睫毛/膚色髮色眼色/四朝向）** | `04-character.md` | § 4.10 |
| **武器外觀與揮擊演出（揮擊角度/演出長度）** | `48-vfx.md` | § 48.6 |
| 創角的外觀步驟 | `19-account-character.md` | § 19.4（規格見 `04-character.md` § 4.10） |
| 外觀存哪／匯出匯入落點 | `18-data-schema.md` | § 18.7 |
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
| 怪物攻擊型別（近戰／遠程物理／遠程魔法） | `25-monster-system.md` | § 25.8「攻擊型別」 |
| 元素系統（屬性/克制/傷害顏色） | `42-element-system.md` | 全文 |
| 投射物顏色（依元素、不分敵我） | `42-element-system.md` | § 42.4 |
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
| 技能面板顯示規則（格子全開/暗亮態/依職業裁切） | `34-ui-guidelines.md` | § 34.7（上限數值見 `05-skill.md` § 5.3） |
| 行動裝置適配（斷點/觸控互動/指標拖放/手機版面/PWA） | `47-mobile.md` | 全文（模組邊界見 `16-tech-frontend-architecture.md` § 32.17） |
| 幀率與渲染解析度上限（桌機／手持）、每幀重繪通則 | `34-ui-guidelines.md` | § 34.9（`47-mobile.md` § 47.8 只留指標） |
| **特效（強化演出／印記師／戰鬥特效／CSS 與 Pixi 分工）** | `48-vfx.md` | 全文 |
| 裝備強化的成功／失敗演出 | `48-vfx.md` | § 48.4（機率與安定值見 `06-equipment.md` § 6.9~6.10） |
| 每日任務系統（冒險者工會） | `36-quest-system.md` | 全文 |
| **製作任務（鐵匠鋪「製作追蹤」）** | `36-quest-system.md` | § 36.13 |
| 任務追蹤視窗／進行中任務取消 | `36-quest-system.md` | § 36.10.3 |
| 角色統計數據（成就計數） | `37-statistics.md` | 全文 |
| 地圖控制系統（俯瞰視角/移動/紅點生成/環境主題） | `38-map-control.md` | 全文，地形 catalog 見 § 38.4 |
| 地圖設計（主題地形配方/佈局原型/硬性約束） | `38-map-control.md` | § 38.11~§ 38.12 |
| 批量販售（依等級一鍵販售/裝備顏色等級） | `39-batch-sell.md` | 全文 |
| DPS 預測 / 職業輸出平衡健檢 | `44-dps-prediction.md` | 全文（結論見 § 44.7、§ 44.10） |
| 遺產系統（舊角色唯讀封存） | `45-legacy-archive.md` | 全文 |
| 角色身分與密鑰（uuid / authToken） | `19-account-character.md` | § 19.4，API 見 `37-statistics.md` § 37.4.3 |
| 刪除角色 / 清除線上紀錄 | `37-statistics.md` | § 37.4.9，另見 `45-legacy-archive.md` § 45.4.1 |
| 資料版本淘汰（CURRENT_DATA_VERSION） | `19-account-character.md` | § 19.9 |

### 依限制查找

| 需要確認的限制 | 必讀文件 |
|---|---|
| 設計文件查不到的硬性規則 | `99-ai-constraints.md` § 99.1 |
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
| `06-equipment-requirement.md` | **武器規格（唯一來源）** | 每類型每階件數、五職業階梯上限、變體走向 |
| `06-equipment-weapons.md` | 武器模板索引 | ⚠️ **逐把清單已由產生器取代**，見 `06-equipment-acquire.md` § 6A.4 |
| `06-equipment-weapons-*.md` | 各類型武器子文件（14 份，含盾牌/魔導書/臂甲） | ⚠️ 同上，由產生器輸出 |
| `06-equipment-armor.md` | 防具模板 | ⚠️ **由產生器輸出**，勿手改 |
| `07-affix.md` | 詞綴系統 | T1~T7 數值、詞綴 pool、生成規則 |
| `46-sigil.md` | 印記系統 | 混沌／刺針／重刻／精鍊／突破／工藝印記、印記師 |
| `08-quality.md` | 品質系統 | 0%~20%、工藝印記、影響範圍 |

### 戰鬥系統

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `03-combat.md` | 戰鬥系統 | 手動/自動/Pressure |
| `21-combat-formula.md` | 戰鬥公式 | 物理/魔法攻擊、防禦減傷、命中迴避 |
| `24-buff-debuff.md` | Buff/Debuff 系統 | 疊加規則、控場、DoT、Boss 免疫、UI 顯示 |
| `44-dps-prediction.md` | DPS 預測 / 職業平衡健檢 | Lv.75 滿裝 vs 百柱死神。裝備由腳本自動選 BiS，五職業落差 2.22 倍 |

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
| `37-statistics.md` | 角色統計數據 | 殺敵數、BOSS討伐、死亡、強化、任務完成、金幣獲得、T7 武器／防具掉落數 |
| `38-map-control.md` | 地圖控制系統 | 等距俯瞰地圖、地形 catalog、移動/尋路、紅點生成、環境主題地形配方 |
| `39-batch-sell.md` | 批量販售系統 | 依等級分類批量販售、裝備顏色等級、素材 Tier 篩選 |

### 技術架構

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `16-tech.md` | 技術方向 | React/Vite/TypeScript/PostgreSQL |
| `16-tech-frontend-architecture.md` | 前端架構 | 目錄結構、狀態管理、資料流、計時器、組件職責 |
| `18-data-schema.md` | 資料結構 | 模板 vs 實例、DB 設計、帳號角色關係 |
| `34-ui-guidelines.md` | UI 統一規範 | 城鎮面板統一樣式、卡片行佈局、裝備組件使用規則、技能面板顯示規則、渲染上限 |
| `47-mobile.md` | 行動裝置適配 | 斷點、觸控互動、指標拖放、手機版面、PWA |
| `48-vfx.md` | 特效規範 | DOM／Pixi 分工、效能預算、強化演出、印記師、**武器攻擊演出**；其餘戰鬥特效待補 |
| `35-inventory-constraints.md` | 背包系統限制 | 容量/負重/互動方式/Tooltip/快捷鍵/禁止事項 |
| `43-wiki-system.md` | In-App Wiki 系統 | Wiki 架構、頁面清單、資料來源、路由、擴充指引 |

### 專案管理與限制

| 檔案 | 主題 | 關鍵內容 |
|---|---|---|
| `15-excluded.md` | 排除系統 | 不做的功能 |
| `17-mvp-priority.md` | MVP 順序 | 五階段優先順序 |
| `98-online-architecture.md` | 線上化架構設計 | 統一 tick、事件驅動、資料分層、Buffer 策略、Auto-scaling |
| `99-ai-constraints.md` | AI 限制 | 7 條設計文件查不到的規則 |

---

## 連動關係圖

實作時修改一個系統，必須檢查連動文件：

```
46-sigil.md（印記＝詞綴的升階、重骰與品質）
  ←→ 07-affix.md § 7.11（Tier 上限／特殊詞綴機率的另一個入口）
  ←→ 27-drop-table.md § 27.8（掉落率）←→ 30-items.md（重量／賣價）
  ←→ 13-town.md § 13.13（印記師）←→ 43-wiki-system.md（Wiki 呈現）

06-equipment.md ←→ 07-affix.md ←→ 08-quality.md ←→ 46-sigil.md ←→ 13-town.md（鐵匠鋪／印記師）
       ↕                    ↕                              ↕
06-equipment-acquire.md ────┘（§ 6A.6 各管道詞綴 Tier 上限 ←→ § 7.2 取得方式）
       ↕            （§ 6A.3 前置武器以 templateId 比對 ←→ 18-data-schema.md § 18.8 欄位）
       ↕                                              30-items.md（材料/卷軸）
       ↕
06-equipment-weapons.md / 06-equipment-armor.md ←→ 28-monster-stats.md（武器強度 vs 怪物防禦）
       ↕
06-equipment-requirement.md（武器規格：件數／職業上限／走向）
  → 依規格表產生武器數值
  ← 由 TTK 校準反推；改動下列任一者需重跑校準：
    21-combat-formula.md / 20-attributes.md / 04-character.md / 05-skill.md
    22-basic-magic.md / 23-class-magic.md / 28-monster-stats.md / 07-affix.md

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

04-character.md § 4.10（角色外觀＝髮型/睫毛/色票/四朝向的唯一出處）
  ←→ 48-vfx.md § 48.6（武器外觀＝武器類型造型/揮擊角度/演出長度的唯一出處）
  ←→ 19-account-character.md § 19.4（創角流程的外觀步驟）／§ 19.9（匯出匯入帶 appearance）
  ←→ 18-data-schema.md § 18.7（appearance 欄位與四個落點，匯入必須逐欄位列出）
  ←→ 40-pixijs-migration.md（玩家/NPC 用剪影並烘成 RenderTexture，怪物維持圓形）
  ←→ 45-legacy-archive.md § 45.2（遺產快照要帶外觀）
  ←→ 13-town.md § 13.2.1（NPC 逐設施固定外觀；敵我的顏色區分改由地面標記承擔）
  色票增刪時必須重算「每個膚色至少 4 個對比 ≥2.2 的眼色」對照表

04-character.md § 4.9（經驗曲線）←→ 28-monster-stats.md（怪物經驗值全表依此推算）
       ↕
09-dungeon.md（等級分佈）←→ 04-character.md § 4.9（經驗曲線）

19-account-character.md ←→ 04-character.md（職業/初始配置、§ 4.10 外觀）
       ↕      ←→ 20-attributes.md § 20.10（角色卡屬性＝建角＋升級配點，不含裝備／buff）
       ↕
18-data-schema.md（User/Character 關係、character uuid、共用倉庫金幣獨立表）
       ↕      ←→ 13-town.md（個人倉庫共用）
       ↕      ←→ 35-inventory-constraints.md § 共用倉庫（金幣存取）
       ↕      ←→ 16-tech-frontend-architecture.md（DB 表清單）
       ↕      ←→ 45-legacy-archive.md（封存快照的 gold 來源）
       ↕
37-statistics.md（排行榜以 uuid 為 key／角色密鑰驗證寫入／名稱不唯一以 #uuid 區分）
       ↕
45-legacy-archive.md（資料版本淘汰 → 快照封存；統計欄位語意不可變更；手動刪角清線上紀錄）

35-inventory-constraints.md ←→ 20-attributes.md（負重公式）
       ↕                              ↕
30-items.md（物品重量）         06-equipment.md（裝備穿脫）
       ↕                              ↕
13-town.md（倉庫/商店/鐵匠）   16-tech-frontend-architecture.md（BagPanel）
       ↕
46-sigil.md ←→ 35-inventory-constraints.md § 35.20（印記不佔格不計重，走底部抽屜）
       ↕
34-ui-guidelines.md（顯示規範）←→ 18-data-schema.md（資料結構）

48-vfx.md（特效：演出時機／長度／技術路線）
  ←→ 34-ui-guidelines.md § 34.9（渲染上限＝特效的效能預算，數值只在該節）
  ←→ 06-equipment.md § 6.9~6.10（強化的成功率與安定值＝演出的觸發條件，數值只在該節）
  ←→ 40-pixijs-migration.md（EffectLayer 是戰鬥特效的掛載點）
  ←→ 46-sigil.md（印記師的成功率與確認訊息＝演出的觸發條件，數值只在該文件）
  特效不得改變任何規則；改動機率或安定值時本文件不需同步，反之亦然
       ↕
16-tech-frontend-architecture.md § 32.15.1（視窗層級／底部 HUD 帶寬 --hud-band-bottom）
       ↕
47-mobile.md（行動裝置：斷點／觸控互動／指標拖放／手機版面／PWA）
  ←→ 16-tech-frontend-architecture.md § 32.17（useViewport／dragStore／HUD 帶模組邊界）
  ←→ 34-ui-guidelines.md § 34.6（介面縮放：縮放層內不可寫 vh/vw，行動版同樣適用）
  ←→ 34-ui-guidelines.md § 34.9（渲染上限：桌機與手持共用同一張表，§ 47.8 只留指標）
  ←→ 35-inventory-constraints.md § 35.1.3／§ 35.5.3（背包重排與丟棄，兩者都由拖放承載）
  ←→ 24-buff-debuff.md § 24.8.3（怪物列表：手機改靠右直排並縮到七成）

36-quest-system.md ←→ 13-town.md（冒險者工會設施）
       ↕                    ↕
27-drop-table.md（收集任務目標）  30-items.md（獎勵藥水/卷軸）
       ↕
28-monster-stats.md（擊殺任務目標）←→ 09-dungeon.md（區域對應）
       ↕
36-quest-system.md § 36.13（製作任務）←→ 13-town.md § 13.5（鐵匠鋪＝製作追蹤入口）
       ↕                          ←→ 06-equipment-acquire.md § 6A.3（配方需求＝任務需求的唯一來源）
       ↕                          ←→ 18-data-schema.md § 18.8（craftMaterials／craftPrerequisiteWeapon 欄位）
改動配方需求欄位或製作費時，製作任務的顯示與判定同步受影響，無須另改 § 36.13

38-map-control.md ←→ 03-combat.md / 41-arpg-combat.md（即時戰鬥、LOS、投射物）
       ↕                    ↕
26-spawn-pressure.md（合法生成地格）  09-dungeon.md（區域與 theme 對應）
       ↕                    ↕
40-pixijs-migration.md（theme palette / 分層渲染）←→ 16-tech-frontend-architecture.md（模組邊界）

44-dps-prediction.md（被以下任一文件的數值變更所影響，需重跑驗算腳本）
  ← 21-combat-formula.md / 20-attributes.md / 04-character.md
  ← 07-affix.md / 08-quality.md / 06-equipment.md
  ← 22-basic-magic.md / 23-class-magic.md / 28-monster-stats.md / 41-arpg-combat.md

39-batch-sell.md ←→ 06-equipment-acquire.md（shopTier / craftTier 定義）
       ↕
13-town.md（雜貨店/武器店/防具店販售功能）
       ↕
30-items.md（素材 iconTier / sellPrice）←→ 34-ui-guidelines.md（面板統一樣式）

13-town.md § 13.11（新手 NPC 對話分頁的前期知識條列 STARTER_TIPS，唯讀複述）
  ← 02-core-loop.md / 03-combat.md / 41-arpg-combat.md（戰鬥與探索）
  ← 13-town.md § 13.7~13.8（死亡、回城、旅館）
  ← 30-items.md § 30.1~30.2（藥水價格/冷卻/狀態解除）
  ← 06-equipment.md § 6.1 / § 6.8~6.10（左右手、安定值、強化失敗消失）
  ← 35-inventory-constraints.md § 35.2 / 20-attributes.md § 20.7（格數與負重、超重懲罰）
  ← 13-town.md § 13.9~13.10 / 36-quest-system.md / 43-wiki-system.md（技能與任務）
  上列任一數值變動時，必須同步更新新手指引內容
```
