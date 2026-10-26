// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EquipmentDetail } from '../EquipmentInfo';
import { useGameStore } from '../../stores/gameStore';
import { AffixesPage } from '../../wiki/pages/AffixesPage';
import { UNIQUE_AFFIX_DEFINITIONS } from '../../models/uniqueAffix';
import type { EquipmentInstance } from '../../models/equipment';
import type { UniqueAffix } from '../../models/uniqueAffix';
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

function armor(id: number, slot: string, uniqueAffix: UniqueAffix): EquipmentInstance {
  return {
    id, templateId: 247, name: `T7-${slot}`, type: 'armor', slot, isTwoHanded: false, defense: 7,
    quality: 0, enhancement: 0, affixes: [{ type: 'defense', tier: 7, value: 17 }], ownerId: 1, equipped: true, uniqueAffix,
  } as EquipmentInstance;
}

beforeEach(() => {
  useGameStore.setState({ character: knight(), activeEffects: [], equippedGear: {} });
});

describe('裝備 tooltip 的 T7 獨有詞綴（§ 7T.7）', () => {
  it('第一行顯示 (獨) 與效果，排在一般詞綴之前', () => {
    const helmet = armor(1, 'helmet', { type: 'extra_defense', value: 10 });
    render(<EquipmentDetail item={helmet} />);
    const line = screen.getByText('(獨) 額外防禦 +10');
    expect(line.className).toContain('unique');
    expect(line.className).not.toContain('suppressed');
    const normal = screen.getByText(/防禦力 \+17% \(T7\)/);
    expect(line.compareDocumentPosition(normal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('同類去重落敗的那件劃線', () => {
    const helmet = armor(1, 'helmet', { type: 'extra_defense', value: 10 });
    const chest = armor(2, 'chest', { type: 'extra_defense', value: 6 });
    useGameStore.setState({ equippedGear: { helmet, chest } as never });
    const { unmount } = render(<EquipmentDetail item={chest} />);
    const loser = screen.getByText('(獨) 額外防禦 +6');
    expect(loser.className).toContain('suppressed');
    expect(loser.getAttribute('title')).toBe('同類獨有詞綴已由其他裝備生效');
    unmount();

    render(<EquipmentDetail item={helmet} />);
    expect(screen.getByText('(獨) 額外防禦 +10').className).not.toContain('suppressed');
  });

  it('非 T7 不顯示獨有詞綴列', () => {
    const { container } = render(<EquipmentDetail item={{ ...armor(3, 'helmet', { type: 'evasion', value: 8 }), uniqueAffix: undefined }} />);
    expect(container.querySelector('.equip-detail-affix.unique')).toBeNull();
  });
});

describe('Wiki 詞綴頁的 T7 獨有詞綴節', () => {
  it('列出每一條獨有詞綴的效果，腰帶／左手標出指定的裝備', () => {
    render(<MemoryRouter><AffixesPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'T7 獨有詞綴' })).toBeTruthy();
    for (const def of UNIQUE_AFFIX_DEFINITIONS) {
      expect(screen.getAllByText(def.description).length, def.type).toBeGreaterThan(0);
    }
    for (const name of ['天龍腰帶', '星辰腰帶', '幻影腰帶', '不朽壁壘', '創世之書', '終焉臂甲']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });
});
