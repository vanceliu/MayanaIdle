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
  const mismatchKind = useOnlineStore(s => s.mismatchKind);
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  if (status === 'version_mismatch') {
    return (
      <div className="app title-screen">
        <h1>版本不符</h1>
        <p>
          {mismatchKind === 'release'
            ? `版本不符：server 是 ${requiredVersion}，請重新整理取得同一版`
            : '連線協定不符，請重新整理取得新版'}
        </p>
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
  const switchMode = (next: typeof mode) => {
    setMode(next);
    setPassword('');
    useOnlineStore.setState({ error: null });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'recover') {
      if (!recoveryCode || !password) return;
      connection.recover(recoveryCode, password);
      return;
    }
    if (!username || !password) return;
    if (mode === 'login') connection.login(username, password);
    else connection.register(username, password, inviteCode || undefined);
  };

  if (mode === 'recover') {
    return (
      <div className="app title-screen">
        <h1>{serverName || '瑪雅那 Idle'}</h1>
        <form className="login-form" onSubmit={submit}>
          <p className="login-hint">輸入註冊時拿到的救援碼與新密碼。重設後其他裝置的登入會失效，並換發一組新救援碼。</p>
          <label>
            救援碼
            <input value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="12-XXXX-XXXX-XXXX-XXXX" />
          </label>
          <label>
            新密碼
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="btn-primary" type="submit">重設密碼</button>
          <button className="btn-secondary" type="button" onClick={() => switchMode('login')}>返回登入</button>
        </form>
        <BuildLabel />
      </div>
    );
  }

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
          <button className="btn-secondary" type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '註冊新帳號' : '已有帳號，登入'}
          </button>
        )}
        {mode === 'login' && (
          <button className="login-forgot" type="button" onClick={() => switchMode('recover')}>忘記密碼？</button>
        )}
      </form>
      <BuildLabel />
    </div>
  );
}
