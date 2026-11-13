/**
 * 競技場兌換箱（`arena-box.html`，`55-arena.md` § 55.9）：用遊戲實際的開箱邏輯連續開箱，看裝備與統計。
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import type { ClassName } from '../src/models/character';
import { CLASS_NAMES_ZH } from '../src/models/character';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { getItemById } from '../src/models/items';
import { isTierlessAffixType } from '../src/models/affix';
import { loadTemplateCache, resolveEquipment } from '../src/systems/templateSync';
import { ARENA_BOXES, arenaBoxCandidates, rollArenaBoxEquipment, type ArenaBoxKind } from '../src/systems/arenaBox';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const KINDS: { kind: ArenaBoxKind; label: string }[] = [
  { kind: 'weapon', label: '武器' }, { kind: 'armor', label: '防具' }, { kind: 'accessory', label: '飾品' },
];
const CLASSES: ClassName[] = ['knight', 'elf', 'thief', 'elementalist', 'priest'];
const SHOWN = 24;

interface Stats {
  boxes: number;
  mimic: number;
  sealed: number;
  sealedNonMimic: number;
  ability: number;
  abilityEligible: number;
  affixCounts: number[];
  tiers: number[];
  templates: Map<string, number>;
}

const emptyStats = (): Stats => ({
  boxes: 0, mimic: 0, sealed: 0, sealedNonMimic: 0, ability: 0, abilityEligible: 0,
  affixCounts: [0, 0, 0, 0, 0], tiers: [0, 0, 0, 0, 0, 0, 0], templates: new Map(),
});

const pct = (n: number, d: number) => (d ? `${(100 * n / d).toFixed(1)}%` : '—');

function App() {
  const [tier, setTier] = useState<4 | 5 | 6>(6);
  const [kind, setKind] = useState<ArenaBoxKind>('weapon');
  const [cls, setCls] = useState<ClassName>('knight');
  const [items, setItems] = useState<EquipmentInstance[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);

  const box = ARENA_BOXES.find(b => b.tier === tier && b.kind === kind)!;
  const candidates = arenaBoxCandidates(box, templates);
  useEffect(() => { setItems([]); setStats(emptyStats()); }, [tier, kind, cls]);

  const open = (n: number) => {
    const opened: EquipmentInstance[] = [];
    const s = { ...stats, affixCounts: [...stats.affixCounts], tiers: [...stats.tiers], templates: new Map(stats.templates) };
    for (let i = 0; i < n; i++) {
      const template = candidates[Math.floor(Math.random() * candidates.length)];
      const record = rollArenaBoxEquipment(box, template, 1, cls);
      const item = resolveEquipment({
        ...record, id: s.boxes + i + 1, name: template.name, type: template.type, isTwoHanded: template.isTwoHanded,
      } as EquipmentInstance);
      opened.push(item);
      const general = item.affixes.filter(a => !a.sealed);
      s.mimic += item.isMimicGear ? 1 : 0;
      if (item.affixes.some(a => a.sealed)) { s.sealed++; if (!item.isMimicGear) s.sealedNonMimic++; }
      if (kind !== 'armor') { s.abilityEligible++; if (item.ability) s.ability++; }
      s.affixCounts[general.length] = (s.affixCounts[general.length] ?? 0) + 1;
      for (const a of item.affixes) if (!isTierlessAffixType(a.type) && a.tier > 0) s.tiers[a.tier - 1]++;
      s.templates.set(template.name, (s.templates.get(template.name) ?? 0) + 1);
    }
    s.boxes += n;
    setStats(s);
    setItems(prev => [...opened.slice(-SHOWN).reverse(), ...prev].slice(0, SHOWN));
  };

  const tierTotal = stats.tiers.reduce((a, b) => a + b, 0);
  const nonMimic = stats.boxes - stats.mimic;

  return (
    <div className="demo-layout">
      <section className="demo-card demo-controls">
        <h2>{getItemById(box.itemId)?.name}</h2>
        <div className="demo-row">
          {([4, 5, 6] as const).map(t => <button key={t} className={tier === t ? 'active' : ''} onClick={() => setTier(t)}>T{t}</button>)}
        </div>
        <div className="demo-row">
          {KINDS.map(k => <button key={k.kind} className={kind === k.kind ? 'active' : ''} onClick={() => setKind(k.kind)}>{k.label}</button>)}
        </div>
        <div className="demo-row">
          <label>開箱角色職業（影響職業技能池）</label>
          <select value={cls} onChange={e => setCls(e.target.value as ClassName)}>
            {CLASSES.map(c => <option key={c} value={c}>{CLASS_NAMES_ZH[c]}</option>)}
          </select>
        </div>
        <p className="demo-meta">價格：T{tier} 票券 {box.price} 張｜候選模板 {candidates.length} 件</p>
        <div className="demo-row">
          <button onClick={() => open(1)}>開 1 箱</button>
          <button onClick={() => open(10)}>開 10 箱</button>
          <button onClick={() => open(1000)}>開 1,000 箱（統計）</button>
          <button onClick={() => { setItems([]); setStats(emptyStats()); }}>清除</button>
        </div>
        <h3>統計（{stats.boxes.toLocaleString()} 箱）</h3>
        <table className="wiki-table demo-stats">
          <tbody>
            <tr><td>擬態品 (擬)</td><td className="cell-number">{pct(stats.mimic, stats.boxes)}</td><td>規格 50%</td></tr>
            <tr><td>封印詞綴（擬態品）</td><td className="cell-number">{pct(stats.sealed - stats.sealedNonMimic, stats.mimic)}</td><td>規格 100%</td></tr>
            <tr><td>封印詞綴（非擬態）</td><td className="cell-number">{pct(stats.sealedNonMimic, nonMimic)}</td><td>規格 10%</td></tr>
            {kind !== 'armor' && <tr><td>隨機技能</td><td className="cell-number">{pct(stats.ability, stats.abilityEligible)}</td><td>擬態 100%＋非擬態 30% → 約 65%</td></tr>}
            <tr><td>一般詞綴條數 1／2／3／4</td><td className="cell-number" colSpan={2}>{stats.affixCounts.slice(1).map(n => pct(n, stats.boxes)).join('／')}</td></tr>
            <tr><td>詞綴階級 T1～T7</td><td className="cell-number" colSpan={2}>{stats.tiers.map((n, i) => `T${i + 1} ${pct(n, tierTotal)}`).join('　')}</td></tr>
            <tr><td>開出過的模板</td><td className="cell-number" colSpan={2}>{stats.templates.size}／{candidates.length} 件</td></tr>
          </tbody>
        </table>
      </section>
      <section className="demo-items">
        {items.length === 0 && <p className="demo-meta">按「開箱」看結果；最近 {SHOWN} 件依新到舊排列。</p>}
        {items.map(item => (
          <div key={item.id} className="demo-card demo-item">
            <EquipmentDetail item={item} templates={templates} />
          </div>
        ))}
      </section>
    </div>
  );
}

await loadTemplateCache();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
