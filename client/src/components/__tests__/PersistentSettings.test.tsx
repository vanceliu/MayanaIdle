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
    useTalentStore.setState({ characterId: 1, slots: [] });
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

  it('改門檻：打字只改輸入格，離開輸入格才寫回 store', () => {
    render(<TalentTypeEditor type="persistent" />);
    const input = screen.getByDisplayValue('40');
    fireEvent.change(input, { target: { value: '55' } });
    expect(useGameStore.getState().afterCombatHpThreshold).toBe(40);

    fireEvent.blur(input);
    expect(useGameStore.getState().afterCombatHpThreshold).toBe(55);
  });

  it('改門檻：按 Enter 也寫回 store', () => {
    render(<TalentTypeEditor type="persistent" />);
    const input = screen.getByDisplayValue('30');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useGameStore.getState().afterCombatMpThreshold).toBe(25);
  });

  it('遠端寫入未回覆前連續修改：緊急撤退的開關與門檻都保留', async () => {
    const sent: unknown[] = [];
    const original = useGameStore.getState().setEmergencyRetreat;
    useGameStore.setState({ setEmergencyRetreat: ((r: unknown) => { sent.push(r); return new Promise(() => {}); }) as never });
    try {
      render(<TalentTypeEditor type="persistent" />);
      const enabledBefore = useGameStore.getState().scriptTemplates
        .find(t => t.id === useGameStore.getState().activeTemplateId)!.emergencyRetreat.enabled;

      fireEvent.click(screen.getByRole('checkbox'));
      const hp = screen.getByLabelText('緊急撤退 HP 門檻');
      fireEvent.change(hp, { target: { value: '15' } });
      fireEvent.blur(hp);

      expect(sent.at(-1)).toMatchObject({ enabled: !enabledBefore, hpThreshold: 15 });
    } finally {
      useGameStore.setState({ setEmergencyRetreat: original });
    }
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
