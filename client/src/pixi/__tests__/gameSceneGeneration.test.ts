/** 畫面版本即時切換（`34-ui-guidelines.md` § 34.6「畫面版本」、`38-map-control.md` § 38.9「背景 render 代別」） */
import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { MapData } from '../../models/mapControl';
import { GameScene } from '../GameScene';
import type { PixiApp } from '../PixiApp';

vi.mock('../gen3/themeAssets', () => ({ hasThemeAssets: () => false, loadThemeAssets: () => new Promise(() => {}) }));

const MAP = { id: 'm', name: 'm', width: 4, height: 3, theme: 'grassland', spawnPoint: { x: 1, y: 1 }, tiles: Array.from({ length: 3 }, () => Array(4).fill(0)) } as unknown as MapData;

function fakeApp(): PixiApp {
  return { worldContainer: new Container(), app: { renderer: { resolution: 1 } } } as unknown as PixiApp;
}

describe('GameScene 畫面版本', () => {
  it('切換時換掉背景，路徑、實體、特效層與實體不動', () => {
    const app = fakeApp();
    const scene = new GameScene(app, 2);
    scene.loadMap(MAP);
    const marker = new Container();
    scene.entityLayer.container.addChild(marker);
    const keep = [scene.pathLayer.container, scene.entityLayer.container, scene.effectLayer.container];

    scene.setGeneration(3);
    expect(scene.generation).toBe(3);
    for (const layer of keep) expect(app.worldContainer.children).toContain(layer);
    expect(marker.parent).toBe(scene.entityLayer.container);
    expect(app.worldContainer.children.indexOf(keep[0])).toBeGreaterThan(0);

    scene.setGeneration(2);
    expect(scene.generation).toBe(2);
    expect(marker.parent).toBe(scene.entityLayer.container);
    expect(app.worldContainer.children).toHaveLength(5);
    scene.destroy();
  });
});
