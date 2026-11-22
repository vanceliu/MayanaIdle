/**
 * 公會 NPC 視窗（`guild-npc.html`，`11-guild.md` § 11.7）：遊戲的 `GuildNpc` 與社群「公會」分頁並排對照。
 * 資料為本機假資料；store 的 action 是單機空實作，按鈕不送出。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useGameStore } from '../src/stores/gameStore';
import { useGuildStore, type GuildInviteView, type GuildView } from '../src/stores/guildStore';
import { GuildPanelContent } from '../src/components/GuildPanel';
import { GuildNpc } from '../src/components/town/GuildNpc';
import { GUILD_CREATE_MIN_LEVEL } from '../src/models/guild';
import type { Character } from '../src/models/character';

const ME = 1;
const now = Date.now();

const GUILD: GuildView = {
  id: 1, name: '星辰', leaderId: ME, capacity: 12,
  members: [
    { characterId: ME, name: 'Alice', className: 'knight', level: 42, online: true, joinedAt: now - 9e6 },
    { characterId: 2, name: 'Bob', className: 'elementalist', level: 38, online: true, joinedAt: now - 8e6 },
    { characterId: 3, name: '小黑', className: 'thief', level: 35, online: true, joinedAt: now - 7e6 },
    { characterId: 4, name: 'Carol', className: 'priest', level: 40, online: false, joinedAt: now - 6e6 },
    { characterId: 5, name: 'Dave', className: 'elf', level: 29, online: false, joinedAt: now - 5e6 },
  ],
};

const INVITES: GuildInviteView[] = [
  { id: 'a', guildId: 7, guildName: '銀翼', fromName: 'Eve', expiresAt: now + 60_000 },
];

type Scenario = 'none-invite' | 'none' | 'low-level' | 'member' | 'leader';
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'none-invite', label: '無公會＋收到邀請' },
  { id: 'none', label: '無公會' },
  { id: 'low-level', label: `無公會、未滿 Lv${GUILD_CREATE_MIN_LEVEL}` },
  { id: 'member', label: '成員' },
  { id: 'leader', label: '盟主' },
];

function apply(scenario: Scenario) {
  const level = scenario === 'low-level' ? GUILD_CREATE_MIN_LEVEL - 3 : 42;
  const id = scenario === 'member' ? 2 : ME;
  useGameStore.setState({ character: { id, name: id === ME ? 'Alice' : 'Bob', className: 'knight', level } as unknown as Character });
  useGuildStore.setState({
    guild: scenario === 'member' || scenario === 'leader' ? GUILD : null,
    invites: scenario === 'none-invite' ? INVITES : [],
    message: null,
  });
}

function Demo() {
  const [scenario, setScenario] = useState<Scenario>('none-invite');
  const pick = (s: Scenario) => { apply(s); setScenario(s); };
  return (
    <>
      <div className="demo-bar">
        {SCENARIOS.map(s => (
          <button key={s.id} className={scenario === s.id ? 'active' : ''} onClick={() => pick(s.id)}>{s.label}</button>
        ))}
      </div>
      <div className="demo-grid">
        <div>
          <h2>公會 NPC</h2>
          <div className="town-modal">
            <div className="town-modal-header">
              <span>公會</span>
              <button className="town-modal-close">✕</button>
            </div>
            <div className="town-modal-body">
              <GuildNpc key={scenario} />
            </div>
          </div>
        </div>
        <div>
          <h2>社群「公會」分頁（對照）</h2>
          <div className="floating-window demo-social">
            <GuildPanelContent key={scenario} />
          </div>
        </div>
      </div>
    </>
  );
}

apply('none-invite');
createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
