/**
 * 怪物強化詞綴（`25-monster-system.md` § 25.12）。
 */
import type { MonsterInstance } from './monster';
import type { PlayerDebuffType } from './playerDebuff';

export type MonsterAffixId =
  | 'bloodthirst' | 'frenzy' | 'swift' | 'venom' | 'giant'
  | 'hardened' | 'regen' | 'shield' | 'gale' | 'thorns';

/** 劇毒／撕裂附加的 debuff */
export type VenomDebuff = Extract<PlayerDebuffType, 'poison' | 'bleed'>;

/** § 25.12.2 詞綴表順序（名稱與詞綴列依此排列） */
export const MONSTER_AFFIX_ORDER: readonly MonsterAffixId[] = [
  'bloodthirst', 'frenzy', 'swift', 'venom', 'giant',
  'hardened', 'regen', 'shield', 'gale', 'thorns',
];

export const MONSTER_AFFIX_LABELS: Record<MonsterAffixId, string> = {
  bloodthirst: '嗜血', frenzy: '狂暴', swift: '迅捷', venom: '劇毒／撕裂', giant: '強命',
  hardened: '堅硬', regen: '再生', shield: '護盾', gale: '疾走', thorns: '荊棘',
};

const VENOM_LABELS: Record<VenomDebuff, string> = { poison: '劇毒', bleed: '撕裂' };

/** § 25.12.1：詞綴數、擲骰區段上限（累計 %）、開放的最低怪物等級 */
export const MONSTER_AFFIX_COUNT_TABLE: readonly { count: number; cumulative: number; minLevel: number }[] = [
  { count: 1, cumulative: 5, minLevel: 1 },
  { count: 2, cumulative: 9, minLevel: 30 },
  { count: 3, cumulative: 12, minLevel: 40 },
  { count: 4, cumulative: 14, minLevel: 50 },
];

/** § 25.12.1 掉落倍率（依詞綴數） */
export const MONSTER_AFFIX_DROP_REWARD: Record<number, number> = { 1: 1.25, 2: 1.5, 3: 1.75, 4: 2 };
/** § 25.12.1 金幣與經驗倍率（依詞綴數） */
export const MONSTER_AFFIX_GOLD_EXP_REWARD: Record<number, number> = { 1: 1.05, 2: 1.07, 3: 1.09, 4: 1.10 };

export const BLOODTHIRST_PERCENT = 20;
export const FRENZY_PERCENT = 10;
export const SWIFT_SPEED_MULTIPLIER = 1.33;
export const VENOM_CHANCE = 15;
export const GIANT_PERCENT = 20;
export const HARDENED_PERCENT = 20;
export const REGEN_PERCENT = 2;
export const REGEN_INTERVAL_MS = 6000;
export const SHIELD_PERCENT = 20;
export const GALE_SPEED_MULTIPLIER = 1.1;
export const THORNS_PERCENT = 30;

/** § 25.12.2 詞綴效果敘述（Wiki 用），數值由上方常數產生 */
export const MONSTER_AFFIX_DESCRIPTIONS: Record<MonsterAffixId, string> = {
  bloodthirst: `攻擊扣到角色 HP 時，回復該次扣血量的 ${BLOODTHIRST_PERCENT}%（DoT 不吸）`,
  frenzy: `攻擊力 +${FRENZY_PERCENT}%`,
  swift: `攻速 +${Math.round((SWIFT_SPEED_MULTIPLIER - 1) * 100)}%`,
  venom: `攻擊附加中毒（劇毒）或流血（撕裂），觸發率 ${VENOM_CHANCE}%；原本有中毒給流血、原本有流血給中毒`,
  giant: `最大 HP +${GIANT_PERCENT}%`,
  hardened: `防禦 +${HARDENED_PERCENT}%`,
  regen: `每 ${REGEN_INTERVAL_MS / 1000} 秒回復最大 HP 的 ${REGEN_PERCENT}%（最少 1）`,
  shield: `生成時帶護盾，吸收量為最大 HP 的 ${SHIELD_PERCENT}%；傷害先扣護盾，破了不回復`,
  gale: `移動速度 +${Math.round((GALE_SPEED_MULTIPLIER - 1) * 100)}%`,
  thorns: `反彈角色每下命中傷害的 ${THORNS_PERCENT}%，吃物理防禦減傷、不可迴避或格擋、可致死；DoT 不反彈`,
};

export interface MonsterAffixRoll {
  affixes: MonsterAffixId[];
  venom?: VenomDebuff;
}

/** § 25.12.1：依怪物等級擲詞綴數；未開放的區段回 0 */
export function rollMonsterAffixCount(level: number, rng: () => number): number {
  const r = rng() * 100;
  const row = MONSTER_AFFIX_COUNT_TABLE.find(t => r < t.cumulative);
  if (!row || level < row.minLevel) return 0;
  return row.count;
}

/** § 25.12.3：原本有中毒 → 流血；原本有流血 → 中毒；皆無 → 各 50% */
export function pickVenomDebuff(nativeDebuffs: readonly PlayerDebuffType[], rng: () => number): VenomDebuff {
  if (nativeDebuffs.includes('poison')) return 'bleed';
  if (nativeDebuffs.includes('bleed')) return 'poison';
  return rng() < 0.5 ? 'poison' : 'bleed';
}

/**
 * § 25.12.2：等機率抽、不重複，依詞綴表順序回傳。
 * `minCount`：懸賞契約對象擲到不強化時改為 1 個（`53-bounty-contract.md` § 53.5.3）。
 */
export function rollMonsterAffixes(
  level: number,
  nativeDebuffs: readonly PlayerDebuffType[],
  rng: () => number,
  minCount: number = 0,
): MonsterAffixRoll {
  return rollMonsterAffixesOfCount(Math.max(minCount, rollMonsterAffixCount(level, rng)), nativeDebuffs, rng);
}

/** § 25.12.2：指定數量（競技場依波次，`55-arena.md` § 55.2），不受等級開放限制 */
export function rollMonsterAffixesOfCount(
  count: number,
  nativeDebuffs: readonly PlayerDebuffType[],
  rng: () => number,
): MonsterAffixRoll {
  if (count === 0) return { affixes: [] };
  const pool = [...MONSTER_AFFIX_ORDER];
  const picked = new Set<MonsterAffixId>();
  while (picked.size < count) {
    picked.add(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const affixes = MONSTER_AFFIX_ORDER.filter(id => picked.has(id));
  return picked.has('venom')
    ? { affixes, venom: pickVenomDebuff(nativeDebuffs, rng) }
    : { affixes };
}

/**
 * § 25.12.2：屬性加成，作用在等級公式與全域倍率之後。回傳新實例。
 * 護盾吸收量以套用強命後的最大 HP 計算。
 */
export function applyMonsterAffixes(inst: MonsterInstance, roll: MonsterAffixRoll): MonsterInstance {
  if (roll.affixes.length === 0) return inst;
  const has = (id: MonsterAffixId) => roll.affixes.includes(id);
  const next: MonsterInstance = { ...inst, affixes: roll.affixes };

  if (has('frenzy')) {
    next.attackMin = Math.floor(inst.attackMin * (100 + FRENZY_PERCENT) / 100);
    next.attackMax = Math.floor(inst.attackMax * (100 + FRENZY_PERCENT) / 100);
  }
  if (has('swift')) next.attackInterval = Math.round(inst.attackInterval / SWIFT_SPEED_MULTIPLIER);
  if (has('venom') && roll.venom) {
    next.venom = roll.venom;
    next.debuffs = [...(inst.debuffs ?? []), { type: roll.venom, chance: VENOM_CHANCE }];
  }
  if (has('giant')) {
    next.maxHp = Math.floor(inst.maxHp * (100 + GIANT_PERCENT) / 100);
    next.currentHp = next.maxHp;
  }
  if (has('hardened')) next.defense = Math.floor(inst.defense * (100 + HARDENED_PERCENT) / 100);
  if (has('shield')) {
    next.shieldMax = Math.floor(next.maxHp * SHIELD_PERCENT / 100);
    next.shieldRemaining = next.shieldMax;
  }
  return next;
}

export function hasMonsterAffix(inst: Pick<MonsterInstance, 'affixes'>, id: MonsterAffixId): boolean {
  return inst.affixes?.includes(id) ?? false;
}

/** 單一詞綴的顯示名；劇毒／撕裂依實際附加的 debuff */
export function monsterAffixLabel(id: MonsterAffixId, venom: VenomDebuff | undefined): string {
  return id === 'venom' && venom ? VENOM_LABELS[venom] : MONSTER_AFFIX_LABELS[id];
}

export function monsterAffixLabels(inst: Pick<MonsterInstance, 'affixes' | 'venom'>): string[] {
  return (inst.affixes ?? []).map(id => monsterAffixLabel(id, inst.venom));
}

/** § 25.12.5 戰鬥日誌的怪物名：「{詞綴} {原名}」 */
export function monsterLogName(inst: Pick<MonsterInstance, 'name' | 'affixes' | 'venom'>): string {
  const labels = monsterAffixLabels(inst);
  return labels.length > 0 ? `${labels.join(' ')} ${inst.name}` : inst.name;
}

/** § 25.12.4 物品掉落倍率；無詞綴為 1 */
export function monsterDropMultiplier(inst: Pick<MonsterInstance, 'affixes'>): number {
  return MONSTER_AFFIX_DROP_REWARD[inst.affixes?.length ?? 0] ?? 1;
}

/** § 25.12.4 金幣與經驗倍率；無詞綴為 1 */
export function monsterGoldExpMultiplier(inst: Pick<MonsterInstance, 'affixes'>): number {
  return MONSTER_AFFIX_GOLD_EXP_REWARD[inst.affixes?.length ?? 0] ?? 1;
}

/**
 * 對怪物造成傷害：護盾詞綴先吸收（§ 25.12.3），溢出才扣 HP。直接修改實例。
 * 回傳實際扣掉的 HP。
 */
export function applyDamageToMonster(inst: MonsterInstance, damage: number): number {
  let remaining = damage;
  if (inst.shieldRemaining && inst.shieldRemaining > 0) {
    const absorbed = Math.min(inst.shieldRemaining, remaining);
    inst.shieldRemaining -= absorbed;
    remaining -= absorbed;
  }
  const before = inst.currentHp;
  inst.currentHp = Math.max(0, inst.currentHp - remaining);
  return before - inst.currentHp;
}

/** 回復怪物 HP，不超過最大 HP。直接修改實例，回傳實際回復量 */
export function healMonster(inst: MonsterInstance, amount: number): number {
  if (inst.currentHp <= 0 || amount <= 0) return 0;
  const before = inst.currentHp;
  inst.currentHp = Math.min(inst.maxHp, inst.currentHp + amount);
  return inst.currentHp - before;
}

/** 嗜血：攻擊扣到角色 HP 的量 × 20%（floor） */
export function bloodthirstHeal(inst: MonsterInstance, hpLost: number): number {
  if (!hasMonsterAffix(inst, 'bloodthirst')) return 0;
  return healMonster(inst, Math.floor(hpLost * BLOODTHIRST_PERCENT / 100));
}

/** 再生：累積 deltaMs，每滿 6000ms 回 `max(1, floor(最大 HP × 2%))`。回傳本次回復量 */
export function tickMonsterRegen(inst: MonsterInstance, deltaMs: number): number {
  if (!hasMonsterAffix(inst, 'regen') || inst.currentHp <= 0) return 0;
  inst.regenElapsedMs = (inst.regenElapsedMs ?? 0) + deltaMs;
  let healed = 0;
  while (inst.regenElapsedMs >= REGEN_INTERVAL_MS) {
    inst.regenElapsedMs -= REGEN_INTERVAL_MS;
    healed += healMonster(inst, Math.max(1, Math.floor(inst.maxHp * REGEN_PERCENT / 100)));
  }
  return healed;
}

/** 荊棘：反彈基數 × 30%（floor） */
export function thornsReflectBase(inst: Pick<MonsterInstance, 'affixes'>, damage: number): number {
  if (!hasMonsterAffix(inst, 'thorns') || damage <= 0) return 0;
  return Math.floor(damage * THORNS_PERCENT / 100);
}
