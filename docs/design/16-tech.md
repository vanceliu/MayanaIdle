# 16. 技術方向

## 16.1 開發原則

使用者偏好：

- 簡單
- Web 可開發
- 適合個人或小團隊
- 不要一開始做過度複雜架構

## 16.2 目前使用技術棧

### 前端

- React
- Vite
- TypeScript
- 狀態管理：Zustand（單一 Store）
- CSS：純 CSS + 自定義 Design Token（無 Tailwind）
- 測試：Vitest + Testing Library

### 離線資料庫

- IndexedDB（Dexie）— 目前為離線 client-only

### 未來後端

- Node.js
- Express 或 NestJS
- PostgreSQL
- Prisma
- Socket.IO 或 WebSocket

## 16.3 若使用 Next.js

也可用：

- Next.js
- PostgreSQL
- Prisma
- Socket.IO

優點：

- 前後端整合快
- 適合快速做 MVP
- 適合 Web 遊戲管理介面與遊戲 UI

## 16.4 即時系統需求

需要即時功能的地方：

- 公會聊天
- 戰鬥狀態同步，若戰鬥由伺服器控制
- 排行榜更新
- 未來陣營活動
