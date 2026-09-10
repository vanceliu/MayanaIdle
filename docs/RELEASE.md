# 版本更新與發布手冊

> 這是**操作手冊**，不是設計規格（設計規格在 `docs/design/`）。
> 發布物有兩種（`docs/design/97-selfhosted-server.md` § 97.2）：
> **桌面版**（Electron，含啟動器，給一般玩家）與 **server 執行檔**（Node SEA，給開站的人）。

---

## 1. 兩種版本

| 版本 | 位置 | 作用 | 改了會怎樣 |
|---|---|---|---|
| **發布版本** | `client/package.json` 的 `version` | 前端、server 執行檔、桌面版**共用這一個**；client 連線時比對，不合即拒連並顯示需求版本 | 舊 client 連不上新 server，反之亦然 —— 這是刻意的 |
| **DB schema 版本** | `server/src/db/sqlite.ts` 的 `MIGRATIONS` | SQLite 結構遷移，啟動時自動跑 | 執行對應的 `up()`，一次 |

沒有「資料版本淘汰」這回事：角色存在 server 的 SQLite，換版靠 schema 遷移，
不再刪角色（`19-account-character.md` § 19.9）。

**鐵則**

- 遷移只能**往後加**一個 `version`，不可改既有的那一筆
- 遷移必須冪等，失敗即中止啟動
- 上線後不可在既有 migration 上動刀；上線前可以直接改 v1（改了就要刪掉舊資料目錄重來）

---

## 2. 我改了東西，要動哪個？

| 我做的事 | 發布版本 | schema 版本 |
|---|---|---|
| 改 UI、調數值、加城鎮功能、修 bug | 照常遞增 | 不用 |
| 新增 seed 資料（怪物、裝備、道具模板） | 照常遞增 | 不用（模板隨程式碼發布） |
| 在 `Character` 等既有型別新增選填欄位 | 照常遞增 | 不用（角色以 JSON 存） |
| 新增資料表、索引，或改欄位 | 照常遞增 | **需要** |

---

## 3. 發布流程

### 3.1 正式發布：GitHub Actions

**發布一律靠 CI**（`.github/workflows/release.yml`）。三個 runner 各自原生打包自己的平台，
所以不必在本機處理跨平台那堆麻煩，也不會在硬碟上堆幾 GB 的產物。

```bash
# 版本號改在 client/package.json，commit 之後打 tag（純版本號，不加 v）
git tag 0.7.1 && git push origin 0.7.1
```

推 tag 會跑：**核對 tag 與 `client/package.json` 版本** → 型別檢查 → 三個 workspace 的測試
→ 三平台打包 → 建立 GitHub Release。基底版本對不上會直接中止（產物的版本號取自
`package.json` 而不是 tag，不擋就會發出名不副實的一包）。

想先試跑就用預發布後綴，不必改 `package.json`：

```bash
git tag 0.7.0-rc1 && git push origin 0.7.0-rc1
```

`0.7.0-rc1` 的基底版本是 `0.7.0`，檢查放行；建出來的 Release 會標成 pre-release。
想先看產物不發布，就到 Actions 頁手動觸發（`workflow_dispatch`），檔案在該次執行的 artifacts。

每個平台各兩個檔案：

| 平台 | 桌面版 | server 執行檔 |
|---|---|---|
| macOS（arm64） | `MayanaIdle-<版本>-mac-arm64.dmg` / `.zip` | `mayana-server-macos-arm64` |
| Windows（x64） | `MayanaIdle-<版本>-win-x64.zip` | `mayana-server-win-x64.exe` |
| Linux（x64） | `MayanaIdle-<版本>-linux-x64.tar.gz` | `mayana-server-linux-x64` |

**版本號取自 `client/package.json`**，桌面版、server 執行檔、前端永遠是同一個
（連線時比對的就是它）。`desktop/package.json` 的 `version` 固定寫 `0.0.0`，打包時被蓋掉 ——
要改版本只改 `client/package.json` 一處。

### 3.2 本機打包（試打用）

```bash
./scripts/release.sh                # 只打這台機器的平台
./scripts/release.sh --all-servers  # server 執行檔也打另外兩個平台（會下載對應的 node）
./scripts/release.sh --skip-tests   # 略過測試
```

**預設只打本機平台。** 跨平台的產物在本機用不到，一輪三平台會留下 2 GB 左右：
`desktop/release/`（各平台的 app 與壓縮檔）、`server/release/`、`server/.node-cache/`（下載回來的 node）。
不需要時直接刪掉這三個目錄即可，它們都在 `.gitignore` 裡。

腳本做的事，任一步失敗即中止：

| 步驟 | 對應的坑 |
|---|---|
| 工作區必須乾淨 | 未提交就打包，產物裡的版本標示會指向上一個 commit |
| `npx tsc -b`（client、server、desktop） | 根 tsconfig 是 references 形式，`tsc --noEmit` 是空跑 |
| `vitest run`（三個 workspace） | — |
| `npm run build`（client 與 server） | 前端 bundle 與 server 的 CJS bundle |
| 打包 | server 執行檔 ＋ 桌面版，產物在 `server/release/`、`desktop/release/` |

未簽章：macOS 會被 Gatekeeper 擋，自己用可 `xattr -d com.apple.quarantine MayanaIdle.app`。

---

## 4. 打包機制

Node SEA（Single Executable Application）：把 server 的 CJS bundle 與整個
`client/dist` 塞成一個 blob，注入該平台的 node 執行檔。

| 項目 | 說明 |
|---|---|
| 為什麼是 CJS | **SEA 只支援 CommonJS**。`server/scripts/build.mjs` 因此出兩份 bundle：`server.js`（ESM，原始碼執行用）與 `server.cjs`（打包用，相依全部內嵌） |
| 前端怎麼進去 | `client/dist` 的每個檔案都是一個 SEA 資產，鍵是 `client/<相對路徑>`；`server/src/staticFiles.ts` 在 SEA 模式改讀資產，從原始碼跑則讀磁碟 |
| 跨平台 | 目標平台的 node 由 `nodejs.org/dist` 下載並快取在 `server/.node-cache/`。CI 上每個 runner 只打自己的平台，所以用不到這個快取 |
| macOS 簽章 | 注入會破壞既有簽章，打包腳本會 `codesign --remove-signature` 再 ad-hoc 重簽。**在非 macOS 上打包的 macOS 執行檔無法簽章**，對方會被 Gatekeeper 擋下 |
| Windows 簽章 | postject 會印 `The signature seems corrupted!` —— node.exe 的 Authenticode 簽章因注入而失效，屬預期。未簽章的執行檔仍可執行，但 SmartScreen 會警告 |
| node 版本 | 取自打包機的 `process.versions.node`；CI 三個 runner 都用同一個 major（workflow 的 `NODE_VERSION`） |

### 桌面版（Electron）

| 項目 | 說明 |
|---|---|
| server 從哪來 | 打進主行程的 bundle 裡，**不另外帶一份 server 執行檔** —— Electron 的 Node 有 `node:sqlite` |
| 前端從哪來 | 打包前把 `client/dist` 複製成 `desktop/client-dist`，隨 app 一起包進 asar |
| 為什麼要各平台原生打 | Windows 的 exe 資源編輯要 wine、Linux 的格式要對應環境；跨平台雖然出得來，但只有原生打的才是能簽章、能裝的正常產物 |

---

## 5. 執行

### 5.1 桌面版

雙擊 app，啟動器有三個入口：單機開始、開放（開站）、連線到別人的 server。

| 東西 | 位置（macOS） |
|---|---|
| 單機世界 | `~/Library/Application Support/MayanaIdle/worlds/solo/` |
| 開放世界（可多個） | `~/Library/Application Support/MayanaIdle/worlds/open/<代號>/` |
| 最近連線清單 | `~/Library/Application Support/MayanaIdle/servers.json` |

開放世界的設定在啟動器頁面上就能改（等同編輯該世界的 `server.properties`），
不必自己去翻檔案；標「改了要重啟」的鍵下次啟動生效。

**server 跟著視窗走**：回到啟動器（⌘L）或關掉 app，server 就關了。
想長時間開站不要用桌面版，用 § 3.1 的 server 執行檔。

### 5.2 server 執行檔

```bash
./mayana-server-macos-arm64                        # 資料目錄預設 ./data
./mayana-server-macos-arm64 --data-dir ~/mayana    # 指定資料目錄
node server/dist/server.js                         # 從原始碼跑（前端讀 client/dist）
```

首次啟動會在資料目錄產生 `server.properties`（全部鍵見 § 97.2）與 `mayana.sqlite`。

| 形態 | 條件 | 行為 |
|---|---|---|
| 單機 | `bind` 是回送位址（預設 `127.0.0.1`） | 自動建立並登入 `host` 帳號，不顯示登入畫面 |
| 開放 | `bind` 是其他位址（如 `0.0.0.0`） | 每個人自己註冊、自己設密碼 |

**形態一經建立即固定**（§ 97.1）：單機世界改 `bind` 想轉開放會**拒絕啟動**，
要開開放世界請換一個乾淨的資料目錄。

---

## 6. 會遇到的問題

### 6.1 玩家卡在舊 bundle

執行檔自己 serve 前端，`index.html` 與 `sw.js` 都是 `no-cache`，只有帶 hash 的
`assets/` 是 immutable。玩家看到舊畫面時請對方強制重新整理；要確認跑哪一版，
看畫面左下角的版本標示。

### 6.2 版本不合而連不上

client 與 server 的版本不同即拒連，畫面會顯示需求版本。**兩邊是同一個執行檔出來的**，
會發生只有一種情況：瀏覽器快取到舊前端。強制重新整理即可。

### 6.3 資料目錄是舊 schema

上線前 schema 直接改在 v1 上、不補遷移，所以舊資料目錄會缺欄位。
啟動時會直接報「資料目錄是舊版 schema」並中止 —— 刪掉資料目錄重來即可。

### 6.4 macOS 打不開

未經 Apple 公證的執行檔會被 Gatekeeper 擋下。自己用可以
`xattr -d com.apple.quarantine mayana-server-macos-arm64`，或在「系統設定 → 隱私權與安全性」放行。

### 6.5 桌面版起不來（埠被占用）

啟動器會直接顯示「埠 25580 已經被別的程式占用了」並給「打開資料目錄」按鈕 ——
多半是同一台機器已經跑著一台 server。改該世界 `server.properties` 的 `port` 即可。

### 6.6 開放世界連不進來

NAT 與 port forwarding 要開服者自己開通（§ 97.9）；`bind` 要設成 `0.0.0.0`，
且防火牆放行 `port`（預設 25580）。

### 6.7 刪掉 seed 模板會讓既有裝備顯示異常

裝備實例存的是 `templateId`。移除模板後找不到對應資料，名稱與數值會缺失。
要淘汰裝備就別刪模板，改成不再掉落即可。

### 6.8 統計欄位的語意不可變更

改變既有欄位的意義（例如 `totalGoldEarned` 從「不含賣出」改成「含賣出」）
會讓所有既有紀錄的數字變成謊言，且無法回溯修正。要改語意就開新欄位。

---

## 7. 備份

角色資料全在資料目錄的 `mayana.sqlite`。玩家沒有匯出手段（§ 97.5 廢止），
備份是開服者的責任：

- 管理介面的「備份」：WAL checkpoint 後複製到 `backup-dir`
- 手動：關掉 server 後複製整個資料目錄

---

## 8. 快速檢查清單

- [ ] 已 commit
- [ ] `./scripts/release.sh` 全綠
- [ ] `server/release/` 三個檔案都在
- [ ] 本機實跑一次執行檔：建角 → 進圖 → 打一隻怪 → 關掉再開，角色還在
- [ ] 開放世界另測：兩個帳號各自註冊、能組隊與聊天
