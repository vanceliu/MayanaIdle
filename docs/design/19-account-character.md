# 19. 帳號與多角色系統

## 19.1 概述

每個玩家帳號（User）可建立多個角色（Character），在進入遊戲時需先選擇要操作的角色。

帳號為 server 帳號，角色存於 server；帳號規則、host 帳號自動登入、session 見 `97-selfhosted-server.md` § 97.5。

---

## 19.2 角色格數

- 每個帳號最多可建立 **4 個角色**（暫定）
- 角色格數未來可視需求調整

---

## 19.3 角色選擇畫面

### 進入流程

```
連線 server → 登入（單機形態自動以 host 帳號登入，不顯示）→ 角色選擇畫面 → 選擇角色 → 進入遊戲主畫面
```

### 畫面內容

- 顯示所有已建立角色（最多 4 格）
- 每個角色顯示：
  - 角色名稱
  - 職業
  - 等級
  - **六項屬性**（STR / AGI / VIT / SPI / INT / CHA）
- 空格位顯示「建立新角色」按鈕
- 已有角色可點擊進入遊戲（角色卡整塊可點，含屬性列）

### 屬性顯示範圍（必守）

角色卡上的屬性 = **建角配點（`baseAttributes`）+ Lv.51+ 升級配點（`bonusAttributes`）**，
**不含裝備額外屬性與 buff**（見 `20-attributes.md` § 20.10）。

實作上即 `getTotalAttributes(char)` 不傳 `equippedGear` / `activeEffects`。

---

## 19.4 角色建立流程

1. 點擊空格位的「建立新角色」
2. 選擇職業（五職業擇一，見 `04-character.md`）
3. 輸入角色名稱（規則見下）
4. 分配自由屬性點數（依職業可分配點數，見 `04-character.md` § 4.2）
5. **設定外觀**：選髮型 → 微調該髮型的 4 項參數 → 選膚色／髮色／眼色 → 睫毛開關與 3 項參數
   （規格見 `04-character.md` § 4.10；**體型不可調**）
6. 確認建立 → 送 server 建立，server 產生 `uuid`

建立後自動獲得初始配置（見 `04-character.md` § 4.3）。

| 欄位 | 用途 | 是否公開 |
|---|---|---|
| `uuid` | 角色的公開識別碼：排行榜的 key、判斷榜上哪一列是自己 | 公開 |

無 client 端密鑰；寫入權由帳號 session 決定（`97-selfhosted-server.md` § 97.5）。

### 角色名稱規則

| 項目 | 規則 |
|---|---|
| 允許字元 | 中文、半形英文、半形數字，以及符號 `- _ ~ = .` |
| 正規式 | `^(?=.*[A-Za-z0-9一-龥])[A-Za-z0-9一-龥\-_~=.]{2,12}$` |
| 符號位置 | 不限，可置於開頭或結尾 |
| 禁止 | 空白（含全形）、上述以外的符號、emoji、控制字元、**純符號名稱** |
| 長度 | 2 ~ 12 字 |
| 唯一性 | **本服唯一**（見下） |

格式規則與唯一性都由 server 在建立角色時驗證，客戶端的即時提示只是 UX。

### 名稱唯一性

同一個 server 內角色名稱唯一（`97-selfhosted-server.md` § 97.5）。跨 server 不保證，也不需要保證。

| 項目 | 規則 |
|---|---|
| 比對方式 | NFC 正規化後轉小寫（`characterNameKey()`），大小寫與組合字視為同一個名稱 |
| 把關位置 | SQLite 的 `characters.name_key` 唯一索引；建角前另有一次應用層檢查，訊息指出是哪個名稱被用了 |
| 刪除角色 | 名稱立即釋放，可再被使用 |
| 資料表 | `characters.name_key` 與其唯一索引屬於初版 schema（`18-data-schema.md` § 18.12） |
| 密語 | 以名稱指定（§ 97.7.2）。萬一有殘留的同名在線，一律拒絕不送 |

- 「自己在榜上的位置」以 client 比對 uuid 判定：`const isMine = (characterId: string) => myUuid === characterId;`
- 榜上仍顯示 `名稱#xxxx`（`37-statistics.md` § 37.4.3）：uuid 是永久識別碼，名稱釋放後可被別人取用，只看名稱認不出是不是同一個角色
- 角色歸屬帳號，冒名由帳號登入擋下

### 身分

- `uuid` 是公開識別碼，**永不釋放、永不回收**，因此不存在重複或搶佔問題
- 排行榜見 `37-statistics.md` § 37.4

---

## 19.5 刪除角色

- 角色選擇畫面可刪除已建立的角色
- 刪除後該角色所有資料（背包、裝備、技能、進度）由 server 永久移除
- 刪除不影響帳號倉庫內的物品
- 目前暫無保護機制（無二次確認、無冷卻期），未來視情況調整

---

## 19.6 登出

- 遊戲主畫面提供「登出」按鈕（暫定位置：右下角）
- 點擊登出後返回角色選擇畫面
- 登出時自動儲存當前角色狀態
- 登出不等於關閉遊戲，僅切換回角色選擇

---

## 19.7 倉庫系統

本遊戲倉庫分為兩種：

### 個人倉庫（角色層級）

- 綁定**角色（Character）**
- 僅該角色可存取
- 可存放：裝備、材料、消耗品

### 共用倉庫（帳號層級）

- 綁定**帳號（User）**
- 同帳號下所有角色可存取
- 可存放：裝備、材料、消耗品
- **金幣各角色獨立**，共用倉庫提供存放金幣功能供跨角色轉移

### 跨角色轉移範例

| 操作 | 結果 |
|---|---|
| 角色 A 將裝備存入共用倉庫 | 角色 B 可從共用倉庫取出該裝備 |
| 角色 A 將裝備存入個人倉庫 | 僅角色 A 可取出，角色 B 看不到 |
| 角色 A 有 5000G，角色 B 有 200G | 各自獨立，互不影響 |
| 角色 A 存 1000G 到共用倉庫 | 角色 B 可從共用倉庫取出 |
| 刪除角色 A | 個人倉庫物品消失，共用倉庫不受影響 |

---

## 19.8 資料歸屬

| 資料層級 | 綁定對象 | 說明 |
|---|---|---|
| 帳號（User） | — | 帳號基本資訊 |
| 共用倉庫（Shared Warehouse） | User | 所有角色共用 |
| 角色（Character） | User | 最多 4 個 |
| 個人倉庫（Personal Warehouse） | Character | 各角色獨立 |
| 背包（Inventory） | Character | 各角色獨立 |
| 裝備實例 | Character | 各角色獨立 |
| 金幣 | Character | 各角色獨立 |
| 技能 | Character | 各角色獨立 |
| 進度（位置/等級/經驗） | Character | 各角色獨立 |
| 天賦配置 | Character | 各角色獨立 |
| 快捷欄配置 | Character | 各角色獨立 |

---

## 19.9 資料版本

角色資料存於 server SQLite，資料結構版本存於 SQLite，變更以啟動時的遷移腳本處理（`97-selfhosted-server.md` § 97.4）。

| 項目 | 規則 |
|---|---|
| 舊角色 | 不淘汰；遷移補齊欄位 |
| 匯出／匯入 | 不提供；備份為開服者複製 SQLite 檔（`97-selfhosted-server.md` § 97.8） |
| client 版本 | 連線時版本協商，不匹配即拒連（`97-selfhosted-server.md` § 97.2） |
| 賽季／永恆 | 未定，`characters.seasonId`、`characters.pool` 自首版保留（`18-data-schema.md` § 18.12） |

### 全域倍率

| 設定 | 預設 | 說明 |
|---|---|---|
| `GOLD_RATE_MULTIPLIER` | 1.0 | 全域金幣倍率，作用於怪物金幣掉落（`27-drop-table.md` § 27.1）與任務金幣獎勵（`36-quest-system.md` § 36.3） |
| `DROP_RATE_MULTIPLIER` | 1.0 | 全域道具掉落倍率，作用範圍見 `27-drop-table.md` § 27.1（含印記與天賦格） |
| `EXP_RATE_MULTIPLIER` | 1.0 | 全域擊殺經驗倍率，作用位置見 `28-monster-stats.md` § 28.1 |
| `PRESSURE_RATE_MULTIPLIER` | 1.0 | Pressure 累積倍率，作用位置見 `26-spawn-pressure.md` § 26.3；0 = Pressure 恆為 0 |
| `SPAWN_RATE_MULTIPLIER` | 1.0 | 怪物生成頻率倍率，作用位置見 `26-spawn-pressure.md` § 26.2；必須 > 0 |
| `MONSTER_HP_MULTIPLIER` | 1.0 | 怪物血量倍率，作用位置見 `28-monster-stats.md` § 28.1；必須 > 0 |
| `MONSTER_ATTACK_MULTIPLIER` | 1.0 | 怪物攻擊力倍率，作用位置見 `28-monster-stats.md` § 28.1；必須 > 0 |
| `BOSS_SPAWN_RATE_MULTIPLIER` | 1.0 | Boss 生成機率倍率，作用位置見 `26-spawn-pressure.md` § 26.4；0 = 不生成 Boss |

掉落計算公式：`最終倍率 = (1 + 角色裝備加成%) × 全域倍率`

八個倍率只作用於各自標明的公式，彼此獨立。回鍋經驗加倍（`04-character.md` § 4.11）與 `EXP_RATE_MULTIPLIER` 相乘，不另設倍率。落點為 `server.properties`（`97-selfhosted-server.md` § 97.2）。
