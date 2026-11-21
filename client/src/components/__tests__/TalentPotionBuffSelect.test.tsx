import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TalentTypeEditor } from '../TalentEditor';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import { POTION_BUFF_OPTIONS } from '../../models/talentParams';
import type { TalentSlot, TalentSlotEntry } from '../../models/talent';
import type { Skill } from '../../models/skill';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 *
 * Buff 參數的選單：已學會的 buff 技能＋藥水 buff（`51-auto-talent.md` § 51.4.5、§ 51.4.7）。
 */
const TEMPLATE_ID = 'tpl-potion';

const MAGIC_ARMOR: Skill = {
  id: 'magic-armor', name: '魔法盔甲', level: 1, element: 'none', type: 'buff', target: 'single',
  power: 0, mpCost: 10, cooldown: 0, lastUsedAt: 0,
};

function slot(condition: TalentSlotEntry, action: TalentSlotEntry): TalentSlot {
  return {
    id: 1, characterId: 1, tier: 1, assignedType: 'persistent', templateId: TEMPLATE_ID, order: 0, enabled: true,
    conditions: [condition], action,
  } as TalentSlot;
}

let setEntryParams: ReturnType<typeof vi.fn>;

function setup(condition: TalentSlotEntry, action: TalentSlotEntry) {
  setEntryParams = vi.fn(() => Promise.resolve());
  useGameStore.setState({ activeTemplateId: TEMPLATE_ID, skills: [MAGIC_ARMOR] });
  useTalentStore.setState({ characterId: 1, slots: [slot(condition, action)], setEntryParams } as never);
}

beforeEach(() => {
  setup(
    { ruleId: 'buff_not_active', params: {} },
    { ruleId: 'use_consumable', params: {} },
  );
});

describe('Buff 參數的藥水選項', () => {
  it('Buff 未激活：列已學會的 buff 技能與全部藥水 buff', () => {
    render(<TalentTypeEditor type="persistent" />);
    const select = screen.getByLabelText('Buff');
    const labels = within(select).getAllByRole('option').map(o => o.textContent);
    expect(labels).toEqual(['未選擇', '魔法盔甲', ...POTION_BUFF_OPTIONS.map(o => o.label)]);
  });

  it('選藥水存 buff category', () => {
    render(<TalentTypeEditor type="persistent" />);
    fireEvent.change(screen.getByLabelText('Buff'), { target: { value: 'crit-potion' } });
    expect(setEntryParams).toHaveBeenCalledWith(1, 0, { skillId: 'crit-potion' });
  });

  it('施放 Buff 動作的技能選單不列藥水', () => {
    setup(
      { ruleId: 'hp_below', params: { value: 30 } },
      { ruleId: 'buff_skill', params: {} },
    );
    render(<TalentTypeEditor type="persistent" />);
    const select = screen.getByLabelText('技能');
    const labels = within(select).getAllByRole('option').map(o => o.textContent);
    expect(labels).toEqual(['未選擇', '魔法盔甲']);
  });
});
