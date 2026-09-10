import { useState } from 'react';
import { useOnlineStore } from '../net/online';
import { connection } from '../net/connection';
import { BuildLabel } from './BuildLabel';

/** 開放形態的登入／註冊（`97-selfhosted-server.md` § 97.5）。單機形態由 host 自動登入，不會看到這頁 */
export function LoginScreen() {
  const status = useOnlineStore(s => s.status);
  const serverName = useOnlineStore(s => s.serverName);
  const registration = useOnlineStore(s => s.registration);
  const error = useOnlineStore(s => s.error);
  const requiredVersion = useOnlineStore(s => s.requiredVersion);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  if (status === 'version_mismatch') {
    return (
      <div className="app title-screen">
        <h1>版本不符</h1>
        <p>server 需要 v{requiredVersion}，請重新整理取得新版</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>重新整理</button>
        <BuildLabel />
      </div>
    );
  }

  if (status === 'connecting' || status === 'disconnected') {
    return (
      <div className="app title-screen">
        <h1>瑪雅那 Idle</h1>
        <p>{status === 'connecting' ? '連線中…' : '連線中斷，重新連線中…'}</p>
        <BuildLabel />
      </div>
    );
  }

  const canRegister = registration !== 'closed';
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    if (mode === 'login') connection.login(username, password);
    else connection.register(username, password, inviteCode || undefined);
  };

  return (
    <div className="app title-screen">
      <h1>{serverName || '瑪雅那 Idle'}</h1>
      <form className="login-form" onSubmit={submit}>
        <label>
          帳號
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label>
          密碼
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </label>
        {mode === 'register' && registration === 'invite' && (
          <label>
            邀請碼
            <input value={inviteCode} onChange={e => setInviteCode(e.target.value)} />
          </label>
        )}
        {error && <p className="login-error" role="alert">{error}</p>}
        <button className="btn-primary" type="submit">{mode === 'login' ? '登入' : '註冊'}</button>
        {canRegister && (
          <button className="btn-secondary" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '註冊新帳號' : '已有帳號，登入'}
          </button>
        )}
      </form>
      <BuildLabel />
    </div>
  );
}
