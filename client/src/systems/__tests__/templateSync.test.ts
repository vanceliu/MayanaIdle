import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { resolveEquipment } from '../templateSync';
import type { EquipmentInstance } from '../../models/equipment';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { loadTemplateCache } from '../templateSync';

describe('templateSync - resolveEquipment slot handling', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    await loadTemplateCache();
  });

  it('preserves ring2 slot and does not overwrite with template slot', async () => {
    const ringTemplate = await db.equipmentTemplates.where('name').equals('銅戒指').first();
    expect(ringTemplate).toBeDefined();
    expect(ringTemplate!.slot).toBe('ring1');

    const instance: EquipmentInstance = {
      id: 999,
      templateId: ringTemplate!.id!,
      name: '銅戒指',
      type: 'armor',
      slot: 'ring2',
      isTwoHanded: false,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: 1,
      equipped: true,
    };

    const resolved = resolveEquipment(instance);
    expect(resolved.slot).toBe('ring2');
  });

  it('falls back to template slot when instance has no slot', async () => {
    const ringTemplate = await db.equipmentTemplates.where('name').equals('銅戒指').first();
    expect(ringTemplate).toBeDefined();

    const instance = {
      id: 999,
      templateId: ringTemplate!.id!,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: 1,
      equipped: false,
    } as unknown as EquipmentInstance;

    const resolved = resolveEquipment(instance);
    expect(resolved.slot).toBe('ring1');
  });

  it('two rings with different slots both resolve correctly', async () => {
    const ringTemplate = await db.equipmentTemplates.where('name').equals('銅戒指').first();
    expect(ringTemplate).toBeDefined();

    const ring1: EquipmentInstance = {
      id: 100,
      templateId: ringTemplate!.id!,
      name: '銅戒指',
      type: 'armor',
      slot: 'ring1',
      isTwoHanded: false,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: 1,
      equipped: true,
    };

    const ring2: EquipmentInstance = {
      id: 101,
      templateId: ringTemplate!.id!,
      name: '銅戒指',
      type: 'armor',
      slot: 'ring2',
      isTwoHanded: false,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: 1,
      equipped: true,
    };

    const resolved1 = resolveEquipment(ring1);
    const resolved2 = resolveEquipment(ring2);

    expect(resolved1.slot).toBe('ring1');
    expect(resolved2.slot).toBe('ring2');
  });

  it('non-ring equipment resolves slot from template when missing', async () => {
    const armorTemplate = await db.equipmentTemplates.where('name').equals('皮甲').first();
    expect(armorTemplate).toBeDefined();

    const instance = {
      id: 200,
      templateId: armorTemplate!.id!,
      quality: 0,
      enhancement: 0,
      affixes: [],
      ownerId: 1,
      equipped: false,
    } as unknown as EquipmentInstance;

    const resolved = resolveEquipment(instance);
    expect(resolved.slot).toBe('chest');
  });
});
