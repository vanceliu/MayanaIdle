import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../Tooltip';
import { installFakeViewport, uninstallFakeViewport, VIEWPORTS } from '../../testing/viewport';

/**
 * @vitest-environment jsdom
 */

/**
 * `47-mobile.md`：觸控裝置沒有 hover。欄位說明、裝備詳情、技能數值全掛在 tooltip 上，
 * 少了 tap 路徑，這些內容在手機上等於不存在。
 */
describe('Tooltip 觸控路徑（47-mobile）', () => {
  afterEach(() => uninstallFakeViewport());

  function renderTip() {
    render(<Tooltip content={<span>說明文字</span>}><button>欄位</button></Tooltip>);
    return document.querySelector('.tooltip-trigger')!;
  }

  it('觸控裝置：點一下開啟', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    const trigger = renderTip();

    expect(screen.queryByText('說明文字')).toBeNull();
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    expect(screen.getByText('說明文字')).toBeDefined();
  });

  it('觸控裝置：再點同一個收起來', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    const trigger = renderTip();

    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    expect(screen.queryByText('說明文字')).toBeNull();
  });

  /** 觸控沒有「移開」，少了這條路徑 tooltip 會一直卡在畫面上擋住底下的東西 */
  it('觸控裝置：點畫面其他地方收起來', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    const trigger = renderTip();

    fireEvent.pointerUp(trigger, { pointerType: 'touch' });
    expect(screen.getByText('說明文字')).toBeDefined();

    fireEvent.pointerDown(document.body, { pointerType: 'touch' });
    expect(screen.queryByText('說明文字')).toBeNull();
  });

  it('滑鼠事件不會被 tap 路徑攔截（桌機行為不變）', () => {
    installFakeViewport(VIEWPORTS.desktop);
    const trigger = renderTip();

    // pointerType 是 mouse 時 tap 路徑不作用
    fireEvent.pointerUp(trigger, { pointerType: 'mouse' });
    expect(screen.queryByText('說明文字')).toBeNull();
  });
});
