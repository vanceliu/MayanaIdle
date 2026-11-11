/**
 * 印記師詞綴列定案版（`sigil-tier-range.html`，`13-town.md` § 13.13.1）：
 * 標籤＋數值＋Tier 區間位置條；不能選的原因在整列 tooltip。
 * 資料重現實際畫面：盜賊皮衣與風鳴弓（商店裝）、選精鍊印記，含不能選的列。
 * 區間、數值、名稱讀 `src/models/affix.ts`，樣式用 App.css 的 `.sigil-*`。
 */
import {
  formatAffixBound,
  formatAffixDescription,
  formatAffixName,
  formatAffixValue,
  getAffixTierRange,
  isMaxRollAffix,
  isSpecialAffixType,
  isTierlessAffixType,
  type Affix,
} from '../src/models/affix';

type Row = { affix: Affix; reason?: string };

const SAMPLES: { title: string; rows: Row[] }[] = [
  {
    title: '盜賊皮衣（精鍊上限 T5）',
    rows: [
      { affix: { type: 'drop_rate', tier: 5, value: 13 }, reason: '下一階由突破印記受理' },
      { affix: { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'SPI' }, reason: '額外屬性沒有 Tier，無法升階' },
      { affix: { type: 'max_hp', tier: 5, value: 69 }, reason: '下一階由突破印記受理' },
      { affix: { type: 'on_hit_hp', tier: 5, value: 5 }, reason: '下一階由突破印記受理' },
    ],
  },
  {
    title: '風鳴弓（商店裝，精鍊上限 T3）',
    rows: [
      { affix: { type: 'skill_elemental', tier: 2, value: 8 } },
      { affix: { type: 'element_brand', tier: 1, value: 4, element: 'wind' } },
      { affix: { type: 'defense_down', tier: 1, value: 3.1 } },
      { affix: { type: 'element_erosion', tier: 3, value: 9, element: 'dark', dotDamage: 10 }, reason: 'T3 已是上限，無法再升階' },
    ],
  },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function label(affix: Affix): string {
  return isTierlessAffixType(affix.type) ? formatAffixName(affix) : `${formatAffixName(affix)} T${affix.tier}`;
}

function tagEl(affix: Affix): HTMLSpanElement {
  const cls = isSpecialAffixType(affix.type)
    ? 'affix-tag special'
    : `affix-tag tier-${affix.tier}${isMaxRollAffix(affix) ? ' max-roll' : ''}`;
  return el('span', cls, label(affix));
}

function valueEl(affix: Affix): HTMLSpanElement {
  return el('span', `sigil-affix-value${isMaxRollAffix(affix) ? ' max-roll' : ''}`, formatAffixValue(affix));
}

/** 同 `SigilMaster.tsx` 的 `renderTierRangeBar` */
function rangeBarEl(affix: Affix): HTMLSpanElement | null {
  const r = getAffixTierRange(affix);
  if (!r) return null;
  const ratio = r.max === r.min ? 1 : (affix.value - r.min) / (r.max - r.min);
  const bar = el('span', `sigil-range-bar tier-${affix.tier}`);
  const track = el('span', 'sigil-range-track');
  const fill = el('span', 'sigil-range-fill');
  fill.style.width = `${Math.round(Math.min(100, Math.max(0, ratio * 100)) * 10) / 10}%`;
  track.append(fill);
  bar.append(
    el('span', 'sigil-range-bound', formatAffixBound(affix.type, r.min)),
    track,
    el('span', 'sigil-range-bound', formatAffixBound(affix.type, r.max)),
  );
  return bar;
}

function rowEl(row: Row): HTMLButtonElement {
  const btn = el('button', 'sigil-affix-row');
  btn.type = 'button';
  if (row.reason) btn.setAttribute('aria-disabled', 'true');
  const description = formatAffixDescription(row.affix);
  btn.title = row.reason ? `${description}\n${row.reason}` : description;
  btn.append(tagEl(row.affix), valueEl(row.affix));
  const bar = rangeBarEl(row.affix);
  if (bar) btn.append(bar);
  return btn;
}

function render(): void {
  const grid = document.getElementById('grid')!;
  grid.replaceChildren();
  for (const sample of SAMPLES) {
    const card = el('section', 'demo-card');
    card.append(el('h2', '', sample.title));
    const list = el('div', 'sigil-affixes');
    for (const row of sample.rows) list.append(rowEl(row));
    card.append(list);
    grid.append(card);
  }
}

render();

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-width]')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-width]').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('grid')!.classList.toggle('mobile', btn.dataset.width === 'mobile');
  });
}
