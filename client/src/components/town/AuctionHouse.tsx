import { useEffect, useState, type ReactNode } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useAuctionStore } from '../../stores/auctionStore';
import { EquipmentDetail } from '../EquipmentInfo';
import { GameIcon } from '../GameIcon';
import { Tooltip } from '../Tooltip';
import type { EquipmentInstance } from '../../models/equipment';
import { CLASS_NAMES_ZH, type ClassName } from '../../models/character';
import { GroupedPicker } from '../GroupedPicker';
import { ItemPicker } from '../ItemPicker';
import {
  AFFIX_OPTION_GROUPS, CATEGORY_OPTIONS, MAX_AFFIX_FILTERS, SEARCH_KIND_LABEL, affixName,
} from './auctionOptions';
import { getEquipmentInstanceTierColor } from '../../models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../../models/iconMap';
import { ITEM_DEFINITIONS } from '../../db/seed';
import { getItemById, isBoundItem } from '../../models/items';
import type { BagItem } from '../../models/bagItem';
import { getCachedTemplates } from '../../systems/templateSync';
import {
  AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS, AUCTION_PAGE_SIZE, DEFAULT_AUCTION_QUERY,
  auctionListedAtText, auctionListingName, auctionPriceText,
  type AuctionAffixFilter, type AuctionCategory, type AuctionKind, type AuctionListing, type AuctionPrice, type AuctionQuery,
} from '../../models/auction';

/**
 * 拍賣場（`57-auction.md`）：搜尋／我的上架／上架。只在開放世界出現。
 * 判定在 server；清單只在自己操作後刷新（§ 57.6）。
 */

type Source = 'bag' | 'personal' | 'shared';
const SOURCES: readonly Source[] = ['bag', 'personal', 'shared'];
const SOURCE_LABEL: Record<Source, string> = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' };

/** 可當標價的道具：綁角色的除外（§ 57.2） */
const PRICE_ITEMS = ITEM_DEFINITIONS.filter(i => !i.bound);

function EquipmentLabel({ item }: { item: EquipmentInstance }) {
  const templates = getCachedTemplates();
  const color = getEquipmentInstanceTierColor(item, templates);
  return (
    <Tooltip position="right" content={<EquipmentDetail item={item} templates={templates} />}>
      <span className="auc-name" style={{ color }}>
        <GameIcon name={getEquipIcon(item.type === 'armor' ? item.slot : item.type)} size={16} color={color} />
        {auctionListingName({ kind: 'equipment', equipment: item })}
      </span>
    </Tooltip>
  );
}

function ItemLabel({ itemId }: { itemId: number }) {
  const def = getItemById(itemId);
  const { icon, color, glowClass } = resolveItemIcon(def, def?.category === 'material' ? 'material' : 'potion');
  return (
    <span className="auc-name" style={{ color }}>
      <GameIcon name={icon} size={16} color={color} className={glowClass} />{def?.name ?? '道具'}
    </span>
  );
}

function ListingLabel({ listing }: { listing: AuctionListing }) {
  return listing.kind === 'equipment' ? <EquipmentLabel item={listing.equipment!} /> : <ItemLabel itemId={listing.itemId!} />;
}

function PriceLabel({ price }: { price: AuctionPrice }) {
  return <span className={`auc-price ${price.kind === 'gold' ? 'is-gold' : 'is-item'}`}>{auctionPriceText(price)}</span>;
}

function Confirm({ title, children, onOk, onCancel }: { title: string; children: ReactNode; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content auc-confirm" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">{title}</span></div>
        <div className="modal-body auc-confirm-body">{children}</div>
        <div className="auc-confirm-actions">
          <button onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={onOk}>確定</button>
        </div>
      </div>
    </div>
  );
}

/** 送 server 的輸入格：打字只改本機草稿，離開或按 Enter 才送出（`97-selfhosted-server.md` § 97.2） */
function DraftInput({ value, onCommit, ...rest }: {
  value: string; onCommit: (v: string) => void; placeholder?: string; type?: string; className?: string; 'aria-label'?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <input {...rest} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
  );
}

/* ---------- 搜尋 ---------- */

function AffixFilter({ value, onChange }: { value: AuctionAffixFilter[]; onChange: (v: AuctionAffixFilter[]) => void }) {
  return (
    <div className="auc-affix-filter">
      {value.map((f, i) => (
        <span key={f.type} className="auc-affix-chip">
          {affixName(f.type)} ≥
          <DraftInput
            type="number" placeholder="不限" aria-label={`${affixName(f.type)} 最低值`} value={f.min === undefined ? '' : String(f.min)}
            onCommit={v => onChange(value.map((x, j) => (j === i ? { type: x.type, ...(v === '' ? {} : { min: Number(v) }) } : x)))}
          />
          <button aria-label={`移除 ${affixName(f.type)}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
        </span>
      ))}
      {value.length < MAX_AFFIX_FILTERS && (
        <GroupedPicker
          groups={AFFIX_OPTION_GROUPS.map(g => ({
            key: g.label, label: g.label,
            options: g.options.filter(o => !value.some(v => v.type === o.type)).map(o => ({ value: o.type, label: o.name })),
          }))}
          buttonText="＋ 詞綴"
          emptyText="沒有符合的詞綴"
          onPick={type => onChange([...value, { type: type as AuctionAffixFilter['type'] }])}
        />
      )}
    </div>
  );
}

function SearchTab({ gold, onBuy }: { gold: number; onBuy: (l: AuctionListing) => void }) {
  const results = useAuctionStore(s => s.results);
  const search = useAuctionStore(s => s.search);
  const myId = useGameStore(s => s.character?.id);
  const query = results?.query ?? DEFAULT_AUCTION_QUERY;
  const kind = query.kind;
  const set = (patch: Partial<AuctionQuery>) => void search({ ...query, page: 0, ...patch });
  /** 切換類別時清掉另一類的條件；標價、排序、名稱保留（§ 57.6） */
  const switchKind = (next: AuctionKind) => {
    if (next !== kind) void search({ ...DEFAULT_AUCTION_QUERY, kind: next, priceKind: query.priceKind, sort: query.sort, name: query.name });
  };
  const total = results?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / AUCTION_PAGE_SIZE));
  const tiers = query.tiers ?? [];

  return (
    <>
      <div className="auc-kind" role="tablist" aria-label="物品類別">
        {(Object.keys(SEARCH_KIND_LABEL) as AuctionKind[]).map(k => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => switchKind(k)}>
            {SEARCH_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="auc-filters">
        <label>{kind === 'equipment' ? '部位' : '類型'}
          <select value={query.category} onChange={e => set({ category: e.target.value as AuctionCategory })}>
            {CATEGORY_OPTIONS[kind].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {kind === 'equipment' && (
          <label>職業
            <select value={query.className ?? ''} onChange={e => set({ className: (e.target.value || undefined) as ClassName | undefined })}>
              <option value="">全部</option>
              {(Object.keys(CLASS_NAMES_ZH) as ClassName[]).map(c => <option key={c} value={c}>{CLASS_NAMES_ZH[c]}</option>)}
            </select>
          </label>
        )}
        <label>標價
          <select value={query.priceKind} onChange={e => set({ priceKind: e.target.value as AuctionQuery['priceKind'] })}>
            <option value="all">全部</option><option value="gold">金幣</option><option value="item">道具</option>
          </select>
        </label>
        <label>排序
          <select value={query.sort} onChange={e => set({ sort: e.target.value as AuctionQuery['sort'] })}>
            <option value="newest">上架時間</option><option value="price_asc">價格低→高</option><option value="price_desc">價格高→低</option>
          </select>
        </label>
        <DraftInput className="auc-name-input" placeholder="名稱" aria-label="名稱" value={query.name ?? ''} onCommit={name => set({ name })} />
      </div>
      {kind === 'equipment' && (
        <>
          <div className="auc-filter-row">
            <span className="auc-filter-label">階級</span>
            <span className="auc-tiers" role="group" aria-label="階級">
              {[1, 2, 3, 4, 5, 6, 7].map(t => (
                <button key={t} className={tiers.includes(t) ? 'active' : ''} aria-pressed={tiers.includes(t)}
                  onClick={() => set({ tiers: tiers.includes(t) ? tiers.filter(x => x !== t) : [...tiers, t] })}>T{t}</button>
              ))}
            </span>
            <span className="auc-filter-hint">可複選，不選＝全部</span>
          </div>
          <div className="auc-filter-row">
            <span className="auc-filter-label">詞綴</span>
            <AffixFilter value={query.affixes ?? []} onChange={affixes => set({ affixes })} />
          </div>
        </>
      )}
      <div className="auc-list">
        <table className="auc-table">
          <thead><tr><th>物品</th><th>數量</th><th>價格</th><th>賣家</th><th>上架時間</th><th /></tr></thead>
          <tbody>
            {(results?.listings ?? []).map(l => (
              <tr key={l.id}>
                <td><ListingLabel listing={l} /></td>
                <td className="auc-num">{l.amount}</td>
                <td><PriceLabel price={l.price} /></td>
                <td className="auc-seller">{l.sellerName}</td>
                <td className="auc-seller">{auctionListedAtText(l.createdAt)}</td>
                <td>
                  <button disabled={l.sellerCharacterId === myId || (l.price.kind === 'gold' && l.price.gold > gold)} onClick={() => onBuy(l)}>購買</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results && results.listings.length === 0 && <div className="auc-empty">沒有符合條件的物品</div>}
      </div>
      <div className="auc-pager">
        <button disabled={query.page === 0} onClick={() => void search({ ...query, page: query.page - 1 })}>上一頁</button>
        <span>{query.page + 1} / {pages}（共 {total} 筆）</span>
        <button disabled={query.page + 1 >= pages} onClick={() => void search({ ...query, page: query.page + 1 })}>下一頁</button>
      </div>
    </>
  );
}

/* ---------- 我的上架 ---------- */

function MineTab({ onCancel }: { onCancel: (l: AuctionListing) => void }) {
  const mine = useAuctionStore(s => s.mine);
  return (
    <>
      <div className="auc-mine-head">上架中 <strong>{mine.length}/{AUCTION_MAX_LISTINGS}</strong></div>
      <div className="auc-list">
        <table className="auc-table">
          <thead><tr><th>物品</th><th>數量</th><th>價格</th><th>上架時間</th><th /></tr></thead>
          <tbody>
            {mine.map(l => (
              <tr key={l.id}>
                <td><ListingLabel listing={l} /></td>
                <td className="auc-num">{l.amount}</td>
                <td><PriceLabel price={l.price} /></td>
                <td className="auc-seller">{auctionListedAtText(l.createdAt)}</td>
                <td><button className="btn-danger" onClick={() => onCancel(l)}>下架</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {mine.length === 0 && <div className="auc-empty">目前沒有上架的物品</div>}
      </div>
    </>
  );
}

/* ---------- 上架 ---------- */

type Picked = { kind: 'equipment'; source: Source; item: EquipmentInstance } | { kind: 'item'; itemId: number };

function useListingStock() {
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const personalMaterials = useGameStore(s => s.personalStoredMaterials);
  const personalEquipment = useGameStore(s => s.personalStoredEquipment);
  const sharedMaterials = useGameStore(s => s.storedMaterials);
  const sharedEquipment = useGameStore(s => s.storedEquipment);
  const materials: Record<Source, BagItem[]> = { bag: bagItems, personal: personalMaterials, shared: sharedMaterials };
  // 新手裝、綁角色的道具不可上架（§ 57.2）；裝備中的不在 `inventory`
  const equipment: Record<Source, EquipmentInstance[]> = {
    bag: inventory.filter(e => !e.isStarterGear),
    personal: personalEquipment.filter(e => !e.isStarterGear),
    shared: sharedEquipment.filter(e => !e.isStarterGear),
  };
  const amountAt = (source: Source, itemId: number) => materials[source].find(b => b.itemId === itemId)?.amount ?? 0;
  const itemIds = [...new Set(SOURCES.flatMap(s => materials[s].map(b => b.itemId)))].filter(id => !isBoundItem(id));
  const total = (itemId: number) => SOURCES.reduce((n, s) => n + amountAt(s, itemId), 0);
  return { equipment, itemIds, amountAt, total };
}

function ListTab({ gold, count }: { gold: number; count: number }) {
  const list = useAuctionStore(s => s.list);
  const stock = useListingStock();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [amount, setAmount] = useState(1);
  const [priceKind, setPriceKind] = useState<'gold' | 'item'>('gold');
  const [priceGold, setPriceGold] = useState(1000);
  const [priceItem, setPriceItem] = useState(PRICE_ITEMS[0]?.id ?? 0);
  const [priceAmount, setPriceAmount] = useState(1);

  const stillHeld = picked?.kind === 'equipment'
    ? stock.equipment[picked.source].some(e => e.id === picked.item.id)
    : picked ? stock.total(picked.itemId) > 0 : false;
  const current = stillHeld ? picked : null;
  const max = current?.kind === 'item' ? stock.total(current.itemId) : 1;
  const blocked = gold < AUCTION_LISTING_FEE ? `金幣不足（上架費 ${AUCTION_LISTING_FEE.toLocaleString()}）`
    : count >= AUCTION_MAX_LISTINGS ? `每隻角色最多同時上架 ${AUCTION_MAX_LISTINGS} 筆` : null;
  const price: AuctionPrice = priceKind === 'gold' ? { kind: 'gold', gold: priceGold } : { kind: 'item', itemId: priceItem, amount: priceAmount };
  const priceOk = priceKind === 'gold' ? priceGold > 0 : priceAmount > 0;
  const choose = (p: Picked) => { setPicked(p); setAmount(1); };
  const isPicked = (p: Picked) => !!current && current.kind === p.kind
    && (p.kind === 'equipment' ? (current as typeof p).item.id === p.item.id : (current as typeof p).itemId === p.itemId);

  const submit = async () => {
    if (!current) return;
    const ok = await list(current.kind === 'equipment'
      ? { kind: 'equipment', equipmentId: current.item.id!, price }
      : { kind: 'item', itemId: current.itemId, amount: Math.min(amount, max), price });
    if (ok) setPicked(null);
  };

  return (
    <div className="auc-list-tab">
      <div className="auc-source">
        <div className="auc-source-title">裝備</div>
        {SOURCES.flatMap(source => stock.equipment[source].map(item => {
          const p: Picked = { kind: 'equipment', source, item };
          return (
            <div key={item.id} role="radio" aria-checked={isPicked(p)} className={`auc-source-row ${isPicked(p) ? 'selected' : ''}`} onClick={() => choose(p)}>
              <EquipmentLabel item={item} />
              <span className="auc-source-tag">{SOURCE_LABEL[source]}</span>
            </div>
          );
        }))}
        <div className="auc-source-title">道具</div>
        {stock.itemIds.map(itemId => {
          const p: Picked = { kind: 'item', itemId };
          return (
            <div key={itemId} role="radio" aria-checked={isPicked(p)} className={`auc-source-row ${isPicked(p) ? 'selected' : ''}`} onClick={() => choose(p)}>
              <ItemLabel itemId={itemId} />
              <Tooltip position="right" content={(
                <div className="auc-source-tooltip">
                  {SOURCES.map(s => <div key={s}>{SOURCE_LABEL[s]} {stock.amountAt(s, itemId)}</div>)}
                </div>
              )}>
                <span className="auc-num">×{stock.total(itemId)}</span>
              </Tooltip>
            </div>
          );
        })}
      </div>
      <div className="auc-form">
        {current ? (
          <>
            <div className="auc-form-row">
              <span className="auc-form-label">物品</span>
              {current.kind === 'equipment'
                ? <><EquipmentLabel item={current.item} /><span className="auc-source-tag">{SOURCE_LABEL[current.source]}</span></>
                : <ItemLabel itemId={current.itemId} />}
            </div>
            {current.kind === 'item' && (
              <div className="auc-form-row">
                <span className="auc-form-label">數量</span>
                <input type="range" aria-label="數量拉桿" min={1} max={max} value={Math.min(amount, max)} onChange={e => setAmount(Number(e.target.value))} />
                <input type="number" aria-label="數量" min={1} max={max} value={Math.min(amount, max)}
                  onChange={e => setAmount(Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
                <span className="auc-dim">／{max}（依背包 → 個人倉庫 → 帳號倉庫扣）</span>
              </div>
            )}
            <div className="auc-form-row">
              <span className="auc-form-label">收取</span>
              <label><input type="radio" name="auc-price-kind" checked={priceKind === 'gold'} onChange={() => setPriceKind('gold')} /> 金幣</label>
              <label><input type="radio" name="auc-price-kind" checked={priceKind === 'item'} onChange={() => setPriceKind('item')} /> 道具</label>
            </div>
            <div className="auc-form-row">
              <span className="auc-form-label">價格</span>
              {priceKind === 'gold' ? (
                <input type="number" aria-label="金幣價格" min={1} value={priceGold}
                  onChange={e => setPriceGold(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
              ) : (
                <>
                  <ItemPicker items={PRICE_ITEMS} value={priceItem} onPick={setPriceItem} />
                  ×<input type="number" aria-label="道具數量" min={1} value={priceAmount}
                    onChange={e => setPriceAmount(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
                </>
              )}
            </div>
            <div className="auc-form-row auc-fee">上架費 <strong>{AUCTION_LISTING_FEE.toLocaleString()}</strong> 金幣（下架、成交都不退）</div>
            {blocked && <div className="auc-message is-error">{blocked}</div>}
            <button className="btn-primary" disabled={!!blocked || !priceOk} onClick={() => void submit()}>上架</button>
          </>
        ) : <div className="auc-empty">從左側選擇要上架的裝備或道具</div>}
      </div>
    </div>
  );
}

/* ---------- 視窗本體 ---------- */

type Tab = 'search' | 'mine' | 'list';

export function AuctionHouse() {
  const gold = useGameStore(s => s.character?.gold ?? 0);
  const mine = useAuctionStore(s => s.mine);
  const message = useAuctionStore(s => s.message);
  const open = useAuctionStore(s => s.open);
  const close = useAuctionStore(s => s.close);
  const buy = useAuctionStore(s => s.buy);
  const cancel = useAuctionStore(s => s.cancel);
  const [tab, setTab] = useState<Tab>('search');
  const [confirm, setConfirm] = useState<{ kind: 'buy' | 'cancel'; listing: AuctionListing } | null>(null);

  useEffect(() => {
    void open();
    return () => { void close(); };
  }, [open, close]);

  const run = () => {
    if (!confirm) return;
    void (confirm.kind === 'buy' ? buy(confirm.listing.id) : cancel(confirm.listing.id));
    setConfirm(null);
  };

  return (
    <div className="auc-body">
      <div className="auc-gold">持有金幣 <strong>{gold.toLocaleString()}</strong></div>
      <div className="shop-tabs">
        {([['search', '搜尋'], ['mine', `我的上架（${mine.length}/${AUCTION_MAX_LISTINGS}）`], ['list', '上架']] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {message && <div className="auc-message" role="status">{message}</div>}
      {tab === 'search' && <SearchTab gold={gold} onBuy={l => setConfirm({ kind: 'buy', listing: l })} />}
      {tab === 'mine' && <MineTab onCancel={l => setConfirm({ kind: 'cancel', listing: l })} />}
      {tab === 'list' && <ListTab gold={gold} count={mine.length} />}
      {confirm && (
        <Confirm title={confirm.kind === 'buy' ? '確認購買' : '確認下架'} onOk={run} onCancel={() => setConfirm(null)}>
          <div><ListingLabel listing={confirm.listing} /> ×{confirm.listing.amount}</div>
          {confirm.kind === 'buy'
            ? <div>支付 <PriceLabel price={confirm.listing.price} />，物品寄到信箱</div>
            : <div>物品寄回信箱，上架費不退</div>}
        </Confirm>
      )}
    </div>
  );
}
