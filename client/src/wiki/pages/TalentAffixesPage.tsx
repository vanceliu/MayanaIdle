import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TALENT_AFFIX_DEFS } from '../../db/seed/talentSeeds';
import {
  TALENT_TYPES,
  BLOCKED_LABELS,
  TALENT_TYPE_LABELS,
  type TalentAffixDef,
  type TalentAffixForm,
  type TalentAffixKind,
  type TalentTier,
  type TalentType,
} from '../../models/talent';
import { getTalentAffixIcon, MATERIAL_TIER_COLORS } from '../../models/iconMap';
import { GameIcon } from '../../components/GameIcon';
import { affixLabelOf } from '../../components/TalentEditor';
import { affixDescription } from '../talentAffixDescriptions';
import '../components/WikiTable.css';

const KIND_LABELS: Record<TalentAffixKind, string> = {
  condition: '條件',
  action: '實作',
};

const FORM_LABELS: Record<TalentAffixForm, string> = {
  fixed: '指定',
  pool: '池',
  free: '自選',
};

const TIERS: TalentTier[] = [1, 2, 3, 4, 5, 6, 7];

/**
 * 鑲材總表（`43-wiki-system.md` § 4.12）。
 *
 * **必須列出玩家尚未取得的** —— 編輯器只顯示已持有的（`51-auto-talent.md` § 51.10）。
 * `?tier=` 由怪物頁的掉落表帶進來。
 */
export function TalentAffixesPage() {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<TalentAffixKind | 'all'>('all');
  const [type, setType] = useState<TalentType | 'all'>('all');
  const [form, setForm] = useState<TalentAffixForm | 'all'>('all');
  const tier = params.get('tier') ?? 'all';

  const rows = useMemo(() => {
    let list: TalentAffixDef[] = [...TALENT_AFFIX_DEFS];
    if (tier !== 'all') list = list.filter(d => String(d.tier) === tier);
    if (kind !== 'all') list = list.filter(d => d.kind === kind);
    if (type !== 'all') list = list.filter(d => d.appliesTo.includes(type));
    if (form !== 'all') list = list.filter(d => d.form === form);
    return list.sort((a, b) => a.tier - b.tier || a.kind.localeCompare(b.kind) || a.id - b.id);
  }, [tier, kind, type, form]);

  function setTier(next: string) {
    const q = new URLSearchParams(params);
    if (next === 'all') q.delete('tier');
    else q.set('tier', next);
    setParams(q, { replace: true });
  }

  return (
    <div>
      <h2 className="wiki-page-title">鑲材總表</h2>
      <div className="wiki-filters">
        <select className="wiki-filter-select" aria-label="階級篩選"
          value={tier} onChange={e => setTier(e.target.value)}>
          <option value="all">全部階級</option>
          {TIERS.map(t => <option key={t} value={t}>T{t}</option>)}
        </select>
        <select className="wiki-filter-select" aria-label="種類篩選"
          value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
          <option value="all">全部種類</option>
          {(Object.keys(KIND_LABELS) as TalentAffixKind[]).map(k => (
            <option key={k} value={k}>{KIND_LABELS[k]}</option>
          ))}
        </select>
        <select className="wiki-filter-select" aria-label="適用類型篩選"
          value={type} onChange={e => setType(e.target.value as typeof type)}>
          <option value="all">全部適用類型</option>
          {TALENT_TYPES.map(t => <option key={t} value={t}>{TALENT_TYPE_LABELS[t]}</option>)}
        </select>
        <select className="wiki-filter-select" aria-label="型態篩選"
          value={form} onChange={e => setForm(e.target.value as typeof form)}>
          <option value="all">全部型態</option>
          {(Object.keys(FORM_LABELS) as TalentAffixForm[]).map(f => (
            <option key={f} value={f}>{FORM_LABELS[f]}</option>
          ))}
        </select>
        <span className="wiki-note">{rows.length} / {TALENT_AFFIX_DEFS.length} 筆</span>
      </div>

      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>鑲材</th><th>說明</th><th>階級</th><th>種類</th><th>適用</th><th>型態</th><th>取得</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id}>
                <td>
                  <span className="wiki-affix-name">
                    <GameIcon
                      name={getTalentAffixIcon(d.ruleId, d.kind)}
                      size={20}
                      color={MATERIAL_TIER_COLORS[d.tier]}
                    />
                    {affixLabelOf(d)}
                  </span>
                </td>
                <td>{affixDescription(d)}</td>
                <td>T{d.tier}</td>
                <td>{KIND_LABELS[d.kind]}</td>
                <td>{d.appliesTo.map(t => TALENT_TYPE_LABELS[t]).join('／')}</td>
                <td>{FORM_LABELS[d.form]}</td>
                {/* 未開放的鑲材標明原因，免得玩家白刷（§ 51.4.3.2、§ 51.4.4） */}
                <td>{d.blocked ? BLOCKED_LABELS[d.blockedReason ?? 'monster'] : '掉落／升級／兌換'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7}>沒有符合條件的鑲材</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
