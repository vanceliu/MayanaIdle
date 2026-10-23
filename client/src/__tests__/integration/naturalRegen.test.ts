/**
 * 自然回復（`29-regen.md` § 29.1~29.2）整合測試 —— 走 `gameStore.tickRegen` 實際回復路徑：
 *  - 總回復量 = floor(有效屬性 / 2) + 裝備模板值 + 回血／回魔詞綴
 *  - 詞綴吃品質加成
 *  - 素質需求未滿足的件只凍結詞綴，模板值照算
 *  - 戰鬥中總量減半
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { defaultSession } from '../../stores/session';
import { HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS } from '../../systems/regen';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';

function character(): Character {
  return {
    name: 'Regen', className: 'knight', level: 30, exp: 0, expToNext: 1000,
    hp: 1, maxHp: 500, mp: 0, maxMp: 500,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains',
    currentFloor: null, skills: [], unspentAttributePoints: 0, quests: [],
    areaEnteredAt: Date.now(), createdAt: Date.now(), userId: 1,
  };
}

function item(over: Partial<EquipmentInstance>): EquipmentInstance {
  return {
    templateId: 1, name: 'x', type: 'armor', slot: 'chest', isTwoHanded: false,
    quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ...over,
  } as EquipmentInstance;
}

/** 模板值：回血 +2、回魔 +3 */
const necklace = (over: Partial<EquipmentInstance> = {}) =>
  item({ slot: 'necklace', hpRegen: 2, mpRegen: 3, ...over });

/** 詞綴：回血 +6、回魔 +8 */
const chest = (over: Partial<EquipmentInstance> = {}) => item({
  slot: 'chest',
  affixes: [{ type: 'hp_regen', tier: 3, value: 6 }, { type: 'mp_regen', tier: 4, value: 8 }],
  ...over,
});

function equip(gear: Record<string, EquipmentInstance>, phase: 'explore' | 'combat' = 'explore') {
  useGameStore.setState({ character: character(), equippedGear: gear, activeEffects: [], phase });
}

/** 跑一次回血與回魔 tick，回傳各自的回復量 */
function tickOnce(): { hp: number; mp: number } {
  const before = useGameStore.getState().character!;
  defaultSession.loop.regenHpAcc = 0;
  defaultSession.loop.regenMpAcc = 0;
  useGameStore.getState().tickRegen(Math.max(HP_REGEN_INTERVAL_MS, MP_REGEN_INTERVAL_MS));
  const after = useGameStore.getState().character!;
  return { hp: after.hp - before.hp, mp: after.mp - before.mp };
}

describe('自然回復 tick 計入裝備模板值與詞綴', () => {
  beforeEach(() => {
    defaultSession.mapMonster.setState({ monsters: [] });
  });

  it('裸裝只有屬性基礎量：floor(10 / 2) = 5', () => {
    equip({});
    expect(tickOnce()).toEqual({ hp: 5, mp: 5 });
  });

  it('飾品模板值加算', () => {
    equip({ necklace: necklace() });
    expect(tickOnce()).toEqual({ hp: 5 + 2, mp: 5 + 3 });
  });

  it('防具的回血／回魔詞綴加算', () => {
    equip({ chest: chest() });
    expect(tickOnce()).toEqual({ hp: 5 + 6, mp: 5 + 8 });
  });

  it('模板值與詞綴同時加算', () => {
    equip({ necklace: necklace(), chest: chest() });
    expect(tickOnce()).toEqual({ hp: 5 + 2 + 6, mp: 5 + 3 + 8 });
  });

  it('詞綴吃品質加成：floor(值 × (1 + 品質 / 100))', () => {
    equip({ chest: chest({ quality: 50 }) });
    expect(tickOnce()).toEqual({ hp: 5 + 9, mp: 5 + 12 });
  });

  it('素質需求未滿足：詞綴凍結，模板值照算', () => {
    const unmet = { requiredAttributes: { STR: 99 } };
    equip({ necklace: necklace(unmet), chest: chest(unmet) });
    expect(tickOnce()).toEqual({ hp: 5 + 2, mp: 5 + 3 });
  });

  it('戰鬥中總量減半', () => {
    equip({ necklace: necklace(), chest: chest() }, 'combat');
    expect(tickOnce()).toEqual({ hp: Math.floor(13 / 2), mp: Math.floor(16 / 2) });
  });
});
