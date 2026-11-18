import { useState, useMemo } from 'react';
import { useWeaponList, useArmorList, getWikiEquipmentPath, getEquipmentById } from '../hooks/useWikiData';
import { Link } from 'react-router-dom';
import { getItemById } from '../../models/items';
import { CRAFTED_GEAR_SUFFIX, MIMIC_GEAR_SUFFIX } from '../../models/equipment';
import { formatCraftAffixTierRanges, formatCraftAffixTierWeights } from '../../models/affix';
import { DISMANTLE_RETURN_RATE } from '../../systems/crafting';
import { ABILITY_CRYSTAL_COST_PER_TIER } from '../../models/abilityCrystal';
import { ABILITY_MIN_TIER } from '../../models/ability';
import '../components/WikiTable.css';

// `06-equipment-acquire.md` § 6A.1：製作品階級為 T4~T7（中階 T4~T5 / 高階 T6~T7）
const TIER_LABELS: Record<number, string> = {
  4: '裝備Tier 4（中階）',
  5: '裝備Tier 5（中階）',
  6: '裝備Tier 6（高階）',
  7: '裝備Tier 7（高階）',
};

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
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const craftItems = useMemo(() => {
    const all = [...weapons, ...armors].filter(e => e.acquireType === 'craft');
    let list = all;
    if (tierFilter !== 'all') list = list.filter(e => e.tier === Number(tierFilter));
    if (search) list = list.filter(e => e.name.includes(search));
    return list.sort((a, b) => {
      const ta = a.tier ?? 0;
      const tb = b.tier ?? 0;
      if (ta !== tb) return ta - tb;
      return (a.name > b.name) ? 1 : -1;
    });
  }, [weapons, armors, tierFilter, search]);

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
        <strong>拆解</strong>：有配方的裝備（製作品或同款掉落品）可在鐵匠鋪拆回材料，
        每種材料退還 {DISMANTLE_RETURN_RATE * 100}%（無條件進位），前置武器與製作費不退還。
        帶隨機技能的掉落品即使沒有配方也能拆，留下<strong>技能結晶</strong>（製作品與商店裝不會留下）；{MIMIC_GEAR_SUFFIX} 擬態品不可拆解。
      </p>
      <p style={noteStyle}>
        <strong>技能結晶與技能更換</strong>：結晶依技能種類存在角色身上，不佔背包、套用不消耗；同種技能再拆到時，每個參數各取較好的一方。
        在鐵匠鋪把結晶套到背包中未裝備、T{ABILITY_MIN_TIER} 以上的武器、項鍊或戒指（{CRAFTED_GEAR_SUFFIX} 製作品與 {MIMIC_GEAR_SUFFIX} 擬態品除外），
        原本的隨機技能會被取代；武器技能只套武器、飾品技能只套項鍊與戒指。費用 {ABILITY_CRYSTAL_COST_PER_TIER.toLocaleString()} × 裝備階級。
      </p>
      <div className="wiki-filters">
        <select className="wiki-filter-select" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="all">全部階級</option>
          <option value="4">裝備Tier 4（中階）</option>
          <option value="5">裝備Tier 5（中階）</option>
          <option value="6">裝備Tier 6（高階）</option>
          <option value="7">裝備Tier 7（高階）</option>
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
              <th>前置武器</th>
              <th>所需材料</th>
            </tr>
          </thead>
          <tbody>
            {craftItems.map(item => (
              <CraftRow key={item.name} item={item} />
            ))}
          </tbody>
        </table>
        {craftItems.length === 0 && <p className="wiki-empty">無符合條件的配方</p>}
      </div>
    </div>
  );
}

function CraftRow({ item }: { item: ReturnType<typeof useWeaponList>[number] }) {
  const detailPath = getWikiEquipmentPath(item.name);

  return (
    <tr>
      <td>
        <Link className="wiki-link" to={detailPath}>{item.name}</Link>
      </td>
      <td>{item.type === 'armor' ? ARMOR_SLOT_LABELS[item.slot] ?? item.slot : TYPE_LABELS[item.type] ?? item.type}</td>
      <td>{item.tier != null ? TIER_LABELS[item.tier] ?? `裝備Tier ${item.tier}` : '-'}</td>
      <td>{(item.craftGold ?? 0).toLocaleString()}G</td>
      <td>
        {item.craftPrerequisiteWeapon
          ? (() => {
              // 名稱只用於顯示，一律由 templateId 反查（§ 99.1 第 3 條）
              const { templateId, quantity } = item.craftPrerequisiteWeapon;
              const prereq = getEquipmentById(templateId);
              if (!prereq) return `#${templateId} ×${quantity}`;
              return (
                <span>
                  <Link className="wiki-link" to={getWikiEquipmentPath(prereq.name)}>
                    {prereq.name}
                  </Link>
                  ×{quantity}
                </span>
              );
            })()
          : '-'}
      </td>
      <td>
        {item.craftMaterials?.map(mat => (
          <CraftMaterialLink key={mat.itemId} itemId={mat.itemId} amount={mat.amount} />
        )) || '-'}
      </td>
    </tr>
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
