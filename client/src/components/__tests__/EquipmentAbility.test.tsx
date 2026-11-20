// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EquipmentDetail } from '../EquipmentInfo';
import { useGameStore } from '../../stores/gameStore';
import { resetAltHeld } from '../../hooks/useAltHeld';
import type { EquipmentInstance } from '../../models/equipment';
import type { Character } from '../../models/character';

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>icon</span>,
}));

function knight(): Character {
  return {
    name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 1, hp: 100, mp: 10, 
    baseAttributes: { STR: 30, AGI: 30, VIT: 30, SPI: 30, INT: 30, CHA: 10 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    gold: 0, currentArea: 'dawn-plains', currentZone: 'newbie-neutral', currentRegion: 'dawn-plains',
    currentFloor: null, skills: [], quests: [], areaEnteredAt: 0, createdAt: 0, userId: 1,
  };
}

function accessory(id: number, slot: 'necklace' | 'ring1' | 'ring2', ability: EquipmentInstance['ability']): EquipmentInstance {
  return {
    id, templateId: 3001, name: '戒指', type: 'armor', slot,
    isTwoHanded: false, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true, ability,
  } as EquipmentInstance;
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

describe('隨機技能「；」之後另包一段（`34-ui-guidelines.md` § 34.2 第 20 點）', () => {
  const rage = () => accessory(31, 'necklace', { type: 'rage', params: { decay: 15 } });
  const row = (container: HTMLElement) => container.querySelector<HTMLElement>('.equip-detail-affix.ability')!;

  beforeEach(() => resetAltHeld());

  it('「；」留在前段，之後的敘述包進 tail', () => {
    const { container } = render(<EquipmentDetail item={rage()} />);
    const tail = row(container).querySelector('.equip-detail-affix-tail');
    expect(tail?.textContent).toBe('有怒氣時魔法抗性 +10、防禦 +5');
    expect(row(container).textContent).toBe('怒氣：被命中時累積等同受到傷害的怒氣（上限 100），每秒減少 15；有怒氣時魔法抗性 +10、防禦 +5');
  });

  it('按住 Alt：區間留在前段，tail 不變', () => {
    const { container } = render(<EquipmentDetail item={rage()} />);
    act(() => { fireEvent.keyDown(window, { key: 'Alt', altKey: true }); });
    const tail = row(container).querySelector('.equip-detail-affix-tail')!;
    expect(tail.textContent).toBe('有怒氣時魔法抗性 +10、防禦 +5');
    expect(tail.querySelector('.stat-range')).toBeNull();
    expect(row(container).querySelector('.stat-range')?.textContent).toBe('(5 ~ 15)');
  });

  it('沒有「；」的技能不包 tail', () => {
    const { container } = render(<EquipmentDetail item={t7Sword()} />);
    expect(row(container).querySelector('.equip-detail-affix-tail')).toBeNull();
    expect(container.querySelector('.equip-detail-affix.unique .equip-detail-affix-tail')).toBeNull();
  });
});

describe('同種類多件未生效的隨機技能劃線（§ 7S.3／§ 7S.7）', () => {
  const line = (item: EquipmentInstance, name: string) => {
    const { unmount } = render(<EquipmentDetail item={item} />);
    const el = screen.getByText(new RegExp(`^${name}：`));
    const result = { suppressed: el.className.includes('suppressed'), title: el.getAttribute('title') };
    unmount();
    return result;
  };

  it('取最大的件生效，其餘劃線', () => {
    const r1 = accessory(11, 'ring1', { type: 'adversity', params: { reduction: 3 } });
    const r2 = accessory(12, 'ring2', { type: 'adversity', params: { reduction: 5 } });
    useGameStore.setState({ equippedGear: { ring1: r1, ring2: r2 } });
    expect(line(r1, '逆境')).toEqual({ suppressed: true, title: '同種類已由其他裝備生效' });
    expect(line(r2, '逆境').suppressed).toBe(false);
  });

  it('同值依部位順序：項鍊優先', () => {
    const neck = accessory(21, 'necklace', { type: 'dodge_heal', params: { heal: 40 } });
    const r1 = accessory(22, 'ring1', { type: 'dodge_heal', params: { heal: 40 } });
    useGameStore.setState({ equippedGear: { necklace: neck, ring1: r1 } });
    expect(line(neck, '閃避回復').suppressed).toBe(false);
    expect(line(r1, '閃避回復').suppressed).toBe(true);
  });

  it('越小越好的參數取小（怒氣衰減）', () => {
    const r1 = accessory(31, 'ring1', { type: 'rage', params: { decay: 12 } });
    const r2 = accessory(32, 'ring2', { type: 'rage', params: { decay: 6 } });
    useGameStore.setState({ equippedGear: { ring1: r1, ring2: r2 } });
    expect(line(r1, '怒氣').suppressed).toBe(true);
    expect(line(r2, '怒氣').suppressed).toBe(false);
  });

  it('荊棘反彈同樣只取一件', () => {
    const r1 = accessory(41, 'ring1', { type: 'thorns', params: { percent: 3 } });
    const r2 = accessory(42, 'ring2', { type: 'thorns', params: { percent: 5 } });
    useGameStore.setState({ equippedGear: { ring1: r1, ring2: r2 } });
    expect(line(r1, '荊棘反彈').suppressed).toBe(true);
    expect(line(r2, '荊棘反彈').suppressed).toBe(false);
  });

  it('未裝備的件不劃線', () => {
    const r2 = accessory(52, 'ring2', { type: 'adversity', params: { reduction: 5 } });
    useGameStore.setState({ equippedGear: { ring2: r2 } });
    expect(line(accessory(51, 'ring1', { type: 'adversity', params: { reduction: 3 } }), '逆境').suppressed).toBe(false);
  });
});
