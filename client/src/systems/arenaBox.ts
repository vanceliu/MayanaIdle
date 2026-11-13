/**
 * 競技場兌換箱（`55-arena.md` § 55.9）：票券兌換箱、開箱生成裝備。
 */
import { AFFIX_SOCKETS, generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage, rollDropAffixCount, type Affix } from '../models/affix';
import { getArenaTier, type ArenaTier } from '../models/arena';
import { getItemId } from '../models/items';
import type { ClassName } from '../models/character';
import type { EquipmentInstance, EquipmentTemplate } from '../models/equipment';
import { rollNewInstanceFields } from './templateSync';
import { random } from '../core/rng';

export type ArenaBoxKind = 'weapon' | 'armor' | 'accessory';

const KIND_LABEL: Record<ArenaBoxKind, string> = { weapon: '武器', armor: '防具', accessory: '飾品' };

/** § 55.9：每個兌換箱的票券價格 */
export const ARENA_BOX_PRICE: Record<ArenaBoxKind, number> = { weapon: 10, armor: 6, accessory: 6 };
/** § 55.9：開出擬態品的機率 */
export const ARENA_MIMIC_CHANCE = 0.5;
/** § 55.9：非擬態品帶封印詞綴的機率 */
export const ARENA_SEALED_CHANCE = 0.1;

export interface ArenaBoxDef {
  itemId: number;
  tier: ArenaTier;
  kind: ArenaBoxKind;
  ticketItemId: number;
  price: number;
}

function requireItemId(name: string): number {
  const id = getItemId(name);
  if (id == null) throw new Error(`競技場道具不存在：${name}`);
  return id;
}

/** 開放段位的票券道具 id */
export const ARENA_TICKET_ITEM_IDS: Partial<Record<ArenaTier, number>> = Object.fromEntries(
  ([4, 5, 6] as const).map(t => [t, requireItemId(`T${t} 競技場票券`)]),
);

export const ARENA_BOXES: readonly ArenaBoxDef[] = ([4, 5, 6] as const).flatMap(tier =>
  (Object.keys(KIND_LABEL) as ArenaBoxKind[]).map(kind => ({
    itemId: requireItemId(`T${tier} ${KIND_LABEL[kind]}兌換箱`),
    tier,
    kind,
    ticketItemId: ARENA_TICKET_ITEM_IDS[tier]!,
    price: ARENA_BOX_PRICE[kind],
  })));

export function getArenaBox(itemId: number): ArenaBoxDef | undefined {
  return ARENA_BOXES.find(b => b.itemId === itemId);
}

export function isArenaTicketItemId(itemId: number): boolean {
  return Object.values(ARENA_TICKET_ITEM_IDS).includes(itemId);
}

export function arenaBoxKindOf(template: Pick<EquipmentTemplate, 'slot'>): ArenaBoxKind {
  if (template.slot === 'rightHand') return 'weapon';
  if (template.slot === 'necklace' || template.slot === 'ring1' || template.slot === 'ring2') return 'accessory';
  return 'armor';
}

/** § 55.9：該階該類的全部模板（不含新手裝），不分職業 */
export function arenaBoxCandidates(box: ArenaBoxDef, templates: readonly EquipmentTemplate[]): EquipmentTemplate[] {
  return templates.filter(t => t.tier === box.tier && t.acquireType !== 'starter' && arenaBoxKindOf(t) === box.kind);
}

/**
 * § 55.9：開出一件裝備的存檔紀錄（未寫 DB）。詞綴依野外 Boss 掉落；擬態品 4 條一般詞綴＋封印詞綴、
 * 武器與飾品必帶最低端隨機技能；非擬態品 10% 帶封印詞綴、隨機技能依掉落。
 */
export function rollArenaBoxEquipment(
  box: ArenaBoxDef,
  template: EquipmentTemplate,
  ownerId: number,
  className: ClassName,
): Partial<EquipmentInstance> {
  const mimic = random() < ARENA_MIMIC_CHANCE;
  const category = getAffixCategoryForSlot(template.slot, template.type);
  const areaLevel = getArenaTier(box.tier)!.level;
  const weaponBaseDamage = getWeaponBaseDamage(template);
  const affixes: Affix[] = generateAffixes(category, areaLevel, mimic ? AFFIX_SOCKETS : rollDropAffixCount(), true, { weaponBaseDamage });
  if (mimic || random() < ARENA_SEALED_CHANCE) {
    const [sealed] = generateAffixes(category, areaLevel, 1, true, {
      weaponBaseDamage, noSpecialAffix: true, excludeTypes: affixes.map(a => a.type),
    });
    if (sealed) affixes.push({ ...sealed, sealed: true });
  }
  const fields = rollNewInstanceFields(template, mimic
    ? { channel: 'shop', className, guaranteed: true }
    : { channel: 'drop', className });
  return {
    templateId: template.id!,
    slot: template.slot,
    quality: 0,
    enhancement: 0,
    ...fields,
    affixes,
    ownerId,
    equipped: false,
    ...(mimic ? { isMimicGear: true } : {}),
  };
}
