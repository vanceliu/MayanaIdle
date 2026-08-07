// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { renderResolution } from '../PixiApp';
import {
  resolveRenderLimits,
  MOBILE_MAX_FPS,
  MOBILE_MAX_RESOLUTION,
  DESKTOP_MAX_FPS,
  DESKTOP_MAX_RESOLUTION,
} from '../renderLimits';
import { isHandheldDevice } from '../../hooks/useViewport';
import { installFakeViewport, uninstallFakeViewport, VIEWPORTS } from '../../testing/viewport';

/**
 * 手持裝置的渲染上限（`34-ui-guidelines.md` § 34.9）。
 *
 * 這是放置遊戲，一開好幾小時；120Hz 螢幕不限速、DPR 3 不設上限，
 * 相當於 60fps／DPR 2 的四倍多像素填充量。
 */

function withDpr(value: number, fn: () => void) {
  const original = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true });
  try {
    fn();
  } finally {
    if (original) Object.defineProperty(window, 'devicePixelRatio', original);
  }
}

describe('渲染解析度上限', () => {
  it('沒有上限時直接用 devicePixelRatio', () => {
    withDpr(3, () => expect(renderResolution(undefined)).toBe(3));
  });

  it('DPR 高於上限時夾到上限', () => {
    withDpr(3, () => expect(renderResolution(2)).toBe(2));
  });

  it('DPR 低於上限時不會被放大', () => {
    withDpr(1, () => expect(renderResolution(2)).toBe(1));
  });

  it('取不到 devicePixelRatio 時退回 1，不可回傳 0 或 NaN', () => {
    withDpr(0, () => expect(renderResolution(2)).toBe(1));
  });
});

describe('手持裝置判定', () => {
  afterEach(() => uninstallFakeViewport());

  /**
   * 判斷走**裝置**而不是版面斷點：手機轉橫向會跨過寬度斷點（852 > 768），
   * 但它還是同一台靠電池的機器，渲染上限不該因此解除。
   */
  it('手機直向與橫向都算手持裝置', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    expect(isHandheldDevice()).toBe(true);

    installFakeViewport(VIEWPORTS.phoneLandscape);
    expect(isHandheldDevice()).toBe(true);
  });

  it('桌機不是手持裝置', () => {
    installFakeViewport(VIEWPORTS.desktop);
    expect(isHandheldDevice()).toBe(false);
  });

  it('沒有 matchMedia（測試環境）時當桌機，不可拋錯', () => {
    uninstallFakeViewport();
    expect(isHandheldDevice()).toBe(false);
  });
});

describe('裝置對應的渲染上限（§ 34.9）', () => {
  afterEach(() => uninstallFakeViewport());

  it('手持裝置：60fps／解析度上限 2', () => {
    installFakeViewport(VIEWPORTS.phonePortrait);
    expect(resolveRenderLimits()).toEqual({ maxFPS: MOBILE_MAX_FPS, maxResolution: MOBILE_MAX_RESOLUTION });
  });

  // 桌機以前兩項都不設限：DPR 2 × 120Hz 等於 1x／60fps 的 8 倍填充量
  it('桌機：60fps／解析度上限 1.5，不再是不限', () => {
    installFakeViewport(VIEWPORTS.desktop);
    expect(resolveRenderLimits()).toEqual({ maxFPS: DESKTOP_MAX_FPS, maxResolution: DESKTOP_MAX_RESOLUTION });
  });

  it('上限數值與 § 34.9 的表一致', () => {
    expect(DESKTOP_MAX_FPS).toBe(60);
    expect(DESKTOP_MAX_RESOLUTION).toBe(1.5);
    expect(MOBILE_MAX_FPS).toBe(60);
    expect(MOBILE_MAX_RESOLUTION).toBe(2);
  });

  it('桌機 DPR 2 會被夾到 1.5', () => {
    withDpr(2, () => expect(renderResolution(DESKTOP_MAX_RESOLUTION)).toBe(1.5));
  });
});
