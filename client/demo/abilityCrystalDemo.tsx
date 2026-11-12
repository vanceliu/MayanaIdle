/**
 * 技能結晶與技能更換（`ability-crystal.html`）：鐵匠鋪「裝備拆解」與新分頁「技能更換」的版面樣本。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { getEquipmentTierColor, EQUIPMENT_TIER_NAMES } from '../src/models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../src/models/iconMap';
import { getItemById } from '../src/models/items';
import { GameIcon } from '../src/components/GameIcon';
import { Tooltip } from '../src/components/Tooltip';
import { getDismantleYield } from '../src/systems/crafting';
import {
  getAbilityDefinition, formatAbilityDisplay, type Ability, type AbilityType,
} from '../src/models/ability';
import {
  yieldsAbilityCrystal, abilityToCrystal, addCrystal, crystalImproves, crystalToAbility,
  getCrystalApplyBlock, getCrystalApplyCost, formatCrystalEffectParts,
  CRYSTAL_APPLY_BLOCK_TEXT, type AbilityCrystal,
} from '../src/models/abilityCrystal';

// ── 假資料 ────────────────────────────────────────────────────────────
const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const pick = (fn: (t: EquipmentTemplate) => boolean): EquipmentTemplate => templates.find(fn)!;
const knightCan = (t: EquipmentTemplate) => !t.requiredClass?.length || t.requiredClass.includes('knight');

const T5_CRAFT_SWORD = pick(t => t.acquireType === 'craft' && t.tier === 5 && t.type === 'sword' && knightCan(t));
const T4_CRAFT_SWORD = pick(t => t.acquireType === 'craft' && t.tier === 4 && t.type === 'sword' && knightCan(t));
const T7_SWORD = pick(t => t.tier === 7 && t.slot === 'rightHand' && knightCan(t));
const T6_RING = pick(t => t.tier === 6 && t.slot === 'ring1');
const T4_CRAFT_NECKLACE = pick(t => t.acquireType === 'craft' && t.tier === 4 && t.slot === 'necklace');
const T3_SHOP_SWORD = pick(t => t.tier === 3 && t.slot === 'rightHand' && knightCan(t));
const T5_ELF_BOW = pick(t => t.tier === 5 && t.type === 'bow' && !!t.requiredClass?.length && !t.requiredClass.includes('knight'));

interface DemoItem {
  id: number;
  template: EquipmentTemplate;
  enhancement: number;
  ability?: Ability;
  isCraftedGear?: boolean;
  maxAffixTier?: number;
  equipped?: boolean;
}

const INITIAL_ITEMS: DemoItem[] = [
  { id: 1, template: T5_CRAFT_SWORD, enhancement: 3, ability: { type: 'bonus_damage', params: { chance: 9, damage: 14 } } },
  { id: 2, template: T7_SWORD, enhancement: 0, ability: { type: 'combo_strike', params: { every: 6, bonus: 42 } } },
  { id: 3, template: T6_RING, enhancement: 0, ability: { type: 'thorns', params: { percent: 30 } } },
  { id: 4, template: T5_CRAFT_SWORD, enhancement: 0, isCraftedGear: true, ability: { type: 'rend_boost', params: { percent: 10 } } },
  { id: 5, template: T4_CRAFT_SWORD, enhancement: 0 },
  { id: 6, template: T4_CRAFT_NECKLACE, enhancement: 0, ability: { type: 'low_hp_regen', params: { regen: 12 } } },
  { id: 7, template: T3_SHOP_SWORD, enhancement: 2, maxAffixTier: 3 },
  { id: 8, template: T5_ELF_BOW, enhancement: 0, ability: { type: 'triple_shot_boost', params: { arrows: 1 } } },
];

const INITIAL_CRYSTALS: AbilityCrystal[] = [
  { type: 'bonus_damage', positions: { chance: 0.4, damage: 0.8 } },
  { type: 'thorns', positions: { percent: 0.75 } },
  { type: 'rend_boost', positions: { percent: 1 } },
  { type: 'calm', positions: { rate: 0.4 } },
  { type: 'binding_arrow_boost', positions: { cooldown: 0.5, root: 0.3 } },
];

const displayName = (item: DemoItem) =>
  `${item.template.name}${item.isCraftedGear ? '(鍛)' : ''}${item.enhancement > 0 ? ` +${item.enhancement}` : ''}`;

// ── 共用片段 ──────────────────────────────────────────────────────────
function toInstance(item: DemoItem): EquipmentInstance {
  const { id: _templateId, acquireType: _a, craftMaterials: _m, craftPrerequisiteWeapon: _p, craftGold: _g, buyPrice: _b, tier: _t, ...base } = item.template;
  return {
    ...base, id: item.id, templateId: item.template.id!, name: item.template.name,
    quality: 0, enhancement: item.enhancement, affixes: [], ownerId: 1, equipped: false,
    ability: item.ability, isCraftedGear: item.isCraftedGear, maxAffixTier: item.maxAffixTier,
  } as EquipmentInstance;
}

/** 名稱 hover 顯示完整裝備 tooltip（同遊戲的拆解清單） */
function ItemName({ item }: { item: DemoItem }) {
  const t = item.template;
  return (
    <Tooltip position="right" content={<EquipmentDetail item={toInstance(item)} templates={templates} />}>
      <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <GameIcon name={getEquipIcon(t.type === 'armor' ? t.slot : t.type)} size={16} color={getEquipmentTierColor(t)} />
        {displayName(item)}
      </span>
    </Tooltip>
  );
}

function GoldChip({ gold, need }: { gold: number; need: number }) {
  const enough = gold >= need;
  return (
    <span className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
      <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
      <span className="bs-craft-mat-name" style={enough ? { color: 'var(--accent-gold)' } : undefined}>金幣</span>
      <span className="bs-craft-mat-count">{gold.toLocaleString()}/{need.toLocaleString()}</span>
    </span>
  );
}

const ABILITY_GREEN = '#86EFAC';

// ── 拆解分頁 ──────────────────────────────────────────────────────────
function DismantleTab({ items, crystals, onDismantle }: {
  items: DemoItem[]; crystals: AbilityCrystal[]; onDismantle: (item: DemoItem) => void;
}) {
  const rows = items
    .filter(item => !item.equipped)
    .map(item => {
      const yields = getDismantleYield(item.template);
      const crystal = yieldsAbilityCrystal(item) ? abilityToCrystal(item.ability!, item.template) : undefined;
      return { item, yields, crystal };
    })
    .filter(r => r.yields !== null || r.crystal !== undefined);

  return (
    <div className="panel-scroll">
      <p className="shop-item-desc">有配方的退還一半材料，前置裝備不退；掉落品的隨機技能會存成技能結晶。身上的裝備不能拆。</p>
      <div className="shop-items">
        {rows.map(({ item, yields, crystal }) => {
          const existing = crystal && crystals.find(c => c.type === crystal.type);
          const improves = crystal ? crystalImproves(existing, crystal) : false;
          return (
            <div key={item.id} className="shop-item bs-shop-item">
              <div className="shop-item-info">
                <ItemName item={item} />
                <span className="shop-item-desc bs-craft-materials">
                  {yields ? yields.map(m => {
                    const def = getItemById(m.itemId);
                    const { icon, color, glowClass } = resolveItemIcon(def, 'material');
                    return (
                      <span key={m.itemId} className="bs-craft-mat">
                        <GameIcon name={icon} size={14} color={color} className={glowClass} />
                        <span className="bs-craft-mat-name" style={{ color }}>{def?.name}</span>
                        <span className="bs-craft-mat-count">×{m.amount}</span>
                      </span>
                    );
                  }) : <span style={{ color: 'var(--text-dim)' }}>不退材料</span>}
                </span>
                {crystal && (
                  <span className="shop-item-desc">
                    <span style={{ color: ABILITY_GREEN }}>技能結晶：{getAbilityDefinition(crystal.type)!.name}</span>
                    {improves && <span style={{ color: 'var(--accent-gold)' }}>{existing ? '（更新）' : '（新）'}</span>}
                  </span>
                )}
                {!crystal && item.ability && item.isCraftedGear && (
                  <span className="shop-item-desc" style={{ color: 'var(--text-dim)' }}>製作品的隨機技能不會留下結晶</span>
                )}
              </div>
              <div className="shop-item-actions">
                <button className="btn-danger" onClick={() => onDismantle(item)}>拆解</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 技能更換分頁 ──────────────────────────────────────────────────────
const POOL_NAMES: Record<string, string> = { knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊' };
const SWAP_SLOTS = ['rightHand', 'necklace', 'ring1', 'ring2'];

function CrystalEffect({ crystal }: { crystal: AbilityCrystal }) {
  return (
    <>
      {formatCrystalEffectParts(crystal).map((p, i) => {
        if (p.value) return <span key={i} style={{ color: '#EF4444', fontWeight: 700 }}>{p.text}</span>;
        if (p.range) return <span key={i} className="stat-range">{p.text}</span>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function CrystalTooltip({ crystal }: { crystal: AbilityCrystal }) {
  const def = getAbilityDefinition(crystal.type)!;
  return (
    <div style={{ maxWidth: 320 }}>
      <div style={{ color: ABILITY_GREEN, fontWeight: 700, marginBottom: 4 }}>
        {def.name}{def.pool !== 'common' ? `［${POOL_NAMES[def.pool]}］` : ''}
      </div>
      <div style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}><CrystalEffect crystal={crystal} /></div>
    </div>
  );
}

/** 左欄：結晶清單，名稱一行，hover 看效果，點選指定 */
function CrystalColumn({ crystals, selected, onSelect }: {
  crystals: AbilityCrystal[]; selected: AbilityType | null; onSelect: (type: AbilityType) => void;
}) {
  const groups: { label: string; list: AbilityCrystal[] }[] = [
    { label: '武器', list: crystals.filter(c => getAbilityDefinition(c.type)!.group === 'weapon') },
    { label: '飾品', list: crystals.filter(c => getAbilityDefinition(c.type)!.group === 'accessory') },
  ];
  return (
    <div className="demo-col-left">
      {groups.map(g => (
        <div key={g.label} style={{ marginBottom: 8 }}>
          <div className="shop-item-desc" style={{ color: 'var(--accent-gold)', margin: '4px 0' }}>{g.label}結晶（{g.list.length}）</div>
          <div className="shop-items">
            {g.list.map(c => {
              const def = getAbilityDefinition(c.type)!;
              return (
                <Tooltip key={c.type} position="right" content={<CrystalTooltip crystal={c} />}>
                  <div
                    className={`shop-item bs-shop-item ${selected === c.type ? 'selected' : ''}`}
                    style={{ padding: '6px 10px', cursor: 'pointer' }}
                    onClick={() => onSelect(c.type)}
                  >
                    <span style={{ color: ABILITY_GREEN, fontWeight: 700 }}>{def.name}</span>
                    {def.pool !== 'common' && <span className="shop-item-desc" style={{ marginLeft: 6 }}>[{POOL_NAMES[def.pool]}]</span>}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 右欄的一件裝備：點選後才顯示更換後，按鈕只有選中的那件可按 */
function SwapRow({ item, crystal, gold, selected, onSelect, onApply }: {
  item: DemoItem; crystal: AbilityCrystal | null; gold: number; selected: boolean;
  onSelect: () => void; onApply: (item: DemoItem, crystal: AbilityCrystal) => void;
}) {
  const tier = item.template.tier ?? 0;
  const cost = getCrystalApplyCost(tier);
  const block = crystal ? getCrystalApplyBlock(crystal, item, item.template) : null;
  const preview = selected && crystal && !block ? crystalToAbility(crystal, item.template) : undefined;
  const ready = !!preview && gold >= cost;

  return (
    <div
      className={`shop-item bs-shop-item ${selected ? 'selected' : ''} ${block || gold < cost ? 'disabled-look' : ''}`}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
    >
      <div className="shop-item-info">
        <ItemName item={item} />
        <span className="shop-item-desc">{EQUIPMENT_TIER_NAMES[tier]}</span>
        <span className="shop-item-desc">
          目前：{item.ability
            ? <span style={{ color: ABILITY_GREEN }}>{formatAbilityDisplay(item.ability)}</span>
            : <span style={{ color: 'var(--text-dim)' }}>無隨機技能</span>}
        </span>
        {preview && (
          <span className="shop-item-desc">
            更換後：<span style={{ color: ABILITY_GREEN }}>{formatAbilityDisplay(preview)}</span>
          </span>
        )}
        {block && <span className="shop-item-desc" style={{ color: 'var(--accent-danger)' }}>{CRYSTAL_APPLY_BLOCK_TEXT[block]}</span>}
        <span className="shop-item-desc bs-craft-materials"><GoldChip gold={gold} need={cost} /></span>
      </div>
      <div className="shop-item-actions">
        <button disabled={!ready} onClick={e => { e.stopPropagation(); onApply(item, crystal!); }}>更換</button>
      </div>
    </div>
  );
}

function SwapTab({ items, crystals, gold, onApply }: {
  items: DemoItem[]; crystals: AbilityCrystal[]; gold: number; onApply: (item: DemoItem, crystal: AbilityCrystal) => void;
}) {
  const [selected, setSelected] = useState<AbilityType | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const crystal = crystals.find(c => c.type === selected) ?? null;
  const group = crystal ? getAbilityDefinition(crystal.type)!.group : null;
  const targets = items.filter(item =>
    !item.equipped && !item.isCraftedGear && (item.template.tier ?? 0) >= 3
    && SWAP_SLOTS.includes(item.template.slot)
    && (!group || (group === 'weapon') === (item.template.slot === 'rightHand')));
  return (
    <div className="panel-scroll">
      <p className="shop-item-desc">左邊選結晶（滑鼠移上去看效果），右邊選要更換的裝備；原本的技能會消失，結晶不會用掉。費用 500,000 × 裝備階級。製作品與身上的裝備不能更換。</p>
      <div className="demo-swap-grid">
        <CrystalColumn crystals={crystals} selected={selected} onSelect={setSelected} />
        <div className="shop-items">
          {!crystal && <p className="shop-item-desc">先在左邊選一顆結晶</p>}
          {crystal && <p className="shop-item-desc">點選裝備查看更換後的數值</p>}
          {targets.map(item => (
            <SwapRow
              key={item.id} item={item} crystal={crystal} gold={gold}
              selected={item.id === selectedItemId}
              onSelect={() => setSelectedItemId(item.id)}
              onApply={onApply}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 鐵匠鋪 ────────────────────────────────────────────────────────────
type Tab = 'craft' | 'dismantle' | 'swap';

function Blacksmith() {
  const [tab, setTab] = useState<Tab>('swap');
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [crystals, setCrystals] = useState(INITIAL_CRYSTALS);
  const [gold, setGold] = useState(8_000_000);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const input = document.getElementById('gold') as HTMLInputElement;
    const label = document.getElementById('gold-label')!;
    const sync = () => { setGold(Number(input.value)); label.textContent = `${Number(input.value).toLocaleString()}G`; };
    sync();
    input.addEventListener('input', sync);
    return () => input.removeEventListener('input', sync);
  }, []);

  function dismantle(item: DemoItem) {
    const crystal = yieldsAbilityCrystal(item) ? abilityToCrystal(item.ability!, item.template) : undefined;
    const crystalLine = crystal ? `\n隨機技能「${getAbilityDefinition(crystal.type)!.name}」會存成技能結晶。` : '';
    const warning = item.enhancement > 0 ? `\n強化 +${item.enhancement} 不退還。` : '';
    const yields = getDismantleYield(item.template);
    if (!window.confirm(`確定拆解 ${displayName(item)}？${yields ? '只退還一半材料。' : '不退材料。'}${crystalLine}${warning}`)) return;
    setItems(prev => prev.filter(i => i.id !== item.id));
    if (crystal) setCrystals(prev => addCrystal(prev, crystal));
    setMsg(`拆解了 ${displayName(item)}${crystal ? `，技能結晶「${getAbilityDefinition(crystal.type)!.name}」已${crystals.some(c => c.type === crystal.type) ? '更新' : '取得'}` : ''}`);
  }

  function apply(item: DemoItem, crystal: AbilityCrystal) {
    const cost = getCrystalApplyCost(item.template.tier ?? 0);
    const next = crystalToAbility(crystal, item.template)!;
    const old = item.ability ? `\n原本的「${formatAbilityDisplay(item.ability)}」會消失。` : '';
    if (!window.confirm(`花費 ${cost.toLocaleString()}G，把 ${displayName(item)} 的隨機技能換成「${formatAbilityDisplay(next)}」？${old}`)) return;
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, ability: next } : i)));
    const input = document.getElementById('gold') as HTMLInputElement;
    input.value = String(gold - cost);
    input.dispatchEvent(new Event('input'));
    setMsg(`${displayName(item)} 的隨機技能換成「${formatAbilityDisplay(next)}」`);
  }

  return (
    <div className="demo-card">
      <div className="shop-panel blacksmith-panel">
        <p className="shop-greeting">「想打什麼裝備？」</p>
        <div className="bs-resources"><span>金幣: {gold.toLocaleString()}G</span></div>
        <div className="shop-tabs">
          <button className={tab === 'craft' ? 'active' : ''} onClick={() => { setTab('craft'); setMsg(null); }}>裝備製作</button>
          <button className={tab === 'dismantle' ? 'active' : ''} onClick={() => { setTab('dismantle'); setMsg(null); }}>裝備拆解</button>
          <button className={tab === 'swap' ? 'active' : ''} onClick={() => { setTab('swap'); setMsg(null); }}>技能更換</button>
        </div>
        {msg && <p className="bs-result">{msg}</p>}
        {tab === 'craft' && <p className="shop-item-desc">（製作分頁不變，demo 省略）</p>}
        {tab === 'dismantle' && <DismantleTab items={items} crystals={crystals} onDismantle={dismantle} />}
        {tab === 'swap' && <SwapTab items={items} crystals={crystals} gold={gold} onApply={apply} />}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Blacksmith /></StrictMode>);
