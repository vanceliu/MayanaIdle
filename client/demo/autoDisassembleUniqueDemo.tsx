/**
 * 自動拆解含 (獨)（`auto-disassemble-unique.html`，`49-village-script.md` § 49.4.1）：
 * 補給天賦「拆解裝備」的參數列，預設顯示改後，可勾選附上現行版本對照。欄位取自 `getParamFields('dismantle_equipment')`，
 * 改後在「含製作品 (鍛)」之後插入「含製作品 (獨)」（src 已有該欄位時直接沿用）。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getParamFields, visibleParamFields, type ParamField } from '../src/models/talentParams';
import { getTalentRuleDef } from '../src/db/seed/talentSeeds';
import { ruleLabel } from '../src/models/talentLabels';
import { RuleIcon } from '../src/components/TalentEditor';
import { TalentMultiParam } from '../src/components/TalentMultiParam';

const UNIQUE_FIELD: ParamField = { key: 'includeUniqueCrafted', kind: 'boolean', label: '含製作品 (獨)', def: false };
const isUniqueField = (f: ParamField) => f.label.includes('(獨)');

const SRC_FIELDS = getParamFields('dismantle_equipment');
const BEFORE_FIELDS = SRC_FIELDS.filter(f => !isUniqueField(f));
const AFTER_FIELDS: readonly ParamField[] = SRC_FIELDS.some(isUniqueField)
  ? SRC_FIELDS
  : BEFORE_FIELDS.flatMap(f => (f.key === 'includeCrafted' ? [f, UNIQUE_FIELD] : [f]));

type Params = Record<string, unknown>;

function ParamInput({ field, params, onWrite, highlight }: {
  field: ParamField; params: Params; onWrite: (key: string, value: unknown) => void; highlight: boolean;
}) {
  const cls = `talent-param${highlight ? ' demo-new-field' : ''}`;
  if (field.kind === 'number') {
    return (
      <label className={cls}>
        <span>{field.label}</span>
        <input
          type="number" min={field.min} max={field.max}
          value={(params[field.key] as number | undefined) ?? field.def ?? ''}
          onChange={e => onWrite(field.key, Number(e.target.value))}
        />
        {field.suffix && <span className="talent-param-suffix">{field.suffix}</span>}
      </label>
    );
  }
  if (field.kind === 'boolean') {
    return (
      <label className={cls}>
        <span>{field.label}</span>
        <input
          type="checkbox"
          checked={(params[field.key] as boolean | undefined) ?? field.def}
          onChange={e => onWrite(field.key, e.target.checked)}
        />
      </label>
    );
  }
  if (field.kind === 'select') {
    return (
      <label className={cls}>
        <span>{field.label}</span>
        <select value={String((params[field.key] as string | undefined) ?? field.def)} onChange={e => onWrite(field.key, e.target.value)}>
          {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }
  if (field.kind === 'multi') {
    return (
      <TalentMultiParam
        label={field.label} source={field.source}
        value={params[field.key] as (string | number)[] | undefined}
        onWrite={next => onWrite(field.key, next)}
      />
    );
  }
  return null;
}

function FilledSlot({ ruleId, fields, params, onWrite, newKey }: {
  ruleId: string; fields: readonly ParamField[]; params: Params; onWrite: (key: string, value: unknown) => void; newKey?: string;
}) {
  const def = getTalentRuleDef(ruleId);
  return (
    <div className="talent-slot is-filled">
      {def && <RuleIcon def={def} />}
      <span className="talent-slot-name">{ruleLabel(ruleId)}</span>
      {visibleParamFields(fields, params).map(f => (
        <ParamInput key={f.key} field={f} params={params} onWrite={onWrite} highlight={f.key === newKey} />
      ))}
      <button className="talent-slot-remove" title="清空" aria-label="清空">✕</button>
    </div>
  );
}

function Editor({ after }: { after: boolean }) {
  const [cond, setCond] = useState<Params>({ match: 'town' });
  const [action, setAction] = useState<Params>({ maxTier: 5, includeCrafted: true });
  const fields = after ? AFTER_FIELDS : BEFORE_FIELDS;
  const resolved = Object.fromEntries(fields
    .filter(f => f.kind !== 'multi')
    .map(f => [f.key, action[f.key] ?? ('def' in f ? f.def : undefined)]));
  return (
    <section className={`demo-card demo-editor${after ? '' : ' is-before'}`}>
      <h2>{after ? '改後：新增「含製作品 (獨)」' : '現行'}</h2>
      <div className="script-tabs">
        <button className="script-tab">戰鬥</button>
        <button className="script-tab">常駐</button>
        <button className="script-tab active">補給</button>
      </div>
      <div className="talent-editor" data-talent-type="supply">
        <ul className="talent-list">
          <li className="talent-row">
            <span className="talent-row-handle" title="拖曳調整順序（由上往下判定）">⠿</span>
            <span className="talent-row-order">1</span>
            <label className="talent-row-enable" title="停用這一列"><input type="checkbox" defaultChecked /></label>
            <div className="talent-row-slots">
              <div className="talent-row-conds">
                <FilledSlot ruleId="in_town" fields={getParamFields('in_town')} params={cond} onWrite={(k, v) => setCond(p => ({ ...p, [k]: v }))} />
              </div>
              <div className="talent-row-act">
                <span className="talent-row-arrow">→</span>
                <FilledSlot
                  ruleId="dismantle_equipment" fields={fields} params={action}
                  onWrite={(k, v) => setAction(p => ({ ...p, [k]: v }))}
                  newKey={after ? AFTER_FIELDS.find(isUniqueField)?.key : undefined}
                />
              </div>
            </div>
            <button className="talent-row-uninstall" title="拆下天賦格（設定保留）">拆下</button>
          </li>
        </ul>
      </div>
      <div className="demo-params">參數：{JSON.stringify(resolved)}</div>
    </section>
  );
}

function App() {
  const [showBefore, setShowBefore] = useState(false);
  return (
    <>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <input type="checkbox" checked={showBefore} onChange={e => setShowBefore(e.target.checked)} /> 顯示現行版本對照
      </label>
      <div className="demo-grid">
        <Editor after />
        {showBefore && <Editor after={false} />}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
