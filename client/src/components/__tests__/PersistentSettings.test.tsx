import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TalentTypeEditor } from '../TalentEditor';
import { useGameStore } from '../../stores/gameStore';
import { useTalentStore } from '../../stores/talentStore';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => [],
}));

/**
 * @vitest-environment jsdom
 */

/*
 * 緊急撤退與戰鬥後等待在改版時掉了 UI，但引擎照跑（`systems/gameLoop.ts`）——
 * 設定不見等於玩家改不了一個仍在生效的行為。
 */
describe('常駐分頁的門檻設定（§ 3.13）', () => {
  beforeEach(() => {
    useTalentStore.setState({ characterId: 1, slots: [], affixes: [] });
    useGameStore.setState({
      afterCombatHpThreshold: 40,
      afterCombatMpThreshold: 30,
      afterCombatHpResumeThreshold: 90,
      afterCombatMpResumeThreshold: 80,
    });
  });

  it('常駐分頁看得到緊急撤退與戰鬥後等待', () => {
    render(<TalentTypeEditor type="persistent" />);
    expect(screen.getByText('緊急撤退（僅戰鬥中生效）')).toBeDefined();
    expect(screen.getByText('戰鬥後等待')).toBeDefined();
  });

  it('戰鬥與補給分頁沒有這兩組設定', () => {
    render(<TalentTypeEditor type="combat" />);
    expect(screen.queryByText('戰鬥後等待')).toBeNull();
  });

  it('改門檻會寫回 store', () => {
    render(<TalentTypeEditor type="persistent" />);
    const input = screen.getByDisplayValue('40');
    fireEvent.change(input, { target: { value: '55' } });
    expect(useGameStore.getState().afterCombatHpThreshold).toBe(55);
  });

  it('緊急撤退可開關', () => {
    render(<TalentTypeEditor type="persistent" />);
    const before = useGameStore.getState().scriptTemplates;
    expect(before.length).toBeGreaterThan(0);

    const box = screen.getByRole('checkbox');
    fireEvent.click(box);
    const retreat = useGameStore.getState().scriptTemplates
      .find(t => t.id === useGameStore.getState().activeTemplateId)!.emergencyRetreat;
    expect(retreat.enabled).toBe(!before[0].emergencyRetreat.enabled);
  });
});
