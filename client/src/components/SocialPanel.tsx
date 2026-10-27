import { useState } from 'react';
import { usePartyStore } from '../stores/partyStore';
import { useGuildStore } from '../stores/guildStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { useMultiplayer } from '../net/online';
import { PanelDockFace } from './PanelDockFace';
import { PartyPanelContent, OnMapPanelContent } from './PartyPanel';
import { GuildPanelContent } from './GuildPanel';

/**
 * 社群視窗（`97-selfhosted-server.md` § 97.7.5）：隊伍／公會／在線三分頁，順序固定、預設隊伍。
 * 單機世界不出現。
 */
export type SocialTab = 'party' | 'guild' | 'onmap';

export const SOCIAL_TABS: readonly { id: SocialTab; label: string }[] = [
  { id: 'party', label: '隊伍' },
  { id: 'guild', label: '公會' },
  { id: 'onmap', label: '在線' },
];

/** 徽章＝待處理的邀請數：隊伍邀請＋公會邀請（`34-ui-guidelines.md` § 34.10 數量徽章） */
export function SocialButton() {
  const online = useMultiplayer();
  const partyInvites = usePartyStore(s => s.invites.length);
  const guildInvites = useGuildStore(s => s.invites.length);
  const isOpen = usePanelWindowStore(s => s.open.social);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();
  if (!online) return null;
  const invites = partyInvites + guildInvites;

  return (
    <button
      className={`panel-dock-btn social-btn ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('social', isMobile)}
      {...panelButtonA11y('social')}
    >
      <PanelDockFace panelKey="social" />
      {invites > 0 && <span className="quest-count-badge">{invites}</span>}
    </button>
  );
}

export function SocialPanelContent() {
  const [tab, setTab] = useState<SocialTab>('party');
  const partyInvites = usePartyStore(s => s.invites.length);
  const guildInvites = useGuildStore(s => s.invites.length);
  const pending: Record<SocialTab, number> = { party: partyInvites, guild: guildInvites, onmap: 0 };

  return (
    <div className="social-panel">
      <div className="storage-tabs" role="tablist">
        {SOCIAL_TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {pending[t.id] > 0 && <span className="social-tab-badge">{pending[t.id]}</span>}
          </button>
        ))}
      </div>
      {tab === 'party' && <PartyPanelContent />}
      {tab === 'guild' && <GuildPanelContent />}
      {tab === 'onmap' && <OnMapPanelContent />}
    </div>
  );
}
