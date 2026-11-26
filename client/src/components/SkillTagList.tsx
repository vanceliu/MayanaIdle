/**
 * 技能標籤色塊（`05-skill.md` § 5.5「顯示」）。
 * `base` 有給時，不在 `base` 裡的標籤以黃色標出（`07-affix-ability.md` § 7S.7）。
 */
import type { Skill } from '../models/skill';
import { SKILL_TAG_LABELS, type ElementTag, type SkillTag } from '../models/skillTags';
import { skillTooltipTagRows } from '../models/skillTooltipText';

type SkillLike = Omit<Skill, 'lastUsedAt'>;

export function SkillTagList({ tags, base, label }: {
  tags: readonly SkillTag[];
  base?: readonly SkillTag[];
  /** 列首文字：持續傷害的名稱，例「流血」 */
  label?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="skill-tag-list">
      {label && <span className="skill-tag-label">{label}</span>}
      {tags.map(tag => (
        <span key={tag} className={`skill-tag skill-tag-${tag}${base && !base.includes(tag) ? ' changed' : ''}`}>
          {SKILL_TAG_LABELS[tag]}
        </span>
      ))}
    </div>
  );
}

/** 技能 tooltip 的標籤（`skillTooltipTagRows()`，與管理介面角色查詢共用）；`shown` 是套用職業池隨機技能後的技能 */
export function SkillTooltipTags({ base, shown, basicAttackElement }: {
  base: SkillLike;
  shown: SkillLike;
  /** 【普攻】的攻擊元素，依目前裝備與 buff 決定 */
  basicAttackElement?: ElementTag;
}) {
  return (
    <>
      {skillTooltipTagRows(base, shown, basicAttackElement).map((row, i) => (
        <div key={i} className="skill-tag-list">
          {row.label && <span className="skill-tag-label">{row.label}</span>}
          {row.tags.map(t => (
            <span key={t.tag} className={`skill-tag skill-tag-${t.tag}${t.changed ? ' changed' : ''}`}>{t.label}</span>
          ))}
        </div>
      ))}
    </>
  );
}

const TAG_BY_LABEL = new Map(Object.entries(SKILL_TAG_LABELS).map(([tag, label]) => [label, tag as SkillTag]));

/** 描述文字裡的【標籤】畫成色塊；括號內不是標籤名稱的照原文 */
export function SkillTagText({ text }: { text: string }) {
  if (!text.includes('【')) return <>{text}</>;
  return (
    <>
      {text.split(/(【[^】]+】)/).map((part, i) => {
        const tag = TAG_BY_LABEL.get(part.slice(1, -1));
        return tag && part.startsWith('【')
          ? <span key={i} className={`skill-tag inline skill-tag-${tag}`}>{SKILL_TAG_LABELS[tag]}</span>
          : part;
      })}
    </>
  );
}
