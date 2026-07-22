# 41 - ARPG 化戰鬥系統設計

## 1. 概述

將戰鬥系統從「phase 切換 + timer-based 數值模擬」改為「地圖上即時 ARPG 戰鬥」。

核心改變：
- 取消 `phase: 'combat'` 場景切換，戰鬥直接在探索地圖上發生
- 角色和怪物在地圖上有實際的攻擊動作和位移
- 攻擊分為近戰/遠程兩種類型
- AOE 技能可同時命中範圍內多隻怪
- 自動模式下由戰鬥腳本決定目標與技能

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
| 遠程 | 20 格內 | 只要視線無阻擋即可攻擊，產生投射物 |

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
  attackType: 'melee' | 'ranged';
  range: number;            // 攻擊距離（格數）
  aoeRadius?: number;       // AOE 搜索半徑（格數），undefined = 單體
  maxTargets?: number;      // AOE 最大目標數（含主目標），undefined = 1
  projectileSpeed?: number; // 投射物速度（格/秒），僅遠程
}
```

普通攻擊的類型由武器決定：
- 劍/斧/錘/匕首/爪/雙刀 → 近戰
- 杖/弓 → 遠程

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
- 遠程：找到距離 ≤ 20 且有視線的位置（優先當前位置）
- 使用現有 A* pathfinding

## 5. 怪物行為

### 5.1 怪物攻擊類型

怪物模板新增欄位：

```typescript
interface MonsterCombatProps {
  attackType: 'melee' | 'ranged';
  attackRange: number;      // 近戰通常 1.5，遠程可能 8-15
  attackInterval: number;   // 攻擊間隔 ms
  projectileSpeed?: number; // 遠程投射物速度
}
```

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
- 遠程怪物：保持射程內、有視線就打，不需貼身

### 5.3 怪物死亡

- 直接從地圖上消失（目前為紅圈，暫不做死亡動畫）
- 觸發原有的 `processMonsterDeath()`：經驗、掉落、任務

## 6. 取消 Phase 切換

### 6.1 現有流程（移除）

```
explore → collision → combat（timer 戰鬥） → victory → explore
```

### 6.2 新流程

```
explore（含戰鬥）：
- 角色在地圖上自由移動
- 怪物在地圖上追蹤
- 進入攻擊範圍 → 開始即時攻擊交換
- 怪物 HP 歸零 → 死亡消失 → 腳本選下一個目標
- 無目標 → 繼續自動探索
```

### 6.3 受影響的系統

| 系統 | 改動 |
|------|------|
| `gameStore.phase` | 移除 `'combat'`，或保留但改為「是否有敵對目標」的 flag |
| `runAutoCombat()` | 移除整套 timer-based 戰鬥 |
| `combatTimerIds` | 移除 |
| BattleView 的怪物 HP 條 UI | 改為顯示「當前目標」或地圖上跟隨怪物的血條 |
| HP/MP threshold 暫停 | 保留，低於門檻時角色停止攻擊/移動 |
| 戰鬥腳本 | 保留邏輯，但觸發方式改為每次攻擊間隔到時呼叫 |

## 7. 資料流（新）

```
PixiJS Ticker（每幀）
  ↓
角色狀態機 update：
  - IDLE：腳本選目標
  - CHASING：pathfinding 移動
  - ATTACKING：檢查 CD → 執行攻擊 → combat.ts 計算
  ↓
怪物狀態機 update（每隻）：
  - ROAMING/CHASING：追蹤玩家
  - ATTACKING：檢查 CD → 攻擊玩家 → combat.ts 計算
  ↓
更新 Zustand state（HP、位置、死亡）
  ↓
PixiJS 渲染（sprite 位置、動畫、特效）
```

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

## 9. 實作步驟

### Phase A：狀態機基礎

1. 建立角色戰鬥狀態機（IDLE/CHASING/ATTACKING）
2. 建立怪物戰鬥狀態機（ROAMING/CHASING/ATTACKING）
3. 實作視線判定（Line of Sight）
4. 修改怪物模板增加攻擊屬性

### Phase B：攻擊執行

1. 角色攻擊流程：距離檢查 → combat.ts 計算 → 傷害應用
2. 怪物攻擊流程：距離檢查 → combat.ts 計算 → 傷害應用
3. 攻擊間隔系統（取代 timer）
4. 整合 scriptRunner（攻擊時呼叫腳本決定技能）

### Phase C：移除舊戰鬥系統

1. 移除 `phase: 'combat'` 切換
2. 移除 `runAutoCombat()` 及 combatTimerIds
3. 移除碰撞觸發戰鬥的邏輯（改為進入仇恨範圍）
4. 調整 BattleView UI（移除怪物列表切換為地圖上血條）

### Phase D：投射物與 AOE

1. 建立投射物系統
2. 遠程攻擊產生投射物 → 到達時計算傷害
3. AOE 技能命中時對範圍內所有目標計算
4. PixiJS 投射物渲染

### Phase E：視覺回饋

1. 傷害數字飄動
2. 怪物受擊閃爍
3. 投射物 sprite（先用簡單圓點）
4. AOE 範圍指示（半透明圓）

## 10. 技能系統對照表

以現有技能為例，定義攻擊屬性：

| 技能 | 攻擊類型 | 射程 | AOE 半徑 | 最大目標 | 備註 |
|------|----------|------|----------|----------|------|
| 普通攻擊（劍） | melee | 1.5 | - | 1 | 依武器 |
| 普通攻擊（杖） | ranged | 20 | - | 1 | 依武器 |
| 火球術 | ranged | 20 | 3 | 3 | 投射物，命中主目標後擴散 |
| 龍捲風 | ranged | 20 | 4 | 6 | 投射物，命中主目標後擴散 |
| 冰霜新星 | melee | 1.5 | 5 | 8 | 以自身為中心 |
| 多重射擊 | ranged | 20 | - | 1 | 連擊多次（multi-hit，非 AOE） |

## 11. 風險與限制

| 風險 | 對策 |
|------|------|
| 大量怪物同時計算 AI 效能 | 限制同時活動怪物數量（maxMonsters），遠處怪物降低 AI 頻率 |
| 投射物過多時渲染壓力 | 用 object pool 管理投射物 sprite |
| 舊存檔相容性 | phase 欄位向下相容，讀到 'combat' 自動轉為 'explore' |
| 腳本系統相容 | scriptRunner 介面保留，只改觸發時機 |
