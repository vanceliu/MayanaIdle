import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalentTypeEditor } from '../../components/TalentEditor';
import { useTalentStore } from '../../stores/talentStore';
import { useGameStore } from '../../stores/gameStore';
import type { TalentSlot } from '../../models/talent';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

const slot: TalentSlot = {
  id: 1, characterId: 1, tier: 1,
  assignedType: 'combat', templateId: 'default', order: 0, enabled: true,
};

/* 選單開著就擋住底下的東西，沒有關閉路徑等於卡在畫面上 */
describe('天賦選單點外面就關掉', () => {
  beforeEach(() => {
    useGameStore.setState({ activeTemplateId: 'default' });
    useTalentStore.setState({ characterId: 1, slots: [slot], affixes: [] });
  });

  it('點空槽開選單，點外面關掉', () => {
    render(<TalentTypeEditor type="combat" />);
    fireEvent.click(screen.getAllByText('＋ 條件')[0]);
    expect(screen.getByText('沒有可鑲的鑲材')).toBeDefined();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText('沒有可鑲的鑲材')).toBeNull();
  });

  it('按 Esc 也關得掉', () => {
    render(<TalentTypeEditor type="combat" />);
    fireEvent.click(screen.getAllByText('＋ 條件')[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('沒有可鑲的鑲材')).toBeNull();
  });

  it('點選單自己不會關掉', () => {
    render(<TalentTypeEditor type="combat" />);
    fireEvent.click(screen.getAllByText('＋ 條件')[0]);
    fireEvent.pointerDown(screen.getByText('沒有可鑲的鑲材'));
    expect(screen.getByText('沒有可鑲的鑲材')).toBeDefined();
  });
});
