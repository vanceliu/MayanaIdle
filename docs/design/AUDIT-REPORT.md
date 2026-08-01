# 設計文件 vs 實作 稽核報告

> 目的：逐階段比對 `docs/design/` 設計規格與 `client/src` 實作，找出「文件有但沒實作」「實作有但文件沒寫」「兩者數值衝突」的落差。
> 本報告**只回報，不修改任何實作或設計文件**。修補與否由使用者決定。

## 狀態標記

| 標記 | 意義 |
|---|---|
| ✅ | 文件與實作相符 |
| ❌ | 文件有定義，實作缺少 |
| 📄 | 實作已做，設計文件沒寫 |
| ⚡ | 文件與實作數值/邏輯衝突，或文件之間互相矛盾 |
| ⚠️ | 部分實作 |

## 階段進度

| 階段 | 範圍 | 文件 | 狀態 |
|---|---|---|---|
| 1 | 角色 Status / 屬性 | 04, 19, 20, 29 | ✅ 已完成，落差已修補 |
| 2-1 | 武器 | 06-weapons 系列 12 檔, 33 | ✅ 已完成，落差已修補 |
| 2-2 | 防具 / 詞綴 / 品質 | 06-armor, 06-acquire, 07, 08, 35 | ✅ 已完成，落差已修補 |
| 3 | 技能實作 | 05, 22, 23, 24, 42 | ✅ 已完成，落差已修補 |
| 4 | Quest | 36 | ✅ 已完成，落差已修補 |
| 5 | 怪物 / 掉落 / Spawn | 25, 26, 27, 28 | ✅ 已完成，落差已修補 |
| 6-1 | 戰鬥系統 | 03, 21, 41, 31 | ✅ 已完成，落差已修補 |
| 6-2 | 城鎮與周邊 | 13, 30, 39, 37, 43, 09 | ✅ 已完成，落差已修補 |

---

# 階段 1：角色 Status / 屬性

**比對文件**：`04-character.md`、`19-account-character.md`、`20-attributes.md`、`29-regen.md`
**比對實作**：`models/character.ts`、`systems/levelUp.ts`、`systems/regen.ts`、`stores/gameStore.ts`、`components/StatusPanel.tsx`、`components/CharacterCreate.tsx`、`components/AttributeUpModal.tsx`、`components/CharacterSelect.tsx`、`config.ts`

## 1.A 已確認相符（✅）

| 設計條目 | 文件 | 實作 |
|---|---|---|
| 五職業初始屬性表（6 屬 × 5 職全數比對） | 04.2 | `models/character.ts:45-51` |
| 職業總點數 80 | 04.2 | `CLASS_TOTAL_POINTS = 80` |
| 建角單項上限 18 | 04.2 | `components/CharacterCreate.tsx:36,89` |
| Lv51+ 屬性上限 35 | 04.2 / 20.9 | `ATTRIBUTE_CAP = 35` |
| Lv51+ 每級 +1 自由點 | 20.9 | `systems/levelUp.ts:36`（`level > 50`） |
| 屬性生效門檻：STR/VIT/SPI/INT 每 2、AGI 每 3 | 20.2 | `getEffectiveSTR/VIT/SPI/INT/AGI`，有測試 `models/__tests__/character.test.ts:111-140` |
| STR → 近戰攻擊 每 2 點 +1 | 20.3 | `systems/combat.ts:332,379,456` |
| AGI → 命中 每 3 點 +1 | 20.3 | `systems/combat.ts:359,436` |
| AGI → 迴避 每 3 點 +1 | 20.3 | `systems/combat.ts:666` |
| INT → 魔攻加成（每 2 點 +10%） | 20.6 | `systems/combat.ts:509`；文件範例 INT18/風刃10→19 可被公式重現 |
| 升級 HP 成長 `random(VIT-6, VIT-3)` | 20.4 | `systems/levelUp.ts:26` |
| 升級 MP 成長 `random(SPI-6, SPI-3)` | 20.5 | `systems/levelUp.ts:31` |
| 回血間隔 5 秒 / 回魔間隔 6 秒 | 29.1 / 29.2 | `HP_REGEN_INTERVAL_MS=5000`、`MP_REGEN_INTERVAL_MS=6000` |
| 回復量 `floor(有效值 / 2)`、戰鬥中減半、保底 1 | 29.1 / 29.2 | `systems/regen.ts:9-14,20-25` |
| 負重上限 `(有效STR + 有效VIT) × 100 + 裝備加成` | 20.7 | `components/StatusPanel.tsx:39-43` |
| 五條腰帶負重值 1000/2000/3000/4000/5000 | 20.7 | `db/seed/equipmentSeeds.ts:91-95`（皮/鐵扣/戰士/龍皮/力之，數值全對） |
| 背包固定 100 格 | 20.7 / 35.1 | `BAG_MAX_SLOTS = 100` |
| 帳號最多 4 個角色 | 19.2 | `components/CharacterSelect.tsx:4` |
| `dataVersion = 2` | 19.9 | `config.ts:2` |
| 個人倉庫 / 共用倉庫雙層 + 共用倉庫金幣 | 19.7 | `gameStore.ts:364-422,1591`、`components/town/Storage.tsx:171-195` |
| 建角初始配置：職業武器 + 皮甲 + 紅色藥水×10 + 100G + 風刃（元素師/牧師） | 04.3 | `gameStore.ts:500-584` |

## 1.B 落差清單

### P1-01 ⚡ 超重懲罰：四份文件互相矛盾，實作只做視覺提示

| 來源 | 說法 |
|---|---|
| `20-attributes.md:154-161` | 超重時：無法回血、無法回魔、無法攻擊，只能移動 |
| `29-regen.md:7,36,65` | 觸發條件「角色未超重」；超重時 HP/MP 回復停止 |
| `34-ui-guidelines.md:138` | 「超重：紅色漸層，表示角色不可攻擊/回復」 |
| `35-inventory-constraints.md:22-31` | 「負重懲罰暫不實作，僅視覺提示，無遊戲懲罰」 |

**實作現況**：`gameStore.ts:644-668` 的 regen interval 完全沒有負重檢查；攻擊路徑也沒有。負重只在 `StatusPanel.tsx:74` 算出 `isOverweight` 用來換 CSS class。→ 與 `35.2` 一致，與其餘三份文件牴觸。

**建議**：以 35.2 為準（已明確標註暫停用），在 20.7、29.1、29.2、29.3、34 各處加註「暫停用，見 35-inventory-constraints.md § 35.2」。

---

### P1-02 📄 升級經驗曲線公式完全沒有文件

`systems/levelUp.ts:11-13`：

```ts
export function getExpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}
```

搜遍 `docs/design/` 只有敘述性描述，沒有公式：
- `09-dungeon.md:43`「經驗曲線設計使大多數玩家自然停留在 50~60 附近」
- `28-monster-stats.md:423`「經驗值隨等級指數成長，配合升級經驗曲線」
- `99-ai-constraints.md:26` 同上

**問題**：這是核心數值，`28-monster-stats.md` 全表的怪物經驗值都建立在它之上，但它不在任何文件裡。改動這條公式會讓整份 28 失效，卻沒有連動關係可查。

**建議**：補進 `04-character.md`（新增「§ 4.9 等級與經驗」）或 `20-attributes.md`，並在 `INDEX.md` 連動關係圖加上 28 ↔ 經驗曲線。

---

### P1-03 📄 初始 HP / MP 沒有文件定義，且實作有重複來源

- `gameStore.ts:513-516`：建角寫死 `hp: 30, maxHp: 30, mp: 10, maxMp: 10`
- `systems/levelUp.ts:8-9`：另有 `INITIAL_HP = 30` / `INITIAL_MP = 10` 常數，**但 `createCharacter` 沒有引用它**（dead constant，兩處各自寫死）
- `04-character.md § 4.3`「角色建立初始配置」只列武器、防具、技能、物資，沒有 HP/MP

**建議**：文件補上 Lv.1 初始 HP 30 / MP 10；實作面 `createCharacter` 應改用 `INITIAL_HP` / `INITIAL_MP` 常數避免兩處漂移。

---

### P1-04 ⚡ 屬性全滿後仍持續發放配點

`20-attributes.md:189`：「全部六項屬性皆達 35 後，升級不再獲得配點」

`systems/levelUp.ts:36-38` 無條件發放：

```ts
if (updated.level > LEVELUP_ATTRIBUTE_START_LEVEL) {
  updated.unspentAttributePoints = (updated.unspentAttributePoints ?? 0) + 1;
}
```

`AttributeUpModal.tsx:23` 雖有 `allCapped` 判斷，但只影響按鈕顯示，不影響發放。

**影響**：六屬全滿（總計 210 點）的角色每升一級仍累積永遠無法花用的點數，且 `unspentAttributePoints > 0` 會持續觸發配點視窗自動彈出（20.9 規則），變成無法關掉的干擾。

---

### P1-05 📄 回復量含裝備 hpRegen / mpRegen 加成，文件沒寫

`systems/regen.ts:10-14`：

```ts
const equipBonus = gear.reduce((sum, g) => sum + (g?.hpRegen ?? 0), 0);
const total = base + equipBonus;
if (inCombat) return Math.max(1, Math.floor(total / 2));
```

`29-regen.md` 的公式只有 `floor(有效VIT / 2)`，完全沒提裝備加成。而且實作是**先加裝備再整體減半**，等於裝備回復在戰鬥中也砍半 — 這個設計決策沒有文件依據。

**建議**：29 補上裝備加成項與「戰鬥減半作用於含裝備的總量」。

---

### P1-06 📄 buff 會即時改變回復量，文件沒寫

`regen.ts:7,18` 用 `getTotalAttributes(char, activeEffects)`，因此 VIT/SPI 類 buff 會即時提高回血/回魔量。`29-regen.md` 未提及 buff 的影響。

---

### P1-07 📄 升級時 HP/MP 全滿，文件沒寫

`systems/levelUp.ts:28,33`：`updated.hp = updated.maxHp`、`updated.mp = updated.maxMp`。20.4 / 20.5 / 29 皆未記載升級回滿。這在戰鬥續戰力上是有意義的機制，值得入文件。

---

### P1-08 📄 低屬性保底 clamp，文件沒寫

`systems/levelUp.ts:26,31`：

```ts
randomInt(Math.max(1, attrs.VIT - 6), Math.max(2, attrs.VIT - 3))
```

文件公式 `random(VIT-6, VIT-3)` 在 VIT ≤ 6 時會產生 0 或負值（牧師初始 STR 6、元素師 STR 8 表示低屬性是可能的；VIT 最低為元素師/牧師的 10，所以目前未觸發，但配點自由度下仍是邊界）。20.4 表格只列到 VIT 10，未定義 VIT < 10 的行為。

---

### P1-09 ⚡ 20.3 與 20.7 的負重公式互相不一致

- `20-attributes.md:30`（STR 表）與 `:45`（VIT 表）：「負重 每 1 點 +100」→ 逐點生效
- `20-attributes.md:129-131`（20.7）：「負重上限 = (**有效**力量 + **有效**體質) × 100」→ 每 2 點門檻

兩者對奇數屬性給出不同答案（STR 11：20.3 → 1100，20.7 → 1000）。實作 `StatusPanel.tsx:64-72` 採 20.7（有效值）。

**建議**：20.3 表格改為「每 2 點 +200（依有效力量）」或直接註記「見 § 20.7」。

---

### P1-10 ❌ SPI → 魔法抗性 未實作

`20-attributes.md:53`：「魔法抗性 每 2 點 +1」

全 codebase 搜不到 `magicResist` / 魔抗相關計算。根因是怪物攻擊型別只有 `melee | ranged`（`models/monster.ts:6`），沒有魔法攻擊，因此魔抗沒有作用點。

**需要決定**：(a) 補怪物魔法攻擊 + 魔抗減傷（牽動 25/28/21），或 (b) 在 20.3 標註「待怪物魔法攻擊實作後啟用」。

---

### P1-11 ❌ CHA → 寵物攜帶數量 未實作

`20-attributes.md:65`：「寵物攜帶數量：各職業不同（**待定**）」。寵物系統 `12-pet.md` 僅 43 行，屬 MVP 後期。CHA 目前在實作中**完全沒有任何作用**（只有建角配點與顯示）。文件本身標「待定」，此處僅記錄不視為缺失。

---

### P1-12 📄 20.4 / 20.5 的 HP/MP 成長不套用「有效屬性」規則，文件未明說

20.2 訂下通則「屬性依倍數門檻生效」，但 20.4 表格列出 VIT 11 → 5~8、13 → 7~10（奇數逐點生效），代表 HP/MP 成長是**通則的例外**。實作 `levelUp.ts:26,31` 用 `attrs.VIT` 原始值 ✅ 與表格一致。

**建議**：20.2 或 20.4 明寫「升級 HP/MP 成長使用原始屬性值，不套用 § 20.2 門檻規則」，否則後續實作者容易誤改成 `getEffectiveVIT`。

## 1.C 階段 1 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 21 項 | 見 1.A |
| ❌ 未實作 | 2 | P1-10、P1-11 |
| 📄 文件缺漏 | 7 | P1-02、P1-03、P1-05、P1-06、P1-07、P1-08、P1-12 |
| ⚡ 衝突 | 3 | P1-01、P1-04、P1-09 |

## 1.D 階段 1 處理結果

| 編號 | 處理 | 改動 |
|---|---|---|
| P1-01 | ✅ 已修補（文件） | `20-attributes.md` § 20.7、`29-regen.md` § 29.1/29.2/29.3、`34-ui-guidelines.md` 加註「暫停用，見 35.2」；`99-ai-constraints.md` 第 58 條「已實作」→「未實作」（原文自相矛盾） |
| P1-02 | ✅ 已修補（文件） | `04-character.md` 新增 § 4.9 等級與經驗曲線（含 8 點對照表與「改動須重算 28」警語）；`INDEX.md` 連動關係圖新增 4.9 ↔ 28 |
| P1-03 | ✅ 已修補（程式＋文件） | `gameStore.ts` 改用 `INITIAL_HP`/`INITIAL_MP` 常數；`04-character.md` § 4.3 補初始 HP 30 / MP 10 |
| P1-04 | ✅ 已修補（程式） | `levelUp.ts` 新增 `isAllAttributesCapped`，六屬全達 35 時停止發放；已累積點數保留不清零；補 4 項測試 |
| P1-05 | ✅ 已修補（文件） | `29-regen.md` 補裝備 `hpRegen`/`mpRegen` 加成，明訂戰鬥減半作用於含裝備總量 |
| P1-06 | ✅ 已修補（文件） | `29-regen.md` 補 buff 影響有效 VIT/SPI |
| P1-07 | ✅ 已修補（文件） | `20-attributes.md` § 20.4/20.5 補「升級時 HP/MP 全滿」 |
| P1-08 | ✅ 已修補（文件） | `20-attributes.md` § 20.4/20.5 補下限保底 clamp |
| P1-09 | ✅ 已修補（文件） | `20-attributes.md` § 20.3 STR/VIT 負重欄改為「有效值 × 100」，對齊 § 20.7 |
| P1-10 | ⏸ 標註待實作（使用者決定） | `20-attributes.md` § 20.3 魔法抗性標「待實作」，附未來啟用需同步的三份文件 |
| P1-11 | ⏸ 維持現狀（使用者決定） | 寵物系統本身標「待定」，CHA 暫無作用 |

**驗證**：`npm run test` 88 檔 1065 項全綠；`npx tsc --noEmit` 無錯誤。

---

# 階段 2-1：武器

**比對文件**：`06-equipment-weapons.md` + 12 個武器分檔、`33-class-weapon-cp.md`
**比對實作**：`client/src/db/seed/equipmentSeeds.ts`（146 筆非防具模板）、`models/equipment.ts`、`systems/combat.ts`

比對方式：以腳本解析 12 份武器文件的 133 列表格，逐欄（材質／重量／小怪傷害／大怪傷害／攻擊成功／額外攻擊／回血／回魔／加血／加魔／額外屬性／安定值／壞刀／可用職業／雙手判定）對照 seed。

## 2-1.A 已確認相符（✅）

| 設計條目 | 結果 |
|---|---|
| 武器總數 | 文件 133 把，seed 全數存在，**無任何遺漏** |
| 完全相符 | **69 / 133 把**逐欄全對 |
| `isTwoHanded` | 弓／雙刀／鋼爪／雙手劍／雙手斧／雙手法杖 全部正確為 `true`，單手類全部 `false` |
| 新手裝備 7 件 | 新手劍/匕首/弓/法杖/鐵鎚/盾/魔導書 與 `13-town.md` § 新手裝備數值 完全一致 |
| `extraAttack` 語意 | combat.ts:337/385/459 為**加算固定值**，符合 `99-ai-constraints.md` 第 60 條 |
| 魔導書 6 本 | 不在武器文件範圍，定義於 `06-equipment-armor.md`（副手/防具），留待階段 2-2 |

## 2-1.B 落差清單

### P2-01 ⚡ 武器 nerf 只改了文件，實作從未套用 —— 45 把武器

**根因已定位**：commit `44c8f34`「武器製作更新方式, 武器nerf」（2026-06-30）修改了 11 個武器文件、`06-equipment-acquire.md`、`06-equipment.md`，
但同一 commit 對 `client/src/db/seed.ts` 的改動**只有製作配方（`craftPrerequisiteWeapon`）**，沒有任何一筆傷害調整。

**驗證方法**：取 `44c8f34^`（nerf 前）的武器文件與現行 seed 比對 —— 這 45 把**完全吻合 nerf 前的數值**，證明 seed 停留在 nerf 前。

| 武器類型 | 受影響 / 總數 |
|---|---|
| 雙手斧 | **10 / 10（全數）** |
| 雙手劍 | 8 / 11 |
| 弓 | 9 / 17 |
| 雙手法杖 | 4 / 8 |
| 單手劍 | 4 / 25 |
| 匕首 | 3 / 12 |
| 單手鈍器 | 3 / 8 |
| 法杖 | 2 / 14 |
| 單手斧 | 2 / 8 |

代表性落差（文件 → seed 實際值）：

| 武器 | 小怪傷害 | 大怪傷害 | 額外攻擊 |
|---|---|---|---|
| 王者之劍 | 24 → **28** | 22 → **26** | 5 → **6** |
| 毀滅巨斧 | 18 → **22** | 25 → **30** | 5 → **6** |
| 龍牙巨劍 | 22 → **25** | 20 → **23** | — |
| 精靈王長弓 | 19 → **22** | 17 → **20** | 6 → **7** |
| 大法師長杖 | 21 → **25** | 21 → **25** | 5 → **6** |
| 鋼鐵巨劍 | 15 → **17** | 13 → **15** | — |
| 死亡宣告 | 10 → **12** | 8 → **9** | 8 → **9** |

**影響**：後期武器實際比設計強 15~20%，雙手斧整條線全部超標。這會直接影響 `28-monster-stats.md` 的怪物強度平衡與 `33` 的 CP 分析。

**需要你決定**：(a) 把 nerf 套用到 seed（45 筆，改動大但有明確依據）；(b) 承認實作為準，把 12 份文件改回 nerf 前的值（等於撤銷 nerf）。**這是設計意圖問題，我不自行決定。**

---

### P2-02 ⚡ 另有 21 項與 nerf 前／後文件皆不符（更早的獨立漂移）

這批不是 nerf 造成的 —— 與 `44c8f34^` 的舊文件也對不上，來源不明。

**單手劍（11 把）**

| 武器 | 落差 |
|---|---|
| 精鋼劍 | 小 8→11、大 6→8 |
| 寒冰之劍 | 小 8→11、大 10→12、多了 bonusHp 10 |
| 銀騎士之劍 | 小 9→11、大 8→10、職業限制 騎士/妖精/盜賊 → **無限制（全職業）** |
| 暗影彎刀 | 小 9→11、大 7→9、多了「敏捷+1」 |
| 風精靈之刃 | 小 8→11、大 7→10 |
| 祝福騎士劍 | 小 10→11、大 9→10 |
| 魔族殺手 | 小 10→11、大 9→10、多了「力量+1」 |
| 碎星之劍 | 小 10→11、大 9→10 |
| 秘銀之劍 | 多了 bonusHp 10 |
| 聖銀之劍 | hpRegen 2→3、bonusHp 10→**25**、壞刀 是→**否** |
| 血契之劍 | 多了 bonusHp 20、多了「力量+1」 |

**其他**

| 武器 | 落差 |
|---|---|
| 王國巨劍 | 小 14→18、大 12→16、bonusHp 15→20、多了「力量+1」 |
| 黑暗短刃 | 小 6→7、多了「敏捷+1」、職業限制 盜賊/妖精 → **僅盜賊** |
| 白羽長弓 | 小 9→10 |
| 聖堂戰鎚 | 安定值 6→**0** |
| 象牙塔法杖 | 重量 16→14 |
| 木盾 / 鐵盾 / 騎士盾 | seed **缺 `material` 欄位**（文件為木/鐵/鐵）、安定值 6→**4** |

盾牌的 `material` 缺漏值得注意：`99-ai-constraints.md` 第 33 條「武器材質決定種族克制」，
三面商店盾缺材質欄，而製作盾（龍鱗盾/精鋼塔盾/守護者之盾）都有。屬資料不一致，是否影響玩法需看盾牌是否參與種族克制判定。

---

### P2-03 ⚡ `33-class-weapon-cp.md` 的三條分析前提全部過時

文件開頭「分析前提」（§ 第 10~12 行）：

| 前提 | 33 的說法 | 實作 | 其他文件 |
|---|---|---|---|
| 遠程攻擊力 | 武器基傷 + **AGI/3** | `combat.ts:332,379` 用 **STR/2** | `21-combat-formula.md:70` 也是 **STR加成** |
| 怪物防禦減傷上限 | **65%** | `combat.ts:409,483,528` 為 **75** | `21-combat-formula.md:143` 也是 **75%** |
| 攻擊間隔 | **800ms** | `BASE_ATTACK_INTERVAL_MS = 1200` | `41-arpg-combat.md:18` 也是 **1200ms** |

**33 是唯一持不同說法的文件，三條都錯。**

此外，33 全文引用的武器傷害數字都是 **nerf 前**的值（王者之劍 28、鋼鐵巨劍 17、騎士大劍 20、屠魔巨劍 23、精靈王長弓 22、天啟法杖 22、象牙塔長杖 14、奧術權杖 14、死亡宣告 12），
`44c8f34` 沒有更新這份文件。整份 CP 排名與「值得程度」評級都建立在過時數據上。

> 註：33 引用的數字剛好等於現行 seed 值 —— 因為兩者都停在 nerf 前。這**不代表 33 與實作一致**，只代表兩者一起過時。

---

### P2-04 ⚡ `33-class-weapon-cp.md` 對「額外攻擊」的定義違反第 60 條限制

`33-class-weapon-cp.md:189`：

> 匕首的「額外攻擊」欄位是盜賊的核心 —— **代表追加攻擊次數，DPS 倍增**

`99-ai-constraints.md` 第 60 條：

> 武器的「額外攻擊」(extraAttack) 是**加算至武器基傷的固定數值，不是多段攻擊次數**。本遊戲無多段攻擊機制。

實作 `combat.ts:337/385/459` 為加算固定值 ✅ 符合第 60 條，**33 是錯的**。

連帶錯誤：33 的盜賊段落「額外攻擊 +2 意味著每次攻擊打 3 下」「死亡宣告傷害 12 + 額外攻擊 3 = 每回合 4 下 × 12」、
雙持段落「血影之刺 × 2 = 6+6 = 12」，整套盜賊 CP 推論都建立在錯誤前提上。

## 2-1.C 階段 2-1 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 69 / 133 把武器逐欄全對，另新手裝備 7 件全對 | 見 2-1.A |
| ⚡ 衝突 | 4 類（涉及 66 把武器 + 整份 33） | P2-01（45 把）、P2-02（21 項）、P2-03、P2-04 |

**處理順序建議**：P2-01 需先決定設計意圖（套用 nerf vs 撤銷 nerf），P2-02 隨之一併處理；
P2-03 / P2-04 是文件內部錯誤，可獨立先修（改 33 的前提與額外攻擊敘述），但 33 的 CP 排名要等 P2-01 定案後才能重算。

## 2-1.D 階段 2-1 處理結果

**使用者決策**：P2-01 **以實作為準，撤銷文件的 nerf**；P2-03 / P2-04 **直接刪除 `33-class-weapon-cp.md`**。

| 編號 | 處理 | 改動 |
|---|---|---|
| P2-01 | ✅ 已修補（文件） | 12 份武器文件 133 列全部依 seed 回寫，等同撤銷 `44c8f34` 對文件的 nerf。保留「#」與「備註」欄，依各檔排序依據重排 |
| P2-02 | ✅ 已修補（文件＋程式） | 同上一併回寫；另 `equipmentSeeds.ts` 補上木盾／鐵盾／騎士盾缺漏的 `material`（文件本有值、seed 漏填） |
| P2-03 | ✅ 已處理 | 刪除 `33-class-weapon-cp.md`；`INDEX.md` 移除 2 處引用，連動圖改指向 `28-monster-stats.md` |
| P2-04 | ✅ 已處理 | 隨 33 刪除一併消失。第 60 條「額外攻擊為加算固定值」維持，實作本來就正確 |
| 追加 | ✅ 已修補（文件） | `06-equipment-acquire.md` 雙刀 5 列 + 鋼爪 5 列的小怪傷害與傷害差偏高，改為 seed 值（死神之爪 20→17、月神之爪 18→15 等）。製作金幣欄本來就與 seed 一致，未動 |

**驗證**：133 把武器逐欄與 seed 完全一致；`npm run test` 88 檔 1065 項全綠；`npx tsc --noEmit` 無錯誤。

### 修補後仍待你確認的兩項資料（非數值平衡，屬可疑資料）

這兩項照「以實作為準」寫進文件了，但看起來比較像漏填而非設計決定：

| 項目 | 現況 | 疑慮 |
|---|---|---|
| 銀騎士之劍 | seed **無 `requiredClass`** → 文件已改為「全職業」 | 原文件為騎士／妖精／盜賊。同階同類的劍都有職業限制，只有這把全開放 |
| 黑暗短刃 | seed `requiredClass: ['thief']` → 文件已改為「盜賊」 | 原文件為盜賊／妖精。妖精被移除是否有意？ |

---

# 階段 2-2：防具 / 詞綴 / 品質

**比對文件**：`06-equipment-armor.md`、`06-equipment-acquire.md`（防具區塊）、`06-equipment.md` § 6.8~6.11、`07-affix.md`、`08-quality.md`、`35-inventory-constraints.md`
**比對實作**：`db/seed/equipmentSeeds.ts`、`models/affix.ts`、`components/town/TownBlacksmith.tsx`、`systems/combat.ts`、`components/CharacterStats.tsx`、`stores/gameStore.ts`

## 2-2.A 已確認相符（✅）

| 設計條目 | 文件 | 結果 |
|---|---|---|
| 防具/飾品/魔導書 75 件 | 06-armor | seed 全數存在，**無遺漏**；**防禦力全部相符** |
| 取得表 75 列（防禦力/增加負重/魔攻/商店價格/製作金幣） | 06-acquire § 6A.5 | **0 不符** |
| 15 種詞綴（武器 7 / 防具 7 / 盾牌專屬 1） | 07 § 7.4~7.6 | `AFFIX_DEFINITIONS` 完全一致，category 分派正確 |
| T1~T7 數值區間 | 07 § 7.3 | `AFFIX_TIERS` 七段全對（5-7 / 8-10 / 11-12 / 13-15 / 16-18 / 19-20 / 21-23） |
| 一般怪物 Tier 權重 6 段 | 07 § 7.7 | `getTierWeights` 42 個數字全對 |
| Boss Tier 權重 5 段 | 07 § 7.7 | `getBossTierWeights` 35 個數字全對 |
| 特殊詞綴 6 種 + 最低區域等級 31/41 | 07 § 7.10.1 | `SPECIAL_AFFIX_DEFINITIONS` 全對 |
| 特殊詞綴機率 3% / 5% / 8%，Boss ×2 | 07 § 7.10.3 | `getSpecialAffixChance` 全對 |
| 特殊詞綴取代一般詞綴位置、不重複、無 Tier（tier=0） | 07 § 7.10.2 | `generateAffixes:171-176` |
| 特殊詞綴不參與數值加總、多件不疊加 | 07 § 7.10.4 | `collectAffixBonuses:234`、`collectSpecialAffixTypes` |
| 同件裝備不可重複同種詞綴 | 07 § 7.6 | `generateAffixes` 用 splice 從池中移除 |
| 品質預設 0%、上限 20%、每次 +1%、必定成功 | 08 § 8.2~8.4 | `QUALITY_MAX = 20`，`newQuality = quality + 1`，無失敗分支 |
| 品質提升成本：品質石 ×1 + 50,000G | 08 § 8.3 | `QUALITY_COST = 50000`、`consumeBagItem('品質石')` |
| 品質只影響詞綴數值 | 08 § 8.5 | `getEffectiveAffixValue = floor(value × (1 + quality/100))` |
| 詞綴強化上限 T5、特殊詞綴不可強化 | 07 § 7.2 / § 7.10.2 | `TownBlacksmith.tsx:224-225` |
| 防具強化：每 +1 → 防禦 +1 | 06 § 6.10 | `combat.ts:211` |
| 武器強化：每 +2 → 攻擊成功 +1 | 06 § 6.9 | `getWeaponAttackSuccess:316` |
| 防具強化成功率（安定值 4 / 6） | 06 § 6.10 | `1/(targetLevel-1)` 在安定值 4、6 下與表格一致 |
| 武器強化失敗 → 武器消失 | 06 § 6.9 | `db.equipmentInstances.delete` |
| 藥水冷卻 600 / 900 / 1500 ms | 35 § 35.10 | `POTION_CONFIG` 全對 |
| 雙手武器佔用另一手、副手已有裝備時阻止 | 06 § 6.2~6.5 | `gameStore.ts:698-711` |

## 2-2.B 落差清單

### P3-01 ❌ 武器強化**不增加基傷** —— 強化系統的首要效果沒有實作

`06-equipment.md` § 6.9 強化效果表第一列：

| 效果 | 換算 |
|---|---|
| **武器基傷** | **每 +1 強化 → smallMonsterDamage +1、largeMonsterDamage +1** |

`systems/combat.ts:201-205`：

```ts
function getWeaponDamage(gear: EquipmentInstance | null, monsterSize: 'small' | 'large'): number {
  if (!gear) return 1;
  if (monsterSize === 'small') return gear.smallMonsterDamage ?? 1;
  return gear.largeMonsterDamage ?? 1;   // ← 沒有加 enhancement
}
```

傷害公式 `combat.ts:337`（基礎物理）與 `:385`（普攻）也都沒有把 `enhancement` 加進去。
全 codebase 搜 `enhancement`，戰鬥相關只有兩處：`getTotalDefense:211`（防具，有做）與 `getWeaponAttackSuccess:316`（攻擊成功，有做）。

**影響**：武器強化卷軸（雜貨店 100,000G / Boss 10% 掉落）花下去只換到命中率，傷害零提升。
`+6 匕首` 依文件應該 small/large 各 +6，實際只有攻擊成功 +3。這是強化系統最核心的一條效果。

對照：防具強化的「每 +1 → 防禦 +1」**有**實作，所以不是整套沒接，是武器這條漏了。

---

### P3-02 ⚡ 詳細狀態面板**有**加強化基傷，實際戰鬥沒有 —— 面板數字騙人

`components/CharacterStats.tsx:66-71`：

```ts
const applyAtk = (base: number) => Math.max(1, Math.floor(
  Math.floor((base + weaponEnhance + weaponExtraAttack + flatAttackBuff + strBonus) * (1 + attackPower / 100))
  * (100 + weakenPercent) / 100
));
```

面板把 `weaponEnhance` 算進攻擊力，`systems/combat.ts` 沒有。玩家看到的「物理攻擊」比實際輸出高出強化等級的量，
而且會讓 P3-01 看起來像已經實作。兩者必須擇一對齊。

---

### P3-03 ⚡ 安定值 0 的防具強化 +1~+4 成功率錯誤（部分變成必定成功）

`TownBlacksmith.tsx:40-43`：

```ts
function getArmorEnhanceRate(targetLevel: number, stability: number): number {
  if (targetLevel <= stability) return 1.0;
  return 1 / (targetLevel - 1);
}
```

`06-equipment.md` § 6.10 表格 vs 實際：

| 目標等級 | 文件（安定值 0） | 實作 | 結果 |
|---|---|---|---|
| +1 | 1/2 (50%) | `1/(1-1)` = **Infinity** | **必定成功** ❌ |
| +2 | 1/2 (50%) | `1/1` = **1.0** | **必定成功** ❌ |
| +3 | 1/2 (50%) | 1/2 | ✅ |
| +4 | 1/2 (50%) | 1/3 (33%) | 比文件**難** ❌ |
| +5 以上 | 1/4、1/5、1/6… | 一致 | ✅ |

安定值 4 與 6 的欄位全部正確，只有安定值 0 這一欄錯。

**受影響**：seed 中安定值 0 的防具/盾/魔導書共 **11 件**，全是高階裝備（龍骨頭盔、暗影兜帽、龍鱗鎧甲、
暗殺者皮甲、大賢者之冠、神官祭冠、大魔導師長袍、大神官法衣、龍皮戰靴、米索利護手、守護者之盾）。
設計上它們是「高風險高報酬」，實際上前兩級白送、第三級才開始有風險 —— 風險定位整個反過來。

---

### P3-04 ❌ 魔導書的魔法攻擊（`magicAttack`）完全不參與戰鬥計算

`magicAttack` 在全專案只出現在三處：`models/equipment.ts` 型別、`templateSync.ts` 欄位同步清單、
`components/EquipmentInfo.tsx` 顯示。**`systems/` 下零引用**，`calculateSkillDamage` 也沒有讀它。

6 本魔導書（魔攻 +2 ~ +8，售價 15,000 ~ 500,000G）目前是純裝飾品。

連帶問題：`06-equipment.md` § 6.9「魔法攻擊（**僅魔杖系列**）每 +2 強化 → 魔法攻擊 +1」也無從生效。
而且 seed 裡**法杖完全沒有 `magicAttack` 欄位**，只有魔導書有 —— 文件說「僅魔杖系列」，資料卻只給魔導書，兩邊對不上。

---

### P3-05 ⚡ `06-equipment-armor.md` 有 23 件與 seed 不符（防禦力以外的欄位）

與武器同樣的模式：`06-equipment-acquire.md`（只涵蓋防禦力/價格/金幣）**完全同步**，
而 `06-equipment-armor.md` 獨有的欄位（重量/回血/回魔/額外屬性/安定值/材質/職業）大量漂移。

**額外屬性在 seed 完全缺漏（5 件）**

| 裝備 | 文件 | seed |
|---|---|---|
| 賢者之冠 | 智力+1 | 無 |
| 暗影兜帽 | 敏捷+2 | 無 |
| 精靈之靴 | 敏捷+1 | 無 |
| 古代魔導書 | 智力+1 | 無 |
| 神諭之書 | 精神+1 | 無 |

**回血量在 seed 完全缺漏（7 件）**：龍骨頭盔 +1、銀騎士甲 +1、龍鱗鎧甲 +2、米索利板甲 +1、龍皮手套 +1、米索利護手 +1、龍皮戰靴 +1

**魔導書 4 本的回魔量／增加魔量全部缺漏**

| 魔導書 | 文件 | seed |
|---|---|---|
| 精靈魔導書 | 回魔+2、MP+10 | 0 / 0 |
| 聖典 | 回魔+2、MP+10 | 0 / 0 |
| 古代魔導書 | 回魔+3、MP+15 | 0 / 0 |
| 神諭之書 | 回魔+3、MP+15 | 0 / 0 |

**職業限制不符**

| 裝備 | 文件 | seed |
|---|---|---|
| 精靈魔導書 / 古代魔導書 | 元素師專屬 | 元素師 + 牧師 |
| 聖典 / 神諭之書 | 牧師專屬 | 元素師 + 牧師 |
| 精神戒指 | 元素師、牧師 | **無限制（全職業）** |

**安定值不符**：精靈髮冠／精靈戰甲／精靈之靴 文件 6 → seed 4；暗影兜帽 文件 0 → seed 4；神諭之書 文件 0 → seed 6

**材質不符**：學徒魔導書／魔力魔導書 seed 無材質；古代魔導書 文件鐵 → seed 奧里哈魯根；神諭之書 文件銀 → seed 米索利

**重量不符（11 件）**：精靈髮冠 12→15、賢者之冠 10→12、龍骨頭盔 60→50、銀騎士甲 80→70、精靈戰甲 30→40、
大法師長袍 15→18、聖光法衣 15→18、暗殺者皮甲 25→30、米索利板甲 70→80、精靈之靴 12→15、龍心項鍊 10→8、
精靈魔導書 10→12、神諭之書 15→14

---

### P3-06 📄 安定值 0 / -1 武器的強化成功率無文件

`06-equipment.md` § 6.9 只寫「安定值 = 6（武器預設）／+7 以上 1/3」，沒有定義安定值 0 的武器。
但 seed 裡安定值 0 的武器有 20+ 把（王者之劍、死亡宣告、屠龍者、毀滅巨斧…）。

實作 `getWeaponEnhanceRate`：安定值 0 的武器從 +1 起就是 1/3 成功、2/3 消失。這個行為沒有文件依據。
§ 6.10 那張含「安定值 0」欄的表格是**防具**強化用的，不適用武器（武器是固定 1/3，防具是 1/(n-1)）。

---

### P3-07 📄 鐵匠鋪製作出來的裝備帶什麼詞綴，無文件

`TownBlacksmith.tsx:55-67 generateCraftAffixes`：固定生成 **4 個詞綴**，Tier 在 **1~5 均等隨機**（各 20%）。

`06-equipment-acquire.md` 只定義製作金幣與素材，完全沒提製作品的詞綴。
`07-affix.md` § 7.7 的 Tier 權重表只涵蓋「掉落」，製作走的是另一套均等分佈 —— 兩者差異沒有文件記載。

---

### P3-08 ⚡ 詳細狀態面板的有效敏捷用「每 2 點」而非「每 3 點」

`CharacterStats.tsx:22`：

```ts
const effectiveAGI = Math.floor(attrs.AGI / 2) * 2;   // 應為 / 3 * 3
```

`20-attributes.md` § 20.2 明訂敏捷每 3 點生效，`models/character.ts` 的 `getEffectiveAGI` 也是 `/3*3`，
但這個面板自己算了一份。AGI 15 時：正確有效值 15 → 命中/迴避 +5，面板算成 14 → +4。

同一函式另有兩處與戰鬥不一致（`CharacterStats.tsx:82`）：

| 項目 | 面板 | `systems/combat.ts` |
|---|---|---|
| 基礎命中 | 75 | 80（`:358`） |
| 武器攻擊成功 | **未計入** | 計入（`getWeaponAttackSuccess`） |

---

### P3-09 📄 `08-quality.md` § 8.7 的兩個計算範例互相矛盾，也對不上實作

| 來源 | 品質 10% + 攻擊力 10% 詞綴 | 品質 20% |
|---|---|---|
| § 8.7 範例一 | `100 × (1+10%) × (1+10%) = 121` | — |
| § 8.7 範例二 | — | `100 × (1+20%) = 120`（詞綴不見了） |
| 實作 | 詞綴值 10% × 1.1 = 11% → `100 × 1.11 = 111` | 詞綴值 10% × 1.2 = 12% → `112` |

實作語意（品質放大詞綴的百分比數值）與 § 8.5「品質只影響詞綴數值」一致，是對的；
§ 8.7 的兩個範例一個把品質當獨立乘數、一個直接忽略詞綴，兩個都無法從實作重現。

## 2-2.C 階段 2-2 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 21 項（含 07 全文、08 主要規則、防具取得表 75 列） | 見 2-2.A |
| ❌ 未實作 | 2 | P3-01（武器強化基傷）、P3-04（魔導書魔攻） |
| ⚡ 衝突 | 4 | P3-02、P3-03、P3-05（23 件）、P3-08 |
| 📄 文件缺漏 | 3 | P3-06、P3-07、P3-09 |

**嚴重度排序**：P3-01（強化系統核心效果缺失）> P3-04（6 件裝備完全無效）> P3-03（高階裝備風險定位反轉）
> P3-02 / P3-08（面板與戰鬥不一致，會誤導判斷）> P3-05（23 件資料漂移）> P3-06 / P3-07 / P3-09（文件補述）。

## 2-2.D 階段 2-2 處理結果

**使用者決策**：實作缺失補上、bug 修正；裝備魔攻採**固定值加算**；強化魔攻適用**法杖與魔導書**；P3-05 **以實作為準回寫文件**。

| 編號 | 處理 | 改動 |
|---|---|---|
| P3-01 | ✅ 已修補（程式） | `combat.ts` `getWeaponDamage` 與 `calculateBasePhysicalDamage` 加入 `enhancement`（§ 6.9 每 +1 → 基傷 +1）。同時修掉原本 `?? 1` 會讓無傷害欄位裝備吃到強化的隱患 |
| P3-02 | ✅ 隨 P3-01 一致 | 面板本來就算了 `weaponEnhance`，戰鬥補上後兩邊自動對齊 |
| P3-03 | ✅ 已修補（程式） | 強化成功率抽出成 `systems/enhancement.ts`；`getArmorEnhanceRate` 改為 `安定值內必成 → +1~+4 為 1/2 → +5 起 1/(n-1)`，完全重現 § 6.10 表格。原公式在安定值 0 時 +1 算出 `1/0`、+2 算出 `1/1`，兩級都變必定成功 |
| P3-04 | ✅ 已修補（程式＋文件） | `combat.ts` 新增 `getTotalMagicAttack`（基底 `magicAttack` + 法杖/雙手法杖/魔導書的 `floor(強化/2)`），以固定值加算進 `calculateSkillAttack`；`21-combat-formula.md` § 21.4 公式與範例同步更新 |
| P3-05 | ✅ 已修補（文件） | `06-equipment-armor.md` 56 列回寫為 seed 值；4 本魔導書的「專屬」備註已不成立（seed 為元素師+牧師共用），一併清除 |
| P3-06 | ✅ 已修補（文件） | `06-equipment.md` § 6.9 補安定值 0 武器的成功率表，並註明不可套用 § 6.10 的防具公式 |
| P3-07 | ✅ 已修補（文件） | `06-equipment-acquire.md` 新增 § 6A.6「製作品的詞綴生成」（固定 4 個、T1~T5 均等、不出 T6/T7 與特殊詞綴），原 § 6A.6 順延為 § 6A.7 |
| P3-08 | ✅ 已修補（程式） | `CharacterStats.tsx` 有效敏捷 `/2*2` → `/3*3`；命中改用 `80 + AGI加成 + getWeaponAttackSuccess()`，與 `systems/combat.ts` 同一套 |
| P3-09 | ✅ 已修補（文件） | `08-quality.md` § 8.7 三個範例重寫，明確定義 `有效詞綴數值 = floor(詞綴數值 × (1 + 品質%))` |

**新增測試**：`systems/__tests__/enhancementEffects.test.ts`（11 項：強化基傷線性、攻擊成功不受影響、裝備魔攻加總與強化加成、魔攻不進 INT 倍率）、
`systems/__tests__/enhancement.test.ts`（15 項：§ 6.10 表格 10 個目標等級 × 3 種安定值全表比對、安定值 0 必成迴歸、單調性）。

**驗證**：`npm run test` 90 檔 1091 項全綠；`npx tsc --noEmit` 無錯誤。

### 平衡影響提醒

P3-01 與 P3-04 會直接改變既有存檔的戰鬥數值：

- 已強化的武器傷害立即提升（`+6 匕首` 小/大怪各 +6）
- 裝備魔導書的元素師／牧師技能傷害提升 2~8（`+8` 古代魔導書為 +8）
- 安定值 0 的防具強化 +1/+2 不再必成，改為 50%

這些是把設計文件的既定規則補上，不是新平衡，但實機手感會有變化，建議實測一輪。

---

# 階段 3：技能實作

**比對文件**：`05-skill.md`、`22-basic-magic.md`、`23-class-magic.md`、`24-buff-debuff.md`、`42-element-system.md`、`41-arpg-combat.md` § 3.4~3.5
**比對實作**：`models/skill.ts`、`models/classSkills.ts`、`models/skillRestrictions.ts`、`models/playerDebuff.ts`、`models/effect.ts`、`systems/combat.ts`、`systems/playerDebuffSystem.ts`、`systems/arpgEngine.ts`、`systems/arpgEventHandler.ts`、`components/town/MagicAcademy.tsx`、`pixi/ui/CombatVisualEvent.ts`

## 3.A 已確認相符（✅）

| 設計條目 | 文件 | 結果 |
|---|---|---|
| 基礎魔法 50 個 | 22.3 | 名稱／級數／屬性／技能攻擊力／MP消耗／冷卻 **逐欄 0 不符** |
| 職業魔法 25 個（5 職 × 5 級） | 23.3~23.7 | 名稱／職業／級數／攻擊力／MP消耗／冷卻 **逐欄 0 不符** |
| 職業魔法每 10 級升一級 | 05 § 5.4 | `requiredLevel` 10/20/30/40/50 全對 |
| 各職業基礎魔法上限與學習頻率 | 05 § 7.5、22.2 | `skillRestrictions.ts` 全對（騎士 1級/5個/Lv50、妖精 6/30/每8級、元素師 10/50/每4級、牧師 10/50/每5級、盜賊 4/20/每8級） |
| 1~3 級學習費用 100 / 500 / 700 | 22.2 | `MagicAcademy.tsx:11-13` |
| 魔法書 5 種製作配方（碎片數＋材料數） | 22.2 | `SPELLBOOK_RECIPES` 全對，等級對應 4~5/6~7/8/9/10 也對 |
| 治癒量 35 / 70 / 150 / 500 | 22.3 | 治癒／中治癒／大治癒／完全治癒 全對 |
| 治癒量 400 / 200 | 23.6 | 高階治癒／群體治癒 全對 |
| AOE 命中數 2~3 / 3~4 / 3~5 / 4~6 / 5~7 / 6~8 / 6~10 | 22.3、23.5~23.6 | `aoeMin`/`aoeMax` 全對 |
| 減速 debuff（攻速-30%、6s）掛在 5 個冰系技能 | 22.3 | 寒霜／冰霧／冰環／冰暴／暴風雪 全對 |
| buff 持續時間 600s（基礎）／300s（妖精・盜賊） | 22.3、23.4、23.7 | 全對 |
| 角色 Debuff 6 種完整定義 | 24.4.1 | `PLAYER_DEBUFF_DEFS` 的 duration／DoT 係數（5%／8%）／modifiers／refreshable／tag／category **全對** |
| 減速與加速互相抵銷（雙向、各自消耗來源） | 24.4.6 | `playerDebuffSystem.ts:182-250`、`gameStore.ts:831` |
| Boss 控場免疫 10 秒 | 24.6 | `BOSS_CC_IMMUNE_MS = 10_000` |
| 護盾吸收 / 無敵 / HoT | 24.4.7~24.4.9 | `shieldRemaining`、`isPlayerInvincible`、`hotAmount` 皆有實作 |
| DoT 快照制（裂傷斬 50%、淬毒 30%） | 24.4.5 | `dotDamagePercent` + `calculateBasePhysicalDamage` 快照 |
| 元素克制環狀 + 光暗互克，固定 +3 | 42.2 | `ELEMENT_COUNTER` 六條對應全對；無屬性不克制也不被克制 |
| 傷害數字 6 色 | 42.3 | `DAMAGE_COLORS` 治癒綠／一般白／暴擊黃／屬性藍／技能灰／毒粉 全對 |
| 三連射走物理公式（hits=3）、穿透箭雨走魔法公式 + 無視 50% 防禦 | 23.4 | `arpgEventHandler.ts:163-190` 依 `skill.hits` 分流 |
| 弓限定技能（三連射、穿透箭雨） | 23.4 | `requiredWeaponType: 'bow'` |
| buff category 互斥分組 | 24.3.1 | accuracy／fire-enchant／defense-buff／protect-shield／weapon-bless／speed／sanctuary／crit-buff／cd-reduction／element-boost／holy-shield／evasion／poison-enchant 全對 |
| 綠色藥水 180s / 強化綠色藥水 900s，同 `speed` category | 24.3.1 | `gameStore.ts:60-61` |

## 3.B 落差清單

### P4-01 ❌ 復仇之刃（騎士 5）的累計傷害加成完全未實作

`23-class-magic.md` § 23.3 附有整段補充規則：

> 累計區間：從戰鬥開始計算，施放後歸零重算
> 加成公式：`加成% = min(100, 累計受傷 / 角色最大HP × 100)`
> 上限：+100%
> UI 顯示：技能圖示上顯示當前蓄力百分比

`classSkills.ts:24` 的實作：

```ts
skill: { id: 'vengeance', name: '復仇之刃', level: 5, element: 'none', type: 'attack',
         target: 'single', power: 80, mpCost: 50, cooldown: 25000, range: 1.5 }
```

沒有任何累計欄位，全 codebase 搜 `vengeance` 只有技能定義、技能書、UI 清單，**沒有任何累計傷害邏輯**。
這是騎士的終極技能，目前就是一個 50 MP、25 秒 CD 的 power 80 普通攻擊 —— 比 4 級的挑釁怒吼還單調。

---

### P4-02 ❌ 背刺（盜賊 5）的條件觸發 ×2 未實作

`23-class-magic.md` § 23.7：「物理高傷，**若目標正在攻擊其他對象則傷害 ×2**」

`classSkills.ts:68` 同樣只有 `power: 100`，無任何條件判定。全 codebase 搜 `backstab` 無相關邏輯。

盜賊終極技能的核心機制缺失。（另註：單人遊戲下「目標正在攻擊其他對象」本來就難成立，見 P4-15。）

---

### P4-03 ❌ 極冰封印（基礎 10 級）的防禦 -20% debuff 未實作

`22-basic-magic.md` § 22.3 10 級：「冰屬性範圍傷害 **+ 降低範圍目標防禦20% 持續 10s**」

`skill.ts:120`：

```ts
{ id: 'absolute-zero', name: '極冰封印', level: 10, element: 'ice', type: 'attack',
  target: 'aoe', power: 70, mpCost: 85, cooldown: 45000, range: 15, aoeMin: 6, aoeMax: 10 }
```

**沒有 `applyDebuff`**。對照組：詛咒、護甲崩壞、寒霜、冰霧、冰環、冰暴、暴風雪 全都有正確掛上 debuff，
只有極冰封印漏了。它 45 秒 CD、85 MP 的代價正是為了那個群體破防。

---

### P4-04 ❌ 神聖領域（牧師 5）的「免疫負面狀態」未實作

`23-class-magic.md` § 23.6：「全隊減傷 30% **+ 免疫負面狀態**，持續 10s」

`classSkills.ts:57` 的 `buffModifiers` 只有 `damageReduction +30%`。
而 `playerDebuffSystem.ts:34 getDebuffImmunityRate` **只檢查特殊詞綴**（`SpecialAffixType`），沒有任何 buff 來源的免疫判定：

```ts
export function getDebuffImmunityRate(type, specials) {
  const affix = IMMUNITY_AFFIX_BY_DEBUFF[type];
  if (!affix) return 0;
  return specials.has(affix) ? 1 : 0;   // ← 只看詞綴
}
```

`buffEffect` 字串寫著「減傷30%+免疫負面」，UI 會照字串顯示，但實際完全沒有免疫效果 —— **顯示與行為不符**。

---

### P4-05 ⚡ 元素風暴（元素師 5）寫死火屬性，文件是隨機四元素

`23-class-magic.md` § 23.5：「**隨機火/冰/風/地屬性**，命中 6~10 體」

`classSkills.ts:46`：`element: 'fire'` 寫死。

影響元素克制判定：對風屬性怪永遠 +3，對火屬性怪永遠 +0，失去「隨機」帶來的期望值平均化。

---

### P4-06 ⚡ 元素增幅（元素師 3）作用於全部元素，文件是「指定一種」

`23-class-magic.md` § 23.5：「**指定一種元素**傷害 +25%，持續 30s」

`classSkills.ts:44`：`buffModifiers: [{ stat: 'skill_elemental', value: 25, isPercent: true }]`
→ `skill_elemental` 是通用的「技能元素傷害%」，對**所有**元素技能生效，且沒有任何選擇元素的 UI 或參數。

實作比文件強（無條件全元素 +25%），且缺少「指定」的互動設計。

---

### P4-07 ⚡ AOE 欄位與 `41-arpg-combat.md` § 3.4/3.5 的介面定義不符

文件定義（§ 3.5）：

```typescript
aoeRadius?: number;       // AOE 搜索半徑（格數）
maxTargets?: number;      // AOE 最大目標數（含主目標）
projectileSpeed?: number; // 投射物速度
```
加上 § 3.4 的 `aoeCenter: 'target' | 'self'`。

實作（`skill.ts:37-38`、`arpgEngine.ts:341-349`）：

```ts
const aoeRadius = skill.aoeMax ?? 3;      // ← 半徑取自 aoeMax
const maxTargets = skill.aoeMax ?? 3;     // ← 上限也取自 aoeMax（同一個值兼兩用）
const isSelfCentered = skill.aoeMin !== undefined && skill.aoeMin <= 1;  // ← 中心模式用 aoeMin 推導
```

- `aoeCenter`、`aoeRadius`、`maxTargets`、`projectileSpeed` **四個欄位都不存在**
- `aoeMax` 同時當半徑與數量上限，兩者無法分別調整
- `aoeMin` 完全不是「最少命中數」，只是 self/target 模式的開關

§ 3.4 範例表也對不上：龍捲風 文件 `aoeRadius 4 / maxTargets 6`，實作 `aoeMax=6` → 半徑 6 格、上限 6 隻。

**更根本的問題**：`22-basic-magic.md` 全部 AOE 技能寫「命中 N~M **體**」（數量區間），
`41-arpg-combat.md` 寫「半徑 + 上限」，**兩份文件的語意本身就不一致**，實作只能滿足其一。需要先統一設計語言。

---

### P4-08 ⚡ 挑釁怒吼的 debuff category 與文件不符，且與詛咒撞號

`24-buff-debuff.md` § 24.3.1 表列：`atk-debuff` = 挑釁怒吼（怪物攻擊力 -20%）

實作 `classSkills.ts:22` 用的是 **`atk-down`**，而基礎魔法 7 級的「詛咒」（`skill.ts`）**也用 `atk-down`**。

後果：騎士對怪物施放挑釁怒吼後再放詛咒（或反之）會互相覆蓋，兩個技能無法並存。
文件把它們列為不同來源，未定義是否應互斥。

---

### P4-09 📄 冰霧 / 冰環 的 AOE 命中數未定義

`22-basic-magic.md` 其他 AOE 技能都明寫「命中 N~M 體」，只有這兩個寫「冰屬性範圍，減速（...）」沒有數量。
實作：冰霧 2~3、冰環 3~5。

---

### P4-10 📄 部分技能的 buffCategory 未列入 § 24.3.1

| 技能 | 實作 category | § 24.3.1 |
|---|---|---|
| 敏捷提升（4 級） | 無（不互斥） | 未列 |
| 力量提升（6 級） | 無（不互斥） | 未列 |
| 絕對屏障（10 級） | `invincible` | 未列 |

前兩者無 category 代表可無限並存，這是有意還是遺漏，文件沒說。

---

### P4-11 📄 聖光術（5 級）文件類型「治癒」，實作為 `buff` + `cleanse`

功能一致（淨化負面狀態），但分類不同，會影響依 `type` 篩選的 UI 與戰鬥腳本條件。

---

### P4-12 📄 詛咒 / 護甲崩壞 文件類型「減益」，實作為 `type: 'attack'` + `power: 0`

走攻擊公式時 `Math.max(1, ...)` 保底會造成 1 點傷害。文件未定義純減益技能是否應該造成傷害。

---

### P4-13 📄 `models/monster.ts:57` 註解寫「30 秒」，實際為 10 秒

```ts
/** § 24.6 Boss 控場免疫：被控場後 30 秒內免疫任何控場效果（時間戳 ms） */
ccImmuneUntil?: number;
```

常數 `BOSS_CC_IMMUNE_MS = 10_000` 是對的（符合 § 24.6），只有註解錯。純文字錯誤，不影響行為，但會誤導後續維護。

---

### P4-14 📄 42.3 傷害顏色的「屬性傷害」定義與實作不同，且缺 miss 色

- 文件：「屬性傷害 | 亮藍色 | **元素克制額外傷害**」
- 實作（`PixiGame.tsx:332`）：只要技能有元素屬性就用亮藍色，與是否觸發克制無關
- 實作另有 `miss: 0x999999`（灰色），42.3 表格未列

---

### P4-15 ⚡ 文件內部矛盾：騎士「嘲諷」與牧師「復活」兩個機制不存在

| 來源 | 敘述 | 實際 |
|---|---|---|
| § 23.2 差異表 | 「控制：騎士暈眩/**嘲諷**」 | § 23.3 騎士 5 個技能無嘲諷；4 級「挑釁怒吼」是攻擊力 -20% 的弱化 |
| § 23.8 設計意圖 | 「騎士是唯一擁有**嘲諷**和暈眩的職業」 | 同上 |
| § 23.8 設計意圖 | 「盜賊的條件觸發機制（背刺）鼓勵組隊配合騎士**嘲諷**」 | 建立在不存在的機制上 |
| § 23.2 差異表 | 「治癒：群體治癒、**復活他人**（牧師專屬）」 | § 23.6 牧師 5 個技能無復活 |
| § 23.8 設計意圖 | 「牧師是唯一能**復活他人**的職業」 | 同上 |

實作與 § 23.3 / § 23.6 的技能表一致，錯的是 § 23.2 / § 23.8 的敘述。

**附帶**：牧師的「全隊」「隊友」與盜賊背刺的「目標正在攻擊其他對象」都預設有組隊系統，
但組隊屬 `17-mvp-priority.md` § 17.5 第五階段（尚未實作）。目前這些技能實際上只作用於自己。

## 3.C 階段 3 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 22 項（含 50 基礎魔法 + 25 職業魔法主欄全對、角色 debuff 全對、元素系統全對） | 見 3.A |
| ❌ 未實作 | 4 | P4-01、P4-02、P4-03、P4-04 |
| ⚡ 衝突 | 4 | P4-05、P4-06、P4-07、P4-08 |
| 📄 文件缺漏 | 7 | P4-09~P4-14（P4-13 為程式註解錯誤） |

**嚴重度排序**：P4-01 / P4-02（兩個職業的終極技能核心機制缺失）> P4-04（顯示與行為不符，玩家會誤信）
> P4-03（單一技能效果缺失）> P4-07（AOE 兩份文件語意打架，需先統一設計）> P4-08（技能互相覆蓋）
> P4-05 / P4-06（元素師兩個技能行為偏離）> P4-15（文件敘述錯誤）> 其餘文件補述。

### P4-16 ⚡ 新發現：騎士／盜賊標示「物理傷害」的職業技能實際走魔法公式

稽核階段 3 修補時發現，`arpgEventHandler.ts:174-206` 依 `skill.hits` 分流：

```ts
if (skill.hits) {  // 多段物理（僅三連射）
  calculatePhysicalSkillHit(...)
} else {           // 其餘一律走魔法公式
  calculateSkillAttack(...)   // ← 吃 INT，不吃武器基傷與 STR
}
```

因此以下 5 個 `23-class-magic.md` 標示「**物理**傷害／物理高傷」的技能，實際上都以 INT 計算：

| 技能 | 文件敘述 | 實際公式 |
|---|---|---|
| 盾擊（騎士 1） | 物理傷害 + 暈眩 2s | 魔法（技能攻擊力 + INT加成） |
| 裂傷斬（騎士 2） | 物理傷害 + 流血 | 魔法 |
| 挑釁怒吼（騎士 4） | 物理傷害 + 弱化 | 魔法 |
| 復仇之刃（騎士 5） | 物理高傷 | 魔法 |
| 背刺（盜賊 5） | 物理高傷 | 魔法 |

**影響**：騎士初始 INT 10、盜賊 12，這些技能的傷害幾乎不受武器強度影響 ——
換一把頂級雙手劍對盾擊／復仇之刃的傷害毫無提升。

**連帶影響 P4-01 / P4-02**：本次補上的攻擊力% 自身 buff 作用於**物理**傷害，
因此復仇之刃／背刺**本身**目前吃不到自己給的加成（只有後續普攻吃得到）。
待此項決議後，兩個技能的設計才會完整。

**使用者決議**：維持走 INT 的技能公式；「物理傷害」指的是**傷害類型**（無元素、顯示淺灰色），不是公式。
→ 實作不動，改為收緊文件用詞：

| 文件 | 修改 |
|---|---|
| `23-class-magic.md` | 新增 § 23.1.1「物理傷害」的定義，明列適用技能與四項後果 |
| `21-combat-formula.md` § 21.4 | 註明本公式同時適用於標示「物理傷害」的職業技能；唯一走物理普攻公式的是三連射 |
| `24-buff-debuff.md` § 24.4.5 | 虛弱作用範圍改為「依**物理公式計算**的傷害」，並明列不受影響的 5 個職業技能 |

一併釐清的邊界：裂傷斬的**直接傷害**不受虛弱影響，但其流血 DoT 以「基礎物理傷害」快照，**該部分會**受虛弱影響。

**設計後果（已寫入 § 23.1.1）**：這 5 個技能的強度由角色等級與技能威力決定，換武器不會提升傷害；
復仇之刃／背刺的自身 buff 因此不作用於技能本身，而是強化施放後的**普通攻擊** —— 與「打完給自己一段增益」的設計一致。

## 3.D 階段 3 處理結果

**使用者決策**：P4-01 / P4-02 改為 buff 形式；P4-03 / P4-04 依文件補上；
P4-05 / P4-06 / P4-08 以實作為準改文件；P4-07 以 `41-arpg-combat.md` 為準。

| 編號 | 處理 | 改動 |
|---|---|---|
| P4-01 | ✅ 已重新設計（程式＋文件） | 新增 `Skill.selfBuff` 與 `applySkillSelfBuff`。復仇之刃改為 `加成% = min(50, (1 - hp/maxHp) × 100)`，持續 10s、category `vengeance`、同類互蓋；滿血不施加。§ 23.3 補充規則整段改寫 |
| P4-02 | ✅ 已重新設計（程式＋文件） | 背刺改為施放後自身「攻擊力 +50%」持續 5s，取消原條件判定。§ 23.7 同步改寫 |
| P4-03 | ✅ 已補上（程式＋測試） | 極冰封印補 `applyDebuff`（`defense-down`、-20%、10s）。原測試斷言「極冰封印無 debuff」等於把 bug 寫進測試，已改為斷言正確效果 |
| P4-04 | ✅ 已補上（程式） | `ActiveEffect` / `Skill` 新增 `immuneDebuff`；`getDebuffImmunityRate` 加入 buff 來源判定並補 `now` 參數。神聖領域生效期間對 6 種 debuff 全數 100% 免疫 |
| P4-05 | ✅ 文件配合實作 | § 23.5 元素風暴改為「火屬性」 |
| P4-06 | ✅ 文件配合實作 | § 23.5 元素增幅改為「所有元素技能傷害 +25%」 |
| P4-07 | ✅ 已重構（程式＋文件） | `aoeMin`/`aoeMax` → `aoeCenter`/`aoeRadius`/`maxTargets`，22 個 AOE 技能轉換；`arpgEngine` 目標選取、`SkillPanel`、wiki 顯示同步；`22-basic-magic.md` 19 列效果欄改寫並新增「AOE 表示法」小節 |
| P4-08 | ✅ 文件配合實作 | § 24.3.1 `atk-debuff` → `atk-down`，並明列與詛咒共用同 category（互蓋） |
| P4-09 | ✅ 已補（文件） | 冰霧／冰環隨 AOE 改寫一併補上半徑與上限 |
| P4-10 | ✅ 已補（文件） | § 24.3.1 補 `defense-down`／`vengeance`／`backstab`／`invincible`／「無 category」五列 |
| P4-13 | ✅ 已修（程式註解） | `models/monster.ts` 「30 秒」→「10 秒」 |
| P4-14 | ✅ 已補（文件） | § 42.3 屬性傷害定義改為「帶元素屬性的技能傷害」，補 miss 灰色列 |
| P4-15 | ✅ 已修（文件） | § 23.2 / § 23.8 移除「嘲諷」「復活他人」，改為實際存在的暈眩與群體治癒 |
| P4-11 / P4-12 | ⏸ 未處理 | 聖光術與詛咒/護甲崩壞的「類型」標示差異，屬分類問題，不影響行為 |
| **P4-16** | ✅ 已釐清（文件） | 維持 INT 公式，收緊三份文件對「物理傷害」的用詞，見上 |

**唯一的行為變更（非新增）**：龍捲風的 AOE 半徑由 6 格改為 4 格 —— `41-arpg-combat.md` § 3.4 範例表明訂
「龍捲風 / target / aoeRadius 4 / maxTargets 6」，依「以 41 為準」的決策調整。目標上限 6 隻不變。

**新增測試**：`systems/__tests__/skillSelfBuff.test.ts` 12 項（復仇之刃殘血加成含邊界與互蓋、背刺固定加成、神聖領域免疫含過期）。
另修正 `skillSlowDebuff.test.ts` 中把 P4-03 缺陷寫成期望值的斷言。

**驗證**：`npm run test` 91 檔 1104 項全綠；`npx tsc --noEmit` 無錯誤。

---

# 階段 4：Quest

**比對文件**：`36-quest-system.md`（含職業工會任務 § 36.10.4）
**比對實作**：`models/adventurerQuest.ts`、`systems/adventurerQuestSystem.ts`、`models/quest.ts`、`systems/questSystem.ts`、`stores/gameStore.ts`、`components/town/AdventurerGuild.tsx`、`components/QuestTracker.tsx`

## 4.A 已確認相符（✅）

本階段是目前為止**吻合度最高**的一段 —— 除了下列 5 項，其餘逐格對照全部正確。

| 設計條目 | 文件 | 結果 |
|---|---|---|
| 5 種任務類型與生成權重 | 36.9 | D/C 為 40/30/30；B/A/S 為 30/20/20/15/15，全對 |
| 任務數量 `random(5, 8)` | 36.9 | `randomInt(5, 8)` |
| 殲滅數量 5 段 | 36.3 | D 15-20／C 15-20／B 20-25／A 20-30／S 25-30 全對 |
| 持續戰鬥數量 5 段 | 36.3 | D 50-60／C 55-70／B 60-80／A 70-90／S 80-100 全對 |
| 素材收集 1~5 個、掉率 40% | 36.2.2 | `COLLECT_TARGET_COUNT_RANGE` / `COLLECT_DROP_RATE` |
| BOSS 殲滅 1~3 隻、BOSS 素材 1~3 個、掉率 30% | 36.2.4 / 36.8.1 | `randomInt(1, BOSS_COLLECT_TARGET_COUNT)` |
| 9 階等階 F→US 與 8 個升階門檻 | 36.4.1 / 36.4.3 | 200／600／1,800／5,000／15,000／100,000／500,000／10,000,000 全對 |
| 貢獻基底表（5 難度 × 5 類型 = 25 格） | 36.4.2 | `CONTRIBUTION_POINTS` 全對，D/C 級 BOSS 欄為 0（BOSS 僅 B 級以上） |
| 貢獻公式 `基底 + floor(avgGold / 10)` | 36.4.2 | `buildQuest` 一致；BOSS 任務改用 `bossAvgGold` |
| 獎勵權重 5 組（F~D／C／B／A／S~SS） | 36.5.2 | `REWARD_WEIGHTS` 全對 |
| 藥水 5 種單價 25／80／200／200／1,000 | 36.5.3 | 全對，換算 `max(1, floor(base / unitPrice))` |
| 製作素材 B／A／S 三組名稱與售價 | 36.5.4 | 銀礦石·銀精華(50)／米索利碎片·米索利礦石(150)／龍骨碎片·龍心結晶(250)·奧里哈魯根碎片·精華(550) 全對 |
| 素材數量 `max(1, floor(基準值 ÷ (售價 × 3)))` | 36.5.4 | 一致 |
| 金幣獎勵 ×2；BOSS 基準 `×3` 後獎勵再 `×2` | 36.3 / 36.9 | 一致 |
| 品質石／強化石以 100 金/個換算 | 36.5.1 | 一致 |
| 卷軸固定 1 張 | 36.5.1 | 一致 |
| **50 個區域的 `avgGold`** | 36.7 | **0 不符** |
| **17 隻 BOSS 的難度／區域／金幣** | 36.8.1 | **0 不符** |
| 城鎮難度頁籤 D/C/B/A、A/S、A/S | 36.6.1 / 36.12.2 | `getTownDifficulties` 全對 |
| 城鎮區域池分配（含共享區域） | 36.12.2 / 36.12.3 | 薄暮村 D2/C3/B6/A2、艾爾薩斯 A22/S10、瓦爾登 A23/S10，與文件敘述一致 |
| 同時接取上限 3（跨難度共用） | 36.6.2 | `MAX_ACTIVE_ADVENTURER_QUESTS` |
| 退出扣除等量貢獻並可降階 | 36.4.1 / 36.6.4 | `abandonQuest` 以 `getRankForPoints` 重算等階 |
| 列表不持久化、登入重新生成 | 36.6.3 | `initQuestBoard` 於 `loadCharacter` / `createCharacter` 呼叫 |
| 完成／退出後該欄位自動刷新 | 36.6.3 | `completeAdventurerQuest` / `abandonAdventurerQuest` 就地替換該 index |
| 已接取任務持久化 | 36.6.3 | 隨 `saveGame` 存檔 |
| 無可用 BOSS 時降級為殲滅任務 | 36.9 步驟 4 | `bossPool.length === 0` 分支 |
| 獎勵入包前檢查容量 | 36.11 | 背包滿時不交付、任務保持可交付狀態 |
| 職業工會一級：Lv10、擊殺 20 隻、區域池 [翠綠谷地, 風語林地] | 36.10.4 | `ERRAND_KILL_TARGET = 20`、`ERRAND_AREA_POOL` |
| 職業工會二級：Lv20、收集 2 個、掉率 10%、區域池 [迷霧沼澤, 試煉高地] | 36.10.4 | `COLLECT_MATERIAL_TARGET = 2`、`COLLECT_MATERIAL_DROP_RATE = 0.1`、`COLLECT_AREA_POOL` |
| 二級試煉排除試煉高地頂部、只挑非 Boss 怪 | 36.10.4 | `COLLECT_AREA_POOL` 不含 `trial-highlands-top`；`getMonstersByArea` 過濾 `isBoss` |
| UI：已接取 X/3、城鎮分部標籤、交付／退出按鈕 | 36.10.1 | `AdventurerGuild.tsx` |
| UI：任務追蹤浮動視窗（`[職業]`／`[冒險]` 標籤、可交付標記、空狀態文案） | 36.10.3 | `QuestTracker.tsx` |

## 4.B 落差清單

### P5-01 📄 US 等階的獎勵 ×10 完全沒有文件依據，且吃掉了 BOSS 的 ×2

`systems/adventurerQuestSystem.ts` `buildQuest`：

```ts
const rewardMultiplier = guildRank === 'US' ? 10 : (isBossQuest ? 2 : 1);
```

`36-quest-system.md` § 36.5 全文沒有「US 等階獎勵加倍」這條規則。

而且這是**三元運算的互斥分支**：US 玩家接 BOSS 任務時，`isBossQuest ? 2` 這一支永遠走不到，
獎勵是 ×10 而不是預期的 ×20 —— BOSS 任務對 US 玩家反而**相對變弱**（一般任務也 ×10）。
看起來是後來加 US 加成時沒考慮到與 BOSS 倍率的疊乘關係。

**需要決定**：(a) 文件補上 US ×10 的規則並改為 `US ? 10 : 1` 與 `isBossQuest ? 2 : 1` **相乘**；
(b) 文件補上現行行為（US 一律 ×10，不再額外吃 BOSS 加成）；(c) 移除 US ×10。

---

### P5-02 📄 § 36.5.2 獎勵權重表沒有 US 等階

表格只列到「玩家等階 S ~ SS」，但等階系統有 9 階（§ 36.4.1 明列 US）。
實作 `REWARD_WEIGHTS.US` 沿用 S/SS 的權重 —— 合理，但沒有文件依據。

---

### P5-03 📄 § 36.8 素材收集怪物池文件過時，少了 51 隻怪物

實作 `buildMonsterPools()` 由 `MONSTER_SEEDS` **依區域自動推導**（較穩健，新增怪物自動納入），
文件則是硬編清單，未隨怪物新增而更新：

| 難度 | 文件列出 | 實際可指定 | 差 |
|---|---|---|---|
| D 級 | 6 隻 | 6 隻 | ✅ |
| C 級 | 9 隻 | 9 隻 | ✅ |
| B 級 | 9 隻 | 14 隻 | **+5** |
| A 級 | 29 隻 | 53 隻 | **+24** |
| S 級 | 17 隻 | 39 隻 | **+22** |

文件缺漏的例子：B 級的山賊頭目／雪人／雪怪／冰霜元素／象牙魔導師；
A 級的朦朧幻獸／潮汐元素／百柱奇美拉／暗影巫師等；S 級的殘影系列全部、精靈王射手、冥界相關等。

**建議**：既然實作是自動推導，文件的怪物清單本質上是「衍生資料」，
可考慮改成說明推導規則（「該難度區域池內所有非 Boss 怪物」）而不再列舉，避免永遠追不上。

---

### P5-04 ⚡ 素材收集任務的進度與掉落判定**不檢查區域**

`updateCollectQuestProgress` 與 `rollCollectMaterialDrop` 都只比對怪物名稱：

```ts
if (quest.targetMonster !== monsterName) return quest;   // 沒有比對 targetArea
```

而 seed 中有 **28 隻怪物同名跨多個區域**，例如：

| 怪物 | 出現區域 |
|---|---|
| 高階骷髏鬥士 | 龍之谷地表 + 龍谷地間 1F~6F（共 7 區） |
| 溺水亡靈 | 水下監獄 1F / 2F / 4F |
| 冰晶蝙蝠 | 雪原 + 象牙塔 1F / 2F |
| 高等蜥蜴 | 朦朧洞窟 1F / 2F / 3F |

任務描述會明寫「請擊殺 **迷霧沼澤** 的 **毒蛇**」（§ 36.10.2 要求高亮區域名），
但實際在任何區域打到同名怪都會掉素材並計入進度。**敘述與行為不一致**。

注意：`errandboss` 也只比對名稱，但 17 隻 BOSS 名稱各自唯一且綁單一區域，因此不受影響。

---

### P5-05 📄 素材收集任務在該難度無可用怪物時降級為殲滅任務，文件未定義

`generateSingleQuest` 有 `monsterPool.length === 0 → 降級為 errand` 的分支，
但 § 36.9 步驟 4 只定義了 BOSS 任務的降級規則（「若無可用 BOSS 則降級為殲滅任務」），
沒有對應的 collect 降級條款。

## 4.C 階段 4 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 31 項（含 50 區域 avgGold、17 隻 BOSS、25 格貢獻表、5 組獎勵權重全對） | 見 4.A |
| ⚡ 衝突 | 1 | P5-04 |
| 📄 文件缺漏 | 4 | P5-01、P5-02、P5-03、P5-05 |

**嚴重度排序**：P5-01（US 倍率無依據且吃掉 BOSS 加成，屬實際數值問題）> P5-04（敘述與行為不一致）
> P5-03（文件過時 51 隻）> P5-02 / P5-05（純補述）。

## 4.D 階段 4 處理結果

| 編號 | 處理 | 改動 |
|---|---|---|
| P5-01 | ✅ 已修正（程式） | `rewardMultiplier` 由 `guildRank === 'US' ? 10 : (isBossQuest ? 2 : 1)` 改為 `isBossQuest ? 2 : 1`。US 等階保留，只移除無文件依據的 ×10；同時解掉「US 玩家的 BOSS 任務拿不到 ×2」的互斥 bug |
| P5-02 | ✅ 已補（文件） | § 36.5.2 權重表標題「玩家等階 S ~ SS」→「S ~ US（S / SS / US 共用同一組權重）」 |
| P5-03 | ✅ 已補（文件） | § 36.8 重寫：新增 § 36.8.0「怪物池的推導規則」（該難度區域池內所有非 Boss 怪物，自動推導），§ 36.8.1 改為資料快照並註明以實際資料為準；原 § 36.8.1 BOSS 表順延為 § 36.8.2 |
| P5-04 | ✅ 已補（文件） | 使用者確認「區域為建議」是預期行為。§ 36.11 補上三種任務的進度判定範圍差異；§ 36.8.0 加註引用 |
| P5-05 | ✅ 已補（文件） | § 36.9 新增步驟 5：素材收集任務無可用怪物時同樣降級為殲滅任務 |

**新增測試**：`adventurerQuestSystem.test.ts` 新增「獎勵倍率」區塊 2 項 —— 反推基準值驗證
US 一般任務與 S 等階同區間（無額外倍率）、US 的 BOSS 任務仍且僅有 ×2。

**驗證**：`npm run test` 91 檔 1106 項全綠；`npx tsc --noEmit` 無錯誤。

---

# 階段 5：怪物 / 掉落 / Spawn

**比對文件**：`25-monster-system.md`、`26-spawn-pressure.md`、`27-drop-table.md`、`28-monster-stats.md`
**比對實作**：`db/seed/monsterSeeds.ts`（135 種怪物）、`db/seed/dropSeeds.ts`（725 筆一般掉落 + 155 筆 Boss 掉落）、`systems/pressure.ts`、`systems/drops.ts`、`stores/mapMonsterStore.ts`

## 5.A 已確認相符（✅）

| 設計條目 | 文件 | 結果 |
|---|---|---|
| Pressure 公式 `max(0, floor((分鐘-30)/10))` | 26.3 | `systems/pressure.ts` |
| `maxMonsters = min(10, 3 + Pressure)` | 26.2 | `BASE_MAX_MONSTERS=3`、`MAX_MONSTERS_CAP=10` |
| 生成判定間隔 1000ms、成功率 15% | 26.2 | `SPAWN_INTERVAL_MS`、`BASE_SPAWN_CHANCE` |
| `adjustedInterval = 間隔 / (1 + Pressure × 0.2)` | 26.2 | `mapMonsterStore.ts:92` |
| 一次生成隻數機率 3 段（80/15/5、60/30/10、50/25/25） | 26.2 | `rollSpawnCount` 全對 |
| Boss：同時上限 1 隻、停留 ≥10 分鐘、10% 機率 | 26.4 | `mapMonsterStore.ts:107-111` |
| 生成距玩家 ≥5 格、最多嘗試 20 次 | 26.7 | `MIN_SPAWN_DISTANCE=5`、`attempts < 20` |
| 等待回復時暫停生成 | 26.1 / 26.2 | `if (state.paused) return` |
| **§ 25.8 怪物屬性表：135 種怪物的種族／體型／元素／debuff／觸發率** | 25.8 | **141 列逐欄 0 不符** |
| 掉落公式 `dropValue / 1000 × (1 + drop_rate/100) × 全域倍率`，上限 100% | 27.1 | `drops.ts:48-51,68` |
| 掉落值對照表（100%→1000、5%→50、0.05%→0.5…） | 27.2 | seed 值與表格一致 |
| 區域掉落表（11 個單一區域小節，109 列） | 27.3 | 104 列相符（其餘見 P6-03） |
| Boss 專屬掉落池涵蓋 17 隻 Boss | 27.6 | `BOSS_DROP_TABLE_SEEDS` 155 筆，Boss 名單與 § 36.8.2 完全一致 |

## 5.B 落差清單

### P6-01 ⚡ § 28 怪物素質表：148 列中 **103 列不符**（Boss 15 / 一般怪 88）

這是本次稽核**規模最大的單一落差**。

**(a) Boss 的等級與倍率完全對不上**

§ 28.1 的 Boss 倍率表 vs seed 實測（對比同區一般怪平均）：

| 來源 | HP | 攻擊 | 防禦 | 經驗 |
|---|---|---|---|---|
| 文件：副本 Boss | ×8 | ×2 | ×1.5 | ×10 |
| 文件：百柱塔樓層王（Lv.80） | ×15 | ×2.5 | ×2 | ×15 |
| 文件：遠古地監王（Lv.85） | ×12 | ×2.5 | ×2 | ×12 |
| 文件：百柱塔 100F 王（Lv.90） | ×20 | ×3 | ×2.5 | ×20 |
| **seed 實測（17 隻全部）** | **×3.8~6.6** | **×1.2~1.3** | **×1.1~1.3** | **×4.7~7.2** |

seed 的 Boss 等級最高只到 **60**，文件卻有 80 / 85 / 90。代表性差距：

| Boss | 文件（§ 28） | seed |
|---|---|---|
| 遠古騎士 | Lv.85、HP 14,400、EXP 28,800 | Lv.60、HP 3,000、EXP 7,000 |
| 百柱死神 | Lv.90、HP 25,000、EXP 60,000 | Lv.60、HP 3,500、EXP 9,000 |
| 守護者之主 | Lv.80、HP 18,000、EXP 36,000 | Lv.60、HP 3,200、EXP 8,000 |
| 象牙塔惡魔 | Lv.45、HP 3,600、EXP 9,500 | Lv.45、HP 1,800、EXP 4,500 |
| 朦朧蛇魔 | Lv.50、HP 4,800、EXP 12,000 | Lv.50、HP 2,000、EXP 5,000 |

**交叉驗證指向 § 28 是過時的那一份**：

| 文件 | 遠古騎士等級 | 與 seed |
|---|---|---|
| `36-quest-system.md` § 36.8.2 | Lv.60 | ✅ 一致 |
| `28-monster-stats.md` | Lv.85 | ❌ |
| `09-dungeon.md` § 9.7 | Lv.85（且明寫「僅最終 Boss 為 85 級」） | ❌ |

`36` 與 seed 是同一批新資料，`28` 與 `09` 是同一批舊資料。

**(b) 一般怪物 88 列有小幅偏移**

多為等級 ±1~4、HP/EXP ±5~10% 的差距，例如：

| 怪物 | 文件 | seed |
|---|---|---|
| 象牙巫師（1F） | Lv.34 HP 265 | Lv.34 HP **260** |
| 冰晶蝙蝠（2F） | Lv.36 HP 300 EXP 610 | Lv.**37** HP 300 EXP **620** |
| 霜甲戰士（5F） | Lv.42 HP 420 | Lv.**44** HP **440** |
| 高等妖魔鬥士（1F） | Lv.40 HP 380 | Lv.**43** HP **430** |
| 遠古凶獸（7~9F） | Lv.55 HP 780 EXP 1,680 | Lv.**59** HP **720** EXP **1,420** |

**需要決定**：以哪邊為準。若以 seed 為準（與階段 2-1 武器的處理一致），
需重寫 § 28 的 Boss 倍率表與 148 列素質表，並同步 `09-dungeon.md` § 9.7 的 Boss 等級敘述。

---

### P6-02 ⚡ 裝備掉落：文件每區兩列（武器 + 防具各 1.5%），實作每區只有一筆

文件 § 27.3 每個區域都列成兩列，例如象牙塔：

```
| 高級入門武器（隨機） | 15 | 1.5% | 製作入門池 |
| 高級入門防具（隨機） | 15 | 1.5% | 製作入門池 |
```

實作 `dropSeeds.ts`：**48 個區域各只有 1 筆** `itemType: 'equipment'`，且 `equipmentPool` 一律是 `'all'`：

```ts
{ area: 'green-valley', itemType: 'equipment', equipmentPool: 'all', acquireType: 'shop', shopTier: 'low', dropValue: 15 }
```

**後果**：
- 實際裝備掉落率是文件的**一半**（一次 1.5% 判定，而非武器 1.5% + 防具 1.5% 兩次獨立判定）
- 武器與防具共用同一次 roll，不會同時掉

---

### P6-03 ⚡ 橙色藥水的「5~10%」在實作中永遠是 5%

- § 27.1 類別總覽：「橙色藥水 | Lv.30+ 區域怪物 | **5~10%**」
- § 27.3 各區表：「橙色藥水 | **50~100** | 5~10%」

實作 seed：**22 個區域固定 50（5%）、1 個區域 60（6%）** —— 沒有任何區域達到 10%。

根因：`drops.ts:186-193` 的等級縮放**只套用在 `category === 'dungeon'` 的物品**
（百柱塔卷軸與 9 張通行卷軸），一般物品的 `dropValue` 是固定值，不隨怪物等級變動。

同一問題影響其他以範圍表示的掉落值：

| 物品 | 文件 | seed |
|---|---|---|
| 銀礦石（妖魔森林／明鏡森林） | 50~100（5~10%） | 80 固定 |
| 米索利碎片（遠古戰場） | 50~80（5~8%） | 60 固定 |

---

### P6-04 📄 § 27.3 的「掉落值範圍」寫法沒有對應機制

承 P6-03。文件多處以 `50~100` 這種範圍表示掉落值，但實作只有兩種形態：
單一固定值，或百柱塔卷軸類的等級線性縮放（`min(100, floor(base × (1 + levelProgress)))`）。

**需要決定**：(a) 把這些範圍改寫為固定值（配合實作）；
(b) 把等級縮放的適用範圍從 `category === 'dungeon'` 擴大到這些物品（改實作）。

---

### P6-05 📄 § 26.2 的 Pressure 對照表跳過 70~100 分鐘

表格從「60~70 分鐘 / Pressure 4」直接跳到「100+ 分鐘 / Pressure 7+」，
缺少 70~80（P=5）、80~90（P=6）、90~100（P=7）三列。實作是連續公式沒有斷層，純粹是表格不完整。

## 5.C 階段 5 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 14 項（含 § 26 全部、§ 25.8 的 141 列逐欄全對、掉落公式與 Boss 掉落池） | 見 5.A |
| ⚡ 衝突 | 3 | P6-01（103 列）、P6-02（48 區）、P6-03 |
| 📄 文件缺漏 | 2 | P6-04、P6-05 |

**嚴重度排序**：P6-01（103 列、且牽動 09-dungeon）> P6-02（實際掉落率為文件的一半，48 區全受影響）
> P6-03（標示 5~10% 實際只有 5%）> P6-04 / P6-05（補述）。

> 註：`25-monster-system.md` § 25.8 的 141 列**逐欄 0 不符**，與 § 28 的 103 列不符形成強烈對比 ——
> 同一批怪物的「屬性」欄位完全同步，「素質」欄位卻大幅脫節，顯示兩份文件的維護節奏不同。

## 5.D 階段 5 處理結果

**使用者決策**：P6-01 以實作為準；P6-02 改實作（1/2 抽類別）；P6-03 只有橙色藥水做等級縮放，素材改回固定值。

| 編號 | 處理 | 改動 |
|---|---|---|
| P6-01 | ✅ 已修補（文件） | `28-monster-stats.md` 依 seed 全文重寫：§ 28.1 成長曲線與 Boss 倍率改為**實測值**（HP ×3.8~6.6、攻 ×1.2~1.3、防 ×1.1~1.3、經驗 ×4.7~7.2；Boss 等級 30~60），199 列素質表全部重生。`09-dungeon.md` § 9.7 遠古騎士 Lv.85→60、「僅最終 Boss 為 85 級」改為「Boss 上限亦為 60」；§ 百柱塔「樓層王等級 80／100F 王 90」改為「52~60 依樓層遞增」。`27-drop-table.md` 百柱死神標題 Lv.90→60 |
| P6-02 | ✅ 已修補（程式＋文件） | `drops.ts` 新增 `pickEquipmentCategory`：`equipmentPool: 'all'` 改為先 1/2 抽武器或防具、再於該類別內均勻抽（單邊為空時退回另一邊）。§ 27.1 補「裝備掉落的抽取流程」說明；§ 27.3 各區的武器／防具兩列合併為一列（29 組） |
| P6-03 | ✅ 已修補（程式＋文件） | `DropTableEntry` 新增 `dropValueMax`；`drops.ts` 新增 `scaleDropValue` 線性內插。23 筆橙色掉落補 `dropValueMax: 100`，實現 § 27.1 的 5~10%。素材列 16 處範圍改回 seed 固定值 |
| P6-04 | ✅ 已釐清（文件） | § 27.1 新增「掉落值的等級縮放」小節，明訂只有橙色藥水與百柱塔卷軸兩類會縮放，並附公式；其餘一律固定值 |
| P6-05 | ✅ 已補（文件） | § 26.2 兩張 Pressure 對照表補上 70~80／80~90／90~100 分鐘三列 |

**新增測試**：`systems/__tests__/dropScaling.test.ts` 13 項 —— 類別抽取的 1/2 機率（含 1000 次抽樣驗證不受兩側數量懸殊影響）、
單邊為空的退回、shop/high 偏斜的迴歸鎖定、等級縮放的上下界與內插、橙色藥水 23 筆全帶 `dropValueMax`。

**驗證**：§ 28 的 199 列素質與 seed 逐欄比對 **0 不符**；`npm run test` 92 檔 1119 項全綠；`npx tsc --noEmit` 無錯誤。

### 平衡影響提醒

P6-02 與 P6-03 會改變實際掉落體感：

- 高階池的防具終於掉得出來（shop/high 原本 94% 掉武器、craft/mid 87%，現在固定 50/50）
- 橙色藥水在區域高等級段的掉率由 5% 提升至最高 10%

---

# 階段 6-1：戰鬥系統

**比對文件**：`03-combat.md`、`21-combat-formula.md`、`41-arpg-combat.md`、`31-battle-script.md`
**比對實作**：`systems/combat.ts`、`systems/playerCombatFSM.ts`、`models/scriptEngine.ts`、`systems/scriptRunner.ts`、`stores/gameStore.ts`

## 6-1.A 已確認相符（✅）

| 設計條目 | 文件 | 結果 |
|---|---|---|
| 全程 floor 取整 | 21.1 | 一致 |
| HP/MP 初始 30/10、成長 `random(屬性-6, 屬性-3)`、升級回滿 | 21.2 | 與階段 1 修補後一致 |
| 近戰／遠程攻擊力：`floor(基礎 × (1+攻擊力%) × (1+普攻元素傷害%))` | 21.3 | `combat.ts:413,420` |
| 無屬性武器不吃普攻元素詞綴（火矢附魔時視為火屬性） | 21.3 | `hasElement` 判斷 |
| 遠程攻擊加成僅裝備弓時生效 | 21.3 | `getRangedAttackBonus` |
| 魔法攻擊力含裝備魔攻 | 21.4 | 階段 2-2 已補 |
| 防禦減傷上限 75%、buff 減傷類間乘算 | 21.5 | `combat.ts:726-733` |
| 傷害結算順序（無敵→迴避→防禦→buff減傷→格擋→護盾） | 21.5 | 逐步一致 |
| 防禦溢出轉迴避 `floor((防禦-75)/5)` | 21.5 | `combat.ts:668` |
| 迴避 = 基礎(5／盜賊10) + AGI/3 + 溢出，上限 35% | 21.6 | `combat.ts:665-707` |
| 命中 = 80 + AGI/3 + 攻擊成功 + 等級差 − 迴避，限 5~95% | 21.7 | `combat.ts:358-365` |
| 爆擊：基礎 5%、上限 75%、倍率 2.0 + 爆傷% | 21.8 | `combat.ts:423-424` |
| 格擋：上限 50%、傷害減半、在防禦減傷之後 | 21.9 | `combat.ts:302,736-740` |
| **武器材質種族克制表 4 列** | 21.13 | 銀→不死/惡魔 1~4、米索利→不死 1~6、奧里哈魯根→不死 1~10、龍→龍 1~6 **全對** |
| 元素克制 +3 | 21.15 | 階段 3 已驗 |
| 戰鬥腳本條件 7 種、動作 3 種（含「不動作」） | 3.12 | `CombatConditionType` / `CombatActionType` 完全一致 |
| 戰鬥腳本預設 2 條（風刃 → 普攻） | 3.12 | `DEFAULT_COMBAT_SCRIPT` |
| 常駐腳本 300ms 判定 | 3.13 / 31.6 | `startPersistentLoop` 的 `setInterval(…, 300)` |
| 常駐腳本條件（含 buff 未激活、狀態異常）與動作（藥水/buff技能/治癒技能/解除道具） | 3.13 | `PersistentConditionType` / `PersistentActionType` 一致 |
| 常駐腳本預設 1 條（HP<30% → 紅色藥水） | 3.13 | `DEFAULT_PERSISTENT_SCRIPT` |
| 緊急撤退：預設啟用、HP 15%、回城 | 3.13 | `DEFAULT_EMERGENCY_RETREAT` |
| 藥水冷卻 600／900／1500ms、全域共用 | 31.6 | `POTION_CONFIG` |
| 攻擊節奏 base 1200ms；近戰 1.5 格、弓 15 格 | 41 § 2, 3.1 | `BASE_ATTACK_INTERVAL_MS`、`playerCombatFSM.ts:37-39` |

## 6-1.B 落差清單

### P7-01 ⚡ `31-battle-script.md` 整份是舊的單一腳本設計，與 `03-combat.md` 及實作牴觸

`99-ai-constraints.md` 第 19 條明訂「自動行為分為兩套腳本：戰鬥腳本與常駐腳本」。
`03-combat.md` § 3.12／§ 3.13 依此分成兩套，**與實作完全一致**；`31-battle-script.md` 則停留在合併版：

| 項目 | `31-battle-script.md` | `03-combat.md` § 3.12 | 實作 |
|---|---|---|---|
| 戰鬥腳本條件數 | **9 種**（含 HP 低於／高於） | 7 種 | `CombatConditionType` **7 種** ✅ 03 |
| 戰鬥腳本動作數 | 2 種（普攻、技能） | 3 種（＋不動作） | `CombatActionType` **3 種**（含 `wait`）✅ 03 |
| 預設腳本 | **3 條**，第 1 條為「HP<30% → 紅色藥水」 | 2 條 | `DEFAULT_COMBAT_SCRIPT` **2 條** ✅ 03 |
| 喝水歸屬 | § 31.6 說獨立判定，但 § 31.8 又列進預設腳本 | 明確歸常駐腳本 | `DEFAULT_PERSISTENT_SCRIPT` ✅ 03 |

31 與 03 § 3.12/3.13 的內容大量重疊且互相矛盾。**建議**：31 精簡為指向 03 的索引頁，
或整份併入 03 後刪除（同階段 2-1 對 `33-class-weapon-cp.md` 的處理）。

---

### P7-04 ⚡ § 21.13 / § 21.15 說克制加成「加算至減傷後」，實作加在基礎攻擊力

文件自相矛盾：

| 位置 | 說法 |
|---|---|
| § 21.13 開頭 | 「武器材質對特定種族怪物造成額外傷害（**加算至減傷後的傷害上**）」 |
| § 21.15 開頭 | 「武器/技能的元素屬性…造成額外固定傷害（**加算至減傷後的傷害上**）」 |
| § 21.11 步驟 1 | 「基礎攻擊力 = 武器基傷 + 額外攻擊 + STR加成 + **材質種族克制 + 元素克制**」 |

實作 `combat.ts:410` 依 § 21.11，把兩者加進基礎攻擊力，之後才乘詞綴、扣防禦。

**影響不小**：加在基礎會被防禦減傷削弱 —— 打 75% 減傷的高防怪時，元素克制的 +3 實際只剩 0.75；
若照 § 21.13/21.15 的括號說明加在減傷後，則是實打實的 +3。兩種寫法在後期差距明顯。

---

### P7-02 📄 § 21.3 的「詞綴與 buff 合流」表少了攻擊力%

表格列出 4 項（爆擊率／爆擊傷害／技能元素傷害／減少冷卻時間）。
階段 3 修補時已把 `attack_power` 加入 `BUFFABLE_AFFIX_STATS`（來源：復仇之刃、背刺的自身 buff），需補第 5 列。

---

### P7-03 📄 虛弱 debuff 在攻擊力公式中的套用位置未定義

- § 21.3 公式 `floor(基礎 × (1+攻擊力%) × (1+普攻元素傷害%))` 完全沒有虛弱
- § 24.4.5 只說「僅影響物理傷害」，沒說在哪一步乘

實作順序為：基礎 → ×(1+攻擊力%) → **虛弱 −20%** → ×(1+普攻元素傷害%)。
因為每步都 floor，順序會實際影響結果，需要寫明。

---

### P7-05 📄 § 3.7「加速只縮短玩家攻擊間隔（×0.75）」與實作的百分比制不符

實作為 `interval = 1200 / (1 + 攻速% / 100)`：

| 來源 | 攻速% | 實際間隔 | 等效倍率 |
|---|---|---|---|
| 加速術 / 綠色藥水 | +33% | 902ms | ×0.75 ✅ |
| 強化加速術 | **+40%** | **857ms** | **×0.71** |

文件寫死 ×0.75，未涵蓋強化加速術。應改為公式表述。

## 6-1.C 階段 6-1 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 22 項（含 21 全部公式、材質克制表、兩套腳本的條件動作與預設值） | 見 6-1.A |
| ⚡ 衝突 | 2 | P7-01、P7-04 |
| 📄 文件缺漏 | 3 | P7-02、P7-03、P7-05 |

**嚴重度排序**：P7-04（克制加成的套用位置影響後期數值）> P7-01（整份文件過時且與 03 重複）
> P7-02 / P7-03 / P7-05（補述）。

## 6-1.D 階段 6-1 處理結果

**使用者決策**：P7-01 刪除舊文件；其餘依實作；虛弱套用於**最終傷害**。

| 編號 | 處理 | 改動 |
|---|---|---|
| P7-01 | ✅ 已刪除 | 移除 `31-battle-script.md`；`INDEX.md` 的「戰鬥腳本」查找列改指向 `03-combat.md` § 3.12／§ 3.13，文件清單移除該列 |
| P7-02 | ✅ 已補（文件） | § 21.3 詞綴與 buff 合流表新增「攻擊力%」列（來源：復仇之刃、背刺） |
| P7-03 | ✅ 已修正（程式＋文件） | `combat.ts` 三處 `applyWeaken` 移到防禦減傷之後；§ 21.3 加註、§ 21.11 普攻流程新增步驟 6、`24-buff-debuff.md` § 24.4.5 新增「虛弱套用位置」列 |
| P7-04 | ✅ 已修正（文件） | § 21.13／§ 21.15 開頭的「加算至減傷後的傷害上」改為「加算至基礎攻擊力／基礎魔攻」，與 § 21.11 步驟 1 及實作一致 |
| P7-05 | ✅ 已修正（文件） | § 3.7 的「×0.75」改為公式 `間隔 = 1200 / (1 + 攻速% / 100)`，並列出 +33%／+40% 的實際值與減速的相加規則 |

**行為變更**：虛弱由「攻擊力%乘算後、元素乘算前」移到「防禦減傷後」。
對高防目標影響最大 —— 過去虛弱扣掉的量會再被防禦削一次，現在扣的是實打實的最終傷害 20%。

**新增測試**：`systems/__tests__/weakenOrder.test.ts` 4 項 —— 普攻虛弱後等於 `floor(原最終傷害 × 0.8)`、
技能不受虛弱影響、高防目標（75% 減傷）下不被二次稀釋、傷害保底 1。

**驗證**：`npm run test` 93 檔 1123 項全綠；`npx tsc --noEmit` 無錯誤。

---

# 階段 6-2：城鎮與周邊

**比對文件**：`13-town.md`、`30-items.md`、`37-statistics.md`、`39-batch-sell.md`、`43-wiki-system.md`、`09-dungeon.md`
**比對實作**：`db/seed/itemSeeds.ts`、`models/statistics.ts`、`models/equipmentTier.ts`、`models/iconMap.ts`、`components/town/*`、`wiki/pages/*`、`components/PixiGame.tsx`、`leaderboard-worker/`

> `38-map-control.md` 的地圖設計規則已於 `99-ai-constraints.md` § 99.3 完整驗證（50 張地圖載入驗證、
> 安全檢查、生成速率全數通過），本輪不重跑，僅確認 catalog 與控制流程未變。

## 6-2.A 已確認相符（✅）

| 設計條目 | 文件 | 結果 |
|---|---|---|
| **道具 108 項的重量／購買價／賣價／冷卻／回復量** | 30.1~30.2 | **0 不符** |
| 藥水冷卻 600／900／1500ms、售價 25／80／200G | 30.2 | 一致 |
| 狀態解除道具 3 種（解毒 50G／止血 50G／淨化 500G） | 30.2 | 一致 |
| 回城卷軸 3 種各 500G、綁定城鎮 | 30.2 / 13.4 | 一致 |
| 強化卷軸 100,000G／50,000G | 30.2 | 一致 |
| 統計欄位 10 項與計數觸發點 | 37.1 / 37.3 | 全部有實作，強化次數含成功與失敗、爆掉次數獨立計數 |
| 排行榜：Worker + D1 + Turnstile、3 個 API 端點、11 欄 schema | 37.4 | `leaderboard-worker/` 一致 |
| 統計中心：排行榜 tab + 我的統計 tab | 37.5 | `StatisticsCenter.tsx` |
| 裝備 7 色分級（色碼與 acquireType/tier 對應條件） | 39.2 | `EQUIPMENT_TIER_COLORS` / `getEquipmentTierLevel` 全對 |
| 素材 iconTier 1~7 色碼（含紫色 #A855F7） | 39.3 | `MATERIAL_TIER_COLORS` 全對 |
| 批量販售在雜貨店／武器店／防具店皆有，starter 裝備不可販售 | 39.4 | `isStarterGear` 過濾 |
| 三城鎮、九項設施 | 13.2 / 13.3 | 一致 |
| 雜貨店商品清單（含磨刀石 200G） | 13.4 | 品項與價格全對 |
| 死亡處理：傳送最近城鎮、HP 50%、MP 不恢復、無金幣/經驗懲罰、停留城鎮 | 13.8 | `PixiGame.tsx:722-752`；`areaEnteredAt` 重置使 Pressure 歸零 |
| 新手裝備 19 件數值 | 13.11 | 階段 2-1 已驗，全對 |
| Wiki 15 個頁面 | 43 § 2 | `wiki/pages/` 檔案全部存在 |
| 六大區域結構 | 9.2~9.8 | `ZONES` 6 個 / `REGIONS` 30 個，分區一致 |

## 6-2.B 落差清單

### P8-01 ❌ 壞刀機制完全未實作，但磨刀石買得到

`06-equipment.md` § 壞刀機制定義完整：

| 損壞層數 | 攻擊力減少 | 累計 |
|---|---|---|
| 1~5 層 | 每層 -20% | 最高 -100% |

- 「武器在攻擊**硬皮怪**時有機率損壞」
- 「透過雜貨商人購買磨刀石修復，每次修復 1 層」
- 12 份武器文件都有「壞刀」欄，`equipmentSeeds.ts` 有 `canBreak` 欄位

**實作現況**：

| 項目 | 狀態 |
|---|---|
| `canBreak` 欄位 | 只用於 `TownBlacksmith.tsx:570` 顯示「會壞刀／不壞刀」文字 |
| 損壞層數 | **無此欄位** |
| 硬皮怪 | 全專案搜不到「硬皮」，怪物無此屬性 |
| 攻擊力衰減 | `combat.ts` 完全沒有相關計算 |
| 磨刀石 | 雜貨店可買（200G），但 `gameStore` 只有 `usePotion` / `useTownScroll` / `useCureItem` 三種使用路徑，**磨刀石無法使用** |

**後果**：玩家花 200G 買到一個永遠用不了的道具，且武器表的「壞刀」欄完全沒有意義。

---

### P8-02 📄 `ExpTablePage.tsx` 自行複製經驗公式，違反 § 43 的「不存在複製資料」

`43-wiki-system.md` § 3 資料來源表寫：

| Wiki 頁面 | 資料來源 |
|---|---|
| 經驗表 | `EXP_TABLE`（`models/expTable`） |

**`models/expTable` 不存在**。`wiki/pages/ExpTablePage.tsx:4-6` 自己複製了一份：

```ts
function getExpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}
```

與 `systems/levelUp.ts:11` 重複定義。而 § 43 § 5 明寫「Wiki 頁面直接 import seed 常數與 model 定義，
**不存在複製資料**的問題」。

**風險**：階段 1 的 P1-02 才剛把這條公式正式寫進 `04-character.md` § 4.9；
若日後調整經驗曲線，wiki 會顯示舊值而沒有任何警示。

---

### P8-03 ⚡ 魔法書材料命名不一致：「高階」vs「高級」

| 來源 | 用詞 |
|---|---|
| `itemSeeds.ts`（id 130） | 魔法書材料（**高階**） |
| `22-basic-magic.md` § 22.2 配方表 | **高階**魔法書、魔法書材料（**高階**） |
| `16-tech-frontend-architecture.md` | **高階**魔法書、魔法書材料（**高階**） |
| `MagicAcademy.tsx` `SPELLBOOK_RECIPES` | **高階**魔法書、魔法書材料（**高階**） |
| `27-drop-table.md`:246 | 魔法書材料（**高級**） |
| `30-items.md`:296, 312 | **高級**魔法書、魔法書材料（**高級**） |

掉落走 `itemTemplateId` 所以目前不會出錯，但兩份文件與實作用詞不同，查表時會找不到。

---

### P8-04 📄 § 37.2 的 `CharacterStatistics` 介面多了 `contribution`

文件 § 37.2 的 TypeScript 介面列 11 個欄位（含 `contribution: number`），
實作 `models/statistics.ts` 只有 **10 個**。

貢獻度實際存在 `guildProgress.points`，上傳排行榜時才於 `StatisticsCenter.tsx:78` 組進去。
§ 37.1 的欄位表與 § 37.4.2 的 D1 schema 都沒問題，只有 § 37.2 的介面定義對不上。

---

### P8-05 📄 死亡復活的 HP 以基礎 `maxHp` 計算，未計裝備加成

`PixiGame.tsx:731`：

```ts
hp: Math.floor(char.maxHp * 0.5),
```

用的是角色基礎 `maxHp`，而非 `getEffectiveMaxHp()`（含裝備 `bonusHp` 與「最大HP%」詞綴）。
穿戴 +HP 裝備的角色復活後，HP 會低於有效最大值的 50%。

§ 13.8 只寫「HP 恢復至 50%」，沒有定義基準是哪一個。

---

### P8-06 📄 `30-items.md` 未涵蓋 38 項道具

| 類別 | 數量 | 內容 |
|---|---|---|
| spellbook | 26 | 高階魔法書 + 25 本職業技能書 |
| dungeon | 9 | 百柱塔 11F~91F 通行卷軸 |
| material | 3 | 試煉飛龍之鱗、任務素材、魔法書材料（高階） |

這些道具的重量與售價目前只存在於 seed。技能書的取得方式在 `23-class-magic.md` 有寫，
但作為「道具」的重量/售價沒有任何文件記載。

## 6-2.C 階段 6-2 統計

| 標記 | 數量 | 編號 |
|---|---|---|
| ✅ 相符 | 16 項（含 108 項道具數值、統計 10 欄、7 色分級、死亡處理） | 見 6-2.A |
| ❌ 未實作 | 1 | P8-01 |
| ⚡ 衝突 | 1 | P8-03 |
| 📄 文件缺漏 | 4 | P8-02、P8-04、P8-05、P8-06 |

**嚴重度排序**：P8-01（整套機制缺失，且賣出無法使用的道具）> P8-02（wiki 會顯示過時公式）
> P8-03（命名不一致）> P8-05 / P8-04 / P8-06（補述）。

## 6-2.D 階段 6-2 處理結果

**使用者決策**：P8-01 壞刀機制暫不實作（僅標註）；P8-03 命名統一為「高階」；其餘全部補齊。

| 編號 | 處理 | 改動 |
|---|---|---|
| P8-01 | ✅ 已處理（程式＋文件） | 壞刀機制依決定暫不實作，但**磨刀石已自雜貨店下架**（`GeneralStore.tsx` 移除商品列，道具定義保留於 `itemSeeds.ts` 供未來上架）。`06-equipment.md` 標題改為「壞刀機制（暫不實作）」並加註現況；武器屬性表的「是否會壞刀」列加註；`13-town.md` 商品清單移除該列並加說明；`30-items.md` 取得方式改為「暫無取得管道」；`16-tech-frontend-architecture.md` 的 `GeneralStore` 說明同步 |
| P8-02 | ✅ 已修補（程式＋文件） | `ExpTablePage.tsx` 移除自行複製的 `getExpToNextLevel`，改 import `systems/levelUp`；`43-wiki-system.md` § 3 的資料來源由不存在的 `EXP_TABLE`（`models/expTable`）改為 `getExpToNextLevel()`（`systems/levelUp`），並指向 `04-character.md` § 4.9 |
| P8-03 | ✅ 已修補（文件） | `27-drop-table.md`、`30-items.md` 的「魔法書材料（高級）」「高級魔法書」全部改為「高階」。Wiki 直接讀 `ITEM_DEFINITIONS`，顯示本來就是「高階」，無須改動 |
| P8-04 | ✅ 已修補（文件） | `37-statistics.md` § 37.2 介面移除 `contribution`，並加註其實際存於 `guildProgress.points`、上傳排行榜時才合併 |
| P8-05 | ✅ 已修補（程式＋文件） | `PixiGame.tsx` 死亡復活改用 `getEffectiveMaxHp`（原本用基礎 `maxHp`）；`13-town.md` § 13.8 明訂「HP 恢復至**有效最大 HP** 的 50%」 |
| P8-06 | ✅ 已修補（文件） | `30-items.md` 新增 § 30.5 職業技能書（25 本）、§ 30.6 副本通行卷軸（9 張）、§ 30.7 其他素材（2 項），共補 36 列 |
| 追加 | ✅ 已修正（文件） | `30-items.md` 原本的章節編號與文件順序不符（30.4 排在 30.3 前面），對調為 30.3 魔法書製作配方／30.4 綠色藥水，並更新 `03-combat.md` 的兩處交叉引用 |

**驗證**：`itemSeeds.ts` 的 146 項道具**全數列入文件**（原本漏 38 項）；
全專案已無「高級魔法書／魔法書材料（高級）」殘留；
`npm run test` 93 檔 1123 項全綠；`npx tsc --noEmit` 無錯誤。

**行為變更**：死亡復活的 HP 由「基礎 maxHp × 50%」改為「有效最大 HP × 50%」，
穿戴 +HP 裝備或「最大HP%」詞綴的角色復活時會回得比以前多。

---

# 稽核總結

八個階段全部完成，共處理 **62 項落差**。

| 階段 | 範圍 | 落差數 | 主要成果 |
|---|---|---|---|
| 1 | 角色 Status / 屬性 | 12 | 補上無文件的經驗曲線公式；修正屬性全滿仍發配點 |
| 2-1 | 武器 | 4 類（66 把武器） | 定位到「武器 nerf 只改文件未改實作」；12 份武器文件依 seed 回寫；刪除過時的 `33-class-weapon-cp.md` |
| 2-2 | 防具 / 詞綴 / 品質 | 9 | 補上武器強化基傷（強化系統的首要效果原本完全沒實作）、魔導書魔攻、安定值 0 的成功率 bug |
| 3 | 技能 | 16 | 重新設計復仇之刃／背刺為 buff 形式；補極冰封印 debuff、神聖領域免疫；AOE 欄位依 41 重構 |
| 4 | Quest | 5 | 移除無依據的 US ×10 倍率；怪物池改為記載推導規則 |
| 5 | 怪物 / 掉落 / Spawn | 5（含 103 列） | `28-monster-stats.md` 依 seed 全文重寫；裝備掉落改 1/2 抽類別；橙色藥水實現 5~10% |
| 6-1 | 戰鬥系統 | 5 | 虛弱改為作用於最終傷害；刪除過時的 `31-battle-script.md` |
| 6-2 | 城鎮與周邊 | 6 | 補齊 38 項未列道具；統一魔法書材料命名；修正 Wiki 複製公式 |

**刪除的過時文件**：`33-class-weapon-cp.md`、`31-battle-script.md`
**依實作重寫的文件**：`28-monster-stats.md`、12 份 `06-equipment-weapons-*.md`
**測試**：1,065 → **1,123** 項（新增 58 項迴歸與規格測試）

## 仍待決定的項目

| 編號 | 項目 | 狀態 |
|---|---|---|
| P1-10 | SPI → 魔法抗性 | ✅ **已實作**（見下方「怪物魔法攻擊」） |
| P1-11 | CHA → 寵物攜帶數量 | 寵物系統本身標「待定」，維持現狀 |
| P8-01 | 壞刀機制 | 已標「暫不實作」，磨刀石已下架。未來啟用時需一併恢復商店上架與使用流程 |

---

# 追加：怪物魔法攻擊與魔法抗性（解除 P1-10）

**使用者決策**：巫師／魔導系 6 種改為遠程魔法；裝備防禦對魔法的減傷貢獻上限 50%，其餘靠魔抗補；
迴避與格擋皆生效；射程 8 格。

## 實作內容

| 項目 | 改動 |
|---|---|
| 型別 | `MonsterAttackType` 新增 `'magic'`；新增 `isRangedAttackType()`，`monsterCombatFSM`／`arpgEngine`／`PixiGame` 的 5 處 `=== 'ranged'` 全部改用此 helper，避免新型別漏接投射物與視線判定 |
| 魔法抗性 | `models/character.ts` 新增 `getMagicResist(spi) = floor(有效SPI / 2)` |
| 減傷 | `combat.ts` `calculateMonsterAttack` 依 `attackType === 'magic'` 分流：<br>`min( min(最終防禦, 50) + 魔抗, 75 )`；物理維持 `min(最終防禦, 75)`<br>新增常數 `DAMAGE_REDUCTION_CAP = 75`、`MAGIC_DEFENSE_CONTRIBUTION_CAP = 50` |
| 怪物資料 | `monsterSeeds.ts` 9 筆（6 種怪物 × 各樓層）補 `attackType: 'magic'`、`attackRange: 8` |
| UI | `CharacterStats` 新增「魔法減傷率」與「魔法抗性」兩列 |

**文件**：`20-attributes.md` § 20.3 解除「待實作」；`21-combat-formula.md` 新增 § 21.16 並更新 § 21.9 備註；
`25-monster-system.md` § 25.8 新增「攻擊型別」小節；`26-spawn-pressure.md`／`38-map-control.md`／
`99-ai-constraints.md` § 99.3 決策 6 的「所有怪物皆為近戰」敘述全部更新。

**新增測試**：`systems/__tests__/monsterMagicAttack.test.ts` 12 項 —— 魔抗公式（含奇數 SPI 與 0 值邊界）、
物理不吃魔抗、裝備 50% 上限、低防禦全額計入、總上限 75%、魔抗 0 時魔法比物理更痛、seed 名單與射程、
元素系未被誤標、`isRangedAttackType` 覆蓋。

## 驗證方式的更正

本次發現先前所有「`npx tsc --noEmit` 無錯誤」的回報**都是無效的**：
根 `tsconfig.json` 是 `{"files": [], "references": [...]}`，`tsc --noEmit` 實際上不檢查任何檔案。
真正的型別檢查是 **`tsc -b`**（`npm run build` 使用的指令）。

已改用 `npx tsc -b --force` 並實測它確實會抓錯（故意移除一個 import 可重現 TS2552）。
現況：**`tsc -b --force` 通過、`npm run test` 94 檔 1135 項全綠**。

---

# 追加：魔法抗性的裝備來源（詞綴 + 飾品強化）

承前一節「怪物魔法攻擊」，魔抗原本只有 SPI 一個來源。本次補上兩個裝備管道，
並讓魔抗同時降低部分 debuff 的施加機率。

## 使用者決策

| 項目 | 決定 |
|---|---|
| 魔抗詞綴部位 | **限定項鍊／戒指／盾牌**（與「格擋率＝盾牌專屬」同模式） |
| 魔抗詞綴階級 | 專屬階級表，不用通用區間（數值後續調整為區間制，現況以 `07-affix.md` § 7.3.1 為準） |
| 飾品強化 | 項鍊／戒指安定值 `-1` → `0`；每 +1 給魔抗 2%；+4 起數值 ×1.1~×1.5 |
| 倍率作用欄位 | `bonusHp` / `bonusMp` / `hpRegen` / `mpRegen`（**不含額外屬性**） |
| 基礎魔抗 | 不給，魔抗只來自 SPI／飾品強化／詞綴 |
| debuff 抵抗 | 僅 **詛咒／虛弱／減速**；命中後以 `min(魔抗,100)%` 判定；0% 必中、100% 免疫 |

## 實作內容

| 項目 | 改動 |
|---|---|
| 詞綴分類 | `AffixCategory` 新增 `'accessory'`（飾品的 `type` 與一般防具同為 `'armor'`，無法只靠 type 區分）。7 種防具詞綴與 6 種免疫詞綴一併加入 `accessory`，維持飾品原有的詞綴池 |
| 新詞綴 | `magic_resist`，分類 `['accessory','shield']` |
| 專屬階級表 | `AFFIX_TIER_OVERRIDES` + `getAffixTierTable()`；`rollAffixValue(tier, type)` 依類型查表 |
| 分類決定 | 新增 `getAffixCategoryForSlot()`，`drops.ts` 三處與 `TownBlacksmith` 一處改用它（原本各自寫死三元式） |
| 飾品可強化 | `equipmentSeeds.ts` 項鍊 10 + 戒指 10 的 `stability` 改為 `0`；腰帶 7 件維持 `-1` |
| 強化效果 | `systems/enhancement.ts` 新增 `getAccessoryMagicResist()` / `getAccessoryStatMultiplier()`；於 `resolveEquipment()` 統一套用倍率，避免各消費端各算一份 |
| 魔抗彙總 | `combat.ts` 新增 `getGearMagicResist()` / `getTotalMagicResist()`，魔法減傷改用「SPI + 裝備」合計 |
| debuff 抵抗 | `rollMonsterDebuff()` 新增 `magicResist` 參數與第二段 roll；回傳新增 `resisted` 旗標，戰鬥日誌顯示「魔法抗性擋下了…」 |
| UI | `CharacterStats` 的「魔法抗性」改為顯示 SPI + 裝備的合計百分比 |

**文件**：`07-affix.md`（§ 7.3.1 專屬階級表、飾品／盾牌專屬詞綴、§ 7.5 總數 15→16、§ 7.6 部位表補「飾品額外可插入」、
特殊詞綴適用部位）、`06-equipment.md`（§ 6.8 安定值 `-1` 定義修正、新增 § 6.10.1 飾品強化）、
`21-combat-formula.md` § 21.16（魔抗三來源表）、`24-buff-debuff.md` § 24.4.2（兩段式判定與免疫詞綴的差異）、
`20-attributes.md` § 20.3（指向其他兩個來源）。

**新增測試**：`systems/__tests__/magicResistGear.test.ts` 20 項 —— 詞綴分類與各部位詞綴數（飾品 8／防具 7／盾牌 9）、
專屬階級表、飾品安定值（20 件為 0、腰帶仍為 -1）、倍率邊界（+3 無倍率／+4 ×1.1／+8 封頂）、
魔抗彙總與品質放大、非飾品強化不給魔抗、100% 免疫仍消耗判定、中毒不受魔抗影響。

**同步修正的既有測試**：`affix.test.ts`（盾牌詞綴池 8→9）、`specialAffix.test.ts`（免疫詞綴分類加入 `accessory`）。

**驗證**：`npm run test` 95 檔 **1155 項**全綠；`npx tsc -b --force` 無錯誤。

## 後續調整：裝備防禦對魔法只有一半效力

原公式 `min( min(最終防禦, 50) + 魔抗, 75 )` 讓高防角色幾乎不需要魔抗（防禦 50 + SPI 17 就有 67），
魔抗變成布甲職業的專屬需求。依使用者決定改為：

```
裝備貢獻   = min(最終防禦值, 75) × 0.5      （上限 37.5%，即物理上限的一半）
魔法減傷率 = min( 裝備貢獻 + 魔法抗性, 75 )
```

`37.5` 不是獨立的魔術數字，而是 `DAMAGE_REDUCTION_CAP × MAGIC_DEFENSE_EFFECTIVENESS`，
實作以 `getMagicDefenseContribution()` 表達，面板與戰鬥共用同一函式。

**效果**：即使防禦堆到上限，魔法減傷也只有 37.5%，**所有職業都有 37.5% 的缺口要靠魔抗填**。

| 角色 | 最終防禦 | 裝備貢獻 | SPI 魔抗 | 距 75% 的缺口 |
|---|---|---|---|---|
| 後期騎士（SPI 10） | 75 | 37.5 | 5 | **32.5** |
| 後期騎士（SPI 35） | 75 | 37.5 | 17 | **20.5** |
| 後期元素師（布甲） | 20 | 10 | 17 | **48** |

同攻擊力下，魔法怪造成的傷害約為物理怪的 **1.5 倍**（防禦 60 時：魔法 61 / 物理 40）。

## 平衡備註

- 魔抗理論上限很高（4 件 T7 詞綴 + 品質 ≈ 96%），但 T7 為 Boss 限定掉落、且要同時集齊四件，實務極難
- 飾品強化到 +4 的累計成功率 6.25%、到 +8 約 0.0074%，且失敗即消失
- 改為半效力後，魔抗從「布甲專屬」變成**全職業必需**，三個來源都有存在意義
