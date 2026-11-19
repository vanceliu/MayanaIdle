/**
 * @vitest-environment jsdom
 *
 * 遺產頁（`45-legacy-archive.md` § 45.3）：一次只看一季、缺欄位顯示「—」、刪除前確認。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LegacyArchivePage } from '../LegacyArchivePage';
import type { LegacyArchive } from '../../models/legacyArchive';

const archive = (id: number, season: number, label: string, payload: object): LegacyArchive => ({
  id, type: 'character', label, className: 'knight', level: 50, dataVersion: 14, season, archivedAt: 0, payload: JSON.stringify(payload),
});
const ARCHIVES = [
  archive(1, 0, '舊騎士', { character: { name: '舊騎士', className: 'knight', level: 50 } }),
  archive(2, 1, '新騎士', { character: { name: '新騎士', className: 'knight', level: 90, gold: 7 } }),
];

function renderPage(onDelete = vi.fn(async () => true)) {
  render(
    <LegacyArchivePage
      archives={ARCHIVES}
      loadArchive={async id => ARCHIVES.find(a => a.id === id) ?? null}
      onDelete={onDelete}
      onBack={() => {}}
    />,
  );
  return onDelete;
}

afterEach(cleanup);

describe('LegacyArchivePage', () => {
  it('預設最新一季，下拉切換季別只列該季', async () => {
    renderPage();
    const select = screen.getByRole('combobox', { name: '季別' }) as HTMLSelectElement;
    expect(select.value).toBe('1');
    expect(screen.queryByText('舊騎士')).toBeNull();
    fireEvent.change(select, { target: { value: '0' } });
    expect(screen.getByRole('button', { name: /舊騎士/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /新騎士/ })).toBeNull();
  });

  it('快照缺的欄位顯示「—」', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('經驗').nextSibling?.textContent).toBe('—'));
    expect(screen.getByText('金幣').nextSibling?.textContent).toBe('7');
  });

  it('刪除前要確認，取消就不刪', async () => {
    const onDelete = renderPage();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const del = await screen.findByRole('button', { name: '刪除這筆遺產' });
    fireEvent.click(del);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(del);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(2));
    confirm.mockRestore();
  });
});
