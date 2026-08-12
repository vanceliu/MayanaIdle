/**
 * 指定型／池型鑲材的綁定確認（`51-auto-talent.md` § 51.4.1）。
 *
 * **綁定不可更改**，而且最容易踩到的是開局：三份施放技能都未綁定，
 * 只學了一個技能時全綁同一個，等於白白廢掉兩格 —— 那時候玩家還不知道會有這個後果。
 * 沿用 `DiscardConfirmModal` 的版型：同樣是不可復原的動作，長得一樣才讀得快。
 */
export function BindConfirmModal({ label, target, onCancel, onConfirm }: {
  /** 綁的是什麼（技能、系別、道具類別） */
  label: string;
  /** 綁定對象的顯示名稱 */
  target: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content discard-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">選定{label}</span>
        </div>

        <div className="discard-body">
          <p className="discard-target">{target}</p>
          <p className="discard-warning">選定後不可更改，這份鑲材永遠是這個對象。</p>
        </div>

        <div className="discard-actions">
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn-danger" onClick={onConfirm}>確定選定</button>
        </div>
      </div>
    </div>
  );
}
