import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { StarterNpc } from '../town/StarterNpc';
import { useGameStore } from '../../stores/gameStore';
import { getStarterTemplates } from '../../systems/starterNpc';
import type { EquipmentInstance } from '../../models/equipment';

/**
 * @vitest-environment jsdom
 *
 * 新手指導員的領取／強化分頁（`13-town.md` § 13.11、`34-ui-guidelines.md` § 34.1）。
 */

function instanceOf(name: string, over: Partial<EquipmentInstance> = {}): EquipmentInstance {
  const tpl = getStarterTemplates('elementalist').find(t => t.name === name)!;
  return {
    ...tpl,
    id: Math.floor(Math.random() * 1e6),
    templateId: tpl.id,
    enhancement: 0,
    isStarterGear: true,
    affixes: [],
    quality: 0,
    ...over,
  } as EquipmentInstance;
}

function setup(inventory: EquipmentInstance[], gold = 10000) {
  useGameStore.setState({
    character: {
      name: 'T', className: 'elementalist', level: 5, exp: 0, expToNext: 1,
      hp: 1, maxHp: 1, mp: 1, maxMp: 1,
      baseAttributes: { STR: 1, AGI: 1, VIT: 1, SPI: 1, INT: 1, CHA: 1 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold, currentArea: 'neutral-town', currentZone: 'newbie-neutral',
      currentRegion: 'neutral-town', currentFloor: null,
      skills: [], quests: [], unspentAttributePoints: 0,
      areaEnteredAt: 0, createdAt: 0, userId: 1,
    },
    equippedGear: {},
    inventory,
  });
  render(<StarterNpc />);
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('.shop-item') as HTMLElement;
}

describe('強化裝備分頁', () => {
  beforeEach(() => {
    setup([
      instanceOf('新手法杖', { enhancement: 4 }),   // 安定值 6，可再強化
      instanceOf('新手法師長袍', { enhancement: 4 }), // 安定值 4，已滿
      instanceOf('皮腰帶'),                          // 安定值 -1，不可強化
    ]);
    fireEvent.click(screen.getByRole('button', { name: '強化裝備' }));
  });

  it('可強化的裝備顯示強化按鈕與費用', () => {
    const btn = within(rowOf('新手法杖')).getByRole('button', { name: /強化 500G/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it('達安定值的裝備顯示「已滿」而非按鈕', () => {
    const row = rowOf('新手法師長袍');
    expect(within(row).getByText('已滿')).toBeDefined();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('腰帶顯示「不可強化」，不可再出現「已滿」或 -1 的進度', () => {
    const row = rowOf('皮腰帶');
    expect(within(row).getByText('不可強化')).toBeDefined();
    expect(within(row).queryByText('已滿')).toBeNull();
    expect(row.textContent).not.toContain('-1');
  });

  it('進度格數等於安定值，填滿數等於目前強化等級', () => {
    const staff = rowOf('新手法杖');
    const cells = staff.querySelectorAll('.starter-track-cell');
    expect(cells.length).toBe(6);
    expect(staff.querySelectorAll('.starter-track-cell.filled').length).toBe(4);

    expect(rowOf('新手法師長袍').querySelectorAll('.starter-track-cell').length).toBe(4);
  });

  it('可強化的排在最前面', () => {
    const names = [...document.querySelectorAll('.starter-row-name')].map(e => e.textContent);
    expect(names[0]).toContain('新手法杖');
  });

  it('金幣不足時強化按鈕停用', () => {
    setup([instanceOf('新手法杖', { enhancement: 1 })], 100);
    fireEvent.click(screen.getAllByRole('button', { name: '強化裝備' })[1]);
    const btns = screen.getAllByRole('button', { name: /強化 500G/ });
    expect((btns[btns.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('領取裝備分頁', () => {
  beforeEach(() => {
    setup([instanceOf('新手法杖')]);
    fireEvent.click(screen.getByRole('button', { name: '領取裝備' }));
  });

  it('列出該職業整套裝備，並標示部位', () => {
    const templates = getStarterTemplates('elementalist');
    for (const tpl of templates) {
      expect(screen.getByText(tpl.name)).toBeDefined();
    }
    expect(within(rowOf('新手法杖')).getByText('右手')).toBeDefined();
  });

  it('已持有與未持有分別標示', () => {
    expect(within(rowOf('新手法杖')).getByText('已擁有')).toBeDefined();
    expect(within(rowOf('新手布鞋')).getByText('未擁有')).toBeDefined();
  });

  it('領取按鈕顯示缺少件數', () => {
    const total = getStarterTemplates('elementalist').length;
    expect(screen.getByRole('button', { name: new RegExp(`領取缺少的裝備（${total - 1} 件）`) })).toBeDefined();
  });

  it('全部持有時領取按鈕停用', () => {
    setup(getStarterTemplates('elementalist').map(t => instanceOf(t.name)));
    fireEvent.click(screen.getAllByRole('button', { name: '領取裝備' })[1]);
    const btn = screen.getAllByRole('button', { name: '已全部擁有' })[0];
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});
