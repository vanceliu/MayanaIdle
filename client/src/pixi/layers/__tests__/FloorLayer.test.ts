import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { MapData } from '../../../models/mapControl';
import { FloorLayer } from '../FloorLayer';

const testMap: MapData = {
  id: 'floor-layer', name: 'Floor Layer', width: 3, height: 3, theme: 'grassland',
  spawnPoint: { x: 0, y: 0 },
  tiles: [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
};

describe('FloorLayer', () => {
  it('renders ground tiles in the floor container', () => {
    const floorLayer = new FloorLayer();
    const entityContainer = new Container();
    const unrelatedEntity = new Graphics();
    entityContainer.addChild(unrelatedEntity);

    floorLayer.buildFromMap(testMap, entityContainer);

    expect(floorLayer.container.children).toHaveLength(1);
    expect(entityContainer.children).toHaveLength(1);
    expect(entityContainer.children).toContain(unrelatedEntity);
  });

  it('rebuilds without removing unrelated entities', () => {
    const floorLayer = new FloorLayer();
    const entityContainer = new Container();
    const unrelatedEntity = new Graphics();
    entityContainer.addChild(unrelatedEntity);

    floorLayer.buildFromMap(testMap, entityContainer);
    floorLayer.buildFromMap(testMap, entityContainer);

    expect(entityContainer.children).toHaveLength(1);
    expect(entityContainer.children).toContain(unrelatedEntity);
  });
});
