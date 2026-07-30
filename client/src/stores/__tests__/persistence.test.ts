import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../db/database';
import { seedDatabase, resetSeedState } from '../../db/seed';
import { useGameStore } from '../gameStore';

// Mock localStorage for node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window timer APIs for node environment
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

describe('Game persistence', () => {
  beforeEach(async () => {
    resetSeedState();
    await db.delete();
    await db.open();
    await seedDatabase();
    localStorage.clear();
    useGameStore.setState({
      phase: 'title',
      userId: null,
      characterList: [],
      character: null,
      equippedGear: {},
      inventory: [],
      bagItems: [],
      skills: [],
      storedEquipment: [],
      storedMaterials: [],
      warehouseGold: 0,
      scriptRules: [],
      quickSlots: [null, null, null, null, null],
      combatLogs: [],
      gameLoopId: null,
      hpRegenId: null,
      mpRegenId: null,
    });
    await useGameStore.getState().initUser();
  });

  it('should persist character to DB on create and load it back', async () => {
    await useGameStore.getState().createCharacter('TestHero', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const state = useGameStore.getState();
    expect(state.character).not.toBeNull();
    expect(state.character!.name).toBe('TestHero');

    // Reset store state to simulate refresh
    useGameStore.setState({ character: null, phase: 'title' });

    const loaded = await useGameStore.getState().loadCharacter();
    expect(loaded).toBe(true);
    expect(useGameStore.getState().character!.name).toBe('TestHero');
    expect(useGameStore.getState().character!.className).toBe('knight');
  });

  it('should persist initial potions to DB and load them back', async () => {
    await useGameStore.getState().createCharacter('PotionTest', 'elf', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    // Reset store
    useGameStore.setState({ character: null, bagItems: [], phase: 'title' });

    await useGameStore.getState().loadCharacter();
    const bag = useGameStore.getState().bagItems;
    const red = bag.find(b => b.name === '紅色藥水');
    expect(red).toBeDefined();
    expect(red!.amount).toBe(10);
    expect(bag.find(b => b.name === '橙色藥水')).toBeUndefined();
    expect(bag.find(b => b.name === '白色藥水')).toBeUndefined();
  });

  it('should persist bag items through saveGame on area change', async () => {
    await useGameStore.getState().createCharacter('BagTest', 'thief', { STR: 0, AGI: 2, VIT: 0, SPI: 0, INT: 0, CHA: 2 });

    // Simulate picking up a material and using some potions
    useGameStore.setState({
      bagItems: [
        { name: '紅色藥水', type: 'potion', amount: 8 },
        { name: '品質石', type: 'material', amount: 3 },
      ],
    });

    // Trigger save via navigateTo (to a town)
    useGameStore.getState().navigateTo({
      zoneId: 'newbie-neutral',
      regionId: 'neutral-town',
      floor: null,
    });

    // Wait for async save
    await new Promise(r => setTimeout(r, 50));

    // Reset and reload
    useGameStore.setState({ character: null, bagItems: [], phase: 'title' });
    await useGameStore.getState().loadCharacter();

    const bag = useGameStore.getState().bagItems;
    const red = bag.find(b => b.name === '紅色藥水');
    expect(red).toBeDefined();
    expect(red!.amount).toBe(8);
    expect(bag.find(b => b.name === '品質石')?.amount).toBe(3);
  });

  it('should persist script rules to localStorage', async () => {
    await useGameStore.getState().createCharacter('ScriptTest', 'elementalist', { STR: 0, AGI: 0, VIT: 0, SPI: 2, INT: 2, CHA: 0 });
    const charId = useGameStore.getState().character!.id!;

    const customRules = [
      { id: '1', enabled: true, condition: { type: 'always' as const }, action: { type: 'normal_attack' as const } },
    ];
    useGameStore.getState().setScriptRules(customRules);

    // Check localStorage
    const raw = localStorage.getItem(`mayana_prefs_${charId}`);
    expect(raw).not.toBeNull();
    const prefs = JSON.parse(raw!);
    expect(prefs.scriptRules).toHaveLength(1);
    expect(prefs.scriptRules[0].action.type).toBe('normal_attack');
  });

  it('should load script rules from localStorage on loadCharacter', async () => {
    await useGameStore.getState().createCharacter('LoadScript', 'priest', { STR: 0, AGI: 0, VIT: 0, SPI: 2, INT: 2, CHA: 0 });
    const charId = useGameStore.getState().character!.id!;

    const customRules = [
      { id: '1', enabled: true, condition: { type: 'hp_below' as const, value: 50 }, action: { type: 'potion' as const, potionType: 'red' as const } },
    ];
    localStorage.setItem(`mayana_prefs_${charId}`, JSON.stringify({ scriptRules: customRules, quickSlots: ['red', null, null, null, null] }));

    // Reset and reload
    useGameStore.setState({ character: null, scriptRules: [], quickSlots: [null, null, null, null, null], phase: 'title' });
    await useGameStore.getState().loadCharacter();

    expect(useGameStore.getState().scriptRules).toHaveLength(1);
    expect(useGameStore.getState().scriptRules[0].condition.type).toBe('hp_below');
    expect(useGameStore.getState().quickSlots[0]).toBe('red');
  });

  it('should persist quick slot assignments to localStorage', async () => {
    await useGameStore.getState().createCharacter('QuickSlot', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const charId = useGameStore.getState().character!.id!;

    useGameStore.getState().assignQuickSlot(0, 'red');
    useGameStore.getState().assignQuickSlot(2, 'orange');

    const raw = localStorage.getItem(`mayana_prefs_${charId}`);
    const prefs = JSON.parse(raw!);
    expect(prefs.quickSlots[0]).toBe('red');
    expect(prefs.quickSlots[2]).toBe('orange');
    expect(prefs.quickSlots[1]).toBeNull();
  });

  it('should persist learned skills to DB and load them back', async () => {
    await useGameStore.getState().createCharacter('SkillTest', 'elementalist', { STR: 0, AGI: 0, VIT: 0, SPI: 2, INT: 2, CHA: 0 });

    // Elementalist starts with 風刃
    expect(useGameStore.getState().skills).toHaveLength(1);
    expect(useGameStore.getState().skills[0].id).toBe('wind-blade');

    // Simulate learning a new skill
    const newSkill = { id: 'fireball', name: '火球', level: 3, element: 'fire' as const, type: 'attack' as const, target: 'aoe' as const, power: 25, mpCost: 15, cooldown: 6000, lastUsedAt: 0, aoeMin: 2, aoeMax: 3 };
    const currentSkills = useGameStore.getState().skills;
    const updatedSkills = [...currentSkills, newSkill];
    const char = useGameStore.getState().character!;
    useGameStore.setState({
      skills: updatedSkills,
      character: { ...char, skills: updatedSkills },
    });

    // Trigger save via navigateTo
    useGameStore.getState().navigateTo({
      zoneId: 'newbie-neutral',
      regionId: 'neutral-town',
      floor: null,
    });

    await new Promise(r => setTimeout(r, 50));

    // Reset and reload
    useGameStore.setState({ character: null, skills: [], phase: 'title' });
    await useGameStore.getState().loadCharacter();

    const loadedSkills = useGameStore.getState().skills;
    expect(loadedSkills).toHaveLength(2);
    expect(loadedSkills.find(s => s.id === 'wind-blade')).toBeDefined();
    expect(loadedSkills.find(s => s.id === 'fireball')).toBeDefined();
  });

  it('should persist ring2 slot through equip/reload cycle', async () => {
    await useGameStore.getState().createCharacter('RingTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;

    // Create two rings in DB
    const ring1Id = await db.equipmentInstances.add({
      templateId: 55, name: '銀戒指', type: 'armor', slot: 'ring1',
      isTwoHanded: false, defense: 0, quality: 0, enhancement: 0, affixes: [],
      ownerId: char.id!, equipped: false,
    });
    const ring2Id = await db.equipmentInstances.add({
      templateId: 56, name: '魔力戒指', type: 'armor', slot: 'ring1',
      isTwoHanded: false, defense: 0, quality: 0, enhancement: 0, affixes: [],
      ownerId: char.id!, equipped: false,
    });

    const ring1 = await db.equipmentInstances.get(ring1Id as number);
    const ring2 = await db.equipmentInstances.get(ring2Id as number);
    useGameStore.setState({ inventory: [ring1!, ring2!] });

    // Equip both rings
    useGameStore.getState().equipItem(ring1!);
    useGameStore.getState().equipItem(ring2!);

    const gear = useGameStore.getState().equippedGear;
    expect(gear.ring1?.name).toBe('銀戒指');
    expect(gear.ring2?.name).toBe('魔力戒指');

    // Verify DB has correct slot values
    const dbRing1 = await db.equipmentInstances.get(ring1Id as number);
    const dbRing2 = await db.equipmentInstances.get(ring2Id as number);
    expect(dbRing1!.slot).toBe('ring1');
    expect(dbRing2!.slot).toBe('ring2');

    // Reset and reload
    useGameStore.setState({ character: null, equippedGear: {}, inventory: [], phase: 'title' });
    await useGameStore.getState().loadCharacter();

    const loadedGear = useGameStore.getState().equippedGear;
    expect(loadedGear.ring1?.name).toBe('銀戒指');
    expect(loadedGear.ring2?.name).toBe('魔力戒指');
  });

  it('should persist equipment enhancement to DB', async () => {
    await useGameStore.getState().createCharacter('EnhanceTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;

    // Create a weapon in DB
    const weaponId = await db.equipmentInstances.add({
      templateId: 1, name: '短劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 4, largeMonsterDamage: 3,
      quality: 0, enhancement: 3, affixes: [{ type: 'attack_power', tier: 2, value: 9 }],
      ownerId: char.id!, equipped: true,
    });

    // Simulate enhancement result by directly updating DB
    await db.equipmentInstances.update(weaponId as number, { enhancement: 5 });

    // Verify DB persisted
    const dbWeapon = await db.equipmentInstances.get(weaponId as number);
    expect(dbWeapon!.enhancement).toBe(5);
  });

  it('should persist affix upgrade to DB', async () => {
    await useGameStore.getState().createCharacter('AffixTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;

    const weaponId = await db.equipmentInstances.add({
      templateId: 1, name: '短劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 4, largeMonsterDamage: 3,
      quality: 0, enhancement: 0, affixes: [{ type: 'attack_power', tier: 1, value: 6 }],
      ownerId: char.id!, equipped: true,
    });

    // Simulate affix upgrade
    const newAffixes = [{ type: 'attack_power' as const, tier: 3, value: 12 }];
    await db.equipmentInstances.update(weaponId as number, { affixes: newAffixes });

    const dbWeapon = await db.equipmentInstances.get(weaponId as number);
    expect(dbWeapon!.affixes![0].tier).toBe(3);
    expect(dbWeapon!.affixes![0].value).toBe(12);
  });

  it('should persist quality upgrade to DB', async () => {
    await useGameStore.getState().createCharacter('QualityTest', 'knight', { STR: 2, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 2 });
    const char = useGameStore.getState().character!;

    const weaponId = await db.equipmentInstances.add({
      templateId: 1, name: '短劍', type: 'sword', slot: 'rightHand',
      isTwoHanded: false, smallMonsterDamage: 4, largeMonsterDamage: 3,
      quality: 0, enhancement: 0, affixes: [],
      ownerId: char.id!, equipped: true,
    });

    // Simulate quality upgrade
    await db.equipmentInstances.update(weaponId as number, { quality: 5 });

    const dbWeapon = await db.equipmentInstances.get(weaponId as number);
    expect(dbWeapon!.quality).toBe(5);
  });
});
