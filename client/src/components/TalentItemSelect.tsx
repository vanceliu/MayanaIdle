import type { TalentItemPool } from '../models/talentParams';
import { talentItemOptions } from '../systems/talentItemOptions';
import { ItemPicker } from './ItemPicker';

/** 天賦參數的道具選單（`51-auto-talent.md` § 51.4.10~§ 51.4.11）：單選，依類別分組、各組可收合、可搜尋 */
export function TalentItemSelect({ label, pool, value, onWrite }: {
  label: string;
  pool?: TalentItemPool;
  value: number | undefined;
  onWrite: (next: number | undefined) => unknown;
}) {
  return (
    <ItemPicker
      label={label}
      items={talentItemOptions(pool)}
      value={value}
      onPick={onWrite}
      onClear={() => onWrite(undefined)}
    />
  );
}
