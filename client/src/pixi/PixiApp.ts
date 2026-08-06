import { Application, Container } from 'pixi.js';
import { Camera } from './camera/Camera';

/** 實際採用的渲染解析度：`devicePixelRatio` 夾在上限之內 */
export function renderResolution(maxResolution?: number): number {
  const dpr = (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1;
  return maxResolution ? Math.min(dpr, maxResolution) : dpr;
}

export interface PixiAppOptions {
  resizeTo: HTMLElement;
  backgroundColor?: number;
  /**
   * 每秒最多畫幾幀。省略或 0 ＝ 不限，跟隨螢幕更新率。
   *
   * 手持裝置要給上限（`47-mobile.md` § 47.8）：這是放置遊戲，一開好幾小時，
   * 120Hz 螢幕不限速會發熱耗電，接著被系統降頻 —— 降頻後反而比一開始就設限更卡。
   */
  maxFPS?: number;
  /**
   * 渲染解析度上限。省略 ＝ 不限，直接用 `devicePixelRatio`。
   *
   * 手機的 DPR 常是 3，等於每幀畫 9 倍像素。
   */
  maxResolution?: number;
}

export class PixiApp {
  public app: Application;
  public worldContainer: Container;
  public camera: Camera;

  private _initialized = false;
  private _initPromise: Promise<void> | null = null;

  constructor() {
    this.app = new Application();
    this.worldContainer = new Container();
    this.camera = new Camera(this.worldContainer);
  }

  async init(options: PixiAppOptions): Promise<void> {
    if (this._initialized) return;

    this._initPromise = this.initRenderer(options);
    await this._initPromise;

    this.app.stage.addChild(this.worldContainer);
    // Pixi 的 0 代表不限速；初始化失敗重試會換掉 app，所以要在 init 之後才設
    this.app.ticker.maxFPS = options.maxFPS ?? 0;
    this._initialized = true;

    this.app.renderer.on('resize', (width: number, height: number) => {
      this.camera.setViewport(width, height);
    });

    const { width, height } = this.app.renderer;
    this.camera.setViewport(width, height);
  }

  /**
   * 先以 antialias 初始化；失敗則關閉 antialias 重試一次。
   *
   * 部分瀏覽器（已知 Safari）對 MSAA 使用的 internal format 支援不完整，
   * 會出現 `WebGL: INVALID_ENUM: Internal format is not renderable` 並讓 init 失敗。
   * 失敗後必須換一個全新的 Application —— 失敗的那個已處於半初始化狀態。
   */
  private async initRenderer(options: PixiAppOptions): Promise<void> {
    const baseOptions = {
      resizeTo: options.resizeTo,
      backgroundColor: options.backgroundColor ?? 0x1a1a2e,
      autoDensity: true,
      resolution: renderResolution(options.maxResolution),
    };

    try {
      await this.app.init({ ...baseOptions, antialias: true });
    } catch (err) {
      console.warn('[PixiApp] antialias 初始化失敗，改以無 antialias 重試', err);
      try {
        this.app.destroy(true, { children: true });
      } catch {
        // 半初始化的 app 可能無法正常銷毀，忽略
      }
      this.app = new Application();
      await this.app.init({ ...baseOptions, antialias: false });
    }
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  get ticker() {
    return this.app.ticker;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  async destroy(): Promise<void> {
    if (this._initPromise) {
      await this._initPromise.catch(() => {});
    }
    this._initialized = false;
    try {
      this.app.destroy(true, { children: true });
    } catch {
      // Ignore errors during destroy
    }
  }
}
