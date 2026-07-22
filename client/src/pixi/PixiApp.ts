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

    this._initPromise = this.app.init({
      resizeTo: options.resizeTo,
      backgroundColor: options.backgroundColor ?? 0x1a1a2e,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    await this._initPromise;

    this.app.stage.addChild(this.worldContainer);
    this._initialized = true;

    this.app.renderer.on('resize', (width: number, height: number) => {
      this.camera.setViewport(width, height);
    });

    const { width, height } = this.app.renderer;
    this.camera.setViewport(width, height);
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
