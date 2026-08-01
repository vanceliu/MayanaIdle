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
- **防偽造**：Cloudflare Turnstile（非互動式驗證）
- **前端快取**：記憶體快取，10 分鐘內不重複請求

### 37.4.2 D1 資料表

```sql
CREATE TABLE character_stats (
  character_id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
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
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### 37.4.3 API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/stats` | Upsert 角色統計（需 Turnstile token） |
| GET | `/api/leaderboard/:field?limit=N` | 取得指定欄位排行榜（最大 100） |
| GET | `/api/stats/:characterId` | 查詢單一角色統計 |

### 37.4.4 上傳時機

- 進入排行榜時，若自己不在榜上 → 自動上傳
- 進入排行榜時，若在榜上但 `updated_at` 超過 10 分鐘 → 自動重新上傳
- 10 分鐘內重複進入 → 使用本地快取，不打 API

### 37.4.5 排行榜欄位

所有 § 37.1 統計欄位皆可作為排行依據。

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
