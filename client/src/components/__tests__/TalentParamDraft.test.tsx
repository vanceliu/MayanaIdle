import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalentTypeEditor } from '../TalentEditor';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';
import type { TalentSlot } from '../../models/talent';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 *
 * 天賦參數（`51-auto-talent.md` § 51.4.1）送 server 時以本機草稿為準（`97-selfhosted-server.md` § 97.2）：
 * 數字打完離開或按 Enter 才送；回覆前連續改不同欄位，後送的那份要包含前一份。
 */
const TEMPLATE_ID = 'tpl-draft';

function slot(): TalentSlot {
  return {
    id: 1, characterId: 1, tier: 1, assignedType: 'supply', templateId: TEMPLATE_ID, order: 0, enabled: true,
    conditions: [null], action: { ruleId: 'sell_materials', params: {} },
  } as TalentSlot;
}

let setEntryParams: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setEntryParams = vi.fn(() => new Promise(() => {}));
  useGameStore.setState({ activeTemplateId: TEMPLATE_ID });
  useTalentStore.setState({ characterId: 1, slots: [slot()], setEntryParams } as never);
});

describe('天賦參數的本機草稿', () => {
  it('數字打字不送，離開輸入格才送', () => {
    render(<TalentTypeEditor type="supply" />);
    const tier = screen.getByLabelText('Tier 以下');

    fireEvent.change(tier, { target: { value: '4' } });
    expect(setEntryParams).not.toHaveBeenCalled();

    fireEvent.blur(tier);
    expect(setEntryParams).toHaveBeenCalledWith(1, null, { maxTier: 4 });
  });

  it('回覆前改另一個欄位：送出的參數包含前一次的修改', () => {
    render(<TalentTypeEditor type="supply" />);
    const tier = screen.getByLabelText('Tier 以下');
    fireEvent.change(tier, { target: { value: '4' } });
    fireEvent.keyDown(tier, { key: 'Enter' });

    fireEvent.click(screen.getByLabelText('保留有用途的素材'));

    expect(setEntryParams).toHaveBeenLastCalledWith(1, null, { maxTier: 4, skipCraftMaterials: false });
  });
});
