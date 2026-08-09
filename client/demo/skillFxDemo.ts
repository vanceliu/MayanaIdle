/**
 * 技能特效調校頁的橋接層（`48-vfx.md` § 48.7 / § 48.8）。
 *
 * 與武器、角色同一個原則：**demo 不自帶一份畫法**。
 * 原型的數字、形狀、判定、播放全部在 `client/src/pixi/ui/skillFx/`，
 * 這頁跑的就是接進遊戲後的那一份 —— 兩邊各留一份必然走鐘。
 *
 * 這裡只做四件事：
 * 1. 把全部 75 個技能連同判定結果攤成一張表（調校頁要一眼看完所有技能演什麼）
 * 2. 搭一個能看的舞台：等距地磚、角色剪影、幾隻怪、傷害數字
 * 3. 提供滑桿要用的參數範圍表（只有調校頁需要）
 * 4. 支援「倒帶到任一毫秒」—— manager 只能往前推，所以倒帶＝重播再快轉
 */
import { Application, Container, Graphics } from 'pixi.js';

import { SKILL_CATALOG, type Skill } from '../src/models/skill';
import { CLASS_SKILLS } from '../src/models/classSkills';
import { DEFAULT_LASH } from '../src/models/appearance';
import { resolveCapCfg } from '../src/pixi/entities/pawn/hairRender';
import type { PawnLook } from '../src/pixi/entities/pawn/drawPawn';
import { PawnSprite } from '../src/pixi/entities/pawn/PawnSprite';
import {
  weaponAimFromDelta, weaponPlaybackMs, WEAPON_ART, type PawnWeaponType,
} from '../src/pixi/entities/pawn/weaponGeometry';
import { MonsterEntity } from '../src/pixi/entities/MonsterEntity';
import { DamageNumberManager } from '../src/pixi/ui/DamageNumber';
import { TILE_W, TILE_H, worldToScreen } from '../src/pixi/utils/isometric';
import {
  SKILL_FX_ART, SkillFxManager, playSkillFx,
  resolveSkillFxPlan, resolveNormalAttackFxPlan, resolveAuraColor,
  DEBUFF_TINT, MARK_KINDS, MARK_COLORS, SHIELD_KINDS, BUFF_AURA_COLOR, DEBUFF_AURA_COLOR,
  SKILL_FX_PROTOTYPES, VOLLEY_FX_SKILL_IDS, CHAIN_FX_SKILL_IDS,
  DROP_FX_SKILL_IDS, SKILL_FX_OVERRIDES, resolveChainStyle,
  EMBLEM_KINDS,
  BUFF_EMBLEM_BY_CATEGORY, BUFF_SHIELD_BY_CATEGORY,
  resolveMuzzleOffset, HIT_REACTION_ART,
  type EmblemKind, type MarkKind, type ShieldKind,
  type SkillFxContext, type SkillFxPlan, type SkillFxPrototype,
} from '../src/pixi/ui/skillFx';
import { ELEMENT_COLORS } from '../src/pixi/ui/projectileStyle';

export {
  HIT_REACTION_ART,
  SKILL_FX_ART, SKILL_FX_PROTOTYPES, MARK_KINDS, MARK_COLORS, SHIELD_KINDS,
  DEBUFF_TINT, BUFF_AURA_COLOR, DEBUFF_AURA_COLOR, ELEMENT_COLORS,
  VOLLEY_FX_SKILL_IDS, CHAIN_FX_SKILL_IDS, DROP_FX_SKILL_IDS,
  SKILL_FX_OVERRIDES, resolveChainStyle,
  EMBLEM_KINDS, BUFF_EMBLEM_BY_CATEGORY, BUFF_SHIELD_BY_CATEGORY,
  resolveSkillFxPlan, resolveNormalAttackFxPlan, resolveAuraColor,
};
export type { EmblemKind, MarkKind, ShieldKind, SkillFxContext, SkillFxPlan, SkillFxPrototype };

/* ═══════════════════════════════════════════════════════════
   技能總表
   ═══════════════════════════════════════════════════════════ */

export interface SkillRow {
  skill: Omit<Skill, 'lastUsedAt'>;
  /** 可在調校頁上被 `setVolley()` 改寫 */
  plan: SkillFxPlan;
  /** 分組標籤：基礎魔法依級數、職業魔法依職業 */
  group: string;
}

const CLASS_LABEL: Record<string, string> = {
  knight: '騎士',
  elf: '妖精',
  elementalist: '元素師',
  priest: '牧師',
  thief: '盜賊',
};

export const ELEMENT_LABEL: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地',
  light: '光', dark: '暗', none: '無',
};

export const TYPE_LABEL: Record<string, string> = {
  attack: '攻擊', heal: '治癒', buff: '輔助',
};

export const DELIVERY_LABEL: Record<string, string> = {
  none: '—', travel: '投射', drop: '落下', melee: '揮擊', chain: '連鎖',
};

export const EMBLEM_LABEL: Record<string, string> = {
  sword: '頭上劍徽',
  haste: '頭上加速人字',
  poison: '頭上綠水滴',
  crit: '頭上 X（兩筆）',
  flame: '頭上火焰',
  statAgi: '頭上 AGI ↑',
  statStr: '頭上 STR ↑',
};

export const SHIELD_LABEL: Record<string, string> = {
  shield: '護盾球', invincible: '無敵球',
};

export const LANDING_LABEL: Record<string, string> = {
  none: '（同普攻）', impact: '命中', burst: '範圍爆',
  nova: '自身爆', heal: '治癒', aura: '施加', pillar: '火柱',
};

export const TRAIL_LABEL: Record<string, string> = {
  crack: '地裂',
};

export const SHAPE_LABEL: Record<string, string> = {
  circle: '', arrow: '（箭）', lance: '（長槍）',
};

/**
 * 施放當下的外在條件（§ 42.4）—— 調校頁可以切，看同一個技能在不同狀態下的顏色。
 * 目前只有走普攻公式的三連射吃得到。
 */
export const fxContext: SkillFxContext = {};

/** 全部 75 個技能，附上判定結果。順序＝基礎魔法 1~10 級，再五職業各 5 級 */
export const SKILL_ROWS: SkillRow[] = [
  ...SKILL_CATALOG.map(skill => ({
    skill,
    plan: resolveSkillFxPlan(skill),
    group: `基礎魔法 ${skill.level} 級`,
  })),
  ...CLASS_SKILLS.map(c => ({
    skill: c.skill,
    plan: resolveSkillFxPlan(c.skill),
    group: `職業魔法 — ${CLASS_LABEL[c.className] ?? c.className}`,
  })),
];

/**
 * 換了附魔或刻印之後重算顏色。
 *
 * **保留調校頁上切過的齊射設定** —— 重算整張表會把它洗掉，
 * 使用者剛切好的名單不能因為換一下附魔就不見。
 */
export function applyFxContext(next: SkillFxContext): void {
  Object.assign(fxContext, next);
  /* 覆寫留著 —— 換個附魔不該把使用者調好的演出洗掉 */
  refreshPlans();
}

/**
 * 這一列的 debuff 點綴（§ 48.7.4.3）—— 表格用它顯示「命中會帶什麼顏色」。
 * 名稱直接取技能自己的 `applyDebuff.name`，不另立對照表。
 */
export function describeAccent(row: SkillRow): string | null {
  if (row.plan.accent === null) return null;
  return row.skill.applyDebuff?.name ?? '點綴';
}

/** 一句話描述這個技能會怎麼演 —— 表格與下拉都用它 */
export function describePlan(plan: SkillFxPlan): string {
  const parts: string[] = [];
  if (plan.cast) parts.push('起手');
  if (plan.delivery !== 'none') {
    const mul = plan.volley || plan.delivery === 'chain'
      ? ' ×N'
      : plan.hits > 1 ? ` ×${plan.hits}` : '';
    /* 落下也吃外型 —— 隕石可以是球、也可以是插下來的一根 */
    const shape = plan.delivery === 'travel' || plan.delivery === 'drop'
      ? SHAPE_LABEL[plan.shape] ?? ''
      : '';
    parts.push(DELIVERY_LABEL[plan.delivery] + shape + mul);
    if (plan.trailFx) parts.push(TRAIL_LABEL[plan.trailFx] ?? plan.trailFx);
  }
  /* 擋傷害那一類的 buff 演的是球，不是藍環 —— 表格要看得出差別 */
  parts.push(plan.shield
    ? SHIELD_LABEL[plan.shield] ?? plan.shield
    : LANDING_LABEL[plan.landing] + (plan.radiusTiles > 0 ? ` ${plan.radiusTiles}格` : ''));
  if (plan.emblem) parts.push(EMBLEM_LABEL[plan.emblem] ?? plan.emblem);
  return parts.join(' → ');
}

/**
 * 這一列可以切「齊射 ↔ 範圍爆」嗎（§ 48.7.4）。
 *
 * 只有目標中心的 AoE 有得選 —— 自身中心從腳下擴出去，沒有東西可以齊射；
 * 單體本來就只有一發。
 */
export function canToggleVolley(row: SkillRow): boolean {
  return row.skill.type === 'attack'
    && row.skill.target === 'aoe'
    /* 自身中心從腳下擴出去，沒有東西可以齊射或連鎖 */
    && row.skill.aoeCenter !== 'self';
}

/* ═══════════════════════════════════════════════════════════
   逐技能的演出覆寫（調校頁自己設）
   ═══════════════════════════════════════════════════════════ */

/**
 * 使用者在這頁可以自己決定的欄位。
 *
 * 其餘欄位（顏色、半徑、徽記、點綴…）**不開放編輯** ——
 * 那些是從資料推導出來的，手動指定只會跟資料走鐘。
 * 這裡開放的都是「資料上看不出來、只能逐個決定」的美術選擇。
 */
export type SkillFxEditable = Pick<
  SkillFxPlan,
  'cast' | 'delivery' | 'volley' | 'landing' | 'shape' | 'trailFx' | 'weapon' | 'chainStyle'
>;

export const EDITABLE_FIELDS: {
  key: keyof SkillFxEditable;
  label: string;
  options: { value: string; label: string }[];
}[] = [
  { key: 'cast', label: '起手', options: [
    { value: 'true', label: '演' }, { value: 'false', label: '不演' }] },
  { key: 'delivery', label: '送達', options: [
    { value: 'none', label: '沒有' }, { value: 'travel', label: '投射' },
    { value: 'drop', label: '落下' }, { value: 'melee', label: '揮擊' },
    { value: 'chain', label: '連鎖' }] },
  { key: 'shape', label: '投射／落下外型', options: [
    { value: 'circle', label: '球' }, { value: 'arrow', label: '箭' },
    { value: 'lance', label: '長槍' }] },
  { key: 'volley', label: '齊射', options: [
    { value: 'false', label: '否' }, { value: 'true', label: '是' }] },
  { key: 'chainStyle', label: '連鎖樣式', options: [
    { value: '', label: '（依元素）' },
    { value: 'bolt', label: '電弧' }, { value: 'bounce', label: '彈跳' }] },
  { key: 'trailFx', label: '途中', options: [
    { value: '', label: '沒有' }, { value: 'crack', label: '地裂' }] },
  { key: 'landing', label: '落點', options: [
    { value: 'impact', label: '命中' }, { value: 'burst', label: '範圍爆' },
    { value: 'nova', label: '自身爆' }, { value: 'pillar', label: '火柱' },
    { value: 'heal', label: '治癒' }, { value: 'aura', label: '施加' },
    { value: 'none', label: '（同普攻）' }] },
  { key: 'weapon', label: '武器動作', options: [
    { value: 'none', label: '不碰' }, { value: 'swing', label: '揮擊' },
    { value: 'shoot', label: '拉弓' }] },
];

/**
 * 覆寫存在 `localStorage`。
 *
 * **七十五個技能不可能一口氣調完** —— 沒有保存的話關掉分頁就白做，
 * 而「調到一半先去看別的」正是這種頁面最常見的用法。
 * 存在瀏覽器就好，不進 repo：這是調校過程的暫存，定案的是匯出的那張表。
 */
const STORAGE_KEY = 'mayana:skill-fx-overrides';

const overrides = new Map<string, Partial<SkillFxEditable>>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(overrides)));
  } catch {
    /* 無痕模式或配額滿 —— 存不了就算了，不要讓整頁掛掉 */
  }
}

function restore(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    for (const [id, ov] of Object.entries(JSON.parse(raw) as Record<string, Partial<SkillFxEditable>>)) {
      const row = SKILL_ROWS.find(r => r.skill.id === id);
      if (!row) continue;
      /*
       * **與推導結果相同的欄位要丟掉。**
       * 調校頁上調好的東西之後會被寫進 src 的覆寫表，那時本機這份就成了
       * 重複的殘留；不清掉的話「已經改過的技能數」會一直虛報。
       */
      const base = resolveSkillFxPlan(row.skill, fxContext);
      const kept = Object.fromEntries(
        Object.entries(ov).filter(([k, v]) => v !== base[k as keyof SkillFxEditable]),
      ) as Partial<SkillFxEditable>;
      if (Object.keys(kept).length) overrides.set(id, kept);
    }
  } catch {
    /* 壞掉的資料就當作沒有，不要卡住整頁 */
  }
}

/** 把覆寫套到推導出來的 plan 上，並修好會連動的欄位 */
function effectivePlan(row: SkillRow): SkillFxPlan {
  const base = resolveSkillFxPlan(row.skill, fxContext);
  const ov = overrides.get(row.skill.id);
  if (!ov || Object.keys(ov).length === 0) return base;

  const merged = { ...base, ...ov } as SkillFxPlan;
  /* 半徑只有「炸一片」的兩種用得到 —— 讓它跟著 landing 走，不用手動維護 */
  merged.radiusTiles = merged.landing === 'burst' || merged.landing === 'nova'
    ? (row.skill.aoeRadius ?? 0)
    : 0;
  /* 沒指定連鎖樣式就依元素推導 */
  if (merged.delivery === 'chain' && !merged.chainStyle) {
    merged.chainStyle = resolveChainStyle(row.skill.element);
  }
  return merged;
}

function refreshPlans(): void {
  for (const row of SKILL_ROWS) row.plan = effectivePlan(row);
}

export function getOverride(id: string): Partial<SkillFxEditable> {
  return overrides.get(id) ?? {};
}

export function setSkillOverride(id: string, patch: Partial<SkillFxEditable>): void {
  const row = SKILL_ROWS.find(r => r.skill.id === id);
  if (!row) return;
  const base = resolveSkillFxPlan(row.skill, fxContext);
  const next = { ...overrides.get(id), ...patch };
  /* 與推導結果相同的欄位就不留 —— 匯出的表要只有真正的例外 */
  for (const k of Object.keys(next) as (keyof SkillFxEditable)[]) {
    if (next[k] === base[k]) delete next[k];
  }
  if (Object.keys(next).length) overrides.set(id, next);
  else overrides.delete(id);
  row.plan = effectivePlan(row);
  persist();
}

export function resetSkillOverride(id: string): void {
  overrides.delete(id);
  const row = SKILL_ROWS.find(r => r.skill.id === id);
  if (row) row.plan = effectivePlan(row);
  persist();
}

export function resetAllOverrides(): void {
  overrides.clear();
  refreshPlans();
  persist();
}

/**
 * 把匯出的表貼回來。
 *
 * 兩種格式都吃：JSON，或匯出的那段 TypeScript ——
 * 只認得其中一種的話，使用者得先自己轉檔，那又是一個會出錯的步驟。
 */
export function importOverrides(text: string): { ok: number; skipped: string[] } {
  const skipped: string[] = [];
  let ok = 0;

  const apply = (id: string, ov: Partial<SkillFxEditable>) => {
    if (!SKILL_ROWS.some(r => r.skill.id === id)) { skipped.push(id); return; }
    overrides.set(id, ov);
    ok++;
  };

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    try {
      for (const [id, ov] of Object.entries(JSON.parse(trimmed) as Record<string, Partial<SkillFxEditable>>)) {
        apply(id, ov);
      }
    } catch {
      skipped.push('（JSON 解析失敗）');
    }
  } else {
    /* TypeScript 那段：一列一個 `'id': { k: v, ... },` */
    const re = /'([a-z-]+)'\s*:\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      const ov: Record<string, unknown> = {};
      for (const pair of m[2].split(',')) {
        const [k, ...rest] = pair.split(':');
        if (!k?.trim() || rest.length === 0) continue;
        const raw = rest.join(':').trim().replace(/^'|'$/g, '');
        ov[k.trim()] = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw;
      }
      apply(m[1], ov as Partial<SkillFxEditable>);
    }
  }

  refreshPlans();
  persist();
  return { ok, skipped };
}

export function overrideCount(): number {
  return overrides.size;
}

/**
 * 匯出**完整的**覆寫表，可以直接整份取代 `skillFxStyle.ts` 裡那一張。
 *
 * 這裡必須把 src 既有的那張一起併進來 —— 只倒「這次改的」的話，
 * 匯出的是一份**差異表**：貼回去會默默弄丟先前已經寫進 src 的決定，
 * 而且不會報錯，只會發現某幾個技能的演出「莫名其妙變回去了」。
 */
export function exportOverrides(): string {
  const merged = new Map<string, Record<string, unknown>>();
  for (const [id, ov] of Object.entries(SKILL_FX_OVERRIDES)) {
    merged.set(id, { ...(ov as Record<string, unknown>) });
  }
  for (const [id, ov] of overrides) {
    merged.set(id, { ...merged.get(id), ...(ov as Record<string, unknown>) });
  }
  if (merged.size === 0) return '// 目前沒有任何覆寫 —— 全部照推導的結果';

  /* 依技能表的順序輸出，比對兩個版本時才不會整份亂掉 */
  const order = new Map(SKILL_ROWS.map((r, i) => [r.skill.id, i]));
  const sorted = [...merged].sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));

  const lines = ['export const SKILL_FX_OVERRIDES: Record<string, SkillFxOverride> = {'];
  for (const [id, ov] of sorted) {
    const name = SKILL_ROWS.find(r => r.skill.id === id)?.skill.name ?? '';
    const body = Object.entries(ov)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? `'${v}'` : v}`)
      .join(', ');
    lines.push(`  '${id}': { ${body} },${' '.repeat(Math.max(1, 44 - id.length - body.length))}// ${name}`);
  }
  lines.push('};');
  return lines.join('\n');
}

/*
 * 開機時把上次調的東西讀回來。
 *
 * **必須放在 `overrides` 宣告之後** —— `const` 有 TDZ，
 * 提早呼叫會在載入時就整頁掛掉（而且只有「有存過東西」時才會炸，很難發現）。
 */
restore();
refreshPlans();

/**
 * 目標中心 AoE 的三段循環（§ 48.7.4）。
 *
 * 第一段是**預設**而不是「範圍爆」—— 有些技能的預設本來就不是炸一片
 * （煉獄火是火柱、震裂術是自身爆）。硬寫成 burst 的話，繞一圈回不到原點，
 * 會憑空留下一筆「把它改成範圍爆」的覆寫。
 */
export type AoeMode = 'base' | 'volley' | 'chain';

export function currentAoeMode(row: SkillRow): AoeMode {
  if (row.plan.delivery === 'chain') return 'chain';
  return row.plan.volley ? 'volley' : 'base';
}

export const AOE_MODE_LABEL: Record<AoeMode, string> = {
  base: '預設', volley: '齊射', chain: '連鎖',
};

/** 下一個模式 —— 三段循環，不用做三顆按鈕 */
export function nextAoeMode(mode: AoeMode): AoeMode {
  return mode === 'base' ? 'volley' : mode === 'volley' ? 'chain' : 'base';
}

/**
 * 在調校頁上把某個技能切成齊射／範圍爆。
 *
 * **只改這頁的 `SKILL_ROWS`，不動 `skillFxStyle.ts`** ——
 * 這頁的用途就是先在畫面上比出哪個對，定案後才把名單寫回 src。
 * 定案的名單按「匯出齊射名單」倒出來。
 */
export function setAoeMode(skillId: string, mode: AoeMode): void {
  const row = SKILL_ROWS.find(r => r.skill.id === skillId);
  if (!row || !canToggleVolley(row)) return;

  const base = resolveSkillFxPlan(row.skill, fxContext);

  if (mode === 'base') {
    /* 回到推導出來的樣子 —— 寫回基準值，`setSkillOverride` 會把它們剪掉 */
    setSkillOverride(skillId, {
      delivery: base.delivery, volley: base.volley, landing: base.landing,
    });
    return;
  }
  if (mode === 'chain') {
    setSkillOverride(skillId, { delivery: 'chain', volley: false, landing: 'impact' });
    return;
  }
  /*
   * **落下的技能切成齊射時不能被改成投射** —— 「從天而降」與「齊射／範圍爆」
   * 是兩個獨立的軸，切後者不該把前者洗掉。
   * 問基準值而不是查 `DROP_FX_SKILL_IDS`：覆寫表也會把技能設成落下。
   */
  setSkillOverride(skillId, {
    delivery: base.delivery === 'drop' ? 'drop' : 'travel',
    volley: true,
    landing: 'impact',
  });
}

/** 目前被切成齊射的技能 id —— 要寫回 `VOLLEY_FX_SKILL_IDS` 的那份名單 */
export function currentVolleyIds(): string[] {
  return SKILL_ROWS.filter(r => r.plan.volley).map(r => r.skill.id);
}

/** 目前被切成連鎖的技能 id —— 要寫回 `CHAIN_FX_SKILL_IDS` 的那份名單 */
export function currentChainIds(): string[] {
  return SKILL_ROWS.filter(r => r.plan.delivery === 'chain').map(r => r.skill.id);
}

/* ═══════════════════════════════════════════════════════════
   滑桿範圍（只有調校頁用得到）
   ═══════════════════════════════════════════════════════════ */

export interface SliderMeta { label: string; min: number; max: number; step: number }

const MS = (label: string, max = 1200): SliderMeta => ({ label, min: 60, max, step: 10 });
const PX = (label: string, max = 40): SliderMeta => ({ label, min: 0, max, step: 0.5 });
const TILES = (label: string, max = 2): SliderMeta => ({ label, min: 0, max, step: 0.05 });
const COUNT = (label: string, max = 12): SliderMeta => ({ label, min: 1, max, step: 1 });
const RATIO = (label: string, max = 1): SliderMeta => ({ label, min: 0, max, step: 0.01 });

export const SKILL_FX_PARAM_META: Record<SkillFxPrototype, Record<string, SliderMeta>> = {
  cast: {
    durationMs: MS('全長 ms', 800),
    r0: TILES('起始半徑 格'),
    r1: TILES('結束半徑 格'),
    lineW: PX('線寬', 8),
    alpha: RATIO('透明度'),
    spokes: COUNT('上升線數', 10),
    spokeLen: PX('上升線長', 30),
    spokeRise: PX('上升距離', 40),
    light: RATIO('高光（往白混）'),
  },
  travel: {
    trail: COUNT('拖尾點數', 12),
    trailGap: { label: '尾點間距', min: 0.005, max: 0.15, step: 0.005 },
    trailAlpha: RATIO('尾點透明度'),
    trailShrink: RATIO('尾端縮到幾成'),
    headSize: PX('彈丸半徑', 14),
    arrowLen: PX('箭矢長', 30),
    volleyStaggerMs: { label: '齊射錯開 ms', min: 0, max: 300, step: 5 },
    multiHitStaggerMs: { label: '多段錯開 ms', min: 0, max: 300, step: 5 },
    multiHitSpread: PX('多段上下錯開', 20),
    light: RATIO('高光（往白混）'),
    bounceArc: PX('彈跳拱起高度', 50),
  },
  impact: {
    durationMs: MS('全長 ms', 800),
    flashR: PX('中心閃點半徑', 24),
    ringR0: PX('環起始半徑', 24),
    ringR1: PX('環結束半徑', 60),
    ringW: PX('環寬', 8),
    sparks: COUNT('火花數', 12),
    sparkLen: PX('火花長', 40),
    sparkW: PX('火花寬', 6),
    critScale: { label: '暴擊放大', min: 1, max: 2.5, step: 0.05 },
    critRingT: RATIO('暴擊環佔比'),
    critRingW: PX('暴擊環寬', 8),
    hitShakePx: PX('命中抖動 px', 14),
    hitShakeMs: { label: '抖動長度 ms', min: 40, max: 400, step: 5 },
    critSpikes: COUNT('暴擊星芒數', 10),
    critSpikeLen: PX('星芒長', 80),
    critSpikeW: PX('星芒根部寬', 16),
    critSpikeT: RATIO('星芒佔全長'),
    critDurationMul: { label: '暴擊整段拉長倍率', min: 1, max: 2.5, step: 0.05 },
    light: RATIO('高光（往白混）'),
    accentRatio: RATIO('點綴火花佔比'),
    accentFlecks: COUNT('點綴小點數', 10),
    accentFleckR: PX('點綴小點半徑', 8),
    normalScale: { label: '普攻命中相對大小', min: 0.2, max: 1.2, step: 0.02 },
  },
  burst: {
    durationMs: MS('全長 ms'),
    rings: COUNT('環數', 5),
    ringDelay: RATIO('環間延遲'),
    ringW: PX('環寬', 8),
    flashR: PX('中心閃光半徑', 50),
    shards: COUNT('碎片數', 16),
    shardLen: PX('碎片長', 40),
    shardW: PX('碎片寬', 6),
    radiusMul: { label: '半徑倍率', min: 0.3, max: 2, step: 0.05 },
    light: RATIO('高光（往白混）'),
  },
  nova: {
    durationMs: MS('全長 ms'),
    rings: COUNT('環數', 6),
    ringDelay: RATIO('環間延遲'),
    ringW: PX('環寬', 8),
    flashR: PX('中心閃光半徑', 50),
    radiusMul: { label: '半徑倍率', min: 0.3, max: 2, step: 0.05 },
  },
  drop: {
    fallMs: MS('落下 ms', 900),
    fallFromY: { label: '起點高度 px', min: -600, max: -60, step: 10 },
    fallTiltX: { label: '起點側偏 px', min: -200, max: 200, step: 2 },
    telegraphR: TILES('預示環半徑 格', 3),
    telegraphW: PX('預示環寬', 8),
    headSize: PX('落下物半徑', 16),
    trail: COUNT('拖尾點數', 12),
    trailGap: { label: '尾點間距', min: 0.005, max: 0.15, step: 0.005 },
    volleyStaggerMs: { label: '齊射錯開 ms', min: 0, max: 400, step: 5 },
  },
  heal: {
    durationMs: MS('全長 ms', 1400),
    motes: COUNT('光點數', 14),
    moteR: PX('光點半徑', 8),
    rise: PX('上升距離', 80),
    spread: PX('散開距離', 40),
    ringR: TILES('腳下環半徑 格'),
    ringW: PX('腳下環寬', 8),
    light: RATIO('高光（往白混）'),
  },
  aura: {
    durationMs: MS('全長 ms', 900),
    r0: TILES('起始半徑 格'),
    r1: TILES('結束半徑 格'),
    lineW: PX('環寬', 8),
    rise: PX('環往上抬', 50),
    motes: COUNT('光點數', 10),
    moteR: PX('光點半徑', 8),
    light: RATIO('高光（往白混）'),
  },
  bolt: {
    durationMs: MS('全長 ms', 600),
    segments: COUNT('鋸齒段數', 16),
    jitter: PX('鋸齒歪多少', 20),
    lineW: PX('線粗', 8),
    crackleAt: RATIO('換形狀的時點'),
    glow: { label: '發光層數（0＝關）', min: 0, max: 6, step: 1 },
    glowWidthMul: { label: '發光加寬倍率', min: 1, max: 5, step: 0.1 },
    glowAlpha: { label: '發光透明度', min: 0, max: 0.6, step: 0.01 },
    light: RATIO('高光（往白混）'),
  },
  crack: {
    segments: COUNT('地縫節數', 20),
    jitter: PX('地縫歪多少', 20),
    lineW: PX('地縫粗細', 8),
    chips: COUNT('碎石數', 16),
    chipR: PX('碎石半徑', 6),
    fadeAt: RATIO('裂到底之後才淡'),
    light: RATIO('高光（往白混）'),
  },
  pillar: {
    durationMs: MS('全長 ms', 1200),
    height: PX('柱高', 120),
    width: PX('柱底寬', 60),
    riseT: RATIO('竄起佔比'),
    taper: RATIO('頂端收窄'),
    baseR: TILES('腳下環半徑 格'),
    baseW: PX('腳下環寬', 8),
    light: RATIO('高光（往白混）'),
  },
  emblem: {
    durationMs: MS('全長 ms', 2000),
    y: { label: '離頭頂 px', min: -70, max: 0, step: 1 },
    rise: PX('往上飄', 40),
    size: PX('符號高度', 40),
    formT: RATIO('浮出佔比'),
    holdT: RATIO('停留佔比'),
    fromScale: RATIO('浮出起始大小'),
    lineW: PX('線粗', 6),
    chevrons: COUNT('加速人字層數', 6),
    poisonFall: PX('水滴落下距離', 50),
    flameWobbles: COUNT('火焰抖動次數', 12),
    flameFlicker: { label: '火焰抖動幅度', min: 0, max: 0.5, step: 0.01 },
    labelH: PX('字母高', 30),
    labelW: PX('字母寬', 20),
    labelGap: PX('字距', 12),
    arrowGap: PX('箭頭離文字', 20),
    arrowW: PX('箭頭寬', 20),
    arrowH: PX('箭頭高', 30),
    labelStrokeW: PX('筆畫粗細', 6),
    glow: { label: '發光層數（0＝關）', min: 0, max: 6, step: 1 },
    glowWidthMul: { label: '發光加寬倍率', min: 1, max: 5, step: 0.1 },
    glowAlpha: { label: '發光透明度', min: 0, max: 0.6, step: 0.01 },
    light: RATIO('高光（往白混）'),
  },
  mark: {
    stars: COUNT('星星數', 6),
    starR: PX('星星半徑', 10),
    orbitR: PX('繞行半徑', 30),
    orbitMs: MS('繞一圈 ms', 3000),
    starY: { label: '星星高度 px', min: -70, max: 0, step: 1 },
  },
  shield: {
    durationMs: MS('全長 ms', 2000),
    r: PX('球半徑', 60),
    cy: { label: '球心高度 px', min: -60, max: 0, step: 1 },
    lineW: PX('線寬', 6),
    fillAlpha: { label: '球體填色', min: 0, max: 0.5, step: 0.01 },
    rimAlpha: RATIO('外框透明度'),
    equatorAlpha: RATIO('赤道／底環'),
    formT: RATIO('成形佔比'),
    holdT: RATIO('停留佔比'),
    expand: { label: '收掉時撐到幾倍', min: 1, max: 2.2, step: 0.05 },
    fromScale: RATIO('成形起始大小'),
    inlayW: PX('白色鑲邊寬（0＝關）', 6),
    inlayAlpha: RATIO('白色鑲邊透明度'),
    glow: { label: '發光層數（0＝關）', min: 0, max: 6, step: 1 },
    glowWidthMul: { label: '發光加寬倍率', min: 1, max: 5, step: 0.1 },
    glowAlpha: { label: '發光透明度', min: 0, max: 0.6, step: 0.01 },
  },
  dotTick: {
    durationMs: MS('全長 ms', 900),
    motes: COUNT('粒子數', 10),
    moteR: PX('粒子半徑', 8),
    rise: PX('上升距離', 50),
    spread: PX('散開距離', 30),
  },
};

/* ═══════════════════════════════════════════════════════════
   舞台
   ═══════════════════════════════════════════════════════════ */

/** 角色站原點；主目標在右前方四格，其餘怪散在它周圍供 AoE 用 */
const PLAYER_TILE = { x: 0, y: 0 };
const MONSTER_TILES = [
  { x: 4, y: 0 },   // 主目標
  { x: 5, y: 1 }, { x: 3, y: 1 }, { x: 5, y: -1 },
  { x: 6, y: 0 }, { x: 4, y: 2 }, { x: 2, y: -1 },
  { x: 6, y: 2 }, { x: 3, y: -2 }, { x: 7, y: 1 },
];

/**
 * 近戰技能時主目標站的位置 —— **貼著角色**。
 *
 * 留在四格外的話，武器在角色身邊揮、命中點在四格外亮，
 * 兩件事對不起來，就看不出「揮到底那一格才吃傷害」調得對不對。
 */
const MELEE_TILE = { x: 1, y: 0 };

/**
 * 並排比較時右邊那隻站的位置。
 *
 * 與主目標**同一條深度線**（`worldToScreen` 的 sy 相同：(4,0) 與 (5,−1) 都是 64）
 * —— 一高一低的話，兩邊的視角與遮擋條件不同，比出來的差別不能算數。
 * 距離也要夠近，不然放大之後右邊那隻會跑出畫面。
 */
const AB_TILE = { x: 5, y: -1 };

const DEMO_LOOK: PawnLook = {
  hair: 'twin',
  skin: '#e3b585',
  hairColor: '#6b4fa0',
  eyeColor: '#3a2f4a',
  cloth: '#8b6fc4',
  eyes: 'dots',
  lash: { ...DEFAULT_LASH, on: 1 },
  cap: resolveCapCfg('twin'),
};

/** 一次演出的重播資料 —— 倒帶要靠它從頭再跑一次 */
type Replay =
  | { kind: 'skill'; skillId: string; targets: number }
  | { kind: 'normal'; bow: boolean; crit: boolean }
  | {
      kind: 'proto'; prototype: SkillFxPrototype; color: number;
      radiusTiles: number; crit: boolean; markKind: MarkKind; shieldKind: ShieldKind;
      emblemKind: EmblemKind;
    };

export interface StageState {
  /** 這次演出總長（ms），時間軸的上限 */
  durationMs: number;
  /** 目前走到哪（ms） */
  elapsedMs: number;
  /** 場上的特效實例數 —— 效能預算看這個（§ 48.7.5） */
  activeCount: number;
}

export class SkillFxStage {
  readonly app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private fx = new SkillFxManager();
  private damage = new DamageNumberManager();
  private player!: PawnSprite;
  private monsters: MonsterEntity[] = [];
  private markHandles: number[] = [];

  private replay: Replay | null = null;
  private elapsed = 0;
  private duration = 1;

  /** 怪物數量：AoE 要看得出「一發打一片」，單體只留一隻比較乾淨 */
  private monsterCount = MONSTER_TILES.length;

  /** 手上拿什麼（只影響演出，不影響判定）。弓技一律用弓，不看這個 */
  weaponType: PawnWeaponType = 'sword';

  /** 自我檢查用：這一次演出起動過哪些武器動作 */
  readonly weaponActions: string[] = [];

  /**
   * 命中時被打的目標往後彈一下＋白閃（§ 48.7.6）。
   *
   * 兩者都走 `MonsterEntity.hit()`，與遊戲同一支。
   * 這裡是開關，不是另一套實作 —— 關掉只是這頁不觸發。
   */
  hitShake = false;
  /**
   * 命中後把怪演成倒下（§ 48.7.6 的死亡淡出）。
   *
   * **遊戲裡是「被打死才淡出」，這頁每一下都演** ——
   * 調校頁沒有血量，不這樣做就得等一隻怪真的死掉才看得到那三百毫秒。
   */
  deathFade = false;

  /**
   * 並排比較：同一個技能同時打兩隻怪，**左邊普通命中、右邊暴擊**。
   *
   * 先後點兩次是比不出幾百毫秒的差別的 —— 人的視覺記憶撐不了那幾秒。
   * 但也要記得：**如果並排才看得出來，遊戲裡就等於看不到** ——
   * 「終結技分檔」就是這樣被砍掉的。
   */
  abCompare = false;

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    await this.app.init({
      canvas,
      width,
      height,
      background: 0x0d0d20,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      autoStart: false,
    });

    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.world.addChild(this.ground);

    this.player = new PawnSprite(DEMO_LOOK, 0x4dabf7, 'front');
    this.player.container.zIndex = 100;
    this.world.addChild(this.player.container);

    for (let i = 0; i < MONSTER_TILES.length; i++) {
      const m = new MonsterEntity(`demo-${i}`);
      m.updatePosition(MONSTER_TILES[i]);
      m.updateHp(70, 100);
      this.world.addChild(m.container);
      this.monsters.push(m);
    }

    /* 特效與數字永遠壓在最上層 —— 被怪擋住就等於沒演 */
    this.fx.container.zIndex = 900;
    this.damage.container.zIndex = 1000;
    this.world.addChild(this.fx.container, this.damage.container);

    this.drawGround();
    this.layout(width, height);
    this.setMonsterCount(this.monsterCount);
    this.app.render();
  }

  /* ── 版面 ── */

  private zoom = 1;

  layout(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    /* 角色放在偏左，右邊留給半徑 10 格的自身中心爆 */
    this.world.x = width * 0.3;
    this.world.y = height * 0.55;
    this.app.render();
  }

  /**
   * 場景縮放。**只是放大鏡**，不是遊戲的鏡頭 ——
   * 遊戲一律 1:1，這裡放大是為了看清楚幾十 px 的火花與碎片。
   * 描邊寬度會跟著放大，那正是放大鏡該有的行為。
   */
  setZoom(z: number): void {
    this.zoom = z;
    this.world.scale.set(z);
    this.app.render();
  }

  get currentZoom(): number {
    return this.zoom;
  }

  private drawGround(): void {
    const g = this.ground;
    g.clear();
    for (let x = -5; x <= 11; x++) {
      for (let y = -8; y <= 8; y++) {
        const { sx, sy } = worldToScreen(x, y);
        const lit = (x + y) % 2 === 0;
        g.poly([
          sx, sy - TILE_H / 2,
          sx + TILE_W / 2, sy,
          sx, sy + TILE_H / 2,
          sx - TILE_W / 2, sy,
        ]).fill({ color: lit ? 0x1a1a35 : 0x16162e });
      }
    }
  }

  /* ── 播放 ── */

  /** 場上留幾隻怪。AoE 技能自動開到滿，單體技能收到一隻 */
  setMonsterCount(n: number): void {
    this.monsterCount = Math.max(1, Math.min(MONSTER_TILES.length, n));
    this.monsters.forEach((m, i) => { m.container.visible = i < this.monsterCount; });
  }

  /**
   * 近戰模式：主目標挪到貼身，其餘怪收起來。
   * 近戰技能都是單體的，留一排怪在後面只會干擾判讀。
   */
  /** 並排比較：把第二隻怪挪到對照位置 */
  private setAbStance(on: boolean): void {
    this.monsters[1].updatePosition(on ? AB_TILE : MONSTER_TILES[1]);
    if (on) this.monsters.forEach((m, i) => { m.container.visible = i < 2; });
    else this.monsters.forEach((m, i) => { m.container.visible = i < this.monsterCount; });
  }

  private meleeStance = false;

  private setMeleeStance(on: boolean): void {
    this.meleeStance = on;
    this.monsters[0].updatePosition(on ? MELEE_TILE : MONSTER_TILES[0]);
    if (on) this.monsters.forEach((m, i) => { m.container.visible = i === 0; });
    else this.monsters.forEach((m, i) => { m.container.visible = i < this.monsterCount; });
  }

  /** Debuff 染色（§ 48.8.2）—— 套在怪的容器上，不是 filter */
  setDebuffTint(tag: string | null): void {
    const color = tag ? (DEBUFF_TINT[tag] ?? 0xffffff) : 0xffffff;
    for (const m of this.monsters) m.container.tint = color;
    this.app.render();
  }

  /** 暈眩的頭頂星星（§ 48.8.3），掛在每一隻怪身上。傳 null 收掉 */
  setMark(kind: MarkKind | null): void {
    for (const h of this.markHandles) this.fx.stop(h);
    this.markHandles = [];
    if (!kind) {
      this.app.render();
      return;
    }
    for (let i = 0; i < this.monsterCount; i++) {
      const { sx, sy } = worldToScreen(MONSTER_TILES[i].x, MONSTER_TILES[i].y);
      this.markHandles.push(this.fx.spawn({ prototype: 'mark', x: sx, y: sy, markKind: kind }));
    }
    this.app.render();
  }

  /**
   * 護盾／無敵掛上去的那一下，罩在**角色自己**身上（§ 48.8.3）。
   *
   * 一次性 —— 球演完就沒了，護盾還在不在由 icon 表達。
   * 走時間軸播放，才能逐格看成形與收掉那兩段。
   */
  playShield(kind: ShieldKind): void {
    this.playPrototype({ prototype: 'shield', shieldKind: kind });
  }

  /** 播一個技能的完整序列 */
  playSkill(skillId: string, targets?: number): void {
    const row = SKILL_ROWS.find(r => r.skill.id === skillId);
    if (!row) return;
    /*
     * 打幾隻看**技能的 `maxTargets`**，不看 `plan.radiusTiles` ——
     * 齊射的 plan 沒有半徑（那是範圍爆才有的東西），拿它判會退回單體，
     * 火球就變成只丟一顆。`maxTargets` 空的是自身中心的無上限，吃場上人數。
     */
    const cap = row.skill.maxTargets ?? this.monsterCount;
    const wanted = targets
      ?? (row.skill.target === 'aoe' ? Math.min(this.monsterCount, cap) : 1);
    /* 連鎖要看得出「一隻接一隻」，場上至少留三隻 */
    if (row.plan.delivery === 'chain' && this.monsterCount < 3) this.setMonsterCount(3);
    /* 多段是同一個目標連吃好幾發 —— 場上不必多幾隻怪 */
    this.setMeleeStance(row.plan.delivery === 'melee');
    if (row.plan.delivery !== 'melee') this.setAbStance(this.abCompare);
    this.replay = { kind: 'skill', skillId, targets: wanted };
    this.restart();
  }

  /**
   * 播一次普通攻擊（§ 48.7.6）。
   *
   * 不是技能：沒有起手、沒有徽記，命中走最小型態。
   * 顏色吃「武器元素刻印 → 附魔 → 白」—— 冰刻印的劍砍下去命中點是淺藍的。
   */
  playNormalAttack(crit = false): void {
    this.replay = { kind: 'normal', bow: this.weaponType === 'bow', crit };
    this.setMeleeStance(this.weaponType !== 'bow');
    this.restart();
  }

  /** 單獨播一個原型，不走技能判定 */
  playPrototype(o: {
    prototype: SkillFxPrototype;
    color?: number;
    radiusTiles?: number;
    crit?: boolean;
    markKind?: MarkKind;
    shieldKind?: ShieldKind;
    emblemKind?: EmblemKind;
  }): void {
    this.replay = {
      kind: 'proto',
      prototype: o.prototype,
      color: o.color ?? 0xffffff,
      radiusTiles: o.radiusTiles ?? 4,
      crit: o.crit ?? false,
      markKind: o.markKind ?? 'stun',
      shieldKind: o.shieldKind ?? 'shield',
      emblemKind: o.emblemKind ?? 'sword',
    };
    this.restart();
  }

  private restart(): void {
    this.fx.clear();
    this.damage.clear();
    /* clear 把常駐的也收了，handle 一併作廢 —— 留著會讓下一次 stop 打到別人 */
    this.markHandles = [];
    this.weaponActions.length = 0;
    this.clearShakes();
    this.elapsed = 0;
    this.duration = this.spawnReplay();
    this.app.render();
  }

  /** 把 `replay` 重新丟一次進 manager，回傳整段長度 */
  private spawnReplay(): number {
    const r = this.replay;
    if (!r) return 1;

    if (r.kind === 'proto') {
      const proto = r.prototype;
      const target = worldToScreen(MONSTER_TILES[0].x, MONSTER_TILES[0].y);
      const self = worldToScreen(PLAYER_TILE.x, PLAYER_TILE.y);
      /* 罩在自己身上的幾種演在角色，其餘演在主目標 */
      const atSelf = proto === 'cast' || proto === 'nova' || proto === 'heal'
        || proto === 'travel' || proto === 'bolt' || proto === 'crack'
        || proto === 'shield' || proto === 'emblem';
      const anchor = atSelf ? self : target;

      this.fx.spawn({
        prototype: proto,
        x: anchor.sx,
        y: anchor.sy - (proto === 'impact' || proto === 'dotTick' ? TILE_H * 0.9 : 0),
        toX: target.sx,
        toY: target.sy - TILE_H * 0.9,
        color: r.color,
        radiusTiles: r.radiusTiles,
        crit: r.crit,
        markKind: r.markKind,
        shieldKind: r.shieldKind,
        emblemKind: r.emblemKind,
      });
      /* 常駐標記沒有「演完」，時間軸給它一個循環的長度 */
      return estimatePrototypeMs(proto);
    }

    if (r.kind === 'normal') {
      const bow = r.bow;
      const tile = bow ? MONSTER_TILES[0] : MELEE_TILE;
      const from = worldToScreen(PLAYER_TILE.x, PLAYER_TILE.y);
      const at = worldToScreen(tile.x, tile.y);
      const lift = TILE_H * 0.9;
      const plan = resolveNormalAttackFxPlan({ ranged: bow, bow }, fxContext);
      /* 與技能走同一支判定 —— 這頁不自己算發射點 */
      const muzzle = resolveMuzzleOffset({
        weaponAction: plan.weapon,
        aim: weaponAimFromDelta(tile.x - PLAYER_TILE.x, tile.y - PLAYER_TILE.y),
        shownWeapon: 'bow',
      });

      return playSkillFx(this.fx, {
        plan,
        fromX: from.sx, fromY: from.sy,
        muzzleX: from.sx + muzzle.x, muzzleY: from.sy + muzzle.y,
        toX: at.sx, toY: at.sy - lift,
        targets: [{
          x: at.sx, y: at.sy - lift,
          crit: r.crit,
          onLand: () => {
            this.damage.spawn(at.sx, at.sy - lift - 20, r.crit ? 24 : 12,
              r.crit ? 'crit' : 'normal');
            /*
             * 普攻也要彈 —— 玩家最常看到的就是這一下，沒有回饋等於沒打到。
             * 兩種都打 `monsters[0]`：近戰時它被挪到貼身那一格（`setMeleeStance`）。
             */
            if (this.hitShake) this.startShake(0, from, at);
            if (this.deathFade) this.monsters[0].die();
          },
        }],
        onWeaponAction: kind => this.playWeapon(kind, tile),
        weaponStrikeMs: this.weaponStrikeMs(bow ? 'bow' : this.weaponType),
      });
    }

    const row = SKILL_ROWS.find(x => x.skill.id === r.skillId);
    if (!row) return 1;
    const plan = row.plan;
    const from = worldToScreen(PLAYER_TILE.x, PLAYER_TILE.y);

    /* 治癒與 buff 演在自己身上；其餘演在怪身上 */
    const onSelf = plan.landing === 'heal' || plan.landing === 'aura';
    const tiles = onSelf
      ? [PLAYER_TILE]
      : plan.delivery === 'melee'
        ? [MELEE_TILE]
        : MONSTER_TILES.slice(0, Math.min(r.targets, this.monsterCount));
    const main = worldToScreen(tiles[0].x, tiles[0].y);
    /*
     * 命中點抬到身體高度 —— 貼著地面的火花讀起來像踩到地雷。
     * **但貼地的演出不能抬**：藍環、球形罩、治癒的腳下環都是以腳底為原點畫的
     * （`drawSkillFx.ts` 的 `groundRing` 一律畫在局部 y=0），
     * 抬上去就會整組浮到頭頂。
     */
    const bodyLift = onSelf ? 0 : TILE_H * 0.9;

    /*
     * 多段（三連射）是**同一個目標連吃 N 發**，所以要給 N 個落點資料
     * —— 每一發各自判定命中，數字也各跳一個。
     */
    /* 並排比較：多打一隻，左邊普通、右邊暴擊。連鎖有自己的隊形，不併進來 */
    const abOn = this.abCompare && plan.landing === 'impact'
      && plan.hits === 1 && plan.delivery !== 'chain' && !onSelf;
    const hitTiles = plan.hits > 1
      ? Array.from({ length: plan.hits }, () => tiles[0])
      : abOn ? [MONSTER_TILES[0], AB_TILE] : tiles;

    const targets = hitTiles.map((t, i) => {
      const p = worldToScreen(t.x, t.y);
      /* 並排比較時左邊固定普通、右邊固定暴擊；其餘情況主目標暴擊 */
      const isCrit = onSelf ? false : abOn ? i === 1 : i === 0;
      const monsterIdx = onSelf ? -1
        : abOn ? i
        : MONSTER_TILES.findIndex(m => m.x === t.x && m.y === t.y);
      return {
        x: p.sx,
        y: p.sy - bodyLift,
        crit: isCrit,
        onLand: () => {
          this.spawnDemoNumber(row.skill, p.sx, p.sy - bodyLift, isCrit);
          /* **每一下命中都彈**，暴擊不加碼（它已經有星芒與衝擊環） */
          if (this.hitShake && monsterIdx >= 0) this.startShake(monsterIdx, from, p);
          /* 死亡淡出：這頁每一下都演，才不用等怪真的死掉 */
          if (this.deathFade && monsterIdx >= 0) this.monsters[monsterIdx].die();
        },
      };
    });

    /*
     * 發射點走 `resolveMuzzleOffset()`，**這頁不自己判斷** ——
     * 遊戲那邊是同一支函式。各判各的就會出現「調校頁看起來對、
     * 進遊戲卻從別的地方射出來」，而那種差異只有貼身打才看得出來。
     */
    const muzzle = resolveMuzzleOffset({
      weaponAction: plan.weapon,
      aim: weaponAimFromDelta(tiles[0].x - PLAYER_TILE.x, tiles[0].y - PLAYER_TILE.y),
      shownWeapon: 'bow',
    });

    return playSkillFx(this.fx, {
      plan,
      /* 腳下 —— 起手環畫在這裡 */
      fromX: from.sx,
      fromY: from.sy,
      /* 箭從弓上出去，起手環不跟著跑 */
      muzzleX: from.sx + muzzle.x,
      muzzleY: from.sy + muzzle.y,
      toX: main.sx,
      toY: onSelf ? main.sy : main.sy - bodyLift,
      targets,
      onWeaponAction: kind => this.playWeapon(kind, tiles[0]),
      weaponStrikeMs: this.weaponStrikeMs(plan.weapon === 'shoot' ? 'bow' : this.weaponType),
      /* 命中點抬在身體高度，火柱要落回腳下 */
      groundLift: bodyLift,
    });
  }

  /**
   * 起動 § 48.6 的武器演出 —— 這頁不另做動作，
   * 直接叫既有的 `PawnSprite.attack()`，跟遊戲裡是同一支。
   *
   * `weaponAimFromDelta()` 吃的是**世界格位移**（它自己會投影到螢幕），
   * 先換成螢幕座標再傳進去會投影兩次，武器就會揮到別的方向。
   */
  private playWeapon(kind: 'swing' | 'shoot' | 'none', targetTile: { x: number; y: number }): void {
    if (kind === 'none') return;
    const aim = weaponAimFromDelta(targetTile.x - PLAYER_TILE.x, targetTile.y - PLAYER_TILE.y);
    if (aim === null) return;

    this.weaponActions.push(kind);
    this.player.attack({
      /* 弓技一律用弓，不看「手上拿什麼」—— 技能自己要求了（requiredWeaponType） */
      type: kind === 'shoot' ? 'bow' : this.weaponType,
      material: 'iron',
      aim,
      attackIntervalMs: 1200,
    });
  }

  /**
   * 受擊反應歸零（重播時）。
   *
   * 位置由 `MonsterEntity.update()` 自己疊回基準，這裡只要把基準設對 ——
   * 近戰與並排比較都會把怪挪走，直接查 `MONSTER_TILES` 會把它彈回原格。
   */
  private clearShakes(): void {
    this.monsters.forEach((m, idx) => {
      m.updatePosition(this.monsterTile(idx));
      m.revive();
    });
  }

  /** 這隻怪現在站哪（世界格） */
  private monsterTile(idx: number): { x: number; y: number } {
    if (idx === 0 && this.meleeStance) return MELEE_TILE;
    if (idx === 1 && this.abCompare) return AB_TILE;
    return MONSTER_TILES[idx];
  }

  /**
   * 命中抖動＋白閃：往「遠離施法者」的方向彈 —— 被打飛才是那個方向。
   *
   * **走 `MonsterEntity.hit()`，這頁不自己算** —— 遊戲裡是同一支，
   * 各算各的就會出現「調校頁調好了、進遊戲彈的量不一樣」。
   */
  private startShake(
    idx: number,
    from: { sx: number; sy: number },
    at: { sx: number; sy: number },
  ): void {
    this.monsters[idx].hit(at.sx - from.sx, at.sy - from.sy);
  }

  /** 每幀推進受擊反應。位置的疊加在 `MonsterEntity.update()` 裡 */
  private stepShakes(deltaMs: number): void {
    for (const m of this.monsters) m.update(deltaMs);
  }

  /** 這把武器「打到／放出去」的時點（ms）：揮到底、或弓放箭那一格 */
  private weaponStrikeMs(type: PawnWeaponType): number {
    const m = WEAPON_ART[type].motion;
    return weaponPlaybackMs(m, 1200) * m.tStrike;
  }

  get weaponLabel(): string {
    return WEAPON_ART[this.weaponType].label;
  }

  private spawnDemoNumber(skill: Omit<Skill, 'lastUsedAt'>, x: number, y: number, crit: boolean): void {
    if (skill.type === 'heal') {
      this.damage.spawn(x, y - 20, skill.healAmount ?? 0, 'heal');
      return;
    }
    if (skill.type === 'buff') return;

    /* 數字只是佔位 —— 傷害公式不在特效的職責內（§ 48.1） */
    const base = Math.round(skill.power * (0.85 + Math.random() * 0.3)) || 1;
    const type = crit ? 'crit' : skill.element !== 'none' ? 'element' : 'skill';
    this.damage.spawn(x, y - 20, crit ? base * 2 : base, type);
  }

  /* ── 時間軸 ── */

  /** 往前推。`speed` 由呼叫端先乘好 */
  step(deltaMs: number): void {
    this.elapsed += deltaMs;
    this.fx.update(deltaMs);
    this.damage.update(deltaMs);
    this.player.update(deltaMs);
    this.stepShakes(deltaMs);
    this.app.render();
  }

  /**
   * 倒帶到任一毫秒。
   *
   * manager 只能往前推（它就是這樣接進遊戲的），所以倒帶＝**整段重播再快轉**。
   * 用固定 16ms 的步長走完，而不是一次 `update(ms)` ——
   * 一大步會讓「起手還沒演完就接飛行」這種接力全部擠在同一幀，看不出時序。
   */
  seek(ms: number): void {
    this.fx.clear();
    this.damage.clear();
    this.elapsed = 0;
    this.duration = this.spawnReplay();
    const STEP = 16;
    for (let t = 0; t < ms; t += STEP) {
      const dt = Math.min(STEP, ms - t);
      this.elapsed += dt;
      this.fx.update(dt);
      this.damage.update(dt);
      this.player.update(dt);
      this.stepShakes(dt);
    }
    this.app.render();
  }

  /**
   * 角色剪影在世界座標的外框（相對腳下原點）。
   * 調球形罩、徽記高度時要對得上剪影，用量的不要用猜的。
   */
  get pawnBounds(): { top: number; bottom: number; left: number; right: number } {
    const b = this.player.container.getLocalBounds();
    return { top: b.minY, bottom: b.maxY, left: b.minX, right: b.maxX };
  }

  /**
   * 目前每一個特效實例的位置與外框大小（世界 px）。
   *
   * 並排比較時「哪一邊比較大」用量的，不用目測 ——
   * 400ms 的東西靠眼睛比，比出來的結論不可靠。
   */
  get fxBounds(): { x: number; w: number; h: number; top: number; bottom: number }[] {
    return this.fx.container.children.map(c => {
      const b = c.getLocalBounds();
      return {
        x: Math.round(c.x),
        w: Math.round(b.maxX - b.minX),
        h: Math.round(b.maxY - b.minY),
        /* 上下緣：驗「由下往上消失」這種事需要它，只看高度看不出往哪邊縮 */
        top: Math.round(b.minY),
        bottom: Math.round(b.maxY),
      };
    });
  }

  get state(): StageState {
    return {
      durationMs: this.duration,
      elapsedMs: this.elapsed,
      activeCount: this.fx.activeCount,
    };
  }

  get finished(): boolean {
    return this.elapsed >= this.duration;
  }
}

/**
 * 單獨播一個原型時的時間軸長度。
 * 這些原型平常是接力的一環，自己播沒有「整段」的概念，取它自己的設計時長。
 */
function estimatePrototypeMs(proto: SkillFxPrototype): number {
  const a = SKILL_FX_ART;
  switch (proto) {
    case 'cast': return a.cast.durationMs;
    case 'travel': return 700;
    case 'bolt': return a.bolt.durationMs;
    case 'crack': return 700;
    case 'pillar': return a.pillar.durationMs;
    case 'impact': return a.impact.durationMs;
    case 'burst': return a.burst.durationMs;
    case 'nova': return a.nova.durationMs;
    case 'drop': return a.drop.fallMs;
    case 'heal': return a.heal.durationMs;
    case 'aura': return a.aura.durationMs;
    case 'emblem': return a.emblem.durationMs;
    case 'dotTick': return a.dotTick.durationMs;
    case 'mark': return a.mark.orbitMs;
    case 'shield': return a.shield.durationMs;
  }
}
