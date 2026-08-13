import { describe, it, expect, vi } from 'vitest';
import { processPlayerAttack } from '../arpgEventHandler';
import { SKILL_CATALOG } from '../../models/skill';
import type { MonsterInstance } from '../../models/monster';

vi.mock('../../stores/gameStore', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return {
    ...actual,
    useGameStore: { getState: () => ({ skills: [], activeEffects: [] }), setState: () => {} },
  };
});

/*
 * 日誌與傷害數字都走 `damages[].hits`（`21-combat-formula.md` § 21.4：一下一行）。
 * 單下判定的技能（魔法、快照型物理）不填 `hits`，補得太晚的話
 * 日誌迴圈跑空陣列 —— 火球那類技能會完全沒有日誌，數字也不會跳。
 */
function attack(skillId: string) {
  const skill = { ...SKILL_CATALOG.find(s => s.id === skillId)!, lastUsedAt: 0 };
  const monster = {
    templateId: 1, name: '風蝎', level: 10, currentHp: 500, maxHp: 500,
    attackMin: 1, attackMax: 2, defense: 5, exp: 1, race: 'beast', size: 'small',
    element: 'none', isBoss: false, attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  } as unknown as MonsterInstance;

  return processPlayerAttack(
    {
      type: 'player_attack',
      action: { type: 'skill', skillId },
      targetMonsterIds: ['m1'],
      skill,
      attackType: 'magic',
    } as never,
    {
      character: {
        level: 10, hp: 100, maxHp: 100, mp: 100, maxMp: 100,
        baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 20, CHA: 10 },
        bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      } as never,
      equippedGear: [],
      activeEffects: [],
      skills: [skill],
      monsterInstances: new Map([['m1', monster]]),
      mapMonsters: [{ id: 'm1', position: { x: 1, y: 0 } }] as never,
    },
  );
}

describe('技能的日誌與傷害明細', () => {
  it('魔法技能有日誌，且帶技能名稱', () => {
    const result = attack('fireball');
    expect(result.logs.map(l => l.text)).toEqual([
      expect.stringContaining('火球'),
    ]);
    expect(result.logs[0].text).toContain('造成');
  });

  // 傷害數字逐下播，`hits` 空的話一個都不會跳
  it('魔法技能的傷害明細至少一筆', () => {
    const result = attack('fireball');
    expect(result.damages).toHaveLength(1);
    expect(result.damages[0].hits.length).toBeGreaterThan(0);
    expect(result.damages[0].hits[0].damage).toBe(result.damages[0].damage);
  });
});
