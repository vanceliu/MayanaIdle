/**
 * 技能 tooltip 的數值列。`shown` 是套用星盤等級與職業池隨機技能後的技能（`models/skillStar.ts`），
 * 與 `base` 不同的數字以黃色標出（`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 */
import type { ReactNode } from 'react';
import type { Skill } from '../models/skill';
import { formatSkillRange, formatBuffDuration, formatDebuffDuration, formatSelfBuff } from '../models/skill';
import { ChangedNumbers } from './ChangedNumbers';
import { skillCategoryLabel, starLevelSuffix } from '../models/skillStar';
import type { Character } from '../models/character';

type SkillLike = Omit<Skill, 'lastUsedAt'>;

/** 隨機多擊的範圍已寫在效果說明裡（血濺咒殺），不另列；沒有半徑的群體技能為全隊（群體治癒、神聖領域） */
function rangeText(s: SkillLike): string {
  if (s.target !== 'aoe' || s.randomHits) return '';
  if (s.aoeRadius === undefined) return '全隊';
  const tail = s.maxTargets ? ` / 最多 ${s.maxTargets} 隻` : '（無上限）';
  return `半徑 ${s.aoeRadius} 格${tail}`;
}


function debuffText(s: SkillLike): string {
  const d = s.applyDebuff;
  return d ? `${d.name} (${d.description}, ${formatDebuffDuration(d)})` : '';
}

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

/** 物理段數值（`systems/combat.ts` 的 `previewSkillPhysicalDamage()`）；沒有角色資料時為 undefined */
export type PhysicalDamageOf = (physicalScale: number, normalAttackFormula: boolean) => number;

function powerText(s: SkillLike, physicalOf: PhysicalDamageOf | undefined): string {
  const physical = physicalOf ? String(physicalOf(s.physicalScale ?? 1, false)) : '物理傷害';
  return `${s.power}${s.physicalSnapshot ? ` + ${physical}` : ''}`;
}

function hitsText(s: SkillLike, physicalOf: PhysicalDamageOf | undefined): string {
  return `${s.hits ?? 0} 連擊${physicalOf ? `，每箭約 ${physicalOf(s.physicalScale ?? 1, true)}` : ''}`;
}

export function SkillTooltipBody({ base, shown, references = [], healOf, physicalOf }: {
  base: SkillLike;
  shown: SkillLike;
  /** 另外比對的技能（未點星盤節點時的樣子）：與其中任一個不同的數字也標黃，星盤點滿後隨等級變動的數值照樣標黃（`56-star-chart.md` § 56.5） */
  references?: readonly SkillLike[];
  /** 治癒量（`systems/combat.ts` 的 `calculateHealAmount()`），依技能攻擊力計算 */
  healOf: (power: number) => number;
  physicalOf?: PhysicalDamageOf;
}) {
  const line = (label: string, text: (s: SkillLike) => string) => {
    const value = text(shown);
    return value
      ? <div className="skill-tooltip-stat">{label}<ChangedNumbers base={text(base)} value={value} references={references.map(text)} /></div>
      : null;
  };
  return (
    <>
      {shown.type === 'attack' && line('威力: ', s => powerText(s, physicalOf))}
      {line('射程: ', formatSkillRange)}
      {shown.hits ? line('', s => hitsText(s, physicalOf)) : null}
      {line('效果: ', s => s.description ?? '')}
      {!shown.instantDotTicks && line('附加: ', debuffText)}
      {line('傷害加成: ', s => (s.abilityDamagePercent ? `+${s.abilityDamagePercent}%` : ''))}
      {line('自身增益: ', formatSelfBuff)}
      {shown.type === 'heal' && shown.power > 0 && line('回復: ', s => String(healOf(s.power)))}
      {line('效果: ', s => s.buffEffect ?? '')}
      {line('持續: ', formatBuffDuration)}
      {shown.type === 'passive' ? (
        <div className="skill-tooltip-stat">被動</div>
      ) : (
        <>
          {line('MP: ', s => String(s.mpCost))}
          {line('冷卻: ', s => `${s.cooldown / 1000}s`)}
        </>
      )}
      {line('範圍: ', rangeText)}
    </>
  );
}
