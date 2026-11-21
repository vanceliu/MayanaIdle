/**
 * 鐵匠鋪取用倉庫（`craft-warehouse.html`）：素材來源顯示與前置裝備指定的版面樣本。
 * 判定走遊戲的 `evaluateCraftRequirements`／`findCraftPrerequisiteCandidates`，demo 只做畫面。
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { getEquipmentTierColor, EQUIPMENT_TIER_NAMES } from '../src/models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../src/models/iconMap';
import { getItemById } from '../src/models/items';
import { GameIcon } from '../src/components/GameIcon';
import { Tooltip } from '../src/components/Tooltip';
import { makeBagItem, type BagItem } from '../src/models/bagItem';
import {
  evaluateCraftRequirements, findCraftPrerequisiteCandidates,
  type CraftMaterialStatus, type CraftPrerequisiteCandidate, type CraftSourceKind, type CraftSources,
} from '../src/systems/craftQuestSystem';
import type { Affix } from '../src/models/affix';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const RECIPE = templates.find(t => t.acquireType === 'craft' && t.tier === 5 && t.type === 'sword' && t.craftPrerequisiteWeapon)!;
const PREREQ = templates.find(t => t.id === RECIPE.craftPrerequisiteWeapon!.templateId)!;
const GOLD = 1_000_000;

const SOURCE_LABEL: Record<CraftSourceKind, string> = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' };

type Scenario = 'bag' | 'mixed' | 'many' | 'lacking';
type MatStyle = 'suffix' | 'tooltip';

const AFFIX_SETS: Affix[][] = [
  [{ type: 'attack_power', tier: 4, value: 12 }, { type: 'crit_rate', tier: 3, value: 10 }, { type: 'attack_speed', tier: 4, value: 8 }, { type: 'crit_damage', tier: 2, value: 6 }],
  [{ type: 'attack_power', tier: 1, value: 3 }],
  [{ type: 'crit_rate', tier: 2, value: 6 }, { type: 'evasion', tier: 1, value: 3 }],
];

function prereqInstance(id: number, enhancement: number, affixes: Affix[]): EquipmentInstance {
  const { id: _t, acquireType: _a, craftMaterials: _m, craftPrerequisiteWeapon: _p, craftGold: _g, buyPrice: _b, tier: _tier, ...base } = PREREQ;
  return {
    ...base, id, templateId: PREREQ.id!, name: PREREQ.name, quality: 0, enhancement, affixes, ownerId: 1, equipped: false,
  } as EquipmentInstance;
}

function mats(fn: (need: number, index: number) => number): BagItem[] {
  return RECIPE.craftMaterials!.map((m, i) => makeBagItem(m.itemId, fn(m.amount, i))!).filter(b => b.amount > 0);
}

function buildSources(scenario: Scenario): CraftSources {
  if (scenario === 'bag') {
    return {
      bag: { materials: mats(n => n + 2), equipment: [prereqInstance(1, 0, AFFIX_SETS[1])] },
      personal: { materials: [], equipment: [] },
      shared: { materials: [], equipment: [] },
    };
  }
  if (scenario === 'mixed') {
    return {
      bag: { materials: mats((n, i) => (i === 0 ? 1 : n)), equipment: [prereqInstance(1, 7, AFFIX_SETS[0])] },
      personal: { materials: mats((_, i) => (i === 0 ? 2 : 0)), equipment: [prereqInstance(2, 0, AFFIX_SETS[1])] },
      shared: { materials: mats((_, i) => (i === 0 ? 10 : 0)), equipment: [prereqInstance(3, 2, AFFIX_SETS[2])] },
    };
  }
  if (scenario === 'many') {
    const many = (from: number, count: number) => Array.from({ length: count }, (_, i) =>
      prereqInstance(from + i, (from + i) % 8, AFFIX_SETS[(from + i) % AFFIX_SETS.length]));
    return {
      bag: { materials: mats(n => n), equipment: many(1, 3) },
      personal: { materials: [], equipment: many(10, 6) },
      shared: { materials: [], equipment: many(20, 8) },
    };
  }
  return {
    bag: { materials: mats((n, i) => (i === 0 ? 1 : n)), equipment: [] },
    personal: { materials: mats((_, i) => (i === 0 ? 1 : 0)), equipment: [] },
    shared: { materials: [], equipment: [] },
  };
}

const prereqName = (item: EquipmentInstance) => `${item.name}${item.enhancement > 0 ? ` +${item.enhancement}` : ''}`;

function MaterialChip({ status, style }: { status: CraftMaterialStatus; style: MatStyle }) {
  const def = getItemById(status.itemId);
  const { icon, color, glowClass } = resolveItemIcon(def, 'material');
  const warehouse = status.bySource.personal + status.bySource.shared;
  const chip = (
    <span className={`bs-craft-mat ${status.enough ? '' : 'lacking'}`}>
      <GameIcon name={icon} size={14} color={color} className={glowClass} />
      <span className="bs-craft-mat-name" style={status.enough ? { color } : undefined}>{def?.name}</span>
      <span className="bs-craft-mat-count">{status.have}/{status.need}</span>
      {style === 'suffix' && warehouse > 0 && <span className="bs-craft-mat-src">（倉庫 {warehouse}）</span>}
    </span>
  );
  if (style === 'suffix') return chip;
  return (
    <Tooltip position="top" content={(
      <div className="bs-mat-source-tooltip">
        {(['bag', 'personal', 'shared'] as const).map(s => <div key={s}>{SOURCE_LABEL[s]} {status.bySource[s]}</div>)}
      </div>
    )}>
      {chip}
    </Tooltip>
  );
}

function PrereqTooltip({ item, children }: { item: EquipmentInstance; children: ReactNode }) {
  return <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>{children}</Tooltip>;
}

function PrereqLabel({ item }: { item: EquipmentInstance }) {
  const color = getEquipmentTierColor(PREREQ);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color }}>
      <GameIcon name={getEquipIcon(PREREQ.type)} size={14} color={color} />
      {prereqName(item)}
    </span>
  );
}

/** 配方卡片上的前置裝備列：顯示已選的那件，按鈕開挑選視窗 */
function PrereqRow({ picked, count, onOpen }: { picked?: CraftPrerequisiteCandidate; count: number; onOpen: () => void }) {
  return (
    <span className={`shop-item-desc bs-ability-row ${picked ? '' : 'lacking'}`}>
      <span className="bs-ability-label">前置裝備</span>
      {picked ? (
        <>
          <PrereqTooltip item={picked.item}><PrereqLabel item={picked.item} /></PrereqTooltip>
          <span className="bs-source-tag-inline">{SOURCE_LABEL[picked.source]}</span>
        </>
      ) : (
        <span className="bs-dim">{count ? '未選擇' : '沒有可用的前置裝備'}</span>
      )}
      <button className="bs-prereq-open" disabled={count === 0} onClick={onOpen}>{picked ? '更換' : '選擇'}</button>
    </span>
  );
}

/** 挑選視窗：三處符合的實例，可捲動，hover 看明細，點一列即選定並關閉 */
function PrereqPicker({ candidates, chosen, onChoose, onClose }: {
  candidates: CraftPrerequisiteCandidate[]; chosen: number | null; onChoose: (id: number) => void; onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bs-prereq-modal" role="dialog" aria-label="選擇前置裝備" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">選擇前置裝備：{PREREQ.name}（{candidates.length} 件）</span>
          <button className="modal-close" aria-label="關閉" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body bs-prereq-list">
          {candidates.map(c => (
            <span
              key={c.item.id}
              role="radio"
              aria-checked={chosen === c.item.id}
              className={`bs-prereq-option ${chosen === c.item.id ? 'selected' : ''}`}
              onClick={() => { onChoose(c.item.id!); onClose(); }}
            >
              <span className="bs-prereq-radio" />
              <PrereqTooltip item={c.item}><PrereqLabel item={c.item} /></PrereqTooltip>
              <span className="bs-prereq-meta">詞綴 {c.item.affixes.length} 條</span>
              <span className="bs-source-tag">{SOURCE_LABEL[c.source]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecipeCard({ sources, matStyle }: { sources: CraftSources; matStyle: MatStyle }) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const status = evaluateCraftRequirements(RECIPE, sources, GOLD);
  const candidates = findCraftPrerequisiteCandidates(RECIPE, sources);
  const valid = candidates.some(c => c.item.id === chosen) ? chosen : null;
  const prereqColor = getEquipmentTierColor(PREREQ);
  const prereq = status.prerequisite!;
  const picked = candidates.find(c => c.item.id === valid);
  return (
    <div className={`shop-item bs-shop-item selected ${status.ready ? '' : 'disabled-look'}`}>
      <div className="shop-item-info">
        <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GameIcon name={getEquipIcon(RECIPE.type)} size={16} color={getEquipmentTierColor(RECIPE)} />
          {RECIPE.name}
        </span>
        <span className="shop-item-desc">攻擊: {RECIPE.smallMonsterDamage}/{RECIPE.largeMonsterDamage}</span>
        <span className="shop-item-desc">{EQUIPMENT_TIER_NAMES[RECIPE.tier ?? 0]} | 全職業</span>
        <span className="shop-item-desc bs-ability-row">
          <span className="bs-ability-label">隨機技能</span>
          <select aria-label="隨機技能" defaultValue="x"><option value="x">（已指定）</option></select>
        </span>
        <PrereqRow picked={picked} count={candidates.length} onOpen={() => setPickerOpen(true)} />
        {pickerOpen && (
          <PrereqPicker candidates={candidates} chosen={valid} onChoose={setChosen} onClose={() => setPickerOpen(false)} />
        )}
        <span className="shop-item-desc bs-craft-materials">
          <span className="bs-craft-mat">
            <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
            <span className="bs-craft-mat-name" style={{ color: 'var(--accent-gold)' }}>金幣</span>
            <span className="bs-craft-mat-count">{GOLD.toLocaleString()}/{(RECIPE.craftGold ?? 0).toLocaleString()}</span>
          </span>
          <span className={`bs-craft-mat ${prereq.enough ? '' : 'lacking'}`}>
            <GameIcon name={getEquipIcon(PREREQ.type)} size={14} color={prereqColor} />
            <span className="bs-craft-mat-name" style={prereq.enough ? { color: prereqColor } : undefined}>{PREREQ.name}</span>
            <span className="bs-craft-mat-count">{prereq.have}/{prereq.need}</span>
          </span>
          {status.materials.map(m => <MaterialChip key={m.itemId} status={m} style={matStyle} />)}
        </span>
      </div>
      <div className="shop-item-actions">
        <button disabled={!status.ready || valid == null}>製作</button>
        <button>製作追蹤</button>
      </div>
    </div>
  );
}

function TrackerItem({ sources }: { sources: CraftSources }) {
  const status = evaluateCraftRequirements(RECIPE, sources, GOLD);
  return (
    <div className={`quest-tracker-item ${status.ready ? 'completable' : ''}`}>
      <div className="tracker-title"><span className="tracker-source">[製作]</span>{RECIPE.name}</div>
      <div className="tracker-craft-reqs">
        <span className="tracker-craft-req">金幣 <strong>{GOLD.toLocaleString()}/{(RECIPE.craftGold ?? 0).toLocaleString()}</strong></span>
        <span className={`tracker-craft-req ${status.prerequisite!.enough ? '' : 'lacking'}`}>
          {PREREQ.name} <strong>{status.prerequisite!.have}/{status.prerequisite!.need}</strong>
        </span>
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
  );
}

function StockTable({ sources }: { sources: CraftSources }) {
  return (
    <div className="demo-stock">
      {(['bag', 'personal', 'shared'] as const).map(s => (
        <div key={s}>
          <strong>{SOURCE_LABEL[s]}</strong>：
          {sources[s].materials.map(m => `${m.name}×${m.amount}`).join('、') || '—'}
          {sources[s].equipment.length > 0 && `；${sources[s].equipment.map(prereqName).join('、')}`}
        </div>
      ))}
    </div>
  );
}

function Radio<T extends string>({ name, value, current, label, onChange }: {
  name: string; value: T; current: T; label: string; onChange: (v: T) => void;
}) {
  return (
    <label><input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} /> {label}</label>
  );
}

function App() {
  const [scenario, setScenario] = useState<Scenario>('mixed');
  const [matStyle, setMatStyle] = useState<MatStyle>('suffix');
  const sources = buildSources(scenario);
  return (
    <>
      <div className="demo-bar">
        <fieldset>
          <legend>情境</legend>
          <Radio name="sc" value="bag" current={scenario} label="背包就夠" onChange={setScenario} />
          <Radio name="sc" value="mixed" current={scenario} label="倉庫補足" onChange={setScenario} />
          <Radio name="sc" value="many" current={scenario} label="前置很多件" onChange={setScenario} />
          <Radio name="sc" value="lacking" current={scenario} label="合計不足" onChange={setScenario} />
        </fieldset>
        <fieldset>
          <legend>素材來源</legend>
          <Radio name="ms" value="suffix" current={matStyle} label="A 數量後註明倉庫" onChange={setMatStyle} />
          <Radio name="ms" value="tooltip" current={matStyle} label="B hover 看明細" onChange={setMatStyle} />
        </fieldset>
      </div>
      <div className="demo-grid">
        <section className="demo-card demo-blacksmith">
          <h2>鐵匠鋪 — 配方卡片</h2>
          <div className="shop-panel blacksmith-panel">
            <div className="shop-items">
              <RecipeCard key={scenario} sources={sources} matStyle={matStyle} />
            </div>
          </div>
        </section>
        <section className="demo-card demo-tracker">
          <h2>任務追蹤 — 製作</h2>
          <div className="quest-tracker-content"><TrackerItem sources={sources} /></div>
          <h2 style={{ marginTop: 12 }}>本情境的存量</h2>
          <StockTable sources={sources} />
        </section>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
