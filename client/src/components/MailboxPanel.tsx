import { useMailboxStore } from '../stores/mailboxStore';
import { useTalentStore } from '../stores/talentStore';
import { useGameStore } from '../stores/gameStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { PanelDockFace } from './PanelDockFace';
import type { Mail, MailItem } from '../models/mailbox';
import { getTalentAffixDef } from '../db/seed/talentSeeds';
import { affixLabelOf } from './TalentEditor';

/** 系統信箱（`52-mailbox.md`）。首版只發天賦格與補償（§ 52.0） */

/** 徽章只算未領取封數（§ 52.5）。不可掛在「安裝天賦格」上 */
export function MailboxButton() {
  const unread = useMailboxStore(s => s.unread);
  const isOpen = usePanelWindowStore(s => s.open.mail);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();

  return (
    <button
      className={`panel-dock-btn mailbox-btn ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('mail', isMobile)}
      {...panelButtonA11y('mail')}
    >
      <PanelDockFace panelKey="mail" />
      {unread > 0 && <span className="quest-count-badge">{unread}</span>}
    </button>
  );
}

function describeItem(item: MailItem): string {
  switch (item.type) {
    case 'talent_slot':
      return `天賦格 T${item.slotTier ?? 1}`;
    case 'talent_affix': {
      const def = item.affixDefId !== undefined ? getTalentAffixDef(item.affixDefId) : undefined;
      return def ? `${affixLabelOf(def)}（T${def.tier}）` : '鑲材';
    }
    case 'gold':
      return `${item.amount ?? 0} 金幣`;
    default:
      return '未知項目';
  }
}

function MailRow({ mail }: { mail: Mail }) {
  const claim = useMailboxStore(s => s.claim);
  const remove = useMailboxStore(s => s.remove);
  const characterId = useGameStore(s => s.character?.id);
  const claimed = mail.claimedAt !== null;

  async function onClaim() {
    if (!await claim(mail.id!)) return;
    // 領到的天賦格進背包「天賦」分頁，未安裝
    if (characterId) await useTalentStore.getState().load(characterId);
  }

  return (
    <li className={`mail-row${claimed ? ' is-claimed' : ''}`}>
      <div className="mail-row-main">
        <span className="mail-title">{mail.title}</span>
        <span className="mail-items">{mail.items.map(describeItem).join('、')}</span>
      </div>
      {/* 已領取的才有刪除鈕（§ 52.4） */}
      {claimed
        ? (
          <button
            className="mail-delete-btn"
            aria-label="刪除"
            title="刪除這封信"
            onClick={() => void remove(mail.id!)}
          >
            ✕
          </button>
        )
        : <button className="mail-claim-btn" onClick={onClaim}>領取</button>}
    </li>
  );
}

export function MailboxContent() {
  const mails = useMailboxStore(s => s.mails);
  const unread = useMailboxStore(s => s.unread);
  const claimAll = useMailboxStore(s => s.claimAll);
  const purgeClaimed = useMailboxStore(s => s.purgeClaimed);
  const characterId = useGameStore(s => s.character?.id);
  const claimedCount = mails.length - unread;

  async function onClaimAll() {
    if (await claimAll() > 0 && characterId) {
      await useTalentStore.getState().load(characterId);
    }
  }

  if (mails.length === 0) {
    return <div className="mail-empty">目前沒有信件</div>;
  }

  return (
    <div className="mailbox-content">
      {(unread > 0 || claimedCount > 0) && (
        <div className="mail-actions">
          {unread > 0 && (
            <button className="mail-claim-all-btn" onClick={onClaimAll}>
              全部領取（{unread}）
            </button>
          )}
          {claimedCount > 0 && (
            <button className="mail-purge-btn" onClick={() => void purgeClaimed()}>
              清除已領取（{claimedCount}）
            </button>
          )}
        </div>
      )}
      {/* 未領取在上、已領取在下，排序在 `systems/mailbox.ts` 的 listMail */}
      <ul className="mail-list">
        {mails.map(mail => <MailRow key={mail.id} mail={mail} />)}
      </ul>
    </div>
  );
}
