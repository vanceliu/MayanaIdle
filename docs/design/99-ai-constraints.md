# 99. AI 生成內容時的總限制

## 99.1 限制清單

**這裡只放設計文件裡查不到的規則。** 所有能在設計文件讀到的規格（數值、公式、機制）
一律去該文件看，不在此重述 —— 重述必然與來源不同步。功能對應哪份文件見 `INDEX.md`。

1. 陣營只有艾爾薩斯王國與瓦爾登聯邦兩個，**不可新增第三陣營**（陣營規則見 `10-faction.md`）
2. **不可設計等級突破或覺醒系統**（等級無硬上限，見 `04-character.md` § 4.9）
3. 裝備模板一律**用 id 查表，不可用名字查**（禁用 `db.equipmentTemplates.where('name')`）——
   seed 換過 id 的品項會在玩家 IndexedDB 留下同名舊列，名字查表會撈到舊數值。
   孤兒模板由 `client/src/db/seed/purgeStaleTemplates.ts` 在每次 seed 後清除
4. 新手裝名單**只有 seed 一個來源**：`acquireType: 'starter'` + `requiredClass`
   （無 `requiredClass` = 全職業共用）。不可在程式碼另立硬編名單
5. 傳進戰鬥系統的 `equippedGear` 是**陣列，順序＝instance id 插入順序，不是部位順序**。
   取手持武器一律用 `systems/combat.ts` 的 `getEquippedWeapon()`，**禁用 `equippedGear[0]`** ——
   換掉新手武器後會靜默取到防具，武器基傷／額外攻擊／材質克制全部失效且不報錯
6. 技能的 `requiredWeaponType`（如三連射的【需裝備弓】）是**實際限制**，
   由 `scriptRunner.ts` 的 `meetsWeaponRequirement()` 在腳本選招時擋下，
   不可退化成只在 tooltip／Wiki 顯示的裝飾字
7. 背包／倉庫一律**用道具 id 查，不可用名字查**（禁用 `characterBag.where({ name })`、
   `bagItems.find(b => b.name === ...)`）—— 道具改名後舊名對不上，玩家存量等於消失。
   `BagItem.name` 與 `type` 是由 `itemId` 反查 seed 產生的顯示快取，一律經
   `models/bagItem.ts` 的 `makeBagItem()` 產生，不可手寫。
   同理，**設定表指涉道具或裝備一律存 id**（卷軸、狀態解除道具、印記、技能書、
   `craftMaterials`、`craftPrerequisiteWeapon`、任務獎勵、快捷鍵設定），名稱只用於顯示。
   共用倉庫的**金幣不是物品**，存在獨立的 `warehouseGold` 表，不混進倉庫物品表。
   唯一例外是 `getRequiredScrollItemId()` 依樓層區段組出卷軸名再換 id，
   換算只發生在該函式內，且由 `itemIdIntegrity.test.ts` 全段掃過

## 99.2 進行中的分階段計畫（完成後刪除）

### 近戰判定改為相鄰格

定案規格：

- 近戰（射程 ≤ 1.5）的出手判定與落腳格判定一律**以格為單位判相鄰**（含斜角，Chebyshev ≤ 1），
  不用真實座標的歐氏距離
- 射程 > 1.5（技能、弓）維持真實座標歐氏距離
- 出手判定與落腳格判定**必須用同一個函式**，不可各寫一份
- 玩家與怪物同一條規則
- 成因：角色停在格與格之間時真實距離可能是 1.52，剛好超出 1.5，而
  `findAttackPosition` 的起點格只用真實座標判一次 → 回 null → 目標被清掉 →
  重選同一隻 → 不出手也不移動的死結

階段：

1. 共用判定函式 `isWithinAttackRange()`（`systems/lineOfSight.ts`）
2. 玩家側接上：`playerCombatFSM`（出手／已就位）、`pathfinding`（`findAttackPosition`／`isAttackPosition`）、`targeting`（射程 gate）
3. 怪物側接上：`monsterCombatFSM` 的 inRange、`gameLoop` 的停下距離與「附近有怪」判定
4. 測試：更新 `movementDeadlock.test.ts` 至新規則，新增死角掃描回歸（各地圖死角數必須為 0）
5. 文件同步：`41-arpg-combat.md` § 3.1／§ 4.3、`38-map-control.md` § 38.5／§ 38.7、`25-monster-system.md` § 25.8

### 強化入口從鐵匠鋪搬到背包

定案規格：

- 強化改由背包點卷軸執行，鐵匠鋪只留裝備製作與製作追蹤
- 卷軸兩段式點擊後進入「指定目標」模式，log（`system` 頻道）提示選擇目標，結果亦進 log
- 取消：Esc、再點該卷軸、點不可強化的目標。模式中所有點擊由模式接管，不觸發原本的使用／裝備
- 可指定範圍＝背包內（含裝備中），倉庫不可
- **無確認框**，點下即結算
- 背包分頁列工具列新增「機率」按鈕，同一套指定目標模式；點裝備開視窗，列出普通／＋／－ 三種卷軸的判定格、成功率、失敗後果
- 強化演出（`48-vfx.md` § 48.4）錨定到背包格
- 野外可強化。新手 NPC 強化分頁不變
- 武器強化與防具強化維持兩套獨立公式

階段：

1. 強化結算抽成 `systems/` 模組 + store action（三種卷軸判定、統計計數、裝備消失），鐵匠鋪改呼叫新路徑，行為不變
2. 背包指定目標模式（狀態機、log、取消、非法目標、與拖曳／右鍵互斥）接上 action
3. 強化演出錨定背包格，沿用 `useOneShotFx`，樣式仍只在 `App.css`
4. 機率按鈕與視窗
5. 移除鐵匠鋪強化分頁
6. 文件同步：`35-inventory-constraints.md` § 35.5.1／§ 35.13、`13-town.md` § 13.5、`34-ui-guidelines.md`、`48-vfx.md` § 48.4、`39-batch-sell.md`、`17-mvp-priority.md`、`INDEX.md`

### 全域倍率（單機版落點 `client/src/config.ts`）

定案規格：`19-account-character.md` § 19.9 的 8 個倍率，作用位置各在其標明的公式。

階段：

1. `config.ts` 新增 `EXP_RATE_MULTIPLIER`、`PRESSURE_RATE_MULTIPLIER`、`SPAWN_RATE_MULTIPLIER`、`MONSTER_HP_MULTIPLIER`、`MONSTER_ATTACK_MULTIPLIER`、`BOSS_SPAWN_RATE_MULTIPLIER`，預設 1.0
2. 掉落：`drops.ts` 金幣單次上限 500 × 倍率；天賦格改只吃 `DROP_RATE_MULTIPLIER`（`gameStore` 呼叫端）；印記走完整掉寶倍率的回歸測試
3. 經驗與任務金幣：擊殺結算 × `EXP_RATE_MULTIPLIER`（`gameStore`）；冒險者工會金幣獎勵與印記交付金幣 × `GOLD_RATE_MULTIPLIER`（`adventurerQuestSystem.ts`）
4. 怪物：`pressure.ts` 累積擊殺數 × 倍率；`mapMonsterStore` 生成間隔與 Boss 機率；`monsterSpawn.ts` HP 與攻擊力區間
5. 每個公式的 unit test 以參數注入倍率驗證；`tsc -b` 與 `vitest run` 全過

### 形態鎖定與管理帳號分離

定案規格（推翻 § 97.1「單機與開放只差 bind」與 § 97.8「admin 是帳號旗標」的部分）：

- **資料目錄的形態一經建立即固定**：首次啟動時依 `bind` 判定為單機或開放並寫入資料庫；
  之後 `bind` 改成另一種形態即**拒絕啟動**，不是照常跑
- **管理帳號與遊戲帳號完全分離**：`/admin` 走 `server.properties` 的 `admin-user`／`admin-password`，
  不在 `users` 表裡，遊戲帳號不再有 admin 旗標
- 管理介面的職責是管玩家帳號（列表、重設密碼、封鎖）與 server 本身，不是玩遊戲
- 單機的 host 遊戲帳號**不需要密碼**：只有本機連得進來，而且永遠不會變成開放
- `admins`、`host-password` 兩個鍵移除

階段：

1. [x] `server_meta` 表存形態；啟動時比對 `bind`，不符即中止並說明
2. [x] `admin-user`／`admin-password` 取代 `admins`／`host-password`；`users.is_admin` 移除
3. [x] 管理介面改用設定檔憑證與自己的 session；帳號管理維持管玩家帳號
4. [x] client：移除 `isAdmin` 相關顯示，host 不顯示密碼表單
5. [x] 測試與文件同步（§ 97.1、§ 97.2、§ 97.5、§ 97.8、`18-data-schema.md` § 18.12）

### 自架私服（`97-selfhosted-server.md`）

定案規格：97 全文。硬性約束：

- 單位模型必須預留「非玩家友方單位」（寵物）與「非模板敵方單位」（召喚物）兩個型別位置，實作留空（`25-monster-system.md` § 25.10 的成對原則不受影響）
- 每階段結束 `tsc -b` 與 `vitest run` 全過，既有單機行為在 1 人隊伍下不變
- 300ms tick 改動操作手感，先出 demo 調校頁定案再接進遊戲

階段：

1. **核心抽離**
   - [x] seeded PRNG：`core/rng.ts`，遊戲邏輯不再呼叫 `Math.random`（測試以 `setupRng.ts` 接回 `Math.random` 讓既有 spy 有效）
   - [x] tick 時鐘：`core/clock.ts`，判定用時間全走 `gameNow()`；wall clock 只剩離線時長、建立時間、信箱
   - [x] 固定步長：`systems/tickDriver.ts`（累積、補跑上限 5、alpha 插值），store 帶上一 tick 位置
   - [x] 調校頁 `client/demo/tick.html`：每幀／固定 tick／固定 tick＋插值三模式，**等使用者確認後才接進 `PixiGame`**
   - [x] 會話：`stores/session.ts`，六個 store 改為工廠 `createXStore(session)`，`gameLoop`／`arpgEventHandler`／`enhanceScroll` 以 session 取 store；迴圈跨 tick 狀態進 `session.loop`
   - [x] 回復與常駐天賦的 `setInterval` 併入 `gameLoopTick`（`tickRegen`／`tickPersistent`）
   - [x] Dexie 存取抽成 `db/repository.ts` 介面；client 實作 `db/dexieRepository.ts`（偏好與排列暫仍存 localStorage）
   - [x] `PixiGame` 的 `tickArpgCombatLoop` 拆為 `systems/combatLoop.ts`（模擬，回傳 `CombatVisual[]`）與 `renderCombatVisuals`（渲染）
   - [x] 地圖來源可注入（`models/mapSource.ts`；client 用 Vite glob，server 用內嵌索引）；全域倍率改 `core/rates.ts` 執行期可覆寫
   - [ ] 單位模型（玩家／隊友／怪物／預留寵物與召喚物）→ 併入第 4 階段
   - [ ] 模組級佇列（`dropQueue`／`saveQueue`／`talentInitPromise`）與 `selfCastFx` 佇列改為每 session 一份 → 併入第 3 階段
2. **server 骨架**（`server/`，esbuild 打包成 `dist/server.js`）
   - [x] `config.ts`：`server.properties` 讀寫、驗證、補預設；`db/sqlite.ts`：schema v1 與遷移；`db/sqliteRepository.ts`：`GameRepository` 的 SQLite 實作，靜態模板載入記憶體
   - [x] `auth.ts`：argon2id（hash-wasm）、session token、host 帳號、封鎖；`ws.ts`：版本協商、host 自動登入、註冊／登入／resume、角色列表／建立／選擇／刪除、allowlist 的 store action RPC
   - [x] `playerSession.ts`：一連線一 session（六個 store 實例＋loop＋combat）、進入世界流程、頂層鍵參照比對的 delta；`tick.ts`：300ms 全服 tick、耗時統計、`combat`／`visuals` 推送
   - [x] `http.ts`：同源靜態檔、`/api/version`、`/api/status`；`index.ts`：`--data-dir`、headless、graceful shutdown、自動開瀏覽器
   - [ ] dirty map 5~10s 批次 flush（目前沿用 `saveState` 逐筆寫入）
   - [ ] 私服版本協商改為獨立的協定版本，不綁 client 顯示版本
3. **client 變薄**（線上模式；沒有 server 時仍是現行單機版，兩條路徑並存到第 7 階段切換）
   - [x] `net/protocol.ts`（client／server 唯一出處）、`net/connection.ts`（hello 版本協商、resume、重連、RPC）、`net/mirror.ts`（`patch` 直接 `setState`、`combat` 進 `defaultSession.combat`、`visuals` 佇列、store action 換成 RPC 代理）、`net/online.ts`（同源 `/api/version` 探測，開發可用 `?server=ws://host:port/ws`）
   - [x] `LoginScreen`：開放形態的登入／註冊；單機形態由 host 自動登入
   - [x] `App` 線上開機：本機只留模板快取（seed → Dexie → `loadTemplateCache`），角色與遊戲資料全在 server
   - [x] `PixiGame`／`BattleView` 線上模式不跑模擬：`prev→cur` 位置插值、`visuals` 演出、詠唱進度來自 server
   - [x] 商店購買、鐵匠鋪製作、印記師、新手 NPC 領取／強化、背包強化改為 store action（`buyShopEquipment`／`craftEquipment`／`applySigil`／`claimStarterGear`／`enhanceStarterGear`／`enhanceWithScroll`），元件不再直接寫持久層
   - [x] 瀏覽器實測：host 自動登入 → 建角 → 城鎮 NPC → 曙光草原自動戰鬥、掉落、經驗，全部由 server 判定，無 console error
   - [x] 移除 Dexie 遊戲資料、`CURRENT_DATA_VERSION`、匯出匯入、Worker 上傳（於第 7 階段拆除）
   - [ ] 模組級佇列（`dropQueue`／`saveQueue`／`talentInitPromise`／`selfCastFx`）改為每 session 一份
   - [ ] 天賦背包順序（`models/talentBag.ts`）仍在 localStorage；線上模式應進 server 偏好
   - [ ] 常駐天賦的自身施法特效（`selfCastFx`）在線上模式沒有演出（server 端只清佇列）
4. **隊伍與地圖實例**（§ 97.7.1、§ 97.7.3）
   - [x] 4a `systems/mapInstance.ts`：`MapInstance`（成員、共用 `mapMonster` store、怪物實例、FSM context、佔位表、擊殺數、目標選擇表）、`attachInstance`／`detachInstance`／`leaveInstance`；本機 `defaultSession.instance` 為一人實例；`paused` 改為每玩家（`mapControl`）
   - [x] 4b 迴圈拆兩層：`gameLoop`（`tickPlayerPre`／`tickInstanceWorld`／`tickPlayerPost`）、`combatLoop`（`tickInstanceCombat`／`tickMemberCombat`／`applyMonsterAttacks`）、`systems/worldTick.ts`；怪物移動與 FSM 以目標成員為準；server 時鐘每 tick 只推進一次；`selfCastFx` 每 session 一份並以 `self_cast` 演出
   - [x] 4c 怪物目標選擇 `systems/monsterTargeting.ts`：5 秒判定、脫離範圍內最近 5 秒受傷最高、無候選取最近、死亡／離線立即重選、詠唱中止
   - [x] 4d `processMonsterDeath` 加 `MonsterDeathOptions`（經驗平分、接收者掉落、實例擊殺數、擊殺區域）；`handleMonsterDeath` 依隊長模式挑接收者；`partyMaxMonsters`
   - [x] 4e server：`party.ts`、`instances.ts`、`world.ts`；`party` store 鏡像與 RPC；隊友位置、同圖在線名單；`/api/status` 加實例與隊伍數
   - [x] 4f client：`stores/partyStore.ts`、隊友剪影（綠色標記）、`CombatVisual.memberId`、隊伍 HUD、隊伍面板（線上模式才有按鈕；邀請可點在線名單或輸入角色名稱）
   - [x] 4g `models/unit.ts`：`UnitKind` 含 `pet`／`summon`，佔位表型別改用它
   - [x] 測試：client 289 檔／3484 測試、server 33 測試；兩分頁瀏覽器實測成隊、同圖共用怪物、經驗平分、HUD
   - 待使用者決定：一人實例的擊殺數以角色 `areaKills` 起算（重登不歸零，與現行單機一致）；§ 97.7.1「在場人數歸零即銷毀、Pressure 歸零」在重登情境與此相衝
5. **社交**
   - [x] 5a 聊天（§ 97.7.2）：協定 `chat` 訊息與 `chat.send` RPC、`World.handleChat` 依頻道路由（公會頻道回「尚無公會」）、`stores/chatStore.ts`、聊天面板（線上模式才有、點名稱設為密語對象）
   - [x] 5b 交易：`systems/trade.ts`（放入驗證、收下判定、換手）、server `trade.ts`（提出／接受／放入／鎖定／雙方確認／取消，改動即解除鎖定，離線取消）、`stores/tradeStore.ts`、交易面板；新手裝不可交易
   - [x] 5c 排行榜：server `leaderboard.ts` 由 SQLite 即時算欄位 top-N 聯集（`value DESC, uuid ASC`）、`leaderboard` 訊息；統計中心線上模式改向 server 請求並快取 10 分鐘、不上傳
   - [x] 5d 信箱補償：線上模式的換版清理與補償判定跑在 server 的 session（`gameStore` 初始化），版本以 server bundle 的 `BUILD_INFO.version` 為準
   - [x] 測試：client 291 檔／3509 測試、server 37 測試；瀏覽器實測世界聊天雙向、交易完成後 SQLite 換手、排行榜由本服計算
   - 未做（§ 97.10 未定案）：聊天保存、字數上限、發送頻率限制、禁言
6. **管理介面**（§ 97.8）
   - [x] 6a server `admin.ts`：`/admin` 頁與 `/admin/api/*`；沿用帳號密碼與 session token，另驗 admin 旗標
   - [x] 6b 狀態總覽：tick 平均／p99／超時、在線人數、連線數、實例數、隊伍數、SQLite 檔大小、bind
   - [x] 6c 玩家管理：在線列表、踢除（先 flush 再斷線）、封鎖（作廢 session 並踢除該帳號全部連線）
   - [x] 6d 帳號管理：列表、密碼重設（重設即作廢舊 session）、註冊開關；client 設定視窗加「帳號」區可自行設定密碼（單機 host 要有密碼才進得了管理介面）
   - [x] 6e 角色查詢（唯讀）：列表、搜尋、明細（背包、裝備、統計）
   - [x] 6f 信箱補償：標題＋sourceKey＋天賦格階級，可指定單一角色或全體；`sourceKey` 對角色唯一，重複自動跳過；在線收件者即時刷新
   - [x] 6g 備份：WAL checkpoint 後複製到 `backup-dir`；graceful shutdown
   - [x] 6h 設定頁：讀寫 `server.properties` 全部鍵，`restart` 的鍵儲存後回報需重啟，`live` 的鍵即時生效
   - [x] 測試：server 47 測試（含 admin 10 項）；瀏覽器實測七個分頁、踢除、備份、補償發送
   - 未做（§ 97.8「不做」）：改角色資料、改靜態模板、改資料目錄、由介面重啟
   - 備份檔下載：目前只在 server 主機的 `backup-dir` 產生檔案，管理介面不提供下載端點
7. **發布**
   - [x] 7a server bundle 改 CommonJS（SEA 只支援 CJS）並內嵌 `hash-wasm`／`ws`，不再 external
   - [x] 7b client dist 以 SEA 資產內嵌；`http.ts` 在 SEA 模式讀 `node:sea`，從磁碟跑時行為不變
   - [x] 7c `server/scripts/package.mjs`：linux-x64／darwin-arm64／win-x64 三份執行檔（取對應平台的 node、postject 注入、macOS 重簽），產物放 `server/release/`；三平台實測產出，macOS 版實跑過（建角、移動、戰鬥、掉落）
   - [x] 7d client 拆掉單機路徑：Dexie（含 `database.ts`／`dexieRepository.ts`／遷移）、`CURRENT_DATA_VERSION`、資料版本淘汰、遺產封存、TOFU 密鑰、排行榜上傳與 Turnstile 全部移除；裝備與怪物模板改由 bundle 內的 seed 直接進記憶體；測試改用 `db/memoryDb.ts` ＋ `testing/testDb.ts`
   - [x] 7e `docs/RELEASE.md` 整份改寫為執行檔發布流程；`scripts/deploy.sh` → `scripts/release.sh`（gh-pages 發布移除）
8. **文件收尾**：§ 97.11 實作時處理的三項；刪除 § 32.10
9. **桌面啟動器**（§ 97.2 發布形態；使用者定案：桌面殼納入範圍）
   - 定案規格：啟動器三個入口 —— 單機開始／開放開站／連線到別人的 server；單機與開放各自資料目錄，形態鎖定規則不變；連線模式不起本機 server；最近連線清單存本機、可命名可刪。打包範圍先只做 macOS
   - [x] 9a server：`main()` 拆出 `startServer(options)`（回傳可關閉的把手），命令列行為不變
   - [x] 9b `desktop/`：Electron 主行程（TS ＋ esbuild）、啟動器頁面、IPC
   - [x] 9c 單機／開站：行程內起 server（Electron 44 的 Node 24 有 `node:sqlite`），等 `/api/version` 通了再載入遊戲；「回到啟動器」會關掉 server
   - [x] 9d 連線：位址正規化（host:port → URL）、最近連線清單（`<userData>/servers.json`，可命名可刪，上限 20）
   - [x] 9e 測試：位址正規化與清單邏輯的單元測試；`startServer` 的既有 server 測試不得退步
   - [x] 9f macOS 打包（electron-builder），實跑：單機開始、開站、連線三條路
   - [x] 9g 文件：§ 97.2 發布形態改寫、`docs/RELEASE.md` 加桌面版、`16-tech-frontend-architecture.md` § 32.2 目錄結構、`CLAUDE.md` 技術棧
