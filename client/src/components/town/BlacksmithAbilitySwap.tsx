import { useState } from 'react';
import { useGameStore, type CraftResult } from '../../stores/gameStore';
import type { EquipmentInstance, EquipmentTemplate } from '../../models/equipment';
import { EQUIPMENT_TIER_NAMES, getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { getEquipIcon } from '../../models/iconMap';
import { CLASS_NAMES_ZH, type ClassName } from '../../models/character';
import { formatAbilityDisplay, getAbilityDefinition, isAbilitySlot, type AbilityType } from '../../models/ability';
import {
  crystalToAbility, formatCrystalEffectParts, getCrystalApplyBlock, getCrystalApplyCost,
  CRYSTAL_APPLY_BLOCK_TEXT, type AbilityCrystal,
} from '../../models/abilityCrystal';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import { EquipmentDetail } from '../EquipmentInfo';

/** 技能結晶名稱後的職業標記；共通池不標 */
function poolLabel(type: AbilityType): string | null {
  const pool = getAbilityDefinition(type)?.pool;
  return pool && pool !== 'common' ? CLASS_NAMES_ZH[pool as ClassName] : null;
}

function CrystalEffect({ crystal }: { crystal: AbilityCrystal }) {
  return (
    <>
      {formatCrystalEffectParts(crystal).map((p, i) => {
        if (p.value) return <span key={i} className="bs-crystal-value">{p.text}</span>;
        if (p.range) return <span key={i} className="stat-range">{p.text}</span>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

function CrystalColumn({ crystals, selected, onSelect }: {
  crystals: AbilityCrystal[]; selected: AbilityType | null; onSelect: (type: AbilityType) => void;
}) {
  const groups = [
    { label: '武器結晶', list: crystals.filter(c => getAbilityDefinition(c.type)?.group === 'weapon') },
    { label: '飾品結晶', list: crystals.filter(c => getAbilityDefinition(c.type)?.group === 'accessory') },
  ];
  return (
    <div className="bs-crystal-column">
      {groups.map(g => (
        <div key={g.label} className="bs-crystal-group">
          <div className="bs-crystal-group-title">{g.label}（{g.list.length}）</div>
          {g.list.map(c => {
            const def = getAbilityDefinition(c.type)!;
            const label = poolLabel(c.type);
            return (
              <Tooltip
                key={c.type}
                position="right"
                content={
                  <div className="bs-crystal-tooltip">
                    <div className="bs-crystal-name">{def.name}{label ? `［${label}］` : ''}</div>
                    <div><CrystalEffect crystal={c} /></div>
                  </div>
                }
              >
                <button
                  type="button"
                  className={`bs-crystal ${selected === c.type ? 'selected' : ''}`}
                  aria-pressed={selected === c.type}
                  onClick={() => onSelect(c.type)}
                >
                  <span className="bs-crystal-name">{def.name}</span>
                  {label && <span className="bs-crystal-pool">[{label}]</span>}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** 鐵匠鋪「技能更換」分頁（`07-affix-ability.md` § 7S.8） */
export function BlacksmithAbilitySwap({ templates, onResult }: {
  templates: EquipmentTemplate[]; onResult: (message: string) => void;
}) {
  const char = useGameStore(s => s.character);
  const inventory = useGameStore(s => s.inventory);
  const crystals = useGameStore(s => s.abilityCrystals);
  const [selectedCrystal, setSelectedCrystal] = useState<AbilityType | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  if (!char) return null;

  const crystal = crystals.find(c => c.type === selectedCrystal) ?? null;
  const group = crystal ? getAbilityDefinition(crystal.type)?.group : undefined;
  const templateOf = (item: EquipmentInstance) => templates.find(t => t.id === item.templateId);
  const targets = inventory
    .map(item => ({ item, template: templateOf(item) }))
    .filter((e): e is { item: EquipmentInstance; template: EquipmentTemplate } =>
      !!e.template && !e.item.isCraftedGear && isAbilitySlot(e.template)
      && (!group || (group === 'weapon') === (e.template.slot === 'rightHand')));

  async function handleApply(item: EquipmentInstance, template: EquipmentTemplate, target: AbilityCrystal) {
    const next = crystalToAbility(target, template)!;
    const cost = getCrystalApplyCost(template.tier ?? 0);
    const old = item.ability ? `\n原本的「${formatAbilityDisplay(item.ability)}」會消失。` : '';
    if (!window.confirm(`花費 ${cost.toLocaleString()}G，把 ${item.name} 的隨機技能換成「${formatAbilityDisplay(next)}」？${old}`)) return;
    const result: CraftResult = await useGameStore.getState().applyAbilityCrystal(item.id!, target.type);
    onResult(result.message);
  }

  return (
    <div className="panel-scroll">
      <p className="shop-item-desc">左邊選結晶（滑鼠移上去看效果），右邊選要更換的裝備；原本的技能會消失，結晶不會用掉。費用 1,500,000 × 裝備階級。製作品與身上的裝備不能更換。</p>
      {crystals.length === 0 && <p className="shop-item-desc">還沒有技能結晶：拆解帶隨機技能的掉落品即可取得</p>}
      <div className="bs-swap-grid">
        <CrystalColumn crystals={crystals} selected={selectedCrystal} onSelect={setSelectedCrystal} />
        <div className="shop-items">
          {crystals.length > 0 && (
            <p className="shop-item-desc">{crystal ? '點選裝備查看更換後的數值' : '先在左邊選一顆結晶'}</p>
          )}
          {targets.map(({ item, template }) => {
            const tier = template.tier ?? 0;
            const cost = getCrystalApplyCost(tier);
            const enough = char.gold >= cost;
            const block = crystal ? getCrystalApplyBlock(crystal, item, template) : null;
            const selected = item.id === selectedItemId;
            const preview = selected && crystal && !block ? crystalToAbility(crystal, template) : undefined;
            const color = getEquipmentInstanceTierColor(item, templates);
            return (
              <div
                key={item.id}
                className={`shop-item bs-shop-item ${selected ? 'selected' : ''} ${block || !enough ? 'disabled-look' : ''}`}
                onClick={() => setSelectedItemId(item.id ?? null)}
              >
                <div className="shop-item-info">
                  <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>
                    <span className="shop-item-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={color} />
                      {item.name}{item.enhancement > 0 ? ` +${item.enhancement}` : ''}
                    </span>
                  </Tooltip>
                  <span className="shop-item-desc">{EQUIPMENT_TIER_NAMES[tier as keyof typeof EQUIPMENT_TIER_NAMES]}</span>
                  <span className="shop-item-desc">
                    目前：{item.ability
                      ? <span className="bs-ability-text">{formatAbilityDisplay(item.ability)}</span>
                      : <span className="bs-dim">無隨機技能</span>}
                  </span>
                  {preview && (
                    <span className="shop-item-desc">更換後：<span className="bs-ability-text">{formatAbilityDisplay(preview)}</span></span>
                  )}
                  {block && <span className="shop-item-desc bs-block-reason">{CRYSTAL_APPLY_BLOCK_TEXT[block]}</span>}
                  <span className="shop-item-desc bs-craft-materials">
                    <span className={`bs-craft-mat ${enough ? '' : 'lacking'}`}>
                      <GameIcon name="items/cut-diamond" size={14} color="var(--accent-gold)" />
                      <span className="bs-craft-mat-name" style={enough ? { color: 'var(--accent-gold)' } : undefined}>金幣</span>
                      <span className="bs-craft-mat-count">{char.gold.toLocaleString()}/{cost.toLocaleString()}</span>
                    </span>
                  </span>
                </div>
                <div className="shop-item-actions">
                  <button
                    aria-label={`更換 ${item.name}`}
                    disabled={!preview || !enough}
                    onClick={e => { e.stopPropagation(); void handleApply(item, template, crystal!); }}
                  >
                    更換
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
