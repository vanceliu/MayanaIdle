import { describe, it, expect, beforeAll } from 'vitest';
import { buildCombatView } from '../adminCombatView';
import { CLASS_BASE_ATTRIBUTES, type Character } from '../../../client/src/models/character';
import { characterStatSheet } from '../../../client/src/systems/characterStatSheet';
import { getCachedTemplates, loadTemplateCache, resolveEquipment } from '../../../client/src/systems/templateSync';
import { getMaxHp } from '../../../client/src/systems/maxHpMp';
import type { EquipmentInstance } from '../../../client/src/models/equipment';

const knight = (over: Partial<Character> = {}): Character => ({
  userId: 1, name: '騎士', className: 'knight', level: 40, exp: 0, expToNext: 1, hp: 1, mp: 1,
  baseAttributes: CLASS_BASE_ATTRIBUTES.knight, bonusAttributes: { STR: 4, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
  gold: 0, currentArea: 'dawn-plains', currentZone: 'dawn-plains', currentRegion: 'dawn-plains', currentFloor: null,
  skills: [{ id: 'shield-bash' } as Character['skills'][number]], quests: [], areaEnteredAt: 0, createdAt: 0, ...over,
});

let weapon: EquipmentInstance;
beforeAll(async () => {
  await loadTemplateCache();
  const t = getCachedTemplates().find(x => x.slot === 'rightHand')!;
  weapon = resolveEquipment({ id: 1, templateId: t.id!, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, inStorage: false, slot: 'rightHand' } as unknown as EquipmentInstance);
});

describe('管理介面角色查詢的能力值、技能、快捷列（`97-selfhosted-server.md` § 97.8）', () => {
  it('能力值同遊戲面板、只算裝備中的、不含 buff', () => {
    const char = knight();
    const unequipped = { ...weapon, id: 2, equipped: false, slot: undefined } as unknown as EquipmentInstance;
    const view = buildCombatView(char, [weapon, unequipped], [{ itemId: 1, amount: 5 }], undefined);
    expect(view.stats).toEqual(characterStatSheet(char, { rightHand: weapon }, [], [{ itemId: 1, amount: 5 }]));
    expect(view.maxHp).toBe(getMaxHp(char, [weapon]));
  });

  it('技能格：名稱、圖示、tooltip 數值列；查不到的技能略過', () => {
    const view = buildCombatView(knight({ skills: [{ id: 'shield-bash' }, { id: 'no-such-skill' }] as Character['skills'] }), [weapon], [], undefined);
    expect(view.skills).toHaveLength(1);
    const [cell] = view.skills;
    expect(cell).toMatchObject({ name: '盾擊', tip: { category: expect.any(String), level: expect.any(Number) } });
    expect(view.icons[cell.icon]).toMatch(/^<svg/);
    expect(cell.tip.lines.some(l => l.label === 'MP: ')).toBe(true);
    expect(cell.tip.tagRows.length).toBeGreaterThan(0);
  });

  it('快捷列 10 格：指向未習得技能的格子剔除', () => {
    const view = buildCombatView(knight(), [], [], [{ kind: 'skill', skillId: 'shield-bash' }, { kind: 'skill', skillId: 'rend' }]);
    expect(view.quickSlots).toHaveLength(10);
    expect(view.quickSlots.slice(0, 2)).toEqual([{ key: '1', name: '盾擊' }, { key: '2', name: null }]);
    expect(view.quickSlots[9].key).toBe('0');
  });
});
