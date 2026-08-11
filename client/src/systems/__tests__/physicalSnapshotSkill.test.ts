/**
 * `21-combat-formula.md` § 21.4a：物理快照技能（盾擊／裂傷斬／挑釁怒吼）。
 *
 *   傷害 = 基礎魔攻 + 基礎物理傷害
 *   基礎魔攻 = 技能攻擊力 + INT加成 + 裝備魔攻 + 元素克制（§ 21.4，與魔法技能同一段）
 *   基礎物理傷害 = floor(((小怪+大怪)/2 + 強化 + 額外攻擊 + STR加成) × (1 + 攻擊力%))
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculatePhysicalSnapshotSkill } from '../combat';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';

function char(overrides: Partial<Character> = {}): Character {
  return {
    name: 'K', className: 'knight', level: 50, exp: 0, expToNext: 1_000_000,
    hp: 500, maxHp: 500, mp: 100, maxMp: 100,
    baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
    ...overrides,
  };
}

function dummy(overrides: Partial<MonsterInstance> = {}): MonsterInstance {
  return {
    templateId: 1, name: '木樁', level: 50, currentHp: 99999, maxHp: 99999,
    attackMin: 1, attackMax: 1, defense: 0, exp: 0,
    race: 'normal', size: 'small', element: 'none', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1200,
    ...overrides,
  };
}

function sword(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 1, name: '測試劍', type: 'sword', slot: 'rightHand',
    isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 10,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  } as EquipmentInstance;
}

function book(overrides: Partial<EquipmentInstance> = {}): EquipmentInstance {
  return {
    templateId: 2, name: '測試魔導書', type: 'magicBook', slot: 'leftHand',
    isTwoHanded: false, magicAttack: 6,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
    ...overrides,
  } as EquipmentInstance;
}

/** 不暴擊 */
function noCrit() { vi.spyOn(Math, 'random').mockReturnValue(0.99); }

afterEach(() => { vi.restoreAllMocks(); });

describe('§ 21.4a 傷害組成', () => {
  it('傷害 = 基礎魔攻 + 基礎物理傷害', () => {
    noCrit();
    const w = sword();
    // 基礎魔攻 = floor(10 × 1.00) + INT加成 floor(10 × (10/2 × 0.08)) = 4 → 14
    // 基礎物理傷害 = (10+10)/2 + STR加成 7 = 17
    const r = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w], '盾擊');
    expect(r.damage).toBe(31);
  });

  it('技能攻擊力為 0 時就是一次普攻的基礎物理傷害', () => {
    noCrit();
    const w = sword();
    expect(calculatePhysicalSnapshotSkill(char(), 0, 'none', w, dummy(), [w]).damage).toBe(17);
  });
});

describe('§ 21.4a 吃哪些來源', () => {
  it('換更高基傷的武器會提升傷害', () => {
    noCrit();
    const weak = sword();
    const strong = sword({ smallMonsterDamage: 30, largeMonsterDamage: 30 });
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', weak, dummy(), [weak]).damage;
    const b = calculatePhysicalSnapshotSkill(char(), 10, 'none', strong, dummy(), [strong]).damage;
    expect(b - a).toBe(20);
  });

  it('強化與額外攻擊都計入', () => {
    noCrit();
    const plain = sword();
    const geared = sword({ enhancement: 5, extraAttack: 4 });
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', plain, dummy(), [plain]).damage;
    const b = calculatePhysicalSnapshotSkill(char(), 10, 'none', geared, dummy(), [geared]).damage;
    expect(b - a).toBe(9);
  });

  it('STR 加成計入（每 2 點 +1）', () => {
    noCrit();
    const w = sword();
    const strong = char({ baseAttributes: { STR: 20, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 } });
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w]).damage;
    const b = calculatePhysicalSnapshotSkill(strong, 10, 'none', w, dummy(), [w]).damage;
    expect(b - a).toBe(3); // STR 14→20：有效力量 /2 = 7→10
  });

  it('攻擊力%詞綴生效', () => {
    noCrit();
    const plain = sword();
    const withAtk = sword({ affixes: [{ type: 'attack_power', tier: 5, value: 20 }] });
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', plain, dummy(), [plain]).damage;
    const b = calculatePhysicalSnapshotSkill(char(), 10, 'none', withAtk, dummy(), [withAtk]).damage;
    // 17 × 1.20 = 20.4 → 20，技能攻擊力那一段不吃乘區
    expect(b - a).toBe(3);
  });

  it('元素刻印%不生效（那是普攻的乘區）', () => {
    noCrit();
    const plain = sword();
    const branded = sword({ affixes: [{ type: 'element_brand', tier: 7, value: 20, element: 'fire' }] });
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', plain, dummy(), [plain]).damage;
    const b = calculatePhysicalSnapshotSkill(char(), 10, 'none', branded, dummy(), [branded]).damage;
    expect(b).toBe(a);
  });

  it('INT 加成照 § 21.4 生效（技能側與魔法技能一致）', () => {
    noCrit();
    const w = sword();
    const lowInt = char({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 4, CHA: 12 } });
    const highInt = char({ baseAttributes: { STR: 14, AGI: 14, VIT: 16, SPI: 10, INT: 34, CHA: 12 } });
    const a = calculatePhysicalSnapshotSkill(lowInt, 10, 'none', w, dummy(), [w]).damage;
    const b = calculatePhysicalSnapshotSkill(highInt, 10, 'none', w, dummy(), [w]).damage;
    // § 20.6 每 2 點 +9.5%：有效INT 4 → floor(10 × 0.19) = 1；有效INT 34 → floor(10 × 1.615) = 16
    expect(a).toBe(28);
    expect(b).toBe(43);
  });

  it('裝備魔攻照 § 21.4 乘在技能攻擊力上（日後有魔攻裝備時吃得到）', () => {
    noCrit();
    const w = sword();
    const a = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w]).damage;
    const b = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w, book({ magicAttack: 50 })]).damage;
    // § 21.4 每 1 點魔攻 → +6.5%：魔攻 50 → +325%
    // 技能攻擊力 10 × 4.25 = 42 → 多 32 點
    expect(b - a).toBe(32);
  });
});

describe('§ 21.4a 結算規則', () => {
  it('必定命中：回傳值沒有 miss 概念，隨機值再高也照樣造成傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const w = sword();
    const r = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w]);
    expect(r.damage).toBe(31);
    expect(r.log.type).toBe('skill_hit');
  });

  it('爆擊照普攻規則（基礎 2.0 倍）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const w = sword();
    const r = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy(), [w]);
    expect(r.isCritical).toBe(true);
    expect(r.damage).toBe(62);
    expect(r.log.type).toBe('skill_crit');
  });

  it('怪物防禦減傷上限 75%', () => {
    noCrit();
    const w = sword();
    const r = calculatePhysicalSnapshotSkill(char(), 10, 'none', w, dummy({ defense: 100 }), [w]);
    expect(r.damage).toBe(7); // floor(31 × 25%)
  });

  it('未裝備武器時武器基傷以保底值 1 計', () => {
    noCrit();
    expect(calculatePhysicalSnapshotSkill(char(), 10, 'none', null, dummy(), []).damage).toBe(22);
  });
});

describe('§ 23.3 走本公式的技能', () => {
  const power = (id: string) => CLASS_SKILLS.find(s => s.id === id)!.skill;

  it('盾擊／裂傷斬／挑釁怒吼標記為物理快照，技能攻擊力為 32 / 81 / 65', () => {
    expect(power('shield-bash').physicalSnapshot).toBe(true);
    expect(power('shield-bash').power).toBe(32);
    expect(power('rend').physicalSnapshot).toBe(true);
    expect(power('rend').power).toBe(81);
    expect(power('taunt').physicalSnapshot).toBe(true);
    expect(power('taunt').power).toBe(65);
  });

  it('復仇之刃與背刺不標記（維持技能傷害公式）', () => {
    expect(power('vengeance').physicalSnapshot).toBeUndefined();
    expect(power('backstab').physicalSnapshot).toBeUndefined();
  });

  it('沒有其他技能誤標', () => {
    const marked = CLASS_SKILLS.filter(s => s.skill.physicalSnapshot).map(s => s.id);
    expect(marked.sort()).toEqual(['rend', 'shield-bash', 'taunt']);
  });
});
