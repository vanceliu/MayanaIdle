import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { MapData } from '../../../models/mapControl';
import { FloorLayer } from '../FloorLayer';

const elevatedMap: MapData = {
  id: 'floor-layer', name: 'Floor Layer', width: 3, height: 3, theme: 'grassland',
  spawnPoint: { x: 0, y: 0 },
  tiles: [
    [0, 0, 0],
    [0, 5, 9],
    [0, 0, 0],
  ],
};

describe('FloorLayer', () => {
  it('keeps ground in the floor container and adds complete platforms and stairs to entities', () => {
    const floorLayer = new FloorLayer();
    const entityContainer = new Container();
    const unrelatedEntity = new Graphics();
    entityContainer.addChild(unrelatedEntity);

    floorLayer.buildFromMap(elevatedMap, entityContainer);

    expect(floorLayer.container.children).toHaveLength(1);
    expect(entityContainer.children).toHaveLength(3);
    expect(entityContainer.children).toContain(unrelatedEntity);
  });

  it('rebuilds its occluders without removing unrelated entities', () => {
    const floorLayer = new FloorLayer();
    const entityContainer = new Container();
    const unrelatedEntity = new Graphics();
    entityContainer.addChild(unrelatedEntity);

    floorLayer.buildFromMap(elevatedMap, entityContainer);
    const firstOccluders = entityContainer.children.filter(child => child !== unrelatedEntity);
    floorLayer.buildFromMap(elevatedMap, entityContainer);

    expect(entityContainer.children).toHaveLength(3);
    expect(entityContainer.children).toContain(unrelatedEntity);
    for (const occluder of firstOccluders) expect(entityContainer.children).not.toContain(occluder);
  });
});
