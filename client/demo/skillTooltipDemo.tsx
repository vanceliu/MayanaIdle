/**
 * 技能 tooltip 分類 demo（`skill-tooltip.html`）：各分類、各星盤等級的 tooltip。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SkillTooltipBody, SkillTooltipHeader } from '../src/components/SkillTooltipBody';
import { getSkillTemplate } from '../src/models/skillTemplate';
import { resolveSkill } from '../src/models/skillStar';
import { CLASS_SKILLS } from '../src/models/classSkills';
import type { Skill } from '../src/models/skill';
import type { ClassName } from '../src/models/character';

/** 基礎魔法三系節點：攻擊 60°、回復 180°、護盾增益 300°；level 1～3 */
const magicNodes = (angle: 60 | 180 | 300, level: number) => [`magic-${angle}-1`, `magic-${angle}-2`].slice(0, level - 1);

const CASES: { id: string; className: ClassName; nodes: string[]; caption: string }[] = [
  { id: 'holy-shield', className: 'priest', nodes: [], caption: '職業技能 I' },
  { id: 'fireball', className: 'priest', nodes: magicNodes(60, 1), caption: '基礎攻擊魔法 I' },
  { id: 'heal', className: 'priest', nodes: magicNodes(180, 2), caption: '基礎回復魔法 II' },
  { id: 'magic-armor', className: 'priest', nodes: magicNodes(300, 1), caption: '基礎護盾增益魔法 I（護盾）' },
  { id: 'haste', className: 'priest', nodes: magicNodes(300, 2), caption: '基礎護盾增益魔法 II（增益）' },
  { id: 'sanctuary', className: 'priest', nodes: magicNodes(300, 3), caption: '基礎護盾增益魔法 III（增益）' },
  { id: 'holy-light', className: 'priest', nodes: [], caption: '不屬任何一系' },
];

function template(id: string): Omit<Skill, 'lastUsedAt'> {
  return getSkillTemplate(id) ?? CLASS_SKILLS.find(c => c.id === id)!.skill;
}

function Demo() {
  return (
    <div className="demo-grid">
      {CASES.map(c => {
        const base = template(c.id);
        const owner = { className: c.className, starChart: [`${c.className}-start`, ...c.nodes] };
        const shown = resolveSkill({ ...base, lastUsedAt: 0 }, [], owner);
        return (
          <div key={c.id}>
            <div className="demo-caption">{c.caption}</div>
            <div className="skill-tooltip">
              <SkillTooltipHeader name={base.name} skill={base} level={base.level} character={owner} />
              <SkillTooltipBody base={base} shown={shown} healOf={p => p} />
              <div className="skill-tooltip-status learned">已習得</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
