// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsModal } from '../SettingsModal';
import { useSettingsStore, SCALE_MIN, SCALE_MAX, SCALE_DEFAULT } from '../../stores/settingsStore';

describe('SettingsModal', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.getState().setLinkScales(false);
    useSettingsStore.getState().resetDisplaySettings();
  });

  it('兩條滑桿的範圍是 80%~150%、每 5% 一級', () => {
    render(<SettingsModal onClose={() => {}} />);

    for (const label of ['介面大小', '文字大小']) {
      const slider = screen.getByLabelText(label) as HTMLInputElement;
      expect(slider.min).toBe(String(SCALE_MIN));
      expect(slider.max).toBe(String(SCALE_MAX));
      expect(slider.step).toBe('0.05');
    }
  });

  it('拉動介面滑桿即時寫入 store 並顯示百分比', () => {
    render(<SettingsModal onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('介面大小'), { target: { value: '1.25' } });

    expect(useSettingsStore.getState().uiScale).toBe(1.25);
    expect(screen.getByText('125%')).toBeDefined();
  });

  it('文字滑桿只動文字倍率，不影響介面倍率', () => {
    render(<SettingsModal onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText('文字大小'), { target: { value: '1.4' } });

    expect(useSettingsStore.getState().fontScale).toBe(1.4);
    expect(useSettingsStore.getState().uiScale).toBe(SCALE_DEFAULT);
  });

  describe('介面與文字一起縮放', () => {
    it('勾選後拉介面滑桿，文字倍率跟著同步', () => {
      render(<SettingsModal onClose={() => {}} />);

      fireEvent.click(screen.getByLabelText('介面與文字一起縮放'));
      fireEvent.change(screen.getByLabelText('介面大小'), { target: { value: '1.3' } });

      expect(useSettingsStore.getState().uiScale).toBe(1.3);
      expect(useSettingsStore.getState().fontScale).toBe(1.3);
    });

    it('勾選後拉文字滑桿，介面倍率也跟著同步', () => {
      render(<SettingsModal onClose={() => {}} />);

      fireEvent.click(screen.getByLabelText('介面與文字一起縮放'));
      fireEvent.change(screen.getByLabelText('文字大小'), { target: { value: '0.85' } });

      expect(useSettingsStore.getState().uiScale).toBe(0.85);
      expect(useSettingsStore.getState().fontScale).toBe(0.85);
    });

    it('勾選當下就把文字拉齊到介面大小', () => {
      render(<SettingsModal onClose={() => {}} />);

      fireEvent.change(screen.getByLabelText('介面大小'), { target: { value: '1.2' } });
      fireEvent.change(screen.getByLabelText('文字大小'), { target: { value: '0.9' } });
      fireEvent.click(screen.getByLabelText('介面與文字一起縮放'));

      expect(useSettingsStore.getState().fontScale).toBe(1.2);
    });

    it('取消勾選後兩條滑桿又各走各的', () => {
      render(<SettingsModal onClose={() => {}} />);
      const link = screen.getByLabelText('介面與文字一起縮放');

      fireEvent.click(link);
      fireEvent.click(link);
      fireEvent.change(screen.getByLabelText('文字大小'), { target: { value: '1.45' } });

      expect(useSettingsStore.getState().fontScale).toBe(1.45);
      expect(useSettingsStore.getState().uiScale).toBe(SCALE_DEFAULT);
    });
  });

  it('重設按鈕在預設值時停用，改過之後才可按', () => {
    render(<SettingsModal onClose={() => {}} />);
    const reset = screen.getByRole('button', { name: '重設為 100%' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('介面大小'), { target: { value: '0.8' } });
    expect(reset.disabled).toBe(false);

    fireEvent.click(reset);
    expect(useSettingsStore.getState().uiScale).toBe(SCALE_DEFAULT);
  });

  it('點遮罩或完成都會關閉，點視窗內部不會', () => {
    const onClose = vi.fn();
    // 彈窗掛在 body（portal），不在 render container 裡
    render(<SettingsModal onClose={onClose} />);

    fireEvent.click(document.querySelector('.settings-modal')!);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.modal-overlay')!);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
