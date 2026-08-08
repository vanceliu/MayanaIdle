/**
 * 武器剪影的參數 —— **攻擊時才顯示，平常不畫**。
 *
 * 這裡的數字只影響畫面，不進存檔（與 `geometry.ts` 同一個原則）。
 *
 * ── 為什麼是「按類型」而不是「按每一把」 ──
 * 武器有 189 把（`06-equipment-weapons.md`），一把一個造型是另一個量級的工作，
 * 而且在 20px 的剪影下也分不出來。所以造型只認**武器類型**（10 種），
 * 個體差異交給材質色（`WEAPON_MATERIAL_COLOR`）。
 *
 * ── 為什麼平常不顯示 ──
 * 角色是無腳剪影、沒有手臂（`04-character.md` § 4.10），
 * 常駐的武器等於一根黏在身上的棒子；只在出手那 0.3 秒出現，
 * 讀起來就是「揮出去」而不是「掛著」。
 */
import type { WeaponMaterial, WeaponType } from '../../../models/equipment';
import { OUTLINE_COLOR, type PawnDirectionId } from './geometry';

/** 與角色共用同一個壓深描邊色 —— 兩套描邊會讓武器像貼上去的 */
export const WEAPON_OUTLINE_COLOR = OUTLINE_COLOR;

/** 握把／木柄。材質色只吃金屬部位，柄一律是這個色 */
export const WEAPON_HANDLE_COLOR = '#6b4a33';

/** 弓的中段握把（皮革包覆），與木質弓臂分色才看得出握在哪 */
export const WEAPON_GRIP_COLOR = '#5d5d68';

/** 握把上下兩道綁帶 */
export const WEAPON_WRAP_COLOR = '#e8e4dc';

/** 弓弦 —— 深色地形上要看得見，所以是淺色而不是描邊色 */
export const WEAPON_STRING_COLOR = '#c3c7d1';

/**
 * 材質色（`WeaponMaterial`）。同類型武器換材質看得出差別，
 * 靠的就是這一張表 —— 造型本身不隨階級改變。
 */
export const WEAPON_MATERIAL_COLOR: Record<WeaponMaterial, string> = {
  wood: '#a3763f',
  iron: '#b9bdc7',
  silver: '#dde3ee',
  mithril: '#9fd7e8',
  dragon: '#d76b5a',
  orichalcum: '#e8c15a',
};

/** 沒有材質欄位的武器（舊資料或非金屬類）退回鐵色 */
export const WEAPON_METAL_DEFAULT = WEAPON_MATERIAL_COLOR.iron;

export interface WeaponColors {
  /** 材質色。吃在刀身、斧刃、槌頭、寶珠、弓臂、爪上 */
  metal: string;
  /** 握把、木柄、杖身、箭桿 */
  handle: string;
  /** 弓的中段握把 */
  grip: string;
  /** 弓的綁帶 */
  wrap: string;
  /** 弓弦 */
  string: string;
}

/**
 * 依材質組出一套配色。**只有材質色是變的**，握把與綁帶固定 ——
 * 整把一起換色會讓木弓與秘銀弓只剩色相差異，看不出哪裡是握把。
 */
export function weaponColors(material?: WeaponMaterial | null): WeaponColors {
  return {
    metal: material ? WEAPON_MATERIAL_COLOR[material] : WEAPON_METAL_DEFAULT,
    handle: WEAPON_HANDLE_COLOR,
    grip: WEAPON_GRIP_COLOR,
    wrap: WEAPON_WRAP_COLOR,
    string: WEAPON_STRING_COLOR,
  };
}

/* ═══════════════════════════════════════════════════════════
   形狀參數
   ═══════════════════════════════════════════════════════════ */

/**
 * 六種畫法涵蓋十種武器。單手／雙手的差別**只是數字**，不是另一套畫法 ——
 * 各寫一套的話，調刀身弧度要改兩個地方。
 */
export type WeaponShape = 'blade' | 'axe' | 'mace' | 'staff' | 'bow' | 'claw';

/** 劍：刀身 + 護手 + 握把 + 圓頭。單手劍／雙手劍／雙刀共用 */
export interface BladeParams {
  shape: 'blade';
  bladeLen: number;
  bladeW: number;
  /** 尖端收尖那一段的長度（含在 bladeLen 內） */
  tipLen: number;
  guardW: number;
  guardH: number;
  gripLen: number;
  gripW: number;
  pommelR: number;
}

/** 斧：直柄 + 頂端斧刃。`double` = 雙刃（兩側各一片） */
export interface AxeParams {
  shape: 'axe';
  shaftLen: number;
  shaftW: number;
  headLen: number;
  headW: number;
  /** 斧刃上緣離柄頂多遠 */
  headDrop: number;
  /** 0 = 單刃、1 = 雙刃（用數字而不是 boolean，滑桿與匯出 JSON 才是同一種東西） */
  double: number;
}

/** 鈍器：柄 + 帶尖刺的球 */
export interface MaceParams {
  shape: 'mace';
  shaftLen: number;
  shaftW: number;
  headR: number;
  spikeLen: number;
  spikes: number;
}

/** 法杖：木杖身 + 頸環 + 頂端寶珠 */
export interface StaffParams {
  shape: 'staff';
  shaftLen: number;
  shaftW: number;
  gemR: number;
  collarW: number;
}

/**
 * 弓：上下兩支弓臂 + 弦。握點在弓的**正中央**，所以形狀往上下兩邊都長 ——
 * 其他武器都是從握點往上長，只有弓例外。
 */
export interface BowParams {
  shape: 'bow';
  /** 單邊弓臂長（上下各一） */
  limbLen: number;
  /** 弓背往面朝方向鼓出多少 */
  bendW: number;
  thickness: number;
  /** 滿弦時弦中點往後拉多遠 */
  pullMax: number;
  /** 中段握把的長度（沿弓身）；0 = 不畫握把 */
  riserLen: number;
  /** 握把上下兩道綁帶的厚度 */
  wrapH: number;
  /** 搭在弦上的箭長度；0 = 不畫箭 */
  arrowLen: number;
}

/** 鋼爪：手背護甲 + 數根彎爪 */
export interface ClawParams {
  shape: 'claw';
  backW: number;
  backH: number;
  clawLen: number;
  clawW: number;
  /** 爪根之間攤開的總寬 */
  clawSpread: number;
  /** 爪尖往面朝方向彎多少 */
  clawCurve: number;
  claws: number;
}

export type WeaponParams =
  | BladeParams | AxeParams | MaceParams | StaffParams | BowParams | ClawParams;

/* ═══════════════════════════════════════════════════════════
   動作
   ═══════════════════════════════════════════════════════════ */

/**
 * 四種動作。分類依「武器怎麼用」，不是依單手雙手 ——
 * 雙手劍與單手劍都是橫揮，差別在幅度與時間，那是數字不是動作。
 */
export type WeaponMotion = 'swing' | 'dual' | 'thrust' | 'bow';

/**
 * 武器的八個揮擊方向（**以螢幕為準**，不是世界座標軸）。
 *
 * 角色只有四張圖（`04-character.md` § 4.10：每個朝向一張烘好的貼圖，
 * 加到八個就是 13 髮型 × 8 = 104 張）。**武器沒有這個限制** ——
 * 它是同一個形狀被旋轉，多四個斜角只是多四列設定，零新美術。
 *
 * 而且八個方向是必要的：尋路是八方向的（`systems/pathfinding.ts` 的鄰居含四個斜角），
 * 只有四個揮擊方向的話，往右下的怪出手時武器會揮向正下方。
 */
export type WeaponAimId =
  | 'down' | 'downRight' | 'right' | 'upRight'
  | 'up' | 'upLeft' | 'left' | 'downLeft';

export const WEAPON_AIM_IDS: readonly WeaponAimId[] = [
  'down', 'downRight', 'right', 'upRight', 'up', 'upLeft', 'left', 'downLeft',
];

/**
 * 每個方向把武器**轉到哪一格**。
 *
 * 這裡只有「方向」，**沒有揮法** —— 揮法（弧線從哪掃到哪、多快、甩多遠）
 * 是每把武器自己的事，寫在 `WeaponArt.motion`。
 * 把揮法放進來就會變成十把武器共用一條基底弧，那正是要避免的。
 *
 * 角度以螢幕為準：0 = 上、90 = 右、180 = 下、−90 = 左。
 */
export interface WeaponFacingAxis {
  /** 面朝方向的螢幕角度。武器的弧線以它為中心 */
  aim: number;
  /**
   * 弧線的旋轉正負。決定「從哪一側舉起來」。
   *
   * 螢幕右半邊順時針（上 → 外側 → 下）、左半邊逆時針，兩邊互為鏡射；
   * 正上與正下是橫掃，走同一個正負。
   */
  spin: 1 | -1;
  /**
   * 握點偏向身體的哪一側：+1 = 螢幕右、−1 = 螢幕左、**0 = 不偏，走身體中線**。
   *
   * 揮舞半徑已經把武器帶往面朝方向了，這個側偏只是再讓弧線歪一點。
   * **正上與正下都設 0**：那兩個方向的目標格就在角色正上／正下方，
   * 弧線該對稱地掃過去，偏一側只會看起來像揮歪了。
   *
   * 也決定法杖往哪一側傾斜（`weaponPose` 的 thrust 分支）。
   */
  side: number;
  /**
   * 武器畫在角色**之下**還是之上。
   *
   * 往螢幕上方的三個方向，攻擊的那一格在更遠處 —— 武器在深度上就是在角色後面，
   * 畫在上層會整支蓋過頭。往下的那幾格比角色近，畫在上層才對。
   */
  behind: boolean;
}

export const WEAPON_FACING_AXIS: Record<WeaponAimId, WeaponFacingAxis> = {
  /* 正下：左 → 下 → 右（橫掃） */
  down: { aim: 180, spin: 1, side: 0, behind: false },
  /* 右下：上 → 外 → 下 */
  downRight: { aim: 135, spin: -1, side: 1, behind: false },
  right: { aim: 90, spin: -1, side: 1, behind: false },
  upRight: { aim: 45, spin: -1, side: 1, behind: true },
  /* 正上：右 → 上 → 左（正下的鏡射） */
  up: { aim: 0, spin: 1, side: 0, behind: true },
  upLeft: { aim: -45, spin: 1, side: -1, behind: true },
  left: { aim: -90, spin: 1, side: -1, behind: false },
  downLeft: { aim: -135, spin: 1, side: -1, behind: false },
};

/**
 * 位移 → 揮擊方向。判斷用的是**螢幕上的方向**，與角色朝向同一套換算
 * （`facing.ts`：螢幕往下 = x+y 變大、螢幕往右 = x−y 變大）。
 */
export function weaponAimFromDelta(dx: number, dy: number): WeaponAimId | null {
  const down = dx + dy;
  const right = dx - dy;
  if (Math.abs(down) < 1e-4 && Math.abs(right) < 1e-4) return null;
  /* 八等分：每格 45 度，從正下方（螢幕角度 180）起算 */
  const deg = (Math.atan2(right, down) * 180) / Math.PI;
  const idx = ((Math.round(deg / 45) % 8) + 8) % 8;
  return WEAPON_AIM_IDS[idx];
}

/**
 * 這個揮擊方向配哪一張角色圖。角色只有四張，八個方向要合併回去 ——
 * 合併規則與 `facing.ts` 的 `facingFromDelta()` 一致（斜角時倒向上下），
 * 兩邊分岔的話會出現「角色面向右、武器往右下揮」對不起來的情況。
 */
export function pawnFacingForAim(aimId: WeaponAimId): PawnDirectionId {
  switch (aimId) {
    case 'right': return 'right';
    case 'left': return 'left';
    case 'up': case 'upRight': case 'upLeft': return 'back';
    default: return 'front';
  }
}

/** 面朝方向的螢幕單位向量（y 軸向下） */
export function aimVector(aim: number): { x: number; y: number } {
  const r = (aim * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

export interface WeaponMotionCfg {
  motion: WeaponMotion;
  /** 一次演出多久。必須遠短於攻擊間隔，否則會疊在一起 */
  durationMs: number;
  /**
   * 這把武器的揮擊弧線，**相對面朝方向**的起訖角度（度）。
   * 0 = 指向面朝方向，正值 = 往一側舉起、負值 = 掃過頭到另一側。
   *
   * 每把武器自己一組，不是共用一條基底弧再縮放 ——
   * 大劍的大開大闔與雙刀的短促斜劃本來就不是同一條弧。
   *
   * 揮到**哪個方向**不寫在這裡：那是朝向的事（`WEAPON_FACING_AXIS.aim`）。
   */
  arcFrom: number;
  arcTo: number;
  /** 出現時停在弧線起點之前多少（0~1 的比例）。這一小段回拉就是預備動作 */
  pre: number;
  /** 揮過終點多少（0~1 的比例）。收招的餘勢 */
  over: number;
  /** 杖與弓的握持傾斜（度）。揮擊用不到 —— 它的角度由弧線決定 */
  tilt: number;
  /** 揮到底時再往面朝方向多壓幾 px。揮擊中心已經在那一格了，這只是額外一點前壓 */
  reach: number;
  /**
   * 揮舞半徑的倍率（0~1，見 `WeaponGeom.swingH` / `swingV`）。
   *
   * 只有揮擊會把手甩出去。弓是**端在身前**的，甩出去就變成浮在旁邊的一把弓；
   * 法杖只往前送一點。
   */
  swingMul: number;
  /** 三個時間點（0~1）：舉到頂、揮到底、開始淡出 */
  tWindup: number;
  tStrike: number;
  tRecover: number;
  /** 前推距離 px（thrust 用）；弓則是放箭後座的距離 */
  push: number;
  /** 第二把慢多久出手（0~1，dual 用）。0 = 兩把同時，看起來像一把 */
  handDelay: number;
}

/* ═══════════════════════════════════════════════════════════
   武器類型 → 造型
   ═══════════════════════════════════════════════════════════ */

/**
 * 有剪影的武器類型。**副手（盾牌／魔導書／臂甲）不在內** ——
 * 那三種是常駐持有物，不是攻擊動作的一部分，語意與本檔案相反。
 */
export const PAWN_WEAPON_TYPES = [
  'sword', 'axe', 'mace', 'staff', 'bow',
  'twoHandSword', 'twoHandAxe', 'twoHandStaff', 'dualBlade', 'claw',
] as const satisfies readonly WeaponType[];

export type PawnWeaponType = (typeof PAWN_WEAPON_TYPES)[number];

export function isPawnWeaponType(type: string | undefined | null): type is PawnWeaponType {
  return !!type && (PAWN_WEAPON_TYPES as readonly string[]).includes(type);
}

/**
 * 一把武器的完整設計。**每一把都是獨立的一整組數字**，不從共用基底衍生 ——
 * 共用基底的話，調「雙手劍揮慢一點」會動到所有揮擊類武器，
 * 而每把武器的手感本來就該各自訂。
 */
export interface WeaponArt {
  label: string;
  /** 幾把。2 = 雙持，兩隻手各畫一把（雙刀、鋼爪） */
  hands: 1 | 2;
  /** 形狀 */
  params: WeaponParams;
  /** 握點、揮舞半徑、描邊、縮放 */
  geom: WeaponGeom;
  /** 揮法 */
  motion: WeaponMotionCfg;
}

export const WEAPON_ART: Record<PawnWeaponType, WeaponArt> = {
  sword: {
    label: '單手劍',
    hands: 1,
    params: {
      shape: 'blade',
      bladeLen: 19, bladeW: 3.8, tipLen: 5,
      guardW: 8, guardH: 1.6,
      gripLen: 5, gripW: 1.8, pommelR: 1.3,
    },
    geom: {
      gripX: 8, gripY: 11, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 17, swingUp: 13, swingDown: 13,
      faceSide: 0,
      outline: 13, scale: 100,
    },
    motion: {
      motion: 'swing', durationMs: 340,
      arcFrom: 42, arcTo: -42, pre: 0.12, over: 0.10, tilt: 0, reach: 4, swingMul: 1,
      tWindup: 0.30, tStrike: 0.48, tRecover: 0.74,
      push: 0, handDelay: 0,
    },
  },

  twoHandSword: {
    label: '雙手劍',
    hands: 1,
    params: {
      shape: 'blade',
      bladeLen: 29, bladeW: 5.4, tipLen: 7,
      guardW: 12, guardH: 2,
      gripLen: 8, gripW: 2.2, pommelR: 1.7,
    },
    geom: {
      gripX: 8, gripY: 12, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 20, swingUp: 15, swingDown: 15,
      faceSide: 0,
      outline: 14, scale: 100,
    },
    /* 大開大闔：弧線最寬、時間最長，重量感全在這兩者 */
    motion: {
      motion: 'swing', durationMs: 440,
      arcFrom: 50, arcTo: -50, pre: 0.12, over: 0.10, tilt: 0, reach: 6, swingMul: 1,
      tWindup: 0.34, tStrike: 0.54, tRecover: 0.74,
      push: 0, handDelay: 0,
    },
  },

  dualBlade: {
    label: '雙刀',
    hands: 2,
    params: {
      shape: 'blade',
      bladeLen: 15, bladeW: 3.2, tipLen: 4.5,
      guardW: 5, guardH: 1.2,
      gripLen: 4, gripW: 1.6, pommelR: 1.1,
    },
    geom: {
      gripX: 8, gripY: 11, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 15, swingUp: 12, swingDown: 12,
      faceSide: 0,
      outline: 12, scale: 100,
    },
    /* 短促斜劃，兩把錯開 —— 一次打兩下（`21-combat-formula.md` § 21.4） */
    motion: {
      motion: 'dual', durationMs: 320,
      arcFrom: 35, arcTo: -35, pre: 0.10, over: 0.08, tilt: 0, reach: 3, swingMul: 1,
      tWindup: 0.26, tStrike: 0.44, tRecover: 0.70,
      push: 0, handDelay: 0.22,
    },
  },

  axe: {
    label: '單手斧',
    hands: 1,
    params: {
      shape: 'axe',
      shaftLen: 19, shaftW: 2.6,
      headLen: 8.5, headW: 7, headDrop: 1.2, double: 0,
    },
    geom: {
      gripX: 8, gripY: 11, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 18, swingUp: 14, swingDown: 14,
      faceSide: 0,
      outline: 13, scale: 100,
    },
    motion: {
      motion: 'swing', durationMs: 360,
      arcFrom: 44, arcTo: -44, pre: 0.12, over: 0.10, tilt: 0, reach: 5, swingMul: 1,
      tWindup: 0.30, tStrike: 0.48, tRecover: 0.74,
      push: 0, handDelay: 0,
    },
  },

  twoHandAxe: {
    label: '雙手斧',
    hands: 1,
    params: {
      shape: 'axe',
      shaftLen: 29, shaftW: 3.2,
      headLen: 12, headW: 9.5, headDrop: 1.6, double: 1,
    },
    geom: {
      gripX: 8, gripY: 12, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 21, swingUp: 16, swingDown: 16,
      faceSide: 0,
      outline: 14, scale: 100,
    },
    motion: {
      motion: 'swing', durationMs: 460,
      arcFrom: 51, arcTo: -51, pre: 0.12, over: 0.10, tilt: 0, reach: 6, swingMul: 1,
      tWindup: 0.34, tStrike: 0.55, tRecover: 0.74,
      push: 0, handDelay: 0,
    },
  },

  mace: {
    label: '單手鈍器',
    hands: 1,
    params: {
      shape: 'mace',
      shaftLen: 19, shaftW: 2.6,
      headR: 4.2, spikeLen: 1.1, spikes: 8,
    },
    geom: {
      gripX: 8, gripY: 11, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 18, swingUp: 14, swingDown: 14,
      faceSide: 0,
      outline: 13, scale: 100,
    },
    motion: {
      motion: 'swing', durationMs: 380,
      arcFrom: 44, arcTo: -44, pre: 0.12, over: 0.10, tilt: 0, reach: 5, swingMul: 1,
      tWindup: 0.30, tStrike: 0.48, tRecover: 0.74,
      push: 0, handDelay: 0,
    },
  },

  staff: {
    label: '法杖',
    hands: 1,
    params: { shape: 'staff', shaftLen: 23, shaftW: 2.6, gemR: 3.2, collarW: 4 },
    geom: {
      gripX: 8, gripY: 12, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 8, swingUp: 3, swingDown: 3,
      faceSide: 1,
      outline: 13, scale: 100,
    },
    /* 杖保持直立往前送，不走弧線 —— arcFrom / arcTo / pre / over 對它沒有作用 */
    motion: {
      motion: 'thrust', durationMs: 380,
      arcFrom: 0, arcTo: 0, pre: 0, over: 0, tilt: 14, reach: 0, swingMul: 1,
      tWindup: 0.34, tStrike: 0.52, tRecover: 0.76,
      push: 6, handDelay: 0,
    },
  },

  twoHandStaff: {
    label: '雙手法杖',
    hands: 1,
    params: { shape: 'staff', shaftLen: 32, shaftW: 3.2, gemR: 4.2, collarW: 5 },
    geom: {
      gripX: 8, gripY: 13, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 8, swingUp: 3, swingDown: 3,
      faceSide: 1,
      outline: 14, scale: 100,
    },
    motion: {
      motion: 'thrust', durationMs: 440,
      arcFrom: 0, arcTo: 0, pre: 0, over: 0, tilt: 16, reach: 0, swingMul: 1,
      tWindup: 0.34, tStrike: 0.52, tRecover: 0.76,
      push: 7, handDelay: 0,
    },
  },

  bow: {
    label: '弓',
    hands: 1,
    params: {
      shape: 'bow',
      limbLen: 13.5, bendW: 6.2, thickness: 4, pullMax: 6.5,
      riserLen: 7.5, wrapH: 1.4, arrowLen: 17,
    },
    geom: {
      gripX: 7, gripY: 12, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 22, swingUp: 32, swingDown: 18,
      faceSide: 0,
      outline: 13, scale: 100,
    },
    /* 弓端在身前不甩（swingMul 0），動的只有弦與放箭後座 */
    motion: {
      motion: 'bow', durationMs: 420,
      arcFrom: 0, arcTo: 0, pre: 0, over: 0, tilt: 6, reach: 0, swingMul: 1,
      tWindup: 0.38, tStrike: 0.56, tRecover: 0.74,
      push: 3, handDelay: 0,
    },
  },

  claw: {
    label: '鋼爪',
    hands: 2,
    params: {
      shape: 'claw',
      backW: 5, backH: 5,
      clawLen: 7, clawW: 2.1, clawSpread: 4.8, clawCurve: 2.4, claws: 3,
    },
    geom: {
      gripX: 8, gripY: 11, sideGripMul: 70,
      offhandSideMul: 34, offhandRaise: 25,
      swingH: 22, swingUp: 30, swingDown: 18,
      faceSide: 0,
      outline: 12, scale: 100,
    },
    /* 最短最快的抓劃，弧線也最窄 */
    motion: {
      motion: 'dual', durationMs: 280,
      arcFrom: 29, arcTo: -29, pre: 0.10, over: 0.08, tilt: 0, reach: 3, swingMul: 1,
      tWindup: 0.26, tStrike: 0.44, tRecover: 0.70,
      push: 0, handDelay: 0.18,
    },
  },
};

/* ═══════════════════════════════════════════════════════════
   握點與揮舞半徑（**每把武器一份**）
   ═══════════════════════════════════════════════════════════ */

export interface WeaponGeom {
  /** 握點離身體中線多遠（px） */
  gripX: number;
  /** 握點離地多高（px，正值＝往上）。軀幹高 20，所以這個值落在腰胸之間 */
  gripY: number;
  /** 側面時握點收窄成正面的百分之幾 —— 側身看到的身體本來就窄一圈 */
  sideGripMul: number;
  /** 雙持的第二把在側面時的握點（佔第一把的百分之幾）。側面兩把都在同一側 */
  offhandSideMul: number;
  /** 雙持的第二把抬高多少（0.1 px），避免兩把完全重疊 */
  offhandRaise: number;
  /**
   * **手揮舞的半徑**（螢幕 px）—— 左右與上下各一個。
   *
   * 弧心在身上（肩的位置），手沿著這個半徑的圓弧甩出去、掃過隔壁那格、再收回來。
   * 半徑固定在原地只轉武器的話，那是風車不是揮舞 ——
   * 讀得出「揮」的關鍵是**手自己也在跑弧線**。
   *
   * 三個數字都不能共用：
   * - 左右／上下：等距地磚左右差 `TILE_W`（64）、上下差 `TILE_H`（32）
   * - 往上／往下：**角色上下不對稱**。背面（往上）要越過整顆頭才看得見，
   *   正面（往下）只要離開軀幹就夠；而背面的武器是畫在角色**之下**的，
   *   卡在頭上就等於直接消失
   */
  swingH: number;
  swingUp: number;
  swingDown: number;
  /**
   * **正面／背面**時握點偏向哪一側：+1 = 螢幕右、−1 = 螢幕左、0 = 中線。
   *
   * 側面不吃這個 —— 側身時手在哪一側是朝向決定的（`WeaponFacingAxis.side`）。
   * 揮擊類設 0：弧線要對稱地掃過那一格，偏一側會看起來像揮歪了。
   * 不揮的（法杖、弓）設 0 會直接立在身體正中間，所以要偏一側。
   */
  faceSide: number;
  /** 描邊粗細（0.1 px）。細長的爪撐不住粗描邊，厚重的斧則需要 */
  outline: number;
  /** 整體縮放百分比 */
  scale: number;
}


/**
 * 握點偏向哪一側。側面由朝向決定（手在身體的面朝側），
 * 正面／背面由武器自己決定（`WeaponGeom.faceSide`）——
 * 那兩個朝向看不出是哪一隻手，該偏哪邊是造型問題不是朝向問題。
 */
export function weaponSideSign(g: WeaponGeom, aimId: WeaponAimId): number {
  const axis = WEAPON_FACING_AXIS[aimId];
  /* 正上與正下看不出是哪一隻手，交給武器自己決定 */
  return axis.side === 0 ? g.faceSide : axis.side;
}

/**
 * 這個方向要用多大的揮舞半徑。
 *
 * 三個半徑（左右／往上／往下）當成一個**橢圓的半軸**，斜角取橢圓上的那一點 ——
 * 八個方向就會平滑過渡。二選一的話，右與右下會突然差一截。
 *
 * 為什麼上下要分開：角色上下不對稱。往上要越過整顆頭才看得見，
 * 往下只要離開軀幹；而往上的武器是畫在角色**之下**的，卡在頭上就等於消失。
 */
export function weaponHold(g: WeaponGeom, aimId: WeaponAimId): number {
  const v = aimVector(WEAPON_FACING_AXIS[aimId].aim);
  const h = Math.max(0.001, g.swingH);
  const vert = Math.max(0.001, v.y < 0 ? g.swingUp : g.swingDown);
  return 1 / Math.hypot(v.x / h, v.y / vert);
}

export interface WeaponGrip {
  /** 相對所站地磚中心的偏移 */
  x: number;
  y: number;
}

/**
 * 某個朝向、某隻手的握點。
 *
 * 這是**弧心**（肩的位置），不是武器所在的位置 ——
 * 手在揮舞過程中會沿著半徑 `swingH` / `swingV` 的圓弧離開這裡。
 *
 * 側邊由 `WEAPON_FACING_AXIS.side` 決定：
 * 面向鏡頭時在畫面右、背對時在畫面左（同一隻手繞到另一邊去了）。
 *
 * 側面兩隻手都在同一側（另一隻被身體擋住），所以第二把只往內縮、往上抬，
 * 不跑到另一邊 —— 跑過去會變成「一把在胸前一把在背後」。
 *
 * **不做鏡射。** 四個朝向全部靠旋轉到位，鏡射會把單刃斧、弓這類
 * 有正反面的形狀翻過來，跟旋轉的結果對不起來。
 */
export function weaponGrip(g: WeaponGeom, aimId: WeaponAimId, hand: 0 | 1 = 0): WeaponGrip {
  const s = g.scale / 100;
  const sideSign = weaponSideSign(g, aimId);
  /* 側身時身體窄一圈，握點跟著收窄 —— 只有左右兩個方向是真的側身 */
  const isSide = aimId === 'left' || aimId === 'right';
  const baseX = g.gripX * s * (isSide ? g.sideGripMul / 100 : 1);
  const baseY = -g.gripY * s;

  if (hand === 0) return { x: sideSign * baseX, y: baseY };

  if (isSide) {
    return {
      x: sideSign * baseX * (g.offhandSideMul / 100),
      y: baseY - (g.offhandRaise / 10) * s,
    };
  }
  return { x: -sideSign * baseX, y: baseY };
}

/* ═══════════════════════════════════════════════════════════
   時間軸
   ═══════════════════════════════════════════════════════════ */

export interface WeaponPose {
  /** 旋轉角（**螢幕**度）。0 = 指向正上方、90 = 右、180 = 下、−90 = 左 */
  angle: number;
  /**
   * 弧線前進的那一側（武器自身座標，+1 = 右）。
   *
   * 不對稱的形狀要靠它決定刃口朝哪 —— 單刃斧的刃、鋼爪的彎曲。
   * **四個朝向的旋轉方向不同**（只有「右」是順時針），
   * 刃口寫死一側的話，有三個朝向會變成拿刀背在砍。
   */
  lead: 1 | -1;
  /** 握點的位移（螢幕 px，已含方向）—— 前伸／前推／後座都落在這裡 */
  offX: number;
  offY: number;
  alpha: number;
  /** 弓的拉弦量 0~1。其他武器恆為 0 */
  pull: number;
  /** 這一把在這個時間點畫不畫 */
  visible: boolean;
}

const HIDDEN: WeaponPose = { angle: 0, lead: 1, offX: 0, offY: 0, alpha: 0, pull: 0, visible: false };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (t: number, a: number, b: number) => (b <= a ? 1 : clamp01((t - a) / (b - a)));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const easeIn = (u: number) => u * u;

/** 出現與消失都不能是硬切 —— 硬切在 60fps 下讀起來是閃一下 */
const FADE_IN = 0.06;
/** 放弦到弦回位的時間 */
const RELEASE = 0.06;

/**
 * 整段演出的長度（以 `durationMs` 為 1 的比例）。
 * 雙持的第二把慢出手，所以總長超過 1。
 */
export function weaponTotalT(cfg: WeaponMotionCfg): number {
  return 1 + (cfg.motion === 'dual' ? cfg.handDelay : 0);
}

/**
 * 演出最多佔攻擊間隔的幾成。
 *
 * 留兩成空檔是必要的：接連兩次出手之間要看得到「收完了」，
 * 塞滿的話兩次揮擊頭尾相接，讀起來是一次連續的攪動而不是兩下。
 */
export const WEAPON_PLAYBACK_FILL = 0.8;

/**
 * 這次出手實際要用的演出長度（ms）。
 *
 * **`durationMs` 是「常速手感」，不是播放時長。** 攻速可以把攻擊間隔堆到
 * `MIN_ATTACK_INTERVAL_MS`（300ms，見 `systems/combat.ts`），而十把武器的
 * 設計時長都比它長 —— 照設計時長直接播，攻速一高就會「上一刀還沒收完，
 * 下一刀已經出手」。
 *
 * 所以攻速高時整段等比壓縮，攻速一般時維持設計時長：
 * 雙手斧的沉重與鋼爪的輕快在常速下看得出來，堆滿攻速時一起變快。
 *
 * 雙持要連第二把的延遲一起算（`weaponTotalT`），只看 `durationMs` 會漏掉那一段。
 */
export function weaponPlaybackMs(cfg: WeaponMotionCfg, attackIntervalMs: number): number {
  const budget = (attackIntervalMs * WEAPON_PLAYBACK_FILL) / weaponTotalT(cfg);
  return Math.min(cfg.durationMs, budget);
}

/**
 * 某隻手在時間 t 的姿勢。t 以 `durationMs` 為 1，範圍 0 ~ `weaponTotalT()`。
 *
 * ── 揮舞是「手跑一條弧線」，不是「武器繞固定圓心轉」 ──
 * 弧心在肩（`weaponGrip()` 回傳的點），手沿半徑 `swingH` / `swingV` 的圓弧
 * 甩過該朝向的弧線（`WEAPON_FACING_AXIS.from` → `to`），武器順著半徑指出去。
 * 手不動只轉武器的話，看起來是風車在原地轉，讀不出揮擊。
 *
 * 四個朝向都是同一種橫掃，只差掃在哪一格、從哪一側起手。
 *
 * 第二把是**同一條時間軸往後挪、弧線頭尾對調**：
 * 錯開才數得出兩下，反向才交叉成 X。
 */
export function weaponPose(
  cfg: WeaponMotionCfg,
  g: WeaponGeom,
  t: number,
  hand: 0 | 1 = 0,
  aimId: WeaponAimId = 'right',
): WeaponPose {
  const tt = hand === 1 && cfg.motion === 'dual' ? t - cfg.handDelay : t;
  if (tt < 0 || tt > 1) return HIDDEN;

  const axis = WEAPON_FACING_AXIS[aimId];
  const aim = aimVector(axis.aim);
  const { tWindup, tStrike, tRecover } = cfg;

  const alpha = Math.min(1, tt / FADE_IN) * (tt <= tRecover ? 1 : 1 - seg(tt, tRecover, 1));

  if (cfg.motion === 'bow') {
    /**
     * 整把轉到弓背朝面朝方向。弓的射擊軸是形狀的 **+x**（不是頂端），
     * 所以要比 aim 再退 90 度 —— 這是弓與其他武器唯一的差別。
     * 轉到位之後就定住，動的只有弦與放箭後座。
     */
    const pull =
      tt < tWindup ? easeOut(seg(tt, 0, tWindup))
      : tt < tStrike ? 1
      : 1 - seg(tt, tStrike, tStrike + RELEASE);
    const kick = tt < tStrike ? 0 : -cfg.push * (1 - seg(tt, tStrike, 1));
    /* 弓端在身體外面，不是黏在身上；背面還要越過頭才看得見 */
    const hold = weaponHold(g, aimId) * (g.scale / 100) * cfg.swingMul;
    return {
      angle: axis.aim - 90 + cfg.tilt,
      lead: 1,
      offX: aim.x * (hold + kick),
      offY: aim.y * (hold + kick),
      alpha,
      pull,
      visible: true,
    };
  }

  if (cfg.motion === 'thrust') {
    /* 先微微後拉再推出去 —— 少了後拉那一下，前推會像平移而不是刺擊 */
    const back = -cfg.push * 0.25;
    const push =
      tt < tWindup ? lerp(0, back, easeOut(seg(tt, 0, tWindup)))
      : tt < tStrike ? lerp(back, cfg.push, easeIn(seg(tt, tWindup, tStrike)))
      : lerp(cfg.push, 0, easeOut(seg(tt, tStrike, 1)));
    /* 杖保持直立：角度是相對正上方的固定傾斜，往面朝側倒 */
    const s = g.scale / 100;
    const hold = weaponHold(g, aimId) * s * cfg.swingMul;
    const sideSign = weaponSideSign(g, aimId);
    return {
      angle: sideSign * cfg.tilt,
      lead: sideSign >= 0 ? 1 : -1,
      offX: aim.x * (push + hold),
      offY: aim.y * (push + hold),
      alpha,
      pull: 0,
      visible: true,
    };
  }

  /**
   * 弧線位置：0 = 起點（舉到頂）、1 = 終點（揮到底）。
   * 出現時停在 −pre（起點之前）那一小段回拉就是預備動作，收招再過頭 +over。
   */
  const f =
    tt < tWindup ? lerp(-cfg.pre, 0, easeOut(seg(tt, 0, tWindup)))
    : tt < tStrike ? lerp(0, 1, easeIn(seg(tt, tWindup, tStrike)))
    : lerp(1, 1 + cfg.over, easeOut(seg(tt, tStrike, 1)));

  /* 第二把把旋轉方向反過來，兩把才交叉 */
  const spin = hand === 1 && cfg.motion === 'dual' ? -axis.spin : axis.spin;
  /* 這把武器自己的弧線，套上該朝向的方向 */
  const theta = axis.aim + spin * lerp(cfg.arcFrom, cfg.arcTo, f);

  /**
   * 手的位置：從弧心往 theta 方向推一個半徑。
   * 揮到底時半徑再多一點（`reach`），收招的餘勢才有出處。
   */
  const s = g.scale / 100;
  const radius =
    weaponHold(g, aimId) * s * cfg.swingMul
    + cfg.reach * clamp01(seg(tt, tWindup, tStrike));
  const dir = aimVector(theta);

  return {
    /* 武器順著半徑指出去，再加上一點握持傾斜 */
    angle: theta + cfg.tilt,
    /* 角度遞增＝順時針＝往武器自身的 +x 前進，刃口就該在那一側 */
    lead: spin * (cfg.arcTo - cfg.arcFrom) >= 0 ? 1 : -1,
    offX: dir.x * radius,
    offY: dir.y * radius,
    alpha,
    pull: 0,
    visible: true,
  };
}
