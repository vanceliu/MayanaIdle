import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { usePartyStore, isPartyLeader, PARTY_MAX_MEMBERS, type PartyMemberView } from '../stores/partyStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { useOnlineStore } from '../net/online';
import { CLASS_NAMES_ZH } from '../models/character';
import { getRegion } from '../models/mapData';
import { PanelDockFace } from './PanelDockFace';
import { useTradeStore } from '../stores/tradeStore';
import { useChatStore } from '../stores/chatStore';

/**
 * 隊伍（`97-selfhosted-server.md` § 97.7.3）。判定全在 server，這裡只呈現鏡像與送出指令。
 * 單機形態沒有隊伍：按鈕與 HUD 都不出現。
 */

function mapName(regionId: string, floor: number | null): string {
  const region = getRegion(regionId);
  const name = region?.name ?? regionId;
  return floor != null ? `${name} ${floor}F` : name;
}

/** 徽章＝待處理的邀請數（`34-ui-guidelines.md` § 34.10 數量徽章） */
export function PartyButton() {
  const online = useOnlineStore(s => s.enabled);
  const invites = usePartyStore(s => s.invites.length);
  const isOpen = usePanelWindowStore(s => s.open.party);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();
  if (!online) return null;

  return (
    <button
      className={`panel-dock-btn party-btn ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('party', isMobile)}
      {...panelButtonA11y('party')}
    >
      <PanelDockFace panelKey="party" />
      {invites > 0 && <span className="quest-count-badge">{invites}</span>}
    </button>
  );
}

function MemberBars({ m }: { m: PartyMemberView }) {
  const hpPct = m.maxHp > 0 ? Math.floor((m.hp / m.maxHp) * 100) : 0;
  const mpPct = m.maxMp > 0 ? Math.floor((m.mp / m.maxMp) * 100) : 0;
  return (
    <div className="party-member-bars">
      <div className="party-bar party-hp"><div className="party-bar-fill" style={{ width: `${hpPct}%` }} /></div>
      <div className="party-bar party-mp"><div className="party-bar-fill" style={{ width: `${mpPct}%` }} /></div>
    </div>
  );
}

/**
 * 隊伍 HUD：一列隊員 —— 名稱、職業、HP／MP 條、所在地圖、離線標記；不顯示隊員 buff（§ 97.7.3）。
 * 掛在狀態卡下方，自己不列。
 */
export function PartyHud() {
  const party = usePartyStore(s => s.party);
  const myId = useGameStore(s => s.character?.id);
  if (!party) return null;
  const others = party.members.filter(m => m.characterId !== myId);
  if (others.length === 0) return null;

  return (
    <div className="party-hud" aria-label="隊伍">
      {others.map(m => (
        <div key={m.characterId} className={`party-hud-row${m.online ? '' : ' is-offline'}`}>
          <div className="party-hud-head">
            <span className="party-hud-name">
              {m.characterId === party.leaderId && <span className="party-leader-mark" title="隊長">★</span>}
              {m.name}
            </span>
            <span className="party-hud-class">{CLASS_NAMES_ZH[m.className]} Lv.{m.level}</span>
          </div>
          <MemberBars m={m} />
          <div className="party-hud-foot">
            <span className="party-hud-map">{m.online ? mapName(m.regionId, m.floor) : '離線'}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 上一次操作的結果訊息只屬於那一次；關掉視窗再打開不該還掛著「已邀請 X」 */
function useClearMessageOnOpen(): void {
  const setMessage = usePartyStore(s => s.setMessage);
  useEffect(() => setMessage(null), [setMessage]);
}

/**
 * 以角色名稱邀請（§ 97.7.3）：名單上沒有的人（不同地圖、朋友）只能這樣邀。
 * 名稱在本服唯一（`19-account-character.md` § 19.4），所以輸入名稱即可指定。
 */
function InviteByName({ invite, disabled }: { invite: (target: number | string) => Promise<boolean>; disabled: boolean }) {
  const [name, setName] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = name.trim();
    if (!target) return;
    if (await invite(target)) setName('');
  };

  return (
    <form className="party-invite-row" onSubmit={submit}>
      <input
        className="party-invite-input"
        value={name}
        placeholder="角色名稱"
        aria-label="邀請角色名稱"
        disabled={disabled}
        onChange={e => setName(e.target.value)}
      />
      <button className="party-action-btn" type="submit" disabled={disabled || !name.trim()}>邀請</button>
    </form>
  );
}

export function PartyPanelContent() {
  const party = usePartyStore(s => s.party);
  const invites = usePartyStore(s => s.invites);
  const message = usePartyStore(s => s.message);
  // 線上模式會把 action 換成 RPC 代理（`net/mirror.ts`），所以逐一訂閱而不是一次取整包
  const invite = usePartyStore(s => s.invite);
  const accept = usePartyStore(s => s.accept);
  const decline = usePartyStore(s => s.decline);
  const leave = usePartyStore(s => s.leave);
  const kick = usePartyStore(s => s.kick);
  const transferLeader = usePartyStore(s => s.transferLeader);
  const setDropMode = usePartyStore(s => s.setDropMode);
  const actions = { invite, accept, decline, leave, kick, transferLeader, setDropMode };
  const offerTrade = useTradeStore(s => s.offer);
  const myId = useGameStore(s => s.character?.id);
  const leader = isPartyLeader(party, myId);
  const full = !!party && party.members.length >= PARTY_MAX_MEMBERS;
  const canInvite = !party || (leader && !full);
  useClearMessageOnOpen();

  return (
    <div className="party-panel">
      <div className="panel-scroll">
        {invites.length > 0 && (
          <section className="party-section">
            <div className="party-section-title">邀請</div>
            <ul className="party-list">
              {invites.map(inv => (
                <li key={inv.id} className="party-row">
                  <span className="party-row-main">{inv.fromName} 邀請你加入隊伍</span>
                  <button className="party-action-btn" onClick={() => void actions.accept(inv.id)}>接受</button>
                  <button className="party-action-btn is-secondary" onClick={() => void actions.decline(inv.id)}>拒絕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="party-section">
          <div className="party-section-title">
            {party ? `隊伍（${party.members.length}/${PARTY_MAX_MEMBERS}）` : '尚未組隊'}
          </div>
          <InviteByName invite={actions.invite} disabled={!canInvite} />
          {party && (
            <>
              <ul className="party-list">
                {party.members.map(m => (
                  <li key={m.characterId} className={`party-row${m.online ? '' : ' is-offline'}`}>
                    <div className="party-row-main">
                      <span className="party-row-name">
                        {m.characterId === party.leaderId && <span className="party-leader-mark" title="隊長">★</span>}
                        {m.name}
                        <span className="party-row-class">{CLASS_NAMES_ZH[m.className]} Lv.{m.level}</span>
                      </span>
                      <span className="party-row-sub">{m.online ? mapName(m.regionId, m.floor) : '離線'}</span>
                    </div>
                    {m.characterId !== myId && m.online && (
                      <button className="party-action-btn is-secondary" title="提出交易" onClick={() => void offerTrade(m.characterId)}>交易</button>
                    )}
                    {leader && m.characterId !== myId && (
                      <>
                        <button className="party-action-btn is-secondary" disabled={!m.online} onClick={() => void actions.transferLeader(m.characterId)}>轉讓</button>
                        <button className="party-action-btn is-danger" onClick={() => void actions.kick(m.characterId)}>踢除</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="party-controls">
                <label className="party-drop-mode">
                  掉落分配
                  <select
                    value={party.dropMode}
                    disabled={!leader}
                    onChange={e => void actions.setDropMode(e.target.value as 'all' | 'participants')}
                  >
                    <option value="participants">僅參與者</option>
                    <option value="all">全隊</option>
                  </select>
                </label>
                <button className="party-action-btn is-danger" onClick={() => void actions.leave()}>離隊</button>
              </div>
            </>
          )}
        </section>

        {message && <div className="party-message" role="status">{message}</div>}
      </div>
    </div>
  );
}

/**
 * 本地圖的在線名單（§ 97.7.1：非隊友只出現在名單上，無座標、不佔格）。
 *
 * **與隊伍面板分開**：一個是自己的隊伍狀態、一個是別人的名單，
 * 兩者的更新頻率與使用時機都不一樣，擠在同一個視窗會互相推擠。
 */
export function OnMapButton() {
  const online = useOnlineStore(s => s.enabled);
  const isOpen = usePanelWindowStore(s => s.open.onmap);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();
  if (!online) return null;

  return (
    <button
      className={`panel-dock-btn onmap-btn ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('onmap', isMobile)}
      {...panelButtonA11y('onmap')}
    >
      {/* 人數標在地圖選擇器的「目前:」上（§ 97.7.1），這裡不重複 */}
      <PanelDockFace panelKey="onmap" />
    </button>
  );
}

export function OnMapPanelContent() {
  const onMap = usePartyStore(s => s.onMap);
  const party = usePartyStore(s => s.party);
  const invite = usePartyStore(s => s.invite);
  const message = usePartyStore(s => s.message);
  const offerTrade = useTradeStore(s => s.offer);
  const setWhisperTarget = useChatStore(s => s.setWhisperTarget);
  const setChatInput = useChatStore(s => s.setInput);
  const myId = useGameStore(s => s.character?.id);
  const leader = isPartyLeader(party, myId);
  const full = !!party && party.members.length >= PARTY_MAX_MEMBERS;
  const canInvite = !party || (leader && !full);
  useClearMessageOnOpen();

  const whisper = (name: string) => {
    setWhisperTarget(name);
    setChatInput('whisper');
  };

  return (
    <div className="party-panel">
      <div className="panel-scroll">
        <section className="party-section">
          {onMap.length === 0 ? (
            <div className="party-empty">這張地圖上沒有其他玩家</div>
          ) : (
            <ul className="party-list">
              {onMap.map(p => (
                <li key={p.characterId} className="party-row">
                  <div className="party-row-main">
                    <span className="party-row-name">
                      {p.name}
                      <span className="party-row-class">{CLASS_NAMES_ZH[p.className]} Lv.{p.level}</span>
                    </span>
                    {/* 名單不透露隊籍；這行只在邀請被回絕後才會出現（§ 97.7.1） */}
                    {p.inParty && <span className="party-row-sub">已有隊伍</span>}
                  </div>
                  <button className="party-action-btn is-secondary" title="密語" onClick={() => whisper(p.name)}>密語</button>
                  <button className="party-action-btn is-secondary" title="提出交易" onClick={() => void offerTrade(p.characterId)}>交易</button>
                  {!p.inParty && (
                    <button className="party-action-btn" disabled={!canInvite} onClick={() => void invite(p.characterId)}>邀請</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        {message && <div className="party-message" role="status">{message}</div>}
      </div>
    </div>
  );
}
