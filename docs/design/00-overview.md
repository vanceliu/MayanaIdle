# MayanaIdle 瑪雅那Idle

## AI 參考用遊戲企劃規格 v0.3

---

# 0. 文件用途

本文件是提供給 AI、開發輔助工具、企劃協作工具或後續程式設計參考用的遊戲規格草稿。

目標是讓 AI 在協助設計系統、資料表、戰鬥公式、技能、怪物、裝備、UI、程式架構時，能理解 MayanaIdle 的核心方向，避免生成不符合本遊戲定位的內容。

---

# 1. 遊戲基本資訊

## 1.1 遊戲名稱

中文名稱：

**MayanaIdle 瑪雅那Idle**

英文名稱：

**MayanaIdle**

## 1.2 遊戲類型

MayanaIdle 是一款以 Web 為主要平台的放置型 ARPG。

它不是傳統推關式放置 RPG，也不是卡牌收集 RPG。

遊戲核心方向是：

- ARPG 式持續戰鬥
- 隨機遇敵
- 自動戰鬥
- 手動戰鬥
- 角色養成
- 裝備詞綴
- 裝備品質培養
- 陣營競爭
- 寵物輔助
- 城鎮機能
- 公會聊天
- 排行榜
- 成就系統

## 1.3 目標平台

優先以 Web 為主。

推薦技術方向：

- 前端：React / Vite / TypeScript
- 後端：Node.js / NestJS 或 Express
- 資料庫：PostgreSQL
- ORM：Prisma
- 即時通訊：WebSocket / Socket.IO

如果要簡化 MVP，可優先使用：

- Next.js
- PostgreSQL
- Prisma
- Socket.IO

---

# 2. 核心定位

MayanaIdle 的定位是：

> 放置型 ARPG

或：

> Idle ARPG

遊戲不是單純推關，也不是離線收益為主的放置遊戲。

玩家主要會在地圖中持續狩獵怪物，透過手動或自動戰鬥獲取經驗、金幣、裝備與材料，並透過角色成長、技能學習、裝備詞綴、裝備品質與寵物系統持續變強。
