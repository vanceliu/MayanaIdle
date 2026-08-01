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
| 2 | 裝備 / 武器 | 06 系列, 07, 08, 33, 35 | 待執行 |
| 3 | 技能實作 | 05, 22, 23, 24, 42 | 待執行 |
| 4 | Quest | 36 | 待執行 |
| 5 | 怪物 / 掉落 / Spawn | 25, 26, 27, 28 | 待執行 |
| 6 | 其他設計 | 03, 21, 41, 31, 38, 13, 30, 39, 37, 43, 09 | 待執行 |

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
