# MayanaIdle - AI 協作指引

## 專案概述

MayanaIdle 瑪雅那Idle是一款以 Web 為主要平台的放置型 ARPG（Idle ARPG）。
核心玩法為 ARPG 式持續戰鬥、隨機遇敵、裝備詞綴養成、陣營競爭。

## AI 實作規則（強制）

1. **實作前必讀文件**：實作任何遊戲功能前，必須先讀 `docs/design/INDEX.md` 找到對應設計文件，完整閱讀相關章節後再動手。不可憑記憶或假設實作。
2. **不可自創規則**：所有數值、公式、成功率、消耗材料等必須來自設計文件。若文件未定義，先詢問使用者，不可自行填入數字。
3. **文件修改連動**：修改任何設計文件時，必須查 `INDEX.md` 底部的連動關係圖，同步更新所有受影響的文件。
4. **限制清單必查**：實作前必須讀 `99-ai-constraints.md`，確認不違反任何限制。
5. **新功能必寫測試**：新增功能必須同步新增 unit/integration test。
6. **不可刪除或簡化既有設計**：若設計文件有兩套獨立系統（如武器強化 vs 防具強化），必須分別實作，不可合併簡化。

## 設計規格文件

所有設計規格存放於 `docs/design/`。

- **索引文件**：`docs/design/INDEX.md` — 依功能/依限制快速查找表
- **AI 限制**：`docs/design/99-ai-constraints.md` — 59 條硬性限制
- **MVP 順序**：`docs/design/17-mvp-priority.md` — 五階段優先順序，Phase 3 已完成
- **排除系統**：`docs/design/15-excluded.md` — 不做的功能

## AI 生成內容核心限制（摘要）

完整版見 `99-ai-constraints.md`，以下為最常違反的幾條：

1. 不要設計成推關制放置 RPG
2. 不要加入離線收益、轉生系統、付費系統、被動技能
3. 裝備必須使用左手/右手雙欄位，雙手武器佔用另一隻手
4. 武器強化失敗 = 武器消失（見 `06-equipment.md` § 6.9）
5. 防具強化失敗 = 防具消失（見 `06-equipment.md` § 6.10）
6. 武器強化與防具強化是兩套獨立系統，成功率公式不同
7. 回城必須消耗回城卷軸
8. 死亡後傳送至最近城鎮，停留不自動回去

## 技術棧

- 前端：React / Vite / TypeScript
- 狀態管理：Zustand
- CSS：純 CSS + 自定義設計 token（無 Tailwind）
- 測試：Vitest + Testing Library
- 資料庫：IndexedDB (Dexie) — 目前為離線 client-only
- 未來後端：Node.js / PostgreSQL / Prisma / Socket.IO

## 開發原則

- 架構不宜過度複雜，適合個人或小團隊
- 優先以 Web 實作
- 遵循 MVP 四階段優先順序開發（見 `docs/design/17-mvp-priority.md`）
- 資料庫設計需區分裝備模板與裝備實例（見 `docs/design/18-data-schema.md`）
