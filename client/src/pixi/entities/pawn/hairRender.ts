/**
 * 逐髮型的**繪製設定** —— 髮型清單本身在 `models/appearance.ts`。
 *
 * `models/appearance.ts` 的東西會被存檔與匯出；這裡的曲線與座標只影響畫面。
 * 兩者以 `HairStyleId` 相接，測試會檢查每個髮型都有一組設定。
 */
import type { HairStyleId, HairTune } from '../../../models/appearance';
import { HAIR_STYLES } from '../../../models/appearance';

/**
 * 髮際線。**每個髮型都有自己完整的一組**，不共用全域值 ——
 * 共用時調 A 會動到 B，而各髮型的頭型本來就該各自訂。
 */
export interface CapCfg {
  /** 正面髮際線覆蓋頭高的百分之幾 */
  front: number;
  /** 背面覆蓋 */
  back: number;
  /** 側面面朝側收成正面的百分之幾 */
  sideFront: number;
  /** 側面髮際線平走到頭寬的百分之幾才往腦後掉 */
  sideHold: number;
  /** 弧形瀏海往下垂多少（0.1 px） */
  swoop: number;
  /** 兩側各垂一撮瀏海的長度（佔頭高百分之幾，0 = 沒有） */
  bangLen: number;
  /** 那一撮的寬度（佔頭寬百分之幾） */
  bangW: number;
  /** 中段整體抬起多少（0.1 px） */
  peak: number;
  /** 中間相對兩側：負＝「人」、0＝平、正＝「M」（0.1 px） */
  mDip: number;
}

/**
 * 髮際線是**一條連續路徑**，中段座標由 bangW / peak / mDip 一起算出來 ——
 * 少一個就是 NaN，整段 path 指令會被靜默丟掉而退回一條直線。
 * 缺值不報錯，只會表現成「滑桿在動、圖形不動」，所以這裡九項全都要有預設。
 */
const CAP_DEFAULT: CapCfg = {
  front: 44, back: 92, sideFront: 78, sideHold: 58, swoop: 26,
  bangLen: 0, bangW: 26, peak: 0, mDip: 0,
};

/** 髮尾的長寬與彎度：以下值是「相對全域參數的增減」 */
export interface TailCfg {
  /** 取哪一組全域髮束參數（tail / twin）；後馬尾與側馬尾都共用 twin */
  base: 'tail' | 'twin';
  wMul: number; lenMul: number;
  angAdd: number; curlAdd: number; curl2Add: number; rootAdd: number;
  /** taper 一路收細到尖點（馬尾、麻花辮）／puff 愈往下愈胖、尾端圓鈍（雙馬尾） */
  shape: 'taper' | 'puff';
}

const TAIL_DEFAULT: TailCfg = {
  base: 'twin',
  wMul: 1, lenMul: 1, angAdd: 0, curlAdd: 0, curl2Add: 0, rootAdd: 0, shape: 'taper',
};

export interface HairRender {
  /** 髮際線覆蓋倍率（0 = 光頭） */
  cap: number;
  /** 髮際線下緣：straight 平／swoop 弧形瀏海 */
  edge: 'straight' | 'swoop';
  /** 頂角壓方（平頭） */
  flat: boolean;
  /** 正面左右不等高（旁分） */
  part: boolean;
  /** 用獨立的長髮部件（自帶輪廓、垂髮與瀏海，不走預設髮際線） */
  longHair: boolean;
  tail: 'none' | 'pony' | 'side' | 'twin';
  /** 髮尾加上分節（麻花辮） */
  braid: boolean;
  /** 髮根加一顆髮髻，束起來的髮型必備 */
  knot: boolean;
  /** 髮束畫在頭與髮際線之上（貼著頭髮），而不是藏在頭後面 */
  overHead: boolean;
  top: 'none' | 'bun' | 'twinbun' | 'mohawk' | 'spike';
  capCfg: CapCfg;
  tailCfg: TailCfg;
}

const HAIR_DEFAULTS: Omit<HairRender, 'capCfg' | 'tailCfg'> = {
  cap: 1, edge: 'straight', flat: false, part: false, longHair: false,
  tail: 'none', braid: false, knot: false, overHead: false, top: 'none',
};

type HairRenderSpec = Partial<Omit<HairRender, 'capCfg' | 'tailCfg'>> & {
  capCfg?: Partial<CapCfg>;
  tailCfg?: Partial<TailCfg>;
};

const SPECS: Record<HairStyleId, HairRenderSpec> = {
  bald: { cap: 0, capCfg: { front: 0, back: 0 } },
  buzz: { cap: 0.58, flat: true, capCfg: { front: 26, back: 53 } },
  part: { cap: 0.95, edge: 'swoop', part: true, capCfg: { front: 42, back: 87 } },
  /* 長髮不另外加兩側瀏海 —— 髮量本身就框住臉了，
     兩者疊在一起只會多出一圈描邊，在頭側留下黑線 */
  long: { cap: 1, longHair: true, capCfg: { front: 44, back: 92 } },
  pony: {
    cap: 1, tail: 'pony', knot: true, overHead: true,
    capCfg: { front: 33, back: 92, bangLen: 25, peak: 30, mDip: -16 },
    tailCfg: { wMul: 0.70, lenMul: 1.62, angAdd: -26, curlAdd: 26 },
  },
  /* 側馬尾就是長雙馬尾的一半 —— 共用同一組髮尾設定，只是單邊、不加髮髻 */
  sidepony: {
    cap: 1, tail: 'side',
    capCfg: { front: 33, back: 92, bangLen: 25, peak: 28, mDip: -14 },
    tailCfg: { wMul: 0.68, lenMul: 1.62, curlAdd: 64, rootAdd: -8 },
  },
  twin: {
    cap: 1, tail: 'twin', top: 'spike',
    capCfg: { front: 33, back: 92, bangLen: 27, peak: 34, mDip: 14 },
    tailCfg: { shape: 'puff' },
  },
  twinlong: {
    cap: 1, tail: 'twin', top: 'spike',
    capCfg: { front: 33, back: 92, bangLen: 26, peak: 30, mDip: 12 },
    tailCfg: { wMul: 0.68, lenMul: 1.62, curlAdd: 64, rootAdd: -8 },
  },
  braid: {
    cap: 1, tail: 'twin', top: 'spike', braid: true,
    capCfg: { front: 33, back: 92, bangLen: 25, peak: 28, mDip: 12 },
    tailCfg: { wMul: 0.76, lenMul: 1.58, curlAdd: 60, rootAdd: -8 },
  },
  bun: { cap: 1, top: 'bun', capCfg: { front: 44, back: 92 } },
  twinbun: { cap: 1, top: 'twinbun', capCfg: { front: 33, back: 92, bangLen: 23 } },
  mohawk: { cap: 0.5, top: 'mohawk', capCfg: { front: 22, back: 46 } },
  spike: { cap: 0.92, top: 'spike', capCfg: { front: 40, back: 85 } },
};

export const HAIR_RENDER: Record<HairStyleId, HairRender> = Object.fromEntries(
  HAIR_STYLES.map((h) => {
    const spec = SPECS[h.id];
    return [h.id, {
      ...HAIR_DEFAULTS,
      ...spec,
      capCfg: { ...CAP_DEFAULT, ...spec.capCfg },
      tailCfg: { ...TAIL_DEFAULT, ...spec.tailCfg },
    }];
  }),
) as Record<HairStyleId, HairRender>;

/**
 * 把角色存的微調值疊到該髮型的基準上。
 *
 * **不可直接改 `HAIR_RENDER[id].capCfg`** —— 那是全域共用的物件，
 * 改它等於改掉所有用這個髮型的角色，而且貼圖快取還會沿用舊的。
 */
export function resolveCapCfg(hair: HairStyleId, tune: HairTune | undefined): CapCfg {
  return tune ? { ...HAIR_RENDER[hair].capCfg, ...tune } : HAIR_RENDER[hair].capCfg;
}
