import type { ReactNode } from 'react';
import { getItemById, type ItemCategory, type ItemDefinition } from '../models/items';
import { GroupedPicker, type PickerGroup } from './GroupedPicker';

/** 道具單選：依道具類別分組（`GroupedPicker`） */

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  potion: '藥水', scroll: '卷軸', material: '材料', dungeon: '副本道具', spellbook: '魔法書', other: '其他',
};

/** 依類別分組，組的順序為類別第一次出現的順序 */
export function itemPickerGroups(items: readonly ItemDefinition[]): PickerGroup<number>[] {
  const groups = new Map<ItemCategory, PickerGroup<number>>();
  for (const d of items) {
    const group = groups.get(d.category) ?? { key: d.category, label: CATEGORY_LABELS[d.category], options: [] };
    group.options.push({ value: d.id, label: d.name });
    groups.set(d.category, group);
  }
  return [...groups.values()];
}

export function ItemPicker({ label, items, value, onPick, onClear }: {
  label?: ReactNode;
  items: readonly ItemDefinition[];
  value: number | undefined;
  onPick: (itemId: number) => void;
  onClear?: () => void;
}) {
  const selected = value != null ? getItemById(value) : undefined;
  return (
    <GroupedPicker
      label={label}
      groups={itemPickerGroups(items)}
      value={value}
      buttonText={selected?.name ?? '未選擇'}
      emptyText="沒有符合的道具"
      onPick={onPick}
      onClear={onClear}
    />
  );
}
