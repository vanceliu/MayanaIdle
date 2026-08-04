# 版本更新與部署手冊

> 這是**操作手冊**，不是設計規格（設計規格在 `docs/design/`）。
> 每次要改版本號或部署前，先照這份文件走一遍。

---

## 1. 三種版本，各管各的

專案裡有三個互不相干的「版本」，混淆它們是最常見的錯誤來源。

| 版本 | 位置 | 作用 | 改了會怎樣 |
|---|---|---|---|
| **資料版本** `CURRENT_DATA_VERSION` | `client/src/config.ts`<br>`leaderboard-worker/src/index.js` | 淘汰舊角色、失效排行榜舊資料 | **所有舊角色被刪除**（先封存為遺產），舊匯出檔失效 |
| **DB schema 版本** `this.version(n)` | `client/src/db/database.ts` | IndexedDB 結構遷移 | 執行該版的 `upgrade()`，只跑一次 |
| **建置版本** | `client/package.json` + git SHA | 只用於畫面左下角顯示 | 無功能影響 |

**鐵則**

- 資料淘汰**只能**用 `CURRENT_DATA_VERSION`，不可寫在 Dexie 的 `upgrade()` 裡（限制第 73 條）
- Dexie 版本**只能往上加**。已經跑過 v13 的瀏覽器，你再去改 v13 的內容也不會重跑
- 客戶端與 Worker 的 `CURRENT_DATA_VERSION` 必須**永遠相同**

---

## 2. 我改了東西，要動哪個版本？

| 我做的事 | 資料版本 | DB schema 版本 |
|---|---|---|
| 改 UI、調數值、加城鎮功能、修 bug | 不用 | 不用 |
| 新增 seed 資料（怪物、裝備、道具模板） | 不用 | 不用（seed 會自行 upsert） |
| 在 `Character` 等既有型別**新增選填欄位** | 不用 | 需要（補預設值給既有資料） |
| 新增 IndexedDB 資料表 | 不用 | 需要 |
| 改變既有欄位的**意義**或必填性 | **需要** | 視情況 |
| 舊角色在新規則下會壞掉或卡住 | **需要** | 不用 |

判斷準則：**舊角色繼續玩下去會不會出現錯誤或不公平**。
會 → 提高資料版本；不會 → 不要動，玩家的存檔比什麼都重要。

---

## 3. 流程 A：一般部署（不動任何版本）

最常見的情況。**直接跑腳本即可**：

```bash
./scripts/deploy.sh              # 完整流程
./scripts/deploy.sh --dry-run    # 只跑檢查與建置，不推上 gh-pages
```

腳本把 § 8 的檢查清單寫成程式，任一項失敗就中止：

| 檢查 | 對應的坑 |
|---|---|
| 工作區必須乾淨 | § 7.5 未提交就 build，版本標示會指向上一個 commit |
| client 與 Worker 的 `CURRENT_DATA_VERSION` 相同 | § 7.1 版本落差 → 所有寫入回 409 |
| 最近一次 commit 動過 `config.ts` 就要求確認 | 那多半是流程 C，Worker 必須先部署（§ 5.3） |
| `tsc -b`（不是 `--noEmit`） | 根 tsconfig 是 references 形式，`--noEmit` 是空跑 |
| `vitest run` 全過 | — |
| 產物內嵌的 SHA 等於 HEAD | 建置用到快取或取不到 git 資訊時會靜默出錯 |
| 線上 bundle 的 SHA 等於 HEAD | § 7.2 確認真的發佈成功 |

線上驗證刻意**不比對 `index.html`** —— 它有 `max-age=600`，
CDN 邊緣節點可能還握著舊副本，那不代表部署失敗。

以下是腳本實際做的事，手動執行時照這個順序：

```bash
# 1. 先 commit（建置版本標示取的是最後一個 commit 的 SHA，未提交的改動會讓標示指錯）
git add -A && git commit -m "..."

# 2. 驗證
cd client
npx tsc -b          # 一律用 tsc -b，tsc --noEmit 在這個 repo 是空跑
npx vitest run

# 3. 建置並部署
npm run build
npm run deploy      # gh-pages -d dist，不會動到 main
```

部署後在畫面左下角確認版本標示的 SHA 與剛才的 commit 一致。

---

## 4. 流程 B：DB schema 變更

在 `client/src/db/database.ts` 最後面**新增**一個版本，不要改既有的：

```ts
this.version(14).stores({
  newTable: '++id, someIndex',
}).upgrade(async tx => {
  await tx.table('characters').toCollection().modify(char => {
    if (char.newField == null) char.newField = defaultValue;
  });
});
```

- 只加索引/資料表 → `stores({...})` 即可，不需要 `upgrade()`
- 要補既有資料的欄位 → 用 `upgrade()`，且**必須冪等**（判斷 `== null` 再寫）
- **不可**在 `upgrade()` 裡刪除玩家資料

之後照流程 A 部署。

---

## 5. 流程 C：提高資料版本（會刪光所有角色）

> ⚠️ 不可逆。所有玩家的角色都會被淘汰，只留下唯讀的遺產紀錄。
> 執行前先確認這是必要的（見 § 2）。

### 5.1 改程式碼

```ts
// client/src/config.ts
export const CURRENT_DATA_VERSION = 4;   // 2 → 3 → 4

// leaderboard-worker/src/index.js
const CURRENT_DATA_VERSION = 4;          // 必須同時改，數字相同
```

在 `docs/design/19-account-character.md` § 19.9 的「版本沿革」表補一列，寫清楚為什麼要淘汰。

### 5.2 驗證

```bash
cd client && npx tsc -b && npx vitest run
```

### 5.3 部署（順序很重要）

```bash
# 1. Worker 先上（若同時有 D1 schema 變更，先跑 § 6）
cd leaderboard-worker
npx wrangler deploy

# 2. 立刻接著部署 client
cd ../client
npm run build && npm run deploy
```

**為什麼 Worker 要先**：Worker 舊、client 新的話，新客戶端送出的新版本號會被 Worker 拒絕；
反過來 Worker 新、client 舊，舊客戶端也會被拒絕。兩種順序都有落差窗口，
但 Worker 先上的窗口比較短（client 部署後 gh-pages 生效約 1~2 分鐘），
而且此時舊客戶端本來就該被淘汰。

落差期間玩家會看到「遊戲已更新，請重新整理頁面後再建立角色」，重新整理即可解決。

### 5.4 部署後確認

- 開一個全新的瀏覽器 profile → 應直接看到 4 個空的角色格
- 原有玩家 → 角色消失、角色選擇畫面出現「📜 遺產」入口，內容完整
- 舊角色的名字應該可以被新角色重新使用
- 排行榜上不應再出現舊版本的角色

---

## 6. D1 schema 變更

D1 沒有自動遷移，必須手動下指令，而且**要在部署 Worker 之前跑完**
（Worker 新程式碼查詢不存在的欄位會直接 500）。

```bash
cd leaderboard-worker

# 加欄位（一定要給 DEFAULT，既有列才填得進去）
npx wrangler d1 execute mayanaidle --remote --command \
  "ALTER TABLE character_stats ADD COLUMN new_col INTEGER NOT NULL DEFAULT 0;"

# 加索引
npx wrangler d1 execute mayanaidle --remote --command \
  "CREATE INDEX IF NOT EXISTS idx_new_col ON character_stats(new_col);"

# 確認結果
npx wrangler d1 execute mayanaidle --remote --command \
  "SELECT name FROM pragma_table_info('character_stats');"
```

`--remote` 不能省略，省略會下在本機模擬的資料庫上，線上完全沒變。

同時要更新 `leaderboard-worker/schema.sql`，讓它永遠代表「從零建表」的最新樣貌。

---

## 7. 會遇到的問題

### 7.1 版本落差 → 所有寫入回 409

**症狀**：建立角色失敗、統計上不去，畫面顯示「遊戲已更新，請重新整理頁面」。
**原因**：客戶端與 Worker 的 `CURRENT_DATA_VERSION` 不一致。
**處理**：把落後的那一邊部署上去。這是**設計上的耦合**，兩邊必須成對更新。

### 7.2 玩家卡在舊 bundle

**症狀**：明明部署了，某個玩家的行為還是舊版；或持續看到 409。
**原因**：Vite 產出的 JS/CSS 檔名帶 hash，真正會被快取住的是 `index.html`。
**處理**：請玩家強制重新整理。要確認對方跑哪一版，看畫面左下角的版本標示。

### 7.3 回滾會讓 Dexie 拋 VersionError

**症狀**：回退部署後，玩家看到「無法啟動遊戲 —— 此瀏覽器的存檔是由較新版本建立的，
目前載入的是舊版程式。請重新整理頁面取得最新版本。」
**原因**：瀏覽器的 IndexedDB 已經升到 v14，舊 bundle 只認得 v13，Dexie 拋 `VersionError`。
**處理**：**不要回滾已經含 DB 版本變更的部署**，往前修比較安全。
玩家端強制重新整理即可（前提是新版已經在線上）。

開機流程的錯誤已由 `App.tsx` 的 `describeInitError()` 統一轉譯並顯示，
不會再靜默卡在標題頁；`QuotaExceededError`（空間不足）與無痕模式下的
`InvalidStateError` / `SecurityError` 也有各自的提示。

### 7.4 舊的匯出檔一併失效

提高資料版本會**同時**提高匯入門檻（`characterTransfer.ts` 用同一個常數），
所有既有的 `.dat` 備份都會顯示「匯入資料版本過舊」。
這是刻意的 —— 否則玩家能用舊備份把已淘汰的角色救回來，繞過淘汰機制。
若哪天想留後路，得把「淘汰門檻」與「匯入門檻」拆成兩個常數。

### 7.5 忘記 commit 就 build

版本標示會指向**上一個** commit，之後追問題時會被誤導。一律先 commit 再 build。

### 7.6 Turnstile 被擋 → 完全無法建立角色

建立角色是**硬性阻擋**：Turnstile 過不了就不給建。
自動化瀏覽器、部分隱私擴充套件、企業網路都可能擋掉 `challenges.cloudflare.com`。
玩家回報「建不了角色」時，先問是不是裝了阻擋類擴充套件。

註：Turnstile 的 iframe 自己會在 console 印一堆 CSP 相關紅字（`Refused to execute a script`、
`Refused to load blob:`、`Blocked a frame with origin`），**那些是雜訊**，不是我們的頁面出錯。

### 7.7 刪掉 seed 模板會讓既有裝備顯示異常

裝備實例存的是 `templateId`。移除模板後 `resolveEquipment` 找不到對應資料，
會回傳未解析的實例，名稱與數值缺失。要淘汰裝備就別刪模板，改成不再掉落即可。

### 7.8 統計欄位的語意不可變更

遺產快照保存了不同時期的統計數值。改變既有欄位的意義
（例如 `totalGoldEarned` 從「不含賣出」改成「含賣出」）會讓**所有舊快照的數字變成謊言**，
且無法回溯修正。要改語意就開新欄位（限制第 77 條）。

### 7.9 localStorage 不會因部署而清除

`mayana_leaderboard_snapshot`（排行榜快取，10 分鐘）與
`mayana_stats_upload_<uuid>`（上傳節流戳記）在部署後仍然存在。
測試排行榜相關改動時，記得手動清掉或換一個瀏覽器 profile，否則會看到舊資料而誤判。

### 7.10 D1 寫入額度

寫入端與活躍玩家數成線性關係，每位玩家每天最多 144 次寫入。
免費方案每日 10 萬列寫入，換算約 700 名日活躍玩家會觸頂。
逼近時的處理順序見 `docs/design/37-statistics.md` § 37.4.6。

---

## 8. 快速檢查清單

一般部署：**跑 `./scripts/deploy.sh` 即可，以下每項都由腳本自動檢查。**

- [ ] 已 commit
- [ ] `npx tsc -b` 無錯
- [ ] `npx vitest run` 全過
- [ ] `npm run build && npm run deploy`
- [ ] 線上版左下角的 SHA 正確

提高資料版本時，額外加上：

- [ ] `config.ts` 與 Worker 的常數**數字相同**
- [ ] `19-account-character.md` § 19.9 版本沿革已補一列
- [ ] D1 schema 變更已用 `--remote` 跑完
- [ ] Worker 先部署，client 緊接著部署
- [ ] 全新 profile 測試：可建立角色、可上榜
- [ ] 既有玩家測試：角色已淘汰、遺產頁內容完整、原名可重用
