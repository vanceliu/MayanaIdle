import { describe, it, expect } from 'vitest';
import {
  getScriptChaseRange,
  getWeaponAttackConfig,
  createPlayerCombatContext,
  tickPlayerCombat,
  type AttackConfig,
  type MonsterInfo,
} from '../playerCombatFSM';
import type { MapData } from '../../models/mapControl';

/**
 * 追擊距離與出手判定是兩個數字（`41-arpg-combat.md` § 3.1）。
 *
 * 回歸情境：法杖元素師（武器 melee 1.5）用全遠程技能腳本，技能進冷卻時
 * 舊實作會讓射程塌回 1.5，角色每個冷卻空檔往怪身上蹭。
 */

/** 全部可通行、無牆的空地圖，讓視線一律成立（tiles 是二維陣列） */
function openMap(size = 45): MapData {
  return {
    id: 'test',
    name: 'Test Map',
    width: size,
    height: size,
    tiles: Array.from({ length: size }, () => new Array(size).fill(0)),
    spawnPoint: { x: 0, y: 0 },
  };
}

const SKILLS = [
  { id: 'wind-blade', type: 'attack', range: 10 },
  { id: 'fireball', type: 'attack', range: 12 },
  { id: 'ice-fog', type: 'attack', range: 12 },
  { id: 'holy-bolt', type: 'attack', range: 10 },
  { id: 'heal', type: 'heal', range: 0 },
];

function rule(id: string, enabled: boolean, action: { type: string; skillId?: string }) {
  return { id, enabled, action };
}

describe('getScriptChaseRange', () => {
  it('取啟用規則中最遠的技能射程', () => {
    const rules = [
      rule('1', true, { type: 'skill', skillId: 'wind-blade' }),  // 10
      rule('2', true, { type: 'skill', skillId: 'fireball' }),    // 12
    ];
    expect(getScriptChaseRange(rules, SKILLS, 1.5)).toBe(12);
  });

  it('停用的規則不計入 —— 關掉普通攻擊就不該被武器射程拖進近身', () => {
    const rules = [
      rule('1', true, { type: 'skill', skillId: 'fireball' }),
      rule('2', false, { type: 'normal_attack' }),   // 使用者把它關掉了
    ];
    expect(getScriptChaseRange(rules, SKILLS, 1.5)).toBe(12);
  });

  it('啟用普通攻擊時武器射程才計入（但仍取 max）', () => {
    const bow = getWeaponAttackConfig('bow').range;  // 15
    const rules = [
      rule('1', true, { type: 'skill', skillId: 'fireball' }),  // 12
      rule('2', true, { type: 'normal_attack' }),               // 15
    ];
    expect(getScriptChaseRange(rules, SKILLS, bow)).toBe(15);
  });

  it('buff / heal 技能不算站位依據（range 0 是對自己）', () => {
    const rules = [rule('1', true, { type: 'skill', skillId: 'heal' })];
    expect(getScriptChaseRange(rules, SKILLS, 1.5)).toBe(1.5);
  });

  it('一條啟用的攻擊規則都沒有時退回武器射程', () => {
    const rules = [rule('1', false, { type: 'skill', skillId: 'fireball' })];
    expect(getScriptChaseRange(rules, SKILLS, 1.5)).toBe(1.5);
  });

  it('技能沒學會（不在 skills 內）就不計入', () => {
    const rules = [rule('1', true, { type: 'skill', skillId: 'meteor' })];
    expect(getScriptChaseRange(rules, SKILLS, 1.5)).toBe(1.5);
  });
});

describe('冷卻空檔不得往怪身上蹭', () => {
  const map = openMap();
  const monsters: MonsterInfo[] = [
    { id: 'm1', index: 0, position: { x: 20, y: 12 }, alive: true },
  ];
  const playerPos = { x: 20, y: 20 };   // 距離 8
  /** 法杖：出手判定 1.5，但腳本會用到 12 */
  const config: AttackConfig = { attackType: 'melee', range: 1.5, chaseRange: 12 };

  it('技能全在冷卻（hasExecutableAction=false）時原地待命，不發出 move_to', () => {
    const ctx = createPlayerCombatContext();
    const result = tickPlayerCombat(ctx, playerPos, monsters, config, map, 16, false, false);

    expect(result.action).not.toBe('move_to');
    expect(ctx.state).toBe('attacking');
  });

  it('舊行為對照：若沿用 range 當追擊目標就會走向怪物', () => {
    const ctx = createPlayerCombatContext();
    const noChaseRange: AttackConfig = { attackType: 'melee', range: 1.5 };
    const result = tickPlayerCombat(ctx, playerPos, monsters, noChaseRange, map, 16, false, false);

    expect(result.action).toBe('move_to');
    expect(result.moveRange).toBe(1.5);
  });

  it('待命時攻擊計時器繼續累積，冷卻一結束就能出手', () => {
    const ctx = createPlayerCombatContext();
    tickPlayerCombat(ctx, playerPos, monsters, config, map, 500, false, false);
    expect(ctx.attackTimer).toBe(500);
  });

  it('計時器不會超過攻擊間隔（不累積成連發）', () => {
    const ctx = createPlayerCombatContext();
    for (let i = 0; i < 20; i++) {
      tickPlayerCombat(ctx, playerPos, monsters, config, map, 500, false, false);
    }
    expect(ctx.attackTimer).toBe(ctx.attackCooldown);
  });

  it('超出追擊距離時仍會靠近，且只走到 chaseRange 為止', () => {
    const ctx = createPlayerCombatContext();
    const far = { x: 20, y: 40 };  // 距離 20 > 12
    const result = tickPlayerCombat(ctx, far, monsters, config, map, 16, false, false);

    expect(result.action).toBe('move_to');
    expect(result.moveRange).toBe(12);
  });
});

describe('有可執行動作時維持原本行為', () => {
  const map = openMap();
  const monsters: MonsterInfo[] = [
    { id: 'm1', index: 0, position: { x: 20, y: 12 }, alive: true },
  ];

  it('選中的是近戰動作時，仍會走近到武器射程', () => {
    const ctx = createPlayerCombatContext();
    const config: AttackConfig = { attackType: 'melee', range: 1.5, chaseRange: 12 };
    const result = tickPlayerCombat(ctx, { x: 20, y: 20 }, monsters, config, map, 16, false, true);

    expect(result.action).toBe('move_to');
    expect(result.moveRange).toBe(1.5);
  });

  it('選中遠程技能且已在射程內 → 累積計時器並出手', () => {
    const ctx = createPlayerCombatContext();
    const config: AttackConfig = { attackType: 'ranged', range: 12, chaseRange: 12 };
    const result = tickPlayerCombat(ctx, { x: 20, y: 20 }, monsters, config, map, 5000, false, true);

    expect(result.action).toBe('attack');
    expect(result.attackTargetIdx).toBe(0);
  });

  it('暈眩時什麼都不做', () => {
    const ctx = createPlayerCombatContext();
    const config: AttackConfig = { attackType: 'melee', range: 1.5, chaseRange: 12 };
    expect(tickPlayerCombat(ctx, { x: 20, y: 20 }, monsters, config, map, 16, true, false).action)
      .toBe('none');
  });
});
