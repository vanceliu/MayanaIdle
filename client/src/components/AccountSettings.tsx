import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useOnlineStore } from '../net/online';
import { connection } from '../net/connection';
import { BuildLabel } from './BuildLabel';

/**
 * 線上模式的帳號密碼（`97-selfhosted-server.md` § 97.5）。
 *
 * 單機形態的 host 帳號一開始沒有密碼（由本機自動登入），但**管理介面要密碼**（§ 97.8），
 * 對外開放也要密碼，所以設定入口必須在遊戲裡。
 */
function OnlineAccount() {
  const online = useOnlineStore(s => s.enabled);
  const username = useOnlineStore(s => s.username);
  const isHost = useOnlineStore(s => s.isHost);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!online) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setMessage('密碼至少 6 個字元');
    if (password !== confirm) return setMessage('兩次輸入的密碼不一樣');
    connection.send({ t: 'set_password', password });
    setPassword('');
    setConfirm('');
    setMessage('已設定密碼');
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
      {/* host 的密碼由設定檔決定（`97-selfhosted-server.md` § 97.5），遊戲裡不提供修改 */}
      {!isHost && (
        <form className="settings-password" onSubmit={submit}>
          <input type="password" value={password} placeholder="新密碼" autoComplete="new-password" aria-label="新密碼" onChange={e => setPassword(e.target.value)} />
          <input type="password" value={confirm} placeholder="再輸入一次" autoComplete="new-password" aria-label="再輸入一次" onChange={e => setConfirm(e.target.value)} />
          <button className="btn-transfer" type="submit">設定密碼</button>
        </form>
      )}
      <p className="settings-hint">
        {isHost
          ? '單機世界只有你一個玩家，本機連線自動登入，不需要密碼。管理介面的帳號密碼在 server.properties。'
          : '這組帳號密碼用於登入這個 server。管理介面的帳號另外設在 server.properties，與遊戲帳號無關。'}
        {message && <span className="settings-password-msg">{message}</span>}
      </p>
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
          <button className="btn-logout" onClick={() => { onClose(); logout(); }}>登出</button>
        </div>
        <p className="settings-hint">回到角色選擇畫面。存檔在本機，不會遺失。</p>
      </div>

      {/* 版本號：回報問題時第一個要問的資訊，放在最容易被截圖到的地方 */}
      <div className="settings-row settings-build">
        <span className="settings-label">版本</span>
        <BuildLabel />
      </div>
    </div>
  );
}
