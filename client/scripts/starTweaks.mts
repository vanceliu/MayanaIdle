/**
 * 星盤數值的試算開關（只改本程序內的記憶體，不改遊戲程式）：
 * `--tweak=attr:0.5,offense:0.5,hp:0.5,class:0.5/0.75/1,longbuff,support:0.5/0.75/1`
 *  - attr／offense／hp：屬性、攻擊力%與魔法攻擊%、最大 HP% 節點數值的倍率
 *  - class：職業技能的預設等級倍率（I/II/III，有個別倍率的職業不受影響）
 *  - longbuff：持續 ≥ 冷卻 10 倍的職業 buff，冷卻節點不花點數
 *  - support：職業 buff 技能的增益數值改用這組等級倍率（傷害仍用 class）
 *  - weapondmg:X：雙刀／鋼爪小怪／大怪傷害倍率
 *  - dualfinal:X：雙刀／鋼爪普攻最終傷害倍率（以普攻專屬的元素刻印乘區換算，元素下降生效時略低）
 *  - dualinterval:B：雙刀／鋼爪基礎攻擊間隔改 B ms（以穩態攻速換算成等效攻速，`intervalTweak`）
 */
import { STAR_NODES, STAR_NODE_BY_ID, starTotalsOf } from '../src/models/starChart';
import { CLASS_SKILL_LEVEL_SCALE } from '../src/models/skillStar';
import { CLASS_SKILLS } from '../src/models/classSkills';
import type { ClassName } from '../src/models/character';
import type { EquipmentInstance } from '../src/models/equipment';
import type { ActiveEffect } from '../src/models/effect';
import { getEffectiveAffixValue } from '../src/models/affix';
import { getAffixBonusesFromGear, getTotalAttackSpeedPercent } from '../src/systems/combat';
import type { Skill } from '../src/models/skill';

const TWEAK = process.argv.find(a => a.startsWith('--tweak='))?.split('=')[1] ?? '';
const FLAGS = new Set<string>();
let support: number[] | null = null;

for (const part of TWEAK.split(',').filter(Boolean)) {
  const [key, raw] = part.split(':');
  if (raw === undefined) { FLAGS.add(key); continue; }
  if (key === 'support') { support = raw.split('/').map(Number); continue; }
  if (key === 'class') {
    const target = CLASS_SKILL_LEVEL_SCALE as unknown as number[];
    raw.split('/').map(Number).forEach((v, i) => { target[i] = v; });
    continue;
  }
  const factor = Number(raw);
  const match = (k: string) => (key === 'attr' ? k.startsWith('attr:')
    : key === 'offense' ? k === 'atkPct' || k === 'matkPct'
    : key === 'hp' ? k === 'hpPct' : false);
  for (const node of STAR_NODES) {
    if (node.kind === 'keystone') continue;
    for (const e of node.effects) if (match(e.key)) (e as { value: number }).value = e.value * factor;
  }
}

const LONG_BUFFS = new Set(CLASS_SKILLS.map(c => c.skill)
  .filter(s => s.type === 'buff' && (s.buffDuration ?? 0) >= 10 * s.cooldown).map(s => s.id));
export const LONG_BUFF_NAMES = CLASS_SKILLS.filter(c => LONG_BUFFS.has(c.skill.id)).map(c => c.skill.name);

const tweakNumber = (key: string) => Number(TWEAK.split(',').find(p => p.startsWith(`${key}:`))?.split(':')[1] ?? NaN);
const isDual = (w: { type?: string } | null | undefined) => w?.type === 'dualBlade' || w?.type === 'claw';

/** 加一條「有效值 = target」的詞綴（品質放大後取整，回推原值） */
function withAffix(w: EquipmentInstance, type: string, target: number): EquipmentInstance {
  const q = w.quality ?? 0;
  let value = target / (1 + q / 100);
  const affix = () => ({ type, tier: 7, value } as never);
  while (getEffectiveAffixValue(affix(), q) < target - 0.05) value += 0.01;
  return { ...w, affixes: [...(w.affixes ?? []), affix()] };
}

/** 試算用武器改寫：weapondmg、dualfinal（只改模擬的裝備實例） */
export function tweakWeapon(w: EquipmentInstance): EquipmentInstance {
  if (!isDual(w)) return w;
  let out = w;
  const mult = tweakNumber('weapondmg');
  if (Number.isFinite(mult)) out = { ...out, smallMonsterDamage: (out.smallMonsterDamage ?? 0) * mult, largeMonsterDamage: (out.largeMonsterDamage ?? 0) * mult };
  const final = tweakNumber('dualfinal');
  if (Number.isFinite(final)) {
    const brand = getAffixBonusesFromGear([out]).element_brand;
    out = withAffix(out, 'element_brand', (final - 1) * (100 + brand));
  }
  return out;
}

/** dualinterval：依整套裝備與戰前 buff 的穩態攻速 s，補攻速 (100 + s) × (1200 ÷ B − 1) */
export function intervalTweak(gear: (EquipmentInstance | null)[], effects: ActiveEffect[]): (EquipmentInstance | null)[] {
  const base = tweakNumber('dualinterval');
  const weapon = gear.find(g => g?.slot === 'rightHand') ?? null;
  if (!Number.isFinite(base) || !isDual(weapon)) return gear;
  const s = getTotalAttackSpeedPercent(gear, effects);
  const patched = withAffix(weapon!, 'attack_speed', (100 + s) * (1200 / base - 1));
  return gear.map(g => (g === weapon ? patched : g));
}

/** 節點花費的點數 */
export function starNodeCost(id: string): number {
  const node = STAR_NODE_BY_ID.get(id);
  if (!node) return 1;
  if (FLAGS.has('longbuff') && node.effects.some(e => {
    const m = /^skill:(.+):cd$/.exec(e.key);
    return !!m && LONG_BUFFS.has(m[1]);
  })) return 0;
  return 1;
}

type Mutable = { buffModifiers?: { value: number }[]; onHitDebuff?: { dotDamagePercent?: number } };
const ORIGINAL = new Map<string, { mods: number[]; dot?: number }>();

/** support：依目前星盤把該職業 buff 技能的增益數值換成新倍率（遊戲端仍乘原倍率，這裡先乘比值） */
export function applySupportScale(className: ClassName, starChart: readonly string[]): void {
  if (!support) return;
  const totals = starTotalsOf(starChart as string[], className).totals;
  for (const cs of CLASS_SKILLS) {
    const s = cs.skill as Skill & Mutable;
    if (cs.className !== className || s.type !== 'buff') continue;
    if (!ORIGINAL.has(s.id)) ORIGINAL.set(s.id, { mods: (s.buffModifiers ?? []).map(m => m.value), dot: s.onHitDebuff?.dotDamagePercent });
    const orig = ORIGINAL.get(s.id)!;
    const level = 1 + (totals.get(`skill:${s.id}:level`) ?? 0);
    const ratio = support[level - 1] / CLASS_SKILL_LEVEL_SCALE[level - 1];
    s.buffModifiers?.forEach((m, i) => { m.value = orig.mods[i] * ratio; });
    if (s.onHitDebuff && orig.dot !== undefined) s.onHitDebuff.dotDamagePercent = orig.dot * ratio;
  }
}
