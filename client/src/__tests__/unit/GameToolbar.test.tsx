// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AccountSettings } from '../../components/AccountSettings';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';

/**
 * § 19.9：匯出檔含角色的排行榜寫入密鑰，等同密碼；
 * 匯入則會連名稱與線上身分一起覆蓋。兩者都必須在動作前講清楚。
 *
 * 這兩顆按鈕已從右下角的常駐工具列搬進設定視窗的「帳號」頁（`47-mobile.md`），
 * 但**確認流程與文案一個字都不能少** —— 換位置不是放寬警告的理由。
 */

const exportCharacterData = vi.fn();
const downloadExport = vi.fn();

vi.mock('../../systems/characterTransfer', () => ({
  exportCharacterData: (...args: unknown[]) => exportCharacterData(...args),
  downloadExport: (...args: unknown[]) => downloadExport(...args),
  importCharacterData: vi.fn(),
}));

beforeEach(() => {
  exportCharacterData.mockReset().mockResolvedValue('encrypted-blob');
  downloadExport.mockReset();
  useGameStore.setState({
    character: { id: 1, name: 'TestHero', className: 'knight' } as Character,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('帳號設定：匯出／匯入', () => {
  it('匯出前先警告檔案等同密碼', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AccountSettings onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '匯出角色' }));

    await waitFor(() => expect(downloadExport).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('等同密碼');
  });

  it('取消警告時完全不產生檔案', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AccountSettings onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: '匯出角色' }));

    // 連加密都不做 —— 檔案根本沒被產生出來
    expect(exportCharacterData).not.toHaveBeenCalled();
    expect(downloadExport).not.toHaveBeenCalled();
  });

  it('匯入的確認訊息要說明名稱與排行榜身分也會被覆蓋', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AccountSettings onClose={() => {}} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['blob'], 'save.dat');
    fireEvent.change(input, { target: { files: [file] } });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('名稱與排行榜身分');
  });
});
