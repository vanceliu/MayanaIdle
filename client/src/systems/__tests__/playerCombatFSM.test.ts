import { describe, it, expect } from 'vitest';
import {
  createPlayerCombatContext,
  tickPlayerCombat,
  getWeaponAttackConfig,
} from '../playerCombatFSM';
import type { MapData } from '../../models/mapControl';

function createMap(tiles: number[][]): MapData {
  return {
    id: 'test',
    name: 'Test Map',
    width: tiles[0].length,
    height: tiles.length,
    tiles,
    spawnPoint: { x: 0, y: 0 },
  };
}

const openMap = createMap([
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0],
]);

describe('getWeaponAttackConfig', () => {
  it('bow is ranged 15', () => {
    const config = getWeaponAttackConfig('bow');
    expect(config.attackType).toBe('ranged');
    expect(config.range).toBe(15);
  });

  it('staff is melee 1.5', () => {
    const config = getWeaponAttackConfig('staff');
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });

  it('sword is melee 1.5', () => {
    const config = getWeaponAttackConfig('onesword');
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });

  it('undefined weapon is melee 1.5', () => {
    const config = getWeaponAttackConfig(undefined);
    expect(config.attackType).toBe('melee');
    expect(config.range).toBe(1.5);
  });
});

describe('tickPlayerCombat', () => {
  it('returns idle when no monsters', () => {
    const ctx = createPlayerCombatContext();
    const result = tickPlayerCombat(ctx, { x: 2, y: 2 }, [], { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('idle');
  });

  it('selects nearest monster as target', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [
      { id: 'm0', index: 0, position: { x: 4, y: 4 }, alive: true },
      { id: 'm1', index: 1, position: { x: 2, y: 3 }, alive: true },
    ];
    tickPlayerCombat(ctx, { x: 2, y: 2 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(ctx.targetMonsterId).toBe('m1');
  });

  it('returns move_to when target out of range', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [{ id: 'm0', index: 0, position: { x: 4, y: 4 }, alive: true }];
    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('move_to');
    expect(ctx.state).toBe('chasing');
  });

  it('enters attacking state when in range', () => {
    const ctx = createPlayerCombatContext();
    const monsters = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];
    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(result.action).toBe('none');
    expect(ctx.state).toBe('attacking');
  });

  it('fires attack after cooldown', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 100;
    const monsters = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];

    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 50);
    expect(ctx.state).toBe('attacking');
    expect(ctx.attackTimer).toBe(50);

    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 60);
    expect(result.action).toBe('attack');
    expect(ctx.attackTimer).toBe(0);
  });

  describe('追擊中的攻擊冷卻', () => {
    const far = [{ id: 'm0', index: 0, position: { x: 8, y: 0 }, alive: true }];
    const melee = { attackType: 'melee' as const, range: 1.5 };

    it('計時器照走，不歸零 —— 走路的時間本來就過去了', () => {
      const ctx = createPlayerCombatContext();
      ctx.attackCooldown = 1000;

      const r = tickPlayerCombat(ctx, { x: 0, y: 0 }, far, melee, openMap, 200);
      expect(r.action).toBe('move_to');
      expect(ctx.state).toBe('chasing');
      expect(ctx.attackTimer).toBe(200);
    });

    it('最多只累積到冷卻的一半 —— 一刀一隻的密集怪群不會把冷卻走光', () => {
      const ctx = createPlayerCombatContext();
      ctx.attackCooldown = 1000;
      for (let i = 0; i < 20; i++) {
        tickPlayerCombat(ctx, { x: 0, y: 0 }, far, melee, openMap, 500);
      }
      expect(ctx.attackTimer).toBe(500);
    });

    it('接敵後仍要等剩下的一半才出手，不是走到就打', () => {
      const ctx = createPlayerCombatContext();
      ctx.attackCooldown = 1000;
      for (let i = 0; i < 10; i++) {
        tickPlayerCombat(ctx, { x: 0, y: 0 }, far, melee, openMap, 500);
      }

      /* 走到定位：計時器停在 500，還差 500 */
      const adjacent = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];
      expect(tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 400).action).toBe('none');
      expect(tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 200).action).toBe('attack');
    });

    it('站定等冷卻累積到超過一半後轉追擊，不會被倒扣', () => {
      const ctx = createPlayerCombatContext();
      ctx.attackCooldown = 1000;
      const adjacent = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];

      /* 腳本沒有可執行動作 → 原地待命，計時器夾在上限 */
      tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 900, false, false);
      expect(ctx.attackTimer).toBe(900);

      /* 怪跑掉轉成追擊：已經等到的不該沒收 */
      tickPlayerCombat(ctx, { x: 0, y: 0 }, far, melee, openMap, 16);
      expect(ctx.attackTimer).toBe(900);
    });
  });

  it('switches target when current dies', () => {
    const ctx = createPlayerCombatContext();
    ctx.targetMonsterId = 'm0';
    const monsters = [
      { id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: false },
      { id: 'm1', index: 1, position: { x: 2, y: 0 }, alive: true },
    ];
    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'melee', range: 1.5 }, openMap, 16);
    expect(ctx.targetMonsterId).toBe('m1');
  });

  it('ranged weapon attacks from distance', () => {
    const bigMap = createMap(Array.from({ length: 20 }, () => Array(20).fill(0)));
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 100;
    const monsters = [{ id: 'm0', index: 0, position: { x: 10, y: 0 }, alive: true }];
    tickPlayerCombat(ctx, { x: 0, y: 0 }, monsters, { attackType: 'ranged', range: 20 }, bigMap, 50);
    expect(ctx.state).toBe('attacking');
  });
});

describe('腳本沒有可執行動作時不出手（§ 41）', () => {
  const adjacent = [{ id: 'm0', index: 0, position: { x: 1, y: 0 }, alive: true }];
  const melee = { attackType: 'melee' as const, range: 1.5 };

  it('怪貼到身上、攻擊冷卻也走完了，仍然不出手', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 1000;

    // hasExecutableAction = false：玩家關掉普通攻擊、技能又都在冷卻
    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 2000, false, false);

    expect(result.action).toBe('none');
    expect(ctx.state).toBe('attacking');
  });

  it('計時器夾在上限而非歸零，冷卻一結束就能立刻出手', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 1000;

    tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 2000, false, false);
    expect(ctx.attackTimer).toBe(1000);

    // 技能一轉好（hasExecutableAction 變 true）就該立刻出手，不必再等一個攻擊間隔
    const next = tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 16, false, true);
    expect(next.action).toBe('attack');
  });

  it('有可執行動作時行為不變，照常出手', () => {
    const ctx = createPlayerCombatContext();
    ctx.attackCooldown = 1000;

    const result = tickPlayerCombat(ctx, { x: 0, y: 0 }, adjacent, melee, openMap, 2000, false, true);

    expect(result.action).toBe('attack');
    expect(ctx.attackTimer).toBe(0);
  });
});
