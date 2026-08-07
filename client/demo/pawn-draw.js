/**
 * 角色剪影（RimWorld 式無腳 pawn）的繪製核心。
 *
 * 由 `pawn.html`（參數調校）與 `character-create.html`（創角模擬）共用，
 * 也是之後移植到 Pixi 的單位 —— 移植時只需重寫 ctx 呼叫，形狀邏輯照搬。
 *
 * 只用到 roundRect / bezier / quadratic / ellipse / fill / stroke，
 * Pixi Graphics 全部有一對一的 API。
 */
/* ═══════════════════════════════════════════════════════════
   地圖常數 —— 與 client/src/pixi/utils/isometric.ts 同步
   ═══════════════════════════════════════════════════════════ */
const TILE_W = 64;
const TILE_H = 32;

/* 目前的圓圈（PlayerEntity.ts / NpcEntity.ts），只用於「並排現況」對照 */
const CIRCLE_RADIUS = TILE_H * 0.45;

/* 描邊顏色固定壓深，讓角色在 14 種主題地形上都切得出輪廓 */
const OUTLINE_COLOR = '#0b0b16';

/* ═══════════════════════════════════════════════════════════
   幾何預設值 —— 這些是起點，不是結論；由這頁調出最終值
   單位為 px（螢幕座標，未套整體縮放）
   ═══════════════════════════════════════════════════════════ */
const DEFAULT_GEOM = {
  headW: 18,      // 頭寬
  headH: 20,      // 頭高（略高於寬，蛋形）
  headR: 8,       // 頭的圓角
  /**
   * 頭底陷入軀幹幾 px —— 「駝不駝背」的旋鈕。
   * 0 = 頭整顆坐在肩線上；負值 = 留出脖子的縫；愈大愈縮進兩肩之間。
   */
  headOverlap: 3,
  headOff: 3,     // 頭往朝向側的水平偏移

  bodyH: 20,      // 軀幹高，底部貼齊地磚中心
  shoulder: 8,    // 肩半寬 ┐
  waist: 9,       // 腰半寬 ├ 三者的相對關係就是體型輪廓
  hip: 7,        // 臀半寬 ┘
  bodyR: 7,       // 軀幹底角圓角

  eyeR: 13,       // 眼睛半徑（0.1 px 為單位）
  eyeGap: 50,     // 兩眼中心距（0.1 px 為單位）
  eyeY: 8,        // 眼睛相對頭心的垂直位置（0.1 px 為單位，正值往下）

  /* 側面專用：側身看到的是厚度不是寬度，而且只看得到一顆眼睛 */
  sideNarrow: 78,     // 軀幹收窄成正面的百分之幾
  sideEyeShift: 40,   // 那顆眼睛離頭心多遠（往面朝側，0.1 px 為單位）
  sideLean: 22,       // 側面前傾：肩線往面朝側平移多少（0.1 px 為單位，腳底不動）
  sideWaistFront: 122, // 側面的腰（胸腹側）佔正面腰寬的百分之幾 —— 往前鼓
  sideWaistBack: 64,   // 側面的腰（背側）佔正面腰寬的百分之幾 —— 往內收

  /* 頭髮 */
  hairPuff: 12,       // 頭髮比頭大出多少（0.1 px，四周）
  /**
   * 馬尾／側馬尾：綁在腦後往下垂，中段微微鼓出去再收回來，尾端收尖。
   * 角度定義：0 = 垂直往下、90 = 水平、>90 = 往上翹。
   * 參考表上的 PONY 是「垂下來」的 —— 拱過頭頂那種是錯的。
   */
  tailW: 60,          // 寬度佔頭寬的百分之幾（太細會變成鐵絲，讀不出是頭髮）
  tailH: 96,          // 長度佔頭高的百分之幾（從髮髻往下垂，不能長到戳出腳底）
  tailAngle: 16,      // 起始角度
  tailCurl: -34,      // 負值＝往外飄
  tailCurl2: 44,      // 第二段反向 → 尾端收回來，整條呈 S

  /**
    * 雙馬尾＝黏在頭「下側」的兩顆圓球（RimWorld 的 Pigtails），不是細長髮束。
    * 長度接近寬度才會是球狀；角度偏水平，球才會往正側方凸出去。
    * 長雙馬尾與麻花辮以此為基準，靠 tailCfg 拉長並把角度扳回垂直。
    */
  twinW: 62,          // 寬度（＝球的直徑）佔頭寬的百分之幾
  twinH: 64,          // 長度佔頭高的百分之幾 —— 與寬度相當，所以是圓的
  twinAngle: 42,      // 起始角度（90 = 正側方；太接近 90 會變成水平的方塊，像耳朵）
  twinCurl: -24,      // 負值＝角度愈走愈大，球再往下外撇一點
  twinCurl2: 0,       // 不回彎

  knotR: 26,          // 髮髻半徑佔頭寬的百分之幾

  /**
   * 髮根高度（佔頭高的百分之幾，正值＝從頭心往下）。
   * 這幾個值決定髮尾會不會蓋滿身體甚至戳出腳底 ——
   * 角色總高只有 37px，髮尾長度必須拿這個尺度來算，不能照參考圖的相對長度抄。
   */
  ponyRootPct: -50,   // 後馬尾髮髻：要高到凸出「髮際線」（比頭頂再高一個蓬鬆值），
                      // 正面才有東西露得出來。
                      // 髮髻若整顆落在頭輪廓內，正面就該什麼都看不到 ——
                      // 那時候在側邊硬畫一坨，會跟背面的位置互相矛盾
  ponySideOffPct: 74, // 後馬尾側面時髮髻往身後推多遠（佔頭寬的百分之幾）
  ponyFrontPeekPct: 0, // 後馬尾正面時髮髻的左右偏移；0 = 正中央，與背面同一個位置
  twinSideOffMul: 96, // 雙馬尾側面時那顆球保留幾成的外移量
  twinRootPct: -16,   // 雙馬尾圓球：要落在髮際線覆蓋範圍內，才跟頭髮連成一坨
  twinOffPct: 30,     // 圓球髮根離頭心多遠（佔頭寬的百分之幾）—— 太小會整顆縮在頭裡看不見
  /* 長髮（獨立部件，與預設髮際線無關） */
  lgLen: 118,         // 全長佔頭高的百分之幾
  lgHemDip: 26,       // 下襬中間往下垂多少（0.1 px）—— 0 會變成一條平的切口
  lgTopW: 106,        // 頭部高度處的外緣半寬，佔頭半寬的百分之幾
  lgHemW: 130,        // 下襬外緣半寬
  lgFaceW: 84,        // 臉部開口半寬 —— 決定兩側垂髮有多寬
  lgLockMin: 26,      // 垂髮最細也要留這麼寬（避免開口撐破外緣）
  lgSideOpen: 46,     // 側面時臉部開口往面朝側偏多少
  lgFringe: 38,       // 瀏海蓋住頭高的百分之幾
  lgFringeDip: 22,    // 瀏海中間往下垂多少（0.1 px）
  lgSideBack: 150,    // 側面背側下襬倍率
  lgSideFront: 118,   // 側面臉側下襬倍率 —— 太窄的話臉部開口會被夾掉，
                      // 關不住臉的前緣，就會在臉旁邊留一塊

                      // 兩者描邊重合才不會在頭側留下一條把頭髮切成兩截的線
  bunR: 30,           // 丸子半徑佔頭寬的百分之幾
  mohawkH: 46,        // 莫霍克鰭高佔頭高的百分之幾
  ahogeLen: 92,      // 呆毛弧長佔頭高的百分之幾
  ahogeW: 15,         // 呆毛粗細佔頭寬的百分之幾
  ahogeAngle: 176,    // 呆毛起始角度（接近 180 = 從頭頂直直立起再拱開）
  ahogeCurl: 96,     // 呆毛拱過的總角度 —— 等於起始角時兩端會落在同一高度

  scale: 100,     // 整體縮放百分比
  outline: 22,    // 描邊粗細（0.1 px 為單位）
  shadow: 12,     // 地面陰影水平半徑（垂直半徑為其一半，配合等距 2:1）
  shadowA: 30,    // 陰影不透明度百分比
};


/* ═══════════════════════════════════════════════════════════
   髮型 —— 與體型互相獨立的另一個維度（7 髮型 × 5 體型 = 35 種剪影）

   每個髮型由四個開關組成，不是各畫一個形狀：
     cap   髮際線覆蓋倍率（0 = 光頭）
     flat  頂角是否壓方（平頭）
     part  正面是否左右不等高（旁分）
     tail  馬尾／雙馬尾
   ═══════════════════════════════════════════════════════════ */
/**
 * 髮際線的預設值。**每個髮型都複製一份自己的**，不共用全域滑桿 ——
 * 共用時調 A 會動到 B，而各髮型的頭型本來就該各自訂。
 * 最終要烘成 PNG，逐髮型各有一套數字才是對的做法。
 */
const CAP_DEFAULT = {
  front: 44,        // 正面髮際線覆蓋頭高的百分之幾
  back: 92,         // 背面覆蓋
  sideFront: 78,    // 側面面朝側收成正面的百分之幾
  sideHold: 58,     // 側面髮際線平走到頭寬的百分之幾才往腦後掉
  swoop: 26,        // 弧形瀏海往下垂多少（0.1 px）
  /**
   * 以下四項一定要在這裡給預設值。髮際線是 **一條連續路徑**，
   * 中段的座標由 bangW / peak / mDip 一起算出來 —— 少一個就是 NaN，
   * 整段中線的 path 指令會被靜默丟掉，退回一條直線，
   * 於是「滑桿在動、圖形不動」。缺值不會報錯，只會安靜地失效。
   */
  bangLen: 0,       // 兩側各垂一撮瀏海的長度（佔頭高百分之幾，0 = 沒有）
  bangW: 26,        // 那一撮的寬度（佔頭寬百分之幾）
  peak: 0,          // 中段整體抬起多少（0.1 px）
  mDip: 0,          // 中間相對兩側：負＝「人」、0＝平、正＝「M」（0.1 px）
};

/**
 * 睫毛。**不綁在髮型上** —— 短髮配睫毛、長髮不配都該成立，
 * 綁上去會少掉一半組合。所以它跟膚色髮色一樣，是造型自己的一組資料。
 *
 * 單位都是「眼睛半徑的 1/10」，所以調眼睛大小時睫毛會跟著等比縮放，
 * 不會出現眼睛變小、睫毛還是原來那麼長。
 */
const LASH_DEFAULT = {
  on: 0,       // 0 = 不畫
  len: 14,     // 從眼角往外掃多長（1.4 個眼睛半徑）—— 再長就伸出臉外了
  curl: 9,     // 末端往上翹多高；0 = 平直，負值 = 下垂
  w: 45,       // 線寬佔眼睛半徑的百分之幾
};

/** 眼珠與睫毛共用同一個顏色 —— 只有一排色票，不拆兩排 */
const EYE_COLOR_DEFAULT = OUTLINE_COLOR;

const HAIR_DEFAULTS = {
  cap: 1,            // 髮際線覆蓋倍率（0 = 光頭）
  edge: 'straight',  // 髮際線下緣：straight 平／swoop 弧形瀏海
  flat: false,       // 頂角壓方（平頭）
  part: false,       // 正面左右不等高（旁分）
  longHair: false,   // 用獨立的長髮部件（自帶輪廓、垂髮與瀏海，不走預設髮際線）
  tail: 'none',      // none / pony 綁腦後 / side 綁單側 / twin 綁兩側
  braid: false,      // 髮尾加上分節（麻花辮）
  knot: false,       // 髮根加一顆髮髻 —— 束起來的髮型需要它，否則只是一塊垂著的頭髮
  overHead: false,   // 髮束畫在頭與髮際線之上（貼著頭髮），而不是藏在頭後面
  bangs: 0,          // 正面兩側各垂一撮瀏海的長度倍率（0 = 沒有）
  capF: 1,           // 只縮**正面**的髮際線覆蓋（側面與背面不動）。
                     // 不能改 cap —— 那會連背面一起縮，背面就會露出頭皮
  top: 'none',       // none / bun / twinbun / mohawk / spike
};

/** 髮尾的長寬與彎度：以下值是「相對全域滑桿的增減」，滑桿仍然能整批調整 */
const TAIL_CFG = {
  base: 'twin',   // 髮尾長寬角度取哪一組全域參數（tail / twin）
  wMul: 1, lenMul: 1, angAdd: 0, curlAdd: 0, curl2Add: 0, rootAdd: 0, shape: 'taper',
};

const HAIR_STYLES = [
  { id: 'bald', capCfg: { front: 0, back: 0, bangLen: 0 },    label: '光頭',   cap: 0 },
  { id: 'buzz', capCfg: { front: 26, back: 53, bangLen: 0 },    label: '平頭', bangs: 0,   cap: 0.58, flat: true },
  { id: 'part', capCfg: { front: 42, back: 87, bangLen: 0 },    label: '旁分', bangs: 0,   cap: 0.95, edge: 'swoop', part: true },
  /* 長髮不另外加兩側瀏海 —— 髮量本身就框住臉了，
     兩者疊在一起只會多出一圈描邊，在頭側留下黑線 */
  { id: 'long', capCfg: { front: 44, back: 92, bangLen: 0 },    label: '長髮', bangs: 0, cap: 1.00, longHair: true },
  { id: 'pony', capCfg: { front: 33, back: 92, bangLen: 25   , peak: 30, mDip: -16 },     label: '後馬尾', bangs: 0.95, capF: 0.74, cap: 1.00, tail: 'pony', knot: true, overHead: true,
    tailCfg: { wMul: 0.70, lenMul: 1.62, angAdd: -26, curlAdd: 26, rootAdd: 0 } },
  /* 側馬尾就是長雙馬尾的一半 —— 共用同一組髮尾設定，只是單邊、不加髮髻 */
  { id: 'sidepony', capCfg: { front: 33, back: 92, bangLen: 25   , peak: 28, mDip: -14 }, label: '側馬尾', bangs: 0.95, capF: 0.74,   cap: 1.00, tail: 'side',
    tailCfg: { wMul: 0.68, lenMul: 1.62, angAdd: 0, curlAdd: 64, rootAdd: -8 } },
  { id: 'twin', capCfg: { front: 33, back: 92, bangLen: 27   , peak: 34, mDip: 14 },     label: '雙馬尾', bangs: 1.05, capF: 0.74,   cap: 1.00, tail: 'twin', top: 'spike', tailCfg: { shape: 'puff' } },
  { id: 'twinlong', capCfg: { front: 33, back: 92, bangLen: 26   , peak: 30, mDip: 12 }, label: '長雙馬尾', bangs: 1.0, capF: 0.74, cap: 1.00, tail: 'twin', top: 'spike',
    tailCfg: { wMul: 0.68, lenMul: 1.62, angAdd: 0, curlAdd: 64, rootAdd: -8 } },
  { id: 'braid', capCfg: { front: 33, back: 92, bangLen: 25   , peak: 28, mDip: 12 },    label: '麻花辮', bangs: 0.95, capF: 0.74,   cap: 1.00, tail: 'twin', top: 'spike', braid: true,
    tailCfg: { wMul: 0.76, lenMul: 1.58, angAdd: 0, curlAdd: 60, rootAdd: -8 } },
  { id: 'bun', capCfg: { front: 44, back: 92, bangLen: 0 },     label: '丸子頭', bangs: 0, cap: 1.00, top: 'bun' },
  { id: 'twinbun', capCfg: { front: 33, back: 92, bangLen: 23 }, label: '雙丸子', bangs: 0.9, capF: 0.74, cap: 1.00, top: 'twinbun' },
  { id: 'mohawk', capCfg: { front: 22, back: 46, bangLen: 0 },  label: '莫霍克', bangs: 0, cap: 0.50, top: 'mohawk' },
  { id: 'spike', capCfg: { front: 40, back: 85, bangLen: 0 },   label: '呆毛', bangs: 0,   cap: 0.92, top: 'spike' },
];

const HAIR_STYLE_BY_ID = Object.fromEntries(
  HAIR_STYLES.map(h => [h.id, {
    ...HAIR_DEFAULTS, ...h,
    capCfg: { ...CAP_DEFAULT, ...(h.capCfg || {}) },
    tailCfg: { ...TAIL_CFG, ...(h.tailCfg || {}) },
  }]),
);

/**
 * capCfg 少一個鍵不會拋錯，只會讓那段路徑變成 NaN 而被靜默丟掉，
 * 表面上看起來是「滑桿沒作用」。開發期直接擋下來。
 */
for (const [id, h] of Object.entries(HAIR_STYLE_BY_ID)) {
  for (const [k, v] of Object.entries(h.capCfg)) {
    if (!Number.isFinite(v)) throw new Error(`髮型 ${id} 的 capCfg.${k} 不是數字：${v}`);
  }
}

/* ═══════════════════════════════════════════════════════════
   造型預設 —— 五職業（04-character.md）＋ 幾個城鎮設施 NPC
   配色同樣是起點，等你在這頁挑定
   ═══════════════════════════════════════════════════════════ */
const PRESETS = [
  { id: 'knight',        label: '騎士',     hair: 'buzz',  eyes: 'dots',   skin: '#e8b98a', hairColor: '#4a3728', cloth: '#7f93b5' },
  { id: 'elf',           label: '精靈',      hair: 'pony',  eyes: 'dots',   lash: { on: 1 }, skin: '#f0d6b0', hairColor: '#d9c87a', cloth: '#5f9e6a' },
  { id: 'elementalist',  label: '元素師', hair: 'twin',  eyes: 'dots',   lash: { on: 1 }, skin: '#e3b585', hairColor: '#6b4fa0', cloth: '#8b6fc4' },
  { id: 'priest',        label: '牧師',  hair: 'part',  eyes: 'dots',   skin: '#eec9a0', hairColor: '#c9c2b4', cloth: '#e6e2d6' },
  { id: 'thief',         label: '盜賊',      hair: 'part',  eyes: 'dots',   skin: '#d9a879', hairColor: '#2f2a33', cloth: '#4a4356' },

  { id: 'blacksmith',    label: 'NPC 鐵匠',     hair: 'bald',  eyes: 'dots',   skin: '#c98f5e', hairColor: '#3a2a20', cloth: '#6b4a33' },
  { id: 'general-store', label: 'NPC 雜貨', hair: 'twin',  eyes: 'dots',   lash: { on: 1 }, skin: '#eec9a0', hairColor: '#8a6b4a', cloth: '#4ade80' },
  { id: 'sigil-master',  label: 'NPC 印記',  hair: 'bun',   eyes: 'dots',   skin: '#dcb894', hairColor: '#b0aec4', cloth: '#5a4d7a' },
];

/**
 * 四張圖：正面／背面／左／右 —— 與 RimWorld 一樣。
 *
 * 等距地圖上這四個世界方向在螢幕上是斜的，但那是投影的事，
 * 角色本身仍然只有這四種畫法：
 *   front 看得到臉、back 是空白後腦、side 是側身（窄身、頭與眼睛轉過去）。
 *
 * sign 只對 side 有意義：+1 面向右、-1 面向左。
 */
const DIRS = [
  { id: 'front', label: '正面', view: 'front', sign:  0 },
  { id: 'right', label: '右',   view: 'side',  sign:  1 },
  { id: 'left',  label: '左',   view: 'side',  sign: -1 },
  { id: 'back',  label: '背面', view: 'back',  sign:  0 },
];

/* ═══════════════════════════════════════════════════════════
   繪製
   ═══════════════════════════════════════════════════════════ */

function paint(ctx, fill, outline, join = 'round') {
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline > 0) {
    ctx.strokeStyle = OUTLINE_COLOR;
    ctx.lineWidth = outline;
    ctx.lineJoin = join;   /* 髮尾要 miter 才收得出尖端，round 會把尖角磨平 */
    ctx.miterLimit = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/**
 * 髮尾的中心線 —— 一條圓弧，不是直線。
 *
 * 這是「翹起來」與「兔耳朵」的差別：髮尾的方向必須沿路轉，
 * 從髮根以 ang 甩出去，一路轉過 curl 度，尾端就自然彎回來往下落。
 * 方向固定不變的話，不管角度給多少都只是一根直直射出去的棒子。
 *
 *   ang  = 0 垂直往下／90 水平／>90 往上甩
 *   curl = 掃過的總角度。0 是直的；大於 ang 時尾端會轉到水平線以下
 *   bias = 往哪一側（+1 右 / -1 左）
 *
 * 位置是方向的積分，圓弧剛好有解析解，不必逐點累加。
 */
function tailSpine(tx, ty, len, angDeg, curlDeg, curl2Deg, bias) {
  const STEPS = 48;
  const a0 = (angDeg * Math.PI) / 180;
  const c1 = (curlDeg * Math.PI) / 180;
  const c2 = (curl2Deg * Math.PI) / 180;

  /* 彎度隨 t 再變化，curl2 與 curl 反號時就會回彎成 S 形 */
  const angAt = t => a0 - c1 * t - c2 * t * t;

  const xs = [tx];
  const ys = [ty];
  for (let i = 1; i <= STEPS; i++) {
    const a = angAt((i - 0.5) / STEPS);   // 中點取樣，誤差比端點取樣小一階
    xs.push(xs[i - 1] + bias * Math.sin(a) * len / STEPS);
    ys.push(ys[i - 1] + Math.cos(a) * len / STEPS);
  }

  return t => {
    const u = Math.max(0, Math.min(1, t)) * STEPS;
    const i = Math.min(STEPS - 1, Math.floor(u));
    const f = u - i;
    const a = angAt(t);
    return {
      x: xs[i] + (xs[i + 1] - xs[i]) * f,
      y: ys[i] + (ys[i + 1] - ys[i]) * f,
      dx: bias * Math.sin(a),
      dy: Math.cos(a),
    };
  };
}

/**
 * 沿著中心線兩側各外推半個髮束寬。
 * 用取樣直線段描邊 —— Pixi Graphics 同樣有 lineTo，移植不變。
 *
 * shape 決定寬度輪廓，這是「馬尾」與「雙馬尾」外觀差最多的地方：
 *   taper  一路收細到尖點  —— 馬尾、麻花辮
 *   puff   愈往下愈胖，尾端圓鈍 —— 雙馬尾那種短胖的一束
 */
function tailPath(ctx, spine, w, shape = 'taper', samples = 20) {
  const hw = w / 2;
  const halfAt = shape === 'puff'
    /* sqrt(1 - t^8) 讓寬度撐到很後面才掉下去，尾端就是圓的而不是尖的 */
    ? t => hw * (0.62 + 0.38 * t) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 8)))
    : t => hw * Math.pow(1 - t, 0.6);

  const right = [];
  const left = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = spine(t);
    const hwT = halfAt(t);
    right.push([p.x + p.dy * hwT, p.y - p.dx * hwT]);
    left.push([p.x - p.dy * hwT, p.y + p.dx * hwT]);
  }

  const root = spine(0);
  ctx.beginPath();
  ctx.moveTo(right[0][0], right[0][1]);
  for (let i = 1; i <= samples; i++) ctx.lineTo(right[i][0], right[i][1]);
  for (let i = samples - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
  /* 綁起來的圓頭：往髮根反方向鼓出去 */
  ctx.quadraticCurveTo(
    root.x - root.dx * hw * 1.45, root.y - root.dy * hw * 1.45,
    right[0][0], right[0][1],
  );
  ctx.closePath();
}

/**
 * 軀幹輪廓：左右對稱的封閉路徑，由肩／腰／臀三個半寬決定。
 *
 * 側邊用三次貝茲，兩個控制點都放在腰寬上 —— 腰比肩臀窄就收出沙漏，
 * 介於中間就是梯形，比肩臀寬就鼓成桶狀。一條公式涵蓋所有體型，
 * 不需要為每種體型各畫一個形狀。
 */
function bodyPath(ctx, cx, gy, sh, waL, waR, hi, h, r, lean) {
  const top = gy - h;
  const rb = Math.min(r, hi * 0.9, h * 0.4);

  /* 前傾：腳底不動，愈往上偏移愈多 —— 等於把輪廓剪切一個角度 */
  const xTop = cx + lean;         // 肩線
  const xC1 = cx + lean * 0.62;   // 上段控制點（離地 62%）
  const xC2 = cx + lean * 0.38;   // 下段控制點（離地 38%）

  ctx.beginPath();
  ctx.moveTo(xTop - sh, top);
  ctx.lineTo(xTop + sh, top);
  ctx.bezierCurveTo(xC1 + waR, top + h * 0.38, xC2 + waR, top + h * 0.62, cx + hi, gy - rb);
  ctx.quadraticCurveTo(cx + hi, gy, cx + hi - rb, gy);
  ctx.lineTo(cx - hi + rb, gy);
  ctx.quadraticCurveTo(cx - hi, gy, cx - hi, gy - rb);
  ctx.bezierCurveTo(xC2 - waL, top + h * 0.62, xC1 - waL, top + h * 0.38, xTop - sh, top);
  ctx.closePath();
}

/**
 * 髮際線：上緣貼著頭頂（圓角），下緣是一條直線 —— 所以不需要 clip，
 * 只要頭髮比頭寬一點，直接蓋上去就是對的形狀。
 *
 * 左右下緣可以不等高（hL / hR），旁分與側面的髮際線都靠這個做出來。
 */
function hairCapPath(ctx, cx, top, w, hL, hR, r, o) {
  const { edge, swoop, hold, front, bang, bangW, peak, mDip } = o;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const rr = Math.max(0, Math.min(r, w / 2, hL, hR));

  ctx.beginPath();
  ctx.moveTo(x0, top + hL);
  ctx.lineTo(x0, top + rr);
  ctx.quadraticCurveTo(x0, top, x0 + rr, top);

  ctx.lineTo(x1 - rr, top);
  ctx.quadraticCurveTo(x1, top, x1, top + rr);
  ctx.lineTo(x1, top + hR);

  /* 髮際線（下緣）：由右往左回去 */
  if (edge === 'swoop') {
    /* 弧形瀏海：中段垂下來一道，配上 part 的左右不等高就是側分 */
    ctx.bezierCurveTo(
      x1 - w * 0.16, top + hR + swoop * 0.35,
      x0 + w * 0.44, top + hL + swoop,
      x0, top + hL,
    );
  } else if (edge === 'sideswept') {
    /**
     * 側面專用：臉那半邊維持在髮際線高度**平走**，落差整個集中到腦後。
     *
     * 不能只拉一條斜線或單一條貝茲 —— 兩者的下緣都會斜著切過臉，
     * 正好壓在眼睛上（貝茲的 y 掉得比 x 快，比直線只好一點點）。
     * hold 就是「平走到哪裡才開始往下掉」，要拉過眼睛的位置。
     */
    if (front > 0) {
      const xb = x1 - w * hold;
      ctx.lineTo(xb, top + hR);
      ctx.bezierCurveTo(xb - w * 0.12, top + hR, x0 + w * 0.10, top + hL, x0, top + hL);
    } else {
      const xb = x0 + w * hold;
      ctx.bezierCurveTo(x1 - w * 0.10, top + hR, xb + w * 0.12, top + hL, xb, top + hL);
      ctx.lineTo(x0, top + hL);
    }
  } else if (bang > 0.05) {
    /**
     * 兩側瀏海不是另外貼上去的形狀，就是這條髮際線本身 ——
     * 走到兩端時往下垂一撮再收回原來的高度，中間那段維持原樣。
     * 貼三角形會有接縫，也不是同一個輪廓。
     */
    ctx.lineTo(x1 - bangW * 0.18, top + hR + bang);
    ctx.quadraticCurveTo(x1 - bangW * 0.55, top + hR + bang * 0.30, x1 - bangW, top + hR);
    /**
     * 中段的形狀由兩個數字調出來，不是幾個寫死的樣式：
     *   peak  中段整體抬起多少
     *   mDip  中間相對兩側的高低 —— **負值＝「人」**、0＝平、**正值＝「M」**
     *         （值越小，M 的中間越高）
     */
    const xa = x1 - bangW, xb = x0 + bangW;
    const ya = top + hR, yb = top + hL;
    const xm = (xa + xb) / 2;

    if (Math.abs(peak) > 0.05 || Math.abs(mDip) > 0.05) {
      const h1 = (xa + xm) / 2, h2 = (xm + xb) / 2;
      ctx.quadraticCurveTo(xa - (xa - h1) * 0.55, ya - peak * 1.15, h1, ya - peak);
      ctx.quadraticCurveTo((h1 + xm) / 2, ya - peak + mDip * 0.9, xm, ya - peak + mDip);
      ctx.quadraticCurveTo((xm + h2) / 2, yb - peak + mDip * 0.9, h2, yb - peak);
      ctx.quadraticCurveTo(xb + (h2 - xb) * 0.55, yb - peak * 1.15, xb, yb);
    } else {
      ctx.lineTo(xb, yb);
    }
    ctx.quadraticCurveTo(x0 + bangW * 0.55, top + hL + bang * 0.30, x0 + bangW * 0.18, top + hL + bang);
    /* closePath 從左撮的尖端拉回起點，正好收成那一撮的外緣 */
  }
  /* 兩者皆無時 closePath 自己拉一條直線回去 */

  ctx.closePath();
}

/**
 * 畫一個 pawn。(gx, gy) 是所站地磚的中心 —— 軀幹底部貼齊該點，
 * 與現行圓圈「圓心上移 RADIUS」是同一套對齊邏輯（40-pixijs-migration.md）。
 */
function drawPawn(ctx, gx, gy, dir, look, g) {
  const s = g.scale / 100;
  const ol = (g.outline / 10) * s;
  /* 側面看到的是身體的厚度而不是寬度，所以整體收窄 */
  const narrow = dir.view === 'side' ? g.sideNarrow / 100 : 1;

  const bodyH = g.bodyH * s;
  const sh = g.shoulder * s * narrow;
  const wa = g.waist * s * narrow;
  const hi = g.hip * s * narrow;

  /**
   * 側面的腰左右不對稱：胸腹往前鼓、腰背往內收。
   * 只把三個寬度等比縮窄會變成一根直筒 —— 前後給不同的腰寬才有側身的弧度。
   */
  const isSide = dir.view === 'side';
  const waFront = wa * (isSide ? g.sideWaistFront / 100 : 1);
  const waBack = wa * (isSide ? g.sideWaistBack / 100 : 1);
  const waR = !isSide || dir.sign > 0 ? waFront : waBack;
  const waL = !isSide || dir.sign > 0 ? waBack : waFront;

  const headW = g.headW * s;
  const headH = g.headH * s;
  const headR = Math.min(g.headR * s, headW / 2, headH / 2);
  /* 側面稍微前傾：肩線與頭一起往面朝側平移，腳底不動 */
  const lean = dir.view === 'side' ? dir.sign * (g.sideLean / 10) * s : 0;

  /* 頭「坐在」軀幹頂端，再往下陷 headOverlap */
  const headCy = gy - (bodyH + headH / 2 - g.headOverlap * s);
  const headCx = gx + dir.sign * g.headOff * s + lean;

  ctx.save();

  const hs = HAIR_STYLE_BY_ID[look.hair] || HAIR_STYLE_BY_ID.bald;
  const knots = [];          /* 髮髻要等頭畫完才畫 */
  const deferredTails = [];  /* 貼在頭髮上的髮束，同樣延後 */
  let deferredDraw = null;
  const puff = (g.hairPuff / 10) * s;

  /* ── 1. 地面陰影（等距 2:1，所以垂直半徑減半） ── */
  if (g.shadow > 0 && g.shadowA > 0) {
    ctx.globalAlpha = g.shadowA / 100;
    ctx.beginPath();
    ctx.ellipse(gx, gy, g.shadow * s, g.shadow * s * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * 長髮是**獨立部件**，不沿用預設髮際線。
   *
   * 一條封閉路徑同時畫出：外輪廓、兩側垂髮、瀏海，中間留一個臉的開口
   * （像一頂假髮）。整頭只有一條輪廓線，所以結構上不可能出現接縫 ——
   * 先前把它拆成「髮際線 + 髮量」兩塊各自描邊，才會不管怎麼調都在某處被切開。
   *
   * 因為自帶臉部開口，可以直接畫在頭與軀幹之上，不需要逐朝向調繪製順序。
   */
  function drawLongHair() {
    const half = headW / 2;
    const yTop = headCy - headH / 2 - puff;
    const len = (g.lgLen / 100) * headH;
    const yBot = yTop + len;
    const yFr = yTop + (g.lgFringe / 100) * headH;
    const rTop = Math.min(headR + puff, len * 0.3);
    const rHem = Math.min(half * 0.5, len * 0.18);
    /**
     * 臉部開口的半寬必須**小於那一側的下襬外緣**，否則內外邊界會交叉，
     * 路徑自我相交，側面就會冒出一片多餘的細長形狀。
     * 側面時開口再往面朝側偏，臉才會落在開口裡。
     */
    const dip = (g.lgHemDip / 10);
    const fw0 = half * (g.lgFaceW / 100);
    const lockMin = half * (g.lgLockMin / 100);
    const openCx = headCx + (dir.view === 'side' ? dir.sign * half * (g.lgSideOpen / 100) : 0);

    /* 側面：背側加寬、臉側收窄；正面／背面左右對稱 */
    const sideMul = sign => dir.view !== 'side' ? 1
      : (sign === -dir.sign ? g.lgSideBack : g.lgSideFront) / 100;
    const mL = sideMul(-1), mR = sideMul(1);
    /* 頂端兩側都要蓋得住頭，前後差異只作用在下襬 */
    const topL = half * (g.lgTopW / 100) * (dir.view === 'side' ? 1.12 : mL);
    const topR = half * (g.lgTopW / 100) * (dir.view === 'side' ? 1 : mR);
    const hemL = half * (g.lgHemW / 100) * mL, hemR = half * (g.lgHemW / 100) * mR;
    const cx = headCx;

    ctx.beginPath();
    /* 外輪廓 左上角 → 頂 → 右上角 → 右下襬 */
    ctx.moveTo(cx - topL, yTop + rTop);
    ctx.quadraticCurveTo(cx - topL, yTop, cx - topL + Math.min(rTop, topL), yTop);
    ctx.lineTo(cx + topR - Math.min(rTop, topR), yTop);
    ctx.quadraticCurveTo(cx + topR, yTop, cx + topR, yTop + rTop);
    ctx.bezierCurveTo(cx + topR, yTop + len * 0.45, cx + hemR, yTop + len * 0.62, cx + hemR, yBot - rHem);
    ctx.quadraticCurveTo(cx + hemR, yBot, cx + hemR - rHem, yBot);

    if (dir.view === 'back') {
      /* 背面沒有臉：下襬走一條中間微垂的弧，不是平的切口 */
      ctx.bezierCurveTo(
        cx + hemR * 0.5, yBot + dip, cx - hemL * 0.5, yBot + dip,
        cx - hemL + rHem, yBot,
      );
    } else {
      /* 內輪廓：右側垂髮的內緣 → 上到瀏海 → 橫過瀏海 → 左側垂髮內緣 */
      const fR = Math.min(fw0, cx + hemR - openCx - lockMin);
      const fL = Math.min(fw0, openCx - (cx - hemL) - lockMin);
      ctx.bezierCurveTo(cx + hemR * 0.55, yBot + dip, openCx + fR, yBot + dip, openCx + fR, yBot - rHem * 0.5);
      ctx.bezierCurveTo(openCx + fR, yTop + len * 0.45, openCx + fR, yFr + 1, openCx + fR, yFr);
      ctx.quadraticCurveTo(openCx, yFr + (g.lgFringeDip / 10), openCx - fL, yFr);
      ctx.bezierCurveTo(openCx - fL, yFr + 1, openCx - fL, yTop + len * 0.45, openCx - fL, yBot - rHem * 0.5);
      ctx.bezierCurveTo(openCx - fL, yBot + dip, cx - hemL * 0.55, yBot + dip, cx - hemL + rHem, yBot);
    }

    ctx.quadraticCurveTo(cx - hemL, yBot, cx - hemL, yBot - rHem);
    ctx.bezierCurveTo(cx - hemL, yTop + len * 0.62, cx - topL, yTop + len * 0.45, cx - topL, yTop + rTop);
    ctx.closePath();
    paint(ctx, look.hairColor, ol);
  }


  /* ── 2. 軀幹 ── */
  bodyPath(ctx, gx, gy, sh, waL, waR, hi, bodyH, g.bodyR * s, lean);
  paint(ctx, look.cloth, ol);

  /* ── 3. 頭髮的「頭後」部分：爆炸頭、馬尾 ──
     畫在頭之前，才會被頭蓋住而落在後方；但在軀幹之後，
     所以馬尾與雙馬尾會自然披在肩上。 */
  if (hs.tail !== 'none') {
    /**
     * 雙馬尾是「短胖圓頭、往下往外撇」，馬尾與麻花辮是「細長收尖」——
     * 兩者的長寬、角度、寬度輪廓全都不同，不能共用一組數字。
     */
    const c = hs.tailCfg;
    const b = c.base;   /* 'twin' = 用雙馬尾那組髮束，後馬尾與側馬尾都共用 */

    const tw = (g[b + 'W'] / 100) * headW * c.wMul;
    const th = (g[b + 'H'] / 100) * headH * c.lenMul;
    const ang = g[b + 'Angle'] + c.angAdd;
    const curl = g[b + 'Curl'] + c.curlAdd;
    const curl2 = g[b + 'Curl2'] + c.curl2Add;
    const shape = c.shape;

    /**
     * 髮根的位置決定了整體長相：
     * 馬尾綁在腦後偏下（所以正面被頭完全擋住，只有背面與側面看得到），
     * 雙馬尾綁在兩側偏上（正背面都看得到，側面只露近的那一束）。
     * bias 是往哪一側甩。
     */
    const tails = [];
    if (hs.tail === 'pony') {
      const y = headCy + headH * ((g.ponyRootPct + c.rootAdd) / 100);
      if (dir.view === 'back') {
        tails.push({ x: headCx, y, bias: 1 });
      } else if (dir.view === 'side') {
        /* 側面要推到頭的輪廓外，不然髮髻會變成黏在臉頰上的一顆球 */
        /* y 必須與正面／背面同高 —— 髮髻是同一顆，換個角度看不該上下跑 */
        tails.push({ x: headCx - dir.sign * headW * (g.ponySideOffPct / 100), y, bias: -dir.sign });
      } else if (hs.knot) {
        /**
         * 正面：髮髻在腦後、被頭擋住，只有凸出頭輪廓的那一小坨露得出來。
         * 位置必須與背面同一點（同樣的 y、預設不左右偏），
         * 否則從正面看到的位置會跟背面對不起來。
         */
        const kr = (g.knotR / 100) * headW;
        ctx.beginPath();
        ctx.ellipse(headCx - headW * (g.ponyFrontPeekPct / 100), y, kr, kr * 0.94, 0, 0, Math.PI * 2);
        paint(ctx, look.hairColor, ol);
      }
    } else if (hs.tail === 'side') {
      /* 側馬尾＝雙馬尾取單邊：髮根、角度、長寬全部沿用，不另立一套 */
      const sb = dir.view === 'side' ? -dir.sign : 1;
      tails.push({
        x: headCx + sb * (headW / 2 + tw * 0.06),
        y: headCy + headH * ((g.twinRootPct + c.rootAdd) / 100),
        bias: sb,
      });
    } else {
      /* 圓球（Pigtails）髮根要塞進頭裡才像黏上去的；細長款則掛在頭緣 */
      const off = shape === 'puff'
        ? headW * (g.twinOffPct / 100)
        : headW / 2 + tw * 0.06;
      const y = headCy + headH * ((g.twinRootPct + c.rootAdd) / 100);
      /* 側面那顆要推到頭緣，縮太多會整顆藏在頭裡 */
      if (dir.view === 'side') tails.push({ x: headCx - dir.sign * off * (g.twinSideOffMul / 100), y, bias: -dir.sign });
      else tails.push({ x: headCx - off, y, bias: -1 }, { x: headCx + off, y, bias: 1 });
    }

    /**
     * 後馬尾的髮束是**貼在頭髮上**的（參考圖的 PONY 就是這樣），
     * 所以要延後到頭與髮際線都畫完才畫，靠描邊在髮色上分出輪廓。
     * 畫在頭之前的話，只有超出頭以外的部分看得到 —— 那就變成「頭以下的馬尾」。
     */
    const drawTail = ({ x: tx, y: ty, bias }) => {
      const spine = tailSpine(tx, ty, th, ang, curl, curl2, bias);
      tailPath(ctx, spine, tw, shape);
      paint(ctx, look.hairColor, ol, shape === 'puff' ? 'round' : 'miter');

      /* 麻花辮：沿著中心線補三顆逐漸縮小的結，就有分節感 */
      if (hs.braid) {
        for (let i = 1; i <= 3; i++) {
          const t = i / 4;
          const p = spine(t);
          const kr = (tw / 2) * (1 - t * 0.55);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, kr, kr * 0.72, 0, 0, Math.PI * 2);
          paint(ctx, look.hairColor, ol);
        }
      }

      /**
       * 束起來的髮髻：一顆小包包頭，髮尾從它下面垂出來 ——
       * 結構上就是「丸子頭多留一串髮下來」。
       *
       * 收集起來等頭與髮際線都畫完再畫，否則整顆會被頭蓋掉，
       * 只剩一彎月牙露在頭底，看起來像缺角而不是髮髻。
       */
      if (hs.knot) knots.push({ x: tx, y: ty });
    };

    if (hs.overHead) deferredTails.push(...tails);
    else tails.forEach(drawTail);
    deferredDraw = drawTail;
  }

  /* ── 4. 頭（畫在軀幹與腦後頭髮之上，交疊處被蓋掉） ── */
  ctx.beginPath();
  ctx.roundRect(headCx - headW / 2, headCy - headH / 2, headW, headH, headR);
  paint(ctx, look.skin, ol);

  /* ── 5. 眼睛：正面與側面才畫，背面是空白後腦 ── */
  if (dir.view !== 'back' && look.eyes !== 'none') {
    const er = (g.eyeR / 10) * s;
    const gap = (g.eyeGap / 10) * s;
    const ey = headCy + (g.eyeY / 10) * s;

    /**
     * 側面只看得到一顆眼睛 —— 另一顆在頭的另一側，被擋住。
     * 那顆眼睛往面朝的方向挪，睫毛也畫在面朝那側。
     */
    const eyes = dir.view === 'side'
      ? [{ x: headCx + dir.sign * (g.sideEyeShift / 10) * s, lash: dir.sign }]
      : [{ x: headCx - gap / 2, lash: -1 }, { x: headCx + gap / 2, lash: 1 }];

    const lashCfg = { ...LASH_DEFAULT, ...(look.lash || {}) };
    const eyeColor = look.eyeColor || EYE_COLOR_DEFAULT;

    for (const { x: ex, lash } of eyes) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, er, er * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = eyeColor;
      ctx.fill();

      /**
       * 睫毛：從眼角往外掃出去的一道弧，末端上翹。
       *
       * 起點壓在眼球的**外上緣**上（0.62 er 外、0.82 er 高），不是眼睛正上方 ——
       * 睫毛長在眼角。浮在眼睛正上方、又往外斜上去的一道線會讀成眉毛，
       * 兩邊一起看就是一張怒臉，而不是有睫毛的臉。
       *
       * 控制點在 0.62 而不是中點，弧才會「貼著眼睛走一小段再往上勾」。
       */
      if (lashCfg.on) {
        const L = (lashCfg.len / 10) * er;      // 往外
        const C = (lashCfg.curl / 10) * er;     // 往上
        const x0 = ex + lash * er * 0.72, y0 = ey - er * 0.72;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + lash * L * 0.62, y0 - C * 0.30, x0 + lash * L, y0 - C);
        ctx.strokeStyle = eyeColor;
        ctx.lineWidth = Math.max((lashCfg.w / 100) * er, 0.5);
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }
  }

  /* ── 6. 髮際線：最後畫，瀏海才會壓在眼睛上而不是被眼睛壓住 ──
     正面露出額頭、背面幾乎蓋滿；側面則是「面朝那側露額頭、背對那側蓋到底」，
     一條斜下去的髮際線，側臉的感覺就出來了。 */
  if (hs.cap > 0 && !hs.longHair) {
    const cc = hs.capCfg;
    const covF = (cc.front / 100) * headH;
    const covB = (cc.back / 100) * headH;

    let hL, hR;
    if (dir.view === 'front') {
      /* capF 只作用在正面 —— 側面與背面維持原樣 */
      hL = covF;
      hR = hs.part ? covF * 0.52 : covF;
    } else if (dir.view === 'back') {
      hL = hR = covB;
    } else {
      /* 側面：面朝那側再往上收一截，眼睛才不會被瀏海壓住 */
      const covSide = covF * (cc.sideFront / 100);
      hL = dir.sign > 0 ? covB : covSide;
      hR = dir.sign > 0 ? covSide : covB;
    }

    /* 側面一律走 sideswept（捲髮除外，它的鋸齒邊本來就不是直線） */
    const capEdge = dir.view === 'side' ? 'sideswept' : hs.edge;

    hairCapPath(
      ctx,
      headCx,
      headCy - headH / 2 - puff,
      headW + puff * 2,
      hL + puff,
      hR + puff,
      hs.flat ? headR * 0.3 : headR + puff,
      {
        edge: capEdge,
        bang: dir.view === 'front' ? (cc.bangLen / 100) * headH : 0,
        bangW: (cc.bangW / 100) * headW,
        peak: dir.view === 'front' ? (cc.peak / 10) * s : 0,
        mDip: dir.view === 'front' ? (cc.mDip / 10) * s : 0,
        swoop: (cc.swoop / 10) * s,
        hold: cc.sideHold / 100,
        front: dir.sign,
      },
    );
    paint(ctx, look.hairColor, ol);
  }

  /**
   * 背面：看到的是頭髮的背面 —— 頭整顆在頭髮**裡面**，不該看得到。
   * 先前畫在頭之前，頭的輪廓就整條蓋在髮量上，中間出現一道橫線，
   * 看起來像一塊板子貼在頭髮上、而不是一整片頭髮。
   */
  if (hs.locks > 0 && dir.view === 'back') drawLongHair();

  /* 長髮：自帶臉部開口，直接畫在頭與軀幹之上 */
  if (hs.longHair) drawLongHair();

  /* ── 7. 貼在頭髮上的髮束（後馬尾），以及髮髻 ── */
  if (deferredDraw) deferredTails.forEach(deferredDraw);
  /* ── 7b. 髮髻：等頭與髮際線都畫完才畫，整顆才露得出來 ── */
  for (const k of knots) {
    const kr = (g.knotR / 100) * headW;
    ctx.beginPath();
    ctx.ellipse(k.x, k.y, kr, kr * 0.94, 0, 0, Math.PI * 2);
    paint(ctx, look.hairColor, ol);
  }

  /* ── 8. 頭頂上的東西：丸子、莫霍克、呆毛 —— 畫在髮際線之上 ── */
  if (hs.top !== 'none') {
    const headTop = headCy - headH / 2 - puff;

    if (hs.top === 'bun' || hs.top === 'twinbun') {
      const br = (g.bunR / 100) * headW;
      /* 丸子綁在腦後：側面時往身後挪，正面才在正中央 */
      const spots = hs.top === 'bun'
        ? [[headCx - lean * 1.4, headTop + br * 0.25]]
        : [[headCx - headW * 0.34, headTop + br * 0.1], [headCx + headW * 0.34, headTop + br * 0.1]];

      for (const [bx, by] of spots) {
        ctx.beginPath();
        ctx.ellipse(bx, by, br, br * 0.92, 0, 0, Math.PI * 2);
        paint(ctx, look.hairColor, ol);
      }
    } else if (hs.top === 'mohawk') {
      /* 莫霍克：一整片立起來的鰭 */
      const mh = (g.mohawkH / 100) * headH;
      const mw = headW * 0.58;

      ctx.beginPath();
      ctx.moveTo(headCx - mw / 2, headTop + mh * 0.18);
      ctx.quadraticCurveTo(headCx - mw * 0.30, headTop - mh, headCx, headTop - mh * 0.86);
      ctx.quadraticCurveTo(headCx + mw * 0.30, headTop - mh, headCx + mw / 2, headTop + mh * 0.18);
      ctx.closePath();
      paint(ctx, look.hairColor, ol, 'miter');
    } else {
      /**
       * 呆毛：一道拱過頭頂的弧，不是一根刺 —— 跟馬尾共用同一條圓弧公式。
       * 起點往左推半個跨距，弧就會自動置中，不必隨參數手動對位。
       */
      const bias = dir.sign || 1;
      const len = (g.ahogeLen / 100) * headH;
      /* 髮根就在頭頂正中央 —— 呆毛是從那裡長出來再彎過去，
         不是一道跨在頭上的拱橋（先前把整條弧置中，髮根就跑到左邊去了） */
      const spine = tailSpine(headCx, headTop + headH * 0.04, len, g.ahogeAngle, g.ahogeCurl, 0, bias);
      tailPath(ctx, spine, (g.ahogeW / 100) * headW);
      paint(ctx, look.hairColor, ol, 'miter');
    }
  }

  ctx.restore();
}

/** 現況：Graphics.circle()，圓心自地磚中心上移一個半徑 */
function drawCircle(ctx, gx, gy) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.ellipse(gx, gy - CIRCLE_RADIUS, CIRCLE_RADIUS + 2, CIRCLE_RADIUS + 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#74c0fc';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.ellipse(gx, gy - CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4dabf7';
  ctx.fill();
  ctx.restore();
}

/** 等距地磚：菱形棋盤，顏色取草地主題的深淺兩階 */
function drawTile(ctx, gx, gy, fill, showGrid) {
  ctx.beginPath();
  ctx.moveTo(gx, gy - TILE_H / 2);
  ctx.lineTo(gx + TILE_W / 2, gy);
  ctx.lineTo(gx, gy + TILE_H / 2);
  ctx.lineTo(gx - TILE_W / 2, gy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (showGrid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'miter';
    ctx.stroke();
  }
}

/* 給 demo 頁使用（單檔、無模組系統，掛到 window 上） */
Object.assign(window, {
  TILE_W, TILE_H, DEFAULT_GEOM, CAP_DEFAULT, LASH_DEFAULT, EYE_COLOR_DEFAULT,
  HAIR_STYLES, HAIR_STYLE_BY_ID,
  PRESETS, DIRS, drawPawn, drawTile, drawCircle,
});
