import { useEffect, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useGuildStore, isGuildLeader } from '../stores/guildStore';
import { usePartyStore, isPartyLeader, PARTY_MAX_MEMBERS } from '../stores/partyStore';
import { useTradeStore } from '../stores/tradeStore';
import { useChatStore } from '../stores/chatStore';
import { CLASS_NAMES_ZH } from '../models/character';
import { InviteByName } from './PartyPanel';

/**
 * 社群視窗「公會」分頁（`11-guild.md` § 11.7）。判定全在 server，這裡只呈現鏡像與送出指令。
 * 建立與解散在城鎮的公會 NPC（`town/GuildNpc.tsx`）。
 */
export function GuildPanelContent() {
  const guild = useGuildStore(s => s.guild);
  const invites = useGuildStore(s => s.invites);
  const message = useGuildStore(s => s.message);
  // 線上模式會把 action 換成 RPC 代理（`net/mirror.ts`），所以逐一訂閱
  const invite = useGuildStore(s => s.invite);
  const accept = useGuildStore(s => s.accept);
  const decline = useGuildStore(s => s.decline);
  const leave = useGuildStore(s => s.leave);
  const kick = useGuildStore(s => s.kick);
  const clearMessage = useGuildStore(s => s.clearMessage);
  const myId = useGameStore(s => s.character?.id);
  const leader = isGuildLeader(guild, myId);
  /** 正在確認要踢除的成員（§ 11.6：踢人需二次確認） */
  const [confirmKick, setConfirmKick] = useState<number | null>(null);
  const full = !!guild && guild.members.length >= guild.capacity;
  const party = usePartyStore(s => s.party);
  const partyInvite = usePartyStore(s => s.invite);
  // 組隊邀請與交易的結果寫在隊伍 store（同在線分頁）
  const partyMessage = usePartyStore(s => s.message);
  const offerTrade = useTradeStore(s => s.offer);
  const setWhisperTarget = useChatStore(s => s.setWhisperTarget);
  const setChatInput = useChatStore(s => s.setInput);
  // 組隊邀請的資格與在線分頁相同（`97-selfhosted-server.md` § 97.7.3）
  const canPartyInvite = !party || (isPartyLeader(party, myId) && party.members.length < PARTY_MAX_MEMBERS);
  const inMyParty = (id: number) => !!party?.members.some(m => m.characterId === id);

  const whisper = (name: string) => {
    setWhisperTarget(name);
    setChatInput('whisper');
  };

  useEffect(() => { void clearMessage(); }, [clearMessage]);

  return (
    <div className="party-panel">
      <div className="panel-scroll">
        {invites.length > 0 && (
          <section className="party-section">
            <div className="party-section-title">邀請</div>
            <ul className="party-list">
              {invites.map(inv => (
                <li key={inv.id} className="party-row">
                  <span className="party-row-main">{inv.fromName} 邀請你加入公會「{inv.guildName}」</span>
                  <button className="party-action-btn" onClick={() => void accept(inv.id)}>接受</button>
                  <button className="party-action-btn is-secondary" onClick={() => void decline(inv.id)}>拒絕</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="party-section">
          {!guild ? (
            <>
              <div className="party-section-title">尚未加入公會</div>
              <div className="party-empty">到城鎮的公會 NPC 可以建立公會</div>
            </>
          ) : (
            <>
              <div className="party-section-title">
                {guild.name}（{guild.members.length}/{guild.capacity}）
              </div>
              {leader && <InviteByName invite={invite} disabled={full} />}
              <ul className="party-list">
                {guild.members.map(m => {
                  const isLeader = m.characterId === guild.leaderId;
                  return (
                    <li key={m.characterId} className={`party-row${m.online ? '' : ' is-offline'}`}>
                      {/* 一行：名稱、職業等級；離線不寫字，整列變暗（§ 11.7） */}
                      <div className="party-row-main guild-member-line">
                        <span className={`party-row-name${isLeader ? ' guild-leader-name' : ''}`}>
                          {isLeader && <span className="guild-leader-mark" title="盟主">♛</span>}
                          {m.name}
                          <span className="party-row-class">{CLASS_NAMES_ZH[m.className]} Lv.{m.level}</span>
                        </span>
                      </div>
                      {confirmKick === m.characterId ? (
                        <>
                          <span className="guild-kick-confirm">確定踢除？</span>
                          <button className="party-action-btn is-danger" onClick={() => { setConfirmKick(null); void kick(m.characterId); }}>確定踢除</button>
                          <button className="party-action-btn is-secondary" onClick={() => setConfirmKick(null)}>取消</button>
                        </>
                      ) : (
                      <>
                      {/* 對其他成員：密語、交易、組隊邀請只對在線的人（§ 11.7） */}
                      {m.characterId !== myId && (
                        <>
                          <button className="party-action-btn is-secondary" title="密語" disabled={!m.online} onClick={() => whisper(m.name)}>密語</button>
                          <button className="party-action-btn is-secondary" title="提出交易" disabled={!m.online} onClick={() => void offerTrade(m.characterId)}>交易</button>
                          {!inMyParty(m.characterId) && (
                            <button className="party-action-btn" title="邀請組隊" disabled={!m.online || !canPartyInvite} onClick={() => void partyInvite(m.characterId)}>邀請</button>
                          )}
                        </>
                      )}
                      {leader && !isLeader && (
                        <button className="party-action-btn is-danger" onClick={() => setConfirmKick(m.characterId)}>踢除</button>
                      )}
                      </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {!leader && (
                <div className="party-controls">
                  <button className="party-action-btn is-danger" onClick={() => void leave()}>退出公會</button>
                </div>
              )}
            </>
          )}
        </section>

        {message && <div className="party-message" role="status">{message}</div>}
        {partyMessage && <div className="party-message" role="status">{partyMessage}</div>}
      </div>
    </div>
  );
}
