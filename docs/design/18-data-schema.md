# 18. 資料結構設計提示

以下是 AI 之後協助設計資料表時應考慮的主要 Entity。

## 18.1 主要資料表方向

可能需要：

- users（帳號）
- characters（角色，每帳號最多 4 個）
- factions
- classes
- skills
- character_skills
- maps
- monsters
- monster_spawns
- dungeons
- items
- equipment_instances
- affixes
- equipment_affixes
- inventories
- warehouses（綁定 userId，帳號共用）
- pets
- guilds
- guild_messages
- achievements
- character_achievements
- rankings
- shops
- shop_items

### characters 的識別欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | number (PK) | 本機 IndexedDB 自增值，**僅本機有效** |
| uuid | string | 全球唯一識別碼（`crypto.randomUUID()`），跨裝置／跨玩家的唯一 key |
| name | string | 角色名稱，**不要求唯一**（格式規則見 `19-account-character.md` § 19.4） |
| authToken | string | 該角色的排行榜寫入密鑰（`crypto.randomUUID()`），**機密**，伺服端只存 SHA-256 |

> **不可用 `id` 當作對外識別**：`id` 是每個瀏覽器各自的自增值，所有玩家的第一隻角色都是 `1`。
> 任何送往伺服端的角色識別（排行榜、未來的線上化）一律使用 `uuid`。
> `uuid` 於 DB version 12 導入，既有角色在 upgrade 時補發。

### 背包／倉庫的鍵

`characterBag`／`characterStorage`／`warehouses` 三張表存的是**可堆疊道具**，
一律以 **`itemTemplateId`（道具 id）為鍵**，`name` 只是給人看的欄位。

| 欄位 | 型別 | 說明 |
|---|---|---|
| itemTemplateId | number | 對應 `ITEM_DEFINITIONS.id`。所有查詢、合併、扣除都用它 |
| name | string | 顯示用快取，載入時由 id 反查 seed 重寫，**不可用來查東西** |
| type | string | 背包分頁，同樣由 seed 的 `category` 反查決定 |
| amount | number | 數量 |

> **不可用名字查背包**（禁用 `characterBag.where({ name })`）——
> 道具一改名，玩家 IndexedDB 裡的舊名就再也對不上，那批存量等於消失，
> 每次改名都得補一版 Dexie 遷移（v14 就是這樣來的）。
> 詳細規則見 `99-ai-constraints.md` § 99.1。
>
> Dexie v15 完成鍵的轉換：**只有名稱、沒有 id 的舊列一律廢棄**，不做名稱回填。

同一條分界也適用於**設定表指涉道具**：卷軸、狀態解除道具、印記、技能書、
裝備配方材料（`craftMaterials`）、冒險者工會獎勵一律存 id，顯示名由 id 反查。

## 18.2 裝備實例需要注意

裝備不是只有 item template。

需要區分：

- 裝備模板
- 玩家實際擁有的裝備實例

每件裝備可能有：

- 品質 %
- 詞綴
- 持有人
- 是否裝備中
- 是否在倉庫
- 是否已綁定

## 18.3 裝備實例應包含

- id
- itemTemplateId
- ownerCharacterId
- location
- equippedSlot
- qualityPercent
- baseSmallMonsterDamage
- baseLargeMonsterDamage
- durability，若未來需要
- createdAt
- updatedAt

## 18.4 詞綴實例應包含

- equipmentInstanceId
- affixId
- tier
- baseValue
- finalValue
- slotIndex

## 18.5 品質計算注意

finalValue 應由：

```text
baseValue × (1 + qualityPercent / 100)
```

計算。

品質只修正詞綴 finalValue。

---

## 18.6 資料分層設計

### 持久層（DB）

儲存位置：IndexedDB（單機模式）/ PostgreSQL（線上模式）

必須持久化的資料，關閉瀏覽器或斷線後不可遺失：

| 資料 | 說明 |
|---|---|
| 角色狀態 | HP、MP、等級、經驗值、屬性點、金幣 |
| 技能 | 已學習技能清單、技能等級 |
| 背包內容 | 所有物品實例（藥水、卷軸、素材、裝備） |
| 倉庫內容 | 城鎮倉庫存放的裝備與素材 |
| 裝備實例 | 含詞綴、品質、強化等級、裝備狀態 |
| 最後位置 | 當前所在 Zone / Region / Floor |
| 職業/角色基本資訊 | 名稱、職業、建立時間 |

### 前端記憶體（Zustand Store）

僅存在於執行期，不需要持久化到後端 DB：

| 資料 | 說明 |
|---|---|
| 戰鬥日誌 | 即時戰鬥訊息，上限 200 筆 |
| 計時器 ID | Game Loop / Regen / Combat 各 interval ID |
| 當前戰鬥怪物狀態 | 戰鬥中的怪物 HP、目標索引 |
| 搜尋模式 | 自動 / 手動 |
| UI 狀態 | 面板開關、分頁選擇 |

### 前端持久化（localStorage / IndexedDB，不走後端）

關閉瀏覽器後保留，但屬於玩家操作偏好，線上模式不需伺服器驗證：

| 資料 | 說明 |
|---|---|
| 天賦配置 | 天賦格列表 — 自動戰鬥的條件/動作（見 § 18.9） |
| 快捷欄配置 | QuickSlot 綁定 |

### 分層原則

1. **會影響遊戲公平性的資料** → 必須存 DB（線上模式由 Server 驗證）
2. **玩家操作偏好** → 前端持久化即可，不需伺服器介入
3. **純即時/暫態資料** → 僅存 Zustand，不持久化

---

## 18.7 帳號與角色關係

### User（帳號）

- id
- createdAt

### Character（角色）

- id
- userId（外鍵，指向 User）
- name
- classId
- level
- exp
- gold
- 屬性點分配
- 當前位置
- appearance（外觀，見下）
- createdAt

### appearance（角色外觀）

外觀存在 **`characters` 列上的 `appearance` 欄位**，不另立資料表 ——
匯出是整列打包，存在角色列上才會自動跟著走。

內容的規格（髮型清單、可調範圍、色票）在 `04-character.md` § 4.10，這裡只講落點。

| 落點 | 要做什麼 |
|---|---|
| `db/database.ts` migrate | 新版 `.upgrade()` 內 `modify` 為既有角色補上預設外觀 |
| `systems/characterTransfer.ts` 匯出 | 整列打包，**自動帶走**，不需改 |
| `systems/characterTransfer.ts` 匯入 | **必須手動加**：那裡是逐欄位 `db.characters.update({...})`，漏列的欄位會靜默消失 |
| `systems/legacyArchive.ts` 快照 | `character: {...}` 只存部分欄位，遺產角色要顯示外觀就得加（見 `45-legacy-archive.md` § 45.2） |
| 舊匯出檔 | 沒有 `appearance` 時退回預設，**不可拋錯** |

> 匯入那一列是最容易漏的：匯出會自動帶走，所以測試「匯出→看檔案」會過，
> 但「匯出→匯入→開角色」時外觀已經沒了，而且**不會有任何錯誤訊息**。

### 關係規則

- 一個 User 最多擁有 4 個 Character
- Warehouse 綁定 userId（帳號層級共用），可存放物品與金幣
- Inventory / Equipment / Skills / Progress 綁定 characterId（角色獨立）
- 金幣存於 Character，各角色獨立；倉庫另有獨立金幣存放欄位供跨角色轉移
- 共用倉庫金幣**不與物品同表**：實作為獨立的 `warehouseGold`（主鍵 `userId`，一帳號一列）。
  金幣是餘額不是物品 —— 不佔格數、不計重量、沒有 `itemTemplateId`，
  且線上化後需要「不可為負」的原子扣減（`98-online-architecture.md` § 4）

---

## 18.8 靜態模板資料（Single Source of Truth）

所有靜態資料依類別分表管理。各系統（商店、鐵匠鋪、掉落、背包、戰鬥）引用對應表的原始資料。

### 模板分表

| 表名 | 說明 | 數量級 |
|---|---|---|
| equipment_templates | 統一裝備模板（武器、防具、盾牌、魔導書、飾品） | ~200 |
| item_definitions | 消耗品/素材/卷軸定義 | ~30 |
| monster_templates | 怪物素質 | ~100 |
| skill_definitions | 魔法/技能定義 | ~80 |
| drop_tables | 區域掉落池配置 | ~120 |
| boss_drop_tables | Boss 專屬掉落池 | ~50 |

### 模板表結構

武器、防具、盾牌、魔導書、飾品共用單一 `equipment_templates` 表，
以 `type` + `slot` 欄位區分類型，各類型差異以 nullable 欄位承載。
線上化後維持同一設計：Prisma 單一 model + enum，不做 polymorphic relation。

### equipment_templates 欄位

| 欄位 | 型態 | 說明 |
|---|---|---|
| id | number (PK) | 模板唯一 ID |
| name | string | 裝備名稱（唯一） |
| type | enum | sword / dagger / axe / mace / staff / bow / twoHandSword / twoHandAxe / twoHandStaff / dualBlade / claw / armor / shield / magicBook / accessory |
| slot | enum | rightHand / leftHand / helmet / chest / gloves / boots / belt / necklace / ring |
| isTwoHanded | boolean | 是否雙手武器 |
| material | enum | wood / iron / silver / mithril / dragon / orichalcum |
| weight | number | 重量 |
| smallMonsterDamage | number? | 對小怪傷害（武器用） |
| largeMonsterDamage | number? | 對大怪傷害（武器用） |
| defense | number? | 防禦力（防具/盾牌用） |
| magicAttack | number? | 魔法攻擊（法杖/魔導書用） |
| attackSuccess | number? | 攻擊成功（命中加成） |
| extraAttack | number? | 額外攻擊力 |
| hpRegen | number? | 回血量 |
| mpRegen | number? | 回魔量 |
| bonusHp | number? | 增加血量 |
| bonusMp | number? | 增加魔量 |
| bonusWeight | number? | 增加負重上限（腰帶用；**生效中**，見 `35-inventory-constraints.md` § 35.2.1） |
| bonusBagSlots | number? | 擴充背包格數（腰帶用，見 `35-inventory-constraints.md` § 35.1） |
| bonusStats | string? | 額外屬性的**顯示字串**（如「敏捷+1」），不參與計算 |
| bonusAttributes | Partial\<Attributes\>? | 額外屬性的**實際數值**（如 `{ AGI: 1 }`），生效來源。見 `06-equipment.md` § 6.8 |
| stability | number | 安定值（武器預設 6、防具預設 4、-1 = 不可強化） |
| canBreak | boolean? | 是否受壞刀機制影響（武器用） |
| requiredLevel | number | 需求等級 |
| requiredClass | string[]? | 職業限制（null = 全職業） |
| acquireType | enum | shop / craft / drop_only |
| buyPrice | number? | 商店價格（shop 時必填） |
| craftTier | enum? | 製作等級：entry / mid / top（craft 時必填） |
| craftGold | number? | 製作金幣，一律 0（製作不收費，見 `06-equipment-acquire.md` § 6A.3） |
| craftMaterials | json? | 製作素材 `[{name, amount}]`（craft 時必填） |
| craftPrerequisiteWeapon | json? | 前置武器需求 `{templateId, quantity}`（高級進階以上製作品）。**存 templateId 不存名稱**，見 `99-ai-constraints.md` § 99.1 第 3 條 |

### 取得方式規則

| acquireType | 說明 | 來源 |
|---|---|---|
| shop | 商店直接購買 | 武器商店 / 防具商店 |
| craft | 鐵匠鋪製作 | 鐵匠鋪（素材 + 金幣） |
| drop_only | 僅掉落取得 | 怪物掉落（不在商店、不在鐵匠） |

### 設計原則

1. **分表管理** — 武器、防具、飾品各自獨立，避免單表過大或欄位混雜
2. **一份資料，多處引用** — 商店 = 查詢 `acquireType = 'shop'`；鐵匠鋪 = 查詢 `acquireType = 'craft'`
3. **裝備實例引用模板** — 實例持有 `templateId`，建立時複製模板基礎值
4. **模板為靜態資料** — 啟動時載入記憶體，運行期不查 DB
5. **tooltip 顯示** — 從實例屬性渲染（已複製模板值 + 強化/品質修正）

### CraftMaterial 結構

```json
[{ "name": "銀礦石", "amount": 4 }, { "name": "銀精華", "amount": 3 }]
```

素材對應 `item_definitions` 表中的材料物品。

---

## 18.9 自動天賦（`51-auto-talent.md`）

### 條件與動作的定義（靜態）

seed 資料，運行期不查 DB。一律**用 id 查表，不可用名字查**（§ 99.1 第 3、7 條）。

**全部內建，沒有實例表** —— 玩家不「持有」條件與動作（`51-auto-talent.md` § 51.5）。

| 欄位 | 說明 |
|---|---|
| `id` | 定義 id |
| `kind` | `condition`（條件）／`action`（動作） |
| `appliesTo` | 適用類型陣列：`combat`／`persistent`／`supply`，可多選 |
| `group` | 選單分區（`51-auto-talent.md` § 51.4.2）。**不是 tier，不是門檻** |
| `ruleId` | 對應 `03-combat.md` § 3.12~3.13 或 `49-village-script.md` § 49.2~49.3 的條件／動作 |
| `blocked` | 未接上判定引擎則為真，**不出現在選單**（`51-auto-talent.md` § 51.4.3.2） |
| `blockedReason` | `monster`／`pending` |

### 天賦格

**自動天賦唯一的實例表，不進 `characterBag`。**

| 欄位 | 說明 |
|---|---|
| `id` | 天賦格 id |
| `characterId` | 持有角色。**不跨角色轉移**，不進倉庫表 |
| `tier` | T1~T4，決定條件槽數（1~4） |
| `assignedType` | 指派給哪個類型：`combat`／`persistent`／`supply`。**null ＝ 未安裝** |
| `templateId` | 屬於哪一組天賦配置。未安裝時為 null |
| `order` | 判定順序。未安裝時為 null |
| `enabled` | 啟用／停用 |
| `conditions` | 條件槽陣列，每項為 `{ ruleId, params }`。長度上限＝`tier`，空槽為 null |
| `action` | 動作槽 `{ ruleId, params }`，未設為 null |

**條件與動作是天賦格上的欄位，不是獨立實體。** 同一個 `ruleId` 可出現在任意多個天賦格，
各自帶不同 `params`（`51-auto-talent.md` § 51.5.1）。
`params` 內的技能與道具指涉**一律存 id**（§ 99.1 第 7 條）。

**未安裝的天賦格躺在背包「天賦」分頁，不進判定**（`51-auto-talent.md` § 51.3.4）。
安裝＝指派類型。改類型走拆下再安裝，拆下時 `assignedType`／`templateId`／`order`
一併清回 null，`conditions`／`action` **原樣保留**，重新安裝到同類型即復原。

`templateId` 是單一值 —— **同一個天賦格不可能同時在兩份天賦配置裡**。
安裝一個已屬於別份配置的天賦格等於搬家，那一份就少一格
（`51-auto-talent.md` § 51.3.2）。

### 天賦配置

沿用現行 template 的存放位置，每角色獨立（`03-combat.md` § 3.14）。
內容為戰鬥／常駐／補給三類的天賦格列表 ＋ 緊急撤退設定。

---

## 18.10 系統信箱（`52-mailbox.md`）

| 欄位 | 說明 |
|---|---|
| `id` | 信件 id |
| `characterId` | 持有角色。**信箱角色獨立**，不跨角色 |
| `sourceKey` | 發放來源鍵。**對 `characterId` 唯一**，重複發放靠它擋 |
| `title` | 顯示標題 |
| `items` | 發放項目陣列：道具（`itemId` ＋數量）／金幣／天賦格（tier） |
| `createdAt` | 發放時間 |
| `claimedAt` | 領取時間。**null ＝ 未領取** |

- `items` 內的道具**一律存 id 不存名稱**（§ 99.1 第 7 條）
- **換版清理**：`BUILD_INFO.version` 改變時刪除 `claimedAt` 不為 null 的信；
  **未領取的一律保留**（`52-mailbox.md` § 52.7.1）—— 刪掉等於沒收玩家的天賦格
- 公告的 `lastReadVersion` 存本機設定，**不進 DB**

## 18.11 回鍋經驗加倍（`04-character.md` § 4.11）

角色資料新增兩個欄位：

| 欄位 | 說明 |
|---|---|
| `restedExpMs` | 加倍時間存量（毫秒）。上限 43,200,000（12 小時） |
| `lastSeenAt` | 上次在線時間戳。上線時以 `now - lastSeenAt` 換算離線時長 |

- `lastSeenAt` 在遊戲迴圈中定期寫入，離線時長取兩次寫入的差值
- 兩個欄位都隨角色匯出／匯入（§ 18.7），**不進遺產快照**（`45-legacy-archive.md`）
- 舊角色以 `restedExpMs = 0`、`lastSeenAt = 上線當下` 補齊，不追溯發放
