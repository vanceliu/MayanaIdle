import { createPortal } from 'react-dom';
import { useDragStore } from '../stores/dragStore';

/**
 * 跟著指標跑的拖曳殘影（`34-ui-guidelines.md` § 34.8）。
 *
 * HTML5 拖放時這件事由瀏覽器代勞；改成 pointer 拖放之後畫面上就什麼都不會動，
 * 玩家不知道自己抓著東西。
 *
 * - **portal 到 body**：來源面板可能被 `zoom` 縮放（§ 34.6），殘影留在裡面會被縮兩次，
 *   而它用的是未縮放的視窗座標。
 * - **`pointer-events: none` 必須有**：`hitTestDropTarget()` 走 `elementFromPoint`，
 *   殘影只要吃事件就永遠擋在指標正下方，落點會全部判成殘影自己。
 */
export function DragGhost() {
  const item = useDragStore(s => s.item);
  const pointer = useDragStore(s => s.pointer);
  const over = useDragStore(s => s.over);

  if (!item || !pointer) return null;

  return createPortal(
    <div
      className={`drag-ghost${over ? ' has-target' : ''}${over?.kind === 'map' ? ' is-discard' : ''}`}
      data-testid="drag-ghost"
      style={{ left: pointer.x, top: pointer.y }}
    >
      <span className="drag-ghost-label">{item.label}</span>
      {over?.kind === 'map' && <span className="drag-ghost-hint">丟棄</span>}
    </div>,
    document.body,
  );
}
