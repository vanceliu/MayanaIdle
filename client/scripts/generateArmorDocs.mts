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
import { getItemById } from '../src/models/items';
import { ATTRIBUTE_KEYS, ATTRIBUTE_NAMES_ZH } from '../src/models/character';
import { ARMOR_LINE_ATTRIBUTES } from '../src/models/equipment';
import type { EquipmentTemplate, EquipmentTier } from '../src/models/equipment';

const DOC = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/design/06-equipment-armor.md');

const SLOTS = ['helmet', 'chest', 'shirt', 'cloak', 'gloves', 'boots', 'leftHand', 'belt', 'necklace', 'ring1'] as const;
const SLOT_ZH: Record<string, string> = {
  helmet: '頭盔', chest: '胸甲', shirt: '上衣', cloak: '斗篷', gloves: '手套', boots: '鞋子',
  leftHand: '左手（盾牌／魔導書／臂甲）', belt: '腰帶', necklace: '項鍊', ring1: '戒指',
};
const CLASS_ZH: Record<string, string> = {
  knight: '騎士', elf: '妖精', elementalist: '元素師', priest: '牧師', thief: '盜賊',
};
const MATERIAL_ZH: Record<string, string> = {
  wood: '木', iron: '鐵', silver: '銀', mithril: '米索利', dragon: '龍', orichalcum: '奧里哈魯根',
};

const acquireOf = (tier: EquipmentTier) =>
  tier === 1 ? '新手裝' : tier <= 3 ? '商店' : tier <= 5 ? '鐵匠製作' : tier === 6 ? '怪物掉落' : 'Boss 掉落';

/** 走素質需求的防具沒有職業限制，該欄留白；只有 T1 新手裝與武器仍列職業 */
const classesOf = (t: EquipmentTemplate) =>
  t.requiredClass?.length ? t.requiredClass.map(c => CLASS_ZH[c] ?? c).join('／')
    : t.requiredAttributes ? '**全職業**' : '**共用**';

const LINE_ZH: Record<string, string> = { heavy: '重', light: '輕', robe: '布' };
const lineOf = (t: EquipmentTemplate) => (t.line ? LINE_ZH[t.line] : '—');

/** 素質需求（§ 6A.8.8）。新手裝無需求，顯示職業限制那一欄即可 */
function reqOf(t: EquipmentTemplate): string {
  const req = t.requiredAttributes;
  if (!req) return '—';
  // 主需求排前面，第二需求排後面 —— 依路線取序，不用 ATTRIBUTE_KEYS 的固定順序
  const { primary, secondary } = ARMOR_LINE_ATTRIBUTES[t.line ?? 'heavy'];
  const order = [primary, secondary, ...ATTRIBUTE_KEYS];
  return [...new Set(order)]
    .filter(k => req[k])
    .map(k => `${ATTRIBUTE_NAMES_ZH[k]} ${req[k]}`)
    .join('／') || '—';
}

const num = (v: number | undefined) => (v ? String(v) : '—');


/** 素材與前置一律存 id，顯示名由 id 反查（`99-ai-constraints.md` § 99.1 第 3、7 條） */
const matName = (id: number) => getItemById(id)?.name ?? `#${id}`;

function craftOf(t: EquipmentTemplate): string {
  if (t.buyPrice) return `${t.buyPrice.toLocaleString()}G`;
  if (!t.craftMaterials?.length) return '—';
  return t.craftMaterials.map(m => `${matName(m.itemId)}×${m.amount}`).join('、');
}

// 左手三種（盾牌／魔導書／臂甲）是防具，不是武器 —— 它們的防禦計入
// 全套防禦目標（§ 6A.8.8），因此列在本檔而非 06-equipment-weapons-*.md
const OFFHAND_TYPES = new Set(['shield', 'magicBook', 'armGuard']);
const armors = EQUIPMENT_SEEDS.filter(t => t.type === 'armor' || OFFHAND_TYPES.has(String(t.type)));
const out: string[] = [
  '# 防具與飾品列表',
  '',
  '> **本檔案由產生器輸出，請勿手改。**',
  '> 基礎防禦與素質需求依 `06-equipment.md` § 6A.8.8 的目標表統一產生；',
  '> 要調整請改目標表後重跑，不要動個別數值。',
  '',
  `全部 ${armors.length} 件。防具**不限職業**，每（部位 × 階級）布／輕／重各一件，`,
  '誰穿得上看素質需求；需求未滿足時仍可裝備，但該件的詞綴全部凍結。',
  '',
  '表上的「防禦」是**基礎固定值**。實際防禦另加實例生成時抽的隨機額外（+0~+2）',
  '與強化等級，安定值同樣逐件抽 4~6（`06-equipment.md` § 6.10）。',
  '',
  '回血／回魔／額外屬性改由詞綴提供（`07-affix.md` § 7.3.1），不再列於此表。',
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
      // 腰帶的價值在背包格數與負重，不是防禦（`35-inventory-constraints.md` § 35.1），欄位另外排
      out.push('| 名稱 | 背包格 | 負重加成 | 額外屬性 | 防禦 | 安定值 | 適用職業 | 重量 | 材質 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | +${t.bonusBagSlots ?? 0} | +${(t.bonusWeight ?? 0).toLocaleString()} | `
          + `${t.bonusStats ?? '—'} | ${t.defense ?? 0} | ${t.stability ?? 0} | ${classesOf(t)} | `
          + `${t.weight ?? 0} | ${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${craftOf(t)} |`);
      }
    } else if (slot === 'leftHand') {
      // 左手三種各對應一條路線：盾牌＝重、臂甲＝輕、魔導書＝布（§ 6A.8.8）
      out.push('| 名稱 | 類型 | 路線 | 防禦 | 素質需求 | 適用職業 | 格擋率 | 魔法攻擊 | 重量 | 材質 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|---|---|---|');
      const OFF_ZH: Record<string, string> = { shield: '盾牌', magicBook: '魔導書', armGuard: '臂甲' };
      for (const t of list) {
        out.push(`| ${t.name} | ${OFF_ZH[String(t.type)] ?? t.type} | ${lineOf(t)} | ${t.defense ?? 0} | `
          + `${reqOf(t)} | ${classesOf(t)} | ${t.blockRate ? `${t.blockRate}%` : '—'} | ${t.magicAttack ?? '—'} | `
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
      // T1 新手裝維持職業專屬且無素質需求，因此兩欄並存
      out.push('| 名稱 | 路線 | 防禦 | 素質需求 | 適用職業 | 重量 | 材質 | 價格／製作 |');
      out.push('|---|---|---|---|---|---|---|---|');
      for (const t of list) {
        out.push(`| ${t.name} | ${lineOf(t)} | ${t.defense ?? 0} | ${reqOf(t)} | ${classesOf(t)} | `
          + `${t.weight ?? 0} | ${MATERIAL_ZH[t.material ?? ''] ?? '—'} | ${craftOf(t)} |`);
      }
    }
    out.push('');
  }
}

writeFileSync(DOC, out.join('\n'), 'utf-8');
console.log(`✓ 06-equipment-armor.md（${armors.length} 件）`);
