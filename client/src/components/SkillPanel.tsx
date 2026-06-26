import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { SKILL_CATALOG, type Skill } from '../models/skill';
import type { ClassName } from '../models/character';

const GRID_COLUMNS = 5;
const BASIC_MAGIC_ROWS = 10;
const BASIC_MAGIC_SLOTS = GRID_COLUMNS * BASIC_MAGIC_ROWS;
const CLASS_MAGIC_SLOTS = GRID_COLUMNS;

const CLASS_SKILLS_MAP: Record<ClassName, Array<{ id: string; name: string; level: number }>> = {
  knight: [
    { id: 'shield-bash', name: '盾擊', level: 1 },
    { id: 'rend', name: '裂傷斬', level: 2 },
    { id: 'iron-shield', name: '鋼鐵護盾', level: 3 },
    { id: 'taunt', name: '挑釁怒吼', level: 4 },
    { id: 'vengeance', name: '復仇之刃', level: 5 },
  ],
  elf: [
    { id: 'precise-shot', name: '精準射擊', level: 1 },
    { id: 'fire-arrow', name: '火矢附魔', level: 2 },
    { id: 'triple-shot', name: '三連射', level: 3 },
    { id: 'hawk-eye', name: '鷹眼', level: 4 },
    { id: 'arrow-rain', name: '穿透箭雨', level: 5 },
  ],
  elementalist: [
    { id: 'cd-reduce', name: '冷卻縮減', level: 1 },
    { id: 'mana-drain', name: '魔力奪取', level: 2 },
    { id: 'element-boost', name: '元素增幅', level: 3 },
    { id: 'chain-cast', name: '連鎖詠唱', level: 4 },
    { id: 'element-storm', name: '元素風暴', level: 5 },
  ],
  priest: [
    { id: 'holy-shield', name: '聖光護盾', level: 1 },
    { id: 'high-heal', name: '高階治癒', level: 2 },
    { id: 'group-heal', name: '群體治癒', level: 3 },
    { id: 'resurrect', name: '復活術', level: 4 },
    { id: 'holy-domain', name: '神聖領域', level: 5 },
  ],
  thief: [
    { id: 'envenom', name: '淬毒', level: 1 },
    { id: 'deadly-strike', name: '致命一擊', level: 2 },
    { id: 'smoke-bomb', name: '煙霧彈', level: 3 },
    { id: 'precision-strike', name: '精準打擊', level: 4 },
    { id: 'backstab', name: '背刺', level: 5 },
  ],
};

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#EF4444',
  ice: '#60A5FA',
  wind: '#34D399',
  earth: '#D97706',
  light: '#FBBF24',
  dark: '#A78BFA',
  none: '#94A3B8',
};

interface SkillTooltipData {
  skill: Skill | null;
  name: string;
  level: number;
  learned: boolean;
  x: number;
  y: number;
  above: boolean;
}

export function SkillPanel() {
  const [tooltip, setTooltip] = useState<SkillTooltipData | null>(null);
  const skills = useGameStore(s => s.skills);
  const character = useGameStore(s => s.character);

  if (!character) return null;

  const className = character.className;
  const classSkills = CLASS_SKILLS_MAP[className] || [];

  const learnedBasicSkills = skills.filter(s => SKILL_CATALOG.some(c => c.id === s.id));
  const learnedClassSkills = skills.filter(s => classSkills.some(c => c.id === s.id));

  function handleMouseEnter(e: React.MouseEvent, skill: Skill) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipHeight = 150;
    const above = rect.top > tooltipHeight + 8;
    const y = above ? rect.top - 8 : rect.bottom + 8;
    let x = rect.left;
    if (x + 160 > window.innerWidth) {
      x = rect.right - 160;
    }
    setTooltip({
      skill,
      name: skill.name,
      level: skill.level,
      learned: true,
      x,
      y,
      above,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="skill-panel">
      <div className="skill-section">
        <div className="skill-section-header">
          <span className="skill-section-title">基礎魔法</span>
          <span className="skill-section-meta">
            {learnedBasicSkills.length}/{BASIC_MAGIC_SLOTS}
          </span>
        </div>
        <div className="skill-grid-with-labels">
          {Array.from({ length: BASIC_MAGIC_ROWS }).map((_, rowIdx) => {
            const level = rowIdx + 1;
            const catalogForLevel = SKILL_CATALOG.filter(c => c.level === level);
            return (
              <div key={`row-${rowIdx}`} className="skill-grid-row">
                <span className="skill-row-label">Lv{level}</span>
                {Array.from({ length: GRID_COLUMNS }).map((_, colIdx) => {
                  const catalogEntry = catalogForLevel[colIdx];
                  if (!catalogEntry) {
                    return <div key={`basic-empty-${rowIdx}-${colIdx}`} className="skill-cell empty" />;
                  }
                  const learned = skills.some(s => s.id === catalogEntry.id);
                  if (!learned) {
                    return <div key={catalogEntry.id} className="skill-cell empty" />;
                  }
                  const skill = skills.find(s => s.id === catalogEntry.id)!;
                  const element = catalogEntry.element || 'none';
                  return (
                    <div
                      key={skill.id}
                      className="skill-cell learned"
                      onMouseEnter={(e) => handleMouseEnter(e, skill)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <span
                        className="skill-cell-dot"
                        style={{ backgroundColor: ELEMENT_COLORS[element] }}
                      />
                      <span className="skill-cell-name">{skill.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="skill-section">
        <div className="skill-section-header">
          <span className="skill-section-title">職業魔法</span>
          <span className="skill-section-meta">
            {learnedClassSkills.length}/{CLASS_MAGIC_SLOTS}
          </span>
        </div>
        <div className="skill-grid-with-labels">
          <div className="skill-grid-row">
            <span className="skill-row-label"></span>
            {Array.from({ length: CLASS_MAGIC_SLOTS }).map((_, idx) => {
              const skill = learnedClassSkills[idx];
              if (!skill) {
                return <div key={`class-empty-${idx}`} className="skill-cell empty" />;
              }
              return (
                <div
                  key={skill.id}
                  className="skill-cell learned"
                  onMouseEnter={(e) => handleMouseEnter(e, skill)}
                  onMouseLeave={handleMouseLeave}
                >
                  <span className="skill-cell-dot class-skill" />
                  <span className="skill-cell-name">{skill.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip && tooltip.skill && (
        <div
          className={`skill-tooltip ${tooltip.above ? 'above' : 'below'}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="skill-tooltip-name">{tooltip.name}</div>
          <div className="skill-tooltip-level">等級 {tooltip.level}</div>
          {tooltip.skill.type === 'attack' && (
            <div className="skill-tooltip-stat">威力: {tooltip.skill.power}</div>
          )}
          {tooltip.skill.type === 'heal' && tooltip.skill.healAmount && (
            <div className="skill-tooltip-stat">回復: {tooltip.skill.healAmount}</div>
          )}
          {tooltip.skill.buffEffect && (
            <div className="skill-tooltip-stat">效果: {tooltip.skill.buffEffect}</div>
          )}
          <div className="skill-tooltip-stat">MP: {tooltip.skill.mpCost}</div>
          <div className="skill-tooltip-stat">冷卻: {tooltip.skill.cooldown / 1000}s</div>
          {tooltip.skill.target === 'aoe' && (
            <div className="skill-tooltip-stat">範圍: {tooltip.skill.aoeMin}~{tooltip.skill.aoeMax} 目標</div>
          )}
          <div className={`skill-tooltip-status ${tooltip.learned ? 'learned' : 'locked'}`}>
            {tooltip.learned ? '已習得' : '未習得'}
          </div>
        </div>
      )}
    </div>
  );
}
