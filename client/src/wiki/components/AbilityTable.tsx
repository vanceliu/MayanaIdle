import { ABILITY_DEFINITIONS, ABILITY_CHANCE, ABILITY_MIN_TIER, formatAbilityTemplateParts, type AbilityGroup, type AbilityPool } from '../../models/ability';
import { CLASS_NAMES_ZH, type ClassName } from '../../models/character';
import './WikiTable.css';

const CLASS_POOLS: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];
const GROUP_LABELS: Record<AbilityGroup, string> = { weapon: '武器', accessory: '飾品（項鍊、戒指）' };

function poolLabel(pool: AbilityPool): string {
  return pool === 'common' ? '共通' : CLASS_NAMES_ZH[pool];
}

/** 一個技能池：技能／效果（數值以區間代入） */
export function AbilityPoolTable({ group, pool }: { group: AbilityGroup; pool: AbilityPool }) {
  const rows = ABILITY_DEFINITIONS.filter(d => d.group === group && d.pool === pool);
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>技能</th>
            <th>效果</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.type}>
              <td>{d.name}</td>
              <td>
                {formatAbilityTemplateParts(d).map((p, i) => (p.range
                  ? <span key={i} className="wiki-range">{p.text}</span>
                  : p.text))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 隨機技能整節（`43-wiki-system.md`）：取得規則 + 各組的共通池與職業池。詞綴頁列兩組，武器頁列武器組，防具頁列飾品組 */
export function AbilitySection({ groups }: { groups: AbilityGroup[] }) {
  return (
    <section className="wiki-section">
      <h3 className="wiki-section-title">隨機技能</h3>
      <ul className="wiki-section-note" style={{ marginTop: 0, paddingLeft: 20 }}>
        <li>T{ABILITY_MIN_TIER} 以上的武器、項鍊、戒指可帶 <strong>1 條隨機技能</strong>，取得當下決定，之後不變。武器是攻擊類，項鍊與戒指共用防禦類。</li>
        <li>商店購買 {ABILITY_CHANCE}%、數值最弱；怪物與 Boss 掉落 {ABILITY_CHANCE}%、數值隨機；鐵匠鋪製作必定帶，由玩家指定、數值最弱。</li>
        <li>先從「共通」與「職業」兩個池各半選一個，再抽技能；職業池依取得的角色職業，該職業不能用這件裝備時只抽共通池。</li>
        <li>不吃品質，任何印記都無法變更；素質需求未滿足時一併凍結。職業技能只對該職業的對應技能生效。</li>
        <li>項鍊與戒指帶到同一技能時：回復與荊棘加總、護盾互相覆蓋、職業技能取數值較好的一件。</li>
      </ul>
      {groups.map(group => (
        <div key={group}>
          <h4 className="wiki-section-subtitle">{GROUP_LABELS[group]} · {poolLabel('common')}</h4>
          <AbilityPoolTable group={group} pool="common" />
          {CLASS_POOLS.map(cls => (
            <div key={cls}>
              <h4 className="wiki-section-subtitle">{GROUP_LABELS[group]} · {poolLabel(cls)}</h4>
              <AbilityPoolTable group={group} pool={cls} />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
