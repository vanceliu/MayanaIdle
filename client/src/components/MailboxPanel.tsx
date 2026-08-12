import { useMailboxStore } from '../stores/mailboxStore';
import { useTalentStore } from '../stores/talentStore';
import { useGameStore } from '../stores/gameStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { PanelDockFace } from './PanelDockFace';
import type { Mail, MailItem } from '../models/mailbox';
import { getTalentAffixDef } from '../db/seed/talentSeeds';
import { affixLabelOf } from './TalentEditor';

/**
 * 系統信箱（`52-mailbox.md`）
 *
 * **首版只發天賦格**（§ 52.0）。公告分頁、補償、里程碑與其他項目型別都不做。
 */

/**
 * 徽章只算**未領取**封數（§ 52.5）。
 *
 * 指示器掛在「領取」上，**不可掛在「安裝天賦格」上** ——
 * 囤著不裝是正常玩法（T1 格合成 T2 要吃兩個），
 * 掛在安裝上會變成永遠亮著的雜訊（`51-auto-talent.md` § 51.3.4.1）。
 */
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
  const characterId = useGameStore(s => s.character?.id);
  const claimed = mail.claimedAt !== null;

  async function onClaim() {
    if (!await claim(mail.id!)) return;
    // 領到的天賦格進背包「天賦」分頁，未安裝 —— 讓天賦面板立刻看得到
    if (characterId) await useTalentStore.getState().load(characterId);
  }

  return (
    <li className={`mail-row${claimed ? ' is-claimed' : ''}`}>
      <div className="mail-row-main">
        <span className="mail-title">{mail.title}</span>
        <span className="mail-items">{mail.items.map(describeItem).join('、')}</span>
      </div>
      {claimed
        ? <span className="mail-claimed-tag">已領取</span>
        : <button className="mail-claim-btn" onClick={onClaim}>領取</button>}
    </li>
  );
}

export function MailboxContent() {
  const mails = useMailboxStore(s => s.mails);
  const unread = useMailboxStore(s => s.unread);
  const claimAll = useMailboxStore(s => s.claimAll);
  const characterId = useGameStore(s => s.character?.id);

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
      {unread > 0 && (
        <div className="mail-actions">
          <button className="mail-claim-all-btn" onClick={onClaimAll}>
            全部領取（{unread}）
          </button>
        </div>
      )}
      {/* 未領取在上、已領取在下，排序在 `systems/mailbox.ts` 的 listMail */}
      <ul className="mail-list">
        {mails.map(mail => <MailRow key={mail.id} mail={mail} />)}
      </ul>
    </div>
  );
}
