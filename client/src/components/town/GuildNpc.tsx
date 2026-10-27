import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useGuildStore, isGuildLeader } from '../../stores/guildStore';
import {
  GUILD_CREATE_MIN_LEVEL, GUILD_NAME_ERROR_MESSAGES, GUILD_NAME_MAX_WIDTH, validateGuildName,
} from '../../models/guild';

/**
 * 公會 NPC（`11-guild.md` § 11.3、§ 11.6）：建立與解散。只在開放世界出現。
 * 判定在 server；這裡的名稱與等級檢查只是提示。
 */
export function GuildNpc() {
  const char = useGameStore(s => s.character);
  const guild = useGuildStore(s => s.guild);
  const message = useGuildStore(s => s.message);
  const create = useGuildStore(s => s.create);
  const disband = useGuildStore(s => s.disband);
  const clearMessage = useGuildStore(s => s.clearMessage);
  const [name, setName] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { void clearMessage(); }, [clearMessage]);

  if (!char) return null;

  if (guild) {
    if (!isGuildLeader(guild, char.id)) {
      return (
        <div className="guild-npc-panel">
          <p className="shop-greeting">「你是公會「{guild.name}」的成員。要退出請到社群視窗的公會分頁。」</p>
          {message && <div className="party-message" role="status">{message}</div>}
        </div>
      );
    }
    return (
      <div className="guild-npc-panel">
        <p className="shop-greeting">「盟主大人，公會「{guild.name}」一切安好。」</p>
        {/* § 11.6：解散需二次確認，全體成員立即變為無公會 */}
        {!confirming ? (
          <button className="party-action-btn is-danger" onClick={() => setConfirming(true)}>解散公會</button>
        ) : (
          <div className="guild-npc-confirm">
            <span>確定要解散「{guild.name}」？全體成員會立即變為無公會，公會倉庫內物品與金幣會一併消失。</span>
            <button className="party-action-btn is-danger" onClick={() => { setConfirming(false); void disband(); }}>確定解散</button>
            <button className="party-action-btn is-secondary" onClick={() => setConfirming(false)}>取消</button>
          </div>
        )}
        {message && <div className="party-message" role="status">{message}</div>}
      </div>
    );
  }

  const levelOk = char.level >= GUILD_CREATE_MIN_LEVEL;
  const trimmed = name.trim();
  const nameError = trimmed ? validateGuildName(trimmed) : null;
  const canCreate = levelOk && !!trimmed && !nameError;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (await create(trimmed)) setName('');
  };

  return (
    <div className="guild-npc-panel">
      <p className="shop-greeting">「想建立自己的公會嗎？取個響亮的名字吧。」</p>
      {!levelOk && <p className="restriction-warning">需要等級 {GUILD_CREATE_MIN_LEVEL} 才能建立公會</p>}
      <form className="party-invite-row" onSubmit={submit}>
        <input
          className="party-invite-input"
          value={name}
          placeholder="公會名稱（最多 6 個中文或 12 個英數字）"
          aria-label="公會名稱"
          maxLength={GUILD_NAME_MAX_WIDTH}
          disabled={!levelOk}
          onChange={e => setName(e.target.value)}
        />
        <button className="party-action-btn" type="submit" disabled={!canCreate}>建立公會</button>
      </form>
      {nameError && <p className="restriction-warning">{GUILD_NAME_ERROR_MESSAGES[nameError]}</p>}
      {message && <div className="party-message" role="status">{message}</div>}
    </div>
  );
}
