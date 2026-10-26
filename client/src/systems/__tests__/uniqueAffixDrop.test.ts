import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../testing/testDb';
import { rollBossDrops } from '../drops';

/*
 * T7 掉落帶獨有詞綴（`07-affix-tier7.md` § 7T.1），且存檔與記憶體中的實例是同一份抽取結果 ——
 * 抽兩次的話，玩家拿到時看到的和重新登入後看到的會不一樣。
 */
describe('T7 掉落的獨有詞綴', () => {
  beforeEach(async () => {
    await db.bossDropTables.clear();
    await db.equipmentTemplates.clear();
    await db.equipmentInstances.clear();
  });

  it('掉落實例與存檔的獨有詞綴、隨機額外防禦、安定值一致', async () => {
    await db.bossDropTables.bulkAdd([
      { bossName: 'U', equipmentPool: 'all', tier: 7, dropValue: 1000, itemType: 'equipment' },
    ] as never[]);
    await db.equipmentTemplates.bulkAdd([
      { name: 'U-甲', type: 'armor', slot: 'chest', tier: 7, acquireType: 'drop_only', defense: 10 },
    ] as never[]);

    for (let i = 0; i < 20; i++) {
      const result = await rollBossDrops('U', 77, 60);
      const dropped = result.items.find(it => it.name === 'U-甲')?.equipmentInstance;
      if (!dropped) continue;
      expect(dropped.uniqueAffix).toBeDefined();
      const stored = (await db.equipmentInstances.toArray()).find(r => r.id === dropped.id)!;
      expect(stored.uniqueAffix).toEqual(dropped.uniqueAffix);
      expect(stored.defenseBonus).toBe(dropped.defenseBonus);
      expect(stored.stability).toBe(dropped.stability);
    }
  });

  it('非 T7 掉落沒有獨有詞綴', async () => {
    await db.bossDropTables.bulkAdd([
      { bossName: 'V', equipmentPool: 'all', tier: 4, dropValue: 1000, itemType: 'equipment' },
    ] as never[]);
    // 掉落先 50/50 決定武器或防具（`27-drop-table.md` § 27.6），兩類都放才必定有東西掉
    await db.equipmentTemplates.bulkAdd([
      { name: 'V-甲', type: 'armor', slot: 'chest', tier: 4, acquireType: 'drop_only' },
      { name: 'V-劍', type: 'sword', slot: 'rightHand', tier: 4, acquireType: 'drop_only' },
    ] as never[]);
    const result = await rollBossDrops('V', 78, 60);
    const dropped = result.items.find(it => it.name.startsWith('V-'))?.equipmentInstance;
    expect(dropped).toBeDefined();
    expect(dropped!.uniqueAffix).toBeUndefined();
  });
});
