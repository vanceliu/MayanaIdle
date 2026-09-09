# 97. 自架私服線上模式

> 狀態：**定案，實作暫緩**。單機既有功能全部完成後才開工。本文件是線上模式的唯一規格；`98-online-architecture.md` 保留備查，不採用。

---

## 97.1 定位

遊戲只有一種執行形態：**Node server + 瀏覽器 client**。單機與開放線上為同一個 server，差別只在是否對外開放連線。

| 形態 | bind 位址 | 誰能連 | 帳號 |
|---|---|---|---|
| 單機 | `127.0.0.1` | 只有本機 | host 帳號自動登入（§ 97.5） |
| 開放 | `0.0.0.0` | 任何持有 IP 的人 | host 須設密碼，其他人各自註冊 |

世界綁 server，角色綁世界：角色只存在於建立它的 server，不能帶到別的 server。

任何人取得 server 程式即可開設一個獨立世界。帳號、角色、統計、排行、交易皆限該 server 內，不跨服。

---

## 97.2 部署形態

```
單一 Node process
  ├─ HTTP  靜態檔（前端 bundle）＋ /admin
  ├─ WebSocket  遊戲通訊
  ├─ 遊戲迴圈  server authoritative
  └─ SQLite（WAL）  持久化
```

### 硬性要求

| 要求 | 規則 |
|---|---|
| 前端由 server 自己 serve | 私服無 TLS 憑證，前端掛 `https://` 時瀏覽器會擋掉 `ws://`；必須同源 |
| 單一可執行單元 | 不依賴外部 Redis / PostgreSQL |
| 版本協商 | client 連線時比對版本，不匹配即拒連並顯示需求版本 |
| client 無遊戲邏輯 | client 只做渲染、輸入與插值；所有判定在 server |

### 發布形態

| 項目 | 規則 |
|---|---|
| 產物 | 單一執行檔（Node Single Executable Application），內含前端 bundle 與靜態模板 |
| 啟動 | 雙擊後啟動 server 並開啟預設瀏覽器連 `http://127.0.0.1:<port>` |
| 設定檔 | `server.properties`，見下節；首次啟動自動產生 |
| 桌面殼（Electron 等） | 不在本版範圍 |
| 手機 | 只作為 client 連線至 server，無本機單機 |
| 平台 | Linux、macOS、Windows 各出一份執行檔；原始碼可直接 `node dist/server.js` 執行 |

### 設定檔 `server.properties`

server 的所有可調項目只有這一個來源。檔案位於資料目錄，`key=value` 格式，UTF-8，`#` 開頭為註解；首次啟動以預設值產生。

| 鍵 | 預設 | 說明 | 生效時機 |
|---|---|---|---|
| `server-name` | `MayanaIdle` | 登入畫面與管理介面顯示的名稱 | 即時 |
| `bind` | `127.0.0.1` | 監聽位址；`0.0.0.0` 為開放形態（§ 97.1） | 重啟 |
| `port` | `25580` | 監聽埠 | 重啟 |
| `max-players` | `50` | 同時在線上限（§ 97.3） | 即時 |
| `registration` | `open` | `open`／`invite`／`closed` | 即時 |
| `invite-code` | 空 | `registration=invite` 時的邀請碼 | 即時 |
| `admins` | host 帳號 | admin 帳號 username，逗號分隔（§ 97.8） | 即時 |
| `auto-open-browser` | `true` | 啟動時開啟預設瀏覽器 | 重啟 |
| `backup-dir` | `<資料目錄>/backups` | 備份檔存放目錄（§ 97.8） | 即時 |
| `gold-rate` | `1.0` | 全域金幣倍率，掉落與任務獎勵共用（`19-account-character.md` § 19.9 的 `GOLD_RATE_MULTIPLIER`） | 即時 |
| `drop-rate` | `1.0` | 全域道具掉落倍率（同上的 `DROP_RATE_MULTIPLIER`） | 即時 |
| `exp-rate` | `1.0` | 全域擊殺經驗倍率（同上的 `EXP_RATE_MULTIPLIER`） | 即時 |
| `pressure-rate` | `1.0` | Pressure 累積倍率（同上的 `PRESSURE_RATE_MULTIPLIER`） | 即時 |
| `spawn-rate` | `1.0` | 怪物生成頻率倍率（同上的 `SPAWN_RATE_MULTIPLIER`），≤ 0 為非法 | 即時 |
| `monster-hp-rate` | `1.0` | 怪物血量倍率（同上的 `MONSTER_HP_MULTIPLIER`），≤ 0 為非法；只作用於改動後新生成的怪物 | 即時 |
| `monster-attack-rate` | `1.0` | 怪物攻擊力倍率（同上的 `MONSTER_ATTACK_MULTIPLIER`），≤ 0 為非法；只作用於改動後新生成的怪物 | 即時 |
| `boss-spawn-rate` | `1.0` | Boss 生成機率倍率（同上的 `BOSS_SPAWN_RATE_MULTIPLIER`），0 = 不生成 Boss | 即時 |

- 讀取失敗或鍵值非法：印出該鍵與原因後中止啟動，不以預設值靜默帶過
- 檔案中缺少的鍵：以預設值補寫回檔案
- 未列於本表的鍵：忽略並警告
- 生效時機為「重啟」的鍵，改動後由管理介面標示需重啟，server 不自動重啟

### 命令列與 headless 執行

執行檔為一般命令列程式，行為全由 `server.properties` 決定；命令列只指定資料目錄。

| 參數 | 預設 | 說明 |
|---|---|---|
| `--data-dir <path>` | 執行檔所在目錄 | 資料目錄：`server.properties`、SQLite 檔、備份目錄 |

| 規則 | 內容 |
|---|---|
| headless | 無圖形環境（Linux 無 `DISPLAY` 與 `WAYLAND_DISPLAY`）時忽略 `auto-open-browser`，其餘行為與桌面相同 |
| 啟動輸出 | stdout 印出 server-name、連線位址、`/admin` 位址、資料目錄、目前 bind 形態 |
| log | 一律 stdout／stderr，不寫檔；交由 journald、Docker 等外層收集 |
| `SIGTERM`／`SIGINT` | graceful shutdown：拒新連線 → 全玩家強制 flush（§ 97.4）→ 關閉 SQLite → 結束 |
| 服務化 | 以 systemd、Docker 等外層工具常駐，server 本身不做 daemon 化與自動重啟 |

---

## 97.3 規模

| 項目 | 值 |
|---|---|
| 初期目標 | 10 ~ 50 人 |
| 架構目標 | 數百人 |
| `maxPlayers` | 設定檔可調，滿載拒連並回明確原因 |
| tick 間隔 | 300ms，不可設定（見 § 97.6） |

### 承載上限的判定

`maxPlayers` 上限以實測 tick 耗時決定，不預設數字。Server 必須輸出 tick 耗時監控（平均／p99／超時次數）。

單一 tick 無法完成全服計算時，依序採用：

1. tick slot 分攤 —— 玩家分配到固定 slot，單一 tick 只處理該 slot
2. delta push 合批 —— 同一 tick 內多筆變更合併成單次送出
3. in-process 事件排程 —— 以最小堆排「下次觸發時間」取代逐 tick 掃描，不使用 Redis
4. `worker_threads` 分片 —— 每個 worker 負責一段玩家，SQLite 寫入集中於主執行緒

### 頻寬

上行需求以 `98-online-architecture.md` § 10 的 1~2 KB/s/人 估算。開服者上行頻寬為開放形態的硬性門檻。

---

## 97.4 資料

| 資料 | 位置 |
|---|---|
| 帳號、角色、背包、裝備實例、倉庫 | server SQLite |
| 統計、排行榜 | server SQLite，由 server 計算 |
| 靜態模板 | 隨程式碼發布，server 啟動載入記憶體（`98-online-architecture.md` § 13 同構） |
| 天賦配置、快捷鍵、UI 偏好 | server SQLite，綁角色 |
| client 端 | 僅 UI 狀態與模板快取，無遊戲資料 |

Schema 見 `18-data-schema.md` § 18.12。

### 寫入策略

```
遊戲迴圈  →  記憶體 dirty map（per player）
              ↓ 每 5~10s batch flush（單一 transaction）
           SQLite（WAL）
```

- flush 寫最終狀態，不寫增量事件
- 強制 flush 時機：玩家登出、server graceful shutdown、進入交易前、玩家斷線超過 30 秒
- crash 最壞損失 5~10 秒進度

### Schema 遷移

- 資料結構變更以 server 啟動時的遷移腳本處理，版本號存於 SQLite
- 不做「提高版本號淘汰所有角色」；`CURRENT_DATA_VERSION` 機制廢止
- 遷移必須冪等，失敗即中止啟動，不得半套

### 排行榜

- server 全量計算後推送，範圍為本服
- 欄位與顯示規則見 `37-statistics.md` § 37.4
- 單機形態的排行榜即一人榜，不做特例；全球榜不存在

---

## 97.5 帳號與身分

各 server 各自註冊。

| 項目 | 規則 |
|---|---|
| 帳號 | username + password，server 端以 argon2id 儲存 |
| 連線憑證 | server 簽發 session token |
| 角色歸屬 | 綁 server 端帳號，不綁瀏覽器 |
| 進入流程 | 登入 → 角色選擇（`19-account-character.md` § 19.3）→ 進入遊戲 |
| 角色格數 | 沿用 `19-account-character.md` § 19.2 |
| 角色識別 | `uuid` 由 server 建立時產生，公開；無 client 端密鑰 |

### host 帳號

| 項目 | 規則 |
|---|---|
| 建立 | server 首次啟動自動建立，username 寫入 `server.properties` 的 `admins` |
| 單機形態 | bind `127.0.0.1` 時本機連線自動以 host 帳號登入，不顯示登入畫面 |
| 開放形態 | 切到 `0.0.0.0` 前必須為 host 帳號設密碼，未設即拒絕開放 |

### 本模式廢止的功能

| 功能 | 取代 | 出處 |
|---|---|---|
| 角色匯出／匯入 | 開服者備份 SQLite 檔（§ 97.8） | `19-account-character.md` § 19.9 |
| `uuid` + `authToken` TOFU 密鑰模型 | server 帳號 | `19-account-character.md` § 19.4 |
| 統計上傳與 Cloudflare Worker 全球榜 | 本服榜（§ 97.4） | `37-statistics.md` § 37.4 |
| `CURRENT_DATA_VERSION` 淘汰舊角色 | server schema 遷移（§ 97.4） | `19-account-character.md` § 19.9 |
| IndexedDB（Dexie）持久層 | server SQLite | `16-tech-frontend-architecture.md` § 32.10 |

---

## 97.6 決定性要求（硬性）

- 禁用 `Math.random()`，一律 seeded PRNG
- 禁止依賴 `Date.now()` 與幀率，遊戲時間一律以 tick 計數表示
- 數值運算使用整數或固定小數
- 遊戲邏輯為純函數，只在 server 執行；client 不含任何判定

tick 間隔固定 300ms，所有冷卻與間隔為其整數倍（`98-online-architecture.md` § 2 的對齊表）。

---

## 97.7 多人系統範圍

設計基準為 § 97.3 的架構目標人數。低人數 server 不做人數門檻或按比例結算的特例。

| 系統 | 本模式下的範圍 |
|---|---|
| 玩家可見性 | 見 § 97.7.1 |
| 聊天 | 見 § 97.7.2 |
| 陣營（`10-faction.md`） | 不做（`15-excluded.md` § 15.7） |
| 公會（`11-guild.md`） | 僅公會聊天 |
| 排行榜 | 本服範圍，見 § 97.4 |
| 交易 | 本服玩家之間，即時寫 SQLite |

### 97.7.1 地圖實例與可見性

**實例單位為隊伍**，單人視為一人隊伍。同一張地圖同時存在多個隊伍實例。

| 項目 | 規則 |
|---|---|
| 隊伍人數上限 | 5（含隊長） |
| 地圖上的人物 | 只渲染自己與隊友 |
| 非隊友 | 僅出現在該地圖的在線名單，無座標、不佔格、不參與戰鬥 |
| 怪物、Pressure、掉落 | 各隊伍實例獨立 |
| `occupationManager` | 只容納自己、隊友與本實例怪物 |

60 張既有地圖不需放大或重畫；隊伍實例即為分流單位，不另做 channel。

#### 實例生命週期與 Pressure

| 事件 | 行為 |
|---|---|
| 隊伍第一位成員進入該地圖 | 建立實例，Pressure 由 0 起算 |
| 隊伍最後一位成員離開該地圖 | 銷毀實例，Pressure 歸零 |
| 個別成員離開但實例仍有人 | 實例與 Pressure 續存，該成員回來接續 |

累積擊殺數為隊伍全體共計。`26-spawn-pressure.md` § 26.3 的「離開地圖歸零」在本模式改以實例為單位判定；一人隊伍的行為與現行單機一致。

#### 怪物上限

```
maxMonsters = min(20, 3 + Pressure + (隊伍人數 − 1) × 2)
```

單人另受 `26-spawn-pressure.md` § 26.2 的 `min(10, 3 + Pressure)` 約束，結果與現行單機相同。

| 人數 | P=0 | P=1 | P=3 | P=5 | P=7+ |
|---|---|---|---|---|---|
| 1 | 3 | 4 | 6 | 8 | 10 |
| 2 | 5 | 6 | 8 | 10 | 12 |
| 3 | 7 | 8 | 10 | 12 | 14 |
| 5 | 11 | 12 | 14 | 16 | 18 |

#### 怪物目標

目標只在判定時刻變更，判定間隔 5 秒。

| 時機 | 規則 |
|---|---|
| 初始目標 | 離怪物最近的隊伍成員 |
| 每 5 秒判定 | 候選為脫離範圍內的隊伍成員，取其中最近 5 秒傷害最高者 |
| 判定時無候選 | 取最近的隊伍成員 |
| 判定之間 | 不換目標；目標走出脫離範圍仍維持追擊至下次判定 |

仇恨範圍 8 格、脫離 15 格沿用 `25-monster-system.md` § 25.8。

#### 掉落與經驗

| 項目 | 規則 |
|---|---|
| 參與判定 | 怪物死亡時位於同一隊伍實例即算參與，不看傷害貢獻 |
| 掉落分配 | 隨機分配，模式由隊長設定：**全隊**（不在場成員也計入）或**僅參與者** |
| 經驗分配 | 僅參與者取得，平分 |

死亡即離開地圖並傳送至城鎮（`38-map-control.md` § 38.8），死亡成員不計入參與。

### 97.7.2 聊天頻道

| 頻道 | 收訊範圍 |
|---|---|
| 世界 | 全服在線玩家 |
| 公會 | 同公會成員（`11-guild.md` § 11.1） |
| 隊伍 | 同隊伍成員 |
| 城鎮 | 同一座城鎮內的玩家（`13-town.md` § 13.1） |

無陣營頻道（`15-excluded.md` § 15.7）。

---

## 97.8 管理介面

Web UI，掛在 § 97.2 的同一個 HTTP server，路由 `/admin`。沿用既有 CSS 設計 token。

### 管理員身分

| 項目 | 規則 |
|---|---|
| 認定方式 | `server.properties` 的 `admins`；host 帳號預設在列 |
| 登入 | 沿用 § 97.5 的帳號密碼與 session token，另驗 admin 旗標 |
| 數量 | 可指定多個 |

### 頁面

| 頁面 | 內容 |
|---|---|
| 狀態總覽 | tick 耗時（平均／p99／超時次數）、在線人數、連線數、隊伍實例數、SQLite 檔大小、目前 bind 位址 |
| 玩家管理 | 在線玩家列表（帳號、角色、所在地圖、隊伍實例）、踢除連線、封鎖帳號（時限或永久） |
| 帳號管理 | 帳號列表、密碼重設、註冊開關（開放／邀請碼／關閉） |
| 角色查詢 | 唯讀：等級、位置、背包、統計 |
| 信箱補償 | 發送補償信，沿用 `52-mailbox.md` |
| 備份 | 觸發 SQLite 備份、下載備份檔、graceful shutdown |
| 設定 | 讀寫 `server.properties`（§ 97.2）全部鍵；儲存即寫回檔案，生效時機為「重啟」的鍵儲存後標示需重啟 |

### 不做

- 直接修改角色資料（金幣、物品、等級）
- 修改靜態模板
- 修改資料目錄位置（只能由 `--data-dir` 指定）
- 由管理介面重啟 server

### 操作規則

| 操作 | 規則 |
|---|---|
| 踢除連線 | 先強制 flush 該玩家 dirty state，再斷線 |
| 封鎖帳號 | 立即踢除該帳號所有連線 |
| 密碼重設 | 由 admin 設定新密碼，玩家下次登入生效；不寄信、不做自助流程 |
| 備份 | 於 SQLite WAL checkpoint 後複製，不停服 |

---

## 97.9 已知限制

| 項目 | 限制 |
|---|---|
| NAT / port forwarding | 開服者須自行開通對外連線 |
| 開服者權限 | 可直接修改 SQLite，反作弊對開服者無效；跨服排行不提供 |
| 可用性 | server 關機即停服；單機形態等同關掉程式即停 |
| 備份 | 玩家無匯出手段，SQLite 檔備份由開服者負責 |
| 版本歧異 | 靠 § 97.2 版本協商阻擋 |
| 延遲 | 無 CDN 與多區域部署，取決於開服者網路位置 |
| 既有瀏覽器存檔 | gh-pages 版 IndexedDB 角色不搬移至 server |

---

## 97.10 未定案

| 項目 | 待決 |
|---|---|
| 賽季制／永恆池 | 是否引入；角色欄位 `seasonId`、`pool` 自首版即保留（`18-data-schema.md` § 18.12） |
| 聊天訊息保存 | 僅即時轉發或寫入 SQLite；保留期限 |
| 聊天字數上限與發送頻率限制 | — |
| 禁言 | 是否納入 § 97.8 管理介面 |

---

## 97.11 影響範圍

開工時第一階段先同步以下文件，之後才動程式碼：

| 文件 | 項目 |
|---|---|
| `19-account-character.md` | § 19.1 帳號為 server 帳號、§ 19.4 移除 uuid/authToken 密鑰、§ 19.9 移除淘汰與匯出匯入、全域倍率改指向 `server.properties`（§ 97.2） |
| `37-statistics.md` | § 37.4 改為本服榜，移除 Worker 架構 |
| `18-data-schema.md` | § 18.1 識別欄位、§ 18.6 持久層、新增 § 18.12 server 端 schema（含 `seasonId`、`pool`） |
| `15-excluded.md` | 新增全球排行榜為排除項 |
| `17-mvp-priority.md` | § 17.5 依 § 97.7 改列 |
| `16-tech.md`、`16-tech-frontend-architecture.md` | 技術棧改 Node + SQLite + WebSocket；§ 32.5 線上模式、§ 32.6 計時器、§ 32.10 Dexie schema 廢止 |
| `26-spawn-pressure.md` | Pressure 與 `maxMonsters` 改以隊伍實例為單位 |
| `27-drop-table.md` | 隊伍掉落分配 |
| `41-arpg-combat.md`、`25-monster-system.md` | 怪物目標選擇擴及隊伍成員 |
| `38-map-control.md` | § 38.14 改為「只顯示隊友，非隊友僅名單」、`occupationManager` 容納隊友、怪物生成與移動移至 server |
| `45-legacy-archive.md` | 觸發來源隨 `CURRENT_DATA_VERSION` 廢止，是否隨賽季制重啟見 § 97.10 |
| `47-mobile.md` | 手機只作 client，§ 47.9 PWA 離線不含遊玩 |
| `52-mailbox.md` § 52.2.3~52.2.4 | 補償紀錄與版本範圍改以 server 端角色資料判定 |
| `35-inventory-constraints.md` | 背包操作改為 client 請求 → server 判定 |
| `docs/RELEASE.md` | 部署流程改為 server 執行檔發布；gh-pages 與 Worker 流程移除 |
| `INDEX.md`、`CLAUDE.md` | 查找列、連動關係、技術棧 |
