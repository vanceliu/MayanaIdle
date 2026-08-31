// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentDetail } from '../EquipmentInfo';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { Character } from '../../models/character';
import type { Attributes } from '../../models/attributes';

const attrs = (p: Partial<Attributes> = {}): Attributes =>
  ({ STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0, ...p });

const character = (a: Partial<Attributes>): Character => ({
  id: 1, userId: 1, name: 'T', className: 'knight', level: 60, exp: 0, expToNext: 0,
  hp: 100, maxHp: 100, mp: 50, maxMp: 50,
  baseAttributes: attrs(a), bonusAttributes: attrs(), unspentAttributePoints: 0,
} as Character);

const item = (over: Partial<EquipmentInstance> = {}): EquipmentInstance => ({
  templateId: 1, name: '天龍鎧甲', type: 'armor', slot: 'chest', isTwoHanded: false,
  defense: 12, quality: 0, enhancement: 0, affixes: [], ownerId: 1, equipped: true,
  line: 'heavy', requiredAttributes: { STR: 24, VIT: 18 }, ...over,
} as EquipmentInstance);

function setStore(char: Character, gear: Record<string, EquipmentInstance | null> = {}) {
  useGameStore.setState({ character: char, equippedGear: gear as never, activeEffects: [] });
}

/** `06-equipment.md` § 6A.8.8、`34-ui-guidelines.md` */
describe('素質需求的顯示', () => {
  beforeEach(() => setStore(character({ STR: 24, VIT: 18 })));

  it('列出需求，達標時不標紅也不顯示凍結', () => {
    render(<EquipmentDetail item={item()} />);
    expect(screen.getByText(/素質需求/).textContent).toContain('力量 24');
    expect(screen.getByText(/素質需求/).textContent).toContain('體質 18');
    expect(screen.queryByText('素質不足 · 詞綴未生效')).toBeNull();
  });

  it('未達標時標出凍結，且只有沒達標的那個屬性標紅', () => {
    setStore(character({ STR: 22, VIT: 18 }));
    render(<EquipmentDetail item={item()} />);
    expect(screen.getByText('素質不足 · 詞綴未生效')).toBeTruthy();
    expect(screen.getByText(/力量 24/).className).toContain('unmet-attr');
    expect(screen.getByText(/體質 18/).className).not.toContain('unmet-attr');
  });

  it('別件撐起需求時就不算凍結（A 撐起 B）', () => {
    const helper = item({
      templateId: 2, name: '龍骨頭盔', slot: 'helmet', requiredAttributes: { STR: 18, VIT: 16 },
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'STR' }],
    });
    const target = item({ requiredAttributes: { STR: 23, VIT: 18 } });
    setStore(character({ STR: 22, VIT: 18 }), { helmet: helper, chest: target });
    render(<EquipmentDetail item={target} />);
    expect(screen.queryByText('素質不足 · 詞綴未生效')).toBeNull();
  });

  it('防具不再列可用職業', () => {
    render(<EquipmentDetail item={item()} />);
    expect(screen.queryByText(/可用職業/)).toBeNull();
  });
});

describe('防禦的三段顯示', () => {
  beforeEach(() => setStore(character({ STR: 24, VIT: 18 })));

  it('基礎 + 隨機額外 + 強化', () => {
    render(<EquipmentDetail item={item({ defense: 9, defenseBonus: 1, enhancement: 5 })} />);
    expect(screen.getByText(/防禦:/).textContent).toBe('防禦: 9+1+5');
  });

  it('隨機額外抽到上限時粗體標示', () => {
    render(<EquipmentDetail item={item({ defense: 9, defenseBonus: 2 })} />);
    expect(screen.getByTitle('隨機額外防禦為最大值').textContent).toBe('+2');
  });

  it('基礎 0 的上衣照樣顯示防禦', () => {
    render(<EquipmentDetail item={item({ slot: 'shirt', defense: 0, defenseBonus: 2, enhancement: 4 })} />);
    expect(screen.getByText(/防禦:/).textContent).toBe('防禦: 0+2+4');
  });
});

describe('額外屬性詞綴的顯示', () => {
  beforeEach(() => setStore(character({ STR: 24, VIT: 18 })));

  it('一律粗體，並標示印記不能升階', () => {
    render(<EquipmentDetail item={item({
      affixes: [{ type: 'bonus_attribute', tier: 0, value: 1, attribute: 'AGI' }],
    })} />);
    const el = screen.getByText('敏捷 +1');
    expect(el.className).toContain('max-roll');
    expect(el.getAttribute('title')).toContain('無 Tier');
  });
});

/** `06-equipment.md` § 6.6：魔導書／臂甲是防具裡唯二保留職業限制的件 */
describe('副手的職業限制顯示', () => {
  const armGuard = item({
    templateId: 1175, name: '鐵鑄護腕', type: 'armGuard', slot: 'leftHand',
    defense: 3, line: 'light', requiredAttributes: { AGI: 12 }, requiredClass: ['thief'],
  });

  it('有素質需求也要列出可用職業', () => {
    setStore(character({ AGI: 12 }));
    render(<EquipmentDetail item={armGuard} />);
    expect(screen.getByText(/可用職業/).textContent).toContain('盜賊');
  });

  it('本角色職業不符時標紅', () => {
    setStore(character({ AGI: 12 }));
    render(<EquipmentDetail item={armGuard} />);
    expect(screen.getByText(/可用職業/).className).toContain('equip-detail-unmet');
  });

  it('職業相符時不標紅', () => {
    setStore({ ...character({ AGI: 12 }), className: 'thief' });
    render(<EquipmentDetail item={armGuard} />);
    expect(screen.getByText(/可用職業/).className).not.toContain('equip-detail-unmet');
  });

  it('compact 模式仍不列可用職業', () => {
    setStore(character({ AGI: 12 }));
    render(<EquipmentDetail item={armGuard} compact />);
    expect(screen.queryByText(/可用職業/)).toBeNull();
  });
});
