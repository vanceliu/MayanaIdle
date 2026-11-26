/**
 * 技能 tooltip 的數值列。`shown` 是套用星盤等級與職業池隨機技能後的技能（`models/skillStar.ts`），
 * 與 `base` 不同的數字以黃色標出（`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 */
import type { ReactNode } from 'react';
import type { Skill } from '../models/skill';
import { skillCategoryLabel, starLevelSuffix } from '../models/skillStar';
import { skillTooltipLines, type PhysicalDamageOf } from '../models/skillTooltipText';
import type { Character } from '../models/character';

export type { PhysicalDamageOf };

type SkillLike = Omit<Skill, 'lastUsedAt'>;

/** tooltip 標頭：名稱與星盤等級、分類、標籤、習得等級 */
export function SkillTooltipHeader({ name, skill, level, character, tags }: {
  name: string;
  skill: SkillLike;
  level: number;
  character: Pick<Character, 'className' | 'starChart'> | null;
  /** 技能標籤列（`SkillTagList`），排在分類下方 */
  tags?: ReactNode;
}) {
  return (
    <>
      <div className="skill-tooltip-name">{name}{character ? starLevelSuffix(skill, character) : ''}</div>
      <div className="skill-tooltip-category">{skillCategoryLabel(skill as Skill)}</div>
      {tags}
      <div className="skill-tooltip-level">等級 {level}</div>
    </>
  );
}

/** 數值列由 `skillTooltipLines()` 產生，與管理介面角色查詢共用 */
export function SkillTooltipBody({ base, shown, references = [], healOf, physicalOf }: {
  base: SkillLike;
  shown: SkillLike;
  /** 另外比對的技能（未點星盤節點時的樣子）：與其中任一個不同的數字也標黃，星盤點滿後隨等級變動的數值照樣標黃（`56-star-chart.md` § 56.5） */
  references?: readonly SkillLike[];
  /** 治癒量（`systems/combat.ts` 的 `calculateHealAmount()`），依技能攻擊力計算 */
  healOf: (power: number) => number;
  physicalOf?: PhysicalDamageOf;
}) {
  return (
    <>
      {skillTooltipLines({ base, shown, references, healOf, physicalOf }).map((line, i) => (
        <div key={i} className="skill-tooltip-stat">
          {line.label}
          {line.parts.map((p, k) => (p.changed ? <span key={k} className="stat-changed">{p.text}</span> : p.text))}
        </div>
      ))}
    </>
  );
}
