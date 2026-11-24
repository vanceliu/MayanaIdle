/**
 * 星盤技能節點的技能預覽（`56-star-chart.md` § 56.5）：點下這個節點後技能的樣子；比點之前變動、或隨這條技能線變動的數字標黃。
 * 技能線依序為 強化 → 等級 → 強化 → 等級；預覽只換掉這條線的節點，其餘配點（命星等）照目前草稿。
 */
import type { ClassName } from '../models/character';
import type { StarNode } from '../models/starChart';
import { instantiateFromTemplate } from '../models/skillTemplate';
import { resolveSkill } from '../models/skillStar';
import { SkillTooltipBody, SkillTooltipHeader, type PhysicalDamageOf } from './SkillTooltipBody';
import { SkillTooltipTags } from './SkillTagList';

const LINE_KINDS = ['boost0', 'level0', 'boost1', 'level1'] as const;
const LINE_NODE = /^(.+-magic\d+)-(boost0|level0|boost1|level1)$/;

export function StarNodeSkillPreview({ node, classId, allocated, healOf = p => p, physicalOf }: {
  node: StarNode;
  classId: ClassName;
  allocated: ReadonlySet<string>;
  healOf?: (power: number) => number;
  physicalOf?: PhysicalDamageOf;
}) {
  const skillId = node.effects[0]?.key.match(/^skill:(.+):(?:cd|level)$/)?.[1];
  const line = node.id.match(LINE_NODE);
  if (!skillId || !line || node.classId !== classId) return null;
  const template = instantiateFromTemplate(skillId);
  if (!template) return null;
  const lineIds = LINE_KINDS.map(k => `${line[1]}-${k}`);
  const others = [...allocated].filter(id => !lineIds.includes(id));
  const k = LINE_KINDS.indexOf(line[2] as typeof LINE_KINDS[number]);
  const at = (n: number) => {
    const owner = { className: classId, starChart: [...others, ...lineIds.slice(0, n)] };
    return { owner, skill: resolveSkill({ ...template, lastUsedAt: 0 }, [], owner) };
  };
  const before = at(k);
  const after = at(k + 1);
  return (
    <div className="star-skill-preview">
      <div className="star-skill-preview-title">點下後</div>
      <SkillTooltipHeader
        name={template.name} skill={after.skill} level={template.level} character={after.owner}
        tags={<SkillTooltipTags base={before.skill} shown={after.skill} />}
      />
      <SkillTooltipBody
        base={before.skill} shown={after.skill} references={[at(0).skill, at(LINE_KINDS.length).skill]}
        healOf={healOf} physicalOf={physicalOf}
      />
    </div>
  );
}
