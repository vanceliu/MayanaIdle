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

### server

- Node.js 單一 process（`97-selfhosted-server.md` § 97.2）
- WebSocket（`ws`）
- SQLite（WAL）
- 發布為 Node Single Executable Application

## 16.3 不採用

- Next.js、PostgreSQL、Prisma、Redis、Socket.IO
- 雲端全域架構（`98-online-architecture.md`，保留備查）

## 16.4 即時系統需求

需要即時功能的地方：

- 公會聊天
- 戰鬥狀態同步（server authoritative，`97-selfhosted-server.md` § 97.6）
- 排行榜更新
- 未來陣營活動
