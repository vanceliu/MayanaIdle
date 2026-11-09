// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentDetail } from '../EquipmentInfo';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { Character } from '../../models/character';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

function knight(): Character {
  return {
    name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 100, maxHp: 100, mp: 10, maxMp: 10,
    baseAttributes: { STR: 30, AGI: 30, VIT: 30, SPI: 30, INT: 30, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains',
    currentFloor: null, skills: [], unspentAttributePoints: 0, quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function t7Sword(): EquipmentInstance {
  return {
    id: 1, templateId: 1019, name: '終焉之刃', type: 'sword', slot: 'rightHand', isTwoHanded: false,
    smallMonsterDamage: 19, largeMonsterDamage: 18, quality: 0, enhancement: 0,
    affixes: [{ type: 'attack_power', tier: 7, value: 20 }], ownerId: 1, equipped: true,
    uniqueAffix: { type: 'crit_rate', value: 22 },
    ability: { type: 'bonus_damage', params: { chance: 8, damage: 12 } },
  } as EquipmentInstance;
}

beforeEach(() => {
  useGameStore.setState({ character: knight(), activeEffects: [], equippedGear: {} });
});

describe('裝備 tooltip 的隨機技能（§ 7S.7）', () => {
  it('不加前綴、淺綠 class，排在 T7 獨有詞綴與一般詞綴之前', () => {
    render(<EquipmentDetail item={t7Sword()} />);
    const line = screen.getByText('追加傷害：命中 8% 機率追加 12 傷害');
    expect(line.className).toContain('ability');
    const unique = screen.getByText('(獨) 爆擊率 +22%');
    expect(line.compareDocumentPosition(unique) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('compact 不顯示', () => {
    render(<EquipmentDetail item={t7Sword()} compact />);
    expect(screen.queryByText(/追加傷害：/)).toBeNull();
  });
});
