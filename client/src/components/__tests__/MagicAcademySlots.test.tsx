// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MagicAcademy } from '../town/MagicAcademy';
import { useGameStore } from '../../stores/gameStore';
import { SKILL_CATALOG } from '../../models/skill';
import { CLASS_SKILLS } from '../../models/classSkills';
import type { Skill } from '../../models/skill';

function learn(id: string): Skill {
  const template =
    SKILL_CATALOG.find(s => s.id === id) ?? CLASS_SKILLS.find(d => d.id === id)?.skill;
  if (!template) throw new Error(`unknown skill: ${id}`);
  return { ...template, lastUsedAt: 0 };
}

function setup(skills: Skill[]) {
  useGameStore.setState({
    character: {
      name: 'TestKnight',
      className: 'knight',
      level: 55,
      exp: 0,
      expToNext: 1000,
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      baseAttributes: { STR: 18, AGI: 14, VIT: 16, SPI: 10, INT: 10, CHA: 12 },
      bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
      gold: 100000,
      currentArea: 'dawn-plains',
      currentZone: 'walden',
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
    bagItems: [],
  });
}

describe('魔法學院學習額度', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('職業魔法不佔基礎魔法額度', () => {
    setup([
      learn('wind-blade'),
      learn('bless-weapon'),
      learn('ice-bolt'),
      learn('shield-bash'),
      learn('rend'),
    ]);
    render(<MagicAcademy />);

    expect(screen.getByText('已學: 3 / 5')).toBeTruthy();
    expect(screen.getByText('治癒 (Lv.1)')).toBeTruthy();
    expect(screen.getByText('保護罩 (Lv.1)')).toBeTruthy();
  });

  it('已學習魔法清單只列基礎魔法', () => {
    setup([learn('wind-blade'), learn('shield-bash')]);
    render(<MagicAcademy />);

    const learned = document.querySelectorAll('.learned-skill');
    expect(Array.from(learned).map(el => el.querySelector('span')?.textContent)).toEqual(['風刃']);
  });

  it('基礎魔法學滿 5 個後不再有可學魔法', () => {
    setup([
      learn('wind-blade'),
      learn('bless-weapon'),
      learn('ice-bolt'),
      learn('heal'),
      learn('protect-shield'),
      learn('shield-bash'),
    ]);
    render(<MagicAcademy />);

    expect(screen.getByText('已學: 5 / 5')).toBeTruthy();
    expect(screen.getByText('沒有可學習的魔法')).toBeTruthy();
  });
});
