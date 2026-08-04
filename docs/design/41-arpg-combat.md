# 41 - ARPG 戰鬥系統架構

## 1. 概述

戰鬥系統為「地圖上即時 ARPG 戰鬥」，角色與怪物在同一張地圖上進行即時攻擊與移動，無場景切換。

核心架構：
- 戰鬥直接在探索地圖上發生，不存在獨立的 `phase: 'combat'` 場景
- 角色和怪物在地圖上有實際的攻擊動作和位移
- 攻擊分為近戰/遠程兩種類型，由武器決定基礎射程
- AOE 技能可同時命中範圍內多隻怪（自身中心/目標中心兩種模式）
- 自動模式下由戰鬥腳本（scriptRunner）決定目標與技能
- 玩家的**追擊距離**與**出手判定**是兩個不同的數字（見 § 3.1）

## 2. 設計原則

- **combat.ts 計算邏輯不變**：命中/暴擊/傷害/閃避公式完全保留
- **攻擊節奏不變**：base 1200ms，受攻速詞綴/綠色藥水/加速術影響
- **腳本系統保留**：scriptRunner 依然決定施放技能/攻擊方式
- **視線判定**：攻擊目標和角色之間不能有牆壁阻擋
- **自動為主**：Idle 自動是核心體驗，手動模式為未來擴充

## 3. 攻擊系統

### 3.1 攻擊類型

| 類型 | 距離 | 行為 |
|------|------|------|
| 近戰 | 1.5 格內 | 角色走到目標旁邊才能攻擊 |
| 遠程 | 由技能 `range` 欄位決定 | 只要視線無阻擋即可攻擊，產生投射物 |
| 自身 | 0（對自己） | 治癒/Buff 類技能，無需目標距離判定 |

**射程規則：**
- 普通攻擊射程由武器決定，**本節為唯一權威定義**（`03-combat.md` 引用此處，不重複寫數值）：

| 武器類型 | 射程 | 說明 |
|---|---|---|
| `bow` | 15 格 | 14 種武器裡**唯一**的遠程武器 |
| 其餘 13 種（含 `staff`／`magicBook`） | 1.5 格 | 普通攻擊一律貼身；法系輸出靠技能射程，不靠武器 |

實作為 `models/equipment.ts` 的 `WEAPON_RANGE` / `getWeaponRange()` / `isRangedWeapon()`，
戰鬥 FSM 與介面共用同一份常數 —— 放在 model 層而非 FSM，介面才不會自己抄一份 15 出來然後漂移。

**介面只在「不是預設」時標射程**：近戰 1.5 是 13/14 種武器的預設值，
在裝備 tooltip 印「射程: 近身」等於多一行零資訊。故裝備 tooltip 與武器店
**只有遠程武器顯示射程**；Wiki 武器表是拿來比較的，才全部標出（近戰顯示「近身」）。

> 與技能的差異：技能射程無法預期（吸血鬼之吻是攻擊魔法卻只有近身），
> 所以技能一律標；武器則相反，近戰是常識預設。
- 技能射程由每個技能的 `range` 欄位定義
- `range: 0` 表示對自身施放，不需要距離/視線判定

### 射程的顯示

攻擊技能的射程必須在介面上看得到 —— 玩家要能理解「為什麼我的角色站在這個距離」
（追擊距離由腳本會用到的技能射程決定，見下節）。

| 顯示位置 | 呈現 |
|---|---|
| 技能面板 tooltip | 「射程: 12 格」／「射程: 近身」 |
| Wiki 技能表（通用魔法 + 職業技能） | 獨立的「射程」欄 |
| 魔法學院 / 職業工會 | 附在 MP／威力後面 |

規則（`formatSkillRange()`，`models/skill.ts` 為唯一實作）：

- **只有 `type: 'attack'` 顯示**；buff／heal 的 `range: 0` 是「對自己施放」，顯示只會誤導
- `range <= 1.5` 顯示為「近身」，寫「1.5 格」對玩家沒有資訊量
- 用詞固定為**射程**。介面上的「範圍」已經被 AOE 半徑佔用（如「範圍(半徑3格/最多3隻)」），
  兩者不可混用

### 追擊距離 vs 出手判定（兩個數字，不可混用）

| | 取值 | 決定什麼 | 實作 |
|---|---|---|---|
| **追擊距離** `chaseRange` | 腳本**啟用**規則會用到的最遠射程 | 角色走多近就停 | `getScriptChaseRange()` |
| **出手判定** `range` | 當下**選中動作**自己的射程 | 這一擊打不打得到 | `resolveTargets()` 的 `maxRange` |

`getScriptChaseRange()` 的取法：

- 啟用的「普通攻擊」規則 → 計入武器射程
- 啟用的「攻擊技能」規則且該技能已學會 → 計入 `skill.range`
- **停用的規則不計入** —— 玩家關掉普通攻擊就代表不打算貼身，
  武器的 1.5 格不該再把他拖進近身
- buff／heal 技能不計入（`range: 0` 是對自己，不是站位依據）
- 一條啟用的攻擊規則都沒有 → 退回武器射程（沒有別的依據）

> **為什麼必須分開**：`range` 會隨腳本此刻選中哪一招而變動，技能全進冷卻時
> `evaluateCombatScript()` 回 `null`，`range` 就塌回武器射程。若拿它當追擊目標，
> 法杖元素師（武器 melee 1.5、技能 range 12）每個冷卻空檔都會往怪身上蹭，
> 而且 `move_to` 每幀重新尋路，表現為「放完技能後慢慢靠近」。
>
> 反過來也不能只用 `chaseRange` 當出手判定 —— 那會讓普通攻擊從 12 格外打得到。

沒有可執行動作且已在 `chaseRange` 內時，角色**原地待命**（state 維持 `attacking`），
攻擊計時器繼續累積並夾在攻擊間隔上限，冷卻一結束就能立刻出手，
不必再等一個完整攻擊間隔。

### 3.2 攻擊流程

```
腳本決定目標與技能
  ↓
檢查距離 & 視線
  ↓ 不滿足 → 角色移動靠近
  ↓ 滿足 →
播放攻擊動畫（揮砍/施法/射擊）
  ↓
命中判定時刻（動畫中段）：
  - 近戰：直接對目標計算 combat.ts
  - 遠程：產生投射物，投射物抵達時計算
  - AOE：對範圍內所有敵人計算
  ↓
傷害結果 → 更新怪物 HP、顯示傷害數字
  ↓
等待攻擊間隔（cooldown）→ 下一輪腳本決定
```

### 3.3 視線判定（Line of Sight）

- 從角色位置到目標位置畫直線
- 沿直線每 0.5 格檢查是否有牆壁 tile
- 有牆壁 → 視線被阻擋 → 不能攻擊/必須移動
- 演算法：Bresenham line 或 raycast step

### 3.4 AOE 機制

AOE 有兩種中心模式：

1. **目標中心（target）**：以主目標為圓心搜索周圍敵人
2. **自身中心（self）**：以角色自身位置為圓心搜索周圍敵人

```typescript
interface AoeProps {
  aoeCenter: 'target' | 'self'; // AOE 圓心
  aoeRadius: number;            // 搜索半徑（格數）
  maxTargets?: number;          // 最多命中幾隻（僅 target 模式，self 模式無上限）
}
```

**執行流程：**

**target 模式：**
1. 腳本選定主目標
2. 以主目標位置為圓心，搜索 `aoeRadius` 格內所有活著的怪物
3. 依距離排序，取最近的 `maxTargets` 隻（主目標一定包含在內）
4. 對每一隻分別計算 combat.ts

**self 模式：**
1. 以角色當前位置為圓心，搜索 `aoeRadius` 格內所有活著的怪物
2. 對範圍內所有怪物計算 combat.ts（無數量上限）
3. 不需要指定主目標，不需要視線判定

**範例：**

| 技能 | 中心模式 | aoeRadius | maxTargets | 效果 |
|------|----------|-----------|------------|------|
| 火球術 | target | 3 格 | 3 | 打主目標 + 周圍 3 格內最多再打 2 隻 |
| 龍捲風 | target | 4 格 | 6 | 打主目標 + 周圍 4 格內最多再打 5 隻 |
| 冰霜新星 | self | 5 格 | 無上限 | 以自身為中心，範圍內全打 |
| 戰吼 | self | 3 格 | 無上限 | 以自身為中心，範圍內全打 |

**注意：**
- target 模式：主目標一定會被命中（直接包含在 maxTargets 內）
- self 模式：不需要選定主目標即可施放，範圍內來多少打多少
- 額外目標不需要視線判定（已在 AOE 範圍內）
- 每個目標獨立計算傷害（可能有的 miss、有的 crit）

### 3.5 技能分類擴充

每個技能需新增欄位：

```typescript
interface SkillCombatProps {
  range: number;            // 施放距離（格數）。0 = 對自身施放（buff/heal），>0 = 需目標在範圍內
  aoeRadius?: number;       // AOE 搜索半徑（格數），undefined = 單體
  maxTargets?: number;      // AOE 最大目標數（含主目標），undefined = 1
  projectileSpeed?: number; // 投射物速度（格/秒），僅遠程
}
```

普通攻擊的類型由武器決定：
- 劍/斧/錘/匕首/爪/雙刀/杖 → 近戰（range: 1.5）
- 弓 → 遠程（range: 15）

## 4. 角色行為（自動模式）

### 4.1 狀態機

```
┌─────────┐    有目標且距離/視線 OK    ┌──────────┐
│  IDLE   │ ──────────────────────── → │ ATTACKING│
│ (待機)   │ ← ──────────────────────── │  (攻擊)  │
└─────────┘    目標死亡/無目標          └──────────┘
     │                                       │
     │ 有目標但距離/視線不足                    │ CD 中且需移動
     ↓                                       ↓
┌─────────┐                            ┌──────────┐
│ CHASING │ ← ──────────────────────── │  MOVING  │
│ (追蹤)   │    到達攻擊範圍              │  (移動)  │
└─────────┘                            └──────────┘
```

### 4.2 目標選擇（自動模式）

1. 腳本有指定目標 → 使用腳本目標
2. 無指定 → 選擇最近的活著的怪物
3. 無怪物 → 回到 IDLE（繼續自動探索）

### 4.3 自動追蹤移動

- 近戰：尋路到目標相鄰格（距離 ≤ 1.5）
- 遠程：找到距離 ≤ 技能 range 且有視線的位置（優先當前位置）
- 使用現有 A* pathfinding

## 5. 怪物行為

### 5.1 怪物攻擊類型

怪物模板新增欄位：

```typescript
interface MonsterCombatProps {
  attackType: 'melee' | 'ranged' | 'magic';
  attackRange: number;      // melee 1.5、ranged 10、magic 8
  attackInterval: number;   // 攻擊間隔 ms
  projectileSpeed?: number; // 遠程投射物速度
}
```

`ranged`（弓箭手系）與 `magic`（巫師／魔導系）都需通過射程與視線判定並產生投射物
（判定共用 `isRangedAttackType()`），差別只在減傷公式與投射物外型：
`ranged` 走物理減傷、畫白色箭矢；`magic` 走魔法減傷、畫依怪物元素上色的彈丸
（顏色規則見 `42-element-system.md` § 42.4）。
各型別的適用怪物見 `25-monster-system.md` § 25.8。

### 5.2 怪物狀態機

```
ROAMING（巡邏/追蹤玩家）
  ↓ 進入仇恨範圍
CHASING（追蹤玩家到攻擊距離）
  ↓ 距離滿足 + 視線 OK
ATTACKING（攻擊 → 等 CD → 再攻擊）
  ↓ 玩家超出追蹤距離
ROAMING（脫離回到巡邏）
```

- 近戰怪物：追到玩家旁邊才打
- 遠程怪物（弓箭手／巫師）：保持射程內、有視線就打，不需貼身
- 仇恨範圍固定 8 格、脫離 15 格，對所有攻擊型別一致；
  因此弓箭手的 10 格射程只在「被激活後玩家拉開距離」時才吃得到全射程
- 暈眩檢查：每次 tick 前檢查 activeEffects 是否有 stun debuff，有則跳過行動

### 5.3 怪物死亡

- 直接從地圖上消失（目前為紅圈，暫不做死亡動畫）
- 觸發原有的 `processMonsterDeath()`：經驗、掉落、任務

## 6. Phase 管理

戰鬥與探索在同一個 phase 中進行，不再有獨立的 combat phase 切換。

### 6.1 當前架構

```
explore（含戰鬥）：
- 角色在地圖上自由移動
- 怪物在地圖上追蹤
- 進入攻擊範圍 → 開始即時攻擊交換
- 怪物 HP 歸零 → 死亡消失 → 腳本選下一個目標
- 無目標 → 繼續自動探索
```

### 6.2 HP/MP 門檻暫停

- 閒置時（周圍無近戰範圍內怪物）低於門檻 → 停止自動移動/生怪
- 被打時自動反擊不受暫停影響
- 恢復至 resume 門檻才解除暫停，繼續自動探索
- 詳見 `03-combat.md` § 戰鬥後等待

### 6.3 已移除的系統

| 舊系統 | 處理 |
|------|------|
| `phase: 'combat'` 場景切換 | 已移除，explore 涵蓋戰鬥 |
| `runAutoCombat()` timer-based 戰鬥 | 已移除，改為即時 FSM |
| `combatTimerIds` | 已移除 |
| 碰撞觸發戰鬥的邏輯 | 改為進入仇恨範圍觸發 |

## 7. 資料流

```
PixiJS Ticker（每幀 60fps）
  ↓
gameLoop.gameLoopTick(deltaMs)
  ├─ OccupationManager 重建佔位表
  ├─ HP/MP 門檻暫停判定
  ├─ 怪物生成（pressure-based，最多 10 隻）
  ├─ 怪物移動（A* 8 格內 + greedy step，path 每 5s 重算）
  └─ 玩家移動（沿路徑移動，遇怪停止）
  ↓
arpgEngine.tickArpgEngine(engine, input)
  ├─ syncMonsterContexts：同步怪物戰鬥上下文（新增/移除/更新）
  ├─ 決定武器類型 → getWeaponAttackConfig（bow=15, others=1.5）
  ├─ 預評估戰鬥腳本：若下一動是遠程技能，動態擴展攻擊範圍
  ├─ tickPlayerCombat（玩家 FSM）：
  │     idle → 選最近活著的怪
  │     chasing → 返回 move_to 事件
  │     attacking → CD 到達時返回 attack 事件
  ├─ 處理 attack 結果：
  │     evaluateCombatScript → 決定 action
  │     resolveTargets → 單體/AOE 目標解析
  └─ tickMonsterCombat（每隻怪物 FSM）：
        檢查 stun → roaming/chasing/attacking
  ↓
ArpgEvent[] 輸出（player_attack / monster_attack / move_to）
  ↓
上層處理事件 → combat.ts 計算傷害 → 更新 Zustand state
  ↓
PixiJS 渲染（sprite 位置、動畫、特效）
```

### 7.1 DoT 與 Effect 管理

- DoT tick timer：每 1000ms 觸發一次
- Effect 過期清理：每幀檢查 `startTime + duration`，移除已過期效果

## 8. 投射物系統

```typescript
interface Projectile {
  id: string;
  from: Position;      // 發射位置
  to: Position;        // 目標位置
  speed: number;       // 格/秒
  currentPos: Position;
  sourceType: 'player' | 'monster';
  sourceIdx?: number;  // 怪物 index
  skillId?: string;    // 使用的技能
  aoeRadius?: number;  // 命中時 AOE
}
```

- 每幀更新投射物位置
- 投射物到達目標 → 觸發 combat.ts 計算
- AOE 投射物到達後 → 對半徑內所有敵人計算

## 9. 實作狀態

### 已完成

| 模組 | 檔案 | 內容 |
|------|------|------|
| ARPG Engine | `arpgEngine.ts` | 核心協調器：每幀 tick、怪物上下文同步、武器判定、腳本預評估、目標解析 |
| 玩家 FSM | `playerCombatFSM.ts` | idle/chasing/attacking 三態、最近目標選擇、射程+視線判定 |
| 怪物 FSM | `monsterCombatFSM.ts` | roaming/chasing/attacking 三態、stun 檢查 |
| 視線判定 | `lineOfSight.ts` | LoS 計算、距離函式、半徑目標搜索 |
| Game Loop | `gameLoop.ts` | OccupationManager、HP/MP 門檻暫停、pressure 生怪、A* 尋路、DoT timer |
| AOE 解析 | `arpgEngine.ts` resolveTargets | self-centered（無上限）與 target-centered（maxTargets） |
| 攻擊範圍動態擴展 | `arpgEngine.ts` / `gameLoop.ts` | 預評估腳本可用技能，取最大 range |

### 待實作

| 功能 | 說明 |
|------|------|
| 投射物系統 | 遠程攻擊產生投射物 sprite、飛行過程、到達判定。目前遠程攻擊為即時命中。 |
| 視覺回饋 | 傷害數字飄動、怪物受擊閃爍、AOE 範圍指示 |

## 10. 技能系統對照表

以現有技能為例，定義攻擊屬性：

| 技能 | 類型 | 射程(range) | AOE 半徑 | 最大目標 | 備註 |
|------|------|-------------|----------|----------|------|
| 普通攻擊（劍） | melee | 1.5 | - | 1 | 依武器 |
| 普通攻擊（弓） | ranged | 15 | - | 1 | 依武器 |
| 普通攻擊（杖） | melee | 1.5 | - | 1 | 依武器，杖為近戰 |
| 風刃 | ranged | 10 | - | 1 | Lv1 基礎遠程 |
| 冰彈 | ranged | 10 | - | 1 | Lv1 基礎遠程 |
| 火焰箭 | ranged | 12 | - | 1 | Lv2 |
| 火球術 | ranged | 12 | 3 | 3 | 投射物，命中主目標後擴散 |
| 龍捲風 | ranged | 10 | 4 | 6 | 投射物，命中主目標後擴散 |
| 流星雨 | ranged | 15 | 6 | 8 | 高階大範圍 |
| 冰暴 | ranged | 12 | 4 | 6 | |
| 天雷 | ranged | 15 | - | 10 | Lv10 |
| 末日烈焰 | ranged | 15 | - | 10 | Lv10 |
| 治癒 | self | 0 | - | 1 | 對自身施放 |
| 大治癒 | self | 0 | - | 1 | 對自身施放 |
| 加速術 | self | 0 | - | 1 | 對自身施放 |
| 魔法盔甲 | self | 0 | - | 1 | 對自身施放 |
| 聖光術 | self | 0 | - | 1 | 淨化，對自身 |
| 絕對屏障 | self | 0 | - | 1 | 對自身施放 |
| 盾擊 | melee | 1.5 | - | 1 | 騎士近戰技 |
| 裂傷斬 | melee | 1.5 | - | 1 | 騎士近戰技 |
| 背刺 | melee | 1.5 | - | 1 | 盜賊近戰技 |
| 三連射 | ranged | 15 | - | 1 | 精靈弓技，multi-hit |
| 穿透箭雨 | ranged | 15 | - | 6 | 精靈弓 AOE |
| 聖光審判 | ranged | 10 | - | 6 | 牧師遠程 AOE |
| 元素風暴 | ranged | 12 | - | 10 | 元素師 AOE |
| 魔力奪取 | ranged | 8 | - | 1 | 短射程 |
| 詛咒 | ranged | 10 | - | 1 | debuff |
| 護甲崩壞 | ranged | 10 | - | 1 | debuff |
| 挑釁怒吼 | melee | 3 | - | 1 | 短程挑釁 |

**射程設計原則：**
- `range: 0`：buff/heal/move 類，對自身施放
- `range: 1.5`：近戰物理技能（劍/匕首類）
- `range: 3`：短程近戰控場（挑釁）
- `range: 8~10`：中程魔法（基礎攻擊魔法、debuff）
- `range: 12~15`：長程魔法/弓箭技能（高階攻擊魔法、弓技）

## 11. 風險與限制

| 風險 | 對策 |
|------|------|
| 大量怪物同時計算 AI 效能 | 限制同時活動怪物數量（maxMonsters = 10），遠處怪物降低 AI 頻率 |
| 投射物過多時渲染壓力 | 用 object pool 管理投射物 sprite |
| 舊存檔相容性 | phase 欄位向下相容，讀到 'combat' 自動轉為 'explore' |
| 腳本系統相容 | scriptRunner 介面保留，只改觸發時機 |

## 12. 地形、LOS 與投射物語意

- LOS 與投射物 raycast 共用 tile catalog，但分別讀取 `blocksSight` / `blocksProjectiles`（見 `38-map-control.md` § 38.4）。
- 邊界與實體障礙（牆壁/樹木/岩石/柱子）阻擋兩者；低窪障礙（水池/岩漿/深淵）與裝飾地面兩者皆不阻擋 —— 因此低窪障礙形成「近戰過不去、遠程打得到」的對射位。
- 距離公式為二維格距。目前所有 tile 高度皆為 0，跨層射線判定尚未實作（見 `38-map-control.md` § 38.15）。
- 現階段 combat.ts 的傷害、死亡、掉落與任務結算時機維持既有即時計算；Pixi projectile 是結果視覺化，不是權威傷害 state。產生視覺投射物前仍需通過地形 projectile raycast，地圖切換時 EffectLayer 清除所有飛行物。
- 此約束避免地圖重構同時改變攻擊 tick、掉落 exactly-once 與多段攻擊語意；若未來改為抵達時計算，必須將 projectile state 移至 gameplay loop 並另行設計。
