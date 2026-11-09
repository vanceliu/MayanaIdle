/**
 * 常駐天賦看職業池隨機技能改寫後的 MP 與冷卻（`07-affix-ability.md` § 7S.5、`51-auto-talent.md`）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import type { Character } from '../../models/character';
import type { EquipmentInstance } from '../../models/equipment';
import type { TalentSlot } from '../../models/talent';

if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };
}

const NOW = 900_000;

function priest(mp: number): Character {
  return {
    name: 'P', className: 'priest', level: 70, exp: 0, expToNext: 100,
    hp: 500, maxHp: 500, mp, maxMp: 400,
    baseAttributes: { STR: 10, AGI: 10, VIT: 10, SPI: 10, INT: 10, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains', currentFloor: null, skills: [],
    unspentAttributePoints: 0, quests: [], areaEnteredAt: NOW, createdAt: NOW, userId: 1,
  };
}

const necklace = {
  id: 7, templateId: 1, name: '項鍊', type: 'armor', slot: 'necklace', isTwoHanded: false,
  quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
  ability: { type: 'holy_domain_boost', params: { mp: 15, cooldown: 5000 } },
} as EquipmentInstance;

const slot: TalentSlot = {
  id: 1, characterId: 1, tier: 1, assignedType: 'persistent', templateId: 'default', order: 0, enabled: true,
  conditions: [null], action: { ruleId: 'buff_skill', params: { skillId: 'holy-domain' } },
} as TalentSlot;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  useTalentStore.setState({ slots: [slot] });
});

describe('常駐天賦 × 職業池隨機技能', () => {
  it('MP 只夠強化後的消耗時照樣施放', () => {
    const domain = instantiateFromTemplate('holy-domain')!;
    useGameStore.setState({
      character: priest(80), skills: [domain], activeEffects: [],
      equippedGear: { necklace } as never, activeTemplateId: 'default',
    });
    useGameStore.getState().tickPersistent();
    const gs = useGameStore.getState();
    expect(gs.activeEffects.some(e => e.category === 'sanctuary')).toBe(true);
    expect(gs.character!.mp).toBe(80 - 75);
  });

  it('沒帶強化時 MP 不足就不施放', () => {
    const domain = instantiateFromTemplate('holy-domain')!;
    useGameStore.setState({
      character: priest(80), skills: [domain], activeEffects: [],
      equippedGear: {}, activeTemplateId: 'default',
    });
    useGameStore.getState().tickPersistent();
    expect(useGameStore.getState().activeEffects.some(e => e.category === 'sanctuary')).toBe(false);
  });
});
