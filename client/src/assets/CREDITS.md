# Tile Asset Credits

> ## ⚠️ 目前狀態：等距地形素材已全數移除
>
> Stone Soup 地板、DCSS 物件、LPC 岩石／灌木、Kenney 水岸磚**都已從版庫移除**，
> 地圖回到程式繪製的色塊。原因：三套來源的畫風與物件尺寸對不齊，
> 逐項修補（換磚、限制縮放、剔除異常素材）只能壓下個別症狀，整體仍然不一致。
>
> 下一步是找**一致性高、最好是同一位作者**的整套等距素材，一次全部換上。
> 本文件保留為候選名單與授權研究紀錄；選型需求見 `docs/design/38-map-control.md` § 38.9。
>
> 仍在使用的素材只剩 game-icons.net 的 UI 圖示（`client/src/assets/icons/`）。


地圖渲染（isometric，`TILE_W=64` / `TILE_H=32`，見 `client/src/pixi/utils/isometric.ts`）使用的地形素材來源與授權。

## 採用決定

像素風路線定案。地板用 **Isometric Stone Soup**，植物／樹／石柱用 **DCSS**，岩石／灌木用 **LPC**。

> **樹一律取自 DCSS**（原生 32×32，2 倍放大剛好一格）。LPC 的樹原生 43~120px 寬、
> 最高到 140px，彼此尺寸差距太大，同一張圖上混用會大小不一致，且明顯超過一格，
> 因此不採用（`prop-lpc/tree`、`treeAutumn`、`treeDead` 已自素材庫移除）。
先前評估的 3D 渲染路線（rubberduck 地面與植物、Varkalandar 岩石、Clint Bellanger 水磚等）**不採用**。

| 用途 | 採用來源 | 授權 | 版庫位置 | 詳見 |
|---|---|---|---|---|
| 地板磚、過渡磚 | Isometric Stone Soup | CC0 | `client/assets-src/tiles/floor/`、`floor-trans/` | § 3.0 |
| 植物、樹、石柱 | Dungeon Crawl 32x32 tiles | CC0 | `client/assets-src/tiles/prop-dcss/` | § 3.0.1 |
| 岩石（含積雪版）、灌木 | [LPC] Rocks / Plants | **CC BY-SA 3.0** | `client/assets-src/tiles/prop-lpc/` | § 3.0.3 |
| 水陸交界磚 | Kenney — Isometric Road Tiles | CC0 | `client/src/assets/tiles/isometric/` | § 2 |

素材已匯入，共 302 個 PNG，並打包成單一 spritesheet：

- **原始檔**：`client/assets-src/tiles/` —— 建置輸入（在 `client/src/` 之外，Vite 不會打包）。
  加工過程與命名規則見 [`README.md`](../../../assets-src/tiles/README.md)。
- **圖集**：`client/src/assets/tiles/atlas/tiles.png` + `tiles.json`（PixiJS spritesheet 格式）。
  2048×512、769 KB、GPU 約 4 MB。以 `npm run pack:tiles` 產生，新增素材後必須重跑。

打包的理由是 draw call：同一張 texture 的 sprite 才能合併批次。

Stone Soup 沒有可判定方向的水岸磚，因此保留 Kenney 的 `waterBeach` 8 塊（四邊＋四角）補這一塊。

**已移除**：原 `grass/` `bush/` `water/` `rock/` `sand/` 共 16 個 game-icons 地形裝飾 SVG。
那是最初的剪影方案，已被像素風路線取代且無任何程式碼引用，故刪除。
遊戲 UI 圖示（`client/src/assets/icons/`）仍在使用 game-icons.net，不受影響。
若需復原，依 § 1 的檔名與來源頁面重新下載即可。

---

## 1. game-icons.net（已移除，保留紀錄供復原）

- 網站：https://game-icons.net
- 原始庫：https://github.com/game-icons/icons
- 授權：**[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) — 必須標注作者**
- 標注格式：`Icons made by <作者>. Available on https://game-icons.net`
- 加工方式：移除原始檔的黑色背景 `<path d="M0 0h512v512H0z"/>`，前景 `fill="#fff"` 改為 `fill="currentColor"`，與 `client/src/assets/icons/` 既有慣例一致（可用 CSS / PixiJS tint 換色）

### 草地（grass/）

| 檔名 | 作者 | 來源頁面 |
|---|---|---|
| grass.svg | Delapouite | https://game-icons.net/1x1/delapouite/grass.html |
| high-grass.svg | Delapouite | https://game-icons.net/1x1/delapouite/high-grass.html |

### 草叢（bush/）

| 檔名 | 作者 | 來源頁面 |
|---|---|---|
| berry-bush.svg | Delapouite | https://game-icons.net/1x1/delapouite/berry-bush.html |
| clover.svg | Lorc | https://game-icons.net/1x1/lorc/clover.html |
| three-leaves.svg | Lorc | https://game-icons.net/1x1/lorc/three-leaves.html |

### 水池（water/）

| 檔名 | 作者 | 來源頁面 |
|---|---|---|
| waves.svg | Lorc | https://game-icons.net/1x1/lorc/waves.html |
| wave-crest.svg | Lorc | https://game-icons.net/1x1/lorc/wave-crest.html |
| water-drop.svg | Sbed | https://game-icons.net/1x1/sbed/water-drop.html |
| river.svg | Delapouite | https://game-icons.net/1x1/delapouite/river.html |

### 岩石（rock/）

| 檔名 | 作者 | 來源頁面 |
|---|---|---|
| rock.svg | Lorc | https://game-icons.net/1x1/lorc/rock.html |
| stone-block.svg | Lorc | https://game-icons.net/1x1/lorc/stone-block.html |
| stone-pile.svg | Delapouite | https://game-icons.net/1x1/delapouite/stone-pile.html |
| falling-rocks.svg | Delapouite | https://game-icons.net/1x1/delapouite/falling-rocks.html |

### 沙地（sand/）

| 檔名 | 作者 | 來源頁面 |
|---|---|---|
| desert.svg | Delapouite | https://game-icons.net/1x1/delapouite/desert.html |
| quicksand.svg | Lorc | https://game-icons.net/1x1/lorc/quicksand.html |
| dust-cloud.svg | Lorc | https://game-icons.net/1x1/lorc/dust-cloud.html |

---

## 2. Kenney — Isometric Road Tiles（`isometric/`）

- 作者：Kenney（https://kenney.nl）
- 來源頁面：https://opengameart.org/content/isometric-road-tiles
- 下載檔：`roadTiles_v2.zip`（https://opengameart.org/sites/default/files/roadTiles_v2.zip）
- 授權：**CC0 1.0（公有領域，無須標注；作者歡迎但不強制標注）**
- 尺寸：PNG 100×64（等距菱形 100×50 + 厚度），專案 `TILE_W=64` 需縮放約 0.64
- 向量母檔：`kenney-roadTiles-source.svg`（原檔名 `roadTiles.svg`，包含整份 tile sheet，可自行切出向量磚）

| 檔名 | 用途 |
|---|---|
| grass.png | 草地地板 |
| dirt.png | 泥土地板 |
| water.png | 水面 |
| waterBeachNorth/South/East/West.png | 水陸交界（沙灘邊） |
| waterBeachCornerNorth/South/East/West.png | 水陸交界（沙灘角） |
| kenney-roadTiles-source.svg | 向量母檔（全套 tile sheet） |

同系列水域擴充包（尚未收錄，需要更多水景時可加入）：
https://opengameart.org/content/isometric-road-tiles-water-expansion（`roadTiles_water.zip`，CC0，42 塊，含 SVG/AI 原始檔）

---

## 3. 採用來源的詳細紀錄

以下為「採用決定」中選定素材的完整規格與加工方式，以及評估過程中排除的候選（§ 3.1、§ 3.2）。

### 3.0 大型地板庫 — 解決「14 種主題共用一套磚會很單一」

| 來源 | 作者 | 內容 | 尺寸 | 授權 |
|---|---|---|---|---|
| [OGA – Isometric Stone Soup](https://opengameart.org/content/isometric-stone-soup)<br>`sbs_-_isometric_stone_soup.zip` | Screaming Brain Studios | **49 張地板 sheet／593 塊地板磚** ＋ 44 張牆面 sheet／1302 塊。名稱如 `Grass` `Frozen` `Ice` `Swamp` `Lair` `Cage` `Crypt` `Volcano` `Infernal` `Marble` `Vines` `Mosaic` `Sigil` `Crystal`，**足以讓 14 種主題各配一組不重複的地板** | 原生 `64×32` | **CC0**（原始素材為公有領域的 Dungeon Crawl Stone Soup） |
| [OGA – 1000+ Isometric Floor Tiles](https://opengameart.org/content/1000-isometric-floor-tiles)<br>`sbs_-_isometric_floor_tiles_-_small_128x64.zip` | Screaming Brain Studios | 224 塊室內外地板＋285 塊 autotile 過渡磚＋540 塊水面磚 | `128×64`（需縮 0.5） | **CC0** |
| [OGA – 300+ Isometric Overworld Tiles](https://opengameart.org/content/300-isometric-overworld-tiles)<br>`sbs_-_isometric_overworld_pack_-_small.zip` | Screaming Brain Studios | 森林 36、地形 108、水 36；有 Flat／Thick 兩種風格 | `128×64`（Flat）／`128×72`（Thick） | **CC0** |
| [OGA – Isometric Snow Tileset (Flare)](https://opengameart.org/content/isometric-snow-tileset-flare)<br>`snow_tilesets_2.zip` | rubberduck | 雪地、雪草地、冰牆、冰面過渡、較淺的冬季水面，以及 grassland tileset 幾乎所有物件的積雪版 | 原生 `64×32` | **CC-BY-SA 3.0 — 需標注且具傳染性（衍生作品須同授權）** |
| [OGA – Grassland Tileset (Flare)](https://opengameart.org/content/grassland-tileset)<br>`grassland_tiles.png` | Clint Bellanger | 200+ 塊：草地、石板路、崖壁、溪流、柵欄、樹木、墓碑、小屋、橋、碼頭 | 原生 `64×32` | **CC-BY-SA 3.0**；素材混合多位作者作品，壓縮檔內 `CREDITS.txt` 有完整標注清單，須一併遵守 |

### 3.0.1 同源的植物／樹／石頭物件

Stone Soup 地板是 Dungeon Crawl Stone Soup 的等距轉換，所以物件直接取 **DCSS 原始圖庫**風格最一致（不會有 3D 渲染植物貼在像素地板上的違和感）。

| 來源 | 作者 | 授權 | 下載檔 |
|---|---|---|---|
| [OGA – Dungeon Crawl 32x32 tiles](https://opengameart.org/content/dungeon-crawl-32x32-tiles) ／ [supplemental](https://opengameart.org/content/dungeon-crawl-32x32-tiles-supplemental) | Chris Hamons 等，MedicineStorm 上傳 | **CC0** | `Dungeon Crawl Stone Soup Full.zip`（6029 個 PNG） |

用得到的資料夾（全部原生 `32×32`，含 alpha）：

| 用途 | 路徑 | 可用項目 |
|---|---|---|
| `Decoration(4)` 植物、地衣 | `monster/fungi_plants/`、`dungeon/mold_large_*.png` | `plant` `plant_crypt` `plant_demonic` `bush_2~4` `briar_patch` `deathcap` `wandering_mushroom_new` `mold_large_1~4` |
| `Tree(10)` | `dungeon/trees/` | `tree_1_{red,yellow,lightred}` `tree_2_{red,yellow}` `mangrove_1~3` |
| `Rock(11)` 石頭、斷柱 | `dungeon/boulder.png`、`dungeon/zot_pillar.png`、`dungeon/statues/` | `boulder` `crumbled_column_1~6` `granite_stump_{new,old}` `pedestal` `zot_pillar` |

**選用注意**：

- `monster/fungi_plants/` 底下有一部分其實是**怪物**（`treant`、`oklob_plant`、`thorn_lotus`、`vine_stalker`），當裝飾會被玩家誤認成敵人，不要用。
- DCSS **沒有戶外用的一般岩石** —— 能當 `Rock(11)` 的只有 `boulder` 一顆，其餘是斷柱石樁（適合遺跡／地牢，戶外略突兀）。
- 雪地**沒有積雪版**的樹與灌木。
- 上述兩處缺口由下方 3.0.3 的 LPC 補齊。

### 3.0.3 LPC 岩石／灌木 — 補 DCSS 的缺口

補上 DCSS 沒有的**戶外一般岩石**與**積雪版物件**。

| 來源 | 作者 | 授權 | 下載檔 | 內容 |
|---|---|---|---|---|
| [OGA – \[LPC\] Rocks](https://opengameart.org/content/lpc-rocks) | bluecarrot16 等 14 位 | **CC-BY-SA 3.0 / 4.0** | `rocks.zip` | 四種岩性各含巨石、碎石堆、卵石、石筍、支石墓、崖塊；**另附整套積雪版** `rocks-snow.png` 與 `rocks-snow-overlay.png`。可切出 300+ 個 |
| [OGA – \[LPC\] Trees](https://opengameart.org/content/lpc-trees) | bluecarrot16 等 | **CC-BY-SA 3.0** | `lpc-trees.zip` | 落葉樹，綠／淡綠／秋橘／褐／枯 五種色系，多數有無葉版。可切出 50+ 棵 |
| [OGA – \[LPC\] Flowers / Plants / Fungi / Wood](https://opengameart.org/content/lpc-flowers-plants-fungi-wood) | bluecarrot16 等 | **CC-BY-SA 3.0** | `lpc-flowers-plants-fungi-wood.zip` | 灌木、小樹、花草、蘆葦、睡蓮、蘑菇、樹樁、原木。可切出 300+ 個 |

**授權警告（與其他素材不同）**：

- **必須標注** —— 每個壓縮檔內附 `CREDITS-rocks.txt` / `CREDITS-trees.txt` / `CREDITS-plants.txt`，各列了十幾位原作者（bluecarrot16、Johann Charlot、Yar、Hyptosis、Evert、Lanea Zimmerman、Guillaume Lecollinet、Richard Kettering、Zachariah Husiar、Redshrike、Rayane Félix、Michele Bucelli…），**全部都要標注**。
- **傳染性授權** —— CC-BY-SA 要求衍生作品同樣以 CC-BY-SA 釋出。若要修改這些圖（改色、合成），改出來的成果也受此拘束。
- 若想避開這個負擔，就只用 DCSS（CC0），代價是戶外岩石與雪地物件補不齊。

**加工方式**：原 sheet **沒有網格**，物件大小不一且散佈。以 alpha 門檻 64 做 4 連通區域標記（connected components）取 bounding box 即可自動切出個別物件，檔名帶上原始尺寸方便後續擺放。

#### 改顏色算不算「修改」？（CC-BY-SA 的 ShareAlike 觸發條件）

**算。** CC-BY-SA 4.0 的 Adapted Material 定義是「被翻譯、變更、編排、轉換或以其他方式修改」，3.0 的 Derivative Work 同理 —— 改色屬於變更，沒有「只改顏色不算」的例外。所以：

| 做法 | ShareAlike 是否觸發 | 說明 |
|---|---|---|
| 把改色後的圖**存成檔案並隨遊戲發布** | **會** | 這些改色檔必須以 CC-BY-SA 3.0（或相容／更新版本）釋出，並註明「已修改」 |
| **執行期上色**（PixiJS `tint` / `ColorMatrixFilter`），發布的是**未修改的原圖** | **不會** | 沒有散布 Adapted Material。BY 的標注義務仍在 |
| 完全不改，直接用 | 不會 | 但 BY 的標注義務仍在 |

ShareAlike **不會**擴散到的範圍：

- **不會**讓遊戲程式碼變成 CC-BY-SA —— SA 只附著在那些改過的圖上
- **不會**影響同一份 build 裡的其他素材（DCSS、Stone Soup 的 CC0 不受影響），遊戲屬於 collection／aggregation
- **不需要**開源整個專案

本專案是 PixiJS，`client/src/assets/icons/` 已經在用「原圖不動 + 執行期上色」的做法（`fill="currentColor"`）。LPC 若要調色，**沿用同一套執行期上色**即可避開 SA，只留下標注義務。若連標注都想免除，就只能全用 CC0 的 DCSS／Stone Soup。

（以上為授權條款的一般理解，非法律意見。）

#### 執行期改色要用哪一種做法

環境：PixiJS **8.19.0**，`ColorMatrixFilter` 由 core 匯出（`import { ColorMatrixFilter } from 'pixi.js'`），提供 `hue()` / `saturate()` / `brightness()` / `tint()` / `colorTone()` 等。

四種做法的授權地位**完全相同**（都只散布未修改原圖，只需標注），差別在效能與可行性：

| 做法 | 效能 | 限制 |
|---|---|---|
| **直接挑現成變體** | 最好，無額外成本 | 受限於原包提供的色系 |
| **載入時產生 texture**（canvas 改色 → `Texture.from`） | 一次性成本，之後正常 batch | 需自己寫改色邏輯 |
| `sprite.tint` | 最便宜，逐頂點乘法、完全 batch | **只能相乘 → 只能變暗**，做不出積雪岩石這種變亮效果 |
| `ColorMatrixFilter` | **每個掛 filter 的物件各一次離屏 render pass** | 掛在 Container（整層）上才划算 |

`ColorMatrixFilter` 的成本來自 `FilterSystem` 的實作 —— 它透過 `TexturePool` / `getOptimalTexture` / `renderTarget` 先把物件渲染到離屏 texture 再跑 shader。等距地圖動輒上百個 sprite，逐一掛 filter 就是上百次 render pass，還會破壞 batching。掛在 Container 上可一次處理整層，但整層只能是同一色調，同層內要不同顏色就得拆 container。

**優先順序**：

1. **先挑現成變體** —— LPC 岩石已含四種岩性＋整套積雪版，樹已含綠／淡綠／秋橘／褐／枯五色系。14 種主題大多直接挑就夠，免改色、無色偏、完全繞開 SA 的討論。
2. **需要改色 → 載入時在 canvas 產生 texture**，做 palette swap。授權地位與 filter 相同，效能好很多。
3. `tint` —— 只需要整體壓暗／偏色時用。
4. `ColorMatrixFilter` —— 留給「整層統一調色」的場合（夜間、中毒、受傷的全畫面效果），那才是它的強項。

**像素風特有的坑**：`hue()` / `saturate()` 這類色相旋轉套在手繪像素圖上通常會糊掉 —— 像素美術的色階是作者一格一格調出來的，整體旋轉會破壞明暗關係。要改色請用 **palette swap（特定色映射到特定色）**，效果比色相旋轉好得多，而且剛好適合在載入時用 canvas 逐像素處理。

#### CREDITS 檔裡的來源其實是混合授權

LPC 是多份素材合併重製的，`CREDITS-*.txt` 裡每個來源授權不同，例如 `CREDITS-rocks.txt`：

- CC0：Buch 的 Outdoor 32x32 tileset
- CC-BY 3.0：Yar、Hyptosis、Evert、Daniel Cook/Jetrel/Zabin、Stephen Challener 等
- CC-BY 4.0：George Bailey
- CC-BY-SA 3.0：Guillaume Lecollinet（BrowserQuest）、Rayane Félix、ZRPG Tiles
- 雙／三重授權：Johann Charlot（CC-BY-SA 3.0 / GPL 3.0）、LPC Base Assets（CC-BY-SA 3.0 / CC-BY 3.0 / GPL 3.0）

`CREDITS-trees.txt` 更雜，含 CC0、CC-BY 2.0／3.0、CC-BY-SA 3.0、GPL 2.0／3.0 等組合。含 GPL 的項目都是**多重授權**，可以只走 CC 那條路，不會被 GPL 傳染。

由於合併後無法逐一辨識哪個 sprite 來自哪個來源，**實務上整份 sheet 一律當 CC-BY-SA 3.0 處理**，並照 CREDITS 檔標注所有作者。

**尺寸注意**：LPC 是 32px 網格的美術，等距磚寬 64。物件縮放依原生寬度換算成約一格寬
（`WallLayer.propScale`，只取整數倍），所以 21~32px 的岩石放大 2 倍、更大的維持 1 倍。
LPC 的樹原生 43–120px 寬且彼此差距懸殊，無論怎麼縮放都無法既一致又不超過一格，故不採用。

**渲染方式**：直立物件不需要投影，等距場景本來就是把它當立牌貼在地磚上 —— `32×32` 以 2 倍放大（`64×64`）、底部對齊菱形下頂點即可，記得設 `image-rendering: pixelated` 保持像素銳利。

### 3.0.2 把 32×32 平面磚投影成等距

若手上是 `32×32` 的**俯視方磚**（地板、水面這類平面材質），不需要 3D 也不需要重畫，用仿射矩陣即可壓成 `64×32` 菱形。正方形四角映射到菱形四頂點：

```
(0,0) → (32,0)   (32,0) → (64,16)   (32,32) → (32,32)   (0,32) → (0,16)
x' = u - v + 32        y' = (u + v) / 2
```

Canvas 對應寫法：`ctx.setTransform(1, 0.5, -1, 0.5, 32, 0)` 後 `drawImage(img, 0, 0)`。

旋轉 45° 會讓像素邊緣產生鋸齒，實測三種畫法：最近鄰最銳利但鋸齒明顯、雙線性糊、**先放大 4 倍再投影最後縮回（超取樣）品質最好**。

**做不到的**：需要露出側面的立體物（方塊、階梯、牆）—— 仿射變換變不出原圖沒有的側面，那必須重畫。

Stone Soup 到 14 種主題的對應提案（`Grass(16)` / `Ground(0)` / `Sand(17)` / `Boundary(1)`）：

| 主題 | Grass | Ground | Sand | Boundary |
|---|---|---|---|---|
| grassland | Grass | Dirt | Sand | Pebble_Brown |
| highland | Dirt_Grass | Grey_Dirt | Sandstone | Limestone |
| snow | Frozen | Ice | Frozen | Crystal |
| ivory | Moss | White_Marble | Sandstone | Marble |
| forest | Moss | Dirt | Sand | Vines |
| swamp | Bog_Green | Swamp | Mud | Green_Bones |
| cave | Moss | Lair | Sand | Rough_Red |
| prison | Mesh | Rect_Gray | Dirt | Cage |
| battlefield | Grass | Dirt | Sand_Stone | Green_Bones |
| ancient | Moss | Etched | Sandstone | Crypt |
| dragon | Rough_Red | Volcano | Sand_Stone | Demonic_Red |
| tower | Crystal | Marble | White_Marble | Pedestal |
| frost-tower | Ice | Frozen | Limestone | Crystal |
| lava-tower | Acidic | Infernal | Volcano | Demonic_Red |

物件（DCSS）的對應提案：

| 主題 | Decoration(4) | Tree(10) | Rock(11) |
|---|---|---|---|
| grassland | plant, bush_2, bush_3, briar_patch | tree_1_red, tree_2_red | boulder |
| highland | bush_3, bush_4, plant | tree_1_yellow, tree_2_yellow | boulder, granite_stump_old |
| snow | bush_4 | tree_2_yellow | boulder |
| ivory | plant_crypt | tree_1_lightred | pedestal, crumbled_column_1 |
| forest | bush_2, bush_3, plant, briar_patch | tree_1_red, tree_2_red, tree_1_lightred | boulder, granite_stump_new |
| swamp | mushroom, deathcap, mold_large_1 | mangrove_1, mangrove_2, mangrove_3 | boulder |
| cave | mushroom, deathcap, mold_large_2 | mangrove_3 | boulder, granite_stump_old |
| prison | mold_large_3 | tree_2_yellow | crumbled_column_2, boulder |
| battlefield | briar_patch, bush_4 | tree_1_yellow, tree_2_yellow | boulder, crumbled_column_3 |
| ancient | plant_crypt, mold_large_4 | tree_1_lightred, mangrove_2 | crumbled_column_1, crumbled_column_4, pedestal |
| dragon | plant_demonic | tree_2_red | boulder, zot_pillar |
| tower | plant_crypt | tree_1_lightred | pedestal, crumbled_column_5 |
| frost-tower | plant_crypt | tree_2_yellow | crumbled_column_6, pedestal |
| lava-tower | plant_demonic | tree_2_red | boulder, zot_pillar |

此表為提案，非設計文件規則；每格都可換成 48 種地板或物件庫中的任一種。

**加工注意（實測踩過的坑）**：

1. **洋紅去背** — Stone Soup 的 PNG 為無 alpha 的 RGB，背景是洋紅 `#FF00FF`，載入時必須去背。
2. **`Grass_Dirt` 不是草地** — 這張 sheet **沒有純草磚**，整張都是「土磚 ＋ 草從某幾邊長進來」，是設計來鋪在**土的那一側**的邊界磚。當成草地鋪整片會變成雜色補丁。草地要用 `Grass` sheet。
3. **同一張 sheet 內可能混色系** — 例如 `Grass` 底列是乾草、`Sand_Stone` 上列是灰石，取變體時要取同色系的連續格，不能跨整張 sheet 均勻取樣。
4. **有些 sheet 是「多格拼圖」，不能當填充** — `Sigil` 是**一個大型法陣被切成多格**的碎片，隨機鋪只會得到拼不起來的線段（高塔的邊界原本用它，已改 `Pedestal`）。`Stairs`、`Pedestal`、`Tutorial_Pad` 同樣帶結構性圖案，挑選前要先看過整張 sheet。
5. **邊界不要隨機取變體** — `Boundary(1)` 是牆，整圈固定用同一塊磚才像牆；隨機變體會讓邊緣看起來雜亂。地面才需要隨機變體來消除重複感。

### 過渡磚（土／草交界）

`Grass_Dirt` 可湊出 **8 種方向的草緣土磚**：四個單邊＋四組相鄰邊，足以包住一塊凸形草地。

方向不需要額外中繼資料，可從像素判定：取樣每塊磚四個菱形邊的綠度（草邊 51–95、土邊 17–29，門檻取 40），組成 4 bit mask。等距鄰居對應關係為 `bit0 NW=(x-1,y)`、`bit1 NE=(x,y-1)`、`bit2 SE=(x+1,y)`、`bit3 SW=(x,y+1)`。

渲染時：**土磚**檢查四個鄰居哪幾個是草地，設起對應 bit，取該 mask 的過渡磚；草地本身照常鋪 `Grass` 基底磚。缺的 mask（`5 7 10 11 13 14 15`）是對邊、三邊、細長條或內凹角才會用到，遇到時退回純土磚。

**水陸交界**：Stone Soup 的水面 sheet 沒有可判定方向的交界磚。但 Kenney 的 `waterBeach` 8 塊（四邊＋四角）已在 `isometric/` 內；另外 rubberduck 地面 sheet 第 3 列以後全是羽化邊過渡磚，先前切磚時只取完整菱形而略過，需要時可再切一次。

### 3.1 已實測、尺寸吻合的「真實地形磚」組合（推薦優先考慮）

game-icons 是 UI 圖示集，做成地形會有貼紙感。以下三組是實際渲染出來的等距地形，且原生尺寸就是 `64×32`，與專案 `TILE_W` / `TILE_H` 完全吻合。已切磚驗證可無縫拼接。

| 來源 | 作者 | 內容 | 尺寸 | 授權 |
|---|---|---|---|---|
| [OGA – Isometric Ground Tiles](https://opengameart.org/content/isometric-ground-tiles)<br>`ground_tiles_sheets.zip` | rubberduck | 8 種地面：翠綠/一般/乾草地、沙、泥土、深泥、林地、石板路。每張 sheet 512×224，含 **20 塊完整磚＋過渡磚** | 原生 `64×32`（另有 128×64） | **CC0** |
| [OGA – Free Isometric Plants Pack](https://opengameart.org/content/free-isometric-plants-pack)<br>`isometric-plant-pack.zip` | rubberduck | 15 類植物共 79 個切片：草叢、灌木、雜草、竹、樹、仙人掌、松（含積雪版）等。**與上方地面磚同作者、同渲染流程，風格一致** | 基準 `128×64`，套用需縮 0.5 | **CC0** |
| [OGA – Assorted Isometric Rocks](https://opengameart.org/content/assorted-isometric-rocks)<br>`hjm-assorted_rocks_1.png` | Hansjörg Malthaner（Varkalandar） | 約 126 顆岩石、9 種岩性配色（灰岩、玄武岩、砂岩、苔岩、大理石…） | 以 `64×32` 為基準，需自行切圖（原圖非等距網格） | **CC-BY 4.0 — 必須標注**，與其他 CC0 不同 |

補充：水面沒有風格相符的來源。[OGA – Grass and Water Tiles](https://opengameart.org/content/grass-and-water-tiles)（Clint Bellanger，CC-BY 3.0，24 塊 `64×64`／base `64×32`）尺寸吻合但為手繪像素風，與上述 3D 渲染風格衝突。評估時的做法是**水面維持主題色程式繪製**，這樣也保住了水在 14 種主題下的色彩區分。

### 3.2 其他評估過但未採用

| 來源 | 內容 | 未採用原因 |
|---|---|---|
| [Cozy Isometric Nature: Starter Pack 32x32](https://devdiavlo.itch.io/cozy-isometric-nature-starter-pack-32x32)（dev.diavlo） | 草地、泥土、石板路、水、樺樹、3 種岩石 | **無沙地、無草叢**；32×32 像素風與其他素材衝突；**禁止直接轉售或重新散布素材包本身**；需登入 itch.io 手動下載 |
| [Kenney – Isometric Tiles Landscape](https://kenney.nl/assets/isometric-tiles-landscape) | 128 塊低多邊形地景方塊（含水） | CC0 且含 water，但 132×83 需縮放；低多邊形色塊風 |
| [RhosGFX – Vector RPG Overworld (DEMO)](https://rhosgfx.itch.io/vector-rpg-overworld-demo) | 卡通向量風地形 | CC0，但為**俯視**非等距 |

### 風格一致性與主題色的取捨

這是選型的核心矛盾，記錄於此避免重複討論：

- **game-icons（已收錄）**：單色剪影，`fill="currentColor"` 可 tint，**14 種主題色全部自動支援**；但質感像 UI 圖示，不像地面
- **rubberduck / Varkalandar（3.1）**：看得出是真實地面與岩石；但**貼圖顏色固定，不會跟著主題色變** — 要還原 14 種主題的色彩區分，只能「每個主題各挑一組地形磚」
- **Stone Soup（3.0）**：地板種類夠多，能讓 14 種主題各配一組、質感完全不同；但是**像素風**，與 rubberduck／Varkalandar 的 3D 渲染混用會看得出來。若採用 Stone Soup 當地板，植物與岩石應改找像素風的來源
- **Kenney（已收錄 `isometric/`）**：彩色等距地板磚，同樣不隨主題變色
- 三者風格互不相容，**同一畫面不應混用**
