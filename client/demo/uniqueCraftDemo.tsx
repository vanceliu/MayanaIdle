/**
 * 獨特製作（`unique-craft.html`，`06-equipment-acquire.md` § 6A.3.1／§ 6A.6／§ 6A.3「拆解」）：鐵匠鋪新分頁的版面樣本。
 * 素材判定走遊戲的 `evaluateCraftRequirements`（以獨特配方代入），產物 tooltip 用遊戲的 `EquipmentDetail`。
 * seed 尚無 `uniqueCraftMaterials` 時，依「獨特配方分配規則」產生假配方；持有量與前置實例為假資料。
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { CraftMaterial, EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import { ARMOR_STABILITY_MIN, ARMOR_STABILITY_MAX } from '../src/models/equipment';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { EQUIPMENT_TIER_NAMES, getEquipmentInstanceTierColor, getEquipmentTierColor } from '../src/models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../src/models/iconMap';
import { getItemById, getItemId } from '../src/models/items';
import { GameIcon } from '../src/components/GameIcon';
import { Tooltip } from '../src/components/Tooltip';
import { makeBagItem, type BagItem } from '../src/models/bagItem';
import { CLASS_NAMES_ZH } from '../src/models/character';
import {
  CRAFT_SOURCE_ORDER, evaluateCraftRequirements, type CraftSourceKind, type CraftSources,
} from '../src/systems/craftQuestSystem';
import { getDismantleOutcome } from '../src/systems/crafting';
import {
  generateAffixes, getAffixCategoryOf, getWeaponBaseDamage, isTierlessAffixType, rollAffixValue,
  type Affix, type AffixType,
} from '../src/models/affix';
import { craftRequiresAbility, getAbilityDefinition, rollAbility } from '../src/models/ability';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const GOLD = 1_250_000;
const CLASS_NAME = 'knight' as const;
const SOURCE_LABEL: Record<CraftSourceKind, string> = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' };
const UNIQUE_SUFFIX = '(獨)';
const CRAFTED_SUFFIX = '(鍛)';
const MIMIC_SUFFIX = '(擬)';

/** 獨特配方分配規則（§ 6A.3.1）的材料池，名稱取自 `30-items.md`「獨特材料」與 Boss 專屬素材 */
const UNIQUE_POOLS: Record<4 | 5 | 6, string[]> = {
  4: [
    '冰牙狼王之牙', '冰晶蝠翼', '大巫師法珠', '霜甲隊長的臂章', '象牙魔導石', '霜核碎晶', '霜甲統領的戰旗', '大頭目的戰角',
    '腐根樹心', '血祭聖杯', '巨像石心', '首領蜥鱗', '守護靈鏡片', '幻后的淚珠', '碎鏡核心', '逆影羽飾', '典獄長的鐐銬',
    '溺亡者之冠', '百夫長骨盔', '巨人酋長的戰盔', '飛龍王之鱗', '軍團長骨符', '將軍的亡魂印',
    '試煉飛龍之鱗', '雪地之主的凍心', '惡魔之瞳',
  ],
  5: [
    '巨蟲母甲殼', '潮汐之核', '女王毒牙', '神射將的箭袋', '親衛隊長的護符', '怨魂結晶', '獄卒長之鑰', '狙擊官的瞄具',
    '典獄官徽記', '弓術長的弓弦', '封印符文', '屍王封印石',
    '蛇魔毒囊', '獄王深海珠', '巨龍逆鱗', '皇女毒腺', '哥布林王冠碎片', '吸血鬼血晶', '殭屍王心臟', '約特勒龍鱗',
  ],
  6: ['遠古騎士紋章', '殭屍王心臟', '約特勒龍鱗', '冥王靈魂石', '伊莉絲霜核', '伊弗利特熔心', '守護者印記', '死神碎魂'],
};
const UNIQUE_AMOUNTS: Record<4 | 5 | 6, number[]> = { 4: [4, 3, 2], 5: [6, 5, 4, 3], 6: [8, 6, 5, 4] };
const T6_FIXED = '妖精王獠牙';

/** 詞綴 Tier 保底（§ 6A.6「製作品 (獨)」）：T6 條數 */
const UNIQUE_T6_COUNT: Record<4 | 5 | 6, number> = { 4: 0, 5: 1, 6: 3 };
const TIER_RULE_TEXT: Record<4 | 5 | 6, string> = { 4: '4 條全 T5', 5: '1 條 T6、3 條 T5', 6: '3 條 T6、1 條 T5' };

const CATEGORIES = [
  { key: 'sword', label: '單手劍' }, { key: 'axe', label: '單手斧' }, { key: 'mace', label: '鈍器' },
  { key: 'staff', label: '法杖' }, { key: 'bow', label: '弓' }, { key: 'twoHandSword', label: '雙手劍' },
  { key: 'twoHandAxe', label: '雙手斧' }, { key: 'twoHandStaff', label: '雙手法杖' }, { key: 'dualBlade', label: '雙刀' },
  { key: 'claw', label: '鋼爪' }, { key: 'shield', label: '盾牌' }, { key: 'magicBook', label: '魔導書' },
  { key: 'armGuard', label: '臂甲' }, { key: 'armor-helmet', label: '頭盔' }, { key: 'armor-chest', label: '胸甲' },
  { key: 'armor-shirt', label: '上衣' }, { key: 'armor-cloak', label: '斗篷' }, { key: 'armor-gloves', label: '手套' },
  { key: 'armor-boots', label: '鞋子' }, { key: 'armor-belt', label: '腰帶' }, { key: 'armor-necklace', label: '項鍊' },
  { key: 'armor-ring1', label: '戒指' },
];

const inCategory = (t: EquipmentTemplate, key: string) =>
  key.startsWith('armor-') ? t.type === 'armor' && t.slot === key.replace('armor-', '') : t.type === key;

const RECIPES = templates
  .filter(t => t.acquireType === 'craft' && t.craftMaterials?.length && (t.tier === 4 || t.tier === 5 || t.tier === 6))
  .sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || a.id! - b.id!);

type UniqueTier = 4 | 5 | 6;
const tierOf = (t: EquipmentTemplate) => t.tier as UniqueTier;

/** seed 有 `uniqueCraftMaterials` 用 seed；沒有就依分配規則在同階內輪替出一份 */
function uniqueMaterialsOf(recipe: EquipmentTemplate): CraftMaterial[] {
  const seeded = (recipe as EquipmentTemplate & { uniqueCraftMaterials?: CraftMaterial[] }).uniqueCraftMaterials;
  if (seeded?.length) return seeded;
  const tier = tierOf(recipe);
  const index = RECIPES.filter(r => r.tier === tier).findIndex(r => r.id === recipe.id);
  const pool = UNIQUE_POOLS[tier];
  const amounts = UNIQUE_AMOUNTS[tier];
  const names = tier === 6
    ? [T6_FIXED, ...[0, 1, 2].map(k => pool[(index * 3 + k) % pool.length])]
    : amounts.map((_, k) => pool[(index * amounts.length + k) % pool.length]);
  return names.map((name, k) => ({ itemId: getItemId(name)!, amount: amounts[k] }));
}

/** 以獨特配方代入，好讓遊戲的 `evaluateCraftRequirements` 直接判定素材與金幣 */
const asUniqueRecipe = (recipe: EquipmentTemplate): EquipmentTemplate =>
  ({ ...recipe, craftMaterials: uniqueMaterialsOf(recipe), craftPrerequisiteWeapon: undefined });

type Origin = 'drop' | 'crafted' | 'unique' | 'mimic';
const ORIGIN_SUFFIX: Record<Origin, string> = { drop: '', crafted: CRAFTED_SUFFIX, unique: UNIQUE_SUFFIX, mimic: MIMIC_SUFFIX };

let nextId = 1;
function makeInstance(tpl: EquipmentTemplate, origin: Origin, enhancement: number, affixes: Affix[], extra: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const { id: _t, acquireType: _a, craftMaterials: _m, craftPrerequisiteWeapon: _p, craftGold: _g, buyPrice: _b, tier: _tier, ...base } = tpl;
  return {
    ...base, id: nextId++, templateId: tpl.id!, name: `${tpl.name}${ORIGIN_SUFFIX[origin]}`, quality: 0, enhancement, affixes,
    ownerId: 1, equipped: false,
    ...(origin === 'crafted' ? { isCraftedGear: true } : {}),
    ...(origin === 'mimic' ? { isMimicGear: true } : {}),
    ...(origin === 'unique' ? { isUniqueCraftedGear: true } : {}),
    ...extra,
  } as EquipmentInstance;
}

/** 製作品 (獨) 的詞綴：4 條、不出特殊詞綴，Tier 依 § 6A.6 保底；數值在該 Tier 範圍內均等抽 */
function rollUniqueAffixes(tpl: EquipmentTemplate): Affix[] {
  const category = getAffixCategoryOf({ slot: tpl.slot, type: tpl.type });
  const affixes = generateAffixes(category, 60, 4, false, { noSpecialAffix: true, weaponBaseDamage: getWeaponBaseDamage(tpl) });
  const tiered = affixes.map((a, i) => (isTierlessAffixType(a.type) ? -1 : i)).filter(i => i >= 0);
  const t6 = new Set([...tiered].sort(() => Math.random() - 0.5).slice(0, UNIQUE_T6_COUNT[tierOf(tpl)]));
  return affixes.map((a, i) => {
    if (isTierlessAffixType(a.type)) return a;
    const tier = t6.has(i) ? 6 : 5;
    return { ...a, tier, value: rollAffixValue(tier, a.type as AffixType, category) };
  });
}

function rollUniqueProduct(tpl: EquipmentTemplate): EquipmentInstance {
  const ability = craftRequiresAbility(tpl) ? rollAbility(tpl, { channel: 'drop', className: CLASS_NAME, guaranteed: true }) : undefined;
  return makeInstance(tpl, 'unique', 0, rollUniqueAffixes(tpl), ability ? { ability } : {});
}

const SOME_AFFIXES = (tpl: EquipmentTemplate, n: number) => rollUniqueAffixes(tpl).slice(0, n).map(a => (
  isTierlessAffixType(a.type) ? a : { ...a, tier: Math.max(1, a.tier - 2) }
));

type Scenario = 'ready' | 'lacking' | 'noPrereq';
type MimicStyle = 'grey' | 'hide';

interface Candidate { source: CraftSourceKind; item: EquipmentInstance }

/** 假資料：每份配方各有一組同模板實例；(擬) 列出但不可選 */
function buildCandidates(recipe: EquipmentTemplate, scenario: Scenario): Candidate[] {
  const mimic: Candidate = { source: 'bag', item: makeInstance(recipe, 'mimic', 0, rollUniqueAffixes(recipe)) };
  if (scenario === 'noPrereq') return [mimic];
  return [
    { source: 'bag', item: makeInstance(recipe, 'drop', 3, SOME_AFFIXES(recipe, 2)) },
    mimic,
    { source: 'personal', item: makeInstance(recipe, 'crafted', 0, SOME_AFFIXES(recipe, 4)) },
    { source: 'shared', item: makeInstance(recipe, 'unique', 5, rollUniqueAffixes(recipe)) },
  ];
}

/** 假資料：配方需求量分到三處；「部分不足」時每份配方第一種材料少 2 */
function buildSources(recipes: EquipmentTemplate[], scenario: Scenario): CraftSources {
  const need = new Map<number, number>();
  const shortIds = new Set<number>();
  for (const r of recipes) {
    uniqueMaterialsOf(r).forEach((m, i) => {
      need.set(m.itemId, Math.max(need.get(m.itemId) ?? 0, m.amount));
      if (i === 0) shortIds.add(m.itemId);
    });
  }
  const split = (fn: (have: number) => number) => [...need].map(([id, n]) => {
    const have = scenario === 'lacking' && shortIds.has(id) ? Math.max(0, n - 2) : n + 1;
    return makeBagItem(id, fn(have))!;
  }).filter((b): b is BagItem => b != null && b.amount > 0);
  return {
    bag: { materials: split(h => Math.ceil(h / 2)), equipment: [] },
    personal: { materials: split(h => Math.floor(h / 2) - Math.floor(h / 4)), equipment: [] },
    shared: { materials: split(h => Math.floor(h / 4)), equipment: [] },
  };
}

const instanceLabel = (item: EquipmentInstance) => `${item.name}${item.enhancement > 0 ? ` +${item.enhancement}` : ''}`;

function InstanceName({ item }: { item: EquipmentInstance }) {
  const color = getEquipmentInstanceTierColor(item, templates);
  return (
    <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>
      <span className="bs-prereq-name" style={{ color }}>
        <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={14} color={color} />
        {instanceLabel(item)}
      </span>
    </Tooltip>
  );
}

/** 挑選視窗：同模板實例；(擬) 灰掉不可選（或不列出） */
/** 前置裝備不可用的原因（§ 6A.3.1）：(獨)、(擬) 不可；可用回 null */
function prereqBlockReason(item: EquipmentInstance): string | null {
  if ((item as EquipmentInstance & { isUniqueCraftedGear?: boolean }).isUniqueCraftedGear) return '獨特製作品不可用';
  if (item.isMimicGear) return '擬態品不可用';
  return null;
}

function PrereqPicker({ recipe, candidates, chosen, mimicStyle, onChoose, onClose }: {
  recipe: EquipmentTemplate; candidates: Candidate[]; chosen: number | undefined; mimicStyle: MimicStyle;
  onChoose: (id: number) => void; onClose: () => void;
}) {
  const shown = mimicStyle === 'hide' ? candidates.filter(c => !prereqBlockReason(c.item)) : candidates;
  const usable = candidates.filter(c => !prereqBlockReason(c.item)).length;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bs-prereq-modal" role="dialog" aria-label="選擇前置裝備" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">選擇前置裝備：{recipe.name}（{usable} 件）</span>
          <button className="modal-close" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body bs-prereq-list" role="radiogroup">
          <p className="bs-prereq-hint">同一模板的掉落品、商店品、{CRAFTED_SUFFIX} 皆可（{UNIQUE_SUFFIX}、擬態品不可）；選定的那件製作後消失。</p>
          {shown.map(({ source, item }) => {
            const reason = prereqBlockReason(item);
            const disabled = reason !== null;
            return (
              <span
                key={item.id}
                role="radio"
                aria-checked={chosen === item.id}
                aria-disabled={disabled}
                className={`bs-prereq-option ${chosen === item.id ? 'selected' : ''}${disabled ? ' is-disabled' : ''}`}
                onClick={() => { if (disabled) return; onChoose(item.id!); onClose(); }}
              >
                <span className="bs-prereq-radio" />
                <InstanceName item={item} />
                <span className="bs-prereq-meta">詞綴 {item.affixes.length} 條</span>
                {disabled
                  ? <span className="bs-prereq-disabled-reason">{reason}</span>
                  : <span className="bs-source-tag">{SOURCE_LABEL[source]}</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RecipeCard({ recipe, sources, candidates, selected, chosen, onSelect, onOpenPicker, tracked, onTrack }: {
  recipe: EquipmentTemplate; sources: CraftSources; candidates: Candidate[]; selected: boolean; chosen: Candidate | undefined;
  onSelect: () => void; onOpenPicker: () => void; tracked: boolean; onTrack: () => void;
}) {
  const tier = tierOf(recipe);
  const status = evaluateCraftRequirements(asUniqueRecipe(recipe), sources, GOLD);
  const usable = candidates.filter(c => !prereqBlockReason(c.item));
  const prereqEnough = usable.length >= 1;
  const ready = status.ready && prereqEnough;
  const color = getEquipmentTierColor(recipe);
  const need = recipe.craftGold ?? 0;
  return (
    <div className={`shop-item bs-shop-item ${selected ? 'selected' : ''} ${ready ? '' : 'disabled-look'}`} onClick={onSelect}>
      <div className="shop-item-info">
        <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GameIcon name={getEquipIcon(recipe.type === 'armor' ? recipe.slot : recipe.type)} size={16} color={color} />
          {recipe.name}
        </span>
        <span className="shop-item-desc">
          {recipe.smallMonsterDamage ? `攻擊: ${recipe.smallMonsterDamage}/${recipe.largeMonsterDamage}` : ''}
          {recipe.defense ? `防禦: ${recipe.defense}` : ''}
          {` | 重量${recipe.weight ?? '—'}`}
          {` | 安定值${recipe.stability ?? `${ARMOR_STABILITY_MIN}~${ARMOR_STABILITY_MAX}`}`}
        </span>
        <span className="shop-item-desc">
          {EQUIPMENT_TIER_NAMES[tier]} | {recipe.requiredClass?.length
            ? recipe.requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、')
            : '全職業'}
        </span>
        {/* § 6A.6「製作品 (獨)」：產物規則一行說完，取代一般製作的隨機技能下拉 */}
        <span className="shop-item-desc bs-unique-rule">
          產物 <strong>{recipe.name}{UNIQUE_SUFFIX}</strong>：詞綴 4 條隨機（{TIER_RULE_TEXT[tier]}）
          {craftRequiresAbility(recipe) && '｜必帶隨機技能（隨機抽）'}｜不可使用印記
        </span>
        <span className={`shop-item-desc bs-ability-row ${chosen ? '' : 'lacking'}`}>
          <span className="bs-ability-label">前置裝備</span>
          {chosen ? (
            <>
              <InstanceName item={chosen.item} />
              <span className="bs-source-tag-inline">{SOURCE_LABEL[chosen.source]}</span>
            </>
          ) : (
            <span className="bs-dim">{usable.length ? '未選擇' : `沒有可用的${recipe.name}`}</span>
          )}
          <button className="bs-prereq-open" disabled={usable.length === 0} onClick={e => { e.stopPropagation(); onSelect(); onOpenPicker(); }}>
            {chosen ? '更換' : '選擇'}
          </button>
        </span>
        <span className="shop-item-desc bs-craft-materials">
          <span className={`bs-craft-mat ${GOLD >= need ? '' : 'lacking'}`}>
            <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
            <span className="bs-craft-mat-name" style={{ color: 'var(--accent-gold)' }}>金幣</span>
            <span className="bs-craft-mat-count">{GOLD.toLocaleString()}/{need.toLocaleString()}</span>
          </span>
          <span className={`bs-craft-mat ${prereqEnough ? '' : 'lacking'}`}>
            <GameIcon name={getEquipIcon(recipe.type === 'armor' ? recipe.slot : recipe.type)} size={14} color={color} />
            <span className="bs-craft-mat-name" style={prereqEnough ? { color } : undefined}>{recipe.name}</span>
            <span className="bs-craft-mat-count">{Math.min(usable.length, 99)}/1</span>
          </span>
          {status.materials.map(m => {
            const def = getItemById(m.itemId);
            const { icon, color: matColor, glowClass } = resolveItemIcon(def, 'material');
            return (
              <Tooltip key={m.itemId} position="top" content={(
                <div className="bs-mat-source-tooltip">
                  {CRAFT_SOURCE_ORDER.map(s => <div key={s}>{SOURCE_LABEL[s]} {m.bySource[s]}</div>)}
                </div>
              )}>
                <span className={`bs-craft-mat ${m.enough ? '' : 'lacking'}`}>
                  <GameIcon name={icon} size={14} color={matColor} className={glowClass} />
                  <span className="bs-craft-mat-name" style={m.enough ? { color: matColor } : undefined}>{def?.name ?? '未知素材'}</span>
                  <span className="bs-craft-mat-count">{m.have}/{m.need}</span>
                </span>
              </Tooltip>
            );
          })}
        </span>
      </div>
      <div className="shop-item-actions">
        <button disabled={!ready || !chosen || !selected} onClick={e => {
          e.stopPropagation();
          window.alert(`製作完成：${recipe.name}${UNIQUE_SUFFIX}\n消耗前置裝備：${instanceLabel(chosen!.item)}（${SOURCE_LABEL[chosen!.source]}）`);
        }}>製作</button>
        {tracked
          ? <button className="btn-danger" onClick={e => { e.stopPropagation(); onTrack(); }}>取消追蹤</button>
          : <button onClick={e => { e.stopPropagation(); onTrack(); }}>製作追蹤</button>}
      </div>
    </div>
  );
}

function UniqueCraftTab({ scenario, mimicStyle, selected, onSelect, tracked, onTrack }: {
  scenario: Scenario; mimicStyle: MimicStyle; selected: EquipmentTemplate; onSelect: (r: EquipmentTemplate) => void;
  tracked: number | null; onTrack: (id: number) => void;
}) {
  const [category, setCategory] = useState(() => CATEGORIES.find(c => inCategory(selected, c.key))!.key);
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const [picker, setPicker] = useState<EquipmentTemplate | null>(null);
  const recipes = RECIPES.filter(r => inCategory(r, category));
  const sources = useMemo(() => buildSources(RECIPES, scenario), [scenario]);
  const candidates = useMemo(
    () => new Map(RECIPES.map(r => [r.id!, buildCandidates(r, scenario)])),
    [scenario],
  );
  const chosenOf = (r: EquipmentTemplate) => candidates.get(r.id!)!.find(c => c.item.id === chosen[r.id!] && !prereqBlockReason(c.item));
  return (
    <>
      <div className="bs-craft-categories">
        {CATEGORIES.filter(c => RECIPES.some(r => inCategory(r, c.key))).map(c => (
          <button key={c.key} className={category === c.key ? 'active' : ''} onClick={() => setCategory(c.key)}>{c.label}</button>
        ))}
      </div>
      <div className="panel-scroll">
        <div className="shop-items">
          {recipes.map(r => (
            <RecipeCard
              key={r.id} recipe={r} sources={sources} candidates={candidates.get(r.id!)!}
              selected={selected.id === r.id} chosen={chosenOf(r)}
              onSelect={() => onSelect(r)} onOpenPicker={() => setPicker(r)}
              tracked={tracked === r.id} onTrack={() => onTrack(r.id!)}
            />
          ))}
        </div>
      </div>
      {picker && (
        <PrereqPicker
          recipe={picker} candidates={candidates.get(picker.id!)!} chosen={chosen[picker.id!]} mimicStyle={mimicStyle}
          onChoose={id => setChosen(prev => ({ ...prev, [picker.id!]: id }))} onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

/** 拆解分頁：掉落品、(鍛)、(獨) 三列對照；(獨) 退一般配方 100%、獨特材料不退、不留結晶 */
function DismantleTab({ recipe }: { recipe: EquipmentTemplate }) {
  const items = useMemo(() => {
    const ability = craftRequiresAbility(recipe) ? rollAbility(recipe, { channel: 'drop', className: CLASS_NAME, guaranteed: true }) : undefined;
    const withAbility = ability ? { ability } : {};
    return [
      makeInstance(recipe, 'drop', 2, SOME_AFFIXES(recipe, 3), withAbility),
      makeInstance(recipe, 'crafted', 0, SOME_AFFIXES(recipe, 4), withAbility),
      makeInstance(recipe, 'unique', 4, rollUniqueAffixes(recipe), withAbility),
    ];
  }, [recipe]);
  return (
    <div className="panel-scroll">
      <p className="shop-item-desc">
        有配方的退還一半材料，{UNIQUE_SUFFIX} 製作品退還一般配方的全部材料（獨特材料不退）；前置裝備不退；掉落品的隨機技能會存成技能結晶。身上的裝備不能拆。
      </p>
      <div className="shop-items">
        {items.map(item => {
          const isUnique = (item as EquipmentInstance & { isUniqueCraftedGear?: boolean }).isUniqueCraftedGear;
          const outcome = getDismantleOutcome(item, recipe);
          const yields = isUnique ? recipe.craftMaterials! : outcome.yields;
          const crystal = isUnique ? undefined : outcome.crystal;
          const color = getEquipmentInstanceTierColor(item, templates);
          const confirmText = isUnique
            ? `確定拆解 ${instanceLabel(item)}？退還一般配方的全部材料，獨特材料不退。${item.enhancement > 0 ? `\n強化 +${item.enhancement} 不退還。` : ''}`
            : `確定拆解 ${instanceLabel(item)}？只退還一半材料。${item.enhancement > 0 ? `\n強化 +${item.enhancement} 不退還。` : ''}`;
          return (
            <div key={item.id} className="shop-item bs-shop-item">
              <div className="shop-item-info">
                <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>
                  <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={color} />
                    {instanceLabel(item)}
                  </span>
                </Tooltip>
                <span className="shop-item-desc bs-craft-materials">
                  {!yields && <span className="bs-dim">不退材料</span>}
                  {yields?.map(m => {
                    const def = getItemById(m.itemId);
                    const { icon, color: matColor, glowClass } = resolveItemIcon(def, 'material');
                    return (
                      <span key={m.itemId} className="bs-craft-mat">
                        <GameIcon name={icon} size={14} color={matColor} className={glowClass} />
                        <span className="bs-craft-mat-name" style={{ color: matColor }}>{def?.name ?? '未知素材'}</span>
                        <span className="bs-craft-mat-count">×{m.amount}</span>
                      </span>
                    );
                  })}
                </span>
                {crystal && (
                  <span className="shop-item-desc">
                    <span className="bs-ability-text">技能結晶：{getAbilityDefinition(crystal.type)!.name}</span>
                    <span className="bs-crystal-mark">（新）</span>
                  </span>
                )}
                {!crystal && item.ability && (item.isCraftedGear || isUnique) && (
                  <span className="shop-item-desc bs-dim">製作品的隨機技能不會留下結晶</span>
                )}
                {isUnique && <span className="shop-item-desc bs-dim">獨特材料不退</span>}
              </div>
              <div className="shop-item-actions">
                <button className="btn-danger" onClick={() => window.confirm(confirmText)}>拆解</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Tracker({ recipe }: { recipe: EquipmentTemplate | undefined }) {
  if (!recipe) return <p className="empty-text">在配方卡片按「製作追蹤」後顯示</p>;
  const status = evaluateCraftRequirements(asUniqueRecipe(recipe), buildSources(RECIPES, 'ready'), GOLD);
  return (
    <div className="quest-tracker-content">
      <div className={`quest-tracker-item ${status.ready ? 'completable' : ''}`}>
        <div className="tracker-title"><span className="tracker-source">[製作]</span>{recipe.name}{UNIQUE_SUFFIX}</div>
        <div className="tracker-craft-reqs">
          <span className="tracker-craft-req">金幣 <strong>{GOLD.toLocaleString()}/{(recipe.craftGold ?? 0).toLocaleString()}</strong></span>
          <span className="tracker-craft-req">{recipe.name} <strong>3/1</strong></span>
          {status.materials.map(m => (
            <span key={m.itemId} className={`tracker-craft-req ${m.enough ? '' : 'lacking'}`}>
              {getItemById(m.itemId)?.name} <strong>{m.have}/{m.need}</strong>
            </span>
          ))}
        </div>
        <div className="tracker-actions">
          {status.ready && <span className="quest-highlight">可製作</span>}
          <button className="btn-danger tracker-cancel">取消</button>
        </div>
      </div>
    </div>
  );
}

type Tab = 'craft' | 'unique' | 'dismantle' | 'swap';
const TAB_LABELS: Record<Tab, string> = { craft: '裝備製作', unique: '獨特製作', dismantle: '裝備拆解', swap: '技能更換' };

function Radio<T extends string>({ name, value, current, label, onChange }: {
  name: string; value: T; current: T; label: string; onChange: (v: T) => void;
}) {
  return <label><input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} /> {label}</label>;
}

const DEFAULT_RECIPE = RECIPES.find(r => r.name === '泰坦戰斧') ?? RECIPES.find(r => r.tier === 5)!;

function App() {
  const [tab, setTab] = useState<Tab>('unique');
  const [scenario, setScenario] = useState<Scenario>('ready');
  const [mimicStyle, setMimicStyle] = useState<MimicStyle>('grey');
  const [selected, setSelected] = useState<EquipmentTemplate>(DEFAULT_RECIPE);
  const [tracked, setTracked] = useState<number | null>(null);
  const [rollKey, setRollKey] = useState(0);
  const product = useMemo(() => rollUniqueProduct(selected), [selected, rollKey]);
  const seeded = RECIPES.some(r => (r as EquipmentTemplate & { uniqueCraftMaterials?: unknown }).uniqueCraftMaterials);
  return (
    <>
      <div className="demo-bar">
        <fieldset>
          <legend>情境</legend>
          <Radio name="sc" value="ready" current={scenario} label="材料齊全" onChange={setScenario} />
          <Radio name="sc" value="lacking" current={scenario} label="材料不足" onChange={setScenario} />
          <Radio name="sc" value="noPrereq" current={scenario} label="只有 (擬)，沒有可用前置" onChange={setScenario} />
        </fieldset>
        <fieldset>
          <legend>挑選視窗裡的 (擬)</legend>
          <Radio name="mi" value="grey" current={mimicStyle} label="A 灰掉列出" onChange={setMimicStyle} />
          <Radio name="mi" value="hide" current={mimicStyle} label="B 不列出" onChange={setMimicStyle} />
        </fieldset>
        <span style={{ color: 'var(--text-dim)' }}>獨特配方：{seeded ? '取自 seed' : 'seed 尚無，依分配規則產生的假配方'}</span>
      </div>
      <div className="demo-grid">
        <section className="demo-card demo-blacksmith">
          <h2>鐵匠鋪</h2>
          <div className="shop-panel blacksmith-panel">
            <p className="shop-greeting">「想打什麼裝備？」</p>
            <div className="bs-resources">
              <span>金幣: {GOLD.toLocaleString()}G</span>
              <span>製作任務: {tracked ? 1 : 0}/3</span>
            </div>
            <div className="shop-tabs">
              {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>
              ))}
            </div>
            {tab === 'unique' && (
              <UniqueCraftTab
                key={scenario} scenario={scenario} mimicStyle={mimicStyle} selected={selected} onSelect={setSelected}
                tracked={tracked} onTrack={id => setTracked(t => (t === id ? null : id))}
              />
            )}
            {tab === 'dismantle' && <DismantleTab recipe={selected} />}
            {(tab === 'craft' || tab === 'swap') && <p className="demo-placeholder">（此分頁不變，見遊戲）</p>}
          </div>
        </section>
        <div className="demo-col">
          <section className="demo-card demo-preview">
            <h2>產物 tooltip（{selected.name}{UNIQUE_SUFFIX}）</h2>
            <div className="demo-tooltip">
              <EquipmentDetail item={product} templates={templates} />
            </div>
            <button style={{ marginTop: 8 }} onClick={() => setRollKey(k => k + 1)}>重抽一次</button>
          </section>
          <section className="demo-card demo-tracker">
            <h2>任務追蹤 — 獨特配方</h2>
            <Tracker recipe={RECIPES.find(r => r.id === tracked)} />
          </section>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
