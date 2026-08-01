import { useMemo, useState } from 'react';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import { CLASS_SKILLS, type ClassSkillDef } from '../../models/classSkills';
import '../components/WikiTable.css';
import { WEAPON_TYPE_LABELS } from '../../models/skill';


const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '闇', none: '無',
};

const TYPE_LABELS: Record<string, string> = {
  attack: '攻擊', heal: '治療', buff: '增益', move: '移動',
};

const CLASS_LABELS: Record<string, string> = {
  knight: '騎士', elf: '妖精', thief: '盜賊', elementalist: '元素師', priest: '牧師',
};

export function SkillsPage() {
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let list = [...SKILL_CATALOG];
    if (levelFilter !== 'all') list = list.filter(s => s.level === Number(levelFilter));
    if (typeFilter !== 'all') list = list.filter(s => s.type === typeFilter);
    return list.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [levelFilter, typeFilter]);

  return (
    <div>
      <h2 className="wiki-page-title">技能列表</h2>

      <div className="wiki-filters">
        <select className="wiki-filter-select" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="all">全部等級</option>
          {Array.from({ length: 10 }, (_, i) => (
            <option key={i + 1} value={i + 1}>Lv.{i + 1}</option>
          ))}
        </select>
        <select className="wiki-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="all">全部類型</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>魔法等級</th>
              <th>類型</th>
              <th>屬性</th>
              <th>目標</th>
              <th>威力</th>
              <th>治療量</th>
              <th>MP 消耗</th>
              <th>冷卻(秒)</th>
              <th>效果</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong></td>
                <td className="cell-number">{s.level}</td>
                <td>{TYPE_LABELS[s.type]}</td>
                <td><span className={`wiki-badge wiki-badge-${s.element}`}>{ELEMENT_LABELS[s.element]}</span></td>
                <td>{s.target === 'aoe' ? `範圍(半徑${s.aoeRadius ?? '?'}格/${s.maxTargets ? `最多${s.maxTargets}隻` : '無上限'})` : '單體'}</td>
                <td className="cell-number">{s.power || '-'}</td>
                <td className="cell-number">{s.healAmount || '-'}</td>
                <td className="cell-number">{s.mpCost}</td>
                <td className="cell-number">{(s.cooldown / 1000).toFixed(1)}</td>
                <td>{s.description || s.buffEffect || (s.hits ? `${s.hits}連擊` : '') || (s.applyDebuff ? `附加${s.applyDebuff.name}(${s.applyDebuff.description}, ${(s.applyDebuff.dotDuration ?? s.applyDebuff.duration ?? 0) / 1000}s)` : '') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '32px 0 12px', fontFamily: 'var(--font-display)' }}>
        職業魔法學習限制
      </h3>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>職業</th>
              <th>最高魔法等級</th>
              <th>最多可學技能數</th>
              <th>學習條件</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(CLASS_MAGIC_RESTRICTIONS).map(([cls, r]) => (
              <tr key={cls}>
                <td>{CLASS_LABELS[cls]}</td>
                <td className="cell-number">{r.maxLevel}</td>
                <td className="cell-number">{r.maxSkills}</td>
                <td>{getLearnConditionText(cls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ color: 'var(--text-primary)', margin: '32px 0 12px', fontFamily: 'var(--font-display)' }}>
        職業專屬技能
      </h3>
      {(['knight', 'elf', 'elementalist', 'priest', 'thief'] as const).map(cls => {
        const skills = CLASS_SKILLS.filter(s => s.className === cls);
        return (
          <div key={cls} style={{ marginBottom: 24 }}>
            <h4 style={{ color: 'var(--accent-gold)', marginBottom: 8 }}>{CLASS_LABELS[cls]}</h4>
            <div className="wiki-table-wrap">
              <table className="wiki-table">
                <thead>
                  <tr>
                    <th>名稱</th>
                    <th>階級</th>
                    <th>需求等級</th>
                    <th>類型</th>
                    <th>屬性</th>
                    <th>目標</th>
                    <th>威力</th>
                    <th>治療量</th>
                    <th>MP</th>
                    <th>冷卻(秒)</th>
                    <th>效果</th>
                    <th>技能書</th>
                  </tr>
                </thead>
                <tbody>
                  {skills.map(s => (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td className="cell-number">{s.classLevel}</td>
                      <td className="cell-number">{s.requiredLevel}</td>
                      <td>{TYPE_LABELS[s.skill.type]}</td>
                      <td><span className={`wiki-badge wiki-badge-${s.skill.element}`}>{ELEMENT_LABELS[s.skill.element]}</span></td>
                      <td>{s.skill.target === 'aoe' ? `範圍(半徑${s.skill.aoeRadius ?? '?'}格/${s.skill.maxTargets ? `最多${s.skill.maxTargets}隻` : '無上限'})` : '單體'}</td>
                      <td className="cell-number">{s.skill.power || '-'}</td>
                      <td className="cell-number">{s.skill.healAmount || '-'}</td>
                      <td className="cell-number">{s.skill.mpCost}</td>
                      <td className="cell-number">{(s.skill.cooldown / 1000).toFixed(1)}</td>
                      <td>{getClassSkillEffect(s)}</td>
                      <td>{s.bookName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getClassSkillEffect(s: ClassSkillDef): string {
  const parts: string[] = [];
  if (s.skill.requiredWeaponType) {
    parts.push(`【需${WEAPON_TYPE_LABELS[s.skill.requiredWeaponType] ?? s.skill.requiredWeaponType}】`);
  }
  if (s.skill.description) {
    parts.push(s.skill.description);
  }
  if (s.skill.buffEffect) {
    parts.push(s.skill.buffEffect);
  } else if (s.skill.hits) {
    parts.push(`${s.skill.hits}連擊`);
  }
  if (s.skill.applyDebuff) {
    parts.push(`附加${s.skill.applyDebuff.name}(${s.skill.applyDebuff.description}, ${(s.skill.applyDebuff.dotDuration ?? s.skill.applyDebuff.duration ?? 0) / 1000}s)`);
  }
  return parts.join(' ') || '-';
}

function getLearnConditionText(cls: string): string {
  switch (cls) {
    case 'knight': return '等級 50 後才能學習 1 級魔法';
    case 'elf': return '每 8 級可學習或升級一次';
    case 'elementalist': return '每 4 級可學習或升級一次';
    case 'priest': return '每 5 級可學習或升級一次';
    case 'thief': return '每 8 級可學習或升級一次';
    default: return '-';
  }
}
