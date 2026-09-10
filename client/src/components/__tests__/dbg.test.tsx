import { describe, it, expect, beforeEach } from 'vitest';
import { db, repo, resetTestDb } from '../../testing/testDb';
import { defaultSession } from '../../stores/session';
import { useGameStore } from '../../stores/gameStore';
import type { Character } from '../../models/character';
import type { EquipmentTemplate } from '../../models/equipment';

const TEMPLATES: EquipmentTemplate[] = [
  { id: 1, name: '鐵劍', type: 'sword', slot: 'rightHand', isTwoHanded: false, smallMonsterDamage: 10, largeMonsterDamage: 8, buyPrice: 1000, acquireType: 'shop', tier: 2 } as EquipmentTemplate,
];

describe('dbg', () => {
  beforeEach(async () => {
    resetTestDb();
    await db.equipmentTemplates.clear();
    await db.equipmentTemplates.bulkAdd(TEMPLATES);
    defaultSession.repo = repo;
    useGameStore.setState({
      character: { id: 1, userId: 1, name: 'S', className: 'knight', level: 40, gold: 100000, hp: 1, maxHp: 1, mp: 1, maxMp: 1 } as Character,
      inventory: [], bagItems: [], equippedGear: {},
    } as never);
  });

  it('buy', async () => {
    const found = await repo.findEquipmentTemplates(t => t.id === 1);
    console.log('found', found.length, found[0]?.name, found[0]?.acquireType);
    const out = await useGameStore.getState().buyShopEquipment([1, 1, 1]);
    console.log('bought', out.length);
    expect(out).toHaveLength(3);
  });
});
