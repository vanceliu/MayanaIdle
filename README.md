# MayanaIdle 瑪雅那Idle

Web-based Idle ARPG — 持續戰鬥、隨機遇敵、裝備詞綴養成、陣營競爭。

## 技術棧

- React / Vite / TypeScript
- Zustand（狀態管理）
- SQLite（server 端持久層，`node:sqlite`）
- Vitest + Testing Library（測試）
- 純 CSS（無 Tailwind）

## 快速開始

遊戲資料全在 server，所以要先有一台 server 才玩得起來（見下節）。開發時：

```bash
(cd server && npm install && npm run build && npm start)   # 起一台單機 server
(cd client && npm install && npm run dev)                  # 前端熱重載
```

前端開發伺服器在 `http://localhost:5173/MayanaIdle/?server=ws://127.0.0.1:25580/ws`
（`?server=` 讓 5173 的前端連到 25580 的 server）。

## 自架 server

設計規格見 `docs/design/97-selfhosted-server.md`。需要 Node 24 以上（用到 `node:sqlite`）。

### 建置

在專案根目錄執行：

```bash
(cd client && npm install && npm run build)
(cd server && npm install && npm run build)
```

`client` 產出 `client/dist/`，server 啟動時自動從那裡提供前端。
`server` 產出 `server/dist/server.js`（ESM，原始碼執行用）與 `server.cjs`（打包成單一執行檔用）。

### 執行

在專案根目錄：

```bash
node server/dist/server.js
```

或在 `server/` 目錄裡：

```bash
npm start
```

兩者都可以加 `--data-dir <path>` 換資料目錄（`npm start` 要寫成 `npm start -- --data-dir <path>`）。
不指定時是**當下工作目錄**底下的 `./data`，所以從哪裡執行就會建在哪裡。

| 項目 | 位置 |
|---|---|
| 遊戲 | http://127.0.0.1:25580/MayanaIdle/ |
| 管理介面 | http://127.0.0.1:25580/admin |
| 設定檔、SQLite、備份 | `--data-dir` 指定的目錄，未指定時為當下工作目錄下的 `./data` |

首次啟動會在資料目錄寫出 `server.properties`。停止用 `Ctrl+C`（graceful shutdown）。

### 設定

所有可調項目都在 `server.properties`，或由管理介面的「設定」頁改。常用鍵：

| 鍵 | 預設 | 說明 |
|---|---|---|
| `bind` | `127.0.0.1` | `127.0.0.1` 為單機形態（本機自動登入）；改成 `0.0.0.0` 對外開放 |
| `port` | `25580` | 監聽埠 |
| `registration` | `open` | `open`／`invite`／`closed` |
| `admin-user` | `admin` | 管理介面的帳號，**不是遊戲帳號** |
| `admin-password` | 空 | 管理介面的密碼；留空＝管理介面停用 |

全部鍵、型別與生效時機見 `docs/design/97-selfhosted-server.md` § 97.2。
未列於該表的鍵啟動時忽略並警告。

無密碼的 host 帳號只在 `bind` 與連線來源**都是**回送位址時才自動登入。

### 服務化

server 本身不做 daemon 化與自動重啟，log 一律走 stdout／stderr。以 systemd 為例：

```ini
[Service]
ExecStart=/usr/bin/node /opt/mayana/server/dist/server.js --data-dir /var/lib/mayana
Restart=always
```

## 測試

三個 workspace 各自有測試：

```bash
(cd client && npm test)
(cd server && npm test)
(cd desktop && npm test)
```

型別檢查：client 用 `npx tsc -b`（根 `tsconfig.json` 是 references 形式，`--noEmit` 是空跑），
server 與 desktop 用 `npm run typecheck`（會先產生 build 產物 `src/generated/mapsIndex`）。

## 發布

兩種產物（server 執行檔、桌面版），三平台都出，流程見 `docs/RELEASE.md`。
**正式發布一律推版本號 tag 走 CI**，三個 runner 各自原生打包自己的平台：

```bash
# 版本號改在 client/package.json，commit 之後打 tag（純版本號，不加 v）
git tag 0.7.8 && git push origin 0.7.8
```

本機打包只當試打，**預設只打這台機器的平台**：

```bash
./scripts/release.sh                 # server 執行檔 ＋ 桌面版 → server/release/、desktop/release/
./scripts/release.sh --all-servers   # server 執行檔也打另外兩個平台
```

## 專案結構

```
client/                # 前端（React；無資料庫，資料全在 server）
├── src/
│   ├── components/    # React UI 元件
│   ├── db/            # 持久層介面 + seed 資料（靜態模板）
│   ├── models/        # 資料模型（character, equipment, skill, monster...）
│   ├── net/           # 連線、協定、store 鏡像
│   ├── stores/        # Zustand 狀態管理
│   ├── systems/       # 遊戲系統邏輯（combat, drops, pressure, regen...）
│   └── __tests__/     # Integration tests
server/                # server（Node / ws / SQLite）；打包成單一執行檔
desktop/               # 桌面版（Electron 啟動器，行程內起 server）
docs/
└── design/            # 設計規格文件
```

## 設計文件

所有遊戲設計規格存放於 `docs/design/`，索引見 `docs/design/INDEX.md`。

## 開發狀態

依 `docs/design/17-mvp-priority.md`：

- 第一~三階段：已完成（核心戰鬥、角色成長、裝備系統、地圖城鎮）
- 第四階段：部分完成 —— 任務系統框架、高階技能書掉落、任務 NPC 已做；
  NPC 對話、主支線任務、成就、副本、寵物排在第五階段之後
- 第五階段（自架私服與多人）：進行中
- 百柱塔通行卷軸系統：已實作
