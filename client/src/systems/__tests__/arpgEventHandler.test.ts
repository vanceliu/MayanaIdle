import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { useGameStore } from '../../stores/gameStore';
import type { MapMonster } from '../../stores/mapMonsterStore';
import { processPlayerAttack } from '../arpgEventHandler';

function createCharacter(overrides: Partial<Character> = {}): Character {
  return {
    userId: 1,
    name: '元素師',
    className: 'elementalist',
    level: 20,
    exp: 0,
    expToNext: 100,
    hp: 100,
    maxHp: 100,
    mp: 10,
    maxMp: 100,
    baseAttributes: { STR: 8, AGI: 8, VIT: 10, SPI: 14, INT: 18, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: 'ivory-tower-1f',
    currentZone: 'ivory-tower',
    currentRegion: 'ivory-tower',
    currentFloor: 1,
    skills: [],
    quests: [],
    areaEnteredAt: Date.now(),
    createdAt: Date.now(),
    ...overrides,
  };
}

function createMonster(): MonsterInstance {
  return {
    templateId: 1,
    name: '冰晶蝙蝠',
    level: 20,
    currentHp: 100,
    maxHp: 100,
    attackMin: 1,
    attackMax: 1,
    defense: 0,
    exp: 1,
    race: 'normal',
    size: 'small',
    element: 'none',
    isBoss: false,
    attackType: 'melee',
    attackRange: 1.5,
    attackInterval: 1000,
  };
}

function createMapMonster(id: string): MapMonster {
  return {
    id,
    position: { x: 0, y: 0 },
    targetPosition: { x: 0, y: 0 },
    speed: 1,
    path: [],
    pathIndex: 0,
    pathRecalcTimer: 0,
    moveTimer: 0,
    lastPathPlayerPos: { x: 0, y: 0 },
    isBoss: false,
  };
}

describe('processPlayerAttack', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ character: null, skills: [], equippedGear: {} });
  });

  it('restores MP equal to Mana Drain final damage', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const skill = instantiateFromTemplate('mana-drain', 0)!;
    const character = createCharacter({ skills: [skill] });
    const monster = createMonster();
    const monsterId = 'monster-1';

    useGameStore.setState({
      character,
      skills: [skill],
      equippedGear: {},
      activeEffects: [],
    });

    const result = processPlayerAttack(
      {
        type: 'player_attack',
        action: { type: 'skill', skillId: skill.id },
        targetMonsterIds: [monsterId],
        skill,
      },
      {
        character,
        equippedGear: [],
        activeEffects: [],
        skills: [skill],
        monsterInstances: new Map([[monsterId, monster]]),
        mapMonsters: [createMapMonster(monsterId)],
      },
    );

    // 魔力奪取威力 17（§ 23.5）+ INT 加成 floor(17 × (18/2 × 10%)) = 15
    // § 21.4：技能側 (17 + 15) × 0.5 = 16，未裝備武器 → 白字 0
    expect(result.damages[0].damage).toBe(16);
    expect(result.mpRestored).toBe(16);
    expect(useGameStore.getState().character!.mp).toBe(26);
    expect(result.logs).toContainEqual({ text: '魔力奪取 回復 16 MP', type: 'player' });
  });

  /**
   * 三連射：**每箭獨立判定命中**（`23-class-magic.md` § 23.4，
   * 與雙刀／鋼爪的雙擊同一條規則 `21-combat-formula.md` § 21.4）。
   */
  describe('多段物理技能（三連射）', () => {
    /** 妖精、有弓、等級夠 —— 命中率會被 `Math.random` 直接決定 */
    function setup() {
      const skill = instantiateFromTemplate('triple-shot', 0)!;
      const character = createCharacter({
        className: 'elf',
        baseAttributes: { STR: 18, AGI: 18, VIT: 10, SPI: 8, INT: 8, CHA: 10 },
        skills: [skill],
      });
      const bow = {
        id: 1, templateId: 1, name: '短弓', slot: 'rightHand', type: 'bow',
        smallMonsterDamage: 10, largeMonsterDamage: 10, weight: 10,
        enhancement: 0, quality: 100, affixes: [],
      } as never;
      useGameStore.setState({ character, skills: [skill], equippedGear: {}, activeEffects: [] });
      return { skill, character, bow };
    }

    function fire(rolls: number[]) {
      const { skill, character, bow } = setup();
      const monster = createMonster();
      const monsterId = 'monster-1';
      let i = 0;
      /* 每一發先擲命中、再擲爆擊 —— 只餵命中那幾擲，其餘一律不爆 */
      vi.spyOn(Math, 'random').mockImplementation(() => (i < rolls.length ? rolls[i++] : 0.99));

      return processPlayerAttack(
        {
          type: 'player_attack',
          action: { type: 'skill', skillId: skill.id },
          targetMonsterIds: [monsterId],
          skill,
        },
        {
          character,
          equippedGear: [bow],
          activeEffects: [],
          skills: [skill],
          monsterInstances: new Map([[monsterId, monster]]),
          mapMonsters: [createMapMonster(monsterId)],
        },
      );
    }

    it('三發全中：三發的傷害都算進去', () => {
      const all = fire([0, 0.99, 0, 0.99, 0, 0.99]);
      expect(all.damages[0].isMiss).toBe(false);
      expect(all.damages[0].damage).toBeGreaterThan(0);
    });

    it('一發沒中，另外兩發的傷害不會被作廢', () => {
      const allHit = fire([0, 0.99, 0, 0.99, 0, 0.99]).damages[0];
      /* 第二發擲 0.999（必定未命中），該發不再擲爆擊 */
      const oneMiss = fire([0, 0.99, 0.999, 0, 0.99]).damages[0];

      expect(oneMiss.isMiss).toBe(false);
      expect(oneMiss.damage).toBeGreaterThan(0);
      expect(oneMiss.damage).toBeLessThan(allHit.damage);
    });

    it('日誌一下一行，爆擊標在爆的那一行上', () => {
      const r = fire([0, 0, 0, 0.99, 0.999]);
      const lines = r.logs.filter(l => l.text.includes('三連射'));

      /* 三發 → 三行，不是一行寫成 88 + 44 + 44 */
      expect(lines).toHaveLength(3);
      expect(lines.some(l => l.text.includes('+'))).toBe(false);
      expect(lines.some(l => l.text.includes('合計'))).toBe(false);

      /* 第一發爆擊、第三發沒中 —— 各自標在自己那一行 */
      expect(lines[0].text).toContain('（暴擊）');
      expect(lines[1].text).not.toContain('（暴擊）');
      expect(lines[2].text).toContain('MISS');
    });

    it('三發全沒中才算 MISS', () => {
      const result = fire([0.999, 0.999, 0.999]).damages[0];
      expect(result.isMiss).toBe(true);
      expect(result.damage).toBe(0);
    });
  });
});
