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

### 素材 iconTier 依等級門檻重排（`30-items.md` § 素材 iconTier 對照、`39-batch-sell.md` § 39.3）

規格：區域素材依可掉落區域中最低的 `resolveArea().levelMin` 定色：1 Lv1~20、2 Lv21~35、3 Lv36~39、4 Lv40~49、5 Lv50+。只由 Boss 掉落 = 6（死神碎魂 7）。例外：通用素材 N／N+1、魔法書材料依品名（基礎 2／中階 3／高階 4／稀有 5）、任務素材 2。共 44 筆改色。

- [x] I1 `itemSeeds.ts` 44 筆 `iconTier`
- [x] I2 文件：30、39、Wiki `ItemsPage.tsx` 圖例、INDEX
- [x] I3 測試：門檻推算／Boss 6／例外清單；既有對照表測試
- [x] I4 `npx tsc -b`、client／server／desktop vitest

### 鐵匠鋪拆解（`06-equipment-acquire.md` § 6A.3、`13-town.md` § 13.5）

規格：只能拆 `acquireType: 'craft'` 模板的未裝備實例（製作品、掉落品皆可）；每種材料退 ceil(數量 × 0.5)；前置裝備不退；強化／品質／詞綴不影響；新材料堆疊放不下時拒絕，超重不擋；一次一件、需確認。

- [x] D1 文件：06-equipment-acquire、13-town、INDEX（含連動）
- [x] D2 `crafting.ts` `getDismantleYield()`；`gameStore.ts` `dismantleEquipment()`；`protocol.ts` 允許清單
- [x] D3 `TownBlacksmith.tsx` 拆解分頁；Wiki
- [x] D4 測試：退還量、製作品／掉落品、前置不退、裝備中不可拆、背包滿拒絕、server 允許清單
- [x] D5 `npx tsc -b`、client／server vitest

### 百柱塔 91~100F 小怪降 Lv.70 ＋ 百柱死神為 Boss 攻擊上限（`28-monster-stats.md` § 28.1／§ 28.8、`09-dungeon.md`）

規格：91~100F 一般怪 Lv.80 → 70，攻擊上下限 × 175/190（Lv.70 攻擊中位數 = C(70)），HP／防禦／經驗不動；區域 Lv.70~80。
百柱死神維持 Lv.80，攻擊 200~250＝全服 Boss 攻擊上限；Lv.70 Boss 攻擊 × 250/300（守護者之主 203~242、霜凍伊莉絲／熔岩伊弗利特 194~232）。
精靈王魔導士沉默 15% → 13%。T6 裝備掉率不動（91~100F 固定為內插上限端點）。

- [x] A1 `monsterSeeds.ts`、`mapData.ts`
- [x] A2 測試：`hundredPillarLevels`、`bossAttackAnchor`、`equipmentDropRates`、沉默觸發率
- [x] A3 文件：28、09、25、27、36、44、INDEX、06 § 6A.1
- [x] A4 `npx tsc -b`、client／server vitest
- [x] A5 44 只更新死神 seed 片段（模擬中死神不還手、等級不變，結果不受影響）

### 魔法技能不爆擊（`21-combat-formula.md` § 21.4／§ 21.8／§ 21.11、`07-affix.md`、`23-class-magic.md`）

規格：走魔法公式（§ 21.4，`calculateSkillAttack()`）的技能不判定爆擊、不消耗亂數；物理系技能（三連射、§ 21.4a 盾擊／裂傷斬／挑釁怒吼，整招）維持爆擊。物理職業學的基礎魔法同樣不爆擊。爆擊詞綴池不動。

- [x] C1 文件：21、07、23、INDEX、Wiki `CombatPage.tsx`
- [x] C2 `combat.ts` `calculateSkillAttack()`
- [x] C3 測試：魔法技能亂數 0 不爆擊；三連射／盾擊仍爆擊；既有測試改寫
- [x] C4 `npx tsc -b`、client／server／desktop vitest
- [x] C5 重跑 `simulateReaperKill.mts`（全五職業 `--runs=600`），更新 44 表 1~4、§ 44.10

### 武器基傷隨機化（`21-combat-formula.md` § 21.3／§ 21.4a／§ 21.11、`06-equipment.md` § 6.9）

規格：武器基傷 = randomInt(floor(W / 2), W)，W = 白字（依體型取小怪／大怪）＋ 強化；額外攻擊等其餘加項不擲。§ 21.4a 快照的 W = floor((小怪 + 大怪) / 2) ＋ 強化，同樣擲骰；DoT 於施放時擲一次。雙持每下、三連射每箭各擲一次。未裝備武器固定 1。

- [x] P1 文件：21、06、23、24、Wiki、INDEX（44 於 P5）
- [x] P2 `combat.ts` `getWeaponDamage()`／`calculateBasePhysicalDamage()`；角色面板顯示範圍
- [x] P3 測試：上下限、奇數捨去、強化併入、未裝備固定 1；既有測試改寫
- [x] P4 `npx tsc -b`、client／server vitest
- [x] P5 重跑 `simulateReaperKill.mts`／`calibrateTTK.mts`，更新 44 結果表

### 百柱塔怪物強化（`28-monster-stats.md` § 28.1／§ 28.8、`09-dungeon.md`、`27-drop-table.md`）

規格：1~30F Lv.50~56、31~60F Lv.56~63、61~90F Lv.63~70（段內舊等級線性對應，王＝段上限），91~100F Lv.80 不變。怪物等級上限 70（91~100F 例外）。
小怪攻擊依 C(L) 等比（Lv.61~70：C(L) = 150 + 2.5 × (L − 60)）；HP／防禦依改動前 Lv.31~60 一般怪同級中位數等比，Lv.61~70 中位數由 Lv.60 線性接 Lv.80；經驗維持 Lv.60 封頂。同級攻擊中位數容許 ±2；百柱塔以外的怪不動（遠古騎士除外）。沉默觸發率 Lv.49~70 13%。
王：Lv.31~63 攻擊上限 = round(C(L) × 1.3)，下限同比例；遠古騎士降為 163~195；Lv.70 王攻擊不變；HP／防禦／經驗維持對小怪與公式的現有倍率。
金幣：1~60F 300~400、61~100F 400~500。T5／T6 掉率依新中位等級內插。

- [x] H1 文件：28、27、09、04 § 4.9、30、36、INDEX
- [x] H2 `mapData.ts` 等級；`monsterSeeds.ts` 重算（腳本）；`dropSeeds.ts` 金幣與掉率
- [x] H3 任務／Wiki 等級文字
- [x] H4 測試：Lv.61~70 攻擊曲線、Boss 曲線含 Lv.60~63、百柱塔等級範圍、經驗封頂適用 Lv.61~70
- [x] H5 `npx tsc -b`、client／server vitest
- [x] H6 遠古騎士 Lv.65（177~211，Boss 規則延伸到 Lv.65）；9F 區域等級不動；T7 門檻改 Lv.63

### 製作品 (鍛)：不可用印記＋詞綴 Tier 依階級（`06-equipment-acquire.md` § 6A.6、`46-sigil.md` § 46.9）

規格：鐵匠製作的實例帶製作標記，名稱顯示加 `(鍛)`；八種印記一律不受理（強化卷軸照常）；製作詞綴固定 4 條、範圍內加權抽（T6 權重 0.7，其他 1）：T4 製作品 T1~T5、T5 製作品 T2~T6、T6 製作品 T3~T6，不出特殊詞綴。改版前已製作的實例無標記，維持原狀。

- [x] P1 文件：06-equipment-acquire、07-affix、46-sigil、13-town、18-data-schema、43-wiki、INDEX
- [x] P2 實例欄位＋製作寫入＋詞綴 Tier 範圍
- [x] P3 印記阻擋（client／server）＋顯示名稱 `(鍛)`
- [x] P4 測試
- [x] P5 `npx tsc -b`、client／server vitest

### 製作材料來源區域重分配（`06-equipment-acquire.md` § 6A.3）

規格：T4＝試煉高地／雪原地帶／象牙塔 1~4F／艾爾薩斯三區／瓦爾登三區／龍之谷外圍／龍之谷地表；T5＝朦朧洞窟／水下監獄／遠古戰場／遠古地監 1~5F／龍谷地監 1~7F；T6＝遠古地監 6~9F／百柱塔 1~30F／百柱塔 31~60F，每 3 份配方 1 份的鄰區材料取自百柱塔 61~100F。配方數、數量、前置不變。

- [x] M1 `assignCraftMaterials.mts` 涵蓋 T4~T6，寫回 `equipmentSeeds.ts`
- [x] M2 文件：§ 6A.3、武器／防具文件重產、`27-drop-table.md` 備註、`30-items.md` 製作用途
- [x] M3 測試：配方材料來源區域符合階級
- [x] M4 `npx tsc -b`、client／server vitest

### 角色 debuff 新增沉默（`24-buff-debuff.md` § 24.4／§ 24.10、`25-monster-system.md` § 25.8／§ 25.9）

規格：沉默＝無法施展技能（普攻、道具不受影響），10s，不可刷新，tag `silenced`，category `silence`；魔抗可抵抗；淨化藥水可解；施加者為 12 筆 `attackType: 'magic'` seed，判定順序排最後，觸發率 Lv.33~36 10%／Lv.38~43 12%／Lv.49~59 13%／Lv.80 15%。

- [x] P1 文件：24、25、30、13、03、07、20、16、43、48、INDEX
- [x] P2 `playerDebuff.ts`、`playerDebuffSystem.ts`、`cureItem.ts`、`scriptEngine.ts`、seed、icon
- [x] P3 技能施放阻擋：`scriptRunner.ts`、`arpgEngine.ts`、`gameStore.ts`
- [x] P4 Wiki、新手提示
- [x] P5 測試；`npx tsc -b`、client／server vitest

### 元素克制三段化（`42-element-system.md` § 42.2、`21-combat-formula.md` § 21.15）

規格：攻擊方無屬性 +0；克制（火→風→地→冰→火、光↔暗）+5；被克制（環狀反向）+0；其餘（目標無屬性、同屬性、無關係）+3。物理普攻與技能共用。

- [x] P1 文件：42 § 42.2／§ 42.5、21 § 21.4／§ 21.4a／§ 21.11／§ 21.15、07 § 7.4
- [x] P2 `combat.ts` `getElementCounterBonus()`；Wiki `CombatPage.tsx`
- [x] P3 測試：`elementBrand.test.ts` 改寫＋全情況單元測試（物理／技能各一）
- [x] P4 `npx tsc -b`、client／server vitest

### 移除怪物金幣單次掉落上限（`27-drop-table.md` § 27.1）

規格：怪物金幣 = floor(區間抽值 × (1 + gold_rate/100) × 全域金幣倍率)，無上限；Pressure 仍不作用於金幣；任務金幣上限不變。

- [x] P1 `globalRates.ts` 移除 `GOLD_DROP_CAP`；`drops.ts` 註解；測試
- [x] P2 文件 27 § 27.1／§ 27.7、26 § 26.3
- [x] P3 `npx tsc -b`、client vitest

### 公會倉庫＋共用倉庫改名帳號倉庫（`11-guild.md` § 11.8、`13-town.md` § 13.8、`35-inventory-constraints.md` § 35.12）

規格：見 `11-guild.md` § 11.8。內容只在成員打開分頁或自己存取後送出，不隨他人變動推送。

- [x] P1 文件：改名（13、19、35、49、18、Wiki）；11 § 11.8；18.12；INDEX
- [x] P2 server：schema v7；`GuildManager` 倉庫（存取物品／裝備／金幣、200 格、依序執行、解散清空）；`openWarehouse`／`closeWarehouse` 按需快照；強制存檔；測試
- [x] P3 client：倉庫面板改名＋公會倉庫分頁（無公會變暗、單機不顯示）；NPC 解散確認文字；測試
- [x] P4 補給天賦：存入素材／裝備加「存到」選單（帳號／個人），不含公會倉庫；測試
- [ ] P5 `npx tsc -b`、client／server／desktop vitest

### SQLite 寫入關卡（`97-selfhosted-server.md` § 97.4「寫入策略」）

規格：交易只併入同一呼叫鏈的巢狀呼叫（`AsyncLocalStorage`）；其他寫入在別人的交易開著時排在其後，否則立即執行。

- [x] P1 `db/writeGate.ts`；`SqliteRepository` 交易與寫入方法改走關卡
- [x] P2 `AuthService` 寫入改非同步走關卡；`ws.ts`／`admin.ts`／`index.ts` 呼叫點；`admin.ts` 寄信改走關卡
- [x] P3 公會寫入走關卡、`GuildManager` 操作加鎖、寫入成功才改記憶體
- [x] P4 測試：兩個呼叫鏈的交易同時進行一筆失敗不互相回滾；交易開著時外部寫入不被回滾；既有測試呼叫點
- [x] P5 文件 97 § 97.4；`npx tsc -b`、client／server／desktop vitest

### 公會系統（`11-guild.md`、`97-selfhosted-server.md` § 97.1／§ 97.7.2、`18-data-schema.md` § 18.12、`13-town.md` § 13.2.1）

規格：見 `11-guild.md`。只在開放世界。

- [x] P1 文件：11、13、18、34、97（含 § 97.7.5 社群視窗）、17、INDEX（待使用者審閱）
- [x] P2 server：`guilds`／`guild_members` 與遷移；`guild.ts`（建立／解散／邀請／接受／踢人／退出、驗證）；ws 訊息與允許清單；公會頻道；刪除角色連動；測試
- [x] P3 client：protocol、`guildStore`、公會 NPC（facility、外觀、四鎮地圖、單機不放）、社群視窗（`party`＋`onmap` 合併為一個 PanelKey，隊伍／公會／在線分頁、盟主標示、徽章合計）、在線分頁公會名與邀請；測試
- [x] P4 公會名改為懸停名稱的上行《公會名》（不常駐）；`TeammateView.guildName`；測試
- [ ] P5 `npx tsc -b`、client／server／desktop vitest

### 職業工會併入冒險者工會（`13-town.md` § 13.2.1／§ 13.9／§ 13.10、`36-quest-system.md` § 36.6／§ 36.10）

規格：冒險者工會面板分「冒險任務／職業任務」兩頁；職業技能學習移至魔法學院；原職業工會建築保留、無 NPC（預留公會 NPC）。
接取上限分開計算：冒險任務 4 個、職業任務維持原規則。每個難度分頁 7~9 個任務。

- [x] P1 `adventurerQuest.ts` 上限 4；`adventurerQuestSystem.ts` 分頁 7~9 個；測試
- [x] P2 `AdventurerGuild.tsx` 兩分頁（職業任務區塊自 `ClassGuild` 移入）；`MagicAcademy.tsx` 加職業技能學習；`ClassGuild.tsx` 改為 `ClassQuests.tsx`、`TownView` 的 `class-guild`
- [x] P3 四張城鎮地圖移除 `class-guild` NPC、`npcAppearance` 移除；測試改寫
- [x] P4 文件與顯示文字同步（13、36、05、23、07、27、30、35、37、16、17、24、41、51、INDEX、Wiki、starterTips、itemSeeds）
- [x] P5 `npx tsc -b`、client／server／desktop vitest

### 怪物 debuff 以怪物 id 對應（`07-affix.md` § 7.9、`24-buff-debuff.md`、`21-combat-formula.md` § 21.5）

規格：怪物身上的 debuff 一律以 `targetMonsterId` 查詢、去重與清除，不以怪物在清單中的位置。

- [x] P1 `combat.ts` 玩家傷害四函式與 `calculateMonsterAttack` 以 id 查防禦／攻擊下降；`arpgEventHandler.ts` 傳 id
- [x] P2 `gameStore.ts` `addEffect` 怪物 debuff 以 id 判斷重複；`processMonsterDeath` 移除以位置清 debuff（由 `combatLoop` 以 id 清除）
- [x] P3 測試：怪物清單位移後防禦下降仍作用在原目標；死亡不清別隻怪的 debuff；不同怪可各自掛 DoT
- [x] P4 文件；`npx tsc -b`、client／server／desktop vitest

### 線上模式試驗場本機沙盒（`50-training-ground.md` § 50.4、`97-selfhosted-server.md` § 97.2／§ 97.9）

規格：角色在試驗場時 client 以本機沙盒模擬戰鬥；改到角色本身狀態的操作（換裝、天賦、技能、屬性點、道具消耗、離開）送 server，
其餘（移動、木樁、戰鬥、量測、HP／MP／buff／冷卻、回復滿血滿魔）只在本機。道具照常扣 server 庫存，效果套在沙盒。
沙盒期間 server 推送的戰鬥執行期欄位不套用；離開試驗場時 server 整份重送。

- [x] P1 `gameStore.ts` `consumeTrainingItems`（只在試驗場、整筆扣或不扣）＋允許清單；server 測試
- [x] P2 `playerSession.ts` 離開試驗場時 `resetSync`；`world.ts` 不 tick 試驗場內的玩家；server 測試
- [x] P3 `net/trainingSandbox.ts`：進出判定、推送過濾、本機 action 與迴圈、背包消耗同步
- [x] P4 `PixiGame.tsx` 沙盒時跑本機迴圈；`TrainingGroundView.tsx` 回復走本機
- [x] P5 client 測試
- [x] P6 文件：50 § 50.4、97 § 97.2／§ 97.9、INDEX
- [x] P7 `npx tsc -b`、client／server／desktop vitest
- [x] P8 `useDraggableIsland.ts` 按在可操作元件或 portal 視窗上不拖曳（木樁設定的按鈕收不到 click）；測試；文件 16 § 32.3

### 背包多選：多重移動／丟棄（`35-inventory-constraints.md` § 35.1.5、`47-mobile.md`）

規格：一般分頁格子 Shift＋點擊（觸控：長按選單「多選」後點格）加入／移出多選；不按 Shift 點格、點空白、Esc、選取清空即結束；移動後多選保留。
多重移動：拖曳已選格或選單「移動選取的 N 格」→ 點目標格；依原版面順序從目標格連續排，被佔格的物品依序換到空出格；超出範圍起點往前退。
多重丟棄：拖到地圖或選單「丟棄選取的 N 項」→ 一個確認視窗，堆疊物品各一個數量選擇器、預設持有量；裝備中不列入；server 驗證擁有權與數量。

- [x] P1 文件：35、47、97 § 97.2、INDEX
- [x] P2 `bagLayout.ts` `moveBagSlots`；測試
- [x] P3 `gameStore.ts` `requestDiscardBatch`／`confirmDiscardBatch`、`protocol.ts` 允許清單；測試（含 server 端偽造 id、數量越界）
- [x] P4 `DiscardConfirmModal.tsx` 批次視窗；`BagPanel.tsx` 多選、多重移動、多重丟棄、觸控多選；測試
- [x] P5 `npx tsc -b`、client／server／desktop vitest

### 線上模式點地圖移動修正（`38-map-control.md` § 38.5、`97-selfhosted-server.md` § 97.2）

規格：server 套用搜尋模式只在 `autoMove` 需切換時呼叫 `setAutoMove`，不覆蓋 action 已排好的路徑；自動搜尋中點地圖先走到點擊格，抵達後接回自動移動。

- [x] P1 `playerSession.ts` `applyAutoMove` 只在狀態需切換時呼叫 `setAutoMove`
- [x] P2 測試：手動／自動搜尋點地圖目的地不被覆蓋；`setSearchMode` 照常切換
- [x] P3 `npx tsc -b`、client／server／desktop vitest
- [x] P4 文件：38 § 38.5、97 § 97.2
- [x] P5 自動搜尋中回城：城鎮一律經 `setAutoMove` 關閉自動移動；測試

### 線上模式 client↔server 後續修正（`97-selfhosted-server.md` § 97.2／§ 97.7.1／§ 97.7.3）

規格：載圖中的玩家不放進實例；交易金幣只在與目前內容不同時送出；連線未開啟時遠端 action 立即失敗；
隊伍／交易訊息成功時清除、開啟隊伍面板由 server 清除；漫遊重試只在同圖且仍自動移動時執行；
連續輸入以本機草稿為準（數字輸入離開焦點或 Enter 送出；交易與背包位置以本機最後送出內容為基準）；
遠端 action 失敗寫一行本機系統訊息；允許清單移除 client 未呼叫的 action。

- [x] P1 `world.ts` `replaceAll` 跳過載圖中玩家；測試
- [x] P2 `TradePanel.tsx` 金幣拉桿只在變動時送出；測試
- [x] P3 `connection.ts` 未開啟時 `rpc` 立即 reject；測試
- [x] P4 隊伍／交易訊息：成功清除、開面板經 server 清除；測試
- [x] P5 `mapControlStore.ts` 漫遊重試防護；測試
- [x] P6 本機草稿：`PersistentSettings.tsx`、`TalentEditor.tsx`、`TradePanel.tsx` 放入／取出、`BagPanel.tsx` 位置；測試
- [x] P7 遠端 action 失敗寫本機系統訊息；測試
- [x] P8 允許清單移除 `castQuickSlotSkill`、`castSelfSkill`、`rememberHuntLocation`、`stopMoving`、`requestSkill`、`mailbox.refresh`；測試
- [x] P9 文件：97 § 97.2／§ 97.7.3
- [x] P10 `npx tsc -b`、client／server／desktop vitest

### 線上模式 client 端呼叫修正（`97-selfhosted-server.md` § 97.2、`35-inventory-constraints.md` § 35.21.1、`52-mailbox.md` § 52.4）

規格：遠端 action 參數必須可 JSON 序列化；寫入持久層或連動其他 store 的後續處理寫在 store action 內，元件不自行串接。
天賦分頁位置經 server 寫入 `talent_bag_layouts`；背包與天賦分頁位置格式不合（非物件、值非非負整數）整筆不寫；領取信件後 server 端天賦格重新載入。

- [x] P1 `ScriptEditorPanel.tsx` 新增分頁「＋」不傳事件物件（commit `387a32b`）
- [x] P2 `protocol.ts` 加 `setTalentBagOrder`；`gameStore.ts` `setTalentBagOrder` 驗證格式
- [x] P3 `mailboxStore.ts` `claim`／`claimAll` 成功後重新載入天賦；`MailboxPanel.tsx` 移除 `load()`
- [x] P4 測試：線上整理送出 `setTalentBagOrder`；非法格式不寫；領取後天賦 store 含新格
- [x] P5 `npx tsc -b`、client／server／desktop vitest
- [x] P6 文件：97 § 97.2 硬性要求
- [x] P7 `setBagSlotMap` 同樣驗證格式；測試；`npx tsc -b`、三邊 vitest；文件

### M4 ＋ Low 安全收尾（`97-selfhosted-server.md` § 97.2／§ 97.4／§ 97.5／§ 97.7.2／§ 97.8）

規格：角色離開只清發話計數，未到期禁言保留；內部錯誤回固定字串；HTTP 回應帶防嵌入與 Referrer 標頭；
設定檔／資料庫／備份權限 0600；session token 只存 SHA-256（原地遷移）、過期列定期清除；
管理介面設定值拒絕換行、server-name 輸出跳脫、backup-dir 限資料目錄內。

- [x] P1 M4 `chatLimit.ts` `forget` 保留未到期禁言
- [x] P2 L1 `ws.ts` 內部錯誤固定字串
- [x] P3 L2 `http.ts` 安全標頭
- [x] P4 L3 設定檔／SQLite／備份檔權限
- [x] P5 L4 session token 雜湊與遷移、過期清除
- [x] P6 L5 管理介面三項
- [x] P7 L7 實證可跨帳號搬物品 → `ws.ts` `bindUser` 換帳號前卸下角色；L8 無崩潰手段可觸發，不改
- [x] P8 測試、`npx tsc -b`、server／desktop／client vitest
- [x] P9 文件

### M3 排行榜 server 端快取（`97-selfhosted-server.md` § 97.4「排行榜」）

規格：全服共用快照，1 分鐘內最多重算一次；期間讀表結果與各 top 的快照皆重用。

- [x] P1 `leaderboard.ts` `createCachedLeaderboard`；`index.ts` 改用
- [x] P2 測試：1 分鐘內多次請求只讀表一次、不同 top 各算一次；過期後重算；內容與即時計算相同
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.4 排行榜

### 6 旅館限城鎮（`13-town.md` § 13.7、`97-selfhosted-server.md` § 97.2、§ 97.9）

規格：`restAtInn` 只在地區類型為城鎮時生效（server 判定）；其餘城鎮設施的位置限制只在 client 介面。

- [x] P1 `gameStore.ts` `restAtInn` 檢查所在地區類型
- [x] P2 測試：野外不收錢不回復；城鎮照常
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.2 參數驗證列、§ 97.9 已知限制、13 § 13.7

### 5d 系統提示改本機、天賦配置上限、製作追蹤清理（`03-combat.md` § 3.14、`36-quest-system.md` § 36.13.5、`97-selfhosted-server.md` § 97.2）

規格：`pushSystemLog` 不經 server（本機提示）；天賦配置每角色最多 5 份（含預設），已超過者維持；配置名稱去頭尾空白後 1~10 字；
製作追蹤的配方不存在時由 client 自動移除該筆追蹤（server 不驗證）。

- [x] P1 `protocol.ts` 移出 `pushSystemLog`；`scriptTemplate.ts` 上限常數與名稱驗證；`gameStore.ts` add／duplicate／rename；`ScriptEditorPanel.tsx` 達上限停用新增與複製、名稱 maxLength
- [x] P2 `QuestTracker.tsx` 配方不存在時移除追蹤
- [x] P3 測試：第 6 份不新增／不複製、名稱 11 字與非字串不改；pushSystemLog 回 action_denied；追蹤清理元件測試
- [x] P4 `npx tsc -b`、server／desktop／client vitest
- [x] P5 文件：03 § 3.14、36 § 36.13.5、97 § 97.2

### 試驗場一律個人獨立（`50-training-ground.md` § 50.2、`97-selfhosted-server.md` § 97.7.1）

規格：試驗場的實例一律以個人為單位，組隊也看不到隊友；試驗場的在線名單不列任何人。

- [x] P1 `world.ts`：實例鍵在試驗場改用個人鍵；`onMapView` 在試驗場回空
- [x] P2 測試：隊友同進試驗場分屬不同實例、隊友位置與在線名單皆空；非隊友也不列；一般地圖的隊伍實例不受影響
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：50 § 50.2、97 § 97.7.1

### 5c 試驗場木樁移出遠端 action（`97-selfhosted-server.md` § 97.2、§ 97.9、`50-training-ground.md`）

規格：`mapMonster.summonDummies`／`clearAll` 不可遠端呼叫；試驗場木樁改由 client 端執行（另立工作），過渡期線上模式無法召喚木樁。

- [x] P1 `protocol.ts` `ACTION_ALLOWLIST.mapMonster` 清空
- [x] P2 測試：兩者遠端呼叫回 `action_denied`、場上怪物不變
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.2 允許清單、§ 97.9 已知限制、50 註明過渡期

### 5b 天賦參數、安裝上限、緊急撤退驗證（`51-auto-talent.md` § 51.3.4、`03-combat.md` § 3.13、`97-selfhosted-server.md` § 97.2）

規格：天賦參數依 `getParamFields` 逐欄位驗證，`type` 與未定義欄位丟棄，任一欄不合格整筆不寫；格位編號為 null 或非負整數；
安裝類型限三種、配置須存在、同類型同配置最多 20 個（已超過者維持）；緊急撤退各欄位依型別與範圍驗證。查找成本 O(欄位數)。

- [x] P1 `models/talentParams.ts` `sanitizeParams`；`talentStore.ts` `setEntry`／`setEntryParams`／`installSlot`；`gameStore.ts` `setEmergencyRetreat`
- [x] P2 測試：覆寫 type、非陣列 keepItemIds、越界數字、非法選項、未知欄位皆不寫；第 21 個安裝被拒；緊急撤退非法格式不寫；合法照常
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：51 § 51.3.4 安裝數量、97 § 97.2 硬性要求、INDEX 連動

### 5a 數值、鍵名、列舉參數驗證（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：數量一律正整數；裝備欄位限 `SLOT_ORDER`；屬性鍵限六屬性；印記類型限 8 種、詞綴編號為 null 或範圍內整數；旅館 mode 限 full／hp／mp。不合格不處理。查找皆 O(1)。

- [x] P1 `models/bagItem.ts` `isPositiveCount`；`gameStore.ts` `unequipItem`、`sellBagItems`、`depositToWarehouse`、`withdrawFromWarehouse`、`discardBagItem`、`applySigil`、`spendAttributePoint`、`restAtInn`、`confirmDiscard`
- [x] P2 測試：各攻擊參數不改變狀態、`Object.prototype` 不被污染；合法參數照常
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.2 硬性要求

### 價格與任務內容由 server 決定（`97-selfhosted-server.md` § 97.2「硬性要求」、`13-town.md` 雜貨店、`36-quest-system.md`）

規格：雜貨店購買只收 `{itemId, amount}`，價格由 server 依貨架（固定品項＋當地回城卷軸）查；非貨架品、數量非正整數、背包格數不足整筆不成交。
裝備販售只用 server 模板快取，只賣可販售的裝備。接冒險者任務只取 id，從自己的任務板取任務。
查找成本：貨架與模板皆 O(1)（Set／Map），不掃整份模板。

- [x] P1 `systems/shop.ts`：`GENERAL_STORE_ITEM_IDS`、`getGeneralStorePrice(regionId, itemId)`、`getTemplateSellPrice(template)`；`GeneralStore.tsx` 改用
- [x] P2 `gameStore.ts`：`buyBagItems`、`sellEquipmentInstances`（移除模板參數）、`acceptAdventurerQuest`；村莊腳本 `buy_item`／`sell_equipment` 跟著改；`mirror.ts` 移除 `ARG_TRIM`
- [x] P3 測試：0 元／負數量／非貨架品買不到、合法購買照常；偽造模板售價無效、新手裝不被賣；偽造任務接不到、任務板上的照常
- [x] P4 `npx tsc -b`、server／desktop／client vitest
- [x] P5 文件：97 § 97.2 硬性要求

### 以 id 操作的 action 檢查擁有權（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：裝備、丟棄、天賦格、信件等以 id 指定對象的 action，對象必須屬於自己；
`equipItem` 只取傳入物件的 id、從自己背包取實例；`requestDiscard` 的名稱與上限以自己的資料為準。

- [x] P1 `gameStore.ts` `equipItem`／`requestDiscard`／`discardInventoryItem`；`talentStore.ts` `uninstallSlot`；`mailbox.ts` `isOwnMail` ＋ `mailboxStore.ts` `claim`／`remove`
- [x] P2 測試：偷他人裝備、偽造詞綴、刪他人裝備、丟棄他人裝備、拆他人天賦格、領／刪他人信件皆無效；自己的照常
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.2 硬性要求

### 遠端 action 允許清單收斂（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：client 專用或 server 內部用的 action 不可遠端呼叫；任務板僅在不屬於目前城鎮時重新產生（`36-quest-system.md` § 36.6.3 手動刷新須扣 50 貢獻）；
戰後門檻只接受四個門檻鍵與有限數字。

- [x] P1 `protocol.ts` 移出 `addEffect`、`removeEffect`、`saveState`、`changeArea`、`refreshQuestBoard`、`setScriptRules`、`usePotion`、`startExploring`、`stopExploring`、`setPhase`；`mirror.ts` 移除失效的 `LOCAL_GAME_ACTIONS`
- [x] P2 `gameStore.ts` 新增 `ensureQuestBoardForTown`（允許清單以它取代 `initQuestBoard`，`AdventurerGuild.tsx` 改用）；`setAfterCombatThreshold` 驗鍵與值
- [x] P3 測試：被移出的 action 遠端呼叫回 `action_denied`；任務板同城鎮不重生、換城重生；門檻非法鍵／非數字不寫入
- [x] P4 `npx tsc -b`、server／desktop／client vitest
- [x] P5 文件：97 § 97.2 硬性要求

### tick 錯誤隔離 ＋ 同連線訊息依序處理（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：tick 中單一玩家的步驟出錯 → 該玩家本 tick 其餘步驟跳過、記 error log、踢除（踢除照常 flush）；
單一實例出錯 → 該實例本 tick 其餘步驟跳過、記 error log；實例只有一名玩家時視同該玩家出錯。
同一連線的訊息依收到順序逐一處理，前一則處理完才處理下一則。

- [x] P1 `worldTick.ts` 逐玩家／逐實例隔離，回報 `TickFault`
- [x] P2 `world.ts` 排除隔離中的玩家、呼叫 `onSessionFault`；`ws.ts` 接上踢除
- [x] P3 `ws.ts` 每連線訊息佇列
- [x] P4 測試：狀態壞掉的玩家不影響他人 tick 且被踢除；同時送兩次購買只成交一次；claim＋claimAll 只領一次
- [x] P5 `npx tsc -b`、server／desktop／client vitest
- [x] P6 文件：97 § 97.2 硬性要求

### 正式版只連同源 server（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：`?server=` 指定連線位址僅開發版（`import.meta.env.DEV`）生效；正式版一律探測同源 server。

- [x] P1 `online.ts` `resolveServerWsUrl` 加必填 `devMode`；`App.tsx` 傳 `import.meta.env.DEV`（`online.ts` 會被 server 編譯，不可用 `import.meta.env`）
- [x] P2 測試：正式模式帶 `?server=` 仍連同源；開發模式採用參數；無 server 回 null
- [x] P3 `npx tsc -b`、client vitest
- [x] P4 文件：97 § 97.2 硬性要求、README、RELEASE.md

### 進行中的嘗試計入限制 ＋ 註冊限制（`97-selfhosted-server.md` § 97.5）

規格：登入類嘗試「失敗數 + 進行中」達 5 即拒絕，不驗證；註冊每 IP 滾動 60 分鐘最多建立 2 個帳號，進行中的註冊計入，超過回 `rate_limited`。

- [x] P1 `loginThrottle.ts` 加 `begin`／`finish`（進行中計數），`recordSuccess` 保留進行中計數；`ws.ts` `throttled()` 改用
- [x] P2 `registrationLimit.ts`；`ws.ts` `register` 在驗證帳密前取得名額
- [x] P3 測試：throttle 單元（並行上限、成功／失敗／中性結束）；註冊限制單元；ws 整合（同連線並行 30 則登入只驗證 5 次；第 3 個註冊被拒）
- [x] P4 `npx tsc -b`、server／desktop／client vitest
- [x] P5 文件：97 § 97.5 登入嘗試限制補並行、新增註冊限制

### 建角參數 server 端驗證（`04-character.md` § 4.2、`19-account-character.md` § 19.4）

規格：`bonusAttrs` 恰為六項非負整數、初始 + 加點 ≤ 18、總和等於該職業可分配點數；
`name` 須為字串且通過 § 19.4 格式；不合格回 `bad_character`，不建角。

- [x] P1 `models/character.ts` 加 `validateBonusAttributes`、`CREATION_ATTRIBUTE_CAP`；`CharacterCreate.tsx` 改用常數
- [x] P2 `ws.ts` `create_character` 入口驗證名稱與加點
- [x] P3 測試：client 單元（加點各種不合格）；server 整合（不合格不建角、合格照常）；修正 `singleEntry.test.ts` 全 0 加點
- [x] P4 `npx tsc -b`、server／desktop／client vitest
- [x] P5 文件：04 § 4.2 補「須分配完」與 server 驗證（97 無錯誤碼列表）

### HTTP request URL 無法解析回 400（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：request URL 無法解析 → 回 400，不進 API 與靜態檔；API handler 拋錯時若 header 已送出，只結束回應。

- [x] P1 `http.ts` 解析移入防護、500 路徑檢查 `headersSent`
- [x] P2 測試：真實 HTTP server 收到無法解析的 URL 回 400，之後正常請求照常
- [x] P3 `npx tsc -b`、server／desktop／client vitest
- [x] P4 文件：97 § 97.2 硬性要求

### 非物件訊息與未處理 rejection 不得終止 server（`97-selfhosted-server.md` § 97.2「硬性要求」）

規格：JSON 合法但不是含字串 `t` 的物件 → 回 `bad_message`，連線保留；
未處理的 Promise rejection 只記 error log，行程不結束（server 執行檔與桌面版皆同）。

- [x] P1 `ws.ts` 訊息形狀檢查、catch 安全取 `id`
- [x] P2 `processGuard.ts`；server `main()` 與 `desktop/src/main.ts` 安裝
- [x] P3 測試：非物件訊息回 `bad_message` 且後續訊息照常處理；guard 吞下 rejection
- [x] P4 `npx tsc -b`、server／client vitest
- [x] P5 文件：97 § 97.2 硬性要求

### 線上狀態同步瘦身（`97-selfhosted-server.md` § 97.2「狀態同步」）

規格：每次推送一則 `frame`（`now` 僅 tick 推送帶）；store 欄位分 `set`／`merge`／`append`；
`game.combatLogs` 走 append、`game.character` 走 merge、`mapMonster.monsters` 只送顯示欄位且內容不變不送；
`combat` 只送新怪完整資料、變動血量、變動的目標與詠唱；`PROTOCOL_VERSION` 升 `'3'`。

- [x] P1 共用 codec（`client/src/net/syncCodec.ts`）＋ 單元測試
- [x] P2 server：`collectPatches` 改欄位編碼、`flush` 改單一 `frame`、combat delta；`resetPatches` 一併清；測試
- [x] P3 client：`mirror.ts` 套用 `frame`、怪物還原與 prev 位置；`clockSync` 測試改寫；新增套用測試
- [x] P4 `npx tsc -b`、client／server vitest 全綠；60 秒流量量測前後對照
- [x] P5 文件：97 § 97.2 狀態同步、§ 97.3 備案清單、`INDEX.md`

### CI 測試與打包提速（`docs/RELEASE.md`）

規格：client `*.test.ts` 用 node 環境、`*.test.tsx` 與標註 `@vitest-environment jsdom` 的檔用 jsdom；
server 測試的 argon2 用最低成本（正式參數不變）；桌面版封存壓縮等級 6；打包與測試並行，Release 等兩者。
地圖測試條件執行不做。

- [x] C1 client vitest 拆 node／jsdom 兩個 project，需要 DOM 的 `.ts` 測試加標註；全綠
- [x] C2 server `setPasswordHashCost()` ＋ 測試 setup 降成本；全綠
- [x] C3 `package.mjs` 壓縮等級 6
- [x] C4 `release.yml`：`build` 不等 `test`，`release` 等 `test` 與 `build`
- [x] C5 `docs/RELEASE.md` 同步；量測前後對照

### 飾品詞綴池移除防禦力（`07-affix.md` § 7.6）

規格：飾品（項鍊／戒指）詞綴池去掉防禦力（12 種）；既有飾品上的防禦力詞綴保留不轉換。

- [x] R1 防禦力的 `category` 移除 `'accessory'`
- [x] R2 wiki `AffixesPage` 說明文字
- [x] R3 測試：飾品池無防禦力、生成 200 件飾品不出防禦力、wiki 篩選
- [x] R4 文件：07 § 7.4／§ 7.6
- [x] R5 `npx tsc -b`、vitest 全綠

### 斷線重連回到原角色（`97-selfhosted-server.md` § 97.5「斷線重連」）

規格：自動重連登入後直接選回斷線前遊戲中的角色；斷線前停在角色選擇、被踢除、主動回清單或登出不選回；
選角失敗退回角色選擇。記錄只在記憶體，重新整理頁面不適用。只改 client，協定版本不變。

- [x] D1 文件：97 § 97.5、`INDEX.md`
- [x] D2 `connection.ts`：斷線記下角色 id，登入後送 `select_character`，失敗改送 `characters`
- [x] D3 測試：遊戲中斷線選回、角色選擇中斷線不選、被踢不選、選角失敗退回清單、登出後不選
- [x] D4 `npx tsc -b`、client／server vitest 全綠

### T5 配方重複材料修正（`06-equipment-acquire.md` § 6A.3）

規格：同一配方材料不可重複；象牙塔的鄰區為古戰場。1011／1126 第 4 種改骷髏兵箭簇×3、1112／1127 改亡魂騎士碎甲×3、1113 改殭屍碎骨×3。

- [x] M1 `equipmentSeeds.ts` 5 份配方
- [x] M2 文件：§ 6A.3、單手劍／雙手杖／雙刀配方欄
- [x] M3 測試：製作配方 `itemId` 不重複
- [x] M4 `npx tsc -b`、client vitest 全綠

### 一般詞綴新增三種 ＋ T7 獨有詞綴（`07-affix.md` § 7.4／§ 7.6、`07-affix-tier7.md`）

規格：一般池加命中下降／防禦下降（武器，命中 10% 觸發、3 秒、通用 Tier 表）與迴避（防具類，T1~T7＝1~7%）；
命中下降＝被該怪攻擊時角色迴避 +X、不受 35% 上限。T7 裝備另有一條獨有詞綴（實例欄位 `uniqueAffix`），
取得當下固定、印記不可動、不吃品質、隨素質需求凍結；同類只取數值最高者（同值依部位順序），其餘劃線；
受擊觸發 buff 10%／5 秒／刷新；命中類比照元素侵蝕判定；追加傷害加在最終傷害；舊 T7 實例由 server 遷移補抽。

- [x] U1 文件：07 § 7.4／§ 7.5／§ 7.6／§ 7.3.1、`07-affix-tier7.md` 正式規格、21／24／46／18／43／INDEX
- [x] U2 模型：一般池三種（定義、階級表、顯示）＋ `models/uniqueAffix.ts`（定義、抽取、顯示、同類去重）
- [x] U3 生成：掉落 T7 帶獨有詞綴；server SQLite 遷移補抽舊 T7 實例
- [x] U4 凍結與去重：`getEffectiveGear()` 清凍結件與落敗件的獨有詞綴；最小固定點的全屬性取最大值
- [x] U5 數值接入：爆擊／攻速／掉寶／魔抗／額外防禦／迴避／全屬性／全免疫；迴避與格擋改共用函式（戰鬥＝面板）
- [x] U6 觸發接入：命中（回血／回魔／追加傷害／暈眩、命中下降／防禦下降）、擊殺回血、受擊 buff
- [x] U7 UI：裝備 tooltip（(獨) 列、分隔線、劃線）、Wiki 詞綴頁與武器／防具頁
- [x] U8 測試；`npx tsc -b`、client／server vitest 全綠

### 怪物攻擊力曲線重調（`28-monster-stats.md` § 28.1）

規格：seed 基礎值（不含全域倍率）。一般怪 Lv.30 以下不動；Lv.31~60 該級典型攻擊上限 `C(L) = 36 × (150/36)^((L−30)/30)`，
每隻怪下限與上限 × `C(L) ÷ 該級一般怪現行攻擊上限中位數`。百柱塔 91~100F 一般怪升 Lv.80，攻擊 × `200/102`（最強死之執行者上限 200）。
Boss Lv.31~57 該級最強者上限 = `round(C(L) × 1.3)`，同級其餘等比；Lv.60 Boss × 1.25；百柱死神升 Lv.80、攻擊 250~300。
Lv.80 怪經驗不變（2,736／17,478）。91~100F 區域等級 80。

- [x] K1 `monsterSeeds.ts` 攻擊力與等級、`mapData.ts` 91~100F 區域等級
- [x] K2 測試：`bossAttackAnchor.test.ts` 改新錨點；其他受影響測試
- [x] K3 文件：28 § 28.1／各表／§ 28.10、09、27、36、04、44 § 44.2、INDEX
- [x] K4 `npx tsc -b`、client／server vitest 全綠（本計畫範圍）
- [x] K5 44 § 44.7 重跑 `simulateReaperKill.mts`（含新詞綴、粗排改輪替加權）

### 詞綴洞 ＋ 新增印記／封印印記（`07-affix.md` § 7.1、`46-sigil.md`）

規格：每件 4 個詞綴洞（實例 `affixSlots`，未設＝4）；掉落 1~4 條均等（含 Boss／T7），商店與製作固定 4 條。
新增印記（id 161）：空洞加一條，T1~T5 均等（商店裝 T3）、特殊詞綴看角色等級，必定成功，洞滿不受理。
封印印記（id 162）：指定一條，70% 成功移出洞外標 `sealed`、排到最後、原洞空出（`(封)`、吃品質、其他印記都不能動、混沌保留），
30% 失敗該詞綴與洞永久毀壞；一件最多封一條；特殊詞綴與額外屬性也可封。
混沌不看既有條數，重抽到填滿所有可用洞（封印詞綴不佔洞、保留）。兩種印記掉率同刺針（Lv.31+ 一般 1%／Boss 5%）、500G、重量 0。舊存檔視為 4 洞，不遷移。

- [x] S1 文件：07、46、27 § 27.8、30、06-equipment-acquire、18、13 § 13.13、35、43、INDEX
- [x] S2 模型：`affixSlots`／`sealed`、掉落條數、`generateAffixes` 排除種類、顯示 `(封)`
- [x] S3 印記：新增／封印的判定與結算、混沌保留封印、其他印記擋封印詞綴；store `applySigil`
- [x] S4 資料：道具 161／162、Lv.31+ 49 區與 16 隻 Boss 的掉落條目
- [x] S5 UI：tooltip 空洞／毀壞、印記師（洞列、第四列選單、封印確認）、Wiki
- [x] S6 測試；`npx tsc -b`、lint、client／server vitest 全綠

### 仇恨範圍與弓射程（`41-arpg-combat.md`、`25-monster-system.md` § 25.8）

規格：怪物仇恨範圍 8 → 10 格（脫離 15 格不變）；玩家弓普攻射程 15 → 10 格；三連射、穿透箭雨射程 15 → 10 格。
法系技能、怪物弓箭手 10 格／魔法怪 8 格、A* 尋路門檻 8 格不變。Wiki 讀常數自動同步。

- [x] A1 `monsterCombatFSM.ts` aggroRange、`equipment.ts` 弓射程、`classSkills.ts` 兩招弓技能
- [x] A2 測試：弓射程、弓技能射程、仇恨 10 格邊界
- [x] A3 文件：41、25、97、23、INDEX
- [x] A4 `npx tsc -b`、client／server vitest 全綠

### 裝備掉率下調 ＋ 依地圖等級平衡（`27-drop-table.md`、`06-equipment-acquire.md` § 6A.1）

規格：一般怪掉率區間 T2 0.1%~1%、T3 0.1%~1%、T4 0.05%~0.5%、T5 0.01%~0.1%、T6 0.025%~0.05%。
同階內掉落值 = 下限 + (上限 − 下限) × (區域中位等級 − 該階最低中位等級) ÷ (該階最高中位等級 − 該階最低中位等級)，四捨五入到小數 2 位；
區域中位等級 = (`levelMin` + `levelMax`) ÷ 2（樓層 area 取該樓層）。遠古地監 9F 一般怪掉 T6。
Boss T4／T5 0.3%、T6 0.1%、T7 0.01%；各 Boss 掉的 Tier 不變。
強化卷軸：一般怪 0.1%（＋／－ 0.02%）、Boss 1%（＋／－ 0.2%）。

- [x] E1 `dropSeeds.ts`：一般怪 T2~T6 掉落值、遠古地監 9F T6 條目、Boss T4／T5／T6 掉落值
- [x] E1b `dropSeeds.ts`：武器／防具強化卷軸（含＋／－）一般怪與 Boss 掉落值 ÷ 10
- [x] E2 測試：同階等級相同掉率相同、等級較高不低於等級較低、遠古地監 9F 有 T6、Boss 各階掉率、強化卷軸掉率
- [x] E3 文件：27 § 27.1／§ 27.3／§ 27.6／§ 27.7、06-equipment-acquire § 6A.1、INDEX 連動、30 § 30.2 強化卷軸
- [ ] E4 `npx tsc -b`、client／server vitest 全綠

### 素材掉率下調（`27-drop-table.md` § 27.1／§ 27.3／§ 27.6／§ 27.7）

規格：區域最高等級 ≥ 31 的一般怪素材與 Lv.31 以上 Boss 的一般素材（`category: 'material'`）掉落值 −30（12%→9%、4%→1%）；
Lv.31 以上 Boss 專屬素材 30% → 15%。Lv.30 以下區域與試煉飛龍不變。§ 27.7 原則 14（前期素材收入提升）刪除。

- [x] F1 `dropSeeds.ts`：Lv.31+ 一般怪素材、Boss 一般素材 −30；Boss 專屬素材 300 → 150（Lv.30 以下不變）
- [x] F2 測試：`areaMaterialDrop.test.ts` 區域素材 Lv.30 以下 10~12%／Lv.31+ 7~9%、Boss 專屬 30%／15%；`economicBalance.test.ts` 刪收入提升案例；Lv.31+ 一般怪素材 1~9%
- [x] F3 文件：27 § 27.1／§ 27.3／§ 27.6／§ 27.7、09（產出分工比值改為約 1.43 倍、移除 `dungeonYieldSplit.test.ts`，金幣不變）、22、26、30、INDEX 連動
- [x] F4 `npx tsc -b`、client／server vitest

### 盾擊／裂傷斬依手持裝備分段（`23-class-magic.md` § 23.3）

規格：盾擊不限裝備；左手裝備盾牌（`type: 'shield'`）時暈眩 3s，否則 1.5s（雙手武器、魔導書、臂甲、空手）。
裂傷斬流血：手持雙手武器（`isTwoHanded`）每秒 85% 物理傷害，否則 70%。

- [x] S1 文件：23 § 23.3／§ 23.7.1、24 § 24.4.5／§ 24.8.5
- [x] S2 `SkillDebuffDef.shieldDuration`／`twoHandedDotDamagePercent`；`arpgEventHandler` 依手持裝備取值
- [x] S3 Wiki／技能面板 tooltip 顯示兩段秒數
- [x] S4 測試：盾擊有盾 3s、雙手／魔導書／臂甲／空手 1.5s；裂傷斬單手 70%、雙手 85%
- [x] S5 `calibrateTTK.mts`／`simulateReaperKill.mts` 依武器取 DoT 比例
- [x] S6 44 § 44.7／§ 44.10 騎士重跑（`--class=knight`，預設 runs）
- [x] S7 `npx tsc -b`、client vitest

### DPS 預測翻修（`44-dps-prediction.md`）

規格：腳本戰前 buff 讀 `SKILL_CATALOG`／`CLASS_SKILLS`（不手抄），學習預算讀 `skillRestrictions.ts`；
降防禦技能（詛咒／護甲崩壞／極冰封印）進輪替，疊加照遊戲（不同 category 加算、同 category 覆蓋），由期望值決定是否施放；
報告新增本版納入改動、狀態技能盤點、行動分佈；五職業以 `--top=20 --runs=600` 全重跑。執行時間不在本次範圍。

- [x] P1 腳本：戰前 buff 讀技能定義、學習預算讀 `skillRestrictions.ts`
- [x] P2 腳本：降防禦技能進輪替（校準以掛載期間增傷評價）
- [x] P3 腳本：輸出狀態技能盤點與行動分佈
- [x] P4 五職業全重跑
- [x] P5 文件：44 全面翻修（納入改動、盤點、分佈、表 1~3、§ 44.6／§ 44.9／§ 44.10）
- [x] P6 `npx tsc -b`、client vitest

跨多次對話的實作**開工前**先在這裡寫下定案規格與分階段清單（見 `CLAUDE.md`）：
中斷後靠它接續，全部完成並經使用者確認後刪除。
