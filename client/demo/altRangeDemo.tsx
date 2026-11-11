/**
 * 裝備 tooltip Alt 區間（`alt-range.html`）：詞綴與隨機技能行改用顯示片段，按住 Alt 印區間。
 */
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { formatAffixDisplayParts, getAffixTierTable, shouldBoldAffix, isSpecialAffixType, isDecimalAffixType, type Affix, type AffixType, type DisplayPart } from '../src/models/affix';
import { useAltHeld } from '../src/hooks/useAltHeld';
import { formatAbilityDisplayParts, type Ability, type AbilityTemplate } from '../src/models/ability';

// ── 假資料 ────────────────────────────────────────────────────────────
const mid = (type: AffixType, tier: number): number => {
  const t = getAffixTierTable(type)[tier - 1];
  const v = (t.min + t.max) / 2;
  return isDecimalAffixType(type) ? Math.round(v * 10) / 10 : Math.round(v);
};

interface DemoItem {
  name: string;
  color: string;
  quality: number;
  template: AbilityTemplate;
  ability?: Ability;
  affixes: Affix[];
}

const ITEMS: DemoItem[] = [
  {
    name: '破曉之刃 +6', color: '#EF4444', quality: 10,
    template: { slot: 'rightHand', tier: 6, smallMonsterDamage: 24, largeMonsterDamage: 20 },
    ability: { type: 'bonus_damage', params: { chance: 8, damage: 15 } },
    affixes: [
      { type: 'attack_power', tier: 4, value: mid('attack_power', 4) },
      { type: 'crit_rate', tier: 6, value: getAffixTierTable('crit_rate')[5].max },
      { type: 'hit_down', tier: 3, value: mid('hit_down', 3) },
      { type: 'crit_damage', tier: 2, value: mid('crit_damage', 2), sealed: true },
    ],
  },
  {
    name: '守護者戒指', color: '#FB923C', quality: 0,
    template: { slot: 'ring1', tier: 5 },
    ability: { type: 'rage', params: { decay: 9 } },
    affixes: [
      { type: 'max_hp', tier: 7, value: 95 },
      { type: 'on_hit_hp', tier: 3, value: mid('on_hit_hp', 3) },
      { type: 'bonus_attribute', tier: 1, value: 1, attribute: 'STR' },
      { type: 'immune_poison', tier: 1, value: 0 },
    ],
  },
];

// ── 渲染 ──────────────────────────────────────────────────────────────
function Parts({ parts, showRange }: { parts: DisplayPart[]; showRange: boolean }) {
  return (
    <>
      {parts.map((p, i) => p.range
        ? showRange && <span key={i}>{' '}<span className="stat-range">{p.text}</span></span>
        : <span key={i}>{p.text}</span>)}
    </>
  );
}

function DemoTooltip({ item, showRange }: { item: DemoItem; showRange: boolean }) {
  return (
    <div className="bag-tooltip">
      <div className="equip-detail">
        <div className="equip-detail-name" style={{ color: item.color }}>{item.name}</div>
        <div className="equip-detail-row">品質: {item.quality}%</div>
        {item.ability && (
          <div className="equip-detail-affixes equip-detail-ability">
            <div className="equip-detail-affix ability">
              <Parts parts={formatAbilityDisplayParts(item.ability, item.template)} showRange={showRange} />
            </div>
          </div>
        )}
        <div className="equip-detail-affixes">
          {item.affixes.map((a, i) => (
            <div
              key={i}
              className={isSpecialAffixType(a.type)
                ? `equip-detail-affix special${a.sealed ? ' sealed' : ''}`
                : `equip-detail-affix tier-${a.tier}${shouldBoldAffix(a) ? ' max-roll' : ''}${a.sealed ? ' sealed' : ''}`}
            >
              <Parts parts={formatAffixDisplayParts(a, isSpecialAffixType(a.type) ? 0 : item.quality)} showRange={showRange} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
  const held = useAltHeld();
  useEffect(() => {
    const el = document.getElementById('state')!;
    el.textContent = held ? '按住 Alt' : '未按 Alt';
    el.classList.toggle('on', held);
  }, [held]);
  return (
    <div className="demo-grid">
      <section className="demo-col">
        <h2>現在</h2>
        {ITEMS.map(item => <DemoTooltip key={item.name} item={item} showRange={false} />)}
      </section>
      <section className="demo-col">
        <h2>按住 Alt</h2>
        {ITEMS.map(item => <DemoTooltip key={item.name} item={item} showRange />)}
      </section>
      <section className="demo-col">
        <h2>跟著鍵盤</h2>
        {ITEMS.map(item => <DemoTooltip key={item.name} item={item} showRange={held} />)}
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
