import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { usePartyStore } from '../../stores/partyStore';
import type { QuestTownId } from '../../models/adventurerQuest';
import {
  getBountyAreaName, getBountyPrice, getBountySignBlock, getBountyTotalPrice, nextBountyRefreshAt,
  BOUNTY_SIGN_BLOCK_TEXT, MAX_SIGNED_BOUNTIES,
  type BountyContract, type SignedBounty,
} from '../../models/bounty';
import {
  BOUNTY_COMPARE_LABELS, type BountyCompareSettings,
} from '../../models/bountyCompare';
import { AFFIX_DEFINITIONS, SPECIAL_AFFIX_DEFINITIONS } from '../../models/affix';

/** § 53.5.1 */
export const BOUNTY_SOLO_HINT = '懸賞只在單人時生效；組隊期間暫停（不計擊殺、不保證詞綴、不掉兩次），離隊後恢復，進度保留。';

function KindTag({ kind }: { kind: BountyContract['kind'] }) {
  return <span className={`bounty-kind-tag ${kind === 'boss' ? 'is-boss' : ''}`}>[{kind === 'boss' ? 'BOSS懸賞' : '懸賞'}]</span>;
}

/** 對象與擊殺數；高亮規則同 `36-quest-system.md` § 36.10.2 */
export function BountyTargetLine({ contract }: { contract: BountyContract }) {
  return (
    <span className="shop-item-desc">
      {contract.kind === 'boss'
        ? <>擊殺 <strong className="quest-highlight">{contract.monsterName}</strong> <strong className="quest-highlight">{contract.targetKills} 隻</strong></>
        : <>在 <strong className="quest-highlight">{getBountyAreaName(contract.areaId)}</strong> 擊殺 <strong className="quest-highlight">{contract.monsterName}</strong> <strong className="quest-highlight">{contract.targetKills} 隻</strong></>}
    </span>
  );
}

function BoardCard({ contract, gold, signed }: { contract: BountyContract; gold: number; signed: SignedBounty[] }) {
  const signBounty = useGameStore(s => s.signBounty);
  const [takeBetter, setTakeBetter] = useState(false);
  const price = getBountyPrice(contract.priceLevel);
  const total = getBountyTotalPrice(contract.priceLevel, takeBetter) ?? 0;
  const block = getBountySignBlock(contract, takeBetter, signed, gold);
  return (
    <div className="shop-item">
      <div className="shop-item-info">
        <span className="shop-item-name"><KindTag kind={contract.kind} /> {contract.monsterName}</span>
        <BountyTargetLine contract={contract} />
        <label className="bounty-addon">
          <input type="checkbox" checked={takeBetter} onChange={e => setTakeBetter(e.target.checked)} />
          掉兩次取比較好（+{(price?.takeBetter ?? 0).toLocaleString()}G）
        </label>
        <span className={`bounty-price ${gold < total ? 'lacking' : ''}`}>💰 {total.toLocaleString()} 金幣</span>
      </div>
      <div className="shop-item-actions">
        <div className="bounty-actions">
          <button disabled={block !== null} onClick={() => signBounty(contract.id, takeBetter)}>簽約</button>
          {block && <span className="bounty-block-reason">{BOUNTY_SIGN_BLOCK_TEXT[block]}</span>}
        </div>
      </div>
    </div>
  );
}

function SignedCard({ contract, paused }: { contract: SignedBounty; paused: boolean }) {
  const abandonBounty = useGameStore(s => s.abandonBounty);
  return (
    <div className="shop-item">
      <div className="shop-item-info">
        <span className="shop-item-name">
          <KindTag kind={contract.kind} /> {contract.monsterName}
          {contract.takeBetter && <span className="bounty-addon-tag">掉兩次取較好</span>}
          {paused && <span className="bounty-paused-tag">組隊中暫停</span>}
        </span>
        <BountyTargetLine contract={contract} />
        <span className="quest-progress">進度：<strong>{contract.kills}/{contract.targetKills}</strong></span>
      </div>
      <div className="shop-item-actions">
        <button className="btn-danger" onClick={() => abandonBounty(contract.id)}>放棄</button>
      </div>
    </div>
  );
}

function CompareSettings({ onBack }: { onBack: () => void }) {
  const settings = useGameStore(s => s.bountyCompare);
  const setBountyCompare = useGameStore(s => s.setBountyCompare);
  const update = (next: BountyCompareSettings) => setBountyCompare(next);

  const move = (i: number, d: -1 | 1) => {
    const order = [...settings.order];
    [order[i], order[i + d]] = [order[i + d], order[i]];
    update({ ...settings, order });
  };
  const toggleCriterion = (i: number) => {
    update({ ...settings, order: settings.order.map((o, j) => (j === i ? { ...o, enabled: !o.enabled } : o)) });
  };
  const affixes = new Set(settings.affixTypes);
  const toggleAffix = (type: string) => {
    const next = new Set(affixes);
    if (next.has(type)) next.delete(type); else next.add(type);
    update({ ...settings, affixTypes: [...next] });
  };
  const groups = [...new Set(AFFIX_DEFINITIONS.map(d => d.group))];

  return (
    <div className="panel-scroll bounty-settings">
      <button className="bounty-back-btn" onClick={onBack}>← 返回懸賞清單</button>
      <h4>比較條件</h4>
      <p className="bounty-hint">「掉兩次取比較好」掉到裝備時，依這個順序比較兩件，分出勝負就停。關掉的條件跳過。</p>
      <div className="bounty-criteria">
        {settings.order.map((o, i) => (
          <div key={o.key} className={`bounty-criterion ${o.enabled ? '' : 'is-off'}`}>
            <span className="bounty-criterion-rank">{i + 1}</span>
            <span className="bounty-criterion-name">{BOUNTY_COMPARE_LABELS[o.key]}</span>
            <button disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${BOUNTY_COMPARE_LABELS[o.key]} 上移`}>▲</button>
            <button disabled={i === settings.order.length - 1} onClick={() => move(i, 1)} aria-label={`${BOUNTY_COMPARE_LABELS[o.key]} 下移`}>▼</button>
            <label><input type="checkbox" checked={o.enabled} onChange={() => toggleCriterion(i)} /> 啟用</label>
          </div>
        ))}
        <div className="bounty-criterion is-fixed">
          <span className="bounty-criterion-rank">—</span>
          <span className="bounty-criterion-name">全部相同：留第一件</span>
        </div>
      </div>
      <h4>偏好詞綴（已選 {affixes.size}）</h4>
      <p className="bounty-hint">命中條數多的那件勝出；沒有勾選時這條視為相同。</p>
      {groups.map(g => (
        <div key={g} className="bounty-affix-group">
          <div className="bounty-affix-group-title">{g}</div>
          <div className="bounty-affix-list">
            {AFFIX_DEFINITIONS.filter(d => d.group === g).map(d => (
              <label key={d.type}><input type="checkbox" checked={affixes.has(d.type)} onChange={() => toggleAffix(d.type)} />{d.name}</label>
            ))}
          </div>
        </div>
      ))}
      <div className="bounty-affix-group">
        <div className="bounty-affix-group-title">特殊詞綴</div>
        <div className="bounty-affix-list">
          {SPECIAL_AFFIX_DEFINITIONS.map(d => (
            <label key={d.type}><input type="checkbox" checked={affixes.has(d.type)} onChange={() => toggleAffix(d.type)} />{d.name}</label>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatRefreshTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 冒險者工會「懸賞」分頁（`53-bounty-contract.md` § 53.7） */
export function BountyTab({ townId, townName }: { townId: QuestTownId; townName: string }) {
  const boards = useGameStore(s => s.bountyBoards);
  const signed = useGameStore(s => s.bountyContracts);
  const gold = useGameStore(s => s.character?.gold ?? 0);
  const ensureBountyBoards = useGameStore(s => s.ensureBountyBoards);
  const paused = usePartyStore(s => s.party !== null);
  const [view, setView] = useState<'board' | 'settings'>('board');
  const [nextRefresh, setNextRefresh] = useState(() => nextBountyRefreshAt(Date.now()));

  // 開分頁時補生成；停在分頁上跨過更新時刻也要換新（§ 53.4）
  useEffect(() => {
    ensureBountyBoards();
    const timer = setTimeout(() => {
      ensureBountyBoards();
      setNextRefresh(nextBountyRefreshAt(Date.now()));
    }, Math.max(1000, nextRefresh - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [ensureBountyBoards, nextRefresh]);

  if (view === 'settings') return <CompareSettings onBack={() => setView('board')} />;

  const slots = boards[townId]?.slots ?? [];
  return (
    <>
      <div className="adventurer-guild-status">
        <span>金幣：{gold.toLocaleString()}G</span>
        <span>已簽：{signed.length}/{MAX_SIGNED_BOUNTIES}</span>
      </div>
      <div className="panel-scroll">
        {signed.length > 0 && (
          <>
            <h4>進行中的懸賞</h4>
            <div className="shop-items">
              {signed.map(c => <SignedCard key={c.id} contract={c} paused={paused} />)}
            </div>
          </>
        )}
        <div className="shop-tabs panel-sticky">
          <span className="quest-town-label">{townName}分部</span>
          <button onClick={() => setView('settings')}>比較設定</button>
          <span className="bounty-next-refresh">下次更新 {formatRefreshTime(nextRefresh)}</span>
        </div>
        <p className="bounty-hint">{BOUNTY_SOLO_HINT}</p>
        <div className="shop-items">
          {slots.length === 0 && <p className="empty-text">目前沒有可用的懸賞</p>}
          {slots.map((c, i) => c
            ? <BoardCard key={c.id} contract={c} gold={gold} signed={signed} />
            : <div key={`empty-${i}`} className="bounty-empty-slot">已簽約，下次更新補上</div>)}
        </div>
      </div>
    </>
  );
}
