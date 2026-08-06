import { formatMaterialUsage } from '../../systems/craftMaterialUsage';

/**
 * 「這個素材進得了配方」的標記。
 *
 * 素材顏色（`iconTier`）表達的是稀有度，表達不了製作用途 —— 一個視覺通道塞兩種語意
 * 必然互相犧牲，所以用途另開這個標記（`30-items.md` § 素材 iconTier 對照）。
 * 背包與雜貨店共用，避免兩邊各自實作而顯示不一致。
 */
export function CraftUsageBadge({ itemId, compact = false }: { itemId: number; compact?: boolean }) {
  const usage = formatMaterialUsage(itemId);
  if (!usage) return null;

  return (
    <span
      className={`craft-usage-badge${compact ? ' compact' : ''}`}
      title={`用途：${usage}`}
      aria-label={`用途：${usage}`}
    >
      ⚒{compact ? '' : ` ${usage}`}
    </span>
  );
}
