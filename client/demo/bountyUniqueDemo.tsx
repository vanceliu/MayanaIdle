/**
 * 懸賞獨特魔物標示（`bounty-unique.html`，`53-bounty-contract.md` § 53.7）：Boss 契約標明 Boss／獨特魔物的三個方案。
 * 價格依遊戲的 `getBountyPrice`；契約為假資料。對象是否為獨特魔物以 seed 的 `isUnique` 判定。
 */
import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { getBountyPrice, getBountyTotalPrice } from '../src/models/bounty';
import { MONSTER_SEEDS } from '../src/db/seed/monsterSeeds';

type Kind = 'monster' | 'boss';
type Option = 'A' | 'B' | 'C';

interface Contract {
  id: number;
  kind: Kind;
  area: string;
  monster: string;
  targetKills: number;
  kills?: number;
  takeBetter?: boolean;
}

const GOLD = 800_000;
const monsterOf = (name: string) => MONSTER_SEEDS.find(m => m.name === name);
const isUnique = (c: Contract) => c.kind === 'boss' && !!monsterOf(c.monster)?.isUnique;
/** § 53.1：普通怪取區域最低等級，Boss 契約取 Boss／獨特魔物等級；demo 直接取該怪等級 */
const priceLevelOf = (c: Contract) => monsterOf(c.monster)?.level ?? 30;

const BOARD: Contract[] = [
  { id: 1, kind: 'monster', area: '龍谷地間 3～4F', monster: '大莫蜘蛛', targetKills: 72 },
  { id: 2, kind: 'boss', area: '龍谷地間 7F', monster: '安塔巨龍', targetKills: 24 },
  { id: 3, kind: 'boss', area: '遠古地監 5～6F', monster: '封印屍王', targetKills: 27 },
];
const SIGNED: Contract = { id: 9, kind: 'boss', area: '龍谷地間 1～2F', monster: '骷髏軍團長', targetKills: 22, kills: 9, takeBetter: true };

/** 現行的 KindTag，方案 A 擴充第三種 */
function KindTag({ contract, option }: { contract: Contract; option: Option }) {
  if (contract.kind === 'monster') return <span className="bounty-kind-tag">[懸賞]</span>;
  if (isUnique(contract) && option === 'A') return <span className="bounty-kind-tag is-unique">[獨特魔物懸賞]</span>;
  return <span className="bounty-kind-tag is-boss">[BOSS懸賞]</span>;
}

function NameLine({ contract, option, extra }: { contract: Contract; option: Option; extra?: ReactNode }) {
  const unique = isUnique(contract);
  return (
    <span className="shop-item-name">
      <KindTag contract={contract} option={option} />{' '}
      <span className="bounty-target-name">{contract.monster}</span>
      {unique && option !== 'A' && <span className="bounty-unique-tag">獨特魔物</span>}
      {extra}
    </span>
  );
}

function TargetLine({ contract }: { contract: Contract }) {
  return (
    <span className="shop-item-desc">
      {contract.kind === 'boss'
        ? <>擊殺 <strong className="quest-highlight">{contract.monster}</strong> <strong className="quest-highlight">{contract.targetKills} 隻</strong></>
        : <>在 <strong className="quest-highlight">{contract.area}</strong> 擊殺 <strong className="quest-highlight">{contract.monster}</strong> <strong className="quest-highlight">{contract.targetKills} 隻</strong></>}
    </span>
  );
}

const cardClass = (contract: Contract, option: Option) =>
  `shop-item${option === 'C' && isUnique(contract) ? ' bounty-card-unique' : ''}`;

function BoardCard({ contract, option }: { contract: Contract; option: Option }) {
  const [takeBetter, setTakeBetter] = useState(false);
  const level = priceLevelOf(contract);
  const price = getBountyPrice(level);
  const total = getBountyTotalPrice(level, takeBetter) ?? 0;
  return (
    <div className={cardClass(contract, option)}>
      <div className="shop-item-info">
        <NameLine contract={contract} option={option} />
        <TargetLine contract={contract} />
        <label className="bounty-addon">
          <input type="checkbox" checked={takeBetter} onChange={e => setTakeBetter(e.target.checked)} />
          掉兩次取比較好（+{(price?.takeBetter ?? 0).toLocaleString()}G）
        </label>
        <span className={`bounty-price ${GOLD < total ? 'lacking' : ''}`}>💰 {total.toLocaleString()} 金幣</span>
      </div>
      <div className="shop-item-actions">
        <div className="bounty-actions"><button>簽約</button></div>
      </div>
    </div>
  );
}

function SignedCard({ contract, option }: { contract: Contract; option: Option }) {
  return (
    <div className={cardClass(contract, option)}>
      <div className="shop-item-info">
        <NameLine
          contract={contract} option={option}
          extra={contract.takeBetter && <span className="bounty-addon-tag">掉兩次取較好</span>}
        />
        <TargetLine contract={contract} />
        <span className="quest-progress">進度：<strong>{contract.kills}/{contract.targetKills}</strong></span>
      </div>
      <div className="shop-item-actions"><button className="btn-danger">放棄</button></div>
    </div>
  );
}

const OPTIONS: { key: Option; title: string; sub: string }[] = [
  { key: 'A', title: '方案 A：獨立標籤', sub: '獨特魔物改標 [獨特魔物懸賞]（文字 #c4b5fd），Boss 維持 [BOSS懸賞]。一眼分得出三種，標籤較長。' },
  { key: 'B', title: '方案 B：BOSS懸賞＋小標', sub: '標籤維持 [BOSS懸賞]（同一個 Boss 契約格），名稱後加「獨特魔物」小標（邊框 #8b7cf6、文字 #c4b5fd）。改動最小。' },
  { key: 'C', title: '方案 C：B＋卡片配色', sub: '在 B 之上，整張卡片套怪物列表的獨特魔物配色（紫底、#8b7cf6 邊框、名稱 #c4b5fd）。最醒目，與怪物列表一致。' },
];

function OptionColumn({ option, title, sub }: { option: Option; title: string; sub: string }) {
  return (
    <section className="demo-card demo-option">
      <h2>{title}</h2>
      <p className="demo-sub">{sub}</p>
      <div className="guild-panel">
        <h4>進行中的懸賞</h4>
        <div className="shop-items"><SignedCard contract={SIGNED} option={option} /></div>
        <div className="shop-tabs">
          <span className="quest-town-label">灰脊分部</span>
          <button>比較設定</button>
          <span className="bounty-next-refresh">下次更新 18:00</span>
        </div>
        <div className="shop-items">
          {BOARD.map(c => <BoardCard key={c.id} contract={c} option={option} />)}
        </div>
      </div>
    </section>
  );
}

function App() {
  return (
    <div className="demo-grid">
      {OPTIONS.map(o => <OptionColumn key={o.key} option={o.key} title={o.title} sub={o.sub} />)}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
