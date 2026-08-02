import { useGameStore } from '../stores/gameStore';
import { useAutoScrollLog } from '../hooks/useAutoScrollLog';

interface CombatLogPanelProps {
  /** 附加在 .combat-log 之後的樣式類別（如 compact / town-log） */
  className?: string;
  /** 無紀錄時顯示的文字，未提供則不顯示空狀態 */
  emptyText?: string;
}

/**
 * 戰鬥紀錄視窗。城鎮與戰鬥畫面共用同一套捲動行為：
 * 拉桿在底部時跟隨最新內容，被手動拉離底部後不再搶位置，拉回底部才恢復跟隨。
 * 每個實例各自持有捲動狀態，同時顯示多個視窗也互不干擾。
 */
export function CombatLogPanel({ className, emptyText }: CombatLogPanelProps) {
  const combatLogs = useGameStore(s => s.combatLogs);
  const { ref, onScroll } = useAutoScrollLog<HTMLDivElement>(combatLogs);

  return (
    <div className={className ? `combat-log ${className}` : 'combat-log'} ref={ref} onScroll={onScroll}>
      {emptyText && combatLogs.length === 0 && (
        <div className="log-entry log-system">{emptyText}</div>
      )}
      {combatLogs.map((log, i) => (
        <div key={i} className={`log-entry log-${log.type}`}>{log.text}</div>
      ))}
    </div>
  );
}
