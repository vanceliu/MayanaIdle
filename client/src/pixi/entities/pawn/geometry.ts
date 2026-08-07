/**
 * 角色剪影的繪製參數 —— 規格見 `docs/design/04-character.md` § 4.10。
 *
 * 這裡的數字**只影響畫面**，不進存檔。改了重畫就好，不需要資料遷移 ——
 * 會被存檔的外觀資料在 `models/appearance.ts`，兩者刻意分開。
 *
 * 單位為 px（未套整體縮放）。部分欄位以 0.1 px 或百分比為單位，逐欄註明。
 */

/** 描邊固定壓深，讓角色在 14 種主題地形上都切得出輪廓 */
export const OUTLINE_COLOR = '#0b0b16';

/** 沒指定眼色時的預設（眼珠與睫毛共用同一個顏色） */
export const EYE_COLOR_DEFAULT = OUTLINE_COLOR;

export interface PawnGeom {
  headW: number; headH: number; headR: number; headOverlap: number; headOff: number;
  bodyH: number; shoulder: number; waist: number; hip: number; bodyR: number;
  eyeR: number; eyeGap: number; eyeY: number;
  sideNarrow: number; sideEyeShift: number; sideLean: number;
  sideWaistFront: number; sideWaistBack: number;
  hairPuff: number;
  tailW: number; tailH: number; tailAngle: number; tailCurl: number; tailCurl2: number;
  twinW: number; twinH: number; twinAngle: number; twinCurl: number; twinCurl2: number;
  knotR: number;
  ponyRootPct: number; ponySideOffPct: number; ponyFrontPeekPct: number;
  twinSideOffMul: number; twinRootPct: number; twinOffPct: number;
  lgLen: number; lgHemDip: number; lgTopW: number; lgHemW: number; lgFaceW: number;
  lgLockMin: number; lgSideOpen: number; lgFringe: number; lgFringeDip: number;
  lgSideBack: number; lgSideFront: number;
  bunR: number; mohawkH: number;
  ahogeLen: number; ahogeW: number; ahogeAngle: number; ahogeCurl: number;
  scale: number; outline: number; shadow: number; shadowA: number;
}

export const PAWN_GEOM: PawnGeom = {
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
  hip: 7,         // 臀半寬 ┘
  bodyR: 7,       // 軀幹底角圓角

  eyeR: 13,       // 眼睛半徑（0.1 px）
  eyeGap: 50,     // 兩眼中心距（0.1 px）
  eyeY: 8,        // 眼睛相對頭心的垂直位置（0.1 px，正值往下）

  /* 側面專用：側身看到的是厚度不是寬度，而且只看得到一顆眼睛 */
  sideNarrow: 78,      // 軀幹收窄成正面的百分之幾
  sideEyeShift: 40,    // 那顆眼睛離頭心多遠（往面朝側，0.1 px）
  sideLean: 22,        // 側面前傾：肩線往面朝側平移多少（0.1 px，腳底不動）
  sideWaistFront: 122, // 側面的腰（胸腹側）佔正面腰寬的百分之幾 —— 往前鼓
  sideWaistBack: 64,   // 側面的腰（背側）佔正面腰寬的百分之幾 —— 往內收

  hairPuff: 12,   // 頭髮比頭大出多少（0.1 px，四周）

  /**
   * 馬尾／側馬尾：綁在腦後往下垂，中段微微鼓出去再收回來，尾端收尖。
   * 角度定義：0 = 垂直往下、90 = 水平、>90 = 往上翹。
   */
  tailW: 60,      // 寬度佔頭寬的百分之幾（太細會變成鐵絲，讀不出是頭髮）
  tailH: 96,      // 長度佔頭高的百分之幾（不能長到戳出腳底）
  tailAngle: 16,
  tailCurl: -34,  // 負值＝往外飄
  tailCurl2: 44,  // 第二段反向 → 尾端收回來，整條呈 S

  /**
   * 雙馬尾＝黏在頭「下側」的兩顆圓球（RimWorld 的 Pigtails），不是細長髮束。
   * 長度接近寬度才會是球狀；角度偏水平，球才會往正側方凸出去。
   */
  twinW: 62,
  twinH: 64,
  twinAngle: 42,  // 90 = 正側方；太接近 90 會變成水平方塊，像耳朵
  twinCurl: -24,
  twinCurl2: 0,

  knotR: 26,      // 髮髻半徑佔頭寬的百分之幾

  /**
   * 髮根高度（佔頭高的百分之幾，正值＝從頭心往下）。
   * 角色總高只有 37px，髮尾長度必須拿這個尺度來算，
   * 不能照參考圖的相對長度抄 —— 抄來的會蓋滿身體甚至戳出腳底。
   */
  ponyRootPct: -50,    // 髮髻要高到凸出髮際線，正面才有東西露得出來
  ponySideOffPct: 74,
  ponyFrontPeekPct: 0, // 0 = 正中央，與背面同一個位置
  twinSideOffMul: 96,
  twinRootPct: -16,
  twinOffPct: 30,

  /* 長髮（獨立部件，與預設髮際線無關） */
  lgLen: 118,
  lgHemDip: 26,      // 下襬中間往下垂多少（0.1 px）—— 0 會變成一條平的切口
  lgTopW: 106,
  lgHemW: 130,
  lgFaceW: 84,       // 臉部開口半寬 —— 決定兩側垂髮有多寬
  lgLockMin: 26,     // 垂髮最細也要留這麼寬（避免開口撐破外緣）
  lgSideOpen: 46,
  lgFringe: 38,
  lgFringeDip: 22,
  lgSideBack: 150,
  lgSideFront: 118,  // 太窄的話臉部開口會被夾掉，關不住臉的前緣

  bunR: 30,
  mohawkH: 46,
  ahogeLen: 92,
  ahogeW: 15,
  ahogeAngle: 176,   // 接近 180 = 從頭頂直直立起再拱開
  ahogeCurl: 96,

  scale: 100,     // 整體縮放百分比
  outline: 22,    // 描邊粗細（0.1 px）
  shadow: 12,     // 地面陰影水平半徑（垂直半徑為其一半，配合等距 2:1）
  shadowA: 30,    // 陰影不透明度百分比
};

/* ═══════════════════════════════════════════════════════════
   朝向
   ═══════════════════════════════════════════════════════════ */

export type PawnDirectionId = 'front' | 'right' | 'left' | 'back';

export interface PawnDirection {
  id: PawnDirectionId;
  label: string;
  view: 'front' | 'side' | 'back';
  /** 只對 side 有意義：+1 面向右、−1 面向左 */
  sign: number;
}

/**
 * 四張圖：正面／背面／左／右 —— 與 RimWorld 一樣，**換圖不是動畫**。
 *
 * 等距地圖上這四個世界方向在螢幕上是斜的，但那是投影的事，
 * 角色本身仍然只有這四種畫法：
 *   front 看得到臉、back 是空白後腦、side 是側身（窄身、頭與眼睛轉過去）。
 */
export const PAWN_DIRECTIONS: readonly PawnDirection[] = [
  { id: 'front', label: '正面', view: 'front', sign: 0 },
  { id: 'right', label: '右', view: 'side', sign: 1 },
  { id: 'left', label: '左', view: 'side', sign: -1 },
  { id: 'back', label: '背面', view: 'back', sign: 0 },
];

export const PAWN_DIRECTION_BY_ID: Record<PawnDirectionId, PawnDirection> =
  Object.fromEntries(PAWN_DIRECTIONS.map((d) => [d.id, d])) as Record<PawnDirectionId, PawnDirection>;
