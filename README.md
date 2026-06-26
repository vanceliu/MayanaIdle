# MayanaIdle 瑪雅那Idle

Web-based Idle ARPG — 持續戰鬥、隨機遇敵、裝備詞綴養成、陣營競爭。

## 技術棧

- React / Vite / TypeScript
- Zustand（狀態管理）
- IndexedDB via Dexie（離線資料庫）
- Vitest + Testing Library（測試）
- 純 CSS（無 Tailwind）

## 快速開始

```bash
cd client
npm install
npm run dev
```

開發伺服器啟動後訪問 `http://localhost:5173`。

## 測試

```bash
cd client
npm test
```

## 專案結構

```
client/
├── src/
│   ├── components/    # React UI 元件
│   ├── db/            # IndexedDB schema + seed 資料
│   ├── models/        # 資料模型（character, equipment, skill, monster...）
│   ├── stores/        # Zustand 狀態管理
│   ├── systems/       # 遊戲系統邏輯（combat, drops, pressure, regen...）
│   └── __tests__/     # Integration tests
docs/
└── design/            # 設計規格文件
```

## 設計文件

所有遊戲設計規格存放於 `docs/design/`，索引見 `docs/design/INDEX.md`。

## 開發狀態

- Phase 1~3：已完成（核心戰鬥、角色成長、裝備系統、地圖城鎮）
- Phase 4：未開始（陣營、寵物、成就）
- 百柱塔通行卷軸系統：已實作
