# 37. 角色統計數據（Statistics）

> **存儲層級**：角色級別（每個角色獨立計數）
> **存儲方式**：IndexedDB，隨角色資料一起存檔
> **用途**：記錄角色的各項累計行為數據，未來可作為成就系統的判定基礎

---

## 37.1 統計欄位

| 欄位 ID | 名稱 | 說明 |
|---------|------|------|
| monstersKilled | 殺敵數 | 累計擊殺怪物總次數（含 BOSS） |
| bossesKilled | BOSS 討伐數 | 累計擊殺 BOSS 次數 |
| deathCount | 死亡次數 | 角色死亡累計次數 |
| equipmentCrafted | 製作裝備數 | 鐵匠鋪製作裝備次數 |
| weaponEnhanceAttempts | 強化武器次數 | 武器強化嘗試次數（含成功與失敗） |
| armorEnhanceAttempts | 強化防具次數 | 防具強化嘗試次數（含成功與失敗） |
| weaponsBroken | 武器爆掉次數 | 武器強化失敗導致消失的次數 |
| armorsBroken | 防具爆掉次數 | 防具強化失敗導致消失的次數 |
| questsCompleted | 任務完成數 | 累計完成任務次數（職業工會 + 冒險者工會） |
| totalGoldEarned | 金幣獲得總量 | 累計從掉落/任務獎勵獲得的金幣（不含商店賣出） |
| contribution | 貢獻度 | 冒險者工會當前貢獻點數（含任務獲得與退出扣除的淨值） |

---

## 37.2 資料結構

```typescript
interface CharacterStatistics {
  monstersKilled: number;
  bossesKilled: number;
  deathCount: number;
  equipmentCrafted: number;
  weaponEnhanceAttempts: number;
  armorEnhanceAttempts: number;
  weaponsBroken: number;
  armorsBroken: number;
  questsCompleted: number;
  totalGoldEarned: number;
}
```

> **`contribution` 不在此介面內**：貢獻度存於 `guildProgress.points`（見 `36-quest-system.md` § 36.4），
> 上傳排行榜時才與統計欄位合併送出。§ 37.1 之所以列出它，是因為它同樣是排行榜欄位。

---

## 37.3 計數時機

| 欄位 | 觸發點 |
|------|--------|
| monstersKilled | 戰鬥系統：怪物 HP 歸零時 +1 |
| bossesKilled | 戰鬥系統：BOSS 怪物 HP 歸零時 +1 |
| deathCount | 戰鬥系統：玩家 HP 歸零時 +1 |
| equipmentCrafted | 鐵匠鋪：製作成功時 +1 |
| weaponEnhanceAttempts | 武器強化：每次嘗試 +1 |
| armorEnhanceAttempts | 防具強化：每次嘗試 +1 |
| weaponsBroken | 武器強化：失敗且武器消失時 +1 |
| armorsBroken | 防具強化：失敗且防具消失時 +1 |
| questsCompleted | 任務交付：完成任何任務時 +1 |
| totalGoldEarned | 掉落系統：獲得金幣時累加；任務獎勵：金幣獎勵時累加 |
| contribution | 任務系統：完成任務時加上該任務貢獻點數；退出任務時扣除等量貢獻點數 |

---

## 37.4 排行榜服務

### 37.4.1 架構

- **後端**：Cloudflare Worker + D1（SQLite）
- **防偽造**：Cloudflare Turnstile（非互動式驗證），僅寫入端點需要
- **前端快取**：localStorage 快取 snapshot，10 分鐘內不重複請求
- **核心原則**：整個統計中心**只打一支 GET `/api/snapshot`**，12 個榜單全部由同一份 snapshot
  在客戶端排序切片。展開 Top 20、切換榜單皆不再發請求。

### 37.4.2 D1 資料表

```sql
CREATE TABLE character_stats (
  character_id   TEXT PRIMARY KEY,       -- 客戶端 crypto.randomUUID()
  character_name TEXT NOT NULL,
  name_key       TEXT NOT NULL UNIQUE,   -- NFC + 小寫，名稱唯一性以此判定
  character_level INTEGER DEFAULT 0,
  class_name TEXT NOT NULL,
  monstersKilled INTEGER DEFAULT 0,
  bossesKilled INTEGER DEFAULT 0,
  deathCount INTEGER DEFAULT 0,
  equipmentCrafted INTEGER DEFAULT 0,
  weaponEnhanceAttempts INTEGER DEFAULT 0,
  armorEnhanceAttempts INTEGER DEFAULT 0,
  weaponsBroken INTEGER DEFAULT 0,
  armorsBroken INTEGER DEFAULT 0,
  questsCompleted INTEGER DEFAULT 0,
  totalGoldEarned INTEGER DEFAULT 0,
  contribution INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

> **`character_id` 必須是 uuid**：IndexedDB 的自增 `id` 在每個瀏覽器各自從 1 開始，
> 用它當 PK 會讓所有玩家的第一隻角色互相覆蓋。見 `18-data-schema.md`。
>
> **12 個排行欄位皆須建 index**：snapshot 對每個欄位各跑一次 `ORDER BY <field> DESC LIMIT N`。

### 37.4.3 API 端點

| 方法 | 路徑 | Turnstile | 說明 |
|------|------|-----------|------|
| GET | `/api/snapshot?top=N` | 否 | 12 欄位各 top-N 的聯集（去重），columnar 格式。N 預設 20、上限 100 |
| GET | `/api/name-check?name=` | 否 | 角色名稱可用性預檢（UX 用） |
| POST | `/api/character/register` | 是 | 建立角色時註冊名稱，重複回 409 `name_taken` |
| POST | `/api/stats` | 是 | 更新既有角色統計，**UPDATE-only**，未註冊回 404 `not_registered` |

`/api/stats` 刻意不做 upsert：若允許 INSERT，未經 register 的角色就能繞過名稱唯一性檢查。
該端點亦不更新 `character_name` —— 名稱在註冊時固定，避免改名頂替他人。

### 37.4.4 snapshot 格式與排名正確性

```json
{ "top": 20, "count": 137,
  "fields": ["character_id", "character_name", "class_name", "character_level", …, "updated_at"],
  "rows": [["uuid-…", "勇者", "knight", 52, …], …] }
```

每個角色在 `rows` 中只出現一次（12 個 top-N 查詢結果去重）。

**為何客戶端切出的名次等同全球真實名次**：設回傳集合為 S，對任一欄位 f，S ⊇ f 的真實 top-N。
客戶端把 S 依 f 排序取前 N 時，S 中不屬於真實 top-N 的 row，其 f 值必定 ≤ 第 N 名，
只會落在 N 名之後。因此結果與總玩家數無關，**不會因為玩家變多而失準**。

> **不可改成「取全表前 X 筆」**：任何單一順序的截斷都會讓其他 11 個榜單漏掉真正的前段班
> （例如久未上線但「武器爆掉數」第一的玩家）。

**同分序必須決定性**：伺服端 `ORDER BY <field> DESC, character_id ASC`，
客戶端 `buildBoard` 使用相同比較子，否則邊界名次會在兩端之間跳動。

### 37.4.5 上傳與快取時機

| 時機 | 行為 |
|------|------|
| 開啟統計中心，snapshot 快取未滿 10 分鐘 | **完全不打 API**，直接用快取切榜單 |
| 開啟統計中心，快取已過期 | 先上傳自己的統計（同樣 10 分鐘節流，各角色獨立），再抓 1 次 snapshot |
| 上傳時收到 404 `not_registered` | 自動補註冊後重送（DB v12 之前建立的舊角色走此路徑） |
| 補註冊收到 409 `name_taken` / 400 `invalid_name` | 顯示提示，該角色不上榜；排行榜仍可正常瀏覽 |
| 展開 Top 20、切換榜單 | 從同一份 snapshot 切片，不發請求 |

快取鍵：`mayana_leaderboard_snapshot`（snapshot 本體）、`mayana_stats_upload_<uuid>`（上傳時間戳）。

### 37.4.6 排行榜欄位

所有 § 37.1 統計欄位皆可作為排行依據。「我的統計」分頁一律讀本地資料，不打 API。

---

## 37.5 城鎮 NPC：統計中心

- **位置**：所有城鎮皆有（與其他設施相同）
- **圖示**：📊
- **功能**：
  - 排行榜 tab：九宮格顯示各欄位 Top 5，點擊可展開查看 Top 20
  - 我的統計 tab：顯示當前角色的所有統計數據

---

## 37.6 備註

- 所有計數器初始值為 0
- 計數器只增不減（不會因為任何操作減少），`contribution` 除外（退出任務會扣除）
- 未來成就系統可根據這些數據設定里程碑獎勵
- UI 顯示位置待定（可能放在角色面板或獨立的統計頁面）
