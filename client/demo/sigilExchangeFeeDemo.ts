/**
 * 印記兌換手續費輸入方式比較（`sigil-exchange-fee.html`）。
 * 數量常數與印記名稱／顏色讀 `src/models/sigil.ts` 與 `sigilDisplay`，樣式用 App.css 的 `.sigil-exchange-*`。
 */
import {
  SIGIL_EXCHANGE_FEE_COUNT,
  SIGIL_EXCHANGE_FEE_TYPES,
  SIGIL_EXCHANGE_INPUT_COUNT,
  SIGIL_EXCHANGE_TYPES,
  type SigilType,
} from '../src/models/sigil';
import { sigilDisplay } from '../src/components/town/sigilDisplay';

type Control = { label: string; delta: number | 'fill' };

type Variant = { name: string; desc: string; controls: Control[] };

const VARIANTS: Variant[] = [
  {
    name: '方案三：±10＋填滿（滑過按鈕看 tooltip）',
    desc: '−10／−／數量／＋／＋10／填滿。填滿＝用這一種補到合計 50（受持有數限制）。',
    controls: [
      { label: '−10', delta: -10 }, { label: '−', delta: -1 }, { label: '＋', delta: 1 },
      { label: '＋10', delta: 10 }, { label: '填滿', delta: 'fill' },
    ],
  },
];

/** 按鈕 tooltip：這一下的作用 */
function controlTitle(c: Control, name: string, required: number): string {
  if (c.delta === 'fill') return `用${name}補到合計 ${required} 個（持有不足時補到持有數為止）`;
  return c.delta > 0 ? `${name} +${c.delta}` : `${name} −${-c.delta}`;
}

const held: Record<SigilType, number> = Object.fromEntries(
  [...SIGIL_EXCHANGE_TYPES, ...SIGIL_EXCHANGE_FEE_TYPES].map(t => [t, 3]),
) as Record<SigilType, number>;

function readHeld(): void {
  held.temper = Number((document.getElementById('held-temper') as HTMLInputElement).value) || 0;
  held.polish = Number((document.getElementById('held-polish') as HTMLInputElement).value) || 0;
}

function autoFill(): Partial<Record<SigilType, number>> {
  const out: Partial<Record<SigilType, number>> = {};
  let left = SIGIL_EXCHANGE_FEE_COUNT;
  for (const t of SIGIL_EXCHANGE_FEE_TYPES) {
    const n = Math.min(left, held[t]);
    if (n > 0) out[t] = n;
    left -= n;
  }
  return out;
}

const autofillBox = () => (document.getElementById('autofill') as HTMLInputElement).checked;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function mountVariant(v: Variant): HTMLElement {
  const card = el('section', 'demo-card');
  let inputs: Partial<Record<SigilType, number>> = {};
  let fee: Partial<Record<SigilType, number>> = autofillBox() ? autoFill() : {};
  let message = '';
  let presses = 0;

  const sum = (c: Partial<Record<SigilType, number>>) => Object.values(c).reduce((a, b) => a + (b ?? 0), 0);

  function countRow(
    type: SigilType,
    counts: Partial<Record<SigilType, number>>,
    required: number,
    controls: Control[],
    onChange: (next: Partial<Record<SigilType, number>>) => void,
  ): HTMLElement {
    const info = sigilDisplay(type);
    const n = counts[type] ?? 0;
    const total = sum(counts);
    const row = el('div', 'sigil-exchange-row');
    if (info.color) row.style.setProperty('--sigil-color', info.color);
    row.append(el('span', 'sigil-choice-dot'), el('span', 'sigil-exchange-name', info.name), el('span', 'sigil-choice-count', `持有 ${held[type]}`));
    const amount = el('span', 'sigil-exchange-amount', String(n));
    const minusSide = controls.filter(c => c.delta !== 'fill' && c.delta < 0);
    const plusSide = controls.filter(c => c.delta === 'fill' || c.delta > 0);
    const button = (c: Control) => {
      const b = el('button', c.label.length > 1 ? 'demo-wide' : '', c.label);
      b.type = 'button';
      const target = c.delta === 'fill'
        ? Math.min(held[type], n + (required - total))
        : Math.max(0, Math.min(n + c.delta, held[type], n + (required - total)));
      b.disabled = target === n;
      b.title = controlTitle(c, info.name, required);
      b.setAttribute('aria-label', c.delta === 'fill' ? `用${info.name}填滿` : `${info.name}${c.label}`);
      b.addEventListener('click', () => { presses++; onChange({ ...counts, [type]: target }); });
      return b;
    };
    row.append(...minusSide.map(button), amount, ...plusSide.map(button));
    return row;
  }

  function render(): void {
    card.replaceChildren();
    card.append(el('h2', '', v.name), el('p', 'demo-desc', v.desc));

    card.append(el('p', 'sigil-section-title', `材料（已選 ${sum(inputs)} / ${SIGIL_EXCHANGE_INPUT_COUNT}）`));
    const mats = el('div', 'sigil-exchange-counts');
    for (const t of SIGIL_EXCHANGE_TYPES) {
      mats.append(countRow(t, inputs, SIGIL_EXCHANGE_INPUT_COUNT, [{ label: '−', delta: -1 }, { label: '＋', delta: 1 }], next => { inputs = next; message = ''; render(); }));
    }
    card.append(mats);

    card.append(el('p', 'sigil-section-title', `手續費（已選 ${sum(fee)} / ${SIGIL_EXCHANGE_FEE_COUNT}）`));
    const fees = el('div', 'demo-fee-rows');
    for (const t of SIGIL_EXCHANGE_FEE_TYPES) {
      fees.append(countRow(t, fee, SIGIL_EXCHANGE_FEE_COUNT, v.controls, next => { fee = next; message = ''; render(); }));
    }
    card.append(fees);

    const ok = sum(inputs) === SIGIL_EXCHANGE_INPUT_COUNT && sum(fee) === SIGIL_EXCHANGE_FEE_COUNT;
    const footer = el('div', 'sigil-footer');
    const msg = message
      || (sum(inputs) !== SIGIL_EXCHANGE_INPUT_COUNT ? `材料需剛好 ${SIGIL_EXCHANGE_INPUT_COUNT} 個（目前 ${sum(inputs)}）`
        : sum(fee) !== SIGIL_EXCHANGE_FEE_COUNT ? `手續費需剛好 ${SIGIL_EXCHANGE_FEE_COUNT} 個（目前 ${sum(fee)}）` : `已按 ${presses} 下`);
    footer.append(el('span', `sigil-footer-msg${ok || message ? '' : ' is-error'}`, msg));
    const apply = el('button', 'sigil-apply', '兌換');
    apply.disabled = !ok;
    apply.addEventListener('click', () => {
      for (const t of SIGIL_EXCHANGE_FEE_TYPES) held[t] -= fee[t] ?? 0;
      message = `兌換成功（這次按了 ${presses} 下）`;
      presses = 0;
      inputs = {};
      fee = autofillBox() ? autoFill() : {};
      renderAll();
    });
    footer.append(apply);
    card.append(footer);
  }

  card.addEventListener('demo:reset', () => { fee = autofillBox() ? autoFill() : {}; presses = 0; message = ''; render(); });
  card.addEventListener('demo:render', render);
  render();
  return card;
}

const cards: HTMLElement[] = [];

function renderAll(): void {
  (document.getElementById('held-temper') as HTMLInputElement).value = String(held.temper);
  (document.getElementById('held-polish') as HTMLInputElement).value = String(held.polish);
  for (const c of cards) c.dispatchEvent(new Event('demo:render'));
}

readHeld();
const grid = document.getElementById('grid')!;
for (const v of VARIANTS) {
  const card = mountVariant(v);
  cards.push(card);
  grid.append(card);
}

for (const id of ['autofill', 'held-temper', 'held-polish']) {
  document.getElementById(id)!.addEventListener('change', () => {
    readHeld();
    for (const c of cards) c.dispatchEvent(new Event('demo:reset'));
  });
}

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-width]')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-width]').forEach(b => b.classList.toggle('active', b === btn));
    grid.classList.toggle('mobile', btn.dataset.width === 'mobile');
  });
}
