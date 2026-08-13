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
| tier7WeaponsLooted | T7 武器掉落數 | 累計掉落取得的 T7 武器數 |
| tier7ArmorsLooted | T7 防具掉落數 | 累計掉落取得的 T7 防具數（含盾牌／魔導書／臂甲） |
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
  tier7WeaponsLooted: number;
  tier7ArmorsLooted: number;
}
```

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
| tier7WeaponsLooted | 掉落系統：掉出 tier 7 武器時 +1 |
| tier7ArmorsLooted | 掉落系統：掉出 tier 7 防具（含副手）時 +1 |
| contribution | 任務系統：完成任務時加上該任務貢獻點數；退出任務時扣除等量貢獻點數 |

---

## 37.4 排行榜服務

### 37.4.1 架構

- **後端**：Cloudflare Worker + D1（SQLite）
- **防偽造**：Cloudflare Turnstile（非互動式驗證），僅寫入端點需要
- **前端快取**：localStorage 快取 snapshot，10 分鐘內不重複請求
- **核心原則**：整個統計中心**只打一支 GET `/api/snapshot`**，14 個榜單全部由同一份 snapshot
  在客戶端排序切片。展開 Top 20、切換榜單皆不再發請求。

### 37.4.2 D1 資料表

```sql
CREATE TABLE character_stats (
  character_id    TEXT PRIMARY KEY,      -- 客戶端 crypto.randomUUID()，公開
  character_name  TEXT NOT NULL,         -- 不要求唯一，每次上傳都更新
  auth_token_hash TEXT NOT NULL,         -- 角色密鑰的 SHA-256，首次寫入時綁定
  character_level INTEGER DEFAULT 0,
  class_name TEXT NOT NULL,
  data_version INTEGER NOT NULL DEFAULT 0,  -- 見 § 37.4.8
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
  tier7WeaponsLooted INTEGER DEFAULT 0,
  tier7ArmorsLooted INTEGER DEFAULT 0,
  contribution INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 37.4.3 API 端點

| 方法 | 路徑 | Turnstile | 說明 |
|------|------|-----------|------|
| GET | `/api/snapshot?top=N` | 否 | 14 欄位各 top-N 的聯集（去重），columnar 格式。N 預設 20、上限 100 |
| POST | `/api/stats` | 是 | **upsert** 自己的統計，需 `auth_token` |

**全服只有這一個寫入端點。** 它必須帶 `data_version`，與伺服端不符時回 409 `outdated_client`（見 § 37.4.8）。

#### 密鑰模型（TOFU）

`/api/stats` 是 upsert，且**必須驗證 `auth_token`**：

| 情況 | 行為 |
|---|---|
| `character_id` 尚無資料 | INSERT，並存下 `sha256(auth_token)` —— 首次寫入即綁定 |
| 已有資料，hash 相符 | UPDATE（含 `character_name`） |
| 已有資料，hash 不符 | 403 `invalid_auth_token` |

密鑰由客戶端在建立角色時產生，**不提供補發**。

驗證在**單一 UPSERT 內**完成（`ON CONFLICT(character_id) DO UPDATE ... WHERE
character_stats.auth_token_hash = excluded.auth_token_hash`），因此不存在
「先查再寫」的競態，`changes = 0` 即代表密鑰不符。
刻意不做定值時間比較：存的是 hash，就算靠時間差問出 hash 也無法反推 token
（需要 SHA-256 preimage）。

`character_name` 每次上傳都更新（名稱非唯一，不存在改名頂替問題），
但**必須在伺服端重新驗證格式**（規則見 `19-account-character.md` § 19.4）。

### 37.4.4 snapshot 格式與排名正確性

```json
{ "top": 20, "count": 137,
  "fields": ["character_id", "character_name", "class_name", "character_level", …, "updated_at"],
  "rows": [["uuid-…", "勇者", "knight", 52, …], …] }
```

每個角色在 `rows` 中只出現一次（14 個 top-N 查詢結果去重）。

**為何客戶端切出的名次等同全球真實名次**：設回傳集合為 S，對任一欄位 f，S ⊇ f 的真實 top-N。
客戶端把 S 依 f 排序取前 N 時，S 中不屬於真實 top-N 的 row，其 f 值必定 ≤ 第 N 名，
只會落在 N 名之後。因此結果與總玩家數無關，**不會因為玩家變多而失準**。

**同分序必須決定性**：伺服端 `ORDER BY <field> DESC, character_id ASC`，
客戶端 `buildBoard` 必須使用相同比較子。

### 37.4.5 上傳與快取時機

| 時機 | 行為 |
|------|------|
| 開啟統計中心，snapshot 快取未滿 10 分鐘 | **完全不打 API**，直接用快取切榜單 |
| 開啟統計中心，快取已過期 | 先上傳自己的統計（條件見下），再抓 1 次 snapshot |
| 距離上次上傳未滿 10 分鐘 | 不上傳 |
| 統計數值與上次上傳完全相同 | **不上傳**（掛在城鎮、只是來看榜的玩家不產生任何寫入） |
| 數值相同但已超過 24 小時 | 強制上傳一次，避免伺服端資料遺失後客戶端永不重送 |
| 首次上傳 | upsert 直接建立資料列並綁定密鑰，**不需要事先註冊** |
| 上傳收到 403 `invalid_auth_token` | 顯示提示，該角色不上榜；排行榜仍可正常瀏覽 |
| 上傳收到 400 `invalid_name` | 同上（伺服端仍會驗名稱格式） |
| 展開 Top 20、切換榜單 | 從同一份 snapshot 切片，不發請求 |

快取鍵：`mayana_leaderboard_snapshot`（snapshot 本體）、
`mayana_stats_upload_<uuid>`（`{ at, sig }`：上次上傳時間與數值指紋）。

### 37.4.6 規模與成本

讀取端**不隨玩家數成長**：snapshot 回傳筆數的硬上限為 14 欄位 × top-N，
`top=20` 時最多 280 筆（約 40 KB，gzip 後約 8~10 KB），實際因去重通常只有一半。
加上 60 秒 edge cache 與客戶端 10 分鐘快取，D1 每次未命中只讀 280 rows 且全走 index。

寫入端則與活躍玩家數成線性關係，是先觸頂的一側：
每位玩家每 10 分鐘最多 1 次寫入 → 每日上限 144 次。
「數值未變不上傳」即為此而設 —— 放置型遊戲有大量只看榜不變動的情況。
若日後仍逼近 D1 寫入額度，下一步是拉長最小上傳間隔（10 → 30 分鐘）。

### 37.4.7 排行榜欄位與顯示名稱

所有 § 37.1 統計欄位皆可作為排行依據。「我的統計」分頁一律讀本地資料，不打 API。

排行榜卡片以 **2 欄** 排列（`.stats-grid`）—— 三欄時「金幣總量」這類長數字
會在卡片內擠成兩行，整排卡片高度參差不齊。

**顯示名稱一律為 `名稱#xxxx`**，`xxxx` 是 `character_id` 的前 4 碼（小寫 hex）：

```
1. 勇者#a3f2      Lv.62
2. 勇者#7c19      Lv.58
3. 小白#0e4b      Lv.55
```

- **一律顯示**，不做「只有衝突才加後綴」—— 那會讓同一個人的顯示名隨著別人進榜而變動。
- 玩家可用這串確認榜上哪一列是自己（本機 `isMine` 也是比對同一個 uuid）。
- 後綴取 4 碼是顯示長度與辨識度的折衷，不是唯一性保證；
  真正的唯一性由完整的 `character_id` 提供。

### 37.4.8 資料版本與舊角色清理

`character_stats` 帶有 `data_version` 欄位，Worker 內建一份 `CURRENT_DATA_VERSION`
常數（必須與客戶端一致，跟著部署上線）。

| 端點 | 對舊版本資料的行為 |
|---|---|
| `GET /api/snapshot` | 只回傳現行版本 → 被淘汰的角色自動從排行榜消失 |
| `POST /api/stats` | 只寫入現行版本；客戶端版本不符回 409 `outdated_client` |

名稱不再唯一之後，版本淘汰**不需要處理名稱回收** —— 名稱從來沒有被佔住。

### 37.4.9 刪除角色不通知伺服端

玩家刪除角色是**純本機行為**：沒有 register 就沒有要註銷的東西，
因此沒有對應的刪除端點，全服只有 `POST /api/stats` 一個寫入端點。

代價是榜上會留下不再更新的資料列，直到 `CURRENT_DATA_VERSION` 跳號才清掉。
名稱不唯一，所以這**不影響任何人取名或上榜**，純粹是顯示上的殘留。

舊版客戶端（快取到舊 bundle）會收到 409，無法再寫入 —— 這是刻意的，
提高資料版本即代表舊資料已失效。

---

## 37.5 城鎮 NPC：統計中心

- **位置**：所有城鎮皆有（與其他設施相同）
- **圖示**：📊
- **功能**：
  - 排行榜 tab：卡片格狀排列，每張顯示該欄位 Top 5，點擊可展開查看 Top 20
    （欄位數會隨統計新增而增加，版面自動換行，不是固定的九宮格）
  - 我的統計 tab：顯示當前角色的所有統計數據

---

## 37.6 備註

- 所有計數器初始值為 0
- 計數器只增不減（不會因為任何操作減少），`contribution` 除外（退出任務會扣除）
- 未來成就系統可根據這些數據設定里程碑獎勵
- UI 顯示位置待定（可能放在角色面板或獨立的統計頁面）
