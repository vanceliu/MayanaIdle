/**
 * 懸賞契約「掉兩次取比較好」（`53-bounty-contract.md` § 53.5.5）與保證強化詞綴（§ 53.5.3）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rollDrops, rollBossDrops } from '../drops';
import { rollClassSkillBookDrops } from '../classSkillBookDrop';
import { rollMonsterAffixes } from '../../models/monsterAffix';
import { createMonsterFromTemplate } from '../monsterSpawn';
import { db, resetTestDb } from '../../testing/testDb';
import { setRandomSource } from '../../core/rng';
import type { EquipmentInstance } from '../../models/equipment';
import type { MonsterTemplate } from '../../models/monster';
import type { MapMonster } from '../../stores/mapMonsterStore';

/** 依序回傳指定值，用完後一律回傳 0.999（不命中） */
function sequence(values: number[]): void {
  let i = 0;
  setRandomSource(() => (i < values.length ? values[i++] : 0.999));
}

const NO_BONUS = { drop_rate: 0, gold_rate: 0 };
const pickFirst = { pickEquipment: (a: EquipmentInstance) => a };

describe('掉兩次取比較好', () => {
  beforeEach(async () => {
    resetTestDb();
    await db.dropTables.clear();
    await db.bossDropTables.clear();
  });

  afterEach(() => {
    setRandomSource(() => Math.random());
    vi.restoreAllMocks();
  });

  it('道具：第一次沒中、第二次中就掉', async () => {
    await db.dropTables.bulkAdd([{ area: 'snow-field', itemType: 'item', itemTemplateId: 147, dropValue: 10 }] as never);
    sequence([0.5, 0.005]);
    expect((await rollDrops('snow-field', 1, NO_BONUS)).items).toHaveLength(0);
    sequence([0.5, 0.005]);
    const result = await rollDrops('snow-field', 1, NO_BONUS, false, undefined, undefined, pickFirst);
    expect(result.items.map(i => i.itemTemplateId)).toEqual([147]);
  });

  it('第二次判定不乘 Pressure', async () => {
    await db.dropTables.bulkAdd([{ area: 'snow-field', itemType: 'item', itemTemplateId: 147, dropValue: 10 }] as never);
    // 第一次 25 ≥ 20（×2 Pressure）沒中；第二次 15 ≥ 10（不乘 Pressure）也沒中
    sequence([0.025, 0.015]);
    const miss = await rollDrops('snow-field', 1, { ...NO_BONUS, pressure_mult: 2 }, false, undefined, undefined, pickFirst);
    expect(miss.items).toHaveLength(0);
    sequence([0.025, 0.005]);
    const hit = await rollDrops('snow-field', 1, { ...NO_BONUS, pressure_mult: 2 }, false, undefined, undefined, pickFirst);
    expect(hit.items).toHaveLength(1);
  });

  it('金幣數量擲兩次取高', async () => {
    await db.dropTables.bulkAdd([{ area: 'snow-field', itemType: 'gold', dropValue: 1000, minAmount: 100, maxAmount: 200 }] as never);
    sequence([0, 0, 0.999]);
    const result = await rollDrops('snow-field', 1, NO_BONUS, false, undefined, undefined, pickFirst);
    expect(result.gold).toBe(200);
  });

  it('裝備：實例生成兩次，交給比較函式留一件', async () => {
    const template = (await db.equipmentTemplates.toArray()).find(t => t.tier === 4 && t.acquireType !== 'starter')!;
    await db.bossDropTables.bulkAdd([{ bossName: '測試王', itemType: 'equipment', equipmentTemplateId: template.id, dropValue: 1000 }] as never);
    const pickEquipment = vi.fn((_a: EquipmentInstance, b: EquipmentInstance) => b);
    const result = await rollBossDrops('測試王', 1, 50, NO_BONUS, undefined, { pickEquipment });
    expect(pickEquipment).toHaveBeenCalledTimes(1);
    const [first, second] = pickEquipment.mock.calls[0];
    expect(first).not.toBe(second);
    expect(result.items[0].equipmentInstance).toBe(second);
  });

  it('職業技能書：每級第二次判定', () => {
    // 區域 Lv.35 只有 3 級書；Boss 基礎 5%：第一次 0.5 沒中、第二次 0.01 中，接著抽書
    sequence([0.5, 0.01, 0]);
    expect(rollClassSkillBookDrops(35, true, 1, 1)).toHaveLength(1);
    sequence([0.5, 0.01, 0]);
    expect(rollClassSkillBookDrops(35, true, 1)).toHaveLength(0);
  });
});

describe('保證強化詞綴', () => {
  it('擲到不強化時改為 1 個詞綴', () => {
    expect(rollMonsterAffixes(35, [], () => 0.99).affixes).toHaveLength(0);
    expect(rollMonsterAffixes(35, [], () => 0.99, 1).affixes).toHaveLength(1);
  });

  it('生成時契約對象才保證', () => {
    setRandomSource(() => 0.99);
    const template = { id: 1, name: '雪狼', level: 32, hp: 100, attackMin: 1, attackMax: 2, defense: 0, exp: 1, isBoss: false } as MonsterTemplate;
    const mm = { id: 'm1', isBoss: false } as MapMonster;
    expect(createMonsterFromTemplate(mm, [template])!.affixes ?? []).toHaveLength(0);
    expect(createMonsterFromTemplate(mm, [template], undefined, t => t.name === '雪狼')!.affixes).toHaveLength(1);
    setRandomSource(() => Math.random());
  });
});
