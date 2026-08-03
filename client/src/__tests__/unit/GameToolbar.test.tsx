// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GameToolbar } from '../../App';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';

/**
 * § 19.9：匯出檔含角色的排行榜寫入密鑰，等同密碼；
 * 匯入則會連名稱與線上身分一起覆蓋。兩者都必須在動作前講清楚。
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

describe('GameToolbar 匯出／匯入', () => {
  it('匯出前先警告檔案等同密碼', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameToolbar />);

    fireEvent.click(screen.getByText('匯出'));

    await waitFor(() => expect(downloadExport).toHaveBeenCalled());
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('等同密碼');
  });

  it('取消警告時完全不產生檔案', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GameToolbar />);

    fireEvent.click(screen.getByText('匯出'));

    // 連加密都不做 —— 檔案根本沒被產生出來
    expect(exportCharacterData).not.toHaveBeenCalled();
    expect(downloadExport).not.toHaveBeenCalled();
  });

  it('匯入的確認訊息要說明名稱與排行榜身分也會被覆蓋', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GameToolbar />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['blob'], 'save.dat');
    fireEvent.change(input, { target: { files: [file] } });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('名稱與排行榜身分');
  });
});
