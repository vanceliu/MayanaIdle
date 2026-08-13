/**
 * 技能特效的數字 —— **唯一出處**（`48-vfx.md` § 48.7.7）。
 *
 * 與武器（§ 48.6）同一個原則：**每個原型是各自獨立的一整組數字，不從共用基底衍生**。
 * 共用基底的話，調「範圍爆再慢一點」會連帶動到起手與命中，
 * 而每個原型的手感本來就該各自訂。
 *
 * 形狀在 `drawSkillFx.ts`、判定在 `skillFxStyle.ts`、播放在 `SkillFxManager.ts`。
 * 調校頁 `client/demo/skill-fx.html` 跑的是同一份。
 */
import { TILE_W, TILE_H } from '../../utils/isometric';
import { ELEMENT_COLORS } from '../projectileStyle';

/**
 * 十二個演出原型（§ 48.7.1、§ 48.8）。除了 `mark` 以外全是一次性的。
 *
 * `tint`（debuff 染色）不在這裡 —— 它是套在既有 sprite 上的 `tint` 值，
 * 不是一個獨立的繪製物件，見 `resolveDebuffTint()`。
 */
export const SKILL_FX_PROTOTYPES = [
  'cast', 'travel', 'impact', 'burst', 'nova', 'drop', 'heal',
  'aura', 'emblem', 'mark', 'shield', 'dotTick', 'bolt', 'crack', 'pillar',
] as const;

export type SkillFxPrototype = (typeof SKILL_FX_PROTOTYPES)[number];

/* ═══════════════════════════════════════════════════════════
   等距換算
   ═══════════════════════════════════════════════════════════ */

/**
 * 「格」換算成螢幕上的橢圓半徑。
 *
 * 地面上的圈一律是 `2:1` 橢圓（§ 48.7.5）—— 等距地圖上畫正圓，
 * 讀起來是一顆浮在半空的球，不是貼在地上的圈。
 */
export function tilesToGroundRadius(tiles: number): { rx: number; ry: number } {
  return { rx: tiles * (TILE_W / 2), ry: tiles * (TILE_H / 2) };
}

/* ═══════════════════════════════════════════════════════════
   顏色
   ═══════════════════════════════════════════════════════════ */

/**
 * 把顏色往白色混 —— **同色系的亮版**，用來當高光。
 *
 * **不可改用純白**（§ 48.7.2）。
 *
 * `amount` 0 ＝ 原色、1 ＝ 純白。
 */
export function lighten(color: number, amount: number): number {
  const a = clamp01(amount);
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const mix = (c: number) => Math.round(c + (255 - c) * a);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/* ═══════════════════════════════════════════════════════════
   緩動
   ═══════════════════════════════════════════════════════════ */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 擴張用：一開始快、末段慢 —— 爆開的東西不會等速變大 */
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** 收縮用：比 cubic 溫和，起手環往內收時不會一瞬間就到底 */
export function easeOutQuad(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u;
}

/** 淡出：`from` 之後才開始掉，之前維持 1 */
export function fadeAfter(t: number, from: number): number {
  if (t <= from) return 1;
  return clamp01(1 - (t - from) / (1 - from));
}

/* ═══════════════════════════════════════════════════════════
   原型參數
   ═══════════════════════════════════════════════════════════ */

/** 起手：施法者腳下一圈地面環向內收，帶幾條上升短線 */
export interface CastParams {
  durationMs: number;
  /** 起始／結束半徑（格） */
  r0: number;
  r1: number;
  lineW: number;
  alpha: number;
  /** 上升短線 */
  spokes: number;
  spokeLen: number;
  spokeRise: number;
  /** 高光：往白混多少當亮版（0＝關，見 `lighten()`） */
  light: number;
}

/**
 * 飛行段：頭部沿用投射物的外型（§ 42.4），後面補一條淡出拖尾。
 * 全程長度由距離與速度算出，不寫在這裡。
 */
export interface TravelParams {
  /** 拖尾的點數 */
  trail: number;
  /** 每個尾點往回退多少（以全程為 1） */
  trailGap: number;
  /** 最靠近頭部那一點的透明度 */
  trailAlpha: number;
  /** 尾端縮到頭部尺寸的幾成 */
  trailShrink: number;
  /** 圓形彈丸半徑 */
  headSize: number;
  /** 箭矢長度 */
  arrowLen: number;
  /**
   * 齊射時每一發之間錯開多久（ms，§ 48.7.4）。
   *
   * 六發同時出去會疊成一堵牆，數不出有幾發；錯開才讀得出「一次丟了六顆」。
   * 但也不能錯太開，那會變成連續施法六次。
   */
  volleyStaggerMs: number;
  /**
   * 多段攻擊（三連射）每一發之間錯開多久（ms）。
   *
   * 與齊射不同：齊射是**每個目標各一發**，多段是**同一個目標連著吃好幾發**。
   * 錯開得比齊射短 —— 那是「連射」，不是「射了三次」。
   */
  multiHitStaggerMs: number;
  /** 多段的箭稍微上下錯開幾 px，完全重疊會看起來只有一支 */
  multiHitSpread: number;
  /** 高光：彈丸中心那一點往白混多少 */
  light: number;
  /**
   * 彈跳連鎖每一段的**拱起高度**（px）。
   *
   * 直線飛過去讀起來是在傳球 —— 兩點之間最短路徑是「投擲」的語彙。
   * 拱一點才是「彈開」。但只能一點點：拱太高會變成拋物線砲擊。
   *
   * 一律往**畫面上方**拱，不是沿垂直於連線的方向 ——
   * 後者會隨方向左右翻，同一招往左打與往右打看起來是兩種東西。
   */
  bounceArc: number;
}

/** 命中點：中心閃點＋放射火花＋擴散環 */
export interface ImpactParams {
  durationMs: number;
  flashR: number;
  ringR0: number;
  ringR1: number;
  ringW: number;
  sparks: number;
  sparkLen: number;
  sparkW: number;
  /** 暴擊：整體放大倍率（§ 48.7.6） */
  critScale: number;
  /** 暴擊：額外那一圈衝擊環佔全長的比例與粗細 */
  critRingT: number;
  critRingW: number;
  /**
   * 被打的目標往後彈幾 px、彈多久（§ 48.7.6）。
   *
   * **每一下命中都彈，暴擊不加碼** —— 暴擊已經有星芒與衝擊環那兩個
   * 平常沒有的形狀，再多一個「彈比較大」只是把同一件事講第三遍，
   * 而且位移量的差別在 20px 的畫面上本來就不容易讀出來。
   */
  hitShakePx: number;
  hitShakeMs: number;
  /**
   * 暴擊的**星芒**：幾根、多長、多粗、佔全長多久。
   *
   * 與衝擊環（圓）和火花（沿元素色）都不同形 —— 暴擊要一眼認出來，
   * 靠的是「出現了平常沒有的形狀」，不是「同樣的東西大一點」。
   */
  critSpikes: number;
  critSpikeLen: number;
  critSpikeW: number;
  critSpikeT: number;
  /**
   * 暴擊的整段拉長幾倍。
   *
   * **只有暴擊專屬的那兩樣（衝擊環、星芒）跟著變慢** ——
   * 元素色的閃點與火花仍然照原本的絕對時間收掉。
   */
  critDurationMul: number;
  /** 高光：中心閃點與火花尖端往白混多少 */
  light: number;
  /**
   * 帶 debuff 時，幾成的火花改用點綴色（§ 48.7.4.3）。**只換一部分，不可全換。**
   */
  accentRatio: number;
  /** 帶 debuff 時額外飛出幾顆點綴色的小點（流血讀起來就是這幾顆） */
  accentFlecks: number;
  accentFleckR: number;
  /**
   * 普攻命中相對技能命中的大小（§ 48.7.6 的「`impact` 的最小型態」）。
   *
   * 普攻一秒好幾下，用技能那個尺寸會把畫面塞滿，而且技能就不特別了。
   * 但**不能小到看不見** —— 普攻是玩家最常看到的一件事，
   * 沒有命中回饋會覺得攻擊沒打到。
   */
  normalScale: number;
}

/** 範圍爆（`aoeCenter: 'target'`）：落點地面環擴到 `aoeRadius` 格 */
export interface BurstParams {
  durationMs: number;
  rings: number;
  /** 第 N 圈往後延多少（以全長為 1） */
  ringDelay: number;
  ringW: number;
  flashR: number;
  shards: number;
  shardLen: number;
  shardW: number;
  /** 地面環最終半徑相對 `aoeRadius` 的倍率 */
  radiusMul: number;
  /** 高光：環的內緣往白混多少 */
  light: number;
}

/** 自身中心爆（`aoeCenter: 'self'`）：沒有飛行段，直接從腳下擴 */
export interface NovaParams {
  durationMs: number;
  rings: number;
  ringDelay: number;
  ringW: number;
  flashR: number;
  radiusMul: number;
  /** 高光：環的內緣往白混多少 */
  light: number;
}

/** 落下型：從畫面上方掉下來，落點先亮預示環 */
export interface DropParams {
  fallMs: number;
  /** 起點在落點上方多少 px */
  fallFromY: number;
  /**
   * 起點往旁邊偏多少 px —— 落下路徑的傾角就是這個值除以 `fallFromY`。
   *
   * 齊射（流星雨）時每一顆用**同一個角度**，路徑互相平行。
   */
  fallTiltX: number;
  /** 預示環半徑（格）與粗細 */
  telegraphR: number;
  telegraphW: number;
  headSize: number;
  /** 拖尾點數（落下比平飛更需要速度感） */
  trail: number;
  trailGap: number;
  /** 齊射（流星雨）時每一顆之間錯開多久（ms，§ 48.7.4） */
  volleyStaggerMs: number;
}

/**
 * 電弧（`bolt`）：兩點之間的一段鋸齒（§ 48.7.3 的連鎖）。
 *
 * **不能用圓形彈丸代替** —— 一顆球在兩隻怪之間飛，讀起來是球在跳，不是電。
 * 電要一瞬間整條出現、抖一下、就沒了。
 */
export interface BoltParams {
  durationMs: number;
  /** 鋸齒分幾段 */
  segments: number;
  /** 每一節往旁邊歪多少 px */
  jitter: number;
  lineW: number;
  /** 中途換一次鋸齒的形狀，讀起來才是「在放電」而不是一張貼圖 */
  crackleAt: number;
  glow: number;
  glowWidthMul: number;
  glowAlpha: number;
  light: number;
}

/**
 * 地裂（`crack`）：從施法者往目標裂開的一條地縫（地裂術）。
 *
 * 跟著投射物一起長，不是一次畫完。
 */
export interface CrackParams {
  /** 地縫分幾節 */
  segments: number;
  /** 每一節往旁邊歪多少 px */
  jitter: number;
  lineW: number;
  /** 沿路噴起的碎石數與大小 */
  chips: number;
  chipR: number;
  /** 裂到底之後撐多久才開始淡（佔全長的比例） */
  fadeAt: number;
  light: number;
}

/**
 * 火柱（`pillar`）：命中之後從地上竄起的一根柱子（炎柱）。
 *
 * **竄起要快、消失要慢** —— 柱子是「轟」的一下上來的，
 * 慢慢升起讀起來是電梯。
 */
export interface PillarParams {
  durationMs: number;
  /** 柱高（px）與底寬（px） */
  height: number;
  width: number;
  /** 竄起佔全長的比例 */
  riseT: number;
  /** 頂端比底部窄多少（0＝上下一樣寬） */
  taper: number;
  /** 底部的地面環半徑（格） */
  baseR: number;
  baseW: number;
  light: number;
}

/** 治癒：目標身上光點上升 */
export interface HealParams {
  durationMs: number;
  motes: number;
  moteR: number;
  /** 光點總共往上飄多少 px */
  rise: number;
  /** 光點左右散開的最大距離 px */
  spread: number;
  /** 腳下那一圈的半徑（格） */
  ringR: number;
  ringW: number;
  /** 高光：光點核心往白混多少 */
  light: number;
}

/** Buff／Debuff 施加的那一下（§ 48.8.1）：腳下環往上擴一次 */
export interface AuraParams {
  durationMs: number;
  r0: number;
  r1: number;
  lineW: number;
  /** 環往上抬多少 px —— 完全貼地讀不出「套在身上」 */
  rise: number;
  motes: number;
  moteR: number;
  /** 高光：光點核心往白混多少 */
  light: number;
}

/**
 * Buff 徽記：施加時在頭上浮一個符號，升一小段後消失（§ 48.8.1）。
 *
 * 與藍環是**兩件事**：環講「有好東西上身」，徽記講「上的是哪一類」。
 * 所以各有各的時間 —— 環是 0.3 秒的一下，符號要看得懂就得停久一點。
 *
 * 這裡的劍是**符號，不是武器剪影**（§ 48.6）。武器剪影是要在 20px 下讀出
 * 十種武器類型的差別，用 Canvas 2D 烘成貼圖；徽記只要讀出「跟武器有關」，
 * 兩者的目的與尺度都不同，共用一份只會兩邊都綁手綁腳。
 */
export const EMBLEM_KINDS = [
  'sword', 'haste', 'poison', 'crit', 'flame', 'statAgi', 'statStr',
] as const;
export type EmblemKind = (typeof EMBLEM_KINDS)[number];

export interface EmblemParams {
  durationMs: number;
  /** 符號掛在頭頂多高（px，往上為負） */
  y: number;
  /** 整段往上飄多少 px */
  rise: number;
  /** 符號高度（px） */
  size: number;
  /** 浮出來佔全長的比例 */
  formT: number;
  /** 停留佔全長的比例 —— 太短就來不及看清楚是什麼 */
  holdT: number;
  /** 浮出時從幾成大小開始 */
  fromScale: number;
  lineW: number;
  /** 加速符號疊幾層人字（`haste`）。一層讀不出「連續」，太多層擠成一坨 */
  chevrons: number;
  /**
   * 水滴（`poison`）**從多高的地方落下來**（px）。
   *
   * 其餘符號是往上飄，水滴相反 —— 水滴往上飄就不是水滴了。
   * 而且要**加速落下**：等速的水滴讀起來是被線吊著往下放。
   */
  poisonFall: number;
  /**
   * 火焰（`flame`）整段抖幾次、抖多大。
   *
   * **不抖的火讀起來是一片橘色的葉子** —— 火焰的辨識度有一半在「它在動」。
   * 但抖太快會變成雜訊，四次左右就夠。
   */
  flameWobbles: number;
  flameFlicker: number;
  /**
   * 屬性提升的**文字標**（`statAgi`／`statStr`）：`AGI ↑` / `STR ↑`。
   *
   * 字母是**筆畫描邊**畫出來的，不是 `Text` 物件 ——
   * 為了兩個字串就讓特效層多支援一種節點（外加字型載入與貼圖）不划算，
   * 而且描邊在任何縮放下都不會糊。
   */
  labelH: number;
  /** 單一字母的寬度與字距（px） */
  labelW: number;
  labelGap: number;
  /** 箭頭離文字多遠、多大 */
  arrowGap: number;
  arrowW: number;
  arrowH: number;
  labelStrokeW: number;
  /**
   * 假發光：同一個形狀疊幾層愈來愈寬、愈來愈淡的描邊。`0` ＝ 關掉。
   *
   * **不用 filter**（§ 48.2）—— filter 每一個都是額外的 render pass，
   * 而符號是一次性的小東西，疊三層 Graphics 比開一個 pass 便宜太多。
   */
  glow: number;
  /** 每一層發光比本體寬幾倍 */
  glowWidthMul: number;
  /** 最內層發光的透明度，往外遞減 */
  glowAlpha: number;
  /** 高光：符號的亮部往白混多少（見 `lighten()`） */
  light: number;
}

/**
 * `buffCategory` → 徽記（§ 48.8.1）。**沒有列到的 buff 就不放徽記**。
 *
 * 以 `buffCategory` 為 key，不逐技能列（祝福武器與祝福魔法武器共用同一個
 * `buffCategory`，見 `22-basic-magic.md` § 22.4）。
 */
export const BUFF_EMBLEM_BY_CATEGORY: Record<string, EmblemKind> = {
  'weapon-bless': 'sword',     // 祝福武器、祝福魔法武器
  speed: 'haste',              // 加速術、強化加速術
  'poison-enchant': 'poison',  // 淬毒
  'crit-buff': 'crit',         // 致命一擊
  'fire-enchant': 'flame',     // 火矢附魔
};

/** Debuff tag → 染色（§ 48.8.2）。tag 的出處是 `24-buff-debuff.md` § 24.4.1 */
export const DEBUFF_TINT: Record<string, number> = {
  bleeding: 0xff6b6b,
  poisoned: 0x8fd968,
  cursed: 0xb072ff,
  weakened: 0x8e9bab,
  slowed: 0x8fcfee,
};

/**
 * 同時掛著多個 debuff 時染哪一個（§ 48.8.2）。
 *
 * **取優先度最高的一種，不混色** —— 混出來的顏色沒有語意，
 * 而且中毒＋詛咒＋減速並存是常態（§ 24.4.3），混色的結果會是一團灰。
 * 排序依「玩家最需要立刻看見」：掉血的兩種在前，數值減益在後。
 */
export const DEBUFF_TINT_PRIORITY = ['bleeding', 'poisoned', 'cursed', 'weakened', 'slowed'] as const;

/**
 * 暈眩**不染色** —— 它已經有頭頂星星（§ 48.8.3），
 * 再染一次等於同一件事講兩遍，還會把底下的中毒色蓋掉。
 */
export function resolveDebuffTint(tags: Iterable<string>): number | null {
  const set = tags instanceof Set ? tags : new Set(tags);
  for (const tag of DEBUFF_TINT_PRIORITY) {
    if (set.has(tag)) return DEBUFF_TINT[tag];
  }
  return null;
}

/**
 * 實體自己的受擊反應（§ 48.7.6）。
 *
 * **不是原型**，不進 `SKILL_FX_ART`：它動的是角色與怪物的 sprite，不是特效層的 `Graphics`。
 * 數值與特效原型同一個出處，不得分到另一個檔案。
 */
export interface HitReactionArt {
  /** 白閃多久（ms）。要比抖動短 —— 閃是「這一下」，抖是「被推開」 */
  flashMs: number;
  /** 白閃最亮時疊多少（0–1）。疊滿會整個變白，看不出被打的是誰 */
  flashAlpha: number;
  /** 死亡淡出多久（ms） */
  deathFadeMs: number;
  /**
   * 開始淡之前先撐多久（佔全長的比例，0–1）。
   *
   * 順序必須是「血條歸零 → 才倒下」。
   */
  deathHoldRatio: number;
  /** 淡出期間往下沉多少 px —— 原地消失讀起來像被刪掉，不像倒下 */
  deathSinkPx: number;
  /**
   * 判定判死之後，最多等多久才強制開始淡出（ms）。
   *
   * 正常路徑是屍體等致命那一發落地才開始淡。
   * 此上限是**保險絲**：特效被池子擠掉時 `onLand` 不會觸發。
   */
  corpseGraceMs: number;
}

export const HIT_REACTION_ART: HitReactionArt = {
  flashMs: 90,
  flashAlpha: 0.55,
  deathFadeMs: 320,
  deathHoldRatio: 0.25,
  deathSinkPx: 6,
  corpseGraceMs: 2000,
};

/**
 * 白閃此刻要疊多亮（0–1）。
 *
 * **快亮慢滅** —— 等速淡出讀起來是「發光」，瞬間亮起再收才是「被打到」。
 */
export function hitFlashAlpha(elapsedMs: number, p: HitReactionArt): number {
  if (elapsedMs < 0 || elapsedMs >= p.flashMs) return 0;
  const k = 1 - elapsedMs / p.flashMs;
  return k * k * p.flashAlpha;
}

/**
 * 死亡淡出此刻的樣子。
 *
 * 透明度**先撐一下再掉**（`deathHoldRatio`）；下沉從第一幀就開始。
 */
export function deathFadeState(
  elapsedMs: number,
  p: HitReactionArt,
): { alpha: number; sinkPx: number } {
  const t = Math.max(0, Math.min(1, elapsedMs / p.deathFadeMs));
  const hold = Math.max(0, Math.min(0.95, p.deathHoldRatio));
  const fade = t <= hold ? 0 : (t - hold) / (1 - hold);
  return { alpha: 1 - fade, sinkPx: t * p.deathSinkPx };
}

/**
 * 命中抖動此刻的位移（px）。回傳正值，方向由呼叫端決定。
 *
 * 調校頁與遊戲共用同一份：遊戲中抖的是 `MonsterEntity` 的 sprite。
 */
export function hitShakeOffset(elapsedMs: number, p: ImpactParams): number {
  if (elapsedMs < 0 || elapsedMs >= p.hitShakeMs) return 0;
  const k = 1 - elapsedMs / p.hitShakeMs;
  /* 一次來回 */
  return Math.sin(k * Math.PI) * p.hitShakePx * k;
}

/**
 * 徽記自己的顏色。`null` ＝ 沿用呼叫端給的色（buff 藍）。
 *
 * **這是 § 48.8.1「只有藍與紅」的例外，只開在符號上**：環仍然只有藍紅兩色。
 * 綠色取 `DEBUFF_TINT.poisoned`、黃色取 § 42.3 的暴擊數字色，**不新增色票**。
 */
/**
 * 屬性色 —— **新開的一組色票**，專案其他地方尚未替六大屬性上色。
 *
 * 之後角色卡若要替屬性上色，**必須沿用這兩個值**。
 * 力量紅與流血紅（`DEBUFF_TINT.bleeding`）相近是刻意接受的。
 */
export const ATTRIBUTE_COLORS = {
  agility: 0x5bc8ff,
  str: 0xff4d4d,
} as const;

export const EMBLEM_COLORS: Record<EmblemKind, number | null> = {
  sword: null,
  haste: null,
  poison: DEBUFF_TINT.poisoned,
  crit: 0xffff00,
  /* 直接吃 § 42.4 的火色，不抄一份 hex —— 抄了改色表就會有一邊沒跟到 */
  flame: ELEMENT_COLORS.fire,
  statAgi: ATTRIBUTE_COLORS.agility,
  statStr: ATTRIBUTE_COLORS.str,
};

/**
 * buff 提升哪個屬性 → 灑什麼顏色的粉（§ 48.8.1）。
 *
 * 敏捷提升與力量提升**沒有 `buffCategory`**（資料裡是空的），
 * 所以改吃 `buffModifiers[].stat` —— 一樣是推導，不是逐技能列，
 * 之後多一個「+敏捷」的 buff 也自動有。
 */
export const BUFF_EMBLEM_BY_STAT: Record<string, EmblemKind> = {
  agility: 'statAgi',
  str: 'statStr',
};

/** 文字標寫什麼 —— 直接用屬性的英文縮寫，不另外造詞 */
export const STAT_LABEL_TEXT: Record<string, string> = {
  statAgi: 'AGI',
  statStr: 'STR',
};

/**
 * `buffCategory` 優先，沒有 category 的再看提升哪個屬性。
 * 兩張表都查不到就不放符號。
 */
export function resolveBuffEmblem(
  buffCategory: string | undefined,
  buffModifiers?: readonly { stat: string }[],
): EmblemKind | null {
  if (buffCategory && BUFF_EMBLEM_BY_CATEGORY[buffCategory]) {
    return BUFF_EMBLEM_BY_CATEGORY[buffCategory];
  }
  for (const m of buffModifiers ?? []) {
    const kind = BUFF_EMBLEM_BY_STAT[m.stat];
    if (kind) return kind;
  }
  return null;
}

/** 暈眩的頭頂星星（§ 48.8.3） */
export interface MarkParams {
  stars: number;
  starR: number;
  orbitR: number;
  orbitMs: number;
  /** 星星掛在頭頂多高（px，往上為負） */
  starY: number;
}

/**
 * 護盾／無敵掛上去的那一下（§ 48.8.3）。
 *
 * 是**罩住整個角色的球**，不是腳下一圈環。
 * 等距畫面上的球＝一個圓外框 ＋ 一圈 2:1 的赤道 ＋ 一圈貼地的底環。
 *
 * **這是一次性的，球演完就沒了**（§ 48.8.3）。護盾還在不在由 icon 表達。
 */
export interface ShieldParams {
  durationMs: number;
  /** 球半徑（px） */
  r: number;
  /** 球心離腳底多高（px，往上為負） */
  cy: number;
  lineW: number;
  /** 球體本身的填色透明度 —— 太高會把角色蓋掉 */
  fillAlpha: number;
  /** 外框透明度 */
  rimAlpha: number;
  /** 赤道與底環的透明度 */
  equatorAlpha: number;
  /** 成形佔全長的比例：球從小長到滿 */
  formT: number;
  /** 撐滿之後停多久（佔全長的比例）*/
  holdT: number;
  /** 收掉時撐到原本的幾倍 */
  expand: number;
  /** 成形時從幾成大小開始 */
  fromScale: number;
  /**
   * **白色鑲邊**：貼在球外緣的一圈細白線（`0` ＝ 關）。
   *
   * 純色的球讀起來是一張色紙剪出來的圓；外緣一圈白會讓它有厚度，
   * 像是玻璃或能量的邊界。白色不帶語意，所以不會跟「藍＝好」打架。
   */
  inlayW: number;
  inlayAlpha: number;
  /**
   * 發光：同一顆球疊幾層愈來愈寬愈淡的描邊（`0` ＝ 關）。
   * 與徽記同一個做法 —— **不用 filter**（§ 48.2）。
   */
  glow: number;
  glowWidthMul: number;
  glowAlpha: number;
}

/** DoT 每跳的小粒子（§ 48.8.4）。數字顏色不歸這裡，見 § 42.3 */
export interface DotTickParams {
  durationMs: number;
  motes: number;
  moteR: number;
  rise: number;
  spread: number;
}

export interface SkillFxArt {
  cast: CastParams;
  travel: TravelParams;
  impact: ImpactParams;
  burst: BurstParams;
  nova: NovaParams;
  drop: DropParams;
  heal: HealParams;
  aura: AuraParams;
  bolt: BoltParams;
  crack: CrackParams;
  pillar: PillarParams;
  emblem: EmblemParams;
  mark: MarkParams;
  shield: ShieldParams;
  dotTick: DotTickParams;
}

/**
 * 十二個原型的預設數字。
 *
 * 這些是**設計時長**，與武器同一個語意（§ 48.6.4）：
 * 接進遊戲後 `cast` 與命中段會被攻擊間隔壓縮，這裡寫的是常速下的手感。
 */
export const SKILL_FX_ART: SkillFxArt = {
  cast: {
    durationMs: 240,
    r0: 0.95,
    r1: 0.18,
    lineW: 2,
    alpha: 0.9,
    spokes: 4,
    spokeLen: 9,
    spokeRise: 15,
    light: 0.5,
  },
  travel: {
    trail: 5,
    trailGap: 0.035,
    trailAlpha: 0.5,
    trailShrink: 0.35,
    headSize: 4,
    arrowLen: 12,
    volleyStaggerMs: 70,
    multiHitStaggerMs: 100,
    multiHitSpread: 4,
    light: 0.7,
    bounceArc: 13,
  },
  impact: {
    durationMs: 260,
    flashR: 7,
    ringR0: 3,
    ringR1: 17,
    ringW: 2,
    sparks: 6,
    sparkLen: 13,
    sparkW: 1.6,
    critScale: 1.4,
    critRingT: 0.82,
    critRingW: 3,
    hitShakePx: 2.4,
    hitShakeMs: 150,
    critSpikes: 4,
    critSpikeLen: 34,
    critSpikeW: 4.5,
    critSpikeT: 0.62,
    critDurationMul: 1.45,
    light: 0.6,
    accentRatio: 0.5,
    accentFlecks: 4,
    accentFleckR: 1.8,
    normalScale: 0.62,
  },
  burst: {
    durationMs: 420,
    rings: 2,
    ringDelay: 0.14,
    ringW: 3,
    flashR: 15,
    shards: 8,
    shardLen: 11,
    shardW: 2,
    radiusMul: 1,
    light: 0.55,
  },
  nova: {
    durationMs: 520,
    rings: 3,
    ringDelay: 0.11,
    ringW: 3,
    flashR: 12,
    radiusMul: 1,
    light: 0.55,
  },
  drop: {
    fallMs: 320,
    fallFromY: -260,
    fallTiltX: 46,
    telegraphR: 0.8,
    telegraphW: 2,
    headSize: 5,
    trail: 6,
    trailGap: 0.05,
    volleyStaggerMs: 110,
  },
  heal: {
    durationMs: 600,
    motes: 7,
    moteR: 2.4,
    rise: 34,
    spread: 11,
    ringR: 0.45,
    ringW: 2,
    light: 0.6,
  },
  aura: {
    durationMs: 300,
    r0: 0.2,
    r1: 0.85,
    lineW: 2,
    rise: 18,
    motes: 5,
    moteR: 2,
    light: 0.6,
  },
  bolt: {
    durationMs: 170,
    segments: 7,
    jitter: 5,
    lineW: 1.8,
    crackleAt: 0.45,
    glow: 3,
    glowWidthMul: 2.6,
    glowAlpha: 0.18,
    light: 0.75,
  },
  crack: {
    segments: 9,
    jitter: 4,
    lineW: 2.2,
    chips: 6,
    chipR: 1.6,
    fadeAt: 0.6,
    light: 0.5,
  },
  pillar: {
    durationMs: 420,
    height: 46,
    width: 15,
    riseT: 0.22,
    taper: 0.45,
    baseR: 0.5,
    baseW: 2.5,
    light: 0.7,
  },
  emblem: {
    durationMs: 820,
    /* 要在髮頂（約 −40）之上，蓋到頭上就讀不出是「浮在頭頂的符號」 */
    y: -50,
    rise: 9,
    size: 15,
    formT: 0.2,
    holdT: 0.5,
    fromScale: 0.55,
    lineW: 1.2,
    chevrons: 3,
    poisonFall: 16,
    flameWobbles: 4,
    flameFlicker: 0.16,
    labelH: 11,
    labelW: 6.5,
    labelGap: 2.2,
    arrowGap: 3.5,
    arrowW: 5,
    arrowH: 10,
    labelStrokeW: 1.6,
    glow: 3,
    glowWidthMul: 2.2,
    glowAlpha: 0.16,
    light: 0.75,
  },
  mark: {
    stars: 3,
    starR: 3.4,
    orbitR: 9,
    orbitMs: 900,
    starY: -30,
  },
  shield: {
    durationMs: 760,
    /*
     * 球要罩得住整個剪影。角色從腳底 0 到髮頂約 −40（軀幹 20 ＋ 頭 20 − 重疊 3），
     * 所以球心放在半身高、半徑略大於半身高 —— 呆毛戳出去一點無所謂，
     * 但頭或腳露在外面就不叫「罩住」了。
     */
    r: 24,
    cy: -20,
    lineW: 1.6,
    fillAlpha: 0.1,
    rimAlpha: 0.75,
    equatorAlpha: 0.3,
    formT: 0.22,
    holdT: 0.4,
    expand: 1.25,
    fromScale: 0.4,
    inlayW: 0.9,
    inlayAlpha: 0.85,
    glow: 3,
    glowWidthMul: 2.4,
    glowAlpha: 0.13,
  },
  dotTick: {
    durationMs: 420,
    motes: 4,
    moteR: 2,
    rise: 16,
    spread: 8,
  },
};

/* ═══════════════════════════════════════════════════════════
   Buff／Debuff 的顏色（§ 48.8）
   ═══════════════════════════════════════════════════════════ */

/**
 * 施加瞬間只有兩色，沿用 `24-buff-debuff.md` § 24.8.2 的 icon 框色 ——
 * icon 列已經用這兩色區分好壞，場上再換一套等於要玩家記第二組語意。
 */
export const BUFF_AURA_COLOR = 0x3b82f6;
export const DEBUFF_AURA_COLOR = 0xef4444;

/**
 * 帶 debuff 的攻擊技能，命中時要點綴什麼顏色（§ 48.7.4.3）。
 *
 * **直接吃 `DEBUFF_TINT`，不另立一張表** —— 裂傷斬造成流血，
 * 那一下就該有紅色；而紅色在染色那邊已經是流血的顏色了，
 * 兩邊用同一個色玩家才連得起來。
 *
 * 沒有對應顏色的 debuff（暈眩、挑釁、防禦下降）不點綴 ——
 * 每個 debuff 都配一個顏色等於要玩家背一套圖例。
 */
export function resolveDebuffAccent(tags: Iterable<string> | undefined): number | null {
  return tags ? resolveDebuffTint(tags) : null;
}

/** 頭頂標記只有暈眩一種（§ 48.8.3） */
export const MARK_KINDS = ['stun'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/**
 * 球形罩的兩種。
 *
 * 無敵（§ 24.4.8）與護盾吸收（§ 24.4.9）在規則上不同 ——
 * 一個完全不受傷、一個扣完就沒 —— 但玩家在畫面上要讀的是同一件事：
 * 「有東西罩上來了」。所以共用球形罩，只換顏色。
 */
export const SHIELD_KINDS = ['shield', 'invincible'] as const;
export type ShieldKind = (typeof SHIELD_KINDS)[number];

/**
 * `buffCategory` → 球形罩（§ 48.8.3）。**沒有列到的 buff 只有藍環。**
 *
 * 收的是「有東西幫你擋傷害」這一整類 —— 玩家要讀的是同一件事，
 * 至於擋法是加防禦、減傷、吸收還是完全免疫，那是 tooltip 的事。
 * 同樣走 category 推導：防禦三階遞進（保護罩→魔法盔甲→高級魔法盔甲，
 * `22-basic-magic.md` § 22.4）後兩者本來就共用 `defense-buff`。
 */
export const BUFF_SHIELD_BY_CATEGORY: Record<string, ShieldKind> = {
  'protect-shield': 'shield',   // 保護罩（防禦三階的第一階）
  'defense-buff': 'shield',     // 魔法盔甲、高級魔法盔甲、鋼鐵護盾
  'holy-shield': 'shield',      // 聖光護盾（吸收傷害，§ 24.4.9）
  sanctuary: 'shield',          // 聖域、神聖領域（減傷）
  invincible: 'invincible',     // 絕對屏障（§ 24.4.8）
};

export function resolveBuffShield(buffCategory: string | undefined): ShieldKind | null {
  if (!buffCategory) return null;
  return BUFF_SHIELD_BY_CATEGORY[buffCategory] ?? null;
}

export const MARK_COLORS: Record<MarkKind | ShieldKind, number> = {
  stun: 0xffd94a,
  shield: 0x66aaff,
  invincible: 0xffffff,
};
