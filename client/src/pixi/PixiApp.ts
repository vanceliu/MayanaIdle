import { Application, Container } from 'pixi.js';
import { Camera } from './camera/Camera';

export interface PixiAppOptions {
  resizeTo: HTMLElement;
  backgroundColor?: number;
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
      resolution: window.devicePixelRatio || 1,
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
