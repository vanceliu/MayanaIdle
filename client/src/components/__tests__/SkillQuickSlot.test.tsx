// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SkillPanel } from '../SkillPanel';
import { QuickSlotBar } from '../QuickSlotBar';
import { MonsterListOverlay } from '../MonsterListOverlay';
import { useGameStore } from '../../stores/gameStore';
import { useMonsterHudStore } from '../../stores/monsterHudStore';
import { useCombatCommandStore } from '../../stores/combatCommandStore';
import { instantiateFromTemplate } from '../../models/skillTemplate';
import { emptyQuickSlots } from '../../models/quickSlot';
import { dragTo, restoreElementFromPoint } from '../../testing/pointerDrag';
import { EQUIPMENT_SEEDS } from '../../db/seed/equipmentSeeds';
import type { Skill } from '../../models/skill';
import type { Character } from '../../models/character';

vi.mock('../../hooks/useEquipmentTemplates', () => ({
  useEquipmentTemplates: () => EQUIPMENT_SEEDS,
}));

vi.mock('../GameIcon', () => ({
  GameIcon: ({ name, color }: { name: string; color?: string }) =>
    <span data-testid="icon" data-name={name} data-color={color ?? ''} />,
}));

/** 一級風系單體技，射程與 CD 都適合當測試素材 */
const ATTACK_SKILL = 'wind-blade';
/** 一級治癒術：`type === 'heal'`、`range === 0`，用來驗「不佔攻擊 tick」 */
const HEAL_SKILL = 'heal';

function learn(id: string, lastUsedAt = 0): Skill {
  const skill = instantiateFromTemplate(id, lastUsedAt);
  if (!skill) throw new Error(`測試素材 ${id} 不存在`);
  return skill;
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    userId: 1,
    name: 'TestHero',
    className: 'elementalist',
    level: 50,
    exp: 0,
    expToNext: 1000,
    hp: 100,
    maxHp: 100,
    mp: 300,
    maxMp: 300,
    baseAttributes: { STR: 8, AGI: 8, VIT: 10, SPI: 14, INT: 18, CHA: 12 },
    bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
    unspentAttributePoints: 0,
    gold: 0,
    currentArea: 'dawn-plains',
    currentZone: 'newbie-neutral',
    currentRegion: 'dawn-plains',
    currentFloor: null,
    skills: [],
    quests: [],
    areaEnteredAt: 0,
    createdAt: 0,
    ...overrides,
  };
}

function setup(skills: Skill[], charOverrides: Partial<Character> = {}) {
  useGameStore.setState({
    character: character(charOverrides),
    skills,
    quickSlots: emptyQuickSlots(),
    bagItems: [],
    inventory: [],
    equippedGear: {},
    activeEffects: [],
    combatLogs: [],
  });
  useCombatCommandStore.getState().clear();
}

const slots = () => Array.from(document.querySelectorAll('.quick-slot')) as HTMLButtonElement[];

/** 技能面板上某一招的格子 */
function skillCell(name: string): HTMLElement {
  const label = screen.getByText(name);
  const cell = label.closest('.skill-cell');
  if (!cell) throw new Error(`找不到 ${name} 的技能格`);
  return cell as HTMLElement;
}

afterEach(() => {
  restoreElementFromPoint();
});

describe('技能面板 → 快捷格綁定（§ 35.7.3）', () => {
  beforeEach(() => setup([learn(ATTACK_SKILL)]));

  it('已習得的技能可以拖進快捷格', () => {
    const skill = learn(ATTACK_SKILL);
    render(<><SkillPanel /><QuickSlotBar /></>);

    dragTo(skillCell(skill.name), slots()[2]);

    expect(useGameStore.getState().quickSlots[2]).toEqual({ kind: 'skill', skillId: ATTACK_SKILL });
  });

  it('右鍵開選單即可指定快捷鍵', () => {
    const skill = learn(ATTACK_SKILL);
    render(<SkillPanel />);

    fireEvent.contextMenu(skillCell(skill.name));
    fireEvent.click(screen.getByText(/快捷鍵 3/));

    expect(useGameStore.getState().quickSlots[2]).toEqual({ kind: 'skill', skillId: ATTACK_SKILL });
  });

  /**
   * 技能面板會把**未習得**的格子也畫出來（暗色）。少了這道防線，
   * 玩家可以把還學不到的招綁上快捷鍵。
   */
  it('未習得的技能格開不了選單', () => {
    setup([]);
    render(<SkillPanel />);

    fireEvent.contextMenu(skillCell(learn(ATTACK_SKILL).name));

    expect(screen.queryByText(/快捷鍵 1/)).toBeNull();
  });
});

describe('技能快捷格的可用狀態（§ 35.7.4 / § 35.7.6）', () => {
  it('技能就緒時可按，且不顯示數量', () => {
    setup([learn(ATTACK_SKILL)]);
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    render(<QuickSlotBar />);

    expect(slots()[0].getAttribute('aria-disabled')).toBe('false');
    // 技能沒有「剩幾個」可言
    expect(slots()[0].querySelector('.quick-slot-count')).toBeNull();
  });

  it('MP 不足時變暗且不可按，但不清空該格', () => {
    const skill = learn(ATTACK_SKILL);
    setup([skill], { mp: 0 });
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    render(<QuickSlotBar />);

    expect(slots()[0].getAttribute('aria-disabled')).toBe('true');
    expect(slots()[0].className).toContain('blocked');
    expect(useGameStore.getState().quickSlots[0]).not.toBeNull();
  });

  /**
   * 冷卻狀態由 rAF 迴圈發佈（§ 35.7.6：指針不可走 React state），
   * 所以要等一幀才看得到 —— 用 `waitFor` 自動等，不可寫死延遲。
   */
  it('冷卻中變暗且不可按', async () => {
    setup([learn(ATTACK_SKILL, Date.now())]);
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    render(<QuickSlotBar />);

    await waitFor(() => {
      expect(slots()[0].getAttribute('aria-disabled')).toBe('true');
      expect(slots()[0].className).toContain('blocked');
    });
  });

  it('冷卻中會畫出扇形遮罩，就緒時收起來', async () => {
    setup([learn(ATTACK_SKILL, Date.now())]);
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    const { rerender } = render(<QuickSlotBar />);

    const sweep = () => screen.getByTestId('quick-slot-cd') as HTMLElement;
    await waitFor(() => expect(sweep().hidden).toBe(false));
    // 角度是「剩餘」冷卻，剛施放完應該接近整圈
    expect(parseFloat(sweep().style.getPropertyValue('--cd-angle'))).toBeGreaterThan(300);

    // 冷卻歸零 → 扇形收起、格子解除封鎖
    setup([learn(ATTACK_SKILL, 0)]);
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    rerender(<QuickSlotBar />);

    await waitFor(() => {
      expect(sweep().hidden).toBe(true);
      expect(slots()[0].className).not.toContain('blocked');
    });
  });

  it('指向未習得技能的格子在點擊時清空（§ 35.7.4 的真失效）', () => {
    setup([]);
    useGameStore.setState({ quickSlots: [{ kind: 'skill', skillId: ATTACK_SKILL }, ...emptyQuickSlots().slice(1)] });
    render(<QuickSlotBar />);

    useGameStore.getState().useQuickSlot(0);

    expect(useGameStore.getState().quickSlots[0]).toBeNull();
  });
});

describe('手動施放（§ 3.6.2）', () => {
  it('攻擊技能排進下一個攻擊 tick，不立即結算', () => {
    setup([learn(ATTACK_SKILL)]);

    expect(useGameStore.getState().castQuickSlotSkill(ATTACK_SKILL)).toBe(true);
    expect(useCombatCommandStore.getState().pendingSkillId).toBe(ATTACK_SKILL);
    // MP 要等真的出手才扣
    expect(useGameStore.getState().character?.mp).toBe(300);
  });

  it('冷卻中當場拒絕，不排隊', () => {
    setup([learn(ATTACK_SKILL, Date.now())]);

    expect(useGameStore.getState().castQuickSlotSkill(ATTACK_SKILL)).toBe(false);
    expect(useCombatCommandStore.getState().pendingSkillId).toBeNull();
    expect(useGameStore.getState().combatLogs.at(-1)?.text).toContain('冷卻中');
  });

  it('MP 不足當場拒絕，不排隊', () => {
    setup([learn(ATTACK_SKILL)], { mp: 0 });

    expect(useGameStore.getState().castQuickSlotSkill(ATTACK_SKILL)).toBe(false);
    expect(useCombatCommandStore.getState().pendingSkillId).toBeNull();
    expect(useGameStore.getState().combatLogs.at(-1)?.text).toContain('MP 不足');
  });

  /**
   * 攻擊 tick 只在「有目標且進入射程」時才觸發，
   * 把補血排進去等於「地圖上沒怪就補不了血」。
   */
  it('治癒技能立即施放，不進攻擊 tick 佇列', () => {
    const healSkill = instantiateFromTemplate(HEAL_SKILL, 0);
    if (!healSkill) throw new Error(`測試素材 ${HEAL_SKILL} 不存在`);
    setup([healSkill], { hp: 1 });

    expect(useGameStore.getState().castQuickSlotSkill(healSkill.id)).toBe(true);
    expect(useCombatCommandStore.getState().pendingSkillId).toBeNull();
    expect(useGameStore.getState().character!.hp).toBeGreaterThan(1);
  });
});

describe('怪物列表點擊切目標（§ 3.6.1）', () => {
  beforeEach(() => {
    setup([]);
    useMonsterHudStore.setState({
      entries: [
        { id: 'm1', name: '史萊姆', currentHp: 10, maxHp: 10, isBoss: false },
        { id: 'm2', name: '哥布林', currentHp: 20, maxHp: 20, isBoss: false },
      ],
      targetId: 'm1',
    });
  });

  it('點卡片會下達切目標指令', () => {
    render(<MonsterListOverlay />);

    fireEvent.pointerDown(screen.getByText('哥布林').closest('.monster-card')!);

    expect(useCombatCommandStore.getState().pendingTargetId).toBe('m2');
  });

  it('目前目標的卡片標記為已選', () => {
    render(<MonsterListOverlay />);

    const current = screen.getByText('史萊姆').closest('.monster-card')!;
    expect(current.getAttribute('aria-pressed')).toBe('true');
  });
});
