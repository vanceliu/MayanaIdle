# 線上化架構設計概念

> 本文件為 MayanaIdle 從單機轉線上化的架構規劃，屬概念階段，非即時實作項目。

---

## 1. 核心架構變化

### 單機版（現狀）

```
Client (React) → IndexedDB（全部在瀏覽器內）
```

### 線上版（目標）

```
Client (React) → WebSocket → Game Server → Redis / PostgreSQL
```

---

## 2. 統一 Tick 架構


所有遊戲時間以 300ms 為基準 tick，確保倍數對齊：

| 項目 | 間隔 | Tick 數 |
|---|---|---|
| 常駐天賦判定 | 300ms | 1 |
| 紅色藥水冷卻 | 600ms | 2 |
| 橙色藥水冷卻 | 900ms | 3 |
| 加速後攻擊間隔 | 900ms | 3 |
| 玩家攻擊間隔 | 1200ms | 4 |
| 怪物攻擊間隔 | 1200ms (offset 600ms) | 4 |
| 白色藥水冷卻 | 1500ms | 5 |

Server 端可用統一 tick 驅動所有玩家，不需要每人獨立 setInterval。

---

## 3. 事件驅動取代高頻輪詢

### 問題

500 人 × 每 300ms 判定 = 每秒 ~1,667 次。大部分 tick 什麼都不做（HP 沒低於門檻、藥水沒冷卻完）。

### 解法

改為「下次觸發時間」預計算：

- 玩家 HP 從 100 掉到 50 的瞬間，計算「什麼時候 HP 會低於 30%」→ 排一個事件
- 狀態變化時（受傷、喝藥）重新計算下次觸發時間
- 用 Redis Sorted Set 做事件排程：

```
ZADD game:events <timestamp> "player:123:potion_check"
ZADD game:events <timestamp> "player:456:combat_tick"
```

Server 用 loop 做 `ZRANGEBYSCORE game:events -inf <now>`，取出到期事件執行。

效能從 O(n × tick/s) 降為 O(實際事件數)。

---

## 4. 資料分層策略

### 熱資料（Redis）

高頻讀寫，不落 PostgreSQL：

| 資料 | 結構 | 用途 |
|---|---|---|
| 玩家即時狀態（HP/MP/位置） | Hash | 每次戰鬥 tick 讀寫 |
| 戰鬥 session（怪物狀態） | Hash | 戰鬥中使用，結束後刪除 |
| 藥水冷卻 / 技能 CD | Key + TTL | 天然過期 |
| Pressure 值 | Key | 斷線歸零 |
| 事件排程 | Sorted Set | 下次觸發時間 |
| 排行榜 | Sorted Set | 即時排名 |

### 溫資料（Redis buffer → 5~10s 批次寫 PG）

大部分遊戲狀態統一走 buffer 路徑，簡化寫入邏輯：

| 資料 | flush 間隔 | 備註 |
|---|---|---|
| 經驗值 / 等級 | 5~10s | |
| 金幣 | 5~10s | |
| 背包物品（藥水/素材） | 5~10s | |
| 角色位置 | 5~10s | |
| 裝備強化 / 品質提升 / 詞綴升級 | 5~10s | 統一走 buffer |
| 裝備掉落（新 instance） | 5~10s | 統一走 buffer |
| 死亡 / 回城 | 5~10s | 統一走 buffer |
| 任務進度 | 5~10s | 統一走 buffer |

### 冷資料（即時寫 PG，強一致性）

涉及多玩家或金流的操作，必須即時寫入並保證原子性：

| 資料 | 觸發時機 | 備註 |
|---|---|---|
| 玩家間交易 | 交易確認 | 雙方原子操作 |
| 玩家間物品轉移 | 操作確認 | 雙方原子操作 |
| 排行榜結算 | 定期結算 | 需要一致性快照 |

---

## 4.1 Buffer 保護機制

### 資料分級

所有資料分為兩級，決定寫入路徑：

| 級別 | 路徑 | 適用場景 |
|---|---|---|
| 一般級 | Redis buffer → 5~10s flush → PG | 進度、掉落、經驗、金幣、強化 |
| 強一致級 | 即時寫 PG（繞過 buffer） | 交易、課金、跨玩家操作、排行結算 |

### Redis AOF 持久化

Redis 必須開啟 AOF（Append Only File）：

```
appendonly yes
appendfsync everysec
```

- 確保 Redis crash 時最多丟 1~2 秒資料（而非整個 buffer）
- 搭配 5~10s flush，實際最壞丟失 = max(AOF gap, flush gap) ≈ 10 秒

### Flush 冪等性（Idempotent）

Flush worker 必須寫「最終狀態」而非「增量事件」：

```
# 正確：覆寫最終狀態
UPDATE characters SET gold = 12345, exp = 67890 WHERE id = 123;

# 錯誤：增量累加（重試會重複加）
UPDATE characters SET gold = gold + 100 WHERE id = 123;
```

- Worker 從 Redis 讀當前快照 → 整筆 upsert 到 PG
- 重試安全：同樣的快照寫兩次結果一樣
- 不需要事件溯源，邏輯簡單

### 強制 Flush 時機

以下事件觸發立即 flush 該玩家的 dirty state：

| 事件 | 備註 |
|---|---|
| 玩家登出 | 確保進度不丟 |
| Server shutdown（graceful） | 全部玩家 flush |
| 即將進入強一致操作（交易前） | 確保雙方狀態一致 |
| 玩家斷線超過 30 秒 | 視為離線，清理 session |

### crash 丟失窗口

| 場景 | 最壞丟失 |
|---|---|
| Game Server crash | 0（狀態在 Redis） |
| Redis crash（有 AOF） | 1~2 秒 |
| Redis crash（無 AOF） | 5~10 秒（整個 buffer） |
| PG crash | 0（WAL 保護） |
| 全部同時 crash | 1~2 秒（AOF 保護） |

---

## 5. Buffer 策略（分階段）

### Phase 1（0~500 人，單機）

Buffer 在 Game Server 記憶體：

```
Game Server 記憶體（dirty map per player）
  ↓ 每 5~10s batch flush
PostgreSQL
```

- 簡單直接
- Server crash 最多丟 5~10 秒資料（放置遊戲可接受）
- 單機不需要跨 server 同步
- 所有資料（含裝備強化、掉落）走同一條路，程式碼簡單

### Phase 2（500+ 人，需要 scale）

Buffer 移到 Redis：

```
Game Server（stateless，只做計算）
  ↓ 每次狀態變化寫 Redis
Redis（最新狀態 + dirty flag，AOF 開啟）
  ↓ 每 5~10s flush worker 掃描 dirty keys
PostgreSQL
```

- Game Server 完全 stateless，crash 不丟資料
- 多台 Game Server 天然支持
- Redis AOF 保護：crash 最多丟 1~2 秒
- Flush worker 寫最終狀態（冪等），重試安全

### 遷移成本

Phase 1 → Phase 2 遷移低：本質是把 `Map<playerId, dirtyState>` 從記憶體換成 Redis Hash。

---

## 6. DB 寫入壓力估算（500 人）

| 方案 | PostgreSQL writes/s | 備註 |
|---|---|---|
| 每次變化直接寫 | ~900 | 不必要的壓力 |
| 5~10s 批次 flush（統一路徑） | ~50~100 | 輕鬆 |
| + 強一致操作（交易/課金） | +5~10 偶發 | 可忽略 |

PostgreSQL 單機能扛 5,000+ writes/s，100/s 完全無壓力。

---

## 7. 後端架構

```
          ALB (WebSocket sticky session)
                   ↓
       ┌────────────────────────┐
       │   Game Server (ECS)     │  ← auto-scale by CPU / connection count
       │   每台扛 200~500 連線   │
       └────────────────────────┘
                   ↓
            Redis (狀態 + 事件排程)
                   ↓
            PostgreSQL (持久化)
```

### Server 職責劃分

| 組件 | 職責 |
|---|---|
| Game Server | 遊戲邏輯計算、WebSocket 通訊、事件處理 |
| Redis | 玩家即時狀態、事件排程、session 管理 |
| PostgreSQL | 永久持久化、離線資料查詢 |
| Flush Worker | 定期掃描 dirty keys，batch 寫 PG（可內建或獨立 process） |

---

## 8. Auto-scaling 規則

| 指標 | 閾值 | 動作 |
|---|---|---|
| 連線數/台 | > 400 | scale out +1 |
| CPU | > 70% | scale out +1 |
| 連線數/台 | < 100 | scale in -1 |

關鍵：Game Server stateless（狀態在 Redis），scale out 無需遷移狀態。

---

## 9. 硬體規格與成本估算

| 人數 | Game Server | Redis | PostgreSQL | 月費估算 |
|---|---|---|---|---|
| 500 | 1× t3.medium | 1× cache.t3.micro | 1× db.t3.micro | ~$57 |
| 2,000 | 2~4× auto | 1× small | 1× small | ~$200 |
| 5,000 | 4~8× auto | 1× medium + replica | 1× medium + read replica | ~$600 |

---

## 10. Client 端變化

線上版 client 變薄：

| 項目 | 單機版（現在） | 線上版 |
|---|---|---|
| 遊戲邏輯 | client 執行 | server 執行 |
| 狀態管理 | Zustand + IndexedDB | Zustand（接收 server push） |
| 戰鬥判定 | client 計算 | server 計算，client 顯示 |
| 天賦判定 | client 執行 | server 執行 |
| Client 職責 | 全部 | UI 渲染 + 操作指令發送 + 動畫插值 |

### 通訊原則

- Server → Client：只 push 差異（delta），不傳全量狀態
- Client → Server：操作指令（使用藥水、切換目標、回城等）
- 頻寬估算：每人約 1~2 KB/s（delta push）

---

## 11. 轉線上實作順序（建議）

1. 把遊戲邏輯從 component/store 抽到純函數（已部分完成：scriptRunner.ts、combat.ts）
2. 把 timer-based 邏輯改成事件驅動（最大工程）
3. 加 server 層（Node.js + Socket.IO），client 變薄
4. 加 Redis 做狀態層 + 事件排程
5. 加 PostgreSQL 做持久化（取代 IndexedDB）
6. 加 flush worker + auto-scaling

---

## 12. 風險緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| Server crash 丟資料 | 最多 30s 進度 | Phase 2 用 Redis buffer 降低 |
| Redis crash | 丟未 flush 狀態 | 開 AOF，最多丟 1~2s |
| 作弊（client 修改） | 戰鬥結果不可信 | 所有判定 server authoritative |
| WebSocket 斷線 | 玩家看到延遲 | client 做樂觀更新 + 斷線重連 |
| 跨 server 狀態同步 | 組隊/交易 | 透過 Redis pub-sub |

---

## 13. 靜態模板資料管理

### 定義

靜態模板指遊戲運行期間不會被修改的唯讀資料：

| 模板類型 | 說明 | 數量級 |
|---|---|---|
| 裝備模板（EquipmentTemplate） | 武器/防具/飾品的基礎屬性、取得方式、製作配方 | ~200 |
| 怪物模板（MonsterTemplate） | 怪物素質、掉落池 | ~100 |
| 道具定義（ItemDefinition） | 藥水/卷軸/素材的屬性 | ~30 |
| 技能定義（SkillDefinition） | 魔法/技能的效果、消耗 | ~80 |
| 掉落表（DropTable） | 區域掉落池配置 | ~120 |

### 資料流

```
PostgreSQL（master data，版本控制）
  ↓ Server 啟動時全量載入
Game Server 記憶體（Map<id, Template>）
  ↓ Client 連線時下載（或版本比對差量更新）
Client 記憶體（同結構快取）
```

### 設計原則

1. **Single Source of Truth** — 每個模板只定義一次，所有系統引用同一份
2. **啟動載入，運行期不查 DB** — Server 啟動時一次性載入所有模板到記憶體 Map，後續直接查 Map
3. **Client 端快取** — Client 連線時取得模板版本號，版本一致則用本地快取（localStorage），不一致則重新下載
4. **版本控制** — 模板表有 `version` 欄位（或全域 schema_version），更新模板時遞增，Client 比對決定是否重新載入

### 引用方式

| 系統 | 如何使用模板 |
|---|---|
| 武器商店 | 查詢 `type != 'armor' && acquireType == 'shop'` |
| 防具商店 | 查詢 `(type == 'armor' \|\| slot == 'leftHand') && acquireType == 'shop'` |
| 鐵匠鋪製作 | 查詢 `acquireType == 'craft'`，顯示配方詳情 |
| 掉落系統 | 用 `name` 查找模板，生成裝備實例 |
| 背包 tooltip | 從裝備實例上的屬性渲染（實例建立時已複製模板值） |
| 戰鬥系統 | 從裝備實例讀取攻擊力/防禦等數值計算傷害 |

### 裝備實例生成流程

無論來源（商店/製作/掉落），生成裝備實例的流程相同：

```
1. 查找 EquipmentTemplate by name/id
2. 複製模板基礎屬性到新的 EquipmentInstance
3. 設定實例獨有欄位（ownerId, quality=0, enhancement=0, affixes=[]）
4. 製作來源：額外 roll 詞綴（generateCraftAffixes）
5. 寫入 DB（equipmentInstances 表）
```

### 單機版 vs 線上版

| 項目 | 單機版（現狀） | 線上版 |
|---|---|---|
| 模板儲存 | IndexedDB（seed.ts 初始化） | PostgreSQL |
| 模板載入 | Dexie 查詢 | Server 啟動全量載入到記憶體 |
| Client 取得 | 直接查 IndexedDB | WebSocket 連線時下載/快取 |
| 更新方式 | 改 seed.ts 重新初始化 | 改 DB + 遞增版本號，重啟 Server |
