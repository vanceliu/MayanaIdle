import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useOnlineStore } from '../net/online';
import { connection } from '../net/connection';
import { BuildLabel } from './BuildLabel';

/**
 * 線上模式的帳號密碼與救援碼（`97-selfhosted-server.md` § 97.5）。
 * 單機世界的 host 不設密碼，只給管理介面入口。
 */
function OnlineAccount() {
  const online = useOnlineStore(s => s.enabled);
  const username = useOnlineStore(s => s.username);
  const isHost = useOnlineStore(s => s.isHost);
  const hasRecoveryCode = useOnlineStore(s => s.hasRecoveryCode);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [recoveryProof, setRecoveryProof] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!online) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return setMessage('請輸入目前的密碼或救援碼');
    if (password.length < 6) return setMessage('密碼至少 6 個字元');
    if (password !== confirm) return setMessage('兩次輸入的密碼不一樣');
    connection.setPassword(current, password).then(
      () => {
        setCurrent('');
        setPassword('');
        setConfirm('');
        setMessage('已設定密碼，其他裝置的登入已失效');
      },
      (err: Error) => setMessage(err.message),
    );
  };

  // 只有救援碼能換救援碼（§ 97.5）；還沒有救援碼時驗密碼
  const regenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryProof) return setMessage(hasRecoveryCode ? '請輸入目前的救援碼' : '請輸入目前的密碼');
    connection.regenerateRecoveryCode(recoveryProof).then(
      () => {
        setRecoveryProof('');
        setMessage(null);
      },
      (err: Error) => setMessage(err.message),
    );
  };

  return (
    <div className="settings-row">
      <span className="settings-label">帳號</span>
      <div className="settings-control settings-control-wrap">
        <span className="settings-account-name">{username}</span>
        {/* 管理介面的帳號密碼在 server.properties，與遊戲帳號無關（§ 97.8）；單機時開服者就在本機，給個入口 */}
        {isHost && (
          <a className="btn-wiki" href="/admin" target="_blank" rel="noopener noreferrer">開啟管理介面</a>
        )}
      </div>
      {/* host 不設密碼（`97-selfhosted-server.md` § 97.5）；單機要保護的只有管理介面（admin-password） */}
      {!isHost && (
        <form className="settings-password" onSubmit={submit}>
          <input className="settings-password-current" type="password" value={current} placeholder="目前的密碼或救援碼" autoComplete="current-password" aria-label="目前的密碼或救援碼" onChange={e => setCurrent(e.target.value)} />
          <input type="password" value={password} placeholder="新密碼" autoComplete="new-password" aria-label="新密碼" onChange={e => setPassword(e.target.value)} />
          <input type="password" value={confirm} placeholder="再輸入一次" autoComplete="new-password" aria-label="再輸入一次" onChange={e => setConfirm(e.target.value)} />
          <button className="btn-transfer" type="submit">設定密碼</button>
        </form>
      )}
      {!isHost && (
        <form className="settings-password" onSubmit={regenerate}>
          <input
            type="password"
            value={recoveryProof}
            placeholder={hasRecoveryCode ? '目前的救援碼' : '目前的密碼'}
            aria-label={hasRecoveryCode ? '目前的救援碼' : '目前的密碼'}
            autoComplete={hasRecoveryCode ? 'off' : 'current-password'}
            onChange={e => setRecoveryProof(e.target.value)}
          />
          <button className="btn-transfer" type="submit">{hasRecoveryCode ? '重新產生救援碼' : '產生救援碼'}</button>
          <span className="settings-recovery-state">
            {hasRecoveryCode ? '已有救援碼。換新的要輸入目前這組，舊的立即失效；遺失請找管理員' : '尚未產生救援碼'}
          </span>
        </form>
      )}
      {isHost && (
        <p className="settings-hint">單機世界只有你一個玩家，本機連線自動登入，不需要密碼。管理介面的帳號密碼在 server.properties。</p>
      )}
      {message && <p className="settings-hint settings-password-msg" role="status">{message}</p>}
    </div>
  );
}

/**
 * 帳號與資料（`47-mobile.md`）。
 *
 * Wiki／登出原本是右下角常駐的一整排，但它們**一局裡大概按不到一次** ——
 * 與「開背包」這種每分鐘都在按的操作放在同一層，等於拿最貴的畫面位置去換最低頻的功能。
 * 全部收進設定視窗的「帳號」頁，右下只留一顆 ⚙。
 *
 * **沒有角色匯出／匯入**（`19-account-character.md` § 19.9）：角色存在 server 的 SQLite，
 * 備份是開服者複製資料庫檔的事（`97-selfhosted-server.md` § 97.8）。
 */
export function AccountSettings({ onClose }: { onClose: () => void }) {
  const logout = useGameStore(s => s.logout);
  const online = useOnlineStore(s => s.enabled);
  const isHost = useOnlineStore(s => s.isHost);
  // 單機 host 是本機自動登入，登出帳號後沒有登入畫面可用（§ 97.5）
  const canLogoutAccount = online && !isHost;

  return (
    <div className="settings-body">
      <OnlineAccount />

      <div className="settings-row">
        <span className="settings-label">資料庫</span>
        <div className="settings-control settings-control-wrap">
          <a className="btn-wiki" href="/MayanaIdle/wiki" target="_blank" rel="noopener noreferrer">
            開啟 Wiki
          </a>
        </div>
        <p className="settings-hint">裝備、怪物、詞綴與掉落表的完整查詢。會開新分頁。</p>
      </div>

      <div className="settings-row">
        <span className="settings-label">登出</span>
        <div className="settings-control settings-control-wrap">
          {/* 關掉視窗再登出：登出會換掉整個畫面，留著開啟中的彈窗只會閃一下 */}
          <button className="btn-logout" onClick={() => { onClose(); logout(); }}>回到角色清單</button>
          {canLogoutAccount && (
            <button className="btn-logout" onClick={() => { onClose(); connection.logout(); }}>登出帳號</button>
          )}
        </div>
        <p className="settings-hint">
          {canLogoutAccount
            ? '回到角色清單：換角色，帳號保持登入。登出帳號：這台裝置回到登入畫面，下次要重新輸入帳號密碼。進度都會自動存檔。'
            : '回到角色選擇畫面，進度會自動存檔。'}
        </p>
      </div>

      {/* 版本號：回報問題時第一個要問的資訊，放在最容易被截圖到的地方 */}
      <div className="settings-row settings-build">
        <span className="settings-label">版本</span>
        <BuildLabel />
      </div>
    </div>
  );
}
