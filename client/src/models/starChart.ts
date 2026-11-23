/**
 * 星盤（`56-star-chart.md`）：盤面、點數、配點／退點與效果加總。
 *
 * 純資料與純函式；角色上只存已點節點 id，效果一律由這裡即時算出。
 * 座標：原點為盤面中心，角度 0° 朝上、順時針（§ 56.6）。
 */
import type { Attributes } from './attributes';
import { ATTRIBUTE_NAMES_ZH } from './attributes';
import type { ClassName } from './character';
import { CLASS_SKILLS } from './classSkills';

export type StarNodeKind = 'start' | 'point' | 'constellation' | 'keystone';
/** 命星的規則效果（不是數值，不加總） */
export type StarFlag = 'bloodPact' | 'manaBurn';

/** 可加總的效果；同 key 相加（§ 56.4） */
export interface StarEffect {
  key: string;
  label: string;
  value: number;
  unit: '' | '%';
  /** 取代「名稱 數值」的顯示文字 */
  text?: string;
}

export interface StarNode {
  id: string;
  name: string;
  kind: StarNodeKind;
  x: number;
  y: number;
  effects: StarEffect[];
  flags?: StarFlag[];
  /** 星點也顯示名稱 */
  showLabel?: boolean;
  /** 起點與職業魔法節點所屬職業 */
  classId?: ClassName;
}

export const STAR_FLAG_LABEL: Record<StarFlag, string> = {
  bloodPact: '技能耗魔改扣等量 HP',
  manaBurn: '技能耗魔 +30%',
};


/** 職業起點相鄰順序（§ 56.2） */
export const STAR_CLASS_ORDER: ClassName[] = ['knight', 'thief', 'elf', 'elementalist', 'priest'];

/** 星盤開放等級；Lv N 共 N − 29 點，開放那一點固定點在起點（§ 56.1） */
export const STAR_CHART_UNLOCK_LEVEL = 30;
/** 命星同時最多點幾顆（§ 56.6） */
export const KEYSTONE_CAP = 3;
/** 技能等級上限（§ 56.5） */
export const STAR_SKILL_LEVEL_CAP = 3;

export const starPoints = (level: number): number => Math.max(0, level - STAR_CHART_UNLOCK_LEVEL + 1);
/** 洗點費用：每退一點＝角色等級 × 1000 金幣（§ 56.7） */
export const starRefundCostPerPoint = (level: number): number => level * 1000;
export const starStartNodeId = (cls: ClassName): string => `${cls}-start`;

/** 星點單一效果的數值；星座以倍數取用（§ 56.6） */
export const STAR_POINT_VALUE = {
  attr: 1, hpPct: 1, mpPct: 1, defPct: 1, hit: 1, evasion: 50, atkPct: 1, matkPct: 1, cdrPct: 1, skillCd: 10,
} as const;

type AttrKey = keyof Attributes;

const effect = (key: string, label: string, value: number, unit: StarEffect['unit']): StarEffect => ({ key, label, value, unit });
const attr = (a: AttrKey, n = 1) => effect(`attr:${a}`, ATTRIBUTE_NAMES_ZH[a], n * STAR_POINT_VALUE.attr, '');
const hp = (n = 1) => effect('hpPct', '最大 HP', n * STAR_POINT_VALUE.hpPct, '%');
const mp = (n = 1) => effect('mpPct', '最大 MP', n * STAR_POINT_VALUE.mpPct, '%');
const def = (n = 1) => effect('defPct', '防禦力', n * STAR_POINT_VALUE.defPct, '%');
const hit = (n = 1) => effect('hit', '命中', n * STAR_POINT_VALUE.hit, '%');
const eva = (n = 1) => effect('evasion', '迴避值', n * STAR_POINT_VALUE.evasion, '');
const atk = (n = 1) => effect('atkPct', '攻擊力', n * STAR_POINT_VALUE.atkPct, '%');
const matk = (n = 1) => effect('matkPct', '魔法攻擊', n * STAR_POINT_VALUE.matkPct, '%');
const cdr = (n = 1) => effect('cdrPct', '冷卻縮減', n * STAR_POINT_VALUE.cdrPct, '%');
const skillCd = (id: string, name: string) => effect(`skill:${id}:cd`, `${name} 冷卻`, -STAR_POINT_VALUE.skillCd, '%');
const skillLevel = (id: string, name: string) => effect(`skill:${id}:level`, `${name} 等級`, 1, '');
const seconds = (ms: number) => `${ms / 1000}s`;
/** 技能線第 k 個節點（0～3）：冷卻依節點數表的技能改顯示冷卻秒數變化 */
function skillLineEffect(id: string, name: string, k: number): StarEffect {
  const e = k % 2 === 1 ? skillLevel(id, name) : skillCd(id, name);
  const steps = STAR_COOLDOWN_BY_NODES[id];
  if (!steps) return e;
  const cd = `冷卻 ${seconds(steps[k])} → ${seconds(steps[k + 1])}`;
  return { ...e, text: k % 2 === 1 ? `${name} 等級 +1、${cd}` : `${name} ${cd}` };
}

/** 由最大 HP +1% 改為體質 +1（真屬性）的星點（§ 56.6）；烈心座的星點見 CLASS_CONFIG */
const VIT_POINT_IDS: ReadonlySet<string> = new Set(['knight-r300', 'bridge4-2']);
const hpOrVit = (id: string): StarEffect => (VIT_POINT_IDS.has(id) ? attr('VIT') : hp());

/** 屬性分攤（§ 56.6）：這些節點的效果改為表列內容，讓各屬性也分布到主職業以外的區域 */
const REDISTRIBUTED: Readonly<Record<string, readonly StarEffect[]>> = {
  'risk4-1': [attr('AGI')],
  'thief-magic6-attr2': [attr('INT')],
  'thief-magic6-attr3': [attr('SPI')],
  'risk0-3': [attr('INT')],
  'elf-side1-2': [attr('INT')],
  'risk1-0': [attr('SPI')],
  'risk1-2': [attr('SPI')],
  'elementalist-magic0-attr2': [attr('VIT')],
  'elementalist-magic0-attr3': [attr('VIT')],
  'elementalist-wheel1-s': [mp(2), hp(2), def(2)],
  'bridge4-1': [attr('SPI')],
  'risk4-2': [attr('AGI')],
  'bridge0-1': [atk()],
  'bridge0-3': [attr('SPI', 2), attr('AGI', 2), hp(2)],
  'bridge2-3': [attr('AGI', 2), attr('VIT', 2), def(2)],
  'bridge2-5': [matk()],
  'bridge3-3': [attr('AGI', 2), hp(2), mp(2)],
  'bridge4-3': [attr('INT', 2), attr('AGI', 2), hp(2)],
  'elementalist-magic0-attr1': [attr('AGI')],
  'elf-vow-s': [atk(2), attr('STR', 2), mp(2)],
  'elf-wheel0-s': [hit(2), atk(2), attr('INT', 2)],
  'elf-wheel1-s': [attr('SPI', 2), eva(2), attr('INT', 2)],
  'knight-vow-s': [atk(2), attr('INT', 2), attr('VIT', 2)],
  'knight-wheel0-s': [def(2), atk(2), attr('SPI', 2)],
  'outer0-p': [attr('VIT')],
  'outer1-p': [attr('INT')],
  'priest-vow-s': [matk(2), attr('STR', 2), attr('AGI', 2)],
  'priest-wheel0-s': [matk(2), mp(2), attr('STR', 2)],
  'risk0-0': [attr('INT')],
  'risk0-2': [attr('SPI')],
  'risk2-1': [attr('STR')],
  'risk2-3': [attr('STR')],
  'risk3-2': [matk()],
  'risk4-0': [atk()],
  'thief-magic6-attr0': [attr('INT')],
  'thief-vow-s': [atk(2), attr('INT', 2), attr('VIT', 2)],
  'thief-wheel0-s': [eva(2), hit(2), attr('SPI', 2)],
  'bridge1-3': [attr('SPI', 2), atk(2), attr('VIT', 2)],
  'elementalist-magic0-attr0': [matk()],
  'elementalist-vow-s': [matk(2), mp(2), def(2)],
  'elementalist-wheel0-s': [matk(2), mp(2), def(2)],
  'outer2-p': [attr('INT')],
  'outer3-p': [attr('SPI')],
  'outer3-s': [attr('AGI', 2), matk(2), attr('INT', 2)],
  'risk2-0': [matk()],
  'risk3-0': [matk()],
  'knight-side0-s': [attr('STR', 2), atk(2), attr('VIT', 2)],
  'thief-r300': [atk()],
  'bridge0-2': [attr('SPI')],
};

/** 沒有星盤節點的職業技能，位置改放屬性星點（§ 56.5） */
export const NO_STAR_NODE_SKILLS: ReadonlySet<string> = new Set(['dodge-counter', 'cd-reduce']);

/** 冷卻依技能線已點節點數（0～4，強化與等級都算）決定的技能，ms（§ 56.5） */
export const STAR_COOLDOWN_BY_NODES: Readonly<Record<string, readonly number[]>> = {
  rend: [20000, 17000, 14000, 11000, 8000],
  'blood-curse': [20000, 18000, 16000, 14000, 12000],
  'precise-shot': [20000, 15000, 10000, 6500, 3000],
  'fire-arrow': [20000, 15000, 10000, 6500, 3000],
  'hawk-eye': [20000, 15000, 10000, 6500, 3000],
};

const UTILITY_CYCLE: (() => StarEffect)[] = [() => hp(), () => mp(), () => def(), () => cdr(), () => cdr()];

interface ClassConfig {
  attrs: [AttrKey, AttrKey];
  /** 起點兩項屬性的數值 */
  startValues: [number, number];
  hub: string;
  sides: [string, string];
  wheels: [{ name: string; point: StarEffect; star: StarEffect[] }, { name: string; point: StarEffect; star: StarEffect[] }];
  /** 第二主屬性側星座的效果；未設為 `[第二主屬性 +2, 最大 HP +2%, 最大 MP +2%]` */
  side1Star?: StarEffect[];
  /** 職業支線（r480 分出）的星點與星座 */
  vow: { name: string; point: StarEffect; star: StarEffect[] };
  /** 跨職業屬性支線（r360 分出）的星點與星座 */
  cross: { name: string; point: StarEffect; star: StarEffect[] };
  offense: (n?: number) => StarEffect;
  keystone: { name: string; effects: StarEffect[] };
}

const CLASS_CONFIG: Record<ClassName, ClassConfig> = {
  knight: {
    attrs: ['STR', 'VIT'],
    startValues: [2, 2],
    hub: '鐵誓座',
    cross: { name: '博識座', point: attr('INT'), star: [attr('INT', 2), attr('AGI', 2), attr('SPI', 2)] },
    vow: { name: '誓盾座', point: attr('VIT'), star: [atk(2), attr('STR', 2), attr('VIT', 2)] },
    sides: ['戰鎚座', '巨岩座'],
    wheels: [
      { name: '堅盾座', point: def(), star: [def(2), hp(2), attr('VIT', 2)] },
      { name: '烈心座', point: attr('VIT'), star: [hp(2), atk(2), attr('VIT', 2)] },
    ],
    offense: atk,
    keystone: { name: '不屈之星', effects: [effect('damageTakenPct', '受到傷害', -5, '%'), effect('moveSpeedPct', '跑速', -5, '%')] },
  },
  thief: {
    attrs: ['AGI', 'STR'],
    startValues: [2, 2],
    hub: '暗影座',
    cross: { name: '詭謀座', point: attr('INT'), star: [attr('INT', 2), attr('SPI', 2), def(2)] },
    vow: { name: '影牙座', point: attr('SPI'), star: [atk(2), attr('AGI', 2), attr('VIT', 2)] },
    sides: ['疾風座', '利爪座'],
    side1Star: [attr('STR', 2), attr('VIT', 2), mp(2)],
    wheels: [
      { name: '幻步座', point: eva(), star: [eva(2), hit(2), attr('AGI', 2)] },
      { name: '毒牙座', point: atk(), star: [atk(2), hit(2), attr('VIT', 2)] },
    ],
    offense: atk,
    keystone: { name: '影刃之星', effects: [effect('critPct', '爆擊率', 5, '%'), hp(-8)] },
  },
  elf: {
    attrs: ['AGI', 'VIT'],
    startValues: [2, 2],
    hub: '森羽座',
    cross: { name: '山嵐座', point: attr('STR'), star: [attr('STR', 2), attr('SPI', 2), attr('INT', 2)] },
    vow: { name: '翠羽座', point: attr('SPI'), star: [atk(2), attr('AGI', 2), mp(2)] },
    sides: ['獵弓座', '林語座'],
    wheels: [
      { name: '遠眺座', point: hit(), star: [hit(2), atk(2), attr('AGI', 2)] },
      { name: '露泉座', point: mp(), star: [mp(2), eva(2), attr('SPI', 2)] },
    ],
    offense: atk,
    keystone: { name: '鷹隼之星', effects: [effect('rangedAtkPct', '遠程攻擊力', 8, '%'), def(-10)] },
  },
  elementalist: {
    attrs: ['INT', 'SPI'],
    startValues: [2, 2],
    hub: '元素座',
    cross: { name: '星鑄座', point: attr('STR'), star: [attr('STR', 2), attr('AGI', 2), attr('VIT', 2)] },
    vow: { name: '源流座', point: attr('SPI'), star: [matk(2), attr('INT', 2), attr('SPI', 2)] },
    sides: ['秘法座', '星泉座'],
    wheels: [
      { name: '奧識座', point: matk(), star: [matk(2), mp(2), attr('INT', 2)] },
      { name: '靈壁座', point: mp(), star: [mp(2), hp(2), attr('SPI', 2)] },
    ],
    offense: matk,
    keystone: { name: '奧能之星', effects: [matk(10), hp(-10)] },
  },
  priest: {
    attrs: ['INT', 'SPI'],
    startValues: [2, 2],
    hub: '聖光座',
    cross: { name: '聖武座', point: attr('AGI'), star: [attr('STR', 2), attr('AGI', 2), attr('VIT', 2)] },
    vow: { name: '祈光座', point: attr('SPI'), star: [matk(2), attr('INT', 2), attr('SPI', 2)] },
    sides: ['禱言座', '庇護座'],
    wheels: [
      { name: '慈光座', point: matk(), star: [matk(2), mp(2), attr('INT', 2)] },
      { name: '守望座', point: def(), star: [def(2), hp(2), attr('VIT', 2)] },
    ],
    offense: matk,
    keystone: { name: '聖誓之星', effects: [effect('healPct', '治癒量', 12, '%'), matk(-8)] },
  },
};

/** 中環橋接星座，依 STAR_CLASS_ORDER 相鄰順序（騎士・盜賊起） */
const BRIDGE_NAMES = ['劍刃座', '疾影座', '靈風座', '星輝座', '守誓座'];
/** 外側橋接支線星座，順序同 BRIDGE_NAMES */
const OUTER_STAR_NAMES = ['銳眼座', '掠影座', '林蔭座', '星幕座', '守夜座'];

const CENTER_KEYSTONES: { angle: number; name: string; path: StarEffect; effects: StarEffect[]; flags?: StarFlag[] }[] = [
  { angle: 0, name: '血契之星', path: hp(), effects: [mp(-50)], flags: ['bloodPact'] },
  {
    angle: 120, name: '均衡之星', path: mp(),
    effects: [...(['STR', 'AGI', 'VIT', 'SPI', 'INT', 'CHA'] as const).map(a => attr(a, 2)), hp(-5), mp(-5)],
  },
  { angle: 240, name: '堅忍之星', path: def(), effects: [hp(12), effect('evasionRatePct', '迴避率', -25, '%'), def(-10)] },
];

/** 職業交界的命星，依 STAR_CLASS_ORDER 相鄰順序（騎士・盜賊起）；每個交界 1～2 顆（§ 56.6） */
const JUNCTION_KEYSTONES: { name: string; effects: StarEffect[]; flags?: StarFlag[] }[][] = [
  [
    { name: '狂戰之星', effects: [atk(20), effect('damageTakenPct', '受到傷害', 15, '%')] },
    { name: '背水之星', effects: [effect('lowHpPowerPct', 'HP 低於 50% 時攻擊力、魔法攻擊', 30, '%'), hp(-10)] },
  ],
  [
    { name: '孤注之星', effects: [effect('critDmgPct', '爆擊傷害', 40, '%'), def(-15)] },
    { name: '獨行之星', effects: [effect('soloDmgPct', '未組隊時造成傷害', 15, '%'), effect('partyDmgPct', '組隊時造成傷害', -10, '%')] },
  ],
  [
    { name: '疾風之星', effects: [effect('attackSpeedPct', '攻速', 15, '%'), hp(-15)] },
  ],
  [
    { name: '碎玉之星', effects: [matk(20), hp(-20)] },
    { name: '燃魔之星', effects: [effect('skillDmgPct', '技能造成傷害', 15, '%')], flags: ['manaBurn'] },
  ],
  [
    { name: '嗜血之星', effects: [effect('attackLifestealPct', '普攻回血', 5, '%'), effect('skillLifestealPct', '技能回血', 5, '%'), effect('potionPct', '補藥效果', -20, '%')] },
    { name: '貪婪之星', effects: [effect('dropPct', '掉寶率', 20, '%'), effect('goldPct', '金幣', 20, '%'), atk(-12), matk(-12)] },
  ],
];

/** 中央與命星交錯的生存星點：角度 → 兩點效果（內 r138、外 r95） */
const CENTER_UTILITY: [number, [() => StarEffect, () => StarEffect]][] = [
  [60, [() => hp(), () => def()]], [180, [() => mp(), () => hit()]], [300, [() => def(), () => eva()]],
];

const classAngle = (c: ClassName): number => STAR_CLASS_ORDER.indexOf(c) * 72;

function polar(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: Math.round(r * Math.sin(rad)), y: Math.round(-r * Math.cos(rad)) };
}

function buildStarChart(): { nodes: StarNode[]; edges: [string, string][] } {
  const nodes: StarNode[] = [];
  const edges: [string, string][] = [];

  const add = (id: string, name: string, kind: StarNodeKind, r: number, deg: number, effects: StarEffect[], extra: Partial<StarNode> = {}): string => {
    const redistributed = REDISTRIBUTED[id];
    const finalEffects = redistributed ? [...redistributed] : effects;
    const finalName = redistributed && kind === 'point' ? pointName(finalEffects) : name;
    nodes.push({ id, name: finalName, kind, ...polar(r, deg), effects: finalEffects, ...extra });
    return id;
  };
  const link = (a: string, b: string) => edges.push([a, b]);
  const pointName = (effects: StarEffect[]) => effects.map(e => e.label).join('、');
  const ringAt = (deg: number) => ring[Math.round(deg / 36) % ring.length];

  // 內環 r=180，10 個星點
  const ring: string[] = [];
  for (let k = 0; k < 10; k++) {
    const e = UTILITY_CYCLE[k % UTILITY_CYCLE.length]();
    ring.push(add(`ring-${k}`, pointName([e]), 'point', 180, k * 36, [e]));
  }
  ring.forEach((id, k) => link(id, ring[(k + 1) % ring.length]));

  // 中央：命星與生存星點每 60° 交錯，內環 → r138 → r92／r95
  for (const ks of CENTER_KEYSTONES) {
    const p = add(`center-${ks.angle}-p`, pointName([ks.path]), 'point', 138, ks.angle, [ks.path]);
    const k = add(`center-${ks.angle}-k`, ks.name, 'keystone', 92, ks.angle, ks.effects, ks.flags ? { flags: ks.flags } : {});
    link(ringAt(ks.angle), p);
    link(p, k);
  }
  for (const [angle, [inner, outer]] of CENTER_UTILITY) {
    const ei = inner();
    const eo = outer();
    const p = add(`center-${angle}-1`, pointName([ei]), 'point', 138, angle, [ei]);
    const q = add(`center-${angle}-2`, pointName([eo]), 'point', 95, angle, [eo]);
    link(ringAt(angle), p);
    link(p, q);
  }

  const midRing: string[] = [];
  for (const c of STAR_CLASS_ORDER) {
    const cfg = CLASS_CONFIG[c];
    const t = classAngle(c);
    const [a1, a2] = cfg.attrs;

    const start = add(starStartNodeId(c), '起點', 'start', 420, t, [attr(a1, cfg.startValues[0]), attr(a2, cfg.startValues[1])], { classId: c });

    // 往內：起點 → r360 → r300（中環）→ r240 → 內環
    const r360 = add(`${c}-r360`, pointName([attr(a1)]), 'point', 360, t, [attr(a1)]);
    const r300Effect = hpOrVit(`${c}-r300`);
    const r300 = add(`${c}-r300`, pointName([r300Effect]), 'point', 300, t, [r300Effect]);
    const r240 = add(`${c}-r240`, pointName([cfg.offense()]), 'point', 240, t, [cfg.offense()]);
    link(start, r360);

    // 跨職業屬性支線（死路）：r360 → 星點 → 星座
    const crossP = add(`${c}-cross-p`, pointName([cfg.cross.point]), 'point', 375, t + 10, [cfg.cross.point]);
    link(r360, crossP);
    link(crossP, add(`${c}-cross-s`, cfg.cross.name, 'constellation', 372, t + 21, cfg.cross.star));
    link(r360, r300);
    link(r300, r240);
    link(r240, ringAt(t));
    midRing.push(r300);

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
      const st = add(`${c}-side${i}-s`, name, 'constellation', 435, t + s * 25,
        i === 0 ? [attr(a, 2), cfg.offense(2), hit(2)] : cfg.side1Star ?? [attr(a, 2), hp(2), mp(2)]);
      link(start, p1);
      link(p1, p2);
      link(p2, st);
    });

    // 職業魔法扇區：起點 → r480 → 星座 r545 → 7 組（強化 r615 → 等級 r680 → 強化 r745 → 等級 r810）→ 命星 r930
    const out = add(`${c}-r480`, pointName([cfg.offense()]), 'point', 480, t, [cfg.offense()]);
    const hub = add(`${c}-hub`, cfg.hub, 'constellation', 545, t, [cfg.offense(2), attr(a1, 2), attr(a2, 2)]);
    link(start, out);
    link(out, hub);
    // 職業支線：r480 → 星點 → 星座（§ 56.6）
    const vowP = add(`${c}-vow-p`, pointName([cfg.vow.point]), 'point', 500, t + 6, [cfg.vow.point]);
    link(out, vowP);
    link(vowP, add(`${c}-vow-s`, cfg.vow.name, 'constellation', 525, t + 14, cfg.vow.star));
    const levelNodes: string[] = [];
    CLASS_SKILLS.filter(s => s.className === c).sort((a, b) => a.classLevel - b.classLevel).forEach((skill, i) => {
      const deg = t + (i - 3) * 8;
      let prev = hub;
      [615, 680, 745, 810].forEach((r, k) => {
        const isLevel = k % 2 === 1;
        const id = NO_STAR_NODE_SKILLS.has(skill.id)
          ? add(`${c}-magic${i}-attr${k}`, pointName([attr(cfg.attrs[k % 2])]), 'point', r, deg, [attr(cfg.attrs[k % 2])])
          : add(`${c}-magic${i}-${isLevel ? 'level' : 'boost'}${k >> 1}`,
            isLevel ? `${skill.name} 等級 +1` : `${skill.name} 強化`, 'point', r, deg,
            [skillLineEffect(skill.id, skill.name, k)], { classId: c });
        link(prev, id);
        prev = id;
      });
      levelNodes.push(prev);
    });
    const ks = add(`${c}-keystone`, cfg.keystone.name, 'keystone', 930, t, cfg.keystone.effects);
    levelNodes.forEach(id => link(id, ks));
  }

  // 中環橋接（r300，相鄰職業之間 5 點，中間為雙屬性星座）與外側橋接（r470）
  STAR_CLASS_ORDER.forEach((c, i) => {
    const next = STAR_CLASS_ORDER[(i + 1) % STAR_CLASS_ORDER.length];
    const t = classAngle(c);
    const a = CLASS_CONFIG[c].attrs[0];
    const b = CLASS_CONFIG[next].attrs[0];
    // 兩側第一主屬性相同（盜賊／妖精、元素師／牧師）時，中環兩端與交界路徑第 2、4 點改為力量
    const sideA: AttrKey = a === b ? 'STR' : a;
    const sideB: AttrKey = a === b ? 'STR' : b;
    const mid = [
      add(`bridge${i}-1`, pointName([attr(sideA)]), 'point', 300, t + 12, [attr(sideA)]),
      add(`bridge${i}-2`, pointName([hpOrVit(`bridge${i}-2`)]), 'point', 300, t + 24, [hpOrVit(`bridge${i}-2`)]),
      add(`bridge${i}-3`, BRIDGE_NAMES[i], 'constellation', 300, t + 36,
        a === b ? [attr(a, 2), hp(2), mp(2)] : [attr(a, 2), attr(b, 2), hp(2)]),
      add(`bridge${i}-4`, pointName([mp()]), 'point', 300, t + 48, [mp()]),
      add(`bridge${i}-5`, pointName([attr(sideB)]), 'point', 300, t + 60, [attr(sideB)]),
    ];
    link(midRing[i], mid[0]);
    mid.slice(1).forEach((id, k) => link(mid[k], id));
    link(mid[4], midRing[(i + 1) % midRing.length]);

    const outer = add(`outer${i}`, pointName([cdr()]), 'point', 470, t + 36, [cdr()]);
    link(`${c}-side1-s`, outer);
    link(outer, `${next}-side0-s`);

    // 外側支線（死路）：冷卻縮減星點 → r410 命中／迴避星點 → r360 星座
    const spurEffect = i % 2 === 0 ? hit() : eva();
    const spur = add(`outer${i}-p`, pointName([spurEffect]), 'point', 410, t + 36, [spurEffect]);
    link(outer, spur);
    link(spur, add(`outer${i}-s`, OUTER_STAR_NAMES[i], 'constellation', 360, t + 36, [hit(2), eva(2), def(2)]));

    // 交界命星：外側橋接 → r550～r760 四星點（兩側職業第一主屬性輪替；兩側相同時第 2、4 點為力量）→ r840 分岔
    let prev = outer;
    [550, 620, 690, 760].forEach((r, k) => {
      const e = attr(k % 2 === 0 ? a : sideB);
      const id = add(`risk${i}-${k}`, pointName([e]), 'point', r, t + 36, [e]);
      link(prev, id);
      prev = id;
    });
    const stones = JUNCTION_KEYSTONES[i];
    stones.forEach((ks, k) => {
      const deg = t + 36 + (stones.length === 1 ? 0 : (k === 0 ? -6 : 6));
      link(prev, add(`risk${i}-keystone${k}`, ks.name, 'keystone', 840, deg, ks.effects, ks.flags ? { flags: ks.flags } : {}));
    });
  });

  return { nodes, edges };
}

const BUILT = buildStarChart();
export const STAR_NODES: readonly StarNode[] = BUILT.nodes;
export const STAR_EDGES: readonly (readonly [string, string])[] = BUILT.edges;
export const STAR_NODE_BY_ID: ReadonlyMap<string, StarNode> = new Map(STAR_NODES.map(n => [n.id, n]));
const ADJ = new Map<string, string[]>(STAR_NODES.map(n => [n.id, []]));
for (const [a, b] of STAR_EDGES) {
  ADJ.get(a)!.push(b);
  ADJ.get(b)!.push(a);
}

/** 由 id 往外可走的相鄰節點：命星是終點，不能經命星走到其他節點（§ 56.2） */
export function starNeighbors(id: string): readonly string[] {
  return STAR_NODE_BY_ID.get(id)?.kind === 'keystone' ? [] : ADJ.get(id) ?? [];
}

/** 從已點集合到 target 的最短路徑（不含已點節點）；不可達回 null */
export function starPathTo(target: string, allocated: ReadonlySet<string>): string[] | null {
  if (allocated.has(target)) return [];
  const prev = new Map<string, string | null>();
  const queue: string[] = [];
  for (const id of allocated) {
    prev.set(id, null);
    queue.push(id);
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) break;
    for (const nb of starNeighbors(cur)) {
      if (prev.has(nb)) continue;
      prev.set(nb, cur);
      queue.push(nb);
    }
  }
  if (!prev.has(target)) return null;
  const path: string[] = [];
  for (let cur: string | null = target; cur !== null && !allocated.has(cur); cur = prev.get(cur) ?? null) {
    path.unshift(cur);
  }
  return path;
}

/** 退掉 target 後，連同與起點斷開的節點一起移除的清單（含 target） */
export function starRefundSet(target: string, allocated: ReadonlySet<string>, cls: ClassName): string[] {
  const start = starStartNodeId(cls);
  const kept = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of starNeighbors(cur)) {
      if (nb === target || kept.has(nb) || !allocated.has(nb)) continue;
      kept.add(nb);
      queue.push(nb);
    }
  }
  return [...allocated].filter(id => !kept.has(id));
}

/**
 * 存檔讀回的已點清單整理成合法狀態：未開放為空；開放後必含起點；
 * 丟掉不存在、與起點不相連的節點；超出點數時依離起點的 BFS 順序截斷（截完仍相連）。
 */
export function normalizeStarAllocation(allocated: readonly string[], cls: ClassName, level: number): string[] {
  if (level < STAR_CHART_UNLOCK_LEVEL) return [];
  const start = starStartNodeId(cls);
  const wanted = new Set(allocated);
  const result = [start];
  const kept = new Set(result);
  let keystones = 0;
  for (let i = 0; i < result.length; i++) {
    for (const nb of starNeighbors(result[i])) {
      if (kept.has(nb) || !wanted.has(nb)) continue;
      if (STAR_NODE_BY_ID.get(nb)?.kind === 'keystone') {
        if (keystones >= KEYSTONE_CAP) continue;
        keystones++;
      }
      kept.add(nb);
      result.push(nb);
    }
  }
  return result.slice(0, starPoints(level));
}

/** 未點點數（底部面板列星盤按鈕的徽章）：`starChart` 在讀檔、升級時已正規化 */
export function unspentStarPoints(c: { level: number; starChart?: readonly string[] }): number {
  if (c.level < STAR_CHART_UNLOCK_LEVEL) return 0;
  return Math.max(0, starPoints(c.level) - (c.starChart?.length ?? 0));
}

export type StarApplyError = 'shape' | 'invalid' | 'points' | 'keystones';

/** 已點的命星顆數 */
export const countKeystones = (ids: Iterable<string>): number =>
  [...ids].filter(id => STAR_NODE_BY_ID.get(id)?.kind === 'keystone').length;

/** 點下路徑後命星是否超過上限 */
export const exceedsKeystoneCap = (path: readonly string[], allocated: ReadonlySet<string>): boolean =>
  countKeystones(allocated) + countKeystones(path) > KEYSTONE_CAP;

/**
 * 一次套用整份配點（§ 56.7 草稿確認）：目標必須是合法狀態（含起點、只有存在且與起點相連的節點、不超過點數）。
 * `refunded`＝原本已點、目標裡沒有的節點數，即要付洗點費的點數。
 */
export function planStarChart(
  current: readonly string[], target: unknown, cls: ClassName, level: number,
): { allocated: string[]; refunded: number } | { error: StarApplyError } {
  if (!Array.isArray(target) || target.length > STAR_NODES.length || !target.every(id => typeof id === 'string')) return { error: 'shape' };
  const wanted = new Set(target as string[]);
  const allocated = normalizeStarAllocation([...wanted], cls, level);
  if (allocated.length !== wanted.size || allocated.some(id => !wanted.has(id))) {
    if (countKeystones(wanted) > KEYSTONE_CAP) return { error: 'keystones' };
    return { error: wanted.size > starPoints(level) ? 'points' : 'invalid' };
  }
  const before = normalizeStarAllocation(current, cls, level);
  return { allocated, refunded: before.filter(id => !wanted.has(id)).length };
}

/** 職業魔法節點只對本職業生效（§ 56.4） */
export function isStarEffectActive(e: StarEffect, node: StarNode, cls: ClassName): boolean {
  return !e.key.startsWith('skill:') || node.classId === cls;
}

/** 已點節點的生效效果加總（同 key 相加）與命星規則 */
export function sumStarEffects(
  allocated: Iterable<string>, cls: ClassName,
): { totals: Map<string, number>; flags: Set<StarFlag> } {
  const totals = new Map<string, number>();
  const flags = new Set<StarFlag>();
  for (const id of allocated) {
    const node = STAR_NODE_BY_ID.get(id);
    if (!node) continue;
    node.flags?.forEach(f => flags.add(f));
    for (const e of node.effects) {
      if (!isStarEffectActive(e, node, cls)) continue;
      totals.set(e.key, (totals.get(e.key) ?? 0) + e.value);
    }
  }
  return { totals, flags };
}

const TOTALS_CACHE = new WeakMap<readonly string[], { cls: ClassName; result: ReturnType<typeof sumStarEffects> }>();

/** `sumStarEffects` 的快取版：以角色上的已點陣列為鍵（陣列不可就地修改） */
export function starTotalsOf(allocated: readonly string[] | undefined, cls: ClassName): ReturnType<typeof sumStarEffects> {
  if (!allocated) return sumStarEffects([], cls);
  const hit = TOTALS_CACHE.get(allocated);
  if (hit && hit.cls === cls) return hit.result;
  const result = sumStarEffects(allocated, cls);
  TOTALS_CACHE.set(allocated, { cls, result });
  return result;
}

/** 職業技能等級（I～III）：學會為 I，每個等級節點 +1 */
export function starSkillLevel(totals: ReadonlyMap<string, number>, skillId: string): number {
  return Math.min(1 + (totals.get(`skill:${skillId}:level`) ?? 0), STAR_SKILL_LEVEL_CAP);
}

