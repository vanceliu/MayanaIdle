/**
 * 武器／防具設計文件產生器 —— 從 `equipmentSeeds.ts` 產生 `docs/design/06-equipment-weapons-*.md`。
 *
 * **seed 是唯一真實來源**，文件只是可讀的檢視。流程是：
 *   改 seed → 跑本腳本 → 讀文件檢查 → 再改 seed
 * 不要反過來手改文件，那會讓兩邊脫節（改版前就是這樣壞掉的：
 * 13 筆 craftTier 在文件與 seed 之間不一致）。
 *
 * 用法：cd client && npx vite-node scripts/generateWeaponDocs.mts
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { getTierGroup } from '../src/models/equipmentTier';
import type { EquipmentTemplate, EquipmentTier, WeaponType } from '../src/models/equipment';

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/design');

const TYPE_ZH: Record<string, string> = {
  sword: '單手劍', dagger: '匕首', axe: '單手斧', mace: '單手鈍器', staff: '法杖',
  bow: '弓', twoHandSword: '雙手劍', twoHandAxe: '雙手斧', twoHandStaff: '雙手法杖',
  dualBlade: '雙刀', claw: '鋼爪', shield: '盾牌', magicBook: '魔導書', armGuard: '臂甲',
};
/** 檔名對應現有的 `06-equipment-weapons-*.md` 命名 */
const TYPE_FILE: Record<string, string> = {
  armGuard: 'armguard',
  sword: 'onesword', dagger: 'dagger', axe: 'oneaxe', mace: 'mace', staff: 'staff',
  bow: 'bow', twoHandSword: 'twosword', twoHandAxe: 'twoaxe', twoHandStaff: 'twostaff',
  dualBlade: 'dualblade', claw: 'claw', shield: 'shield', magicBook: 'magicbook',
};
const CLASS_ZH: Record<string, string> = {
  knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊',
};
const MATERIAL_ZH: Record<string, string> = {
  wood: '木', iron: '鐵', silver: '銀', mithril: '米索利', dragon: '龍', orichalcum: '奧里哈魯根',
};
/** 大怪傷害高於小怪的類型，表格以大怪傷害為主軸（§ 6A.4） */
const LARGE_FIRST = new Set(['mace', 'twoHandAxe']);

const acquireOf = (tier: EquipmentTier) =>
  tier === 1 ? '新手裝' : tier <= 3 ? '商店' : tier <= 5 ? '鐵匠製作' : tier === 6 ? '怪物掉落' : 'Boss 掉落';

const classesOf = (t: EquipmentTemplate) =>
  t.requiredClass?.length ? t.requiredClass.map(c => CLASS_ZH[c] ?? c).join('／') : '**共用**';

function bonusOf(t: EquipmentTemplate): string {
  const parts: string[] = [];
  if (t.bonusStats) parts.push(t.bonusStats);
  if (t.bonusHp) parts.push(`HP+${t.bonusHp}`);
  if (t.bonusMp) parts.push(`MP+${t.bonusMp}`);
  if (t.hpRegen) parts.push(`回血+${t.hpRegen}`);
  if (t.mpRegen) parts.push(`回魔+${t.mpRegen}`);
  if (t.bonusWeight) parts.push(`負重+${t.bonusWeight}`);
  return parts.join('、') || '—';
}

function craftOf(t: EquipmentTemplate): string {
  if (!t.craftGold) return '—';
  const mats = (t.craftMaterials ?? []).map(m => `${m.name}×${m.amount}`).join('、');
  const pre = t.craftPrerequisiteWeapon
    ? `<br>前置：${t.craftPrerequisiteWeapon.name}×${t.craftPrerequisiteWeapon.quantity}`
    : '';
  return `${t.craftGold.toLocaleString()}G<br>${mats}${pre}`;
}

function renderType(type: WeaponType, items: EquipmentTemplate[]): string {
  const zh = TYPE_ZH[type] ?? type;
  const largeFirst = LARGE_FIRST.has(type);
  const out: string[] = [];

  out.push(`# ${zh}（${items.length} 把）`);
  out.push('');
  out.push('> **本檔案由 `client/scripts/generateWeaponDocs.mts` 從 `equipmentSeeds.ts` 產生，請勿手改。**');
  out.push('> 要調整數值請改 seed 後重跑腳本；設計規則見 `06-equipment-balance.md` § 6A.8。');
  out.push('');
  if (largeFirst) out.push(`${zh}的大怪傷害高於小怪傷害，以大怪傷害為排序主軸。`, '');

  const byTier = new Map<number, EquipmentTemplate[]>();
  for (const t of items) {
    const tier = t.tier ?? 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier)!.push(t);
  }

  for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
    const list = byTier.get(tier)!;
    const group = tier >= 1 ? getTierGroup(tier as EquipmentTier) : '新手';
    out.push(`## 裝備Tier ${tier}（${group}・${tier >= 1 ? acquireOf(tier as EquipmentTier) : '新手裝'}）`);
    out.push('');

    if (type === 'shield' || type === 'armGuard') {
      out.push('| 武器名稱 | 防禦 | 格擋率 | 安定值 | 適用職業 | 材質 | 重量 | 附加 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | ${t.defense ?? 0} | ${t.blockRate ?? 0}% | ${t.stability ?? 0} | ${classesOf(t)} | `
          + `${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${t.weight ?? 0} | ${bonusOf(t)} | `
          + `${t.buyPrice ? `${t.buyPrice.toLocaleString()}G` : craftOf(t)} |`);
      }
    } else if (type === 'magicBook') {
      out.push('| 武器名稱 | 魔法攻擊 | 安定值 | 適用職業 | 重量 | 附加 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | +${t.magicAttack ?? 0} | ${t.stability ?? 0} | ${classesOf(t)} | ${t.weight ?? 0} | `
          + `${bonusOf(t)} | ${t.buyPrice ? `${t.buyPrice.toLocaleString()}G` : craftOf(t)} |`);
      }
    } else {
      const d1 = largeFirst ? '大怪傷害' : '小怪傷害';
      const d2 = largeFirst ? '小怪傷害' : '大怪傷害';
      out.push(`| 武器名稱 | ${d1} | ${d2} | 攻擊成功 | 額外攻擊 | 安定值 | 適用職業 | 材質 | 重量 | 附加 | 價格／製作 |`);
      out.push('|---|---|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        const a = largeFirst ? t.largeMonsterDamage : t.smallMonsterDamage;
        const b = largeFirst ? t.smallMonsterDamage : t.largeMonsterDamage;
        out.push(`| ${t.name} | ${a ?? 0} | ${b ?? 0} | ${t.attackSuccess ?? 0} | ${t.extraAttack ?? 0} | `
          + `${t.stability ?? 0} | ${classesOf(t)} | ${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${t.weight ?? 0} | ${bonusOf(t)} | `
          + `${t.buyPrice ? `${t.buyPrice.toLocaleString()}G` : craftOf(t)} |`);
      }
    }
    out.push('');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- 產出

const weapons = EQUIPMENT_SEEDS.filter(t => t.type !== 'armor');
const byType = new Map<string, EquipmentTemplate[]>();
for (const t of weapons) {
  if (!byType.has(t.type)) byType.set(t.type, []);
  byType.get(t.type)!.push(t);
}

const indexRows: string[] = [];
for (const [type, items] of byType) {
  const file = TYPE_FILE[type];
  if (!file) {
    console.warn(`略過未知武器類型：${type}`);
    continue;
  }
  items.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0)
    || (b.smallMonsterDamage ?? b.defense ?? b.magicAttack ?? 0) - (a.smallMonsterDamage ?? a.defense ?? a.magicAttack ?? 0));
  const path = `${DOCS}/06-equipment-weapons-${file}.md`;
  writeFileSync(path, renderType(type as WeaponType, items) + '\n', 'utf-8');
  const tiers = [...new Set(items.map(t => t.tier).filter(Boolean))].sort();
  indexRows.push(`| ${TYPE_ZH[type]} | ${items.length} 把 | T${tiers[0]}~T${tiers[tiers.length - 1]} | `
    + `[06-equipment-weapons-${file}.md](06-equipment-weapons-${file}.md) |`);
  console.log(`✓ ${TYPE_ZH[type]}（${items.length} 把）`);
}

const index = [
  '# 武器列表',
  '',
  '> **本檔案由 `client/scripts/generateWeaponDocs.mts` 從 `equipmentSeeds.ts` 產生，請勿手改。**',
  '> seed 是唯一真實來源：改 seed → 重跑腳本 → 讀文件檢查。',
  '> 設計規則（數量分配、素質曲線、走向）見 `06-equipment-balance.md` § 6A.8。',
  '',
  `全部 ${weapons.length} 把，依裝備Tier 由低到高排列。`,
  '',
  '| 武器類型 | 數量 | 階級範圍 | 文件 |',
  '|---|---|---|---|',
  ...indexRows,
  '',
].join('\n');
writeFileSync(`${DOCS}/06-equipment-weapons.md`, index, 'utf-8');
console.log(`\n索引已更新：共 ${weapons.length} 把`);
