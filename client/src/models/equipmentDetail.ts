/**
 * 裝備說明的數值列（`06-equipment.md`、`21-combat-formula.md` § 21.5）：攻擊、防禦到品質。
 * 遊戲 tooltip（`components/EquipmentInfo.tsx`）與管理介面角色查詢（`server/src/adminItemCells.ts`）共用。
 */
import { CLASS_NAMES_ZH } from './character';
import { DEFENSE_BONUS_MAX, formatMagicAttack, getWeaponRange, isRangedWeapon, type EquipmentInstance } from './equipment';

export const MATERIAL_NAMES: Record<string, string> = {
  wood: '木',
  iron: '鐵',
  silver: '銀',
  mithril: '米索利',
  dragon: '龍材質',
  orichalcum: '奧里哈魯根',
};

export function getClassDisplay(requiredClass?: string[]): string {
  if (!requiredClass || requiredClass.length === 0) return '全職業';
  return requiredClass.map(c => CLASS_NAMES_ZH[c as keyof typeof CLASS_NAMES_ZH] ?? c).join('、');
}

function isStaff(type: string): boolean {
  return type === 'staff' || type === 'twoHandStaff';
}

export interface DetailPart {
  text: string;
  /** 隨機額外防禦為最大值（`06-equipment.md` § 21.5） */
  maxRoll?: boolean;
  title?: string;
}

export interface DetailRow {
  key: string;
  parts: DetailPart[];
}

/** `compact`：裝備欄的精簡模式，不列材質與重量 */
export function equipmentStatRows(item: EquipmentInstance, compact = false): DetailRow[] {
  const isWeapon = !!(item.smallMonsterDamage || item.largeMonsterDamage);
  const enhancement = item.enhancement ?? 0;
  const enh = enhancement > 0 ? `+${enhancement}` : '';
  const totalAttackSuccess = (item.attackSuccess ?? 0) + Math.floor(enhancement / 2);
  const totalMagicAttack = Math.round(((item.magicAttack ?? 0) + (isStaff(item.type) ? Math.floor(enhancement / 2) : 0)) * 10) / 10;
  const defenseBonus = item.defenseBonus ?? 0;
  const defenseTotal = (item.defense ?? 0) + defenseBonus + enhancement;
  const rows: DetailRow[] = [];
  const add = (key: string, text: string) => rows.push({ key, parts: [{ text }] });

  if (isWeapon) add('attack', `攻擊: ${item.smallMonsterDamage}${enh}/${item.largeMonsterDamage}${enh}`);
  /* § 21.5 防禦是三段：基礎 + 隨機額外(+0~+2) + 強化。基礎 0 的 T4 上衣照樣要顯示 */
  if (!isWeapon && defenseTotal > 0) {
    const maxRoll = defenseBonus >= DEFENSE_BONUS_MAX;
    rows.push({
      key: 'defense',
      parts: [
        { text: `防禦: ${item.defense ?? 0}` },
        ...(defenseBonus > 0 ? [{ text: `+${defenseBonus}`, maxRoll, title: maxRoll ? '隨機額外防禦為最大值' : '隨機額外防禦' }] : []),
        ...(enh ? [{ text: enh }] : []),
      ],
    });
  }
  if ((item.blockRate ?? 0) > 0) add('blockRate', `格擋率: ${item.blockRate}%`);
  /* 只有遠程武器標射程：近戰 1.5 是預設 */
  if (isWeapon && isRangedWeapon(item.type)) add('range', `射程: ${getWeaponRange(item.type)} 格`);
  if (isWeapon && totalAttackSuccess > 0) add('attackSuccess', `攻擊成功: +${totalAttackSuccess}`);
  if (isWeapon && (item.extraAttack ?? 0) > 0) add('extraAttack', `額外攻擊: +${item.extraAttack}`);
  /* 法杖：基底魔攻＋強化加成（§ 6.9）；其他裝備只有基底 */
  if (totalMagicAttack > 0) add('magicAttack', `魔法攻擊: +${formatMagicAttack(totalMagicAttack)}`);
  if ((item.bonusHp ?? 0) > 0) add('bonusHp', `HP+${item.bonusHp}`);
  if ((item.bonusMp ?? 0) > 0) add('bonusMp', `MP+${item.bonusMp}`);
  if ((item.hpRegen ?? 0) > 0) add('hpRegen', `回血+${item.hpRegen}`);
  if ((item.mpRegen ?? 0) > 0) add('mpRegen', `回魔+${item.mpRegen}`);
  if ((item.bonusBagSlots ?? 0) > 0) add('bonusBagSlots', `背包格子+${item.bonusBagSlots}`);
  /* 腰帶的負重加成（`35-inventory-constraints.md` § 35.2.1） */
  if ((item.bonusWeight ?? 0) > 0) add('bonusWeight', `負重+${item.bonusWeight}`);
  if (item.bonusStats) add('bonusStats', item.bonusStats);
  if (!compact && isWeapon && item.material) add('material', `材質: ${MATERIAL_NAMES[item.material] ?? item.material}`);
  if (!compact && (item.weight ?? 0) > 0) add('weight', `重量: ${item.weight}`);
  if (item.quality > 0) add('quality', `品質: ${item.quality}%`);
  return rows;
}
