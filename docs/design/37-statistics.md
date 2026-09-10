# 37. 角色統計數據（Statistics）

> **存儲層級**：角色級別（每個角色獨立計數）
> **存儲方式**：server SQLite，隨角色資料一起存檔
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

## 37.4 排行榜

### 37.4.1 架構

- 統計與排行皆在 server（`97-selfhosted-server.md` § 97.4）；沒有上傳，沒有外部服務
- 範圍為本服；單機形態即一人榜，不做特例
- client 開啟統計中心時向 server 請求 snapshot，client 快取 10 分鐘；展開 Top 20、切換榜單不再請求
- server 收到請求時從 SQLite 即時計算，回 § 37.1 每個欄位的 top-N 聯集（去重），N 預設 20、上限 100

### 37.4.2 排名正確性

設回傳集合為 S，對任一欄位 f，S ⊇ f 的真實 top-N；client 依 f 排序取前 N 的結果與全體玩家數無關。

同分序必須決定性：server `ORDER BY <field> DESC, uuid ASC`，client `buildBoard` 使用相同比較子。

### 37.4.3 顯示名稱

所有 § 37.1 統計欄位皆可作為排行依據。「我的統計」分頁一律讀角色資料，不請求排行榜。

排行榜卡片以 **2 欄** 排列（`.stats-grid`）。

**顯示名稱一律為 `名稱#xxxx`**，`xxxx` 是 `uuid` 的前 4 碼（小寫 hex）：

```
1. 勇者#a3f2      Lv.62
2. 勇者#7c19      Lv.58
3. 小白#0e4b      Lv.55
```

- **一律顯示**，不做「只有衝突才加後綴」
- 「自己在榜上的位置」以 `uuid` 比對
- 後綴取 4 碼是顯示長度與辨識度的折衷，唯一性由完整 `uuid` 提供

### 37.4.4 刪除角色

刪除角色即從 server 移除，排行榜下次計算時不再出現。

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
