/**
 * 武器必須依 slot 語意取用，不可依陣列位置。
 *
 * 傳進戰鬥系統的 `equippedGear` 是 `Object.values(record).filter(Boolean)` 拍平的，
 * 順序＝ record 的 key 插入順序（instance id 順序）。玩家換掉新手武器後，
 * `rightHand` 會排到防具之後 —— 舊實作取 `equippedGear[0]` 就會拿到防具，
 * 導致武器基傷退回保底值 1、額外攻擊／攻擊成功／材質克制／火矢的 isBow 判定全部失效。
 *
 * 這裡的排列一律「武器放最後」，正是舊實作會漏掉的 case。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { ActiveEffect } from '../../models/effect';
import type { MonsterInstance } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';
import { useGameStore } from '../../stores/gameStore';
import { getEquippedWeapon } from '../combat';
import { processPlayerAttack } from '../arpgEventHandler';
import { evaluateCombatScript } from '../scriptRunner';
import { instantiateFromTemplate } from '../../models/skillTemplate';

function armor(name: string, slot: EquipmentInstance['slot'], defense: number): EquipmentInstance {
  return {
    templateId: 0, name, type: 'armor', slot, isTwoHanded: false,
    defense, ownerId: 1, quality: 0, enhancement: 0, affixes: [], equipped: true,
  } as EquipmentInstance;
}

/** 獵人長弓（seed id 44）：8/7、攻擊成功 +2、額外攻擊 +2、木材質 */
function hunterBow(affixes: EquipmentInstance['affixes'] = []): EquipmentInstance {
  return {
    templateId: 44, name: '獵人長弓', type: 'bow', slot: 'rightHand', isTwoHanded: true,
    smallMonsterDamage: 8, largeMonsterDamage: 7, attackSuccess: 2, extraAttack: 2,
    material: 'wood', ownerId: 1, quality: 0, enhancement: 0, affixes, equipped: true,
  } as EquipmentInstance;
}

/** 新手劍（seed id 203）：4/3 */
function starterSword(): EquipmentInstance {
  return {
    templateId: 203, name: '新手劍', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 4, largeMonsterDamage: 3, attackSuccess: 0, extraAttack: 0,
    material: 'iron', ownerId: 1, quality: 0, enhancement: 0, affixes: [], equipped: true,
  } as EquipmentInstance;
}

/** 石像鬼（`28-monster-stats.md` 試煉高地）：Lv.22 / 防禦 10 / 大型 / 惡魔 / 地 */
function gargoyle(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 22, currentHp: 130, maxHp: 130,
    attackMin: 15, attackMax: 22, defense: 10, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  } as MonsterInstance;
}

function elfLv28(): Character {
  return {
    userId: 1, name: '夏天', className: 'elf', level: 28, exp: 0, expToNext: 100,
    hp: 400, maxHp: 400, mp: 218, maxMp: 218,
    baseAttributes: { STR: 14, AGI: 16, VIT: 18, SPI: 12, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0, gold: 0,
    currentArea: 'trial-highlands', currentZone: 'trial-highlands', currentRegion: 'trial-highlands',
    currentFloor: 1, skills: [], quests: [], areaEnteredAt: Date.now(), createdAt: Date.now(),
  } as Character;
}

function fireEnchant(): ActiveEffect {
  return {
    id: 'buff-fire-arrow', sourceSkillId: 'fire-arrow', sourceSkillName: '火矢附魔',
    category: 'fire-enchant', type: 'buff', target: 'player',
    modifiers: [{ stat: 'fire_damage', value: 15, isPercent: false }],
    startTime: Date.now(), duration: 300_000,
    tags: [], name: '火矢附魔', description: '',
  };
}

function mapMonster(id: string): MapMonster {
  return {
    id, position: { x: 0, y: 0 }, targetPosition: { x: 0, y: 0 }, speed: 1,
    path: [], pathIndex: 0, pathRecalcTimer: 0, moveTimer: 0,
    lastPathPlayerPos: { x: 0, y: 0 }, isBoss: false,
  } as MapMonster;
}

function attackOnce(
  character: Character,
  equippedGear: (EquipmentInstance | null)[],
  monster: MonsterInstance,
  activeEffects: ActiveEffect[] = [],
): number {
  const monsterId = 'monster-1';
  useGameStore.setState({ character, skills: [], equippedGear: {}, activeEffects });
  const result = processPlayerAttack(
    { type: 'player_attack', action: { type: 'normal_attack' }, targetMonsterIds: [monsterId] },
    {
      character, equippedGear, activeEffects, skills: [],
      monsterInstances: new Map([[monsterId, monster]]),
      mapMonsters: [mapMonster(monsterId)],
    },
  );
  return result.damages[0].damage;
}

describe('getEquippedWeapon', () => {
  it('右手優先，與陣列位置無關', () => {
    const bow = hunterBow();
    const gear = [armor('新手皮帽', 'helmet', 1), armor('新手皮甲', 'chest', 2), bow];
    expect(getEquippedWeapon(gear)).toBe(bow);
  });

  it('右手空手時才取左手', () => {
    const shield = {
      templateId: 208, name: '新手盾', type: 'shield', slot: 'leftHand', isTwoHanded: false,
      defense: 4, blockRate: 4, ownerId: 1, quality: 0, enhancement: 0, affixes: [], equipped: true,
    } as EquipmentInstance;
    expect(getEquippedWeapon([armor('新手鐵盔', 'helmet', 1), shield])).toBe(shield);
  });

  it('全身只有防具時回傳 null，不會誤把防具當武器', () => {
    expect(getEquippedWeapon([armor('新手皮帽', 'helmet', 1)])).toBeNull();
  });
});

describe('普攻傷害不受 equippedGear 排列影響', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({ character: null, skills: [], equippedGear: {}, activeEffects: [] });
  });

  it('妖精持獵人長弓＋火矢附魔打石像鬼：武器排最後仍為 31', () => {
    // 0.5：命中（50 < 命中率 88）且不暴擊（50 >= 爆擊率 5）
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const bow = hunterBow([
      { type: 'attack_power', tier: 3, value: 9 },
      { type: 'attack_elemental', tier: 3, value: 9 },
    ]);
    // 武器刻意排在最後：玩家換過武器後讀檔就是這個順序
    const gear = [
      armor('新手皮帽', 'helmet', 1),
      armor('新手皮甲', 'chest', 2),
      armor('新手皮手套', 'gloves', 1),
      armor('新手皮靴', 'boots', 1),
      bow,
    ];

    // 基礎 = 大怪基傷 7 + 額外攻擊 2 + STR加成 7 + 火矢 15 = 31
    // → ×1.09 = 33 → ×1.09 = 35 → 防禦 10% → floor(35 × 0.9) = 31
    expect(attackOnce(elfLv28(), gear, gargoyle(), [fireEnchant()])).toBe(31);
  });

  it('近戰（新手劍）武器排最後仍吃得到武器基傷', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const gear = [armor('新手鎖甲', 'chest', 3), starterSword()];
    // 基礎 = 大怪基傷 3 + 額外攻擊 0 + STR加成 7 = 10 → 防禦 10% → floor(10 × 0.9) = 9
    expect(attackOnce(elfLv28(), gear, gargoyle())).toBe(9);
  });

  it('武器排最後時不會退化成「無武器」的保底傷害', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const gearNoWeapon = [armor('新手皮帽', 'helmet', 1)];
    // 空手：保底基傷 1 + STR加成 7 = 8 → floor(8 × 0.9) = 7
    expect(attackOnce(elfLv28(), gearNoWeapon, gargoyle())).toBe(7);

    const gearWeaponLast = [armor('新手皮帽', 'helmet', 1), hunterBow()];
    expect(attackOnce(elfLv28(), gearWeaponLast, gargoyle())).toBeGreaterThan(7);
  });
});

describe('requiredWeaponType 實際擋招', () => {
  const tripleShot = instantiateFromTemplate('triple-shot', 0)!;

  function ctx(weaponType: string | undefined) {
    const character = elfLv28();
    return {
      character, monsters: [gargoyle()], skills: [tripleShot],
      now: Date.now(), cooldownReduction: 0, weaponType,
    };
  }

  const rules = [
    { id: 'r1', enabled: true, condition: { type: 'always' as const }, action: { type: 'skill' as const, skillId: 'triple-shot' } },
  ];

  it('持弓時可施放三連射', () => {
    expect(evaluateCombatScript(rules as never, ctx('bow') as never)).toEqual({ type: 'skill', skillId: 'triple-shot' });
  });

  it('持劍時不可施放三連射（§ 23.4【需裝備弓】）', () => {
    expect(evaluateCombatScript(rules as never, ctx('sword') as never)).toBeNull();
  });

  it('空手時不可施放三連射', () => {
    expect(evaluateCombatScript(rules as never, ctx(undefined) as never)).toBeNull();
  });
});
