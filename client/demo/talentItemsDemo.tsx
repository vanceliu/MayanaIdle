/**
 * 自動天賦道具選單（`talentItems.html`）：`TalentItemSelect` 放在天賦格列的版面裡，四種選項範圍各一列。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TalentItemSelect } from '../src/components/TalentItemSelect';
import { getItemId } from '../src/models/items';
import type { TalentItemPool } from '../src/models/talentParams';

const ROWS: { rule: string; label: string; pool?: TalentItemPool; initial?: string }[] = [
  { rule: '購買道具至', label: '道具 1', pool: 'shop', initial: '白色藥水' },
  { rule: '從倉庫取道具至', label: '道具 1' },
  { rule: '道具數量少於', label: '道具', initial: '試煉飛龍之鱗' },
  { rule: '使用解除道具', label: '解除道具', pool: 'cure' },
  { rule: '使用指定消耗品', label: '道具', pool: 'consumable' },
];

function Row({ rule, label, pool, initial }: (typeof ROWS)[number]) {
  const [value, setValue] = useState<number | undefined>(initial ? getItemId(initial) : undefined);
  return (
    <div className="talent-entry demo-row">
      <span className="demo-rule">{rule}</span>
      <TalentItemSelect label={label} pool={pool} value={value} onWrite={setValue} />
    </div>
  );
}

function App() {
  return (
    <section className="demo-card">
      {ROWS.map(r => <Row key={r.rule} {...r} />)}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
