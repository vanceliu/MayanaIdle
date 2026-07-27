# 40 - PixiJS 渲染層遷移計畫

## 1. 目標

將現有 Canvas 2D 手動渲染（MapCanvas.tsx）遷移至 PixiJS，獲得：

- WebGL 硬體加速渲染
- Sprite batch 批次繪製，支撐大量實體同時顯示
- 內建粒子系統，未來可做技能特效
- 深度排序原生支援（sortableChildren / zIndex）
- 為未來「手動操作模式」和「線上化」打好基礎

## 2. 設計原則

- **只換渲染層**：PixiJS 只負責「把 state 畫出來」
- **邏輯層不動**：combat.ts、scriptRunner.ts、pathfinding 保持不變
- **Zustand 為唯一 state 來源**：PixiJS ticker 每幀從 Zustand 讀取最新 state
- **React 管 UI**：背包、裝備、技能欄、對話、商店等 overlay 仍由 React 處理
- **牆壁與實體共用深度排序**：WallLayer 把 graphics 加入 EntityLayer container，統一用 zIndex 排序

## 3. 架構

```
┌─────────────────────────────────────────────┐
│            React UI Layer                    │
│   (背包、裝備、技能欄、商店、對話框)           │
├─────────────────────────────────────────────┤
│          PixiJS Application                  │
│  ┌───────────────────────────────────────┐  │
│  │  Floor Layer (Graphics)               │  │  ← 靜態，地圖載入時畫一次
│  │  Path Layer (Graphics)                │  │  ← 路徑顯示
│  │  Entity Layer (sortableChildren)      │  │  ← 牆壁 + 玩家 + 怪物，依 zIndex 排序
│  │  Effect Layer (Container)             │  │  ← 技能特效、傷害數字（預留）
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│           Zustand Stores                     │
│  gameStore / mapControlStore / mapMonsterStore│
├─────────────────────────────────────────────┤
│          Game Logic (純函式)                  │
│  combat.ts / scriptRunner.ts / pressure.ts   │
└─────────────────────────────────────────────┘
```

## 4. 座標系統

維持現有等角投影公式：

```
screenX = (worldX - worldY) * (TILE_W / 2)
screenY = (worldX + worldY) * (TILE_H / 2)
```

- TILE_W = 64, TILE_H = 32（2:1 標準等角）
- 攝影機追蹤玩家，viewport 置中（lerp 平滑跟隨）
- 實體繪製在 tile 中心上方（圓心 Y 偏移 -RADIUS），視覺上「站在」地面

## 5. 遷移步驟

### Phase 1：基礎建設 ✅ 完成

1. ✅ 安裝 PixiJS v8 依賴
2. ✅ 建立 `PixiApp.ts`：Application 初始化、async destroy 處理 React StrictMode
3. ✅ 建立 `Camera.ts`：攝影機 lerp 追蹤
4. ✅ 建立 `PixiGame.tsx`：React wrapper，mount PixiJS Application 到 DOM
5. ✅ 與 BattleView.tsx 整合，替換 MapCanvas

### Phase 2：地圖渲染 ✅ 完成

1. ✅ 建立 `FloorLayer.ts`：讀取 MapData，繪製地板菱形 tile
2. ✅ 建立 `WallLayer.ts`：繪製牆壁（pseudo-3D block），加入 EntityLayer 做深度排序
3. ✅ 建立 `PathLayer.ts`：路徑顯示（半尺寸菱形）

### Phase 3：實體渲染 ✅ 完成

1. ✅ 建立 `PlayerEntity.ts`：玩家渲染（藍色圓形 + glow）
2. ✅ 建立 `MonsterEntity.ts`：怪物渲染（紅色圓形 + Boss 角標記）
3. ✅ Entity Layer 啟用 `sortableChildren = true`，依 `zIndex = worldX + worldY` 排序
4. ✅ Ticker 每幀同步 mapControlStore / mapMonsterStore 位置更新

### Phase 4：互動與攝影機 ✅ 完成

1. ✅ 點擊事件：DOM click → screenToWorld → moveToTarget
2. ✅ 攝影機平滑追蹤（lerp 0.1）

### Phase 5：特效與 UI Overlay（已完成）

1. ✅ 傷害數字飄動（Text + tween + 物件池）
   - 擊中時數字從受擊點向上飄動 40px，alpha 從 1 漸變到 0，0.8 秒後回收
   - 顏色規則詳見 [`42-element-system.md § 42.3`](42-element-system.md)
2. ✅ 怪物血條（Graphics bar 跟隨實體）
3. ✅ 技能特效預留（EffectLayer 架構可擴展）

## 6. 檔案結構

```
client/src/
├── pixi/
│   ├── PixiApp.ts              # PixiJS Application 初始化與生命週期（async destroy）
│   ├── GameScene.ts            # 主場景，管理所有 layer
│   ├── camera/
│   │   └── Camera.ts           # 攝影機 lerp 追蹤邏輯
│   ├── layers/
│   │   ├── FloorLayer.ts       # 地板 tile 繪製
│   │   ├── WallLayer.ts        # 牆壁繪製（buildInto EntityLayer container）
│   │   ├── PathLayer.ts        # 路徑顯示
│   │   ├── EntityLayer.ts      # 實體容器（sortableChildren, 含牆壁）
│   │   └── EffectLayer.ts      # 特效/粒子（預留）
│   ├── entities/
│   │   ├── PlayerEntity.ts     # 玩家 sprite（圓形，Y 偏移對齊地面）
│   │   └── MonsterEntity.ts    # 怪物 sprite（圓形 + Boss 標記）
│   ├── ui/                     # （待實作）
│   │   ├── HealthBar.ts        # 血條
│   │   └── DamageNumber.ts     # 傷害數字
│   └── utils/
│       └── isometric.ts        # 座標轉換、深度計算工具
├── components/
│   ├── PixiGame.tsx            # React wrapper，mount PixiJS + game loop
│   ├── MapCanvas.tsx           # （舊版，保留作為 fallback 參考）
│   └── BattleView.tsx          # 已改用 PixiGame
```

## 7. 資料流

```
PixiJS Ticker（每幀 ~16ms）
  ↓ 讀取 Zustand store state
  ↓ 執行 game logic tick（移動、怪物生成、碰撞偵測）
  ↓ 同步 sprite 位置 / 新增移除 / 更新 zIndex
  ↓ 更新攝影機位置
PixiJS 自動渲染
  ↓
畫面輸出
```

- PixiJS Ticker 取代原本手動 requestAnimationFrame loop
- Game loop 邏輯（movement tick、spawn、collision）整合在 ticker callback 中
- 點擊事件走 DOM event → 座標轉換 → store action

## 8. 效能改善預期

| 項目 | 舊版 (Canvas 2D) | 新版 (PixiJS) |
|------|------|--------|
| 地板渲染 | 每幀逐 tile 重繪 | 載入時 Graphics 建構一次，之後零成本 |
| 深度排序 | 每幀收集 array + sort | PixiJS sortableChildren 自動處理 |
| 實體更新 | 每幀重繪所有 | 只更新位置變動的 sprite |
| Canvas resize | 每幀設定 width/height（觸發 reflow） | 只在 window resize 時處理 |
| 渲染後端 | Canvas 2D（CPU） | WebGL（GPU batch） |

## 9. 相依性

```json
{
  "pixi.js": "^8.x"
}
```

PixiJS v8，支援 WebGL2 + WebGPU fallback。

## 10. 設計決策紀錄

| 決策 | 原因 |
|------|------|
| 牆壁加入 EntityLayer 而非獨立 layer | 牆壁需要和實體做深度排序（遮擋關係），分開 container 無法正確排序 |
| PixiApp.destroy() 改為 async | React StrictMode double-mount 會在 init 完成前觸發 unmount，需等 init promise 完成再 destroy |
| 點擊走 DOM event 而非 PixiJS pointer | 簡單直接，不需要 PixiJS interaction system |
| Ticker 每幀讀 store 而非 subscribe | Game loop 需要每幀同步多個 store，subscribe 模式在此場景沒有效能優勢 |
| 實體圓形 Y 偏移 -RADIUS | 讓圓形底部對齊 tile 中心，視覺上「站在」地面而非浮空 |

## 11. 風險與對策

| 風險 | 對策 |
|------|------|
| PixiJS 與 React 生命週期衝突 | async destroy + destroyed flag 防止重複初始化 |
| 等角地圖大量 tile 效能 | FloorLayer 一次性繪製，未來可快取為 RenderTexture |
| 手機 WebGL 相容性 | PixiJS 內建 Canvas fallback |
| 美術資源尚未準備 | 先用幾何圖形（圓形/菱形），與舊版一致 |

## 12. 後續待做

- [ ] FloorLayer 快取為 RenderTexture（大地圖優化）
- [x] 傷害數字飄動動畫
- [x] 怪物血條跟隨
- [x] 技能特效預留（架構可擴展）
- [ ] Sprite sheet 替換幾何圖形（美術資源就緒後）
- [ ] 手動操作模式 UI（虛擬搖桿、技能按鈕）
