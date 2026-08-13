import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { rollBossDrops } from '../drops';

/*
 * 同 tier 的武器／防具是一組連動條目，只擲一次（`27-drop-table.md` § 27.6），
 * 但**不同 tier 要各自擲** —— 旗標整張表共用的話，id 較大的 T7 條目
 * 永遠被前面的 T4 吃掉，掉率實質為 0，T7 裝備（含 +20 格腰帶）拿不到。
 */
describe('Boss 的多個裝備階級各自判定（§ 27.6）', () => {
  beforeEach(async () => {
    await db.bossDropTables.clear();
    await db.equipmentTemplates.clear();
    await db.equipmentInstances.clear();
  });

  it('T4 擲過之後，T7 仍然會判定', async () => {
    await db.bossDropTables.bulkAdd([
      { bossName: 'B', equipmentPool: 'all', tier: 4, dropValue: 1000, itemType: 'equipment' },
      { bossName: 'B', equipmentPool: 'all', tier: 7, dropValue: 1000, itemType: 'equipment' },
    ] as never[]);
    await db.equipmentTemplates.bulkAdd([
      { name: 'T4劍', type: 'sword', slot: 'rightHand', tier: 4, acquireType: 'drop_only' },
      { name: 'T4甲', type: 'armor', slot: 'chest', tier: 4, acquireType: 'drop_only' },
      { name: 'T7劍', type: 'sword', slot: 'rightHand', tier: 7, acquireType: 'drop_only' },
      { name: 'T7甲', type: 'armor', slot: 'chest', tier: 7, acquireType: 'drop_only' },
    ] as never[]);

    const result = await rollBossDrops('B', 1, 60);
    const names = result.items.map(i => i.name);
    expect(names.some(n => n.startsWith('T4'))).toBe(true);
    expect(names.some(n => n.startsWith('T7'))).toBe(true);
  });

  // 同一個 tier 的兩筆連動條目只算一次
  it('同一個 tier 只擲一次', async () => {
    await db.bossDropTables.bulkAdd([
      { bossName: 'C', equipmentPool: 'all', tier: 4, dropValue: 1000, itemType: 'equipment' },
      { bossName: 'C', equipmentPool: 'all', tier: 4, dropValue: 1000, itemType: 'equipment' },
    ] as never[]);
    await db.equipmentTemplates.bulkAdd([
      { name: 'C-劍', type: 'sword', slot: 'rightHand', tier: 4, acquireType: 'drop_only' },
      { name: 'C-甲', type: 'armor', slot: 'chest', tier: 4, acquireType: 'drop_only' },
    ] as never[]);

    const result = await rollBossDrops('C', 1, 60);
    // 只數這次放進去的模板，避免其他測試檔在同一個 fake DB 留下的資料干擾
    expect(result.items.filter(i => i.name.startsWith('C-'))).toHaveLength(1);
  });
});
