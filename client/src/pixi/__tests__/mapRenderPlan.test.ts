import { describe, expect, it } from 'vitest';
import type { MapData } from '../../models/mapControl';
import { createMapRenderPlan } from '../mapRenderPlan';
import { LEVEL_HEIGHT, worldToScreen } from '../utils/isometric';

const map: MapData = {
  id: 'render', name: 'Render', width: 4, height: 3, theme: 'ivory', spawnPoint: { x: 1, y: 1 },
  tiles: [
    [1, 1, 1, 1],
    [1, 0, 0, 1],
    [1, 1, 0, 1],
  ],
};

describe('map render plan', () => {
  it('maps tile catalog roles and theme into pure draw items', () => {
    const plan = createMapRenderPlan(map);
    expect(plan).toHaveLength(map.width * map.height);
    expect(plan.find(item => item.x === 1 && item.y === 1)).toMatchObject({ role: 'ground', theme: 'ivory' });
    expect(plan.find(item => item.x === 0 && item.y === 0)).toMatchObject({ role: 'boundary', elevation: 0 });
  });

  it('projects elevation through the shared isometric transform', () => {
    const ground = worldToScreen(2, 2, 0);
    const raised = worldToScreen(2, 2, 1);
    expect(raised.sx).toBe(ground.sx);
    expect(raised.sy).toBe(ground.sy - LEVEL_HEIGHT);
  });
});
