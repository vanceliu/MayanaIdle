import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useOnlineStore } from '../net/online';

/** 救援碼只顯示這一次（`97-selfhosted-server.md` § 97.5），可直接關閉 */
export function RecoveryCodeModal() {
  const code = useOnlineStore(s => s.recoveryCode);
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const close = () => {
    setCopied(false);
    useOnlineStore.setState({ recoveryCode: null });
  };
  // http 連線（非安全環境）沒有 clipboard API，只能手動選取
  const canCopy = typeof navigator !== 'undefined' && !!navigator.clipboard;
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => setCopied(true), () => setCopied(false));
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content recovery-code-modal" role="dialog" aria-labelledby="recovery-code-title">
        <div className="modal-header">
          <span className="modal-title" id="recovery-code-title">救援碼</span>
          <button className="modal-close" onClick={close} aria-label="關閉">✕</button>
        </div>
        <div className="modal-body">
          <p className="recovery-code-hint">忘記密碼時，在登入畫面用這組救援碼重設密碼。救援碼只顯示這一次，請抄下或存好。</p>
          <code className="recovery-code-value" data-testid="recovery-code">{code}</code>
          <p className="recovery-code-hint">產生新的救援碼後，這組會失效。</p>
          <div className="recovery-code-actions">
            {canCopy && <button className="btn-secondary" onClick={copy}>{copied ? '已複製' : '複製'}</button>}
            <button className="btn-primary" onClick={close}>關閉</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
