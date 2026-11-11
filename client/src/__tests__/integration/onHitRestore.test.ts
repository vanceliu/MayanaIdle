/**
 * 受擊回血／受擊回魔（`07-affix.md` § 7.4）整合測試 —— 走完整條路徑：
 * 生成詞綴 → 裝備 → 被怪打 → 觸發 → HP／MP 實際回復。
 *
 * 規則：
 *  - 詞綴的 % 是**觸發率**；回復比例由觸發率線性換算（§ 7.9）：回血 2.0~4.0%、回魔 2.0~5.0%
 *  - 回復比例不存在裝備上，舊存檔的 `restorePercent` 不採用
 *  - 觸發率與回復比例**都吃裝備品質**
 *  - **受到傷害**才判定：被迴避不算；同一條詞綴出現在多個部位時各自判定
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processMonsterAttack } from '../../systems/arpgEventHandler';
import {
  generateAffixes, getOnHitRestore, getRestorePercent, getAffixTierTable,
  ON_HIT_RESTORE_PERCENT, formatAffixDisplay, type Affix,
} from '../../models/affix';
import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { MonsterInstance } from '../../models/monster';
import type { EquipmentInstance } from '../../models/equipment';
import type { MapMonster } from '../../stores/mapMonsterStore';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 700_000;

function knight(hp = 500, mp = 200): Character {
  return {
    name: 'Tester', className: 'knight', level: 75, exp: 0, expToNext: 100,
    hp, maxHp: 1000, mp, maxMp: 400,
    baseAttributes: { STR: 20, AGI: 10, VIT: 20, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

/** 攻擊固定 60、必定命中（角色迴避由 AGI 決定，測試用 mock 壓住擲骰） */
function attacker(): MonsterInstance {
  return {
    templateId: 12, name: '石像鬼', level: 60, currentHp: 9999, maxHp: 9999,
    attackMin: 60, attackMax: 60, defense: 0, exp: 200,
    race: 'demon', size: 'large', element: 'earth', isBoss: false,
    attackType: 'melee', attackRange: 1.5, attackInterval: 1000,
  };
}

function chest(affixes: Affix[], quality = 0): EquipmentInstance {
  return {
    templateId: 90, name: '測試胸甲', type: 'armor', slot: 'chest', isTwoHanded: false,
    defense: 20, quality, enhancement: 0, affixes, ownerId: 1, equipped: true,
  } as EquipmentInstance;
}

/** T7 上限 7% → 回血 4.0%、回魔 5.0% */
const T7_MAX = 7;
/** 觸發判定必中；換算比例夾在上限（回血 4.0%、回魔 5.0%） */
const ALWAYS = 100;
const onHitHp = (chance = T7_MAX): Affix => ({ type: 'on_hit_hp', tier: 7, value: chance });
const onHitMp = (chance = T7_MAX): Affix => ({ type: 'on_hit_mp', tier: 7, value: chance });

const mapMonsters = [{ id: 'm1', position: { x: 1, y: 1 }, isBoss: false }] as unknown as MapMonster[];

function getHit(gear: EquipmentInstance[], monster = attacker()) {
  const gs = useGameStore.getState();
  return processMonsterAttack(
    { type: 'monster_attack', monsterId: 'm1', attackType: 'melee' } as never,
    {
      character: gs.character!, equippedGear: gear,
      activeEffects: gs.activeEffects, skills: [],
      monsterInstances: new Map([['m1', monster]]), mapMonsters,
    },
  );
}

beforeEach(() => {
  useGameStore.setState({ character: knight(), skills: [], activeEffects: [], equippedGear: {} });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('回復比例隨觸發率（§ 7.9）', () => {
  it('範圍：回血 2.0~4.0%、回魔 2.0~5.0%', () => {
    expect(ON_HIT_RESTORE_PERCENT.on_hit_hp).toEqual([2, 4]);
    expect(ON_HIT_RESTORE_PERCENT.on_hit_mp).toEqual([2, 5]);
  });

  it('整張表線性換算：T1 下限 → 下限、T7 上限 → 上限，取到小數一位', () => {
    const table = getAffixTierTable('on_hit_hp');
    expect([table[0].min, table[6].max]).toEqual([1, 7]);
    expect(getRestorePercent('on_hit_hp', 1)).toBe(2);
    expect(getRestorePercent('on_hit_hp', 3)).toBe(2.7);
    expect(getRestorePercent('on_hit_hp', 5.5)).toBe(3.5);
    expect(getRestorePercent('on_hit_hp', 7)).toBe(4);
    expect(getRestorePercent('on_hit_mp', 1)).toBe(2);
    expect(getRestorePercent('on_hit_mp', 7)).toBe(5);
  });

  it('觸發率越高回復越多（T1~T7 每 0.1% 不遞減）', () => {
    for (const type of ['on_hit_hp', 'on_hit_mp'] as const) {
      let prev = 0;
      for (let tenths = 10; tenths <= 70; tenths++) {
        const v = getRestorePercent(type, tenths / 10);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('生成的詞綴不帶回復比例欄位', () => {
    for (let i = 0; i < 300; i++) {
      for (const a of generateAffixes('armor', 60, 4, false)) {
        expect('restorePercent' in a).toBe(false);
      }
    }
  });

  it('舊存檔的 restorePercent 不採用，一律依觸發率', () => {
    const legacy = { ...onHitHp(1), restorePercent: 4 } as Affix;
    expect(getOnHitRestore([chest([legacy])], 'on_hit_hp')).toEqual([{ chance: 1, percent: 2 }]);
  });

  it('武器池沒有這兩條（它們是防禦詞綴）', () => {
    for (let i = 0; i < 200; i++) {
      for (const a of generateAffixes('weapon', 60, 4, false, { weaponBaseDamage: 20 })) {
        expect(['on_hit_hp', 'on_hit_mp']).not.toContain(a.type);
      }
    }
  });

  it('觸發率與回復比例都吃品質（§ 7.3 小數規則）', () => {
    expect(getOnHitRestore([chest([onHitHp()], 0)], 'on_hit_hp')).toEqual([{ chance: 7, percent: 4 }]);
    expect(getOnHitRestore([chest([onHitHp()], 20)], 'on_hit_hp')).toEqual([{ chance: 8.4, percent: 4.8 }]);
    expect(getOnHitRestore([chest([onHitMp()], 50)], 'on_hit_mp')).toEqual([{ chance: 10.5, percent: 7.5 }]);
  });

  it('顯示文字寫出觸發率與回復比例', () => {
    expect(formatAffixDisplay(onHitHp())).toBe('受擊 7.0% 觸發回血 4.0% (T7)');
    expect(formatAffixDisplay(onHitMp(), 20)).toBe('受擊 8.4% 觸發回魔 6.0% (T7)');
  });
});

describe('觸發', () => {
  it('受到傷害且抽中時回復最大 HP 的對應比例', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10); // 10：高於角色迴避率
    const gear = [chest([onHitHp(ALWAYS)])];
    useGameStore.setState({ equippedGear: { chest: gear[0] } as never });
    const maxHp = getEffectiveMaxHp(useGameStore.getState().character!, useGameStore.getState().equippedGear, useGameStore.getState().activeEffects);

    const r = getHit(gear)!;
    // 先扣 60 傷害，再回 maxHp 的 4%
    expect(useGameStore.getState().character!.hp).toBe(500 - r.damage + Math.floor(maxHp * 0.04));
    expect(r.restoreLogs?.some(l => l.text.includes('受擊回血觸發'))).toBe(true);
  });

  it('回魔同樣依最大 MP 計算', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    const gear = [chest([onHitMp(ALWAYS)])];
    useGameStore.setState({ equippedGear: { chest: gear[0] } as never });
    const maxMp = getEffectiveMaxMp(useGameStore.getState().character!, useGameStore.getState().equippedGear, useGameStore.getState().activeEffects);

    const r = getHit(gear)!;
    expect(useGameStore.getState().character!.mp).toBe(200 + Math.floor(maxMp * 0.05));
    expect(r.restoreLogs?.some(l => l.text.includes('受擊回魔觸發'))).toBe(true);
  });

  it('沒抽中就不回復', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 90 > 7% 觸發率
    const gear = [chest([onHitHp()])];
    const before = useGameStore.getState().character!.hp;
    const r = getHit(gear)!;
    expect(useGameStore.getState().character!.hp).toBe(before - r.damage);
    expect(r.restoreLogs).toBeUndefined();
  });

  it('沒有這條詞綴就永遠不觸發', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    const gear = [chest([{ type: 'defense', tier: 7, value: 20 }])];
    const before = useGameStore.getState().character!.hp;
    const r = getHit(gear)!;
    expect(useGameStore.getState().character!.hp).toBe(before - r.damage);
    expect(r.restoreLogs).toBeUndefined();
  });

  it('多個部位各自判定，效果相加', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    const a = chest([onHitHp(ALWAYS)]);
    const b = { ...chest([onHitHp(ALWAYS)]), slot: 'gloves', templateId: 91 } as EquipmentInstance;
    useGameStore.setState({ equippedGear: { chest: a, gloves: b } as never });
    const maxHp = getEffectiveMaxHp(useGameStore.getState().character!, useGameStore.getState().equippedGear, useGameStore.getState().activeEffects);

    const r = getHit([a, b])!;
    expect(useGameStore.getState().character!.hp).toBe(500 - r.damage + Math.floor(maxHp * 0.04) * 2);
  });

  it('回復不會超過上限', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10);
    const gear = [chest([onHitHp(100), onHitMp(100)])];
    useGameStore.setState({
      character: { ...knight(), hp: 1000, mp: 400 },
      equippedGear: { chest: gear[0] } as never,
    });
    const gs = useGameStore.getState();
    const maxHp = getEffectiveMaxHp(gs.character!, gs.equippedGear, gs.activeEffects);
    const maxMp = getEffectiveMaxMp(gs.character!, gs.equippedGear, gs.activeEffects);

    getHit(gear);
    expect(useGameStore.getState().character!.hp).toBeLessThanOrEqual(maxHp);
    expect(useGameStore.getState().character!.mp).toBe(maxMp);
  });
});
