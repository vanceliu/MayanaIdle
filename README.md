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

`client` 產出 `client/dist/`，server 啟動時自動從那裡提供前端；`server` 產出 `server/dist/server.js`。

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
| `admins` | `host` | 管理員帳號，第一個是 host 帳號 |
| `registration` | `open` | `open`／`invite`／`closed` |

對外開放前，host 帳號必須先有密碼：在遊戲的 ⚙ → 帳號 設定，否則以 `bind` 非 loopback 啟動會中止。

### 服務化

server 本身不做 daemon 化與自動重啟，log 一律走 stdout／stderr。以 systemd 為例：

```ini
[Service]
ExecStart=/usr/bin/node /opt/mayana/server/dist/server.js --data-dir /var/lib/mayana
Restart=always
```

## 測試

```bash
cd client
npm test
```

## 發布

兩種產物，流程見 `docs/RELEASE.md`：

```bash
./scripts/release.sh                       # server 執行檔（三平台）→ server/release/
(cd desktop && npm run build && npm run package)   # 桌面版（macOS）→ desktop/release/
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

- Phase 1~3：已完成（核心戰鬥、角色成長、裝備系統、地圖城鎮）
- Phase 4：未開始（陣營、寵物、成就）
- 百柱塔通行卷軸系統：已實作
