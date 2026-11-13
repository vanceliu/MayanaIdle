/**
 * 詞綴分類 demo 共用資料：照 `07-affix.md` § 7.3／§ 7.5／§ 7.6 寫死（model 尚未改版）。
 */
export type Cat = 'weapon' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type Code = 'P1' | 'P2' | 'P3' | 'P5' | 'P7' | 'N2' | '受擊' | '迴避' | 'HP' | '+1';
export type Group = '攻擊類' | '防禦類' | '補給類' | '掉落類' | '移動類';

export const CATS: { key: Cat; label: string; parts: string; special: boolean; ability: boolean }[] = [
  { key: 'weapon', label: '武器', parts: '右手武器；左手持武器時同', special: false, ability: true },
  { key: 'A', label: 'A', parts: '頭盔、胸甲', special: false, ability: false },
  { key: 'B', label: 'B', parts: '上衣、斗篷', special: true, ability: false },
  { key: 'C', label: 'C', parts: '手套', special: false, ability: false },
  { key: 'D', label: 'D', parts: '鞋子', special: false, ability: false },
  { key: 'E', label: 'E', parts: '腰帶', special: true, ability: false },
  { key: 'F', label: 'F', parts: '副手：盾牌、魔導書、臂甲', special: false, ability: false },
  { key: 'G', label: 'G', parts: '項鍊', special: false, ability: true },
  { key: 'H', label: 'H', parts: '戒指', special: false, ability: true },
];
export const CAT_SHORT: Record<Cat, string> = {
  weapon: '武器', A: '頭盔·胸甲', B: '上衣·斗篷', C: '手套', D: '鞋子', E: '腰帶', F: '副手', G: '項鍊', H: '戒指',
};

const p = (w: number) => Array.from({ length: 7 }, (_, i) => [Math.round(i * w * 10 + 1) / 10, (i + 1) * w] as [number, number]);
export const TABLES: Record<Exclude<Code, '+1'>, { tiers: [number, number][]; percent: boolean }> = {
  P1: { tiers: p(1), percent: true },
  P2: { tiers: p(2), percent: true },
  P3: { tiers: p(3), percent: true },
  P5: { tiers: p(5), percent: true },
  P7: { tiers: p(7), percent: true },
  N2: { tiers: Array.from({ length: 7 }, (_, i) => [i * 2 + 1, i * 2 + 2] as [number, number]), percent: false },
  受擊: { tiers: [[1.0, 1.4], [1.5, 2.3], [2.4, 3.5], [3.6, 4.4], [4.5, 5.3], [5.4, 6.1], [6.2, 7.0]], percent: true },
  迴避: { tiers: [[1, 39], [40, 78], [79, 117], [118, 156], [157, 195], [196, 234], [235, 273]], percent: false },
  HP: { tiers: [[15, 20], [25, 32], [38, 46], [50, 58], [62, 70], [75, 84], [90, 100]], percent: false },
};

export const AFFIXES: { key: string; name: string; group: Group; desc: string }[] = [
  { key: 'atk', name: '攻擊力', group: '攻擊類', desc: '攻擊力 +X%' },
  { key: 'brand', name: '元素刻印', group: '攻擊類', desc: '賦予武器一個元素，並使普攻傷害 +X%' },
  { key: 'erosion', name: '元素侵蝕', group: '攻擊類', desc: 'X% 是觸發率：命中後讓目標中侵蝕，每秒固定傷害、持續 5 秒' },
  { key: 'splash', name: '普攻擴散', group: '攻擊類', desc: '普攻命中時，主目標 3 格內的其他怪受到主目標該下傷害 × X%' },
  { key: 'skillEle', name: '技能元素傷害', group: '攻擊類', desc: '施放技能時元素傷害 +X%' },
  { key: 'critRate', name: '爆擊率', group: '攻擊類', desc: '爆擊率 +X%' },
  { key: 'critDmg', name: '爆擊傷害', group: '攻擊類', desc: '爆擊傷害 +X%' },
  { key: 'aspd', name: '攻擊速度', group: '攻擊類', desc: '攻擊速度 +X%' },
  { key: 'cdr', name: '減少冷卻時間', group: '攻擊類', desc: '技能冷卻時間 -X%' },
  { key: 'hitDown', name: '命中下降', group: '攻擊類', desc: '命中後 10% 機率使敵方命中下降 X%，持續 3 秒' },
  { key: 'defDown', name: '防禦下降', group: '攻擊類', desc: '命中後 10% 機率使敵方防禦下降 X%，持續 3 秒' },
  { key: 'def', name: '防禦力', group: '防禦類', desc: '防禦力 +X%' },
  { key: 'hp', name: '最大 HP', group: '防禦類', desc: '最大 HP +X（固定值）' },
  { key: 'mp', name: '最大 MP', group: '防禦類', desc: '最大 MP +X（固定值）' },
  { key: 'hpRegen', name: '回血', group: '防禦類', desc: '每次自然回血 +X（固定值）' },
  { key: 'mpRegen', name: '回魔', group: '防禦類', desc: '每次自然回魔 +X（固定值）' },
  { key: 'attr', name: '額外屬性', group: '防禦類', desc: '六大屬性之一 +1，roll 時均等決定' },
  { key: 'eva', name: '迴避', group: '防禦類', desc: '迴避值 +X（100 迴避值 = 1% 迴避率）' },
  { key: 'onHitHp', name: '受擊回血', group: '防禦類', desc: 'X% 是觸發率：受到傷害時回復最大 HP 的 2.0~4.0%' },
  { key: 'onHitMp', name: '受擊回魔', group: '防禦類', desc: 'X% 是觸發率：受到傷害時回復最大 MP 的 2.0~5.0%' },
  { key: 'block', name: '格擋率', group: '防禦類', desc: '格擋率 +X%' },
  { key: 'mres', name: '魔法抗性', group: '防禦類', desc: '魔法抗性 +X%，並降低詛咒／虛弱／減速／沉默的機率' },
  { key: 'thorns', name: '荊棘傷害', group: '防禦類', desc: '被命中時，對攻擊者造成實際受到的傷害 × X%' },
  { key: 'heal', name: '補血效果', group: '補給類', desc: '技能補血效果 +X%' },
  { key: 'potion', name: '藥水效果', group: '補給類', desc: '藥水效果 +X%' },
  { key: 'drop', name: '掉寶率', group: '掉落類', desc: '掉寶率 +X%' },
  { key: 'gold', name: '金幣獲得率', group: '掉落類', desc: '金幣獲得率 +X%' },
  { key: 'move', name: '跑速', group: '移動類', desc: '移動速度 +X%' },
];
export const GROUPS: Group[] = ['攻擊類', '防禦類', '補給類', '掉落類', '移動類'];

export const SHARED = ['hp', 'mp', 'hpRegen', 'mpRegen', 'heal', 'potion', 'drop', 'gold'];
export const SHARED_CODE: Record<string, Code> = { hp: 'HP', mp: 'HP', hpRegen: 'N2', mpRegen: 'N2', heal: 'P2', potion: 'P2', drop: 'P3', gold: 'P3' };
export const OWN: Record<Cat, Record<string, Code>> = {
  weapon: { atk: 'P3', brand: 'P3', erosion: 'P3', hitDown: 'P3', defDown: 'P3', splash: 'P5', critDmg: 'P5', aspd: 'P1' },
  A: { def: 'P1', onHitHp: '受擊', onHitMp: '受擊', eva: '迴避', attr: '+1' },
  B: { def: 'P1', eva: '迴避', attr: '+1' },
  C: { splash: 'P2', critRate: 'P2', critDmg: 'P2', aspd: 'P1', skillEle: 'P2', cdr: 'P2' },
  D: { move: 'P2', eva: '迴避', cdr: 'P2', def: 'P1' },
  E: { attr: '+1', eva: '迴避', cdr: 'P1', critDmg: 'P2' },
  F: { block: 'P3', skillEle: 'P1', def: 'P1', thorns: 'P7', onHitHp: '受擊', onHitMp: '受擊', mres: 'P3' },
  G: { mres: 'P3', cdr: 'P1', eva: '迴避', attr: '+1', critRate: 'P1', critDmg: 'P2', skillEle: 'P2' },
  H: { mres: 'P3', eva: '迴避', attr: '+1', critRate: 'P1', critDmg: 'P2', skillEle: 'P2' },
};
export function poolOf(cat: Cat): Record<string, Code> {
  return cat === 'weapon' ? OWN.weapon : { ...OWN[cat], ...SHARED_CODE };
}

export const fmt = (v: number, percent: boolean) => (percent ? v.toFixed(1) : String(v));
