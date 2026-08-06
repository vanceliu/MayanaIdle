import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useViewport, useIsMobile, MOBILE_BREAKPOINT } from '../useViewport';
import { installFakeViewport, uninstallFakeViewport, VIEWPORTS } from '../../testing/viewport';

/**
 * @vitest-environment jsdom
 */

function Probe() {
  const { isMobile, isTouch, orientation } = useViewport();
  return <div data-testid="probe">{`${isMobile}|${isTouch}|${orientation}`}</div>;
}

function probeText(): string {
  return screen.getByTestId('probe').textContent ?? '';
}

describe('useViewport', () => {
  afterEach(() => uninstallFakeViewport());

  it('手機直向：isMobile / isTouch / portrait 全中', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    render(<Probe />);
    expect(probeText()).toBe('true|true|portrait');
  });

  it('桌機：三項全不中', () => {
    installFakeViewport(VIEWPORTS.desktop);
    render(<Probe />);
    expect(probeText()).toBe('false|false|landscape');
  });

  it('手機橫向仍算 isMobile 以外的觸控裝置，但版面不再是 mobile 斷點', () => {
    // 852px 已超過斷點，版面走桌機排版；但輸入方式仍是觸控
    installFakeViewport(VIEWPORTS.phoneLandscape);
    render(<Probe />);
    expect(probeText()).toBe('false|true|landscape');
  });

  it('觸控筆電：isTouch 為真但版面照桌機走（兩者不可合併判斷）', () => {
    installFakeViewport({ width: 1440, height: 900, hover: false });
    render(<Probe />);
    expect(probeText()).toBe('false|true|landscape');
  });

  it('轉螢幕時會重新渲染', () => {
    const resize = installFakeViewport(VIEWPORTS.phonePortrait);
    render(<Probe />);
    expect(probeText()).toBe('true|true|portrait');

    act(() => resize(VIEWPORTS.phoneLandscape));
    expect(probeText()).toBe('false|true|landscape');
  });

  it('沒有 matchMedia（SSR／舊測試環境）時退回桌機，不可拋錯', () => {
    uninstallFakeViewport();
    render(<Probe />);
    expect(probeText()).toBe('false|false|landscape');
  });

  it('斷點邊界：斷點值本身算桌機', () => {
    installFakeViewport({ width: MOBILE_BREAKPOINT, height: 1024, hover: true });
    render(<Probe />);
    expect(probeText()).toBe('false|false|portrait');
  });

  it('useIsMobile 與 useViewport().isMobile 一致', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    function ShorthandProbe() {
      return <span data-testid="short">{String(useIsMobile())}</span>;
    }
    render(<><Probe /><ShorthandProbe /></>);
    expect(screen.getByTestId('short').textContent).toBe('true');
    expect(probeText().startsWith('true')).toBe(true);
  });
});
