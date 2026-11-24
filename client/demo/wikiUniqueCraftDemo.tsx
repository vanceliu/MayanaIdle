/**
 * Wiki 鐵匠鋪頁的「一般製作／獨特製作」切換與詳細頁返回連結（`wiki-unique-craft.html`）。資料取自 seed。
 * 道具／怪物／地圖詳細頁為正式元件，原本的返回連結在 demo 中隱藏，改顯示 `DemoBackLink`。
 */
import { StrictMode, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Link, Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ItemsPage } from '../src/wiki/pages/ItemsPage';
import { MonstersPage } from '../src/wiki/pages/MonstersPage';
import { MapsPage } from '../src/wiki/pages/MapsPage';
import { WeaponsPage } from '../src/wiki/pages/WeaponsPage';
import { ArmorPage } from '../src/wiki/pages/ArmorPage';
import { useWeaponList, useArmorList, getWikiEquipmentPath, getEquipmentById } from '../src/wiki/hooks/useWikiData';
import { getItemById } from '../src/models/items';
import { CRAFTED_GEAR_SUFFIX, MIMIC_GEAR_SUFFIX, UNIQUE_CRAFTED_GEAR_SUFFIX, type EquipmentTemplate, type CraftMaterial } from '../src/models/equipment';
import { formatCraftAffixTierRanges, formatCraftAffixTierWeights } from '../src/models/affix';
import { UNIQUE_CRAFT_TIERS, isUniqueCraftTier } from '../src/models/uniqueCraft';

type CraftMode = 'normal' | 'unique';

const TIER_LABELS: Record<number, string> = {
  4: '裝備Tier 4（中階）',
  5: '裝備Tier 5（中階）',
  6: '裝備Tier 6（高階）',
};

const TYPE_LABELS: Record<string, string> = {
  sword: '單手劍', dagger: '匕首', axe: '單手斧', mace: '鈍器',
  staff: '法杖', bow: '弓', twoHandSword: '雙手劍', twoHandAxe: '雙手斧',
  twoHandStaff: '雙手法杖', dualBlade: '雙刀', claw: '爪',
  shield: '盾牌', magicBook: '魔導書', armGuard: '臂甲',
};

const ARMOR_SLOT_LABELS: Record<string, string> = {
  helmet: '頭盔', chest: '盔甲', shirt: '上衣', cloak: '斗篷', belt: '腰帶',
  gloves: '手套', boots: '鞋子', necklace: '項鍊', ring1: '戒指', ring2: '戒指',
};

const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
  marginTop: 10,
} as const;

function CraftingPagePreview() {
  const weapons = useWeaponList();
  const armors = useArmorList();
  const [params, setParams] = useSearchParams();
  const mode: CraftMode = params.get('mode') === 'unique' ? 'unique' : 'normal';
  const tierFilter = params.get('tier') ?? 'all';
  const search = params.get('q') ?? '';
  const setParam = (key: string, value: string, fallback: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value === fallback) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true });
  const setMode = (next: CraftMode) => setParam('mode', next, 'normal');
  const setTierFilter = (next: string) => setParam('tier', next, 'all');
  const setSearch = (next: string) => setParam('q', next, '');

  const craftTiers = useMemo(
    () => [...new Set([...weapons, ...armors].filter(e => e.acquireType === 'craft').map(e => e.tier ?? 0))].sort((a, b) => a - b),
    [weapons, armors],
  );
  const tiers = mode === 'unique' ? UNIQUE_CRAFT_TIERS : craftTiers;

  const craftItems = useMemo(() => {
    let list = [...weapons, ...armors].filter(e =>
      mode === 'unique' ? isUniqueCraftTier(e.tier) && e.uniqueCraftMaterials?.length : e.acquireType === 'craft');
    if (tierFilter !== 'all') list = list.filter(e => e.tier === Number(tierFilter));
    if (search) list = list.filter(e => e.name.includes(search));
    return list.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0) || (a.name > b.name ? 1 : -1));
  }, [weapons, armors, mode, tierFilter, search]);


  return (
    <div>
      <h2 className="wiki-page-title">鐵匠鋪製作</h2>
      <p style={noteStyle}>
        製作品名稱後標 <strong>{CRAFTED_GEAR_SUFFIX}</strong>：固定 4 條詞綴、不會出特殊詞綴，
        Tier 依裝備階級（{formatCraftAffixTierRanges()}；{formatCraftAffixTierWeights()}），<strong>不可使用任何印記</strong>。
        製作費依階級（見下表），必定成功。
      </p>
      <p style={noteStyle}>…（隨機技能、取用倉庫段落不變）</p>
      <p style={noteStyle}>
        <strong>獨特製作</strong>：鐵匠鋪「獨特製作」分頁，配方同一般製作（T4～T6）。前置改為<strong>同一款裝備 ×1</strong>
        （掉落品、商店品、{CRAFTED_GEAR_SUFFIX} 可；{UNIQUE_CRAFTED_GEAR_SUFFIX} 與 {MIMIC_GEAR_SUFFIX} 不可），材料改為獨特魔物的獨特材料與 Boss 專屬素材
        （配方見下表切到「獨特製作」），製作費同一般製作，製作前會確認要消耗的那件。
        產物名稱後標 <strong>{UNIQUE_CRAFTED_GEAR_SUFFIX}</strong>：…（其餘不變）
      </p>
      <p style={noteStyle}>…（拆解、技能結晶段落不變）</p>

      <div className="affix-cat-chips" style={{ marginTop: 20 }}>
        <button type="button" className={`affix-cat-chip${mode === 'normal' ? ' active' : ''}`} onClick={() => setMode('normal')}>
          一般製作
        </button>
        <button type="button" className={`affix-cat-chip${mode === 'unique' ? ' active' : ''}`} onClick={() => setMode('unique')}>
          獨特製作
        </button>
      </div>

      <div className="wiki-filters">
        <select className="wiki-filter-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">全部階級</option>
          {tiers.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
        </select>
        <input
          className="wiki-filter-input"
          placeholder="搜尋裝備名稱..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>成品</th>
              <th>類型</th>
              <th>階級</th>
              <th>製作費</th>
              <th>{mode === 'unique' ? '前置裝備' : '前置武器'}</th>
              <th>{mode === 'unique' ? '獨特材料' : '所需材料'}</th>
            </tr>
          </thead>
          <tbody>
            {craftItems.map(item => <CraftRow key={item.name} item={item} mode={mode} />)}
          </tbody>
        </table>
        {craftItems.length === 0 && <p className="wiki-empty">無符合條件的配方</p>}
      </div>
    </div>
  );
}

function CraftRow({ item, mode }: { item: EquipmentTemplate; mode: CraftMode }) {
  const materials: CraftMaterial[] | undefined = mode === 'unique' ? item.uniqueCraftMaterials : item.craftMaterials;
  return (
    <tr>
      <td>
        <Link className="wiki-link" to={getWikiEquipmentPath(item.name)}>{item.name}</Link>
        {mode === 'unique' && <> {UNIQUE_CRAFTED_GEAR_SUFFIX}</>}
      </td>
      <td>{item.type === 'armor' ? ARMOR_SLOT_LABELS[item.slot] ?? item.slot : TYPE_LABELS[item.type] ?? item.type}</td>
      <td>{item.tier != null ? TIER_LABELS[item.tier] ?? `裝備Tier ${item.tier}` : '-'}</td>
      <td>{(item.craftGold ?? 0).toLocaleString()}G</td>
      <td>
        {mode === 'unique'
          ? <span><Link className="wiki-link" to={getWikiEquipmentPath(item.name)}>{item.name}</Link>×1</span>
          : <PrerequisiteCell item={item} />}
      </td>
      <td>
        {materials?.map(mat => <CraftMaterialLink key={mat.itemId} itemId={mat.itemId} amount={mat.amount} />) || '-'}
      </td>
    </tr>
  );
}

function PrerequisiteCell({ item }: { item: EquipmentTemplate }) {
  if (!item.craftPrerequisiteWeapon) return <>-</>;
  const { templateId, quantity } = item.craftPrerequisiteWeapon;
  const prereq = getEquipmentById(templateId);
  if (!prereq) return <>#{templateId} ×{quantity}</>;
  return (
    <span>
      <Link className="wiki-link" to={getWikiEquipmentPath(prereq.name)}>{prereq.name}</Link>
      ×{quantity}
    </span>
  );
}

function CraftMaterialLink({ itemId, amount }: { itemId: number; amount: number }) {
  const name = getItemById(itemId)?.name;
  if (!name) return null;
  return (
    <span style={{ marginRight: 8 }}>
      <Link className="wiki-link" to={`/wiki/items/${encodeURIComponent(name)}`}>{name}</Link>
      x{amount}
    </span>
  );
}

const backLinkStyle = { marginBottom: 16, display: 'inline-block' } as const;

/** 站內點進來時返回上一頁；直接開啟（無站內上一頁）時連到列表頁 */
function DemoBackLink({ listPath, listLabel }: { listPath: string; listLabel: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  if (location.key === 'default') {
    return <Link className="wiki-link" to={listPath} style={backLinkStyle}>← {listLabel}</Link>;
  }
  return (
    <Link className="wiki-link" to={listPath} style={backLinkStyle} onClick={e => { e.preventDefault(); navigate(-1); }}>
      ← 返回上一頁
    </Link>
  );
}

/** 包住正式詳細頁：隱藏其原本的「← 返回…」連結，改放 `DemoBackLink` */
function DetailWithBackLink({ listPath, listLabel, children }: { listPath: string; listLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<HTMLAnchorElement>('a.wiki-link').forEach(a => {
      if (a.textContent?.startsWith('← 返回')) a.style.display = 'none';
    });
  }, [location]);
  return (
    <div>
      <DemoBackLink listPath={listPath} listLabel={listLabel} />
      <div ref={ref}>{children}</div>
    </div>
  );
}

function DemoRoutes() {
  return (
    <Routes>
      <Route path="/wiki/crafting" element={<CraftingPagePreview />} />
      <Route path="/wiki/items" element={<ItemsPage />} />
      <Route path="/wiki/items/:itemName" element={<DetailWithBackLink listPath="/wiki/items" listLabel="返回道具總表"><ItemsPage /></DetailWithBackLink>} />
      <Route path="/wiki/monsters" element={<MonstersPage />} />
      <Route path="/wiki/monsters/:monsterName" element={<DetailWithBackLink listPath="/wiki/monsters" listLabel="返回怪物列表"><MonstersPage /></DetailWithBackLink>} />
      <Route path="/wiki/maps" element={<MapsPage />} />
      <Route path="/wiki/maps/:areaId" element={<DetailWithBackLink listPath="/wiki/maps" listLabel="返回地圖總覽"><MapsPage /></DetailWithBackLink>} />
      <Route path="/wiki/weapons/*" element={<WeaponsPage />} />
      <Route path="/wiki/armor/*" element={<ArmorPage />} />
      <Route path="*" element={<p className="wiki-empty">demo 未接這一頁</p>} />
    </Routes>
  );
}

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <code>{decodeURIComponent(pathname + search)}</code>;
}

const ENTRY_POINTS = [
  { label: '鐵匠鋪（從這裡點材料／成品）', path: '/wiki/crafting' },
  { label: '直接開啟道具詳細頁', path: `/wiki/items/${encodeURIComponent('首領蜥鱗')}` },
  { label: '直接開啟怪物詳細頁', path: `/wiki/monsters/${encodeURIComponent('哥布林')}` },
];

function Demo() {
  const [entry, setEntry] = useState({ path: ENTRY_POINTS[0].path, n: 0 });
  return (
    <MemoryRouter key={entry.n} initialEntries={[entry.path]}>
      <div className="demo-bar">
        <span>起始頁（模擬用網址直接開啟，沒有站內上一頁）：</span>
        {ENTRY_POINTS.map(p => (
          <button key={p.path} type="button" className="affix-cat-chip" onClick={() => setEntry(prev => ({ path: p.path, n: prev.n + 1 }))}>
            {p.label}
          </button>
        ))}
        <span className="demo-path">目前：<CurrentPath /></span>
      </div>
      <DemoRoutes />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
