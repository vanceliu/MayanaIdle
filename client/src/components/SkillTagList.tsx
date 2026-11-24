/**
 * 技能標籤色塊（`05-skill.md` § 5.5「顯示」）。
 * `base` 有給時，不在 `base` 裡的標籤以黃色標出（`07-affix-ability.md` § 7S.7）。
 */
import type { Skill } from '../models/skill';
import { dotTags, skillTags, withBasicAttackElement, SKILL_TAG_LABELS, type ElementTag, type SkillTag } from '../models/skillTags';

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

/** 技能 tooltip 的標籤：技能本身一列、每個持續傷害各一列；`shown` 是套用職業池隨機技能後的技能 */
export function SkillTooltipTags({ base, shown, basicAttackElement }: {
  base: SkillLike;
  shown: SkillLike;
  /** 【普攻】的攻擊元素，依目前裝備與 buff 決定 */
  basicAttackElement?: ElementTag;
}) {
  const tagsOf = (s: SkillLike) => withBasicAttackElement(skillTags(s), basicAttackElement);
  const tags = tagsOf(shown);
  const baseTags = tagsOf(base);
  const changed = baseTags.length !== tags.length || baseTags.some(t => !tags.includes(t));
  return (
    <>
      <SkillTagList tags={tags} base={changed ? baseTags : undefined} />
      {[shown.applyDebuff, shown.onHitDebuff].map(d => d && (
        <SkillTagList key={d.name} label={d.name} tags={dotTags(shown, d)} />
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
