/**
 * 技能結晶與技能更換（`docs/design/07-affix-ability.md` § 7S.8）。
 *
 * 結晶記每個參數在區間內的位置：0 = 最弱值、1 = 最好值（↓ 參數反向）。
 * 每個角色每種技能一顆，套用不消耗。
 */
import type { ClassName } from './character';
import {
  getAbilityDefinition, isAbilitySlot, resolveParamRange, formatParam,
  type Ability, type AbilityParamDef, type AbilityTemplate, type AbilityType,
} from './ability';

export interface AbilityCrystal {
  type: AbilityType;
  /** 參數 key → 區間位置（0~1） */
  positions: Record<string, number>;
}

/** 技能更換費用：每階 */
export const ABILITY_CRYSTAL_COST_PER_TIER = 1_500_000;

/** 位置的儲存精度（小數位數） */
const POSITION_DIGITS = 4;

type CrystalSource = { ability?: Ability; isCraftedGear?: boolean; maxAffixTier?: number };

/** 可拆出結晶：帶技能的掉落品（非製作品、非商店裝） */
export function yieldsAbilityCrystal(item: CrystalSource): boolean {
  return !!item.ability && !item.isCraftedGear && item.maxAffixTier === undefined;
}

function stepsOf(def: AbilityParamDef, template: AbilityTemplate): { min: number; max: number; step: number; steps: number } {
  const [min, max] = resolveParamRange(def, template);
  const step = def.step ?? 1;
  return { min, max, step, steps: Math.round((max - min) / step) };
}

function toPosition(def: AbilityParamDef, template: AbilityTemplate, value: number): number {
  const { min, step, steps } = stepsOf(def, template);
  if (steps === 0) return 0;
  const ratio = Math.min(1, Math.max(0, (value - min) / step / steps));
  const position = def.lowerIsBetter ? 1 - ratio : ratio;
  return Number(position.toFixed(POSITION_DIGITS));
}

function fromPosition(def: AbilityParamDef, template: AbilityTemplate, position: number): number {
  const { min, step, steps } = stepsOf(def, template);
  const ratio = def.lowerIsBetter ? 1 - position : position;
  return min + Math.round(ratio * steps) * step;
}

/** 從裝備的技能取出結晶；`template` 為該件模板 */
export function abilityToCrystal(ability: Ability, template: AbilityTemplate): AbilityCrystal | undefined {
  const def = getAbilityDefinition(ability.type);
  if (!def) return undefined;
  const positions: Record<string, number> = {};
  for (const p of def.params) positions[p.key] = toPosition(p, template, ability.params[p.key] ?? p.min);
  return { type: ability.type, positions };
}

/** 同種類合併：每個參數各取較好的位置 */
export function mergeCrystal(existing: AbilityCrystal | undefined, incoming: AbilityCrystal): AbilityCrystal {
  if (!existing || existing.type !== incoming.type) return incoming;
  const positions = { ...existing.positions };
  for (const [key, pos] of Object.entries(incoming.positions)) {
    positions[key] = Math.max(positions[key] ?? 0, pos);
  }
  return { type: incoming.type, positions };
}

/** 把結晶加進清單（依種類合併），回傳新清單 */
export function addCrystal(crystals: readonly AbilityCrystal[], incoming: AbilityCrystal): AbilityCrystal[] {
  const index = crystals.findIndex(c => c.type === incoming.type);
  if (index < 0) return [...crystals, incoming];
  const next = [...crystals];
  next[index] = mergeCrystal(crystals[index], incoming);
  return next;
}

/** 存檔讀回：剔除認不得的種類與參數，位置夾在 0~1，同種類合併 */
export function normalizeAbilityCrystals(raw: unknown): AbilityCrystal[] {
  if (!Array.isArray(raw)) return [];
  let crystals: AbilityCrystal[] = [];
  for (const entry of raw) {
    const type = (entry as { type?: unknown } | null)?.type;
    const def = typeof type === 'string' ? getAbilityDefinition(type as AbilityType) : undefined;
    if (!def) continue;
    const saved = (entry as { positions?: unknown }).positions;
    const positions: Record<string, number> = {};
    for (const p of def.params) {
      const v = saved && typeof saved === 'object' ? (saved as Record<string, unknown>)[p.key] : undefined;
      positions[p.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
    }
    crystals = addCrystal(crystals, { type: def.type, positions });
  }
  return crystals;
}

/** 合併後有沒有變強（新種類也算） */
export function crystalImproves(existing: AbilityCrystal | undefined, incoming: AbilityCrystal): boolean {
  if (!existing) return true;
  return Object.entries(incoming.positions).some(([key, pos]) => pos > (existing.positions[key] ?? 0));
}

/** 結晶套到目標模板的技能數值 */
export function crystalToAbility(crystal: AbilityCrystal, template: AbilityTemplate): Ability | undefined {
  const def = getAbilityDefinition(crystal.type);
  if (!def) return undefined;
  const params: Record<string, number> = {};
  for (const p of def.params) params[p.key] = fromPosition(p, template, crystal.positions[p.key] ?? 0);
  return { type: crystal.type, params };
}

export type CrystalApplyBlock =
  | 'notAbilitySlot'
  | 'crafted'
  | 'equipped'
  | 'wrongGroup'
  | 'classCannotEquip';

type CrystalTarget = { equipped?: boolean; isCraftedGear?: boolean };

const SLOT_GROUP: Readonly<Record<string, 'weapon' | 'accessory'>> = {
  rightHand: 'weapon', necklace: 'accessory', ring1: 'accessory', ring2: 'accessory',
};

/** 目標能否套用該結晶；可以時回 null */
export function getCrystalApplyBlock(
  crystal: AbilityCrystal, target: CrystalTarget, template: AbilityTemplate,
): CrystalApplyBlock | null {
  if (!isAbilitySlot(template)) return 'notAbilitySlot';
  if (target.isCraftedGear) return 'crafted';
  if (target.equipped) return 'equipped';
  const def = getAbilityDefinition(crystal.type);
  if (!def || def.group !== SLOT_GROUP[template.slot]) return 'wrongGroup';
  if (def.pool !== 'common') {
    const req = template.requiredClass;
    if (req && req.length > 0 && !req.includes(def.pool as ClassName)) return 'classCannotEquip';
  }
  return null;
}

export const CRYSTAL_APPLY_BLOCK_TEXT: Readonly<Record<CrystalApplyBlock, string>> = {
  notAbilitySlot: '只能套用到 T3 以上的武器、項鍊、戒指',
  crafted: '製作品不能套用',
  equipped: '身上的裝備不能套用',
  wrongGroup: '武器技能只能套用到武器，飾品技能只能套用到項鍊或戒指',
  classCannotEquip: '該職業無法裝備這件裝備',
};

/** 技能更換費用：1,500,000 × 目標階級 */
export function getCrystalApplyCost(tier: number): number {
  return ABILITY_CRYSTAL_COST_PER_TIER * tier;
}

/** 結晶效果敘述的片段：`value: true` 為代入的參數值，`range: true` 為該參數的區間 */
export interface CrystalEffectPart {
  text: string;
  value?: true;
  range?: true;
}

/** 參數區間：`(5 ~ 10%)`、`(1.0 ~ 2.0 秒)`、`(5 ~ 武器值)` */
function formatCrystalParamRange(def: AbilityParamDef): string {
  const max = def.max === 'weaponValue' ? '武器值' : formatParam(def, def.max);
  return `(${formatParam(def, def.min)} ~ ${max})`.replace(/ 秒 ~/, ' ~').replace(/% ~/, ' ~');
}

/** 結晶清單的效果敘述片段：每個參數代入數值後接區間；上限為武器值的參數以位置 % 表示 */
export function formatCrystalEffectParts(crystal: AbilityCrystal): CrystalEffectPart[] {
  const def = getAbilityDefinition(crystal.type);
  if (!def) return [];
  const parts: CrystalEffectPart[] = [];
  for (const piece of def.description.split(/(\{[a-zA-Z]+\})/)) {
    const param = def.params.find(p => `{${p.key}}` === piece);
    if (!param) {
      if (piece) parts.push({ text: piece });
      continue;
    }
    const pos = crystal.positions[param.key] ?? 0;
    parts.push({
      text: param.max === 'weaponValue'
        ? `${Math.round(pos * 100)}%`
        : formatParam(param, fromPosition(param, { slot: 'rightHand' }, pos)),
      value: true,
    });
    parts.push({ text: ` ${formatCrystalParamRange(param)}`, range: true });
  }
  return parts;
}

export function formatCrystalEffect(crystal: AbilityCrystal): string {
  return formatCrystalEffectParts(crystal).map(p => p.text).join('');
}
