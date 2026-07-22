import { Container } from 'pixi.js';

export class EffectLayer {
  public container: Container;

  constructor() {
    this.container = new Container();
  }

  clear(): void {
    this.container.removeChildren();
  }

  destroy(): void {
    this.container.removeChildren();
  }
}
