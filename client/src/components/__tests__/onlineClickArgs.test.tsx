// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { installOnlineProxies } from '../../net/mirror';
import { useGameStore } from '../../stores/gameStore';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../../models/scriptTemplate';
import type { GameConnection } from '../../net/connection';
import { DiscardConfirmModal } from '../DiscardConfirmModal';
import { ScriptEditorContent } from '../ScriptEditorPanel';
import { BagPanel } from '../BagPanel';
import { MailboxContent } from '../MailboxPanel';
import { useMailboxStore } from '../../stores/mailboxStore';
// 這幾個 store 在 import 時掛上 defaultSession；App 會全部載入，測試要自己補
import '../../stores/talentStore';
import '../../stores/mailboxStore';
import '../../stores/partyStore';
import '../../stores/tradeStore';

vi.mock('../CombatScriptEditor', () => ({ CombatScriptEditor: () => null }));
vi.mock('../PersistentScriptEditor', () => ({ PersistentScriptEditor: () => null }));
vi.mock('../../hooks/useEquipmentTemplates', () => ({ useEquipmentTemplates: () => [] }));

/**
 * 線上模式的按鈕不可把 React 事件當參數傳給 RPC 代理：事件物件有循環參照，
 * `JSON.stringify` 失敗時請求根本送不出去（`97-selfhosted-server.md` § 97.2）
 */
describe('線上模式：按鈕送出的 RPC 參數可序列化', () => {
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rpc = vi.fn((_store: string, _name: string, args: unknown[]) => {
      JSON.stringify(args);
      return Promise.resolve(undefined);
    });
    installOnlineProxies({ rpc, send: vi.fn() } as unknown as GameConnection);
  });

  it('丟棄確認：「取消」與點背景都送出 cancelDiscard、不帶參數', () => {
    useGameStore.setState({ pendingDiscard: { kind: 'bag', name: '紅色藥水', itemId: 1, maxAmount: 5 } });
    const { container } = render(<DiscardConfirmModal />);

    fireEvent.click(screen.getByText('取消'));
    fireEvent.click(container.querySelector('.modal-overlay')!);

    expect(rpc.mock.calls).toEqual([['game', 'cancelDiscard', []], ['game', 'cancelDiscard', []]]);
  });

  it('天賦配置「＋」送出 addScriptTemplate、不帶參數', () => {
    useGameStore.setState({ character: null, scriptTemplates: [createDefaultTemplate()], activeTemplateId: DEFAULT_TEMPLATE_ID });
    render(<ScriptEditorContent />);

    fireEvent.click(screen.getByLabelText('新增分頁'));

    expect(rpc).toHaveBeenCalledWith('game', 'addScriptTemplate', []);
  });

  it('背包天賦分頁「整理」送出 setTalentBagOrder，位置表交給 server 存（§ 35.21.1）', () => {
    useGameStore.setState({
      character: { name: 'T', className: 'knight', level: 30, gold: 0, id: 1, userId: 1 } as never,
      equippedGear: {}, inventory: [], bagItems: [], bagSlotMap: {}, talentBagOrder: {},
    });
    render(<BagPanel />);

    fireEvent.click(screen.getByRole('tab', { name: '天賦' }));
    fireEvent.click(screen.getByRole('button', { name: '整理' }));

    expect(rpc).toHaveBeenCalledWith('game', 'setTalentBagOrder', [{}]);
  });

  it('信箱「領取」與「全部領取」只送出 mailbox RPC，天賦重新載入由 server 端 store 負責', () => {
    useMailboxStore.setState({
      characterId: 1,
      mails: [{ id: 7, characterId: 1, sourceKey: 'k', title: '補償', items: [{ type: 'talent_slot', slotTier: 1 }], createdAt: 0, claimedAt: null }],
      unread: 1,
    });
    render(<MailboxContent />);

    fireEvent.click(screen.getByText('領取'));
    fireEvent.click(screen.getByText(/全部領取/));

    expect(rpc.mock.calls).toEqual([['mailbox', 'claim', [7]], ['mailbox', 'claimAll', []]]);
  });
});
