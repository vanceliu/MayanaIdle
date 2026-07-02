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

---

## 37.4 備註

- 所有計數器初始值為 0
- 計數器只增不減（不會因為任何操作減少）
- 未來成就系統可根據這些數據設定里程碑獎勵
- UI 顯示位置待定（可能放在角色面板或獨立的統計頁面）
