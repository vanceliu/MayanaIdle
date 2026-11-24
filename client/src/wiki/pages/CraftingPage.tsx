import { useMemo } from 'react';
import { useWeaponList, useArmorList, getWikiEquipmentPath, getEquipmentById } from '../hooks/useWikiData';
import { Link, useSearchParams } from 'react-router-dom';
import { getItemById } from '../../models/items';
import { CRAFTED_GEAR_SUFFIX, MIMIC_GEAR_SUFFIX, UNIQUE_CRAFTED_GEAR_SUFFIX, type CraftMaterial, type EquipmentTemplate } from '../../models/equipment';
import { formatCraftAffixTierRanges, formatCraftAffixTierWeights } from '../../models/affix';
import { DISMANTLE_RETURN_RATE, UNIQUE_CRAFTED_DISMANTLE_RETURN_RATE } from '../../systems/crafting';
import { UNIQUE_CRAFT_TIERS, formatUniqueCraftAffixTiers, isUniqueCraftTier } from '../../models/uniqueCraft';
import { ABILITY_CRYSTAL_COST_PER_TIER } from '../../models/abilityCrystal';
import { ABILITY_MIN_TIER } from '../../models/ability';
import '../components/WikiTable.css';

// `06-equipment-acquire.md` § 6A.1：中階 T4~T5 / 高階 T6~T7
const TIER_LABELS: Record<number, string> = {
  4: '裝備Tier 4（中階）',
  5: '裝備Tier 5（中階）',
  6: '裝備Tier 6（高階）',
  7: '裝備Tier 7（高階）',
};

/** 配方表模式：一般製作 `craftMaterials`／獨特製作 `uniqueCraftMaterials`（`06-equipment-acquire.md` § 6A.3.1） */
type CraftMode = 'normal' | 'unique';

const noteStyle = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--fs-sm)',
  lineHeight: 1.7,
  marginTop: 10,
} as const;

const TYPE_LABELS: Record<string, string> = {
  sword: '單手劍', dagger: '匕首', axe: '單手斧', mace: '鈍器',
  staff: '法杖', bow: '弓', twoHandSword: '雙手劍', twoHandAxe: '雙手斧',
  twoHandStaff: '雙手法杖', dualBlade: '雙刀', claw: '爪',
  shield: '盾牌', magicBook: '魔導書', armGuard: '臂甲',
};

/** `type: 'armor'` 依部位標示 */
const ARMOR_SLOT_LABELS: Record<string, string> = {
  helmet: '頭盔', chest: '盔甲', shirt: '上衣', cloak: '斗篷', belt: '腰帶',
  gloves: '手套', boots: '鞋子', necklace: '項鍊', ring1: '戒指', ring2: '戒指',
};

export function CraftingPage() {
  const weapons = useWeaponList();
  const armors = useArmorList();
  const [params, setParams] = useSearchParams();
  const mode: CraftMode = params.get('mode') === 'unique' ? 'unique' : 'normal';
  const tierFilter = params.get('tier') ?? 'all';
  const search = params.get('q') ?? '';
  const setParam = (key: string, value: string, defaultValue: string) => setParams(prev => {
    const next = new URLSearchParams(prev);
    if (value === defaultValue) next.delete(key); else next.set(key, value);
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
    return list.sort((a, b) => {
      const ta = a.tier ?? 0;
      const tb = b.tier ?? 0;
      if (ta !== tb) return ta - tb;
      return (a.name > b.name) ? 1 : -1;
    });
  }, [weapons, armors, mode, tierFilter, search]);

  return (
    <div>
      <h2 className="wiki-page-title">鐵匠鋪製作</h2>
      <p style={noteStyle}>
        製作品名稱後標 <strong>{CRAFTED_GEAR_SUFFIX}</strong>：固定 4 條詞綴、不會出特殊詞綴，
        Tier 依裝備階級（{formatCraftAffixTierRanges()}；{formatCraftAffixTierWeights()}），<strong>不可使用任何印記</strong>。
        製作費依階級（見下表），必定成功。
      </p>
      <p style={noteStyle}>
        <strong>隨機技能</strong>：製作武器、項鍊、戒指時必須指定一種，可選該組的共通池與製作角色的職業池（該職業能裝備這件時），數值取最弱值，不另收費。
      </p>
      <p style={noteStyle}>
        <strong>取用倉庫</strong>：素材與前置武器可直接使用個人倉庫與帳號倉庫的存量，不必先取出；公會倉庫不算，製作費只算身上的金幣。
        素材依背包 → 個人倉庫 → 帳號倉庫的順序扣，滑鼠移到素材上可看各處存量。前置武器須在挑選視窗指定要用哪一件。
      </p>
      <p style={noteStyle}>
        <strong>獨特製作</strong>：鐵匠鋪「獨特製作」分頁，配方同一般製作（T4～T6）。前置改為<strong>同一款裝備 ×1</strong>
        （掉落品、商店品、{CRAFTED_GEAR_SUFFIX} 可；{UNIQUE_CRAFTED_GEAR_SUFFIX} 與 {MIMIC_GEAR_SUFFIX} 不可），材料改為獨特魔物的獨特材料與 Boss 專屬素材
        （配方見下表切到「獨特製作」），製作費同一般製作，製作前會確認要消耗的那件。
        產物名稱後標 <strong>{UNIQUE_CRAFTED_GEAR_SUFFIX}</strong>：固定 4 條詞綴、不重複、不出特殊詞綴，
        Tier 依裝備階級（{UNIQUE_CRAFT_TIERS.map(t => `T${t} 製作品 ${formatUniqueCraftAffixTiers(t)}`).join('、')}），數值在該 Tier 範圍內隨機；
        武器、項鍊、戒指必帶隨機技能，種類與數值同掉落品（職業池取製作角色）。品質 0%，<strong>不可使用任何印記</strong>、不可技能更換，強化卷軸照常可用。
      </p>
      <p style={noteStyle}>
        <strong>拆解</strong>：有配方的裝備（製作品或同款掉落品）可在鐵匠鋪拆回材料，
        每種材料退還 {DISMANTLE_RETURN_RATE * 100}%（無條件進位），前置武器與製作費不退還；
        {UNIQUE_CRAFTED_GEAR_SUFFIX} 製作品退還一般配方的 {UNIQUE_CRAFTED_DISMANTLE_RETURN_RATE * 100}%，獨特材料不退。
        帶隨機技能的掉落品即使沒有配方也能拆，留下<strong>技能結晶</strong>（製作品與商店裝不會留下）；{MIMIC_GEAR_SUFFIX} 擬態品不可拆解。
      </p>
      <p style={noteStyle}>
        <strong>技能結晶與技能更換</strong>：結晶依技能種類存在角色身上，不佔背包、套用不消耗；同種技能再拆到時，每個參數各取較好的一方。
        在鐵匠鋪把結晶套到背包中未裝備、T{ABILITY_MIN_TIER} 以上的武器、項鍊或戒指（{CRAFTED_GEAR_SUFFIX}／{UNIQUE_CRAFTED_GEAR_SUFFIX} 製作品與 {MIMIC_GEAR_SUFFIX} 擬態品除外），
        原本的隨機技能會被取代；武器技能只套武器、飾品技能只套項鍊與戒指。費用 {ABILITY_CRYSTAL_COST_PER_TIER.toLocaleString()} × 裝備階級。
      </p>
      <div className="wiki-chips" role="tablist" aria-label="製作類型" style={{ marginTop: 20 }}>
        <button type="button" role="tab" aria-selected={mode === 'normal'} className={`wiki-chip${mode === 'normal' ? ' active' : ''}`} onClick={() => setMode('normal')}>
          一般製作
        </button>
        <button type="button" role="tab" aria-selected={mode === 'unique'} className={`wiki-chip${mode === 'unique' ? ' active' : ''}`} onClick={() => setMode('unique')}>
          獨特製作
        </button>
      </div>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">全部階級</option>
          {tiers.map(t => <option key={t} value={t}>{TIER_LABELS[t] ?? `裝備Tier ${t}`}</option>)}
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
            {craftItems.map(item => (
              <CraftRow key={item.name} item={item} mode={mode} />
            ))}
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
        {materials?.map(mat => (
          <CraftMaterialLink key={mat.itemId} itemId={mat.itemId} amount={mat.amount} />
        )) || '-'}
      </td>
    </tr>
  );
}

function PrerequisiteCell({ item }: { item: EquipmentTemplate }) {
  if (!item.craftPrerequisiteWeapon) return <>-</>;
  // 名稱只用於顯示，一律由 templateId 反查（§ 99.1 第 3 條）
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
      <Link className="wiki-link" to={`/wiki/items/${encodeURIComponent(name)}`}>
        {name}
      </Link>
      x{amount}
    </span>
  );
}
