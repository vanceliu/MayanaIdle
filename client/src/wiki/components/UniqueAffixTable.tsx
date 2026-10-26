import {
  UNIQUE_AFFIX_DEFINITIONS,
  UNIQUE_AFFIX_BY_TEMPLATE,
  getUniqueAffixDefinition,
  formatUniqueAffixRange,
  type UniqueAffixPool,
} from '../../models/uniqueAffix';
import { EQUIPMENT_SEEDS } from '../../db/seed';
import './WikiTable.css';

/** 隨機池的適用部位文字（`07-affix-tier7.md` § 7T.5） */
const UNIQUE_POOL_LABELS: Record<Exclude<UniqueAffixPool, 'fixed'>, string> = {
  weapon: '武器（右手）',
  armor: '防具（頭盔／胸甲／上衣／斗篷／手套／鞋子）',
  accessory: '飾品（項鍊／戒指）',
};

/** 一個隨機池的清單：詞綴／效果／數值 */
export function UniqueAffixPoolTable({ pool }: { pool: Exclude<UniqueAffixPool, 'fixed'> }) {
  const rows = UNIQUE_AFFIX_DEFINITIONS.filter(d => d.pool === pool);
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>詞綴</th>
            <th>效果</th>
            <th>數值</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.type}>
              <td>{d.name}</td>
              <td>{d.description}</td>
              <td className="cell-number">{formatUniqueAffixRange(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 腰帶與左手的指定獨有詞綴：裝備／詞綴／效果／數值 */
export function UniqueAffixFixedTable() {
  const rows = Object.entries(UNIQUE_AFFIX_BY_TEMPLATE).map(([id, type]) => ({
    id: Number(id),
    name: EQUIPMENT_SEEDS.find(e => e.id === Number(id))?.name ?? id,
    def: getUniqueAffixDefinition(type),
  }));
  return (
    <div className="wiki-table-wrap">
      <table className="wiki-table">
        <thead>
          <tr>
            <th>裝備</th>
            <th>詞綴</th>
            <th>效果</th>
            <th>數值</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.def.name}</td>
              <td>{r.def.description}</td>
              <td className="cell-number">{formatUniqueAffixRange(r.def)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * T7 獨有詞綴整節（`43-wiki-system.md`）：通用規則 + 指定的隨機池 + 選擇性附上腰帶／左手指定表。
 * 詞綴頁列全部，武器頁只列武器池，防具頁列防具／飾品池與指定表。
 */
export function UniqueAffixSection({
  pools,
  showFixed,
}: {
  pools: Exclude<UniqueAffixPool, 'fixed'>[];
  showFixed: boolean;
}) {
  return (
    <section className="wiki-section">
      <h3 className="wiki-section-title">T7 獨有詞綴</h3>
      <ul className="wiki-section-note" style={{ marginTop: 0, paddingLeft: 20 }}>
        <li>裝備階級 T7 在 4 條詞綴之外另帶 <strong>1 條獨有詞綴</strong>，取得當下決定，之後不變。</li>
        <li>任何印記都無法變更它，也不吃品質加成；素質需求未滿足時與其他詞綴一併凍結。</li>
        <li>同時穿著多件 T7、獨有詞綴種類相同時，<strong>只有數值最高的那件生效</strong>（同值依部位順序），其餘劃線顯示；可與同類的一般詞綴並存。</li>
        <li>受擊觸發只在受到傷害時判定（被迴避不算），持續期間再觸發會刷新時間。</li>
      </ul>
      {pools.map(pool => (
        <div key={pool}>
          <h4 className="wiki-section-subtitle">{UNIQUE_POOL_LABELS[pool]} —— 隨機抽一條</h4>
          <UniqueAffixPoolTable pool={pool} />
        </div>
      ))}
      {showFixed && (
        <div>
          <h4 className="wiki-section-subtitle">腰帶／左手 —— 指定</h4>
          <UniqueAffixFixedTable />
        </div>
      )}
    </section>
  );
}
