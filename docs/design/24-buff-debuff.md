# 24. Buff/Debuff 系統

> 本文件定義角色 buff 與怪物 debuff 的統一狀態效果系統，涵蓋持續時間、疊加規則、控場機制與 UI 顯示。

---

## 24.1 系統概述

角色和怪物共用同一套效果（Effect）架構。效果分為：

| 分類 | 目標 | 範例 |
|------|------|------|
| Buff | 角色 | 精準射擊（命中+3）、火矢附魔（火傷害+15）、鋼鐵護盾（減傷20%） |
| Debuff | 怪物 | 暈眩（停止攻擊）、流血（DoT）、毒（DoT） |

---

## 24.2 效果資料結構

```typescript
interface ActiveEffect {
  id: string;              // 效果實例 ID（UUID）
  sourceSkillId: string;   // 來源技能 ID（用於互蓋判定）
  category: string;        // 分組 key（同 category 互蓋）
  type: 'buff' | 'debuff';
  target: 'player' | 'monster';

  // 效果內容（以下至少一項）
  modifiers?: StatModifier[];    // 數值修正
  dot?: DotEffect;               // 持續傷害
  stun?: boolean;                // 控場（暫停攻擊）
  special?: string;              // 特殊效果 key

  // 時間
  startTime: number;       // 生效時間戳（ms）
  duration: number;        // 持續時間（ms）

  // 觸發條件標記
  tags: string[];          // e.g. ['stunned', 'bleeding', 'poisoned']
}

interface StatModifier {
  stat: string;            // 'hit' | 'defense' | 'attack' | 'critRate' | 'critDmg' | 'evasion' | 'damageReduction' ...
  value: number;           // 數值
  isPercent: boolean;      // true = 百分比加成, false = 固定值
}

interface DotEffect {
  damage: number;          // 每次傷害
  element: ElementType;    // 傷害屬性
  interval: number;        // 傷害間隔（ms），通常 1000
  totalDuration: number;   // DoT 總持續時間（ms）
}
```

---

## 24.3 疊加與互蓋規則

### 24.3.1 Buff（同 category 互蓋）

同一個 `category` 的 buff，後施放的覆蓋前者（刷新持續時間與效果數值）。

**Category 分組範例：**

| category | 包含技能 |
|----------|----------|
| `accuracy` | 精準射擊、鷹眼、精準打擊 |
| `fire-enchant` | 火矢附魔 |
| `defense-buff` | 鋼鐵護盾、魔法盔甲 |
| `speed` | 綠色藥水、強化綠色藥水、加速術、強化加速術加速(加速相關互斥) |
| `sanctuary` | 聖域、神聖領域（同類互蓋，後施放覆蓋前者） |
| `crit-buff` | 致命一擊 |
| `cd-reduction` | 冷卻縮減 |
| `element-boost` | 元素增幅 |
| `chain-cast` | 連鎖詠唱 |
| `holy-shield` | 聖光護盾 |
| `evasion` | 煙霧彈 |
| `poison-enchant` | 淬毒 |
| `atk-debuff` | 挑釁怒吼（怪物攻擊力 -20%） |

### 24.3.2 DoT（獨立計時，不可刷新）

- **流血**：效果存續期間不可重新施加。流血結束後才能再上流血。
- **毒**：效果存續期間不可重新施加。毒結束後才能再上毒。
- 不同類型的 DoT 可以同時存在（流血 + 毒 同時生效）。

### 24.3.3 控場（暈眩）

- 暈眩期間不可重複暈眩（效果未結束前不可刷新）。
- Boss 特殊規則見 § 24.5。

---

## 24.4 控場機制

### 24.4.1 暈眩效果

暈眩生效時：
1. **暫停怪物攻擊計時器** — 怪物在暈眩期間不會攻擊玩家
2. **標記 tag `stunned`** — 其他技能可判定「對暈眩目標額外效果」

### 24.4.2 觸發條件系統

技能可定義觸發條件，根據目標身上的 tags 給予額外效果：

```
例：「對暈眩目標傷害 +50%」→ 檢查目標 tags 包含 'stunned'
例：「對流血目標爆擊率 +20%」→ 檢查目標 tags 包含 'bleeding'
```

---

## 24.5 Boss 控場免疫

| 規則 | 說明 |
|------|------|
| Boss 可被控場 | 暈眩等控場效果對 Boss 正常生效 |
| 免疫冷卻 | 被控場後，30 秒內免疫任何控場效果 |
| 小怪 | 無免疫機制，控場正常生效 |

判定流程：
1. 對 Boss 施放控場技能
2. 檢查 `ccImmuneUntil` 是否 > 當前時間
3. 若免疫中 → 控場不生效（傷害照常計算）
4. 若非免疫 → 控場生效，並設定 `ccImmuneUntil = 當前時間 + 30000`

---

## 24.6 戰鬥迴圈整合

每個戰鬥 tick 的處理順序：

1. **清除過期效果** — 移除 `startTime + duration < now` 的效果
2. **計算 DoT 傷害** — 對有 dot 效果的目標結算傷害
3. **玩家行動** — 正常攻擊/技能判定
4. **怪物行動前檢查** — 若怪物身上有 `stun: true` 的效果 → 跳過攻擊
5. **怪物攻擊** — 無控場則正常攻擊

---

## 24.7 UI 顯示

### 24.7.1 角色 Buff 顯示

- **位置**：左側面板 `StatusPanel`（HP/MP/EXP bar）正下方，`LeftPanelTabs` 之上
- **組件**：`<BuffBar>`
- **顯示方式**：水平 icon bar（單排）
  - 每個 buff 以 32×32 icon 呈現
  - icon 右下角覆蓋剩餘秒數（≥60s 顯示 `M:SS` 格式，<60s 顯示秒數）
  - 同時顯示上限 8 個，超過顯示 `+N` 提示
  - 剩餘 <5 秒時 icon 閃爍（CSS `blink` animation）
- **Tooltip**：hover icon 顯示浮動面板
  - 效果名稱
  - 效果描述（數值修正、DoT 傷害等）
  - 剩餘時間（精確到秒）
  - 來源技能名稱
- **計時方式**：時間戳制
  - 效果存儲 `startTime`（生效時間戳 ms）+ `duration`（持續時間 ms）
  - UI 層 `<BuffBar>` 內部以 `setInterval(1000)` 每秒刷新剩餘時間顯示
  - 過期清除由戰鬥 tick 負責（§ 24.6 步驟 1），UI 不做清除

### 24.7.2 怪物 Debuff 顯示

- **位置**：`BattleView` 內 monster-card 血量條下方
- **顯示方式**：小 icon 列（24×24）
- 每個 debuff 顯示：
  - 效果 icon（暈眩=星星、流血=紅滴、毒=綠骷髏）
  - 剩餘秒數
- **Tooltip**：同角色 buff，hover 顯示效果細節

### 24.7.3 Icon 資源

- **主力素材**：[Game-icons.net](https://game-icons.net)（CC BY 3.0，4180+ 遊戲專用 SVG）
- **UI 補充**：Lucide Icons（ISC License，通用 UI icon）
- **整合方式**：下載 SVG 至 `client/src/assets/icons/`，透過 `<GameIcon>` 統一元件渲染
- **顏色控制**：SVG fill 以 CSS currentColor 驅動，適配 dark fantasy 主題

### 24.7.4 戰鬥日誌整合

- buff 施加時：`「施放 精準射擊（命中+3, 300s）」`
- debuff 施加時：`「盾擊命中！目標暈眩 2s」`
- debuff 被免疫時：`「目標免疫控場！」`
- DoT 傷害時：`「流血傷害 10」`（不需每秒都顯示，可改為首次 + 結束提示）

---

## 24.8 效果上限

- 目前無上限，角色和怪物身上可同時存在任意數量的 buff/debuff。
- 未來若有效能問題再考慮設上限。

---

## 24.9 擴充預留

以下機制目前不實作，但架構需支援未來擴充：

- **驅散/淨化**：移除目標身上特定 buff/debuff
- **免疫負面狀態**：神聖領域（牧師 5 級技能）免疫負面狀態
- **嘲諷**：改變怪物攻擊目標（多人場景），單人場景下為「確保怪物攻擊自己」
- **護盾吸收**：聖光護盾的「吸收 100 傷害」機制
