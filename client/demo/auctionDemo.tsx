/**
 * 拍賣場視窗（`auction.html`，`57-auction.md`）：搜尋／我的上架／上架三個分頁的版面樣本。
 * 篩選、排序、分頁走遊戲的 `matchesAuctionQuery`／`compareAuctionListings`；資料為本機假資料，不連 server。
 */
import { StrictMode, useMemo, useState, type ReactNode } from 'react';
import { GroupedPicker } from '../src/components/GroupedPicker';
import { ItemPicker } from '../src/components/ItemPicker';
import { createRoot } from 'react-dom/client';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { ITEM_DEFINITIONS } from '../src/db/seed';
import type { EquipmentInstance, EquipmentTemplate } from '../src/models/equipment';
import { AFFIX_DEFINITIONS, type Affix } from '../src/models/affix';
import {
  AFFIX_OPTION_GROUPS, CATEGORY_OPTIONS, MAX_AFFIX_FILTERS, SEARCH_KIND_LABEL, affixName,
} from '../src/components/town/auctionOptions';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';
import { EquipmentDetail } from '../src/components/EquipmentInfo';
import { getEquipmentTierColor } from '../src/models/equipmentTier';
import { getEquipIcon, resolveItemIcon } from '../src/models/iconMap';
import { getItemById } from '../src/models/items';
import { makeBagItem, type BagItem } from '../src/models/bagItem';
import { isSigilItemId } from '../src/models/sigil';
import { GameIcon } from '../src/components/GameIcon';
import { Tooltip } from '../src/components/Tooltip';
import {
  AUCTION_LISTING_FEE, AUCTION_MAX_LISTINGS, AUCTION_PAGE_SIZE, DEFAULT_AUCTION_QUERY,
  auctionListedAtText, auctionListingName, auctionPriceText, compareAuctionListings, matchesAuctionQuery,
  type AuctionAffixFilter, type AuctionCategory, type AuctionKind, type AuctionListing, type AuctionPrice, type AuctionQuery,
} from '../src/models/auction';

const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const tierOf = (templateId: number) => templates.find(t => t.id === templateId)?.tier;
const ME = { id: 1, name: 'Alice' };
const SELLERS = ['Bob', 'Carol', 'Dave', 'Eve', '星辰', '小黑'];
const SOURCE_LABEL = { bag: '背包', personal: '個人倉庫', shared: '帳號倉庫' } as const;
type Source = keyof typeof SOURCE_LABEL;

const TRADABLE_ITEMS = ITEM_DEFINITIONS.filter(i => !i.bound && !isSigilItemId(i.id) && i.category !== 'dungeon');
const MATERIALS = TRADABLE_ITEMS.filter(i => i.category === 'material');

/** 決定性的假資料 */
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];

const GEAR_POOL = templates.filter(t => (t.tier ?? 0) >= 3 && t.acquireType !== 'starter');
let nextId = 1;
function fakeEquipment(ownerId: number): EquipmentInstance {
  const tpl = pick(GEAR_POOL);
  const affixes: Affix[] = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => {
    const def = pick(AFFIX_DEFINITIONS);
    const tier = 1 + Math.floor(rand() * 6);
    return { type: def.type, tier, value: 2 + tier * 2 + Math.floor(rand() * 3) } as Affix;
  });
  const { id: _id, acquireType: _a, craftMaterials: _m, craftPrerequisiteWeapon: _p, craftGold: _g, buyPrice: _b, tier: _t, ...base } = tpl;
  return {
    ...base, id: nextId++, templateId: tpl.id!, name: tpl.name, quality: Math.floor(rand() * 20),
    enhancement: Math.floor(rand() * 8), affixes, ownerId, equipped: false,
  } as EquipmentInstance;
}

function fakePrice(): AuctionPrice {
  return rand() < 0.8
    ? { kind: 'gold', gold: (1 + Math.floor(rand() * 200)) * 500 }
    : { kind: 'item', itemId: pick(MATERIALS).id, amount: 1 + Math.floor(rand() * 20) };
}

function fakeListing(seller: { id: number; name: string }, minutesAgo: number): AuctionListing {
  const equipment = rand() < 0.7;
  const base = { id: nextId++, sellerCharacterId: seller.id, sellerName: seller.name, price: fakePrice(), createdAt: Date.now() - minutesAgo * 60_000 };
  return equipment
    ? { ...base, kind: 'equipment', equipment: fakeEquipment(seller.id), amount: 1 }
    : { ...base, kind: 'item', itemId: pick(TRADABLE_ITEMS).id, amount: 1 + Math.floor(rand() * 30) };
}

const INITIAL_MARKET = Array.from({ length: 64 }, (_, i) => fakeListing({ id: 10 + (i % SELLERS.length), name: SELLERS[i % SELLERS.length] }, i * 17));
const INITIAL_MINE = Array.from({ length: 3 }, (_, i) => fakeListing(ME, i * 40 + 5));

interface Stock { bag: BagItem[]; personal: BagItem[]; shared: BagItem[]; gear: Record<Source, EquipmentInstance[]> }
const INITIAL_STOCK: Stock = {
  bag: MATERIALS.slice(0, 4).map((m, i) => makeBagItem(m.id, 3 + i * 4)!),
  personal: MATERIALS.slice(2, 5).map((m, i) => makeBagItem(m.id, 10 + i)!),
  shared: MATERIALS.slice(5, 7).map(m => makeBagItem(m.id, 25)!),
  gear: { bag: [fakeEquipment(1), fakeEquipment(1), fakeEquipment(1)], personal: [fakeEquipment(1)], shared: [fakeEquipment(1), fakeEquipment(1)] },
};

/* ---------- 共用 ---------- */

function ListingLabel({ listing }: { listing: AuctionListing }) {
  if (listing.kind === 'equipment') {
    const e = listing.equipment!;
    const tpl = templates.find(t => t.id === e.templateId);
    const color = tpl ? getEquipmentTierColor(tpl) : undefined;
    return (
      <Tooltip position="right" content={<EquipmentDetail item={e} templates={templates} />}>
        <span className="auc-name" style={{ color }}>
          <GameIcon name={getEquipIcon(e.type === 'armor' ? e.slot : e.type)} size={16} color={color} />{auctionListingName(listing)}
        </span>
      </Tooltip>
    );
  }
  const def = getItemById(listing.itemId!);
  const { icon, color, glowClass } = resolveItemIcon(def, def?.category === 'material' ? 'material' : 'potion');
  return (
    <span className="auc-name" style={{ color }}>
      <GameIcon name={icon} size={16} color={color} className={glowClass} />{auctionListingName(listing)}
    </span>
  );
}

function PriceLabel({ price }: { price: AuctionPrice }) {
  return <span className={`auc-price ${price.kind === 'gold' ? 'is-gold' : 'is-item'}`}>{auctionPriceText(price)}</span>;
}

function Confirm({ title, children, onOk, onCancel }: { title: string; children: ReactNode; onOk: () => void; onCancel: () => void }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content auc-confirm" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">{title}</span></div>
        <div className="modal-body">{children}</div>
        <div className="auc-confirm-actions">
          <button onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={onOk}>確定</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 搜尋 ---------- */

function AffixPicker({ value, onChange }: { value: AuctionAffixFilter[]; onChange: (v: AuctionAffixFilter[]) => void }) {
  return (
    <div className="auc-affix-filter">
      {value.map((f, i) => (
        <span key={f.type} className="auc-affix-chip">
          {affixName(f.type)} ≥
          <input
            type="number" min={0} placeholder="不限" aria-label={`${affixName(f.type)} 最低值`} value={f.min ?? ''}
            onChange={e => onChange(value.map((x, j) => (j === i ? { type: x.type, ...(e.target.value === '' ? {} : { min: Number(e.target.value) }) } : x)))}
          />
          <button aria-label="移除" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
        </span>
      ))}
      {value.length < MAX_AFFIX_FILTERS && (
        <GroupedPicker
          groups={AFFIX_OPTION_GROUPS.map(g => ({
            key: g.label, label: g.label, options: g.options.filter(o => !value.some(v => v.type === o.type)).map(o => ({ value: o.type, label: o.name })),
          }))}
          buttonText="＋ 詞綴"
          emptyText="沒有符合的詞綴"
          onPick={type => onChange([...value, { type: type as AuctionAffixFilter['type'] }])}
        />
      )}
    </div>
  );
}

function SearchTab({ market, gold, onBuy }: { market: AuctionListing[]; gold: number; onBuy: (l: AuctionListing) => void }) {
  const [query, setQuery] = useState<AuctionQuery>(DEFAULT_AUCTION_QUERY);
  const kind = query.kind;
  const set = (patch: Partial<AuctionQuery>) => setQuery(q => ({ ...q, page: 0, ...patch }));
  /** 切換時清掉另一類的條件；標價、排序、名稱保留 */
  const switchKind = (next: AuctionKind) =>
    setQuery(q => ({ ...DEFAULT_AUCTION_QUERY, kind: next, priceKind: q.priceKind, sort: q.sort, name: q.name }));
  const matched = useMemo(
    () => market.filter(l => matchesAuctionQuery(l, query, tierOf)).sort(compareAuctionListings(query.sort)),
    [market, query],
  );
  const pages = Math.max(1, Math.ceil(matched.length / AUCTION_PAGE_SIZE));
  const shown = matched.slice(query.page * AUCTION_PAGE_SIZE, (query.page + 1) * AUCTION_PAGE_SIZE);
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
        <input className="auc-name-input" placeholder="名稱" value={query.name ?? ''} onChange={e => set({ name: e.target.value })} />
      </div>
      {kind === 'equipment' && (
        <>
          <div className="auc-filter-row">
            <span className="auc-filter-label">階級</span>
            <span className="auc-tiers" role="group" aria-label="階級">
              {[1, 2, 3, 4, 5, 6, 7].map(t => (
                <button key={t} className={tiers.includes(t) ? 'active' : ''}
                  onClick={() => set({ tiers: tiers.includes(t) ? tiers.filter(x => x !== t) : [...tiers, t] })}>T{t}</button>
              ))}
            </span>
            <span className="auc-filter-hint">可複選，不選＝全部</span>
          </div>
          <div className="auc-filter-row">
            <span className="auc-filter-label">詞綴</span>
            <AffixPicker value={query.affixes ?? []} onChange={affixes => set({ affixes })} />
          </div>
        </>
      )}
      <div className="panel-scroll auc-list">
        <table className="auc-table">
          <thead><tr><th>物品</th><th>數量</th><th>價格</th><th>賣家</th><th>上架時間</th><th /></tr></thead>
          <tbody>
            {shown.map(l => (
              <tr key={l.id}>
                <td><ListingLabel listing={l} /></td>
                <td className="auc-num">{l.amount}</td>
                <td><PriceLabel price={l.price} /></td>
                <td className="auc-seller">{l.sellerName}</td>
                <td className="auc-seller">{auctionListedAtText(l.createdAt)}</td>
                <td><button disabled={l.price.kind === 'gold' && l.price.gold > gold} onClick={() => onBuy(l)}>購買</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="auc-empty">沒有符合條件的物品</div>}
      </div>
      <div className="auc-pager">
        <button disabled={query.page === 0} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>上一頁</button>
        <span>{query.page + 1} / {pages}（共 {matched.length} 筆）</span>
        <button disabled={query.page + 1 >= pages} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>下一頁</button>
      </div>
    </>
  );
}

/* ---------- 我的上架 ---------- */

function MineTab({ mine, onCancel }: { mine: AuctionListing[]; onCancel: (l: AuctionListing) => void }) {
  return (
    <>
      <div className="auc-mine-head">上架中 <strong>{mine.length}/{AUCTION_MAX_LISTINGS}</strong></div>
      <div className="panel-scroll auc-list">
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

function heldTotal(stock: Stock, itemId: number) {
  return (['bag', 'personal', 'shared'] as const).reduce((n, s) => n + (stock[s].find(b => b.itemId === itemId)?.amount ?? 0), 0);
}

function ListTab({ stock, gold, count, onList }: {
  stock: Stock; gold: number; count: number; onList: (picked: Picked, amount: number, price: AuctionPrice) => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [amount, setAmount] = useState(1);
  const [priceKind, setPriceKind] = useState<'gold' | 'item'>('gold');
  const [priceGold, setPriceGold] = useState(10000);
  const [priceItem, setPriceItem] = useState(MATERIALS[0].id);
  const [priceAmount, setPriceAmount] = useState(1);
  const itemIds = [...new Set((['bag', 'personal', 'shared'] as const).flatMap(s => stock[s].map(b => b.itemId)))];
  const max = picked?.kind === 'item' ? heldTotal(stock, picked.itemId) : 1;
  const blocked = gold < AUCTION_LISTING_FEE ? `金幣不足（上架費 ${AUCTION_LISTING_FEE.toLocaleString()}）`
    : count >= AUCTION_MAX_LISTINGS ? `已達上架上限 ${AUCTION_MAX_LISTINGS} 筆` : null;
  const price: AuctionPrice = priceKind === 'gold' ? { kind: 'gold', gold: priceGold } : { kind: 'item', itemId: priceItem, amount: priceAmount };
  const priceOk = priceKind === 'gold' ? priceGold > 0 : priceAmount > 0;

  return (
    <div className="auc-list-tab">
      <div className="panel-scroll auc-source">
        <div className="auc-source-title">裝備</div>
        {(['bag', 'personal', 'shared'] as const).flatMap(s => stock.gear[s].map(item => (
          <div key={item.id} role="radio" aria-checked={picked?.kind === 'equipment' && picked.item.id === item.id}
            className={`auc-source-row ${picked?.kind === 'equipment' && picked.item.id === item.id ? 'selected' : ''}`}
            onClick={() => { setPicked({ kind: 'equipment', source: s, item }); setAmount(1); }}>
            <ListingLabel listing={{ id: 0, kind: 'equipment', equipment: item, amount: 1 } as AuctionListing} />
            <span className="auc-source-tag">{SOURCE_LABEL[s]}</span>
          </div>
        )))}
        <div className="auc-source-title">道具</div>
        {itemIds.map(itemId => (
          <div key={itemId} role="radio" aria-checked={picked?.kind === 'item' && picked.itemId === itemId}
            className={`auc-source-row ${picked?.kind === 'item' && picked.itemId === itemId ? 'selected' : ''}`}
            onClick={() => { setPicked({ kind: 'item', itemId }); setAmount(1); }}>
            <ListingLabel listing={{ id: 0, kind: 'item', itemId, amount: 1 } as AuctionListing} />
            <Tooltip position="right" content={(
              <div className="auc-source-tooltip">
                {(['bag', 'personal', 'shared'] as const).map(s => <div key={s}>{SOURCE_LABEL[s]} {stock[s].find(b => b.itemId === itemId)?.amount ?? 0}</div>)}
              </div>
            )}>
              <span className="auc-num">×{heldTotal(stock, itemId)}</span>
            </Tooltip>
          </div>
        ))}
      </div>
      <div className="auc-form">
        {picked ? (
          <>
            <div className="auc-form-row">
              <span className="auc-form-label">物品</span>
              {picked.kind === 'equipment'
                ? <><ListingLabel listing={{ id: 0, kind: 'equipment', equipment: picked.item, amount: 1 } as AuctionListing} /><span className="auc-source-tag">{SOURCE_LABEL[picked.source]}</span></>
                : <ListingLabel listing={{ id: 0, kind: 'item', itemId: picked.itemId, amount } as AuctionListing} />}
            </div>
            {picked.kind === 'item' && (
              <div className="auc-form-row">
                <span className="auc-form-label">數量</span>
                <input type="range" min={1} max={max} value={amount} onChange={e => setAmount(Number(e.target.value))} />
                <input type="number" min={1} max={max} value={amount} onChange={e => setAmount(Math.min(max, Math.max(1, Number(e.target.value))))} />
                <span className="auc-dim">／{max}（依背包 → 個人倉庫 → 帳號倉庫扣）</span>
              </div>
            )}
            <div className="auc-form-row">
              <span className="auc-form-label">收取</span>
              <label><input type="radio" checked={priceKind === 'gold'} onChange={() => setPriceKind('gold')} /> 金幣</label>
              <label><input type="radio" checked={priceKind === 'item'} onChange={() => setPriceKind('item')} /> 道具</label>
            </div>
            <div className="auc-form-row">
              <span className="auc-form-label">價格</span>
              {priceKind === 'gold' ? (
                <input type="number" min={1} value={priceGold} onChange={e => setPriceGold(Math.max(0, Math.floor(Number(e.target.value))))} />
              ) : (
                <>
                  <ItemPicker items={TRADABLE_ITEMS} value={priceItem} onPick={setPriceItem} />
                  ×<input type="number" min={1} value={priceAmount} onChange={e => setPriceAmount(Math.max(0, Math.floor(Number(e.target.value))))} />
                </>
              )}
            </div>
            <div className="auc-form-row auc-fee">上架費 <strong>{AUCTION_LISTING_FEE.toLocaleString()}</strong> 金幣（下架、成交都不退）</div>
            {blocked && <div className="auc-message is-error">{blocked}</div>}
            <button className="btn-primary" disabled={!!blocked || !priceOk} onClick={() => { onList(picked, amount, price); setPicked(null); }}>上架</button>
          </>
        ) : <div className="auc-empty">從左側選擇要上架的裝備或道具</div>}
      </div>
    </div>
  );
}

/* ---------- 視窗 ---------- */

type Tab = 'search' | 'mine' | 'list';

function AuctionWindow() {
  const [tab, setTab] = useState<Tab>('search');
  const [market, setMarket] = useState(INITIAL_MARKET);
  const [mine, setMine] = useState(INITIAL_MINE);
  const [stock, setStock] = useState(INITIAL_STOCK);
  const [gold, setGold] = useState(250_000);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'buy' | 'cancel'; listing: AuctionListing } | null>(null);

  const list = (picked: Picked, amount: number, price: AuctionPrice) => {
    const base = { id: nextId++, sellerCharacterId: ME.id, sellerName: ME.name, price, createdAt: Date.now() };
    if (picked.kind === 'equipment') {
      setStock(s => ({ ...s, gear: { ...s.gear, [picked.source]: s.gear[picked.source].filter(e => e.id !== picked.item.id) } }));
      setMine(m => [{ ...base, kind: 'equipment', equipment: picked.item, amount: 1 }, ...m]);
    } else {
      setStock(s => {
        let left = amount;
        const next = { ...s };
        for (const src of ['bag', 'personal', 'shared'] as const) {
          next[src] = s[src].map(b => {
            if (b.itemId !== picked.itemId || left <= 0) return b;
            const take = Math.min(left, b.amount);
            left -= take;
            return { ...b, amount: b.amount - take };
          }).filter(b => b.amount > 0);
        }
        return next;
      });
      setMine(m => [{ ...base, kind: 'item', itemId: picked.itemId, amount }, ...m]);
    }
    setGold(g => g - AUCTION_LISTING_FEE);
    setMessage(`已上架 ${auctionListingName({ kind: picked.kind, equipment: picked.kind === 'equipment' ? picked.item : undefined, itemId: picked.kind === 'item' ? picked.itemId : undefined })}（上架費 ${AUCTION_LISTING_FEE.toLocaleString()} 金幣）`);
  };

  const run = () => {
    if (!confirm) return;
    const { kind, listing } = confirm;
    if (kind === 'buy') {
      if (listing.price.kind === 'gold') setGold(g => g - (listing.price as { gold: number }).gold);
      setMarket(m => m.filter(l => l.id !== listing.id));
      setMessage('購買成功，物品已寄到信箱');
    } else {
      setMine(m => m.filter(l => l.id !== listing.id));
      setMessage('已下架，物品已寄回信箱');
    }
    setConfirm(null);
  };

  return (
    <div className="town-modal is-auction">
      <div className="town-modal-header">
        <span>⚖️ 拍賣場</span>
        <button className="town-modal-close" aria-label="關閉">✕</button>
      </div>
      <div className="town-modal-body"><div className="auc-body">
        <div className="auc-gold">持有金幣 <strong>{gold.toLocaleString()}</strong></div>
        <div className="shop-tabs">
          {([['search', '搜尋'], ['mine', `我的上架（${mine.length}/${AUCTION_MAX_LISTINGS}）`], ['list', '上架']] as const).map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setMessage(null); }}>{label}</button>
          ))}
        </div>
        {message && <div className="auc-message">{message}</div>}
        {tab === 'search' && <SearchTab market={market} gold={gold} onBuy={l => setConfirm({ kind: 'buy', listing: l })} />}
        {tab === 'mine' && <MineTab mine={mine} onCancel={l => setConfirm({ kind: 'cancel', listing: l })} />}
        {tab === 'list' && <ListTab stock={stock} gold={gold} count={mine.length} onList={list} />}
      </div></div>
      {confirm && (
        <Confirm title={confirm.kind === 'buy' ? '確認購買' : '確認下架'} onOk={run} onCancel={() => setConfirm(null)}>
          <div className="auc-confirm-body">
            <ListingLabel listing={confirm.listing} /> ×{confirm.listing.amount}
            {confirm.kind === 'buy'
              ? <div>支付 <PriceLabel price={confirm.listing.price} />，物品寄到信箱</div>
              : <div>物品寄回信箱，上架費不退</div>}
          </div>
        </Confirm>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><AuctionWindow /></StrictMode>);
