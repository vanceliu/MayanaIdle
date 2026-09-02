# MayanaIdle 設計文件索引

> **AI 必讀**：實作任何功能前，必須先查閱此索引找到對應文件，閱讀完整規格後再動手。不可憑記憶或假設實作。
>
> **要改版本號或部署前**，先讀 `docs/RELEASE.md`（操作手冊：三種版本的差異、部署順序、會遇到的問題）。

---

## 快速查找表

### 依功能查找

| 要實作的功能 | 必讀文件 | 章節 |
|---|---|---|
| 核心循環 | `02-core-loop.md` | 全文 |
| 遊戲定位／核心方向 | `00-overview.md` | 全文 |
| 背包系統限制（容量/負重/互動/顯示） | `35-inventory-constraints.md` | 全文 |
| **裝備中的裝備仍留在背包並佔格（基礎 60 格）** | `35-inventory-constraints.md` § 35.1、§ 35.9 | — |
| **印記不佔格也不計重（走底部抽屜）** | `35-inventory-constraints.md` § 35.20、`30-items.md` § 30.2 | — |
| **負重上限與超重懲罰（無法攻擊/施法）** | `20-attributes.md` § 20.7、`35-inventory-constraints.md` § 35.2 | — |
| 武器強化 | `06-equipment.md` | § 6.9 |
| 防具強化 | `06-equipment.md` | § 6.10 |
| **強化入口（背包點卷軸／指定目標／機率視窗）** | `35-inventory-constraints.md` | § 35.5.5 |
| 裝備部位/左右手規則 | `06-equipment.md` | § 6.2~6.5 |
| **上衣／斗篷（T4 起開放／件數／防禦階梯）** | `06-equipment.md` | § 6A.8.9 |
| **防具路線（布／輕／重）／素質需求／件數** | `06-equipment.md` | § 6A.8.8 |
| **素質需求未滿足＝可裝備但詞綴凍結** | `06-equipment.md` | § 6A.8.8 |
| **需求判定的最小固定點（裝備屬性算不算）** | `06-equipment.md` § 6A.8.8、`20-attributes.md` § 20.10 | — |
| **防禦三段組成（基礎＋隨機 +0~+2＋強化）／全套防禦目標** | `06-equipment.md` | § 6A.8.8 |
| **防具安定值逐件抽 4~6** | `06-equipment.md` | § 6.10 |
| 武器類型/職業限制 | `06-equipment.md` | § 6.6~6.7 |
| 武器屬性結構 | `06-equipment.md` | § 6.8 |
| 武器傷害（小怪/大怪） | `06-equipment.md` | § 6.11 |
| 裝備品質提升（印記師） | `08-quality.md` | 全文 |
| 詞綴系統（Tier/數值/pool） | `07-affix.md` | 全文 |
| **固定值型詞綴（最大 HP／MP／回血／回魔的 range）** | `07-affix.md` | § 7.3.1 |
| **額外屬性詞綴（無 Tier、固定 +1、印記不可升階）** | `07-affix.md` § 7.3.1、`46-sigil.md` § 46.9 | — |
| 裝備掉落/詞綴生成 | `07-affix.md` | § 7.3 |
| 詞綴滿值粗體顯示 | `07-affix.md` | § 7.3.2 |
| 免疫詞綴（特殊詞綴） | `07-affix.md` | § 7.10 |
| **印記（詞綴升階／重骰／品質）** | `46-sigil.md` | 全文 |
| 印記掉落率 | `27-drop-table.md` | § 27.8 |
| 印記師 NPC | `13-town.md` | § 13.13 |
| 裝備取得（商店/鐵匠製作） | `06-equipment-acquire.md` | 全文 |
| **商店售價（T2~T3 的區間與內插）** | `06-equipment-acquire.md` | § 6A.2 |
| **製作材料分配規則／製作消耗** | `06-equipment-acquire.md` | § 6A.3 |
| 各管道詞綴 Tier 上限（商店 T3） | `06-equipment-acquire.md` § 6A.6、`07-affix.md` § 7.2 | — |
| **武器規格（各類型各階件數／五職業階梯上限／變體走向／T7 陣容）** | `06-equipment-requirement.md` | 武器規格表 |
| 武器/防具素質曲線（TTK 校準） | `44-dps-prediction.md` | § 44.7 |
| 武器模板清單 | `06-equipment-weapons.md` | 索引頁（連結各子文件） |
| 防具模板清單 | `06-equipment-armor.md` | 全文 |
| **防具逐件防禦與素質需求** | `06-equipment-armor.md` | 逐件清單 |
| 副手（盾牌/魔導書/臂甲）對應路線與防禦 | `06-equipment-armor.md` | 左手區塊 |
| **項鍊/戒指（HP/MP/回復/屬性上限）** | `06-equipment-armor.md` | — |
| **腰帶（格數/屬性/防禦的階梯）** | `06-equipment-armor.md`、`35-inventory-constraints.md` § 35.1 | — |
| 戰鬥系統（自動/手動） | `03-combat.md` | 全文 |
| 戰鬥公式（攻擊/防禦/命中/迴避） | `21-combat-formula.md` | 全文 |
| **技能傷害走哪條公式（魔法／物理快照／物理普攻）** | `21-combat-formula.md` § 21.4 / § 21.4a、`23-class-magic.md` § 23.1.1 | — |
| ARPG 即時戰鬥（LOS／投射物／位移） | `41-arpg-combat.md` | 全文 |
| **近戰判相鄰格、遠程判真實座標（出手與落腳格共用）** | `41-arpg-combat.md` | § 3.1 |
| 角色屬性（六大屬性/換算） | `20-attributes.md` | 全文 |
| **遠程攻擊吃敏捷、近戰吃力量** | `21-combat-formula.md` § 21.3、`20-attributes.md` § 20.3 | — |
| 角色職業/初始屬性 | `04-character.md` | § 4.2 |
| 新手裝（T1，創角直接穿上） | `04-character.md` | § 4.3 |
| **角色外觀（髮型/睫毛/膚色髮色眼色/四朝向）** | `04-character.md` | § 4.10 |
| 創角的外觀步驟 | `19-account-character.md` | § 19.4（規格見 `04-character.md` § 4.10） |
| 外觀存哪／匯出匯入落點 | `18-data-schema.md` | § 18.7 |
| **武器外觀與揮擊演出（揮擊角度/演出長度）** | `48-vfx.md` | § 48.6 |
| 技能系統規則 | `05-skill.md` | 全文 |
| 基礎魔法（50 個，1~10 級） | `22-basic-magic.md` | 全文 |
| 職業魔法（5 職業各 5 級） | `23-class-magic.md` | 全文 |
| Buff/Debuff 系統（疊加/控場/DoT/UI） | `24-buff-debuff.md` | 全文 |
| 角色 Debuff（中毒/流血/詛咒/虛弱/減速/暈眩） | `24-buff-debuff.md` | § 24.4、§ 24.10 |
| Debuff 解除手段（道具/免疫詞綴） | `24-buff-debuff.md` | § 24.10 |
| **debuff tag 一覽（免疫詞綴／解除道具／控場免疫的查表 key）** | `24-buff-debuff.md` | § 24.4.1 |
| **技能施加於怪物的 debuff（效果與秒數走技能表，只有 tag 共用）** | `24-buff-debuff.md` | § 24.4.1 下半 |
| 狀態解除道具（解毒/止血/淨化） | `30-items.md` | § 狀態解除道具 |
| **自動天賦（原自動腳本）：天賦格／合成／掉落** | `51-auto-talent.md` | 全文 |
| **條件與動作清單（一律內建，無 tier、無取得管道）** | `51-auto-talent.md` | § 51.4.5~51.4.11 |
| **條件與動作為何不是可收集物** | `51-auto-talent.md` | § 51.4.1、§ 51.12 |
| **天賦格取得（等級／合成／Boss 掉落）** | `51-auto-talent.md` | § 51.3.3 |
| **天賦格要先安裝（領取→背包→安裝）** | `51-auto-talent.md` | § 51.3.4 |
| **天賦格是換裝、條件與動作是複製** | `51-auto-talent.md` | § 51.3.2、§ 51.5.1 |
| 戰鬥天賦 / 常駐天賦的條件與動作規格 | `03-combat.md` | § 3.12、§ 3.13（＋緊急撤退）。天賦格取得見 `51-auto-talent.md` |
| 天賦配置（原腳本 Template，分頁切換） | `03-combat.md` | § 3.14 |
| 補給天賦（原村莊腳本：自動買賣／返回掛機點） | `49-village-script.md` | 全文 |
| **裝備篩選條件（販售保留／存入命中）／「本角色穿得起的」判定基準** | `49-village-script.md` | § 49.4 |
| **系統信箱／更新公告（發放與領取）** | `52-mailbox.md` | 全文 |
| **補償的版本範圍（單版／到某版之前／全版本）** | `52-mailbox.md` | § 52.2.4 |
| **補償寄送紀錄記在角色身上** | `52-mailbox.md` | § 52.2.4.2 |
| **新增補償前必須先問使用者範圍** | `52-mailbox.md` | § 52.2.4.3 |
| **防重複發放看角色身上的計數，不看信箱** | `52-mailbox.md` | § 52.2.3 |
| 怪物種族/體型/元素 | `25-monster-system.md` | 全文 |
| 怪物攻擊型別（近戰／遠程物理／遠程魔法） | `25-monster-system.md` | § 25.8「攻擊型別」 |
| 怪物 Debuff 能力 | `25-monster-system.md` | § 25.8（能力值）、§ 25.9（原則/規則） |
| **怪物詠唱（前搖攻擊）** | `25-monster-system.md` | § 25.11 |
| 元素系統（屬性/克制/傷害顏色） | `42-element-system.md` | 全文 |
| 投射物顏色（依元素、不分敵我） | `42-element-system.md` | § 42.4 |
| 怪物生成/Pressure 機制 | `26-spawn-pressure.md` | 全文 |
| 怪物素質表 | `28-monster-stats.md` | 全文 |
| 怪物經驗公式與結算倍率 | `28-monster-stats.md` | § 28.1 |
| **回鍋經驗加倍（離線存量）** | `04-character.md` | § 4.11 |
| 怪物掉落表 | `27-drop-table.md` | 全文 |
| 道具定義（藥水/卷軸/材料） | `30-items.md` | 全文 |
| 城鎮設施（雜貨店/鐵匠/旅館等） | `13-town.md` | § 13.3~13.10 |
| 回城卷軸/死亡機制 | `13-town.md` | § 13.8 |
| 新手 NPC（新手裝備/強化/領取限制） | `13-town.md` | § 13.11 |
| 副本系統/地圖結構 | `09-dungeon.md` | 全文 |
| **龍谷地間與遠古地監的產出分工（重疊等級帶）** | `09-dungeon.md` | § 9.10 |
| HP/MP 自然回復 | `29-regen.md` | 全文 |
| 陣營系統（暫不實作，見 `15-excluded.md` § 15.7） | `10-faction.md` | 全文 |
| 公會系統 | `11-guild.md` | 全文 |
| 寵物系統 | `12-pet.md` | 全文 |
| 成就/排行榜 | `14-endgame.md` | 全文 |
| 每日任務系統（冒險者工會） | `36-quest-system.md` | 全文 |
| **製作任務（鐵匠鋪「製作追蹤」）** | `36-quest-system.md` | § 36.13 |
| 任務追蹤視窗／進行中任務取消 | `36-quest-system.md` | § 36.10.3 |
| 角色統計數據（成就計數） | `37-statistics.md` | 全文 |
| 刪除角色 / 清除線上紀錄 | `37-statistics.md` § 37.4.9、`45-legacy-archive.md` § 45.4.1 | — |
| 地圖控制系統（俯瞰視角/移動/紅點生成/環境主題） | `38-map-control.md` | 全文，地形 catalog 見 § 38.4 |
| 地圖設計（主題地形配方/佈局原型/硬性約束） | `38-map-control.md` | § 38.11~§ 38.12 |
| 批量販售（依等級一鍵販售/裝備顏色等級） | `39-batch-sell.md` | 全文 |
| DPS 預測 / 職業輸出平衡健檢 | `44-dps-prediction.md` | 全文（結論見 § 44.7、§ 44.10） |
| **試驗場（木樁／DPS 量測）** | `50-training-ground.md` | 全文 |
| 木樁可調參數（防禦/血量/等級/體型/元素/數量） | `50-training-ground.md` | § 50.4.2 |
| 遺產系統（舊角色唯讀封存） | `45-legacy-archive.md` | 全文 |
| 帳號與多角色系統（角色選擇/登出/倉庫共用） | `19-account-character.md` | 全文 |
| 角色身分與密鑰（uuid / authToken） | `19-account-character.md` | § 19.4（API 見 `37-statistics.md` § 37.4.3） |
| 資料版本淘汰（CURRENT_DATA_VERSION） | `19-account-character.md` | § 19.9 |
| 資料結構設計 | `18-data-schema.md` | 全文 |
| 技術方向 | `16-tech.md` | 全文 |
| 前端架構（目錄/狀態/資料流/組件） | `16-tech-frontend-architecture.md` | 全文 |
| 線上化架構（tick/事件驅動/DB策略/scaling） | `98-online-architecture.md` | 全文 |
| （可能做法）野外離線模擬＋5 分鐘同步／組隊選項 | `98-online-architecture.md` | § 14~§ 15（未定案） |
| （可能做法）自架私服（單 process／各服註冊／本服排行） | `97-selfhosted-server.md` | 全文（未定案） |
| Pixi 渲染（分層／theme palette／RenderTexture） | `40-pixijs-migration.md` | 全文 |
| In-App Wiki 系統（架構／頁面清單／資料來源／路由） | `43-wiki-system.md` | 全文 |
| 城鎮面板 UI 規範 | `34-ui-guidelines.md` | 全文 |
| 技能面板顯示規則（格子全開/暗亮態/依職業裁切） | `34-ui-guidelines.md` | § 34.7（上限數值見 `05-skill.md` § 5.3） |
| 幀率與渲染解析度上限（桌機／手持）、每幀重繪通則 | `34-ui-guidelines.md` | § 34.9（`47-mobile.md` § 47.8 只留指標） |
| **線條粗細／描邊色／彩度倍率／分區色相／對比預算** | `34-ui-guidelines.md` | § 34.10（地圖色在 `pixi/mapThemes.ts`） |
| **數量徽章（配色／字級／自動天賦只顯示有無）** | `34-ui-guidelines.md` | § 34.10 |
| **面板按鈕分組與順序（PanelDock）** | `34-ui-guidelines.md` | § 34.10（由 `PanelDock.test.tsx` 把守） |
| 行動裝置適配（斷點/觸控互動/指標拖放/手機版面/PWA） | `47-mobile.md` | 全文（模組邊界見 `16-tech-frontend-architecture.md` § 32.17） |
| **特效（強化演出／印記師／戰鬥特效／CSS 與 Pixi 分工）** | `48-vfx.md` | 全文 |
| 裝備強化的成功／失敗演出 | `48-vfx.md` | § 48.4（機率與安定值見 `06-equipment.md` § 6.9~6.10） |
| **特殊強化卷軸（＋／－）** | `06-equipment.md` | § 6.12（圖示描邊見 `34-ui-guidelines.md` § 34.13） |
| **技能特效（原型／技能對應／AoE 一發／通用戰鬥特效）** | `48-vfx.md` | § 48.7（元素色見 `42-element-system.md` § 42.4） |
| **Buff／Debuff 場上特效（施加閃光／染色／頭頂標記／DoT 粒子）** | `48-vfx.md` | § 48.8（規則與 icon 見 `24-buff-debuff.md`） |

### 依限制查找

| 需要確認的限制 | 必讀文件 |
|---|---|
| 設計文件查不到的硬性規則 | `99-ai-constraints.md` § 99.1 |
| 背包系統限制（容量/負重/互動/顯示/禁止） | `35-inventory-constraints.md` |
| 暫不考慮的系統 | `15-excluded.md` |
| MVP 開發順序 | `17-mvp-priority.md` |
| 世界觀禁止方向 | `01-worldview.md` |

---

## 連動關係圖

實作時修改一個系統，必須檢查連動文件。

- `A ←→ B`、`A ↕ B`：雙向連動，改任一邊都要檢查另一邊
- `A → B`／`B ← A`：單向，改 A 要檢查 B，反向不成立
- `✕`：明確不連動

```
【裝備／詞綴／印記】
06-equipment.md ←→ 07-affix.md ←→ 08-quality.md ←→ 13-town.md（鐵匠鋪／印記師）
  § 6.9~6.10 ←→ 35-inventory-constraints.md § 35.5.5（強化入口在背包）
       ↕                    ↕
06-equipment-acquire.md ────┘（§ 6A.6 ←→ § 7.2；§ 6A.3 ←→ 18-data-schema.md § 18.8）
       ↕                     └→ 30-items.md（材料／卷軸）
       ↕
06-equipment-weapons.md / 06-equipment-armor.md ←→ 28-monster-stats.md
       ↕
06-equipment-requirement.md
       ↕
46-sigil.md
  ←→ 07-affix.md § 7.11
  ←→ 27-drop-table.md § 27.8 ←→ 30-items.md
  ←→ 13-town.md § 13.13 ←→ 43-wiki-system.md
  ←→ 35-inventory-constraints.md § 35.20

【數值校準（來源文件改動後必須重跑）】
06-equipment-requirement.md（TTK 校準）
  ← 04-character.md / 05-skill.md / 20-attributes.md / 21-combat-formula.md
  ← 07-affix.md / 22-basic-magic.md / 23-class-magic.md / 28-monster-stats.md
44-dps-prediction.md（驗算腳本）
  ← 04-character.md / 20-attributes.md / 21-combat-formula.md / 41-arpg-combat.md
  ← 06-equipment.md / 07-affix.md / 08-quality.md
  ← 22-basic-magic.md / 23-class-magic.md / 28-monster-stats.md

【戰鬥／技能／Buff】
03-combat.md ←→ 04-character.md ←→ 05-skill.md ←→ 20-attributes.md
       ↕                                    ↕
21-combat-formula.md                 22-basic-magic.md / 23-class-magic.md
       ↕                                                        ↕
24-buff-debuff.md § 24.4.1 ←→ 25-monster-system.md § 25.8~25.9
25-monster-system.md § 25.11 ←→ 48-vfx.md § 48.7a ←→ 51-auto-talent.md § 51.4.6
       ↕                                                        ↕
07-affix.md § 7.10 ←→ 30-items.md ←→ 13-town.md ←→ 27-drop-table.md
       ↕
16-tech-frontend-architecture.md（Icon 系統 / BuffBar / 浮動面板視窗 / Tooltip）

【怪物／元素／掉落】
25-monster-system.md ←→ 26-spawn-pressure.md ←→ 28-monster-stats.md
                ↕
42-element-system.md ←→ 05-skill.md / 22-basic-magic.md / 23-class-magic.md / 40-pixijs-migration.md
                                                        ↕
                                                  27-drop-table.md ←→ 30-items.md
                                                        ↕
                                                  06-equipment-acquire.md
28-monster-stats.md § 28.1 → 04-character.md § 4.9 ←→ 09-dungeon.md
26-spawn-pressure.md § 26.3（掉落倍率）→ 27-drop-table.md
04-character.md § 4.11（回鍋經驗加倍）
  ✕  26-spawn-pressure.md —— 經驗軸與 Pressure 刻意不相接，見 § 4.11 連動注意
  ←→ 18-data-schema.md § 18.11

【角色外觀】
04-character.md § 4.10
  ←→ 48-vfx.md § 48.6
  ←→ 19-account-character.md § 19.4 / § 19.9
  ←→ 18-data-schema.md § 18.7
  ←→ 40-pixijs-migration.md
  ←→ 45-legacy-archive.md § 45.2
  ←→ 13-town.md § 13.2.1

【帳號／資料／統計】
19-account-character.md ←→ 04-character.md（§ 4.10）／20-attributes.md § 20.10
       ↕
18-data-schema.md
       ↕      ←→ 13-town.md
       ↕      ←→ 35-inventory-constraints.md § 共用倉庫
       ↕      ←→ 16-tech-frontend-architecture.md
       ↕
37-statistics.md ←→ 45-legacy-archive.md

【背包／負重】
35-inventory-constraints.md ←→ 20-attributes.md
       ↕                              ↕
30-items.md                    06-equipment.md
       ↕                              ↕
13-town.md                     16-tech-frontend-architecture.md（BagPanel）
       ↕
34-ui-guidelines.md ←→ 18-data-schema.md

【UI／特效／行動裝置】
48-vfx.md
  ←  34-ui-guidelines.md § 34.9
  ←  06-equipment.md § 6.9~6.10
  ←  46-sigil.md
  ←  42-element-system.md § 42.4
  ←  22-basic-magic.md / 23-class-magic.md（§ 48.7.3）
  ←  24-buff-debuff.md § 24.4 / § 24.8
  ←→ 40-pixijs-migration.md（EffectLayer）
       ↕
16-tech-frontend-architecture.md § 32.15.1 / § 32.17
       ↕
47-mobile.md
  ←→ 34-ui-guidelines.md § 34.6 / § 34.9
  ←→ 35-inventory-constraints.md § 35.1.3 / § 35.5.3
  ←→ 24-buff-debuff.md § 24.8.3
       ↕
34-ui-guidelines.md § 34.10 ←→ § 34.1 / § 34.6 / § 34.8

【任務／販售／村莊】
36-quest-system.md ←→ 13-town.md ←→ 30-items.md
       ↕
27-drop-table.md / 28-monster-stats.md ←→ 09-dungeon.md
       ↕
36-quest-system.md § 36.13 ←→ 13-town.md § 13.5
       ↕                    ←  06-equipment-acquire.md § 6A.3
       ↕                    ←  18-data-schema.md § 18.8
       ↕
39-batch-sell.md ←→ 06-equipment-acquire.md ←→ 30-items.md ←→ 34-ui-guidelines.md
       ↕
49-village-script.md（`systems/shop.ts`）
  ←→ 03-combat.md § 3.14
  ←→ 34-ui-guidelines.md § 34.10
  ←→ 38-map-control.md
  ←→ 35-inventory-constraints.md
  ←→ 13-town.md § 13.8
  ←  06-equipment.md § 6A.8.8（§ 49.4 的素質判定）

【地圖】
38-map-control.md ←→ 03-combat.md / 41-arpg-combat.md
       ↕                    ↕
26-spawn-pressure.md   09-dungeon.md
       ↕                    ↕
40-pixijs-migration.md ←→ 16-tech-frontend-architecture.md

【自動天賦／信箱】
51-auto-talent.md
  ←→ 03-combat.md § 3.12~3.14
  ←→ 49-village-script.md
  ←→ 27-drop-table.md § 27.9（只有天賦格）
  ←→ 30-items.md § 天賦格
  ←→ 35-inventory-constraints.md § 35.21
  ←→ 18-data-schema.md § 18.9
  ←→ 13-town.md § 13.8
  ←→ 34-ui-guidelines.md
  ←→ 43-wiki-system.md
  ←→ 16-tech-frontend-architecture.md（scriptRunner / villageScriptRunner）
  ←→ 25-monster-system.md（§ 51.4.4）
  ←  04-character.md § 4.9
       ↕
52-mailbox.md
  ←→ 51-auto-talent.md § 51.3.3~51.3.4
  ←→ 35-inventory-constraints.md § 35.21
  ←→ 19-account-character.md § 19.9
  ←→ 34-ui-guidelines.md § 34.10
  ←→ 18-data-schema.md
  ←→ 30-items.md

【試驗場】
50-training-ground.md
  ←→ 13-town.md § 13.2.1 / § 13.3
  ←→ 38-map-control.md § 38.4
  ←→ 21-combat-formula.md
  ←→ 06-equipment.md § 6.11 ←→ 42-element-system.md
  ←→ 29-regen.md § 29.2
  ←→ 44-dps-prediction.md
  ✕  27-drop-table.md / 28-monster-stats.md / 37-statistics.md

【新手指引】
13-town.md § 13.11（STARTER_TIPS）
  ← 02-core-loop.md / 03-combat.md / 41-arpg-combat.md
  ← 13-town.md § 13.7~13.8 / § 13.9~13.10
  ← 30-items.md § 30.1~30.2
  ← 06-equipment.md § 6.1 / § 6.8~6.10
  ← 35-inventory-constraints.md § 35.2 / 20-attributes.md § 20.7
  ← 36-quest-system.md / 43-wiki-system.md
```
