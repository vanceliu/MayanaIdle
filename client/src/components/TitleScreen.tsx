import { useState } from 'react';
import { BuildLabel } from './BuildLabel';
import type { PatchNote } from '../db/seed/patchNotes';

/** 起始畫面（`19-account-character.md` § 19.3）的顯示狀態 */
export type TitleView =
  | { kind: 'connecting' }
  | { kind: 'reconnecting' }
  /** 已按「進入」或表單登入成功，等 server 回角色清單 */
  | { kind: 'loading' }
  | { kind: 'versionMismatch'; mismatch: 'protocol' | 'release'; requiredVersion: string | null }
  | { kind: 'loginForm' }
  /** `username` 為 null ＝ 單機 host，不顯示帳號名與切換帳號 */
  | { kind: 'signedIn'; username: string | null };

export interface TitleScreenActions {
  login(username: string, password: string): void;
  register(username: string, password: string, inviteCode?: string): void;
  recover(recoveryCode: string, newPassword: string): void;
  enter(): void;
  switchAccount(): void;
  reload(): void;
  clearError(): void;
}

export interface TitleScreenProps {
  view: TitleView;
  /** 開放世界的 server 名稱；單機傳 null */
  serverName: string | null;
  registration: 'open' | 'invite' | 'closed' | null;
  error: string | null;
  /** 改版資訊，新版在前（`52-mailbox.md` § 52.6） */
  patchNotes: PatchNote[];
  actions: TitleScreenActions;
}

export function TitleScreen({ view, serverName, registration, error, patchNotes, actions }: TitleScreenProps) {
  return (
    <div className="app title-screen">
      <div className="title-layout">
        <div className="title-main">
          <header className="title-hero">
            <h1>瑪雅那 Idle</h1>
            <p className="title-tagline">放置型 ARPG</p>
            {serverName && <p className="title-server">{serverName}</p>}
          </header>
          <section className="title-panel">
            <TitlePanelBody view={view} registration={registration} error={error} actions={actions} />
          </section>
        </div>
        {patchNotes.length > 0 && <PatchNotes notes={patchNotes} />}
      </div>
      <BuildLabel />
    </div>
  );
}

function PatchNotes({ notes }: { notes: PatchNote[] }) {
  return (
    <aside className="title-notes" aria-label="改版資訊">
      <h2>改版資訊</h2>
      {notes.map(note => (
        <article key={note.version} className="title-note">
          <h3>
            <span className="title-note-version">v{note.version}</span>
            <time className="title-note-date" dateTime={note.date}>{note.date}</time>
          </h3>
          <ul>
            {note.changes.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </article>
      ))}
    </aside>
  );
}

function TitlePanelBody({ view, registration, error, actions }: Pick<TitleScreenProps, 'view' | 'registration' | 'error' | 'actions'>) {
  switch (view.kind) {
    case 'connecting':
      return <p className="title-status">連線中…</p>;
    case 'reconnecting':
      return <p className="title-status">連線中斷，重新連線中…</p>;
    case 'loading':
      return <p className="title-status">載入中…</p>;
    case 'versionMismatch':
      return (
        <>
          <p className="title-status title-status-error">
            {view.mismatch === 'release'
              ? `版本不符：server 是 ${view.requiredVersion ?? '未知版本'}，請重新整理取得同一版`
              : '連線協定不符，請重新整理取得新版'}
          </p>
          <button className="btn-primary title-enter" onClick={actions.reload}>重新整理</button>
        </>
      );
    case 'signedIn':
      return (
        <>
          {view.username && <p className="title-account">已登入：<strong>{view.username}</strong></p>}
          <button className="btn-primary title-enter" onClick={actions.enter}>進入</button>
          {view.username && (
            <button className="login-forgot" type="button" onClick={actions.switchAccount}>切換帳號</button>
          )}
        </>
      );
    case 'loginForm':
      return <LoginForm registration={registration} error={error} actions={actions} />;
  }
}

function LoginForm({ registration, error, actions }: Pick<TitleScreenProps, 'registration' | 'error' | 'actions'>) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  const canRegister = registration !== 'closed';
  const switchMode = (next: typeof mode) => {
    setMode(next);
    setPassword('');
    actions.clearError();
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'recover') {
      if (recoveryCode && password) actions.recover(recoveryCode, password);
      return;
    }
    if (!username || !password) return;
    if (mode === 'login') actions.login(username, password);
    else actions.register(username, password, inviteCode || undefined);
  };

  if (mode === 'recover') {
    return (
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
    );
  }

  return (
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
  );
}
