# 39. 批量販售系統（依等級分類）

## 39.1 功能概述

各商店（雜貨店、武器店、防具店）的販售分頁新增「依等級篩選批量販售」功能，讓玩家可快速販售指定等級以下的物品。

同一套顏色門檻與定價也是補給天賦自動販售的依據（`49-village-script.md`），
實作共用 `client/src/systems/shop.ts`。

---

## 39.2 裝備顏色等級系統

裝備依取得方式與等級，對應 7 色分級（與素材 iconTier 共用色系）：

| 等級序號 | 分類 | 顏色名 | 色碼 | 對應條件 |
|---|---|---|---|---|
| 0 | starter | 灰色 | #9CA3AF | `isStarterGear: true`（不可販售） |
| 1 | shop-low | 白色 | #FFFFFF | `acquireType: 'shop'` + `shopTier: 'low'` |
| 2 | shop-mid | 藍色 | #60A5FA | `acquireType: 'shop'` + `shopTier: 'mid'` |
| 3 | shop-high | 綠色 | #4ADE80 | `acquireType: 'shop'` + `shopTier: 'high'` |
| 4 | craft-entry | 金色 | #FACC15 | `acquireType: 'craft'` + `craftTier: 'entry'` |
| 5 | craft-mid | 橙色 | #FB923C | `acquireType: 'craft'` + `craftTier: 'mid'` |
| 6 | craft-top | 紅色 | #EF4444 | `acquireType: 'craft'` + `craftTier: 'top'` |

紫色（#A855F7）保留給未來 `drop_only` 裝備使用，目前不列入販售系統。

### 顏色用途

- 裝備名稱在所有 UI 中以對應顏色顯示（販售清單、背包、倉庫等）
- 批量販售介面的等級選擇器以顏色標示

---

## 39.3 素材稀有度分級

素材沿用既有 `iconTier` + `MATERIAL_TIER_COLORS` 系統：

| iconTier | 顏色名 | 色碼 | 定位 |
|---|---|---|---|
| 1 | 白色 | #FFFFFF | 純販售素材（新手區域） |
| 2 | 藍色 | #60A5FA | 入門區域素材 |
| 3 | 綠色 | #4ADE80 | 中等區域素材 |
| 4 | 金色 | #FACC15 | 進階區域素材 |
| 5 | 橙色 | #FB923C | 高階區域素材 |
| 6 | 紅色 | #EF4444 | Boss 素材 |
| 7 | 紫色 | #A855F7 | 最終 Boss 素材 |

---

## 39.4 批量販售 UI 設計

### 共通結構

每個商店的販售分頁新增以下 UI 區塊：

```
.shop-panel
├── .shop-tabs（購買 / 出售）
└── [出售分頁]
    ├── .batch-sell-controls     — 批量販售控制區
    │   ├── .batch-sell-selector — 等級選擇器（下拉選單或按鈕組）
    │   ├── .batch-sell-preview  — 預覽區（即時顯示符合條件的物品清單與總價）
    │   └── .batch-sell-action   — 「一鍵販售」按鈕
    └── .shop-items              — 原有的逐一販售清單（保留）
```

### 等級選擇器

操作方式：選擇一個等級，代表「販售此等級及以下所有物品」。

**雜貨店（素材）：**

顯示 iconTier 1~7 的選項，每個選項帶顏色圓點 + 名稱：
- ⚪ Tier 1（白色素材）
- 🔵 Tier 2 以下（藍色及白色素材）
- 🟢 Tier 3 以下（綠色、藍色、白色素材）
- 🟡 Tier 4 以下
- 🟠 Tier 5 以下
- 🔴 Tier 6 以下
- 🟣 Tier 7 以下（全部素材）

**素材的用途保護：**

顏色只表達稀有度，「Tier N 以下」會連進得了配方的素材一起掃掉。
雜貨店的素材批量販售因此附一個**預設勾選**的「跳過有用途的素材」：

- 判定用 `hasMaterialUsage()`（`systems/craftMaterialUsage.ts`），涵蓋裝備配方素材
  （印記歸 `scroll`，本來就不在素材篩選內，見 `30-items.md` § 30.2 印記）
- 被保護而未列入販售的素材要**明確列出來**，不可靜默漏掉 ——
- 取消勾選即回到純粹依 `iconTier` 篩選的舊行為

**武器店 / 防具店（裝備）：**

顯示等級 1~6 的選項：
- ⚪ 商店低階（白色裝備）
- 🔵 商店中階以下（藍色 + 白色）
- 🟢 商店高階以下（綠色 + 藍色 + 白色）
- 🟡 製作入門以下（金色 + 綠色 + 藍色 + 白色）
- 🟠 製作進階以下（橙色 + 金色 + 綠色 + 藍色 + 白色）
- 🔴 製作頂級以下（紅色 + 橙色 + 金色 + 綠色 + 藍色 + 白色）

### 預覽區

選擇等級後，即時顯示：
- 符合條件的物品數量
- 物品名稱清單（帶顏色）
- 預估總售價

### 一鍵販售按鈕

- 顯示「一鍵販售 (N 件) — 獲得 XXXG」
- 點擊後執行批量販售
- 販售完成後顯示結算訊息

---

## 39.5 販售規則

### 排除條件（僅限一鍵批量販售）

以下物品不會被「一鍵批量販售」命中，但仍可透過逐一販售方式手動賣出：

1. **已裝備的裝備**（角色身上穿戴中的裝備）
2. **starter 裝備**（`isStarterGear: true`，本身不可販售）
3. **drop_only 裝備**（`acquireType: 'drop_only'`，避免誤賣稀有掉落裝備）
4. **藥水、卷軸**（非素材類不在雜貨店批量販售範圍）

### 價格公式

沿用各商店現有販售價格，不做任何修改：

**雜貨店（素材）：**
```
售價 = Math.floor(itemDefinition.sellPrice * 0.5)
若無 sellPrice 則用 buyPrice * 0.5
```

**武器店（武器）：**
```
售價 = Math.floor(template.buyPrice * 0.5)
若 buyPrice 為 0（製作品）：Math.floor(template.craftGold * 0.5)
```

**防具店（防具）：**
```
售價 = Math.floor(template.buyPrice * 0.5)
若 buyPrice 為 0（製作品）：Math.floor(template.craftGold * 0.5)
```

---

## 39.6 裝備名稱顏色顯示

所有顯示裝備名稱/icon 的場景，均以對應等級顏色標示：

- 背包（BagPanel）內裝備列表
- 角色裝備欄（已穿戴裝備）
- 商店購買分頁（武器店、防具店）
- 商店販售分頁（逐一販售清單 + 批量販售預覽）
- 鐵匠鋪（製作清單、強化選擇）
- 印記師（詞綴升階、品質提升的裝備選擇）
- 倉庫（個人倉庫、共用倉庫的裝備列表）
- 掉落物品訊息（戰鬥/探索獲得裝備時的文字提示）

### 顏色取得邏輯

```typescript
function getEquipmentTierColor(template: EquipmentTemplate): string {
  if (template.isStarterGear) return '#9CA3AF'; // 灰色
  if (template.acquireType === 'drop_only') return '#A855F7'; // 紫色
  if (template.acquireType === 'craft') {
    switch (template.craftTier) {
      case 'entry': return '#FACC15'; // 金色
      case 'mid': return '#FB923C';   // 橙色
      case 'top': return '#EF4444';   // 紅色
    }
  }
  if (template.acquireType === 'shop') {
    switch (template.shopTier) {
      case 'low': return '#FFFFFF';   // 白色
      case 'mid': return '#60A5FA';   // 藍色
      case 'high': return '#4ADE80';  // 綠色
    }
  }
  return '#FFFFFF'; // fallback
}
```

### 裝備等級序號取得邏輯

```typescript
function getEquipmentTierLevel(template: EquipmentTemplate): number {
  if (template.isStarterGear) return 0;
  if (template.acquireType === 'shop') {
    switch (template.shopTier) {
      case 'low': return 1;
      case 'mid': return 2;
      case 'high': return 3;
    }
  }
  if (template.acquireType === 'craft') {
    switch (template.craftTier) {
      case 'entry': return 4;
      case 'mid': return 5;
      case 'top': return 6;
    }
  }
  return 0;
}
```

---

## 39.7 實作範圍

### 新增檔案

- `client/src/models/equipmentTier.ts` — 裝備等級顏色常數、`getEquipmentTierColor()`、`getEquipmentTierLevel()`

### 修改檔案

- `client/src/components/town/GeneralStore.tsx` — 販售分頁加入批量販售 UI（素材）
- `client/src/components/town/WeaponShop.tsx` — 販售分頁加入批量販售 UI（武器）
- `client/src/components/town/ArmorShop.tsx` — 販售分頁加入批量販售 UI（防具）
- `client/src/components/EquipmentInfo.tsx` — 裝備名稱加上顏色顯示
- `client/src/components/BagPanel.tsx` — 背包裝備名稱加上顏色顯示

### 不修改

- 販售價格公式（沿用現有邏輯）
- 素材 `MATERIAL_TIER_COLORS`（已存在，直接引用）
- gameStore 的 sell 相關 action（逐一販售邏輯不變，批量販售在 component 層迴圈呼叫）

---

## 39.8 連動關係

```
39-batch-sell.md ←→ 06-equipment-acquire.md（shopTier / craftTier 定義）
       ↕
13-town.md（雜貨店/武器店/防具店販售功能）
       ↕
30-items.md（素材 iconTier / sellPrice）
       ↕
34-ui-guidelines.md（面板統一樣式）
```
