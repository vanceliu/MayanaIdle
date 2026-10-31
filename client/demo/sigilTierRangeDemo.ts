/**
 * 印記師詞綴列 Tier 區間的四種版面（`sigil-tier-range.html`）。
 * 區間、數值、名稱一律讀 `src/models/affix.ts`。
 */
import {
  formatAffixDescription,
  formatAffixName,
  formatAffixValue,
  getAffixTierTable,
  isDecimalAffixType,
  isMaxRollAffix,
  isSpecialAffixType,
  isTierlessAffixType,
  type Affix,
  type AffixType,
} from '../src/models/affix';

const SAMPLE: Affix[] = [
  { type: 'attack_power', tier: 4, value: 12.3 },
  { type: 'crit_rate', tier: 7, value: 20 },
  { type: 'magic_resist', tier: 6, value: 12.5 },
  { type: 'on_hit_hp', tier: 3, value: 8, restorePercent: 3 },
  { type: 'max_hp', tier: 5, value: 66 },
  { type: 'evasion', tier: 7, value: 250 },
  { type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' },
  { type: 'immune_poison', tier: 0, value: 0 },
];

function tierRange(affix: Affix): { min: number; max: number; text: string } | null {
  if (isTierlessAffixType(affix.type)) return null;
  const t = getAffixTierTable(affix.type as AffixType)[affix.tier - 1];
  const decimal = isDecimalAffixType(affix.type);
  const unit = decimal ? '%' : '';
  const fmt = (v: number) => (decimal ? v.toFixed(1) : String(v));
  return { min: t.min, max: t.max, text: `${fmt(t.min)}~${fmt(t.max)}${unit}` };
}

function label(affix: Affix): string {
  if (isTierlessAffixType(affix.type)) return formatAffixName(affix);
  return `${formatAffixName(affix)} T${affix.tier}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
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

function rowEl(affix: Affix, title: string): HTMLButtonElement {
  const row = el('button', 'sigil-affix-row');
  row.type = 'button';
  row.title = title;
  return row;
}

function baseTitle(affix: Affix): string {
  const desc = formatAffixDescription(affix);
  return desc;
}

type Variant = { name: string; note: string; render: (affix: Affix) => HTMLButtonElement };

const VARIANTS: Variant[] = [
  {
    name: 'A：數值後接區間（同一列）',
    note: '一眼看到數值與區間，不增加列高。',
    render: affix => {
      const row = rowEl(affix, baseTitle(affix));
      row.append(tagEl(affix));
      if (affix.value || !isTierlessAffixType(affix.type)) row.append(valueEl(affix));
      const r = tierRange(affix);
      if (r) row.append(el('span', 'sigil-range-inline', `（${r.text}）`));
      return row;
    },
  },
  {
    name: 'B：數值下方第二行',
    note: '數值仍是主角，區間退到小字；每列多半行高度。',
    render: affix => {
      const row = rowEl(affix, baseTitle(affix));
      row.append(tagEl(affix));
      const stack = el('span', 'sigil-range-stack');
      if (affix.value || !isTierlessAffixType(affix.type)) stack.append(valueEl(affix));
      const r = tierRange(affix);
      if (r) stack.append(el('span', 'sigil-range-sub', `T${affix.tier} 區間 ${r.text}`));
      row.append(stack);
      return row;
    },
  },
  {
    name: 'C：位置條',
    note: '條的長度＝數值在區間中的位置，重刻好壞最直觀；佔用剩餘寬度。',
    render: affix => {
      const row = rowEl(affix, baseTitle(affix));
      row.append(tagEl(affix));
      if (affix.value || !isTierlessAffixType(affix.type)) row.append(valueEl(affix));
      const r = tierRange(affix);
      if (r) {
        const bar = el('span', `sigil-range-bar tier-${affix.tier}`);
        const track = el('span', 'sigil-range-track');
        const fill = el('span', 'sigil-range-fill');
        const ratio = r.max === r.min ? 1 : (affix.value - r.min) / (r.max - r.min);
        fill.style.width = `${Math.max(4, ratio * 100)}%`;
        track.append(fill);
        const decimal = isDecimalAffixType(affix.type);
        const fmt = (v: number) => (decimal ? v.toFixed(1) : String(v));
        bar.append(el('span', '', fmt(r.min)), track, el('span', '', fmt(r.max)));
        bar.style.color = tierColor.get(affix.tier) ?? '';
        row.append(bar);
      }
      return row;
    },
  },
  {
    name: 'D：只放在 tooltip',
    note: '列上維持現狀，滑過才看到區間；手機上看不到。',
    render: affix => {
      const r = tierRange(affix);
      const title = r ? `${baseTitle(affix)}\nT${affix.tier} 區間 ${r.text}` : baseTitle(affix);
      const row = rowEl(affix, title);
      row.append(tagEl(affix));
      if (affix.value || !isTierlessAffixType(affix.type)) row.append(valueEl(affix));
      return row;
    },
  },
];

function renderGrid(): void {
  const grid = document.getElementById('grid')!;
  grid.replaceChildren();
  for (const v of VARIANTS) {
    const card = el('section', 'demo-card');
    card.append(el('h2', '', v.name), el('p', '', v.note));
    const list = el('div', 'sigil-affixes');
    for (const affix of SAMPLE) list.append(v.render(affix));
    card.append(list);
    grid.append(card);
  }
}

/* C 的位置條顏色取 Tier 色（沿用 App.css 的 `.affix-tag.tier-N`） */
const tierColor = new Map<number, string>();
for (let tier = 1; tier <= 7; tier++) {
  const tag = el('span', `affix-tag tier-${tier}`);
  document.body.append(tag);
  tierColor.set(tier, getComputedStyle(tag).color);
  tag.remove();
}

renderGrid();

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-width]')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-width]').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('grid')!.classList.toggle('mobile', btn.dataset.width === 'mobile');
  });
}

