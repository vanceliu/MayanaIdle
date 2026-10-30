import { useGameStore, type GamePhase } from '../stores/gameStore';
import { useOnlineStore, type OnlineState } from '../net/online';
import { connection } from '../net/connection';
import { TitleScreen, type TitleView, type TitleScreenActions } from './TitleScreen';
import { PATCH_NOTES } from '../db/seed/patchNotes';

type TitleInputs = Pick<OnlineState, 'enabled' | 'status' | 'awaitingEnter' | 'worldMode' | 'isHost' | 'username' | 'mismatchKind' | 'requiredVersion'>;

/** 起始畫面要顯示的狀態；null ＝ 不在起始畫面（`19-account-character.md` § 19.3） */
export function titleViewOf(online: TitleInputs, phase: GamePhase): TitleView | null {
  if (!online.enabled) return phase === 'title' ? { kind: 'signedIn', username: null } : null;
  switch (online.status) {
    case 'version_mismatch':
      return { kind: 'versionMismatch', mismatch: online.mismatchKind ?? 'protocol', requiredVersion: online.requiredVersion };
    case 'offline':
    case 'connecting':
      return { kind: 'connecting' };
    case 'disconnected':
      return { kind: 'reconnecting' };
    case 'login':
      return { kind: 'loginForm' };
    case 'authed':
      if (phase !== 'title') return null;
      if (!online.awaitingEnter) return { kind: 'loading' };
      return { kind: 'signedIn', username: online.worldMode === 'open' && !online.isHost ? online.username : null };
  }
}

export function useTitleView(): TitleView | null {
  const phase = useGameStore(s => s.phase);
  const enabled = useOnlineStore(s => s.enabled);
  const status = useOnlineStore(s => s.status);
  const awaitingEnter = useOnlineStore(s => s.awaitingEnter);
  const worldMode = useOnlineStore(s => s.worldMode);
  const isHost = useOnlineStore(s => s.isHost);
  const username = useOnlineStore(s => s.username);
  const mismatchKind = useOnlineStore(s => s.mismatchKind);
  const requiredVersion = useOnlineStore(s => s.requiredVersion);
  return titleViewOf({ enabled, status, awaitingEnter, worldMode, isHost, username, mismatchKind, requiredVersion }, phase);
}

const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const;

/** 起始畫面接上連線：登入表單、「進入」、「切換帳號」 */
export function StartScreen({ view }: { view: TitleView }) {
  const enabled = useOnlineStore(s => s.enabled);
  const worldMode = useOnlineStore(s => s.worldMode);
  const serverName = useOnlineStore(s => s.serverName);
  const registration = useOnlineStore(s => s.registration);
  const error = useOnlineStore(s => s.error);
  const setPhase = useGameStore(s => s.setPhase);

  const actions: TitleScreenActions = {
    login: (username, password) => connection.login(username, password),
    register: (username, password, inviteCode) => connection.register(username, password, inviteCode),
    recover: (code, password) => connection.recover(code, password),
    enter: () => (enabled ? connection.enterFromTitle() : setPhase('characterSelect')),
    switchAccount: () => connection.logout(),
    reload: () => window.location.reload(),
    clearError: () => useOnlineStore.setState({ error: null }),
  };

  return (
    <TitleScreen
      view={view}
      serverName={worldMode === 'open' && serverName ? serverName : null}
      registration={REGISTRATION_MODES.find(m => m === registration) ?? null}
      error={error}
      patchNotes={PATCH_NOTES}
      actions={actions}
    />
  );
}
