import { describe, it, expect } from 'vitest';
import { createPlayerCombatContext, tickPlayerCombat } from '../playerCombatFSM';
import type { AttackConfig, MonsterInfo, PlayerCombatContext } from '../playerCombatFSM';
import { findAttackPosition, findNearestWalkable } from '../pathfinding';
import { getDistance } from '../lineOfSight';
import type { MapData } from '../../models/mapControl';

const openMap: MapData = {
  id: 'open',
  name: 'Open',
  width: 40,
  height: 20,
  spawnPoint: { x: 0, y: 0 },
  tiles: Array(20).fill(null).map(() => Array(40).fill(0)),
};

const monsterPos = { x: 20, y: 10 };
const monsters: MonsterInfo[] = [{ id: 'm1', index: 0, position: monsterPos, alive: true }];
const bow: AttackConfig = { attackType: 'ranged', range: 15, chaseRange: 15 };

function tickWithIntent(
  playerPos: { x: number; y: number },
  intent: PlayerCombatContext['moveIntent'],
) {
  const ctx = createPlayerCombatContext();
  ctx.moveIntent = intent;
  return tickPlayerCombat(ctx, playerPos, monsters, bow, openMap, 16, false, true);
}

describe('保持距離的落點', () => {
  it('距離不足時退到指定格數，落點標為 exact', () => {
    const result = tickWithIntent({ x: 23, y: 10 }, { kind: 'keep_distance', distance: 8 });
    expect(result.action).toBe('move_to');
    expect(result.moveExact).toBe(true);
    expect(getDistance(result.moveTarget!, monsterPos)).toBe(8);
  });

  it('未指定距離時退到武器射程邊緣（§ 51.4.9）', () => {
    const result = tickWithIntent({ x: 23, y: 10 }, { kind: 'keep_distance' });
    expect(getDistance(result.moveTarget!, monsterPos)).toBe(15);
  });

  it('已經夠遠就不動', () => {
    const result = tickWithIntent({ x: 32, y: 10 }, { kind: 'keep_distance', distance: 8 });
    expect(result.action).not.toBe('move_to');
  });

  it('進逼的落點不是 exact，仍走攻擊位置搜尋', () => {
    const result = tickWithIntent({ x: 2, y: 10 }, { kind: 'close_in', distance: 2 });
    expect(result.action).toBe('move_to');
    expect(result.moveExact).toBeUndefined();
    expect(result.moveTarget).toEqual(monsterPos);
  });

  it('後退落點不可交給 findAttackPosition 解析', () => {
    const result = tickWithIntent({ x: 23, y: 10 }, { kind: 'keep_distance', distance: 8 });
    expect(findAttackPosition(openMap, result.moveTarget!, { x: 23, y: 10 }, 0)).toBeNull();
    expect(findNearestWalkable(openMap, result.moveTarget!, { x: 23, y: 10 })).toEqual(result.moveTarget);
  });
});
