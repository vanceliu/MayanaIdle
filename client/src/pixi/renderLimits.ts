import { isHandheldDevice } from '../hooks/useViewport';

/**
 * 渲染上限（`34-ui-guidelines.md` § 34.9）。
 *
 * 這是放置遊戲，一開好幾小時，**桌機同樣要設限**：
 * DPR 2 的螢幕不設限等於每幀畫 4 倍像素，120Hz 不限速再乘 2，
 * 加起來是 1x／60fps 的 8 倍填充量 —— 與畫面上有幾個物件無關，
 * 每幀要塗的像素數才是主成本。
 *
 * 判斷走**裝置**而不是版面斷點（`isHandheldDevice`）：手機轉橫向會跨過寬度斷點，
 * 但它還是同一台靠電池的機器。
 *
 * 只在初始化時套用：解析度要換必須重建 renderer，不值得為了轉螢幕重來一次。
 */
export const MOBILE_MAX_FPS = 60;
export const MOBILE_MAX_RESOLUTION = 2;
export const DESKTOP_MAX_FPS = 60;
export const DESKTOP_MAX_RESOLUTION = 1.5;

export interface RenderLimits {
  maxFPS: number;
  maxResolution: number;
}

export function resolveRenderLimits(): RenderLimits {
  return isHandheldDevice()
    ? { maxFPS: MOBILE_MAX_FPS, maxResolution: MOBILE_MAX_RESOLUTION }
    : { maxFPS: DESKTOP_MAX_FPS, maxResolution: DESKTOP_MAX_RESOLUTION };
}
