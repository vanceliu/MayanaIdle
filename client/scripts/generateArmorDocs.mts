/**
 * 防具設計文件產生器 —— 從 `equipmentSeeds.ts` 產生 `docs/design/06-equipment-armor.md`。
 *
 * 與 `generateWeaponDocs.mts` 同樣的原則：**seed 是唯一真實來源**，文件只是可讀的檢視。
 * 改版前這份文件手寫且早已脫節（列 12 頂頭盔，seed 裡有 62 件）。
 *
 * 用法：cd client && npx vite-node scripts/generateArmorDocs.mts
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { getTierGroup } from '../src/models/equipmentTier';
import type { EquipmentTemplate, EquipmentTier } from '../src/models/equipment';

const DOC = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/design/06-equipment-armor.md');

const SLOTS = ['helmet', 'chest', 'gloves', 'boots', 'belt', 'necklace', 'ring1'] as const;
const SLOT_ZH: Record<string, string> = {
  helmet: '頭盔', chest: '胸甲', gloves: '手套', boots: '鞋子',
  belt: '腰帶', necklace: '項鍊', ring1: '戒指',
};
const CLASS_ZH: Record<string, string> = {
  knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊',
};
const MATERIAL_ZH: Record<string, string> = {
  wood: '木', iron: '鐵', silver: '銀', mithril: '米索利', dragon: '龍', orichalcum: '奧里哈魯根',
};

const acquireOf = (tier: EquipmentTier) =>
  tier === 1 ? '新手裝' : tier <= 3 ? '商店' : tier <= 5 ? '鐵匠製作' : tier === 6 ? '怪物掉落' : 'Boss 掉落';

const classesOf = (t: EquipmentTemplate) =>
  t.requiredClass?.length ? t.requiredClass.map(c => CLASS_ZH[c] ?? c).join('／') : '**共用**';

/** 依附加素質反推定位（§ 6A.8.8），純粹為了文件可讀性 */
function roleOf(t: EquipmentTemplate): string {
  if (t.bonusAttributes) return '屬性';
  if (t.hpRegen || t.mpRegen || t.bonusHp || t.bonusMp) return '續戰';
  return '防禦';
}

const num = (v: number | undefined) => (v ? String(v) : '—');

function craftOf(t: EquipmentTemplate): string {
  if (t.buyPrice) return `${t.buyPrice.toLocaleString()}G`;
  if (!t.craftGold) return '—';
  const mats = (t.craftMaterials ?? []).map(m => `${m.name}×${m.amount}`).join('、');
  return `${t.craftGold.toLocaleString()}G<br>${mats}`;
}

const armors = EQUIPMENT_SEEDS.filter(t => t.type === 'armor');
const out: string[] = [
  '# 防具與飾品列表',
  '',
  '> **本檔案由 `client/scripts/generateArmorDocs.mts` 從 `equipmentSeeds.ts` 產生，請勿手改。**',
  '> 防禦值與附加素質由 `client/scripts/rebalanceArmorDefense.mts` 依 `06-equipment-balance.md`',
  '> § 6A.8.7／§ 6A.8.8 的目標表統一產生；要調整請改目標表後重跑，不要動個別數值。',
  '',
  `全部 ${armors.length} 件。「定位」欄見 § 6A.8.8：防禦型打滿防禦目標、`,
  '續戰型換回血回魔與 HP／MP、屬性型換額外屬性。',
  '',
];

for (const slot of SLOTS) {
  const items = armors.filter(t => t.slot === slot || (slot === 'ring1' && t.slot === 'ring2'));
  if (!items.length) continue;
  out.push(`## ${SLOT_ZH[slot]}（${items.length} 件）`, '');

  const byTier = new Map<number, EquipmentTemplate[]>();
  for (const t of items) {
    const tier = t.tier ?? 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(t);
  }

  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const list = byTier.get(tier)!.sort((a, b) => (b.defense ?? 0) - (a.defense ?? 0));
    const group = tier >= 1 ? getTierGroup(tier as EquipmentTier) : '新手';
    out.push(`### 裝備Tier ${tier}（${group}・${tier >= 1 ? acquireOf(tier as EquipmentTier) : '新手裝'}）`, '');
    if (slot === 'belt') {
      // 腰帶的價值在背包格數與負重，不是防禦（§ 6A.8.10），欄位另外排
      out.push('| 名稱 | 背包格 | 負重加成 | 額外屬性 | 防禦 | 安定值 | 適用職業 | 重量 | 材質 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | +${t.bonusBagSlots ?? 0} | +${(t.bonusWeight ?? 0).toLocaleString()} | `
          + `${t.bonusStats ?? '—'} | ${t.defense ?? 0} | ${t.stability ?? 0} | ${classesOf(t)} | `
          + `${t.weight ?? 0} | ${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${craftOf(t)} |`);
      }
    } else if (slot === 'necklace' || slot === 'ring1') {
      out.push('| 名稱 | 回血 | 回魔 | HP | MP | 額外屬性 | 防禦 | 安定值 | 適用職業 | 重量 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | ${num(t.hpRegen)} | ${num(t.mpRegen)} | ${num(t.bonusHp)} | ${num(t.bonusMp)} | `
          + `${t.bonusStats ?? '—'} | ${t.defense ?? 0} | ${t.stability ?? 0} | ${classesOf(t)} | `
          + `${t.weight ?? 0} | ${craftOf(t)} |`);
      }
    } else {
      out.push('| 名稱 | 定位 | 防禦 | 回血 | 回魔 | HP | MP | 額外屬性 | 安定值 | 適用職業 | 重量 | 材質 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | ${roleOf(t)} | ${t.defense ?? 0} | ${num(t.hpRegen)} | ${num(t.mpRegen)} | `
          + `${num(t.bonusHp)} | ${num(t.bonusMp)} | ${t.bonusStats ?? '—'} | ${t.stability ?? 0} | ${classesOf(t)} | `
          + `${t.weight ?? 0} | ${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${craftOf(t)} |`);
      }
    }
    out.push('');
  }
}

writeFileSync(DOC, out.join('\n'), 'utf-8');
console.log(`✓ 06-equipment-armor.md（${armors.length} 件）`);
