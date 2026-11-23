import { formatSkillRange, formatBuffDuration, formatDebuffDuration, formatSelfBuff } from '../../models/skill';
import { useMemo, useState, type ReactNode } from 'react';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import { CLASS_SKILLS, type ClassSkillDef } from '../../models/classSkills';
import '../components/WikiTable.css';
import { WEAPON_TYPE_LABELS } from '../../models/skill';
import { getItemById } from '../../models/items';
import { classSkillLevelScale, hasStarCooldown, skillAtStarLevel, starCooldownAt } from '../../models/skillStar';
import type { Skill } from '../../models/skill';

const STAR_LEVELS = [1, 2, 3] as const;

/** 隨星盤等級變動的數值（`56-star-chart.md` § 56.5）：相同時照印，不同時以「／」列出並標黃 */
function LevelValues({ values, sep = '／' }: { values: (string | number)[]; sep?: string }) {
  if (values.every(v => v === values[0])) return <>{values[0]}</>;
  return <span className="stat-changed">{values.join(sep)}</span>;
}

/** 等級 I／II／III 的技能攻擊力 */
const powersByLevel = (s: Skill) => STAR_LEVELS.map(l => skillAtStarLevel(s, l).power);

/** 強化 0／1／2 個的冷卻（秒） */
const cooldownsByNodes = (s: Skill) => [0, 1, 2].map(n => (starCooldownAt(s.cooldown, n) / 1000).toFixed(1));


const ELEMENT_LABELS: Record<string, string> = {
  fire: '火', ice: '冰', wind: '風', earth: '地', light: '光', dark: '闇', none: '無',
};

const TYPE_LABELS: Record<string, string> = {
  attack: '攻擊', heal: '治療', buff: '增益', move: '移動', passive: '被動',
};

const CLASS_LABELS: Record<string, string> = {
  knight: '騎士', elf: '妖精', thief: '盜賊', elementalist: '元素師', priest: '牧師',
};

/** 職業技能表下方的詳細規則（`23-class-magic.md` § 23.1.1／§ 23.3） */
const CLASS_SKILL_NOTES: Partial<Record<string, ReactNode>> = {
  knight: (
    <>
      <strong>盾擊、裂傷斬、挑釁怒吼、衝鋒突進、復仇之刃</strong>：傷害 = 技能威力（吃智力與魔攻）＋當下基礎物理傷害（吃武器、力量、攻擊力%），必定命中、可爆擊。
      <br />
      <strong>暈眩</strong>：無法行動，攻擊計時器暫停。
      <br />
      <strong>衝鋒突進</strong>：目標在 8 格內、有視線且直線走得過去（不跨越水池／岩漿）時，瞬間突進到目標旁邊離自己最近的空格再出手；
      目標已在旁邊時只出手不移動，找不到落點就不施放。
      <br />
      <strong>血濺咒殺</strong>：暗屬性魔法傷害（不爆擊）。先扣自身最大 HP 的 15%（最低留 1，穿透所有減傷與護盾，扣到撤退門檻會觸發撤退），
      再對自身 4 格內隨機打 4 下（同一隻可被打多下），每下附加減速 10%（5 秒，與其他減速後施放覆蓋）。
      4 格內沒有怪物或 HP 只剩 1 時不可施放。
      <br />
      <strong>復仇之刃</strong>：傷害同上（技能威力＋當下基礎物理傷害），必定命中、可爆擊。
      施放時依當下血量給自身「復仇」增益：攻擊力 +floor(min(50, (1 − 當前HP ÷ 最大HP) × 100))%，持續 10 秒；
      血量剩一半以下即達 +50%，滿血不給增益，重複施放以新值覆蓋。
      <br />
      復仇增益與攻擊力詞綴加算，強化<strong>之後</strong>的普通攻擊、盾擊／裂傷斬／挑釁怒吼／衝鋒突進的物理段、增益期間施放的裂傷斬流血；
      <strong>不影響</strong>這次的復仇之刃本身、血濺咒殺與基礎魔法。
    </>
  ),
  elf: (
    <>
      <strong>三連射</strong>：每箭獨立判定命中，傷害走物理普攻公式。
      <br />
      <strong>束縛箭、後躍射擊</strong>：傷害 = 技能威力（吃智力與魔攻）＋當下基礎物理傷害（吃武器、敏捷、攻擊力%），必定命中、可爆擊；不受火矢附魔影響、不吃元素刻印，鷹眼的遠攻 +3 算進物理段。
      <br />
      <strong>束縛箭</strong>：目標定身 5 秒 —— 無法移動，但已在攻擊範圍內仍會攻擊。定身期間不能再上；Boss 與獨特魔物被控場後 10 秒內免疫控場。
      <br />
      <strong>後躍射擊</strong>：射程以施放前的位置判定。先往目標反方向後退 2 格（走不過去、被佔用或落點看不到目標就改退 1 格），
      兩者都不行就原地射擊。
    </>
  ),
  elementalist: (
    <>
      <strong>魔力護盾</strong>：持續 20 秒、冷卻 30 秒、不耗 MP；減傷最高 20%，依目前 MP 比例（MP 滿 20%、半滿 10%、0 時無效），不扣 MP、不會提前解除。
      <br />
      <strong>魔力湧泉</strong>：扣自身最大 HP 10%（最低留 1），持續期間每次回魔另加最大 MP 8%，戰鬥中不減半。
      <br />
      <strong>魔法節約</strong>：持續 30 秒，所有技能 MP 消耗 -30%（無條件捨去），可與冷卻縮減同時生效。
    </>
  ),
  priest: (
    <>
      <strong>精神匯聚</strong>：每次回魔另加最大 MP 5%，戰鬥中不減半；冷卻 -20%（與其他冷卻縮減合計上限 50%）。
      <br />
      <strong>血魔轉換</strong>：扣最大 HP 20%（最低留 1），瞬間回復最大 MP 20%。
      <br />
      <strong>神聖懲擊</strong>：回復本次最終傷害 10% 的 HP。
    </>
  ),
  thief: (
    <>
      <strong>致命一擊</strong>：武器射程的單體物理攻擊，必定爆擊。
      <br />
      <strong>冰霧</strong>：只上凍傷（冰屬性 DoT＋攻速 -30%），不造成直接傷害；與淬毒的中毒可同時存在。
      <br />
      <strong>閃避反擊</strong>（被動）：近戰怪物的攻擊 MISS 且在武器射程內時，立刻反擊一次普攻。
    </>
  ),
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

      <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px', fontSize: 'var(--fs-sm)' }}>
        基礎魔法沒有星盤等級，數值照表列；技能說明以基礎攻擊魔法、基礎回復魔法、基礎護盾增益魔法分類。
      </p>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>名稱</th>
              <th>魔法等級</th>
              <th>類型</th>
              <th>屬性</th>
              <th>目標</th>
              <th>射程</th>
              <th>威力</th>
              <th>MP 消耗</th>
              <th>冷卻(秒)</th>
              <th>持續</th>
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
                <td>{formatSkillRange(s) || '-'}</td>
                <td className="cell-number">{s.power ? <LevelValues values={powersByLevel({ ...s, lastUsedAt: 0 })} /> : '-'}</td>
                <td className="cell-number">{s.mpCost}</td>
                <td className="cell-number">{(s.cooldown / 1000).toFixed(1)}</td>
                <td>{formatBuffDuration(s) || '-'}</td>
                <td>
                  {s.description || s.buffEffect || (s.hits ? `${s.hits}連擊` : '') || (s.applyDebuff ? `附加${s.applyDebuff.name}(${s.applyDebuff.description}, ${formatDebuffDuration(s.applyDebuff)})` : '') || '-'}
                </td>
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
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 12px', fontSize: 'var(--fs-sm)' }}>
        技能等級由星盤的「等級 +1」節點決定：學會為 I，最高 III；傷害、治癒、護盾與輔助效果 I ×0.7、II ×0.85、III ×1，盜賊、元素師、牧師 I ×0.3、II ×0.6、III ×1（威力欄黃色依序為 I／II／III；效果欄為等級 III 的數值）。
        冷卻由「強化」節點決定：未點為表列 ÷ 0.8，每點 −10%，兩點回到表列（冷卻欄依序為強化 0／1／2 個）。閃避反擊、冷卻縮減沒有星盤節點。
      </p>
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
                    <th>射程</th>
                    <th>威力</th>
                          <th>MP</th>
                    <th>冷卻(秒)</th>
                    <th>持續</th>
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
                      <td>{s.skill.target === 'aoe' && s.skill.aoeRadius === undefined ? '全隊' : s.skill.target === 'aoe' ? `範圍(半徑${s.skill.aoeRadius}格/${s.skill.randomHits ? `隨機${s.skill.randomHits}下` : s.skill.maxTargets ? `最多${s.skill.maxTargets}隻` : '無上限'})` : '單體'}</td>
                      <td>{formatSkillRange(s.skill) || '-'}</td>
                      <td className="cell-number">
                        {s.skill.physicalSnapshot
                          ? <>{s.skill.power} + 物理 ×<LevelValues values={classSkillLevelScale(s.className).map(String)} /></>
                          : s.skill.power
                            ? <LevelValues values={powersByLevel({ ...s.skill, lastUsedAt: 0 })} />
                            : s.skill.hits ? <>物理 ×<LevelValues values={classSkillLevelScale(s.className).map(String)} /></> : '-'}
                      </td>
                      <td className="cell-number">{s.skill.mpCost}</td>
                      <td className="cell-number">
                        {hasStarCooldown(s.skill)
                          ? <LevelValues values={cooldownsByNodes({ ...s.skill, lastUsedAt: 0 })} sep="→" />
                          : (s.skill.cooldown / 1000).toFixed(1)}
                      </td>
                      <td>{formatBuffDuration(s.skill) || '-'}</td>
                      <td>{getClassSkillEffect(s)}</td>
                      <td>{getItemById(s.bookItemId)?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {CLASS_SKILL_NOTES[cls] && <div className="wiki-section-note">{CLASS_SKILL_NOTES[cls]}</div>}
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
    parts.push(`附加${s.skill.applyDebuff.name}(${s.skill.applyDebuff.description}, ${formatDebuffDuration(s.skill.applyDebuff)})`);
  }
  if (s.skill.selfBuff) {
    parts.push(`自身增益：${formatSelfBuff(s.skill)}`);
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
