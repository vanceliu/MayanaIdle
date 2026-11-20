/**
 * 裝備說明框長詞綴折行（`tooltip-wrap.html`）：範例裝備用正式的 `EquipmentDetail`；
 * 量測表列出每一條詞綴（一般、特殊、隨機技能、T7 獨有）取最長數值時的實際寬度。
 */
import { StrictMode, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { loadTemplateCache, resolveEquipment } from '../src/systems/templateSync';
import {
  AFFIX_POOLS, BONUS_ATTRIBUTE_VALUE, SPECIAL_AFFIX_DEFINITIONS, getAffixCategoryName, getAffixTierTable,
  isElementAffixType, formatAffixDisplayParts, type Affix, type AffixCategory, type AffixType, type DisplayPart,
} from '../src/models/affix';
import {
  ABILITY_DEFINITIONS, formatAbilityDisplayParts, resolveParamRange, type Ability, type AbilityDefinition,
} from '../src/models/ability';
import { UNIQUE_AFFIX_DEFINITIONS, formatUniqueAffixDisplay, type UniqueAffix, type UniqueAffixType } from '../src/models/uniqueAffix';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const QUALITY = 20;

// ── 最長數值的詞綴／技能 ─────────────────────────────────────────────

function maxAffix(type: AffixType, category: AffixCategory): Affix {
  if (type === 'bonus_attribute') return { type, tier: 0, value: BONUS_ATTRIBUTE_VALUE, attribute: 'CHA' };
  const t7 = getAffixTierTable(type, category)[6];
  return {
    type, tier: 7, value: t7.max,
    ...(isElementAffixType(type) ? { element: 'fire' as const } : {}),
    ...(type === 'element_erosion' ? { dotDamage: 30 } : {}),
  };
}

function maxAbility(def: AbilityDefinition, template: EquipmentTemplate): Ability {
  return {
    type: def.type,
    params: Object.fromEntries(def.params.map(p => [p.key, resolveParamRange(p, template)[1]])),
  };
}

function maxUnique(type: UniqueAffixType): UniqueAffix {
  const def = UNIQUE_AFFIX_DEFINITIONS.find(d => d.type === type)!;
  return { type, value: def.range ? def.range[1] : 0 };
}

const weaponValue = (t: EquipmentTemplate) => Math.round(((t.smallMonsterDamage ?? 0) + (t.largeMonsterDamage ?? 0)) / 2);
const pickTop = (slot: string) => templates
  .filter(t => t.slot === slot && (t.tier ?? 0) === 7)
  .sort((a, b) => weaponValue(b) - weaponValue(a))[0];
const WEAPON = pickTop('rightHand');
const NECKLACE = pickTop('necklace');
const RING = pickTop('ring1');

// ── 範例裝備 ─────────────────────────────────────────────────────────

let nextId = 1;
function makeItem(template: EquipmentTemplate, ability: Ability | undefined, unique: UniqueAffix | undefined, affixes: Affix[]): EquipmentInstance {
  return resolveEquipment({
    id: nextId++, templateId: template.id!, name: template.name, type: template.type, slot: template.slot,
    isTwoHanded: template.isTwoHanded, quality: QUALITY, enhancement: 0, stability: template.stability,
    affixes, ownerId: 1, equipped: false,
    ...(ability ? { ability } : {}),
    ...(unique ? { uniqueAffix: unique } : {}),
  } as EquipmentInstance);
}

const abilityDef = (type: string) => ABILITY_DEFINITIONS.find(d => d.type === type)!;

const SAMPLES: { title: string; item: EquipmentInstance }[] = [
  {
    title: '項鍊：怒氣＋受擊魔抗',
    item: makeItem(NECKLACE, maxAbility(abilityDef('rage'), NECKLACE), maxUnique('struck_magic_resist'),
      (['cooldown_reduction', 'drop_rate', 'crit_damage', 'hp_regen'] as AffixType[]).map(t => maxAffix(t, 'necklace'))),
  },
  {
    title: '戒指：平靜＋全屬性',
    item: makeItem(RING, maxAbility(abilityDef('calm'), RING), maxUnique('all_attributes'),
      (['magic_resist', 'evasion', 'crit_rate', 'gold_rate'] as AffixType[]).map(t => maxAffix(t, 'ring'))),
  },
  {
    title: '武器：凍結打擊＋命中回血',
    item: makeItem(WEAPON, maxAbility(abilityDef('freezing_strike'), WEAPON), maxUnique('hit_heal'),
      (['element_erosion', 'element_down', 'attack_splash', 'attack_lifesteal'] as AffixType[]).map(t => maxAffix(t, 'weapon'))),
  },
  {
    title: '武器：無技能、無獨有（對照）',
    item: makeItem(WEAPON, undefined, undefined,
      (['element_erosion', 'element_down', 'attack_splash', 'attack_lifesteal'] as AffixType[]).map(t => maxAffix(t, 'weapon'))),
  },
];

// ── 量測表的每一列 ───────────────────────────────────────────────────

interface Line {
  kind: '一般' | '特殊' | '隨機技能' | 'T7 獨有';
  source: string;
  className: string;
  plain: string;
  ranged: string;
}

const joinParts = (parts: DisplayPart[], showRange: boolean) =>
  parts.filter(p => showRange || !p.range).map(p => (p.range ? ` ${p.text}` : p.text)).join('');

function collectLines(): Line[] {
  const lines = new Map<string, Line>();
  for (const category of Object.keys(AFFIX_POOLS) as AffixCategory[]) {
    for (const type of Object.keys(AFFIX_POOLS[category]) as AffixType[]) {
      const affix = { ...maxAffix(type, category), sealed: true as const };
      const parts = formatAffixDisplayParts(affix, QUALITY, WEAPON ? weaponValue(WEAPON) : undefined, category);
      const plain = joinParts(parts, false);
      const prev = lines.get(plain);
      if (prev) { prev.source += `、${getAffixCategoryName(category)}`; continue; }
      lines.set(plain, {
        kind: '一般', source: getAffixCategoryName(category), className: 'equip-detail-affix tier-7 max-roll sealed',
        plain, ranged: joinParts(parts, true),
      });
    }
  }
  for (const def of SPECIAL_AFFIX_DEFINITIONS) {
    const text = `[特殊] ${def.name}`;
    lines.set(text, { kind: '特殊', source: '—', className: 'equip-detail-affix special', plain: text, ranged: text });
  }
  for (const def of ABILITY_DEFINITIONS) {
    const template = def.group === 'weapon' ? WEAPON : NECKLACE;
    const parts = formatAbilityDisplayParts(maxAbility(def, template), template);
    const plain = joinParts(parts, false);
    lines.set(`ability-${def.type}`, {
      kind: '隨機技能', source: def.pool === 'common' ? `共通（${def.group === 'weapon' ? '武器' : '飾品'}）` : def.pool,
      className: 'equip-detail-affix ability', plain, ranged: joinParts(parts, true),
    });
  }
  for (const def of UNIQUE_AFFIX_DEFINITIONS) {
    const text = formatUniqueAffixDisplay(maxUnique(def.type));
    lines.set(`unique-${def.type}`, { kind: 'T7 獨有', source: def.name, className: 'equip-detail-affix unique', plain: text, ranged: text });
  }
  return [...lines.values()];
}

const LINES = collectLines();

// ── 控制列 ───────────────────────────────────────────────────────────

const DESKTOP_MIN_CHARS = 36;
interface Controls { mobile: number; desktop: number; fontScale: number }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function readControls(): Controls {
  return {
    mobile: Number($<HTMLSelectElement>('mobile-width').value),
    desktop: Number($<HTMLSelectElement>('desktop-width').value),
    fontScale: Number($<HTMLInputElement>('font-scale').value),
  };
}

const CONTROL_IDS = ['mobile-width', 'desktop-width', 'font-scale'];
// 網址參數可預設控制項：`?mobile-width=360&font-scale=1.3`
const query = new URLSearchParams(location.search);
for (const id of CONTROL_IDS) {
  const v = query.get(id);
  if (v !== null) $<HTMLInputElement>(id).value = v;
}
let controls = readControls();
const listeners = new Set<() => void>();
function onControls(): void {
  controls = readControls();
  $('font-scale-out').textContent = String(controls.fontScale);
  document.documentElement.style.setProperty('--font-scale', String(controls.fontScale));
  for (const l of listeners) l();
}
for (const id of CONTROL_IDS) $(id).addEventListener('input', onControls);
onControls();

function useControls(): Controls {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => controls);
}

// ── 畫面 ─────────────────────────────────────────────────────────────

function Viewport({ label, width }: { label: string; width: number }) {
  return (
    <>
      <h2 className="demo-section-title">{label}（{width}px）</h2>
      <div className="demo-viewport" style={{ width: width <= 600 ? width : undefined, ['--demo-vw' as string]: `${width}px` }}>
        {SAMPLES.map(s => (
          <div key={s.title} className="bag-tooltip">
            <div className="bag-tooltip-content">
              <EquipmentDetail item={s.item} hint={s.title} templates={templates} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

interface Measured extends Line { plainPx: number; rangedPx: number }

function MeasureTable() {
  const c = useControls();
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Measured[]>([]);
  const [chrome, setChrome] = useState(0);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>('[data-i]');
    const px: number[][] = LINES.map(() => [0, 0]);
    for (const el of els) px[Number(el.dataset.i)][Number(el.dataset.r)] = el.getBoundingClientRect().width;
    setRows(LINES.map((l, i) => ({ ...l, plainPx: px[i][0], rangedPx: px[i][1] })).sort((a, b) => b.rangedPx - a.rangedPx));
    // 說明框的左右 padding＋邊框
    const box = root.querySelector<HTMLElement>('.bag-tooltip')!;
    const s = getComputedStyle(box);
    setChrome(parseFloat(s.paddingLeft) + parseFloat(s.paddingRight) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth));
  }, [c.fontScale]);

  const mobileAvail = c.mobile - 16 - chrome;
  const fsXs = 12 * c.fontScale;
  const desktopMin = DESKTOP_MIN_CHARS * fsXs;

  return (
    <>
      <h2 className="demo-section-title">全部詞綴寬度（取最長數值，品質 {QUALITY}%，一般詞綴含「(封) 」前綴）</h2>
      <p className="demo-note demo-legend">
        <span>手機 {c.mobile}px 說明框內可用寬度：<b>{mobileAvail.toFixed(0)}px</b></span>
        <span style={{ color: '#EF4444' }}>紅：手機上會折行</span>
        <span style={{ color: '#FACC15' }}>黃：超過桌面最小框寬（{desktopMin.toFixed(0)}px），隨機技能／獨有詞綴會折行</span>
      </p>
      <div ref={ref} className="demo-measure">
        <div className="bag-tooltip" />
        {LINES.map((l, i) => (
          <div key={i}>
            <div className={l.className} data-i={i} data-r={0}>{l.plain}</div>
            <div className={l.className} data-i={i} data-r={1}>{l.ranged}</div>
          </div>
        ))}
      </div>
      <table className="demo-table">
        <thead>
          <tr><th>種類</th><th>來源</th><th>文字（Alt）</th><th>寬度</th><th>Alt 寬度</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const over = r.rangedPx > mobileAvail ? 'over-mobile' : r.rangedPx > desktopMin ? 'over-desktop' : '';
            return (
              <tr key={i} className={over}>
                <td>{r.kind}</td>
                <td>{r.source}</td>
                <td><span className={`demo-sample ${r.className}`}>{r.ranged}</span></td>
                <td className="num">{r.plainPx.toFixed(0)}</td>
                <td className="num">{r.rangedPx.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function App() {
  const c = useControls();
  return (
    <>
      <div className="demo-row">
        <div className="demo-col"><Viewport label="手機" width={c.mobile} /></div>
        <div className="demo-col"><Viewport label="桌面" width={c.desktop} /></div>
      </div>
      <MeasureTable />
    </>
  );
}

await loadTemplateCache();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
