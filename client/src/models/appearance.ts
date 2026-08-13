/**
 * 角色外觀 —— 規格見 `docs/design/04-character.md` § 4.10。
 *
 * 這裡只放**存進 `characters.appearance` 的資料**與它的驗證：
 * 髮型清單、可調項與範圍、色票、預設值。
 * 實際怎麼畫（髮際線座標、髮尾曲線、體型）屬於渲染，在 `pixi/entities/pawn/`。
 *
 * 外觀資料會被存檔、匯出、封存；繪製參數只影響畫面。兩者不可混在一起。
 */

/* ═══════════════════════════════════════════════════════════
   髮型（13 種，`04-character.md` § 4.10）
   ═══════════════════════════════════════════════════════════ */

export const HAIR_STYLES = [
  { id: 'bald', label: '光頭' },
  { id: 'buzz', label: '平頭' },
  { id: 'part', label: '旁分' },
  { id: 'long', label: '長髮' },
  { id: 'pony', label: '後馬尾' },
  { id: 'sidepony', label: '側馬尾' },
  { id: 'twin', label: '雙馬尾' },
  { id: 'twinlong', label: '長雙馬尾' },
  { id: 'braid', label: '麻花辮' },
  { id: 'bun', label: '丸子頭' },
  { id: 'twinbun', label: '雙丸子' },
  { id: 'mohawk', label: '莫霍克' },
  { id: 'spike', label: '呆毛' },
] as const;

export type HairStyleId = (typeof HAIR_STYLES)[number]['id'];

const HAIR_STYLE_IDS = new Set<string>(HAIR_STYLES.map((h) => h.id));

export function isHairStyleId(v: unknown): v is HairStyleId {
  return typeof v === 'string' && HAIR_STYLE_IDS.has(v);
}

/* ═══════════════════════════════════════════════════════════
   可調參數
   ═══════════════════════════════════════════════════════════ */

/** 一項滑桿的定義：範圍是唯一出處，UI 與驗證都讀它，不各寫一份 */
export interface TunableDef<K extends string> {
  key: K;
  label: string;
  min: number;
  max: number;
}

export type HairTuneKey = 'front' | 'peak' | 'mDip' | 'bangLen';

/**
 * 每個髮型開 4 項，**全部作用在正面**。
 * 範圍是全髮型共用的；各髮型自己的基準值屬於渲染參數，不在這裡。
 */
export const HAIR_TUNABLES: readonly TunableDef<HairTuneKey>[] = [
  { key: 'front', label: '瀏海長度', min: 20, max: 70 },
  { key: 'peak', label: '中段尖高', min: 0, max: 70 },
  { key: 'mDip', label: '中間高低', min: -50, max: 50 },
  { key: 'bangLen', label: '側瀏海', min: 0, max: 60 },
];

export type LashTuneKey = 'len' | 'curl' | 'w';

export const LASH_TUNABLES: readonly TunableDef<LashTuneKey>[] = [
  { key: 'len', label: '長度', min: 4, max: 34 },
  { key: 'curl', label: '上翹', min: -12, max: 28 },
  { key: 'w', label: '粗細', min: 15, max: 90 },
];

export interface Lash {
  /** 0 = 不畫睫毛 */
  on: 0 | 1;
  len: number;
  curl: number;
  w: number;
}

export const DEFAULT_LASH: Lash = { on: 0, len: 14, curl: 9, w: 45 };

/* ═══════════════════════════════════════════════════════════
   色票
   ═══════════════════════════════════════════════════════════ */

export const SKIN_TONES = [
  '#f2d6b8', '#e8c9a0', '#dcb894', '#c98f5e', '#a9703f', '#7c4f2c', '#5a3720',
] as const;

/**
 * 共用調色盤 —— **髮色、眼色、衣色都從這裡挑**，不各自維護一份。
 *
 * 分成三份的話同一個顏色會有三個略微不同的版本，而且加一個顏色要改三個地方。
 * 膚色不在這裡：膚色是一條有方向的漸層（淺→深），不是自由選色。
 *
 * 每一列是同一個色相由深到淺，第一列是中性色。UI 直接照這個排版畫成格子。
 */
export const PALETTE_ROWS = [
  ['#0b0b16', '#2f2a33', '#55505c', '#8a8694', '#c9c2b4', '#ece8df'], // 中性
  ['#2a1a12', '#4a3728', '#7a5a3c', '#a9835c', '#d2b48c', '#e8d5b8'], // 棕
  ['#4a3a10', '#8a6b1a', '#c9a227', '#e3c765', '#f0e2a8', '#f7f0cc'], // 黃金
  ['#4a2a10', '#7a4a18', '#c9772b', '#e3a45f', '#f0cfa0', '#f7e6cc'], // 橙
  ['#4a1a1a', '#6b2a2a', '#b03a2e', '#e58080', '#f2b8b0', '#f9dcd8'], // 紅
  ['#401428', '#6b2447', '#b0546a', '#e08aa0', '#f2c0cc', '#f9e0e6'], // 粉
  ['#2a1a3f', '#4a2f5e', '#7b52a8', '#b98ae0', '#d9c2f0', '#ece0f7'], // 紫
  ['#14213f', '#24506e', '#3d7fb8', '#6fb0e0', '#b3d6f2', '#d9ebf9'], // 藍
  ['#10373a', '#1f5f66', '#2f9ba6', '#6fcbd4', '#b6e8ec', '#daf3f5'], // 青
  ['#14361f', '#2f5d3a', '#4a9c5e', '#7fd08f', '#bfe8c6', '#dff4e3'], // 綠
] as const;

/** 攤平的調色盤。驗證與隨機都用這個 */
export const PALETTE: readonly string[] = PALETTE_ROWS.flat();

/* ═══════════════════════════════════════════════════════════
   眼睛可見度
   ═══════════════════════════════════════════════════════════ */

/** 低於這個對比，眼珠在遊戲內尺寸會糊進膚色裡 */
export const MIN_EYE_CONTRAST = 2.2;

/** 每個膚色至少要有這麼多個顏色能當眼色（§ 4.10） */
export const MIN_EYE_TONES_PER_SKIN = 8;

/** sRGB 相對亮度（WCAG）。只用於判斷可見度，不做配色 */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG 對比值（1 ~ 21）。順序無關 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 在這個膚色上看得見的眼色。UI 的提示與隨機造型都用它，不各判各的 */
export function usableEyeTones(skin: string): string[] {
  return PALETTE.filter((c) => contrastRatio(c, skin) >= MIN_EYE_CONTRAST);
}

/* ═══════════════════════════════════════════════════════════
   存檔格式
   ═══════════════════════════════════════════════════════════ */

export type HairTune = Partial<Record<HairTuneKey, number>>;

export interface Appearance {
  hair: HairStyleId;
  skin: string;
  hairColor: string;
  /** 眼珠與睫毛共用（§ 4.10），不拆成兩個欄位 */
  eyeColor: string;
  /**
   * 內衣（底衣）的顏色。
   * 裝備外觀做出來之後可能會蓋掉它，但那是之後的事 —— 目前它就是外觀的一部分。
   */
  cloth: string;
  lash: Lash;
  /**
   * 逐髮型的微調值，**只存與該髮型基準不同的項目**。
   * 存差異而不是存絕對值：日後調整髮型基準時既有角色會跟著更新。
   */
  tune: Partial<Record<HairStyleId, HairTune>>;
}

export const DEFAULT_APPEARANCE: Appearance = {
  hair: 'part',
  skin: SKIN_TONES[1],
  hairColor: PALETTE_ROWS[1][1],  // 深棕
  eyeColor: PALETTE_ROWS[0][0],   // 墨黑
  cloth: PALETTE_ROWS[7][2],      // 藍
  lash: { ...DEFAULT_LASH },
  tune: {},
};

/** 每次都給新物件 —— 回傳共用的 DEFAULT_APPEARANCE 會讓兩隻角色共用同一個 tune */
export function createDefaultAppearance(): Appearance {
  return {
    ...DEFAULT_APPEARANCE,
    lash: { ...DEFAULT_LASH },
    tune: {},
  };
}

/* ═══════════════════════════════════════════════════════════
   驗證
   ═══════════════════════════════════════════════════════════ */

/**
 * 顏色只收 `#rrggbb`。
 *
 * 這個字串會直接餵給 canvas 的 fillStyle，不可放行任意字串。
 * 不在色票內的合法色碼一律放行：色票是 UI 提供的選項，不是資料的限制。
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_COLOR.test(v) ? v.toLowerCase() : fallback;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function normalizeLash(raw: unknown): Lash {
  const src = (raw ?? {}) as Record<string, unknown>;
  const lash: Lash = { ...DEFAULT_LASH, on: src.on ? 1 : 0 };
  for (const t of LASH_TUNABLES) {
    lash[t.key] = clampInt(src[t.key], t.min, t.max, DEFAULT_LASH[t.key]);
  }
  return lash;
}

function normalizeTune(raw: unknown): Appearance['tune'] {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Appearance['tune'] = {};
  for (const [hairId, values] of Object.entries(src)) {
    if (!isHairStyleId(hairId) || typeof values !== 'object' || values === null) continue;
    const entry: HairTune = {};
    for (const t of HAIR_TUNABLES) {
      const v = (values as Record<string, unknown>)[t.key];
      /* 沒設過的項目要保持沒設過（不可補成基準值），
         日後調髮型基準時這隻角色不會跟著更新 */
      if (v === undefined) continue;
      entry[t.key] = clampInt(v, t.min, t.max, t.min);
    }
    if (Object.keys(entry).length > 0) out[hairId] = entry;
  }
  return out;
}

/**
 * 把任何來源的外觀資料收成合法的 `Appearance`。**不會拋錯。**
 *
 * 三種輸入都必須撐得住：舊匯出檔（沒有 `appearance`）、
 * 舊版本的外觀（欄位比現在少）、以及手改壞的檔案。
 * 匯入時拋錯等於整隻角色救不回來，而外觀是最不值得為它擋掉匯入的東西。
 */
export function normalizeAppearance(raw: unknown): Appearance {
  const src = (raw ?? {}) as Record<string, unknown>;
  return {
    hair: isHairStyleId(src.hair) ? src.hair : DEFAULT_APPEARANCE.hair,
    skin: color(src.skin, DEFAULT_APPEARANCE.skin),
    hairColor: color(src.hairColor, DEFAULT_APPEARANCE.hairColor),
    eyeColor: color(src.eyeColor, DEFAULT_APPEARANCE.eyeColor),
    cloth: color(src.cloth, DEFAULT_APPEARANCE.cloth),
    lash: normalizeLash(src.lash),
    tune: normalizeTune(src.tune),
  };
}

/* ═══════════════════════════════════════════════════════════
   隨機造型
   ═══════════════════════════════════════════════════════════ */

/**
 * 隨機外觀。眼色只從「在該膚色上看得見的」裡面抽 ——
 * 全色票隨機會有一半機率抽出一張沒有眼睛的臉。
 *
 * `rng` 可注入，測試才能斷定結果而不是碰運氣。
 */
export function randomAppearance(rng: () => number = Math.random): Appearance {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const skin = pick(SKIN_TONES);
  const usable = usableEyeTones(skin);
  return {
    hair: pick(HAIR_STYLES).id,
    skin,
    hairColor: pick(PALETTE),
    eyeColor: pick(usable.length > 0 ? usable : PALETTE),
    cloth: pick(PALETTE),
    lash: { ...DEFAULT_LASH, on: rng() < 0.5 ? 1 : 0 },
    tune: {},
  };
}
