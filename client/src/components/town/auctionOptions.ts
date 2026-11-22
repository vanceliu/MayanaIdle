/** 拍賣場搜尋的選項（`57-auction.md` § 57.6）：類別、部位／類型、詞綴分組。遊戲視窗與 demo 共用 */
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import { SLOT_NAMES, type EquipSlot } from '../../models/equipment';
import { AFFIX_DEFINITIONS, SPECIAL_AFFIX_DEFINITIONS } from '../../models/affix';
import {
  UNIQUE_AFFIX_BY_TEMPLATE, UNIQUE_AFFIX_POOLS, getUniqueAffixDefinition, type UniqueAffixType,
} from '../../models/uniqueAffix';
import type { BagItemType } from '../../models/bagItem';
import type { AuctionCategory, AuctionKind } from '../../models/auction';
import { UNIQUE_POOL_LABELS } from '../../wiki/components/UniqueAffixTable';

export const SEARCH_KIND_LABEL: Record<AuctionKind, string> = { equipment: '裝備', item: '道具' };

const BAG_TYPE_LABEL: Record<BagItemType, string> = { material: '素材', potion: '藥水', scroll: '卷軸', spellbook: '魔法書' };

/** 「裝備」底下的部位（戒指只有一項）、「道具」底下的類型 */
export const CATEGORY_OPTIONS: Record<AuctionKind, { value: AuctionCategory; label: string }[]> = {
  equipment: [
    { value: 'all', label: '全部' },
    ...(Object.keys(SLOT_NAMES) as EquipSlot[]).filter(s => s !== 'ring2')
      .map(s => ({ value: `slot:${s}` as AuctionCategory, label: s === 'ring1' ? '戒指' : SLOT_NAMES[s] })),
  ],
  item: [
    { value: 'all', label: '全部' },
    ...(Object.keys(BAG_TYPE_LABEL) as BagItemType[]).map(t => ({ value: `item:${t}` as AuctionCategory, label: BAG_TYPE_LABEL[t] })),
  ],
};

export interface AffixOption { type: string; name: string }
export interface AffixOptionGroup { label: string; options: AffixOption[] }

/** T7 獨有詞綴依部位（`07-affix-tier7.md` § 7T.5）：隨機池，再接腰帶／左手的指定詞綴 */
const T7_PARTS: { label: string; types: string[] }[] = [
  ...(Object.keys(UNIQUE_AFFIX_POOLS) as (keyof typeof UNIQUE_AFFIX_POOLS)[])
    .map(pool => ({ label: UNIQUE_POOL_LABELS[pool], types: UNIQUE_AFFIX_POOLS[pool] as string[] })),
  ...(['belt', 'leftHand'] as EquipSlot[]).map(slot => ({
    label: SLOT_NAMES[slot],
    types: Object.entries(UNIQUE_AFFIX_BY_TEMPLATE)
      .filter(([id]) => EQUIPMENT_SEEDS.find(t => t.id === Number(id))?.slot === slot)
      .map(([, type]) => type as string),
  })),
];

/**
 * 詞綴選單分組：一般詞綴依 § 7.4 分類、特殊詞綴、T7 獨有詞綴依部位。
 * 同一種類只列一次，放在第一次出現的組（T7 與一般詞綴同種類的併入一般詞綴）
 */
export const AFFIX_OPTION_GROUPS: AffixOptionGroup[] = (() => {
  const seen = new Set<string>();
  const group = (label: string, entries: AffixOption[]): AffixOptionGroup => {
    const options = entries.filter(o => !seen.has(o.type));
    for (const o of options) seen.add(o.type);
    return { label, options };
  };
  const generalGroups = [...new Set(AFFIX_DEFINITIONS.map(d => d.group))];
  return [
    ...generalGroups.map(g => group(g, AFFIX_DEFINITIONS.filter(d => d.group === g).map(d => ({ type: d.type, name: d.name })))),
    group('特殊詞綴', SPECIAL_AFFIX_DEFINITIONS.map(d => ({ type: d.type, name: d.name }))),
    ...T7_PARTS.map(p => group(`T7 · ${p.label}`, p.types.map(type => ({ type, name: getUniqueAffixDefinition(type as UniqueAffixType).name })))),
  ].filter(g => g.options.length > 0);
})();

const AFFIX_OPTIONS = AFFIX_OPTION_GROUPS.flatMap(g => g.options);
export const affixName = (type: string) => AFFIX_OPTIONS.find(o => o.type === type)?.name ?? type;

/** 一件裝備最多 4 條詞綴＋1 條 T7 獨有詞綴，選更多不可能有符合的 */
export const MAX_AFFIX_FILTERS = 5;
