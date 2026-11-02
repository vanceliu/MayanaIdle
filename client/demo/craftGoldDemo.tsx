/**
 * 鐵匠鋪製作費（`craft-gold.html`）：配方卡片與製作追蹤的金幣需求行版面樣本。
 * 素材與前置裝備一律當作已備齊，只有金幣隨拉桿變動。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentTemplate } from '../src/models/equipment';
import { getEquipmentTierColor, EQUIPMENT_TIER_NAMES } from '../src/models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../src/models/iconMap';
import { getItemById } from '../src/models/items';
import { GameIcon } from '../src/components/GameIcon';

const CRAFT_GOLD: Record<number, number> = { 4: 20_000, 5: 50_000, 6: 80_000 };
const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const recipes = [4, 5, 6].map(tier => templates.find(t => t.acquireType === 'craft' && t.tier === tier && t.slot === 'rightHand')!);

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

function RecipeCard({ recipe, gold }: { recipe: EquipmentTemplate; gold: number }) {
  const need = CRAFT_GOLD[recipe.tier ?? 0];
  const ready = gold >= need;
  const prereq = recipe.craftPrerequisiteWeapon && templates.find(t => t.id === recipe.craftPrerequisiteWeapon!.templateId);
  return (
    <div className={`shop-item bs-shop-item selected ${ready ? '' : 'disabled-look'}`}>
      <div className="shop-item-info">
        <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GameIcon name={getEquipIcon(recipe.type)} size={16} color={getEquipmentTierColor(recipe)} />
          {recipe.name}
        </span>
        <span className="shop-item-desc">攻擊: {recipe.smallMonsterDamage}/{recipe.largeMonsterDamage}{recipe.attackSuccess ? ` | 命中+${recipe.attackSuccess}` : ''}{recipe.extraAttack ? ` | 額攻+${recipe.extraAttack}` : ''}</span>
        <span className="shop-item-desc">{EQUIPMENT_TIER_NAMES[recipe.tier ?? 0]} | 全職業</span>
        <span className="shop-item-desc bs-craft-materials">
          <GoldChip gold={gold} need={need} />
          {prereq && (
            <span className="bs-craft-mat">
              <GameIcon name={getEquipIcon(prereq.type)} size={14} color={getEquipmentTierColor(prereq)} />
              <span className="bs-craft-mat-name" style={{ color: getEquipmentTierColor(prereq) }}>{prereq.name}</span>
              <span className="bs-craft-mat-count">1/1</span>
            </span>
          )}
          {(recipe.craftMaterials ?? []).map(m => {
            const def = getItemById(m.itemId);
            const { icon, color, glowClass } = resolveItemIcon(def, 'material');
            return (
              <span key={m.itemId} className="bs-craft-mat">
                <GameIcon name={icon} size={14} color={color} className={glowClass} />
                <span className="bs-craft-mat-name" style={{ color }}>{def?.name}</span>
                <span className="bs-craft-mat-count">{m.amount}/{m.amount}</span>
              </span>
            );
          })}
        </span>
      </div>
      <div className="shop-item-actions">
        <button disabled={!ready}>製作</button>
        <button>製作追蹤</button>
      </div>
    </div>
  );
}

function TrackerItem({ recipe, gold }: { recipe: EquipmentTemplate; gold: number }) {
  const need = CRAFT_GOLD[recipe.tier ?? 0];
  const ready = gold >= need;
  const prereq = recipe.craftPrerequisiteWeapon && templates.find(t => t.id === recipe.craftPrerequisiteWeapon!.templateId);
  return (
    <div className={`quest-tracker-item ${ready ? 'completable' : ''}`}>
      <div className="tracker-title">
        <span className="tracker-source">[製作]</span>
        {recipe.name}
      </div>
      <div className="tracker-craft-reqs">
        <span className={`tracker-craft-req ${ready ? '' : 'lacking'}`}>
          金幣 <strong>{gold.toLocaleString()}/{need.toLocaleString()}</strong>
        </span>
        {prereq && <span className="tracker-craft-req">{prereq.name} <strong>1/1</strong></span>}
        {(recipe.craftMaterials ?? []).map(m => (
          <span key={m.itemId} className="tracker-craft-req">
            {getItemById(m.itemId)?.name} <strong>{m.amount}/{m.amount}</strong>
          </span>
        ))}
      </div>
      <div className="tracker-actions">
        {ready && <span className="quest-highlight">可製作</span>}
        <button className="btn-danger tracker-cancel">取消</button>
      </div>
    </div>
  );
}

function App() {
  const slider = document.getElementById('gold') as HTMLInputElement;
  const [gold, setGold] = useState(Number(slider.value));
  useEffect(() => {
    const onInput = () => setGold(Number(slider.value));
    slider.addEventListener('input', onInput);
    return () => slider.removeEventListener('input', onInput);
  }, [slider]);
  useEffect(() => {
    document.getElementById('gold-label')!.textContent = `${gold.toLocaleString()}G`;
  }, [gold]);

  return (
    <div className="demo-grid">
      <section className="demo-card demo-blacksmith">
        <h2>鐵匠鋪 — 配方卡片</h2>
        <div className="shop-panel blacksmith-panel">
          <div className="bs-resources"><span>金幣: {gold.toLocaleString()}G</span></div>
          <div className="shop-items">
            {recipes.map(r => <RecipeCard key={r.id} recipe={r} gold={gold} />)}
          </div>
        </div>
      </section>
      <section className="demo-card demo-tracker">
        <h2>任務追蹤 — 製作</h2>
        <div className="quest-tracker-content">
          {recipes.map(r => <TrackerItem key={r.id} recipe={r} gold={gold} />)}
        </div>
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
