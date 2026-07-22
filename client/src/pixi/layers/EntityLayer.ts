import { Container } from 'pixi.js';

export class EntityLayer {
  public container: Container;

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  clear(): void {
    this.container.removeChildren();
  }

  destroy(): void {
    this.container.removeChildren();
  }
}
