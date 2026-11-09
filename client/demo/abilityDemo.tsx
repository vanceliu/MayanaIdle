/**
 * 隨機技能（`ability.html`）：鐵匠鋪技能選擇列與裝備 tooltip 技能行的版面樣本。
 * 素材、前置裝備與金幣一律當作已備齊。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentTemplate } from '../src/models/equipment';
import { getEquipmentTierColor, EQUIPMENT_TIER_NAMES } from '../src/models/equipmentTier';
import { getEquipIcon } from '../src/models/iconMap';
import { GameIcon } from '../src/components/GameIcon';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';
import { formatAffixDisplay, generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage } from '../src/models/affix';
import { formatUniqueAffixDisplay, rollUniqueAffix } from '../src/models/uniqueAffix';
import {
  getAbilityCommonPool, getAbilityClassPool, getAbilityDefinition, rollAbility,
  formatAbilityDisplay, formatAbilityEffect, ABILITY_DEFINITIONS, type Ability, type AbilityType,
} from '../src/models/ability';
import { applyAbilityToSkill } from '../src/models/abilitySkill';
import { instantiateFromTemplate } from '../src/models/skillTemplate';
import { SkillTooltipBody } from '../src/components/SkillTooltipBody';
import { summarizeAffixes, summarizeAbilities } from '../src/systems/affixSummary';
import { resolveEquipment } from '../src/systems/templateSync';
import { AbilitySection } from '../src/wiki/components/AbilityTable';
import type { EquipmentInstance } from '../src/models/equipment';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const RECIPES = [
  templates.find(t => t.acquireType === 'craft' && t.tier === 5 && t.slot === 'rightHand' && !t.requiredClass?.length)!,
  templates.find(t => t.acquireType === 'craft' && t.tier === 5 && t.slot === 'rightHand' && t.requiredClass?.length === 1)!,
];
const T7_WEAPON = templates.find(t => t.tier === 7 && t.slot === 'rightHand')!;

function AbilitySelect({ recipe, className, value, onChange }: {
  recipe: EquipmentTemplate; className: ClassName; value: AbilityType | ''; onChange: (v: AbilityType | '') => void;
}) {
  const common = getAbilityCommonPool(recipe);
  const classPool = getAbilityClassPool(recipe, className);
  const preview = value ? rollAbility(recipe, { channel: 'craft', className, chosen: value }) : undefined;
  return (
    <span className={`shop-item-desc bs-ability-row ${value ? '' : 'lacking'}`}>
      <span className="bs-ability-label">隨機技能</span>
      <select value={value} onChange={e => onChange(e.target.value as AbilityType | '')} onClick={e => e.stopPropagation()}>
        <option value="">請選擇</option>
        <optgroup label="共通">
          {common.map(t => <option key={t} value={t}>{getAbilityDefinition(t)!.name}</option>)}
        </optgroup>
        {classPool.length > 0 && (
          <optgroup label={CLASS_NAMES_ZH[className]}>
            {classPool.map(t => <option key={t} value={t}>{getAbilityDefinition(t)!.name}</option>)}
          </optgroup>
        )}
      </select>
      {preview && <span className="bs-ability-preview">{formatAbilityEffect(preview)}</span>}
    </span>
  );
}

function RecipeCard({ recipe, className }: { recipe: EquipmentTemplate; className: ClassName }) {
  const [chosen, setChosen] = useState<AbilityType | ''>('');
  const validChosen = [...getAbilityCommonPool(recipe), ...getAbilityClassPool(recipe, className)].includes(chosen as AbilityType) ? chosen : '';
  return (
    <div className="shop-item bs-shop-item selected">
      <div className="shop-item-info">
        <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GameIcon name={getEquipIcon(recipe.type)} size={16} color={getEquipmentTierColor(recipe)} />
          {recipe.name}
        </span>
        <span className="shop-item-desc">攻擊: {recipe.smallMonsterDamage}/{recipe.largeMonsterDamage}</span>
        <span className="shop-item-desc">
          {EQUIPMENT_TIER_NAMES[recipe.tier ?? 0]} | {recipe.requiredClass?.length ? recipe.requiredClass.map(c => CLASS_NAMES_ZH[c as ClassName]).join('、') : '全職業'}
        </span>
        <AbilitySelect recipe={recipe} className={className} value={validChosen} onChange={setChosen} />
        <span className="shop-item-desc bs-craft-materials">
          <span className="bs-craft-mat">
            <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
            <span className="bs-craft-mat-name" style={{ color: 'var(--accent-gold)' }}>金幣</span>
            <span className="bs-craft-mat-count">{(recipe.craftGold ?? 0).toLocaleString()}/{(recipe.craftGold ?? 0).toLocaleString()}</span>
          </span>
        </span>
      </div>
      <div className="shop-item-actions">
        <button disabled={!validChosen}>製作</button>
        <button>製作追蹤</button>
      </div>
    </div>
  );
}

function rollTooltipAbility(className: ClassName): Ability {
  for (;;) {
    const a = rollAbility(T7_WEAPON, { channel: 'drop', className });
    if (a) return a;
  }
}

function TooltipSample({ className, seed }: { className: ClassName; seed: number }) {
  const [state] = useState(() => ({
    ability: rollTooltipAbility(className),
    unique: rollUniqueAffix(T7_WEAPON),
    affixes: generateAffixes(getAffixCategoryForSlot('rightHand', T7_WEAPON.type), 70, 4, true, { weaponBaseDamage: getWeaponBaseDamage(T7_WEAPON) }),
  }));
  const color = getEquipmentTierColor(T7_WEAPON);
  return (
    <div className="equip-detail" data-seed={seed}>
      <div className="equip-detail-name" style={{ display: 'flex', alignItems: 'center', gap: 4, color }}>
        <GameIcon name={getEquipIcon(T7_WEAPON.type)} size={16} color={color} />
        {T7_WEAPON.name}
      </div>
      <div className="equip-detail-slot">右手</div>
      <div className="equip-detail-affixes equip-detail-ability">
        <div className="equip-detail-affix ability" title="印記無法變更">{formatAbilityDisplay(state.ability)}</div>
      </div>
      {state.unique && (
        <div className="equip-detail-affixes equip-detail-unique">
          <div className="equip-detail-affix unique">{formatUniqueAffixDisplay(state.unique)}</div>
        </div>
      )}
      <div className="equip-detail-affixes">
        {state.affixes.map((a, i) => (
          <div key={i} className={`equip-detail-affix tier-${a.tier}`}>{formatAffixDisplay(a)}</div>
        ))}
      </div>
    </div>
  );
}

function SkillTooltipSample({ className }: { className: ClassName }) {
  const defs = ABILITY_DEFINITIONS.filter(d => d.pool === className);
  const [type, setType] = useState<AbilityType>(defs[0].type);
  const def = defs.find(d => d.type === type) ?? defs[0];
  const base = instantiateFromTemplate(def.skillId!)!;
  const params = Object.fromEntries(def.params.map(p => [p.key, p.max === 'weaponValue' ? p.min : p.max]));
  const shown = applyAbilityToSkill(base, [{ ability: { type: def.type, params } }], className);
  return (
    <>
      <div className="demo-skill-row">
        {defs.map(d => (
          <label key={d.type}><input type="radio" checked={d.type === def.type} onChange={() => setType(d.type)} /> {d.name}</label>
        ))}
      </div>
      <div className="skill-tooltip demo-skill-tooltip">
        <div className="skill-tooltip-name">{base.name}</div>
        <div className="skill-tooltip-level">等級 {base.level}</div>
        <SkillTooltipBody base={base} shown={shown} healOf={power => power * 2} />
        <div className="skill-tooltip-status learned">已習得</div>
      </div>
      <p className="demo-note">武器技能：{formatAbilityDisplay({ type: def.type, params })}（數值取上限）</p>
    </>
  );
}

function SummarySample({ className, seed }: { className: ClassName; seed: number }) {
  const [gear] = useState<EquipmentInstance[]>(() => [resolveEquipment({
    id: 1, templateId: T7_WEAPON.id!, name: T7_WEAPON.name, type: T7_WEAPON.type, slot: 'rightHand',
    isTwoHanded: T7_WEAPON.isTwoHanded, quality: 10, enhancement: 0, ownerId: 1, equipped: true,
    affixes: generateAffixes(getAffixCategoryForSlot('rightHand', T7_WEAPON.type), 70, 4, true, { weaponBaseDamage: getWeaponBaseDamage(T7_WEAPON) }),
    uniqueAffix: rollUniqueAffix(T7_WEAPON),
    ability: rollTooltipAbility(className),
  } as EquipmentInstance)]);
  const rows = [...summarizeAffixes(gear), ...summarizeAbilities(gear).map(r => ({ ...r, ability: true }))];
  return (
    <div className="affix-sum" data-seed={seed}>
      <div className="affix-sum-title">詞綴加總（{rows.length}）</div>
      <div className="affix-sum-cols">
        {rows.map(row => (
          <div key={row.name} className={`affix-sum-row${'ability' in row ? ' ability' : ''}`}>
            <span>{row.name}</span>
            <b>{row.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [className, setClassName] = useState<ClassName>('knight');
  const [seed, setSeed] = useState(0);
  return (
    <>
      <div className="demo-bar">
        <span>製作角色職業</span>
        {CLASSES.map(c => (
          <label key={c}><input type="radio" checked={className === c} onChange={() => setClassName(c)} /> {CLASS_NAMES_ZH[c]}</label>
        ))}
        <button onClick={() => setSeed(s => s + 1)}>重抽 tooltip</button>
      </div>
      <div className="demo-grid">
        <div className="demo-card demo-blacksmith">
          <h2>鐵匠鋪 · 配方</h2>
          <div className="shop-items">
            {RECIPES.map(r => <RecipeCard key={`${r.id}-${className}`} recipe={r} className={className} />)}
          </div>
        </div>
        <div className="demo-card demo-tooltip">
          <h2>技能 tooltip · {CLASS_NAMES_ZH[className]}</h2>
          <SkillTooltipSample key={className} className={className} />
        </div>
        <div className="demo-card demo-summary">
          <h2>裝備欄詞綴加總</h2>
          <SummarySample key={`${className}-${seed}`} className={className} seed={seed} />
        </div>
        <div className="demo-card demo-wiki">
          <h2>Wiki · 詞綴頁／武器頁</h2>
          <AbilitySection groups={['weapon', 'accessory']} />
        </div>
        <div className="demo-card demo-tooltip">
          <h2>裝備 tooltip（T7 掉落）</h2>
          <TooltipSample key={`${className}-${seed}`} className={className} seed={seed} />
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
