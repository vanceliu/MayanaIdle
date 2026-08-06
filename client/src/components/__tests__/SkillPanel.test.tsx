// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SkillPanel } from '../SkillPanel';
import { useGameStore } from '../../stores/gameStore';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_SKILLS } from '../../models/classSkills';
import { CLASS_MAGIC_RESTRICTIONS } from '../../models/skillRestrictions';
import type { ClassName } from '../../models/character';
import type { Skill } from '../../models/skill';

const ALL_CLASSES: ClassName[] = ['knight', 'elf', 'elementalist', 'priest', 'thief'];

function setup(className: ClassName, skills: Skill[]) {
  useGameStore.setState({
    character: {
      name: 'TestHero',
      className,
      level: 50,
      exp: 0,
      expToNext: 1000,
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 0,
      currentArea: 'dawn-plains',
      currentZone: 'newbie-neutral',
      currentRegion: 'dawn-plains',
      currentFloor: null,
      skills,
      unspentAttributePoints: 0,
      quests: [],
      areaEnteredAt: 0,
      createdAt: 0,
      userId: 1,
    },
    skills,
  });
}

/** 由模板組出「已習得」的技能實例 */
function learn(id: string): Skill {
  const template =
    SKILL_CATALOG.find(s => s.id === id) ?? CLASS_SKILLS.find(d => d.id === id)?.skill;
  if (!template) throw new Error(`unknown skill: ${id}`);
  return { ...template, lastUsedAt: 0 };
}

const cells = () => document.querySelectorAll('.skill-cell');

/** 職業魔法的 5 格永遠排在基礎魔法格之後，起點依職業的基礎魔法上限而異 */
function classCells(className: ClassName) {
  return Array.from(cells()).slice(CLASS_MAGIC_RESTRICTIONS[className].maxSkills);
}

describe('SkillPanel 技能格全開顯示', () => {
  beforeEach(() => {
    setup('elf', []);
  });

  it('沒學任何技能時，可學範圍內的格子全部畫出來且全為 locked', () => {
    render(<SkillPanel />);
    // 妖精基礎魔法上限 6 級 = 30 格，加上 5 格職業魔法
    expect(cells().length).toBe(35);
    expect(document.querySelectorAll('.skill-cell.locked').length).toBe(35);
    expect(document.querySelectorAll('.skill-cell.learned').length).toBe(0);
  });

  it('未習得的格子仍顯示技能名稱', () => {
    render(<SkillPanel />);
    // 基礎魔法與職業魔法各取一個未習得的技能名稱
    expect(screen.getByText(SKILL_CATALOG[0].name)).toBeDefined();
    expect(screen.getByText('穿透箭雨')).toBeDefined();
  });

  it('已習得的基礎魔法變成 learned，其餘維持 locked', () => {
    const target = SKILL_CATALOG[0];
    setup('elf', [learn(target.id)]);
    render(<SkillPanel />);
    const learned = document.querySelectorAll('.skill-cell.learned');
    expect(learned.length).toBe(1);
    expect(learned[0].textContent).toContain(target.name);
    expect(document.querySelectorAll('.skill-cell.locked').length).toBe(34);
  });

  it('職業魔法第 N 格固定對應第 N 級，不隨已習得數量位移', () => {
    setup('elf', [learn('triple-shot')]); // 精靈職業魔法 3 級
    render(<SkillPanel />);
    const cellsOfClass = classCells('elf');
    expect(cellsOfClass.map(c => c.textContent)).toEqual([
      '精準射擊', '火矢附魔', '三連射', '鷹眼', '穿透箭雨',
    ]);
    expect(cellsOfClass[2].className).toContain('learned');
    expect(cellsOfClass[0].className).toContain('locked');
    expect(cellsOfClass[3].className).toContain('locked');
  });

  it('職業魔法依角色職業顯示對應技能，且與 CLASS_SKILLS 同步', () => {
    for (const className of ALL_CLASSES) {
      setup(className, []);
      const { unmount } = render(<SkillPanel />);
      const expected = CLASS_SKILLS
        .filter(d => d.className === className)
        .sort((a, b) => a.classLevel - b.classLevel)
        .map(d => d.name);
      expect(classCells(className).map(c => c.textContent)).toEqual(expected);
      unmount();
    }
  });

  it('未習得的格子 hover 也會顯示完整 tooltip，狀態為未習得', () => {
    render(<SkillPanel />);
    const cellsOfClass = classCells('elf');
    fireEvent.mouseEnter(cellsOfClass[4]); // 穿透箭雨（未習得）
    const tooltip = document.querySelector('.skill-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain('穿透箭雨');
    expect(tooltip!.textContent).toContain('MP: 55');
    expect(tooltip!.textContent).toContain('未習得');
    expect(document.querySelector('.skill-tooltip-status.locked')).not.toBeNull();
  });

  it('已習得的格子 hover 顯示已習得狀態', () => {
    setup('elf', [learn('precise-shot')]);
    render(<SkillPanel />);
    fireEvent.mouseEnter(classCells('elf')[0]);
    const tooltip = document.querySelector('.skill-tooltip');
    expect(tooltip!.textContent).toContain('已習得');
    expect(document.querySelector('.skill-tooltip-status.learned')).not.toBeNull();
  });

  it('標題計數的分母是該職業的基礎魔法上限', () => {
    setup('elf', [learn(SKILL_CATALOG[0].id), learn('precise-shot')]);
    render(<SkillPanel />);
    expect(screen.getByText('1/30')).toBeDefined();
    expect(screen.getByText('1/5')).toBeDefined();
  });
});

describe('SkillPanel 基礎魔法依職業上限顯示（§ 5.3）', () => {
  // 表格數值來自 05-skill.md § 5.3「各職業基礎魔法學習上限」
  const CAPS: Array<{ className: ClassName; maxLevel: number; maxSkills: number }> = [
    { className: 'elementalist', maxLevel: 10, maxSkills: 50 },
    { className: 'priest', maxLevel: 10, maxSkills: 50 },
    { className: 'elf', maxLevel: 6, maxSkills: 30 },
    { className: 'thief', maxLevel: 4, maxSkills: 20 },
    { className: 'knight', maxLevel: 1, maxSkills: 5 },
  ];

  for (const { className, maxLevel, maxSkills } of CAPS) {
    it(`${className}：只畫到 Lv${maxLevel}，共 ${maxSkills} 格`, () => {
      setup(className, []);
      const { container, unmount } = render(<SkillPanel />);
      const labels = Array.from(container.querySelectorAll('.skill-row-label'))
        .map(el => el.textContent)
        .filter(t => t); // 職業魔法那列的列首標籤是空的
      expect(labels).toEqual(
        Array.from({ length: maxLevel }, (_, i) => `Lv${i + 1}`),
      );
      expect(cells().length).toBe(maxSkills + 5);
      unmount();
    });
  }

  it('妖精看不到 7~10 級的基礎魔法', () => {
    setup('elf', []);
    const { container } = render(<SkillPanel />);
    const labels = Array.from(container.querySelectorAll('.skill-row-label')).map(el => el.textContent);
    for (const level of [7, 8, 9, 10]) {
      expect(labels).not.toContain(`Lv${level}`);
      // 該級數的技能名稱也不該出現在面板上
      for (const template of SKILL_CATALOG.filter(s => s.level === level)) {
        expect(screen.queryByText(template.name)).toBeNull();
      }
    }
  });
});
