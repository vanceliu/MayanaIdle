/**
 * 星盤第一版測試盤面（`56-star-chart.md` § 56.6）。數值全部暫定。
 * 座標：原點為盤面中心，角度 0° 朝上、順時針。
 */

export type ClassId = 'knight' | 'rogue' | 'elf' | 'elementalist' | 'priest';
export type NodeKind = 'start' | 'point' | 'constellation' | 'keystone';
export type AttrKey = 'str' | 'agi' | 'vit' | 'spi' | 'int' | 'cha';

/** 可加總的效果；同 key 相加 */
export interface StatEffect {
  key: string;
  label: string;
  value: number;
  unit: '' | '%';
}

export interface StarNode {
  id: string;
  name: string;
  kind: NodeKind;
  x: number;
  y: number;
  effects: StatEffect[];
  /** 命星的規則效果與代價，不加總 */
  rules?: string[];
  /** 星點也顯示名稱 */
  showLabel?: boolean;
  /** 起點與職業魔法節點所屬職業 */
  classId?: ClassId;
}

export interface StarChart {
  nodes: StarNode[];
  edges: [string, string][];
}

export const CLASS_ORDER: ClassId[] = ['knight', 'rogue', 'elf', 'elementalist', 'priest'];

export const CLASS_NAME: Record<ClassId, string> = {
  knight: '騎士', rogue: '盜賊', elf: '妖精', elementalist: '元素師', priest: '牧師',
};

const ATTR_NAME: Record<AttrKey, string> = {
  str: '力量', agi: '敏捷', vit: '體質', spi: '精神', int: '智力', cha: '魅力',
};

/** 星點單一效果的數值（暫定）；星座等大節點以倍數 n 取用 */
export const STAR_POINT_VALUE = {
  attr: 1, hpPct: 1, mpPct: 1, defPct: 1, hit: 1, evasion: 50, atkPct: 1, matkPct: 1,
  skillCd: 10,
} as const;

const attr = (a: AttrKey, n = 1): StatEffect => ({ key: `attr:${a}`, label: ATTR_NAME[a], value: n * STAR_POINT_VALUE.attr, unit: '' });
const hp = (n = 1): StatEffect => ({ key: 'hpPct', label: '最大 HP', value: n * STAR_POINT_VALUE.hpPct, unit: '%' });
const mp = (n = 1): StatEffect => ({ key: 'mpPct', label: '最大 MP', value: n * STAR_POINT_VALUE.mpPct, unit: '%' });
const def = (n = 1): StatEffect => ({ key: 'defPct', label: '防禦力', value: n * STAR_POINT_VALUE.defPct, unit: '%' });
const hit = (n = 1): StatEffect => ({ key: 'hit', label: '命中', value: n * STAR_POINT_VALUE.hit, unit: '%' });
const eva = (n = 1): StatEffect => ({ key: 'evasion', label: '迴避值', value: n * STAR_POINT_VALUE.evasion, unit: '' });
const atk = (n = 1): StatEffect => ({ key: 'atkPct', label: '攻擊力', value: n * STAR_POINT_VALUE.atkPct, unit: '%' });
const matk = (n = 1): StatEffect => ({ key: 'matkPct', label: '魔法攻擊', value: n * STAR_POINT_VALUE.matkPct, unit: '%' });
const skillCd = (skill: string): StatEffect =>
  ({ key: `skill:${skill}:cd`, label: `${skill} 冷卻`, value: -STAR_POINT_VALUE.skillCd, unit: '%' });
const skillLevel = (skill: string): StatEffect =>
  ({ key: `skill:${skill}:level`, label: `${skill} 等級`, value: 1, unit: '' });
/** 基礎魔法三系（`56-star-chart.md` § 56.5） */
export type MagicSystem = '攻擊' | '回復' | '護盾';
const magicLevel = (system: MagicSystem): StatEffect =>
  ({ key: `magic:${system}魔法系:level`, label: `${system}魔法系 等級`, value: 1, unit: '' });

/** 職業技能等級上限（`56-star-chart.md` § 56.5） */
export const SKILL_LEVEL_CAP = 3;

/** 沒有星盤節點的職業技能，位置改放屬性星點 */
const NO_STAR_NODE_SKILLS = new Set(['閃避反擊', '冷卻縮減']);

/** 單一生存數值的星點輪替 */
const UTILITY_CYCLE: (() => StatEffect)[] = [() => hp(), () => mp(), () => def(), () => hit(), () => eva()];

interface ClassConfig {
  attrs: [AttrKey, AttrKey];
  magic: string[];
  hub: string;
  sides: [string, string];
  wheels: [{ name: string; point: StatEffect; star: StatEffect[] }, { name: string; point: StatEffect; star: StatEffect[] }];
  offense: (n?: number) => StatEffect;
  keystone: { name: string; rules: string[] };
}

const CLASS_CONFIG: Record<ClassId, ClassConfig> = {
  knight: {
    attrs: ['str', 'vit'],
    magic: ['盾擊', '裂傷斬', '鋼鐵護盾', '挑釁怒吼', '衝鋒突進', '血濺咒殺', '復仇之刃'],
    hub: '鐵誓座',
    sides: ['戰鎚座', '巨岩座'],
    wheels: [
      { name: '堅盾座', point: def(), star: [def(2), hp(2), attr('vit', 2)] },
      { name: '烈心座', point: hp(), star: [hp(2), atk(2), attr('str', 2)] },
    ],
    offense: atk,
    keystone: { name: '不屈之星', rules: ['受到傷害 -5%', '跑速 -5%'] },
  },
  rogue: {
    attrs: ['agi', 'str'],
    magic: ['淬毒', '致命一擊', '煙霧彈', '精準打擊', '背刺', '毒霧', '閃避反擊'],
    hub: '暗影座',
    sides: ['疾風座', '利爪座'],
    wheels: [
      { name: '幻步座', point: eva(), star: [eva(2), hit(2), attr('agi', 2)] },
      { name: '毒牙座', point: atk(), star: [atk(2), hit(2), attr('str', 2)] },
    ],
    offense: atk,
    keystone: { name: '影刃之星', rules: ['爆擊率 +5%', '最大 HP -8%'] },
  },
  elf: {
    attrs: ['agi', 'spi'],
    magic: ['精準射擊', '火矢附魔', '三連射', '鷹眼', '束縛箭', '後躍射擊', '穿透箭雨'],
    hub: '森羽座',
    sides: ['獵弓座', '林語座'],
    wheels: [
      { name: '遠眺座', point: hit(), star: [hit(2), atk(2), attr('agi', 2)] },
      { name: '露泉座', point: mp(), star: [mp(2), eva(2), attr('spi', 2)] },
    ],
    offense: atk,
    keystone: { name: '鷹隼之星', rules: ['遠程攻擊力 +8%', '防禦 -10%'] },
  },
  elementalist: {
    attrs: ['int', 'spi'],
    magic: ['冷卻縮減', '魔力奪取', '元素增幅', '強化冷卻縮減', '魔力護盾', '魔力湧泉', '元素風暴'],
    hub: '元素座',
    sides: ['秘法座', '星泉座'],
    wheels: [
      { name: '奧識座', point: matk(), star: [matk(2), mp(2), attr('int', 2)] },
      { name: '靈壁座', point: mp(), star: [mp(2), hp(2), attr('spi', 2)] },
    ],
    offense: matk,
    keystone: { name: '奧能之星', rules: ['魔法攻擊 +10%', '最大 HP -10%'] },
  },
  priest: {
    attrs: ['int', 'vit'],
    magic: ['聖光護盾', '精神匯聚', '群體治癒', '聖光審判', '血魔轉換', '神聖懲擊', '神聖領域'],
    hub: '聖光座',
    sides: ['禱言座', '庇護座'],
    wheels: [
      { name: '慈光座', point: matk(), star: [matk(2), mp(2), attr('int', 2)] },
      { name: '守望座', point: def(), star: [def(2), hp(2), attr('vit', 2)] },
    ],
    offense: matk,
    keystone: { name: '聖誓之星', rules: ['治癒量 +12%', '魔法攻擊 -8%'] },
  },
};

/** 中環橋接星座，依 CLASS_ORDER 相鄰順序（騎士・盜賊起） */
const BRIDGE_NAMES = ['劍刃座', '疾影座', '靈風座', '星輝座', '守誓座'];

const CENTER_KEYSTONES = [
  { angle: 0, name: '血契之星', path: mp(), rules: ['技能耗魔改扣等量 HP', '最大 MP -50%'] },
  { angle: 120, name: '均衡之星', path: hp(), rules: ['六屬性各 +2', '最大 HP、最大 MP 各 -5%'] },
  { angle: 240, name: '堅忍之星', path: def(), rules: ['最大 HP +12%', '迴避 -25%'] },
];

export const CLASS_ANGLE = (c: ClassId): number => CLASS_ORDER.indexOf(c) * 72;

function polar(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.round(r * Math.sin(rad)), y: Math.round(-r * Math.cos(rad)) };
}

export function buildStarChart(): StarChart {
  const nodes: StarNode[] = [];
  const edges: [string, string][] = [];

  const add = (id: string, name: string, kind: NodeKind, r: number, deg: number, effects: StatEffect[], extra: Partial<StarNode> = {}): string => {
    nodes.push({ id, name, kind, ...polar(r, deg), effects, ...extra });
    return id;
  };
  const link = (a: string, b: string) => edges.push([a, b]);
  const pointName = (effects: StatEffect[]) => effects.map(e => e.label).join('、');

  // 內環 r=180，10 個星點
  const ring: string[] = [];
  for (let k = 0; k < 10; k++) {
    const e = UTILITY_CYCLE[k % UTILITY_CYCLE.length]();
    ring.push(add(`ring-${k}`, pointName([e]), 'point', 180, k * 36, [e]));
  }
  ring.forEach((id, k) => link(id, ring[(k + 1) % ring.length]));

  // 中央命星支線
  for (const ks of CENTER_KEYSTONES) {
    const p = add(`center-${ks.angle}-p`, pointName([ks.path]), 'point', 138, ks.angle, [ks.path]);
    const k = add(`center-${ks.angle}-k`, ks.name, 'keystone', 92, ks.angle, [], { rules: ks.rules });
    link(ring[Math.round(ks.angle / 36) % ring.length], p);
    link(p, k);
  }
  // 中央基礎魔法三系：與命星每 60° 交錯；內環 → 等級 +1（r138）→ 等級 +1（r95）
  for (const [system, angle] of [['攻擊', 60], ['回復', 180], ['護盾', 300]] as const) {
    const p = add(`magic-${angle}-1`, `${system}魔法系 等級 +1`, 'point', 138, angle, [magicLevel(system)]);
    const s = add(`magic-${angle}-2`, `${system}魔法系`, 'point', 95, angle, [magicLevel(system)], { showLabel: true });
    link(ring[Math.round(angle / 36) % ring.length], p);
    link(p, s);
  }

  const midRing: string[] = [];
  for (const c of CLASS_ORDER) {
    const cfg = CLASS_CONFIG[c];
    const t = CLASS_ANGLE(c);
    const [a1, a2] = cfg.attrs;

    const start = add(`${c}-start`, `${CLASS_NAME[c]}起點`, 'start', 420, t, [attr(a1, 2), attr(a2, 2)], { classId: c });

    // 往內：起點 → r360 → r300（中環）→ r240 → 內環
    const r360 = add(`${c}-r360`, pointName([attr(a1)]), 'point', 360, t, [attr(a1)]);
    const r300 = add(`${c}-r300`, pointName([hp()]), 'point', 300, t, [hp()]);
    const r240 = add(`${c}-r240`, pointName([cfg.offense()]), 'point', 240, t, [cfg.offense()]);
    link(start, r360);
    link(r360, r300);
    link(r300, r240);
    link(r240, ring[t / 36]);
    midRing.push(r300);

    // 內側小輪：r240 兩側
    cfg.wheels.forEach((w, i) => {
      const s = i === 0 ? -1 : 1;
      const p = add(`${c}-wheel${i}-p`, pointName([w.point]), 'point', 240, t + s * 13, [w.point]);
      const st = add(`${c}-wheel${i}-s`, w.name, 'constellation', 232, t + s * 27, w.star);
      link(r240, p);
      link(p, st);
    });

    // 兩側屬性群：起點 → ±9 → ±17 → ±25 星座
    cfg.sides.forEach((name, i) => {
      const s = i === 0 ? -1 : 1;
      const a = cfg.attrs[i];
      const p1 = add(`${c}-side${i}-1`, pointName([attr(a)]), 'point', 430, t + s * 9, [attr(a)]);
      const p2 = add(`${c}-side${i}-2`, pointName([attr(a)]), 'point', 430, t + s * 17, [attr(a)]);
      const st = add(`${c}-side${i}-s`, name, 'constellation', 435, t + s * 25, i === 0 ? [attr(a, 2), cfg.offense(2), hit(2)] : [attr(a, 2), hp(2), mp(2)]);
      link(start, p1);
      link(p1, p2);
      link(p2, st);
    });

    // 職業魔法扇區：起點 → r480 → 星座 r545 → 7 組（強化 r615 → 等級 r680 → 強化 r745 → 等級 r810）→ 命星 r880
    const out = add(`${c}-r480`, pointName([cfg.offense()]), 'point', 480, t, [cfg.offense()]);
    const hub = add(`${c}-hub`, cfg.hub, 'constellation', 545, t, [cfg.offense(2), attr(a1, 2), attr(a2, 2)]);
    link(start, out);
    link(out, hub);
    const levelNodes: string[] = [];
    cfg.magic.forEach((skill, i) => {
      const deg = t + (i - 3) * 8;
      let prev = hub;
      [615, 680, 745, 810].forEach((r, k) => {
        const isLevel = k % 2 === 1;
        const id = NO_STAR_NODE_SKILLS.has(skill)
          ? add(`${c}-magic${i}-attr${k}`, pointName([attr(cfg.attrs[k % 2])]), 'point', r, deg, [attr(cfg.attrs[k % 2])])
          : add(`${c}-magic${i}-${isLevel ? 'level' : 'boost'}${k >> 1}`,
            isLevel ? `${skill} 等級 +1` : `${skill} 強化`, 'point', r, deg,
            [isLevel ? skillLevel(skill) : skillCd(skill)], { classId: c });
        link(prev, id);
        prev = id;
      });
      levelNodes.push(prev);
    });
    const ks = add(`${c}-keystone`, cfg.keystone.name, 'keystone', 880, t, [], { rules: cfg.keystone.rules });
    link(levelNodes[3], ks);
  }

  // 中環橋接（r300，相鄰職業之間 5 點，中間為雙屬性星座）與外側橋接（r470）
  CLASS_ORDER.forEach((c, i) => {
    const next = CLASS_ORDER[(i + 1) % CLASS_ORDER.length];
    const t = CLASS_ANGLE(c);
    const a = CLASS_CONFIG[c].attrs[0];
    const b = CLASS_CONFIG[next].attrs[0];
    const mid = [
      add(`bridge${i}-1`, pointName([attr(a)]), 'point', 300, t + 12, [attr(a)]),
      add(`bridge${i}-2`, pointName([hp()]), 'point', 300, t + 24, [hp()]),
      add(`bridge${i}-3`, BRIDGE_NAMES[i], 'constellation', 300, t + 36,
        a === b ? [attr(a, 2), hp(2), mp(2)] : [attr(a, 2), attr(b, 2), hp(2)]),
      add(`bridge${i}-4`, pointName([mp()]), 'point', 300, t + 48, [mp()]),
      add(`bridge${i}-5`, pointName([attr(b)]), 'point', 300, t + 60, [attr(b)]),
    ];
    link(midRing[i], mid[0]);
    mid.slice(1).forEach((id, k) => link(mid[k], id));
    link(mid[4], midRing[(i + 1) % midRing.length]);

    const outerEffect = i % 2 === 0 ? hit() : eva();
    const outer = add(`outer${i}`, pointName([outerEffect]), 'point', 470, t + 36, [outerEffect]);
    link(`${c}-side1-s`, outer);
    link(outer, `${next}-side0-s`);

  });

  return { nodes, edges };
}

/** 洗點費用：每退一點＝角色等級 × 1000 金幣 */
export const refundCostPerPoint = (level: number): number => level * 1000;

export const LEVEL_CAP = 120;
/** 星盤開放等級；Lv N 共 N − STAR_CHART_UNLOCK_LEVEL + 1 點 */
export const STAR_CHART_UNLOCK_LEVEL = 30;
export const starPoints = (level: number): number => Math.max(0, level - STAR_CHART_UNLOCK_LEVEL + 1);

