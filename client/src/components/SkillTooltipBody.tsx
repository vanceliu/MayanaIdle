/**
 * 技能 tooltip 的數值列。`shown` 是套用星盤等級與職業池隨機技能後的技能（`models/skillStar.ts`），
 * 與 `base` 不同的數字以黃色標出（`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 */
import type { Skill } from '../models/skill';
import { WEAPON_TYPE_LABELS, formatSkillRange, formatBuffDuration, formatDebuffDuration, formatSelfBuff } from '../models/skill';
import { ChangedNumbers } from './ChangedNumbers';
import { skillCategoryLabel, starLevelSuffix } from '../models/skillStar';
import type { Character } from '../models/character';

type SkillLike = Omit<Skill, 'lastUsedAt'>;

/** 隨機多擊的範圍已寫在效果說明裡（血濺咒殺），不另列 */
function rangeText(s: SkillLike): string {
  if (s.target !== 'aoe' || s.randomHits) return '';
  const tail = s.maxTargets ? ` / 最多 ${s.maxTargets} 隻` : '（無上限）';
  return `半徑 ${s.aoeRadius} 格${tail}`;
}


function debuffText(s: SkillLike): string {
  const d = s.applyDebuff;
  return d ? `${d.name} (${d.description}, ${formatDebuffDuration(d)})` : '';
}

/** tooltip 標頭：名稱與星盤等級、分類、習得等級 */
export function SkillTooltipHeader({ name, skill, level, character }: {
  name: string;
  skill: SkillLike;
  level: number;
  character: Pick<Character, 'className' | 'starChart'> | null;
}) {
  return (
    <>
      <div className="skill-tooltip-name">{name}{character ? starLevelSuffix(skill, character) : ''}</div>
      <div className="skill-tooltip-category">{skillCategoryLabel(skill as Skill)}</div>
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

export function SkillTooltipBody({ base, shown, healOf, physicalOf }: {
  base: SkillLike;
  shown: SkillLike;
  /** 治癒量（`systems/combat.ts` 的 `calculateHealAmount()`），依技能攻擊力計算 */
  healOf: (power: number) => number;
  physicalOf?: PhysicalDamageOf;
}) {
  const line = (label: string, b: string, v: string) => (v
    ? <div className="skill-tooltip-stat">{label}<ChangedNumbers base={b} value={v} /></div>
    : null);
  return (
    <>
      {shown.requiredWeaponType && (
        <div className="skill-tooltip-stat skill-tooltip-req">
          【需{WEAPON_TYPE_LABELS[shown.requiredWeaponType] ?? shown.requiredWeaponType}】
        </div>
      )}
      {shown.type === 'attack' && line('威力: ', powerText(base, physicalOf), powerText(shown, physicalOf))}
      {line('射程: ', formatSkillRange(base), formatSkillRange(shown))}
      {shown.hits ? line('', hitsText(base, physicalOf), hitsText(shown, physicalOf)) : null}
      {line('效果: ', base.description ?? '', shown.description ?? '')}
      {!shown.instantDotTicks && line('附加: ', debuffText(base), debuffText(shown))}
      {line('傷害加成: ', '', shown.abilityDamagePercent ? `+${shown.abilityDamagePercent}%` : '')}
      {line('自身增益: ', formatSelfBuff(base), formatSelfBuff(shown))}
      {shown.type === 'heal' && shown.power > 0 && line('回復: ', String(healOf(base.power)), String(healOf(shown.power)))}
      {line('效果: ', base.buffEffect ?? '', shown.buffEffect ?? '')}
      {line('持續: ', formatBuffDuration(base), formatBuffDuration(shown))}
      {shown.type === 'passive' ? (
        <div className="skill-tooltip-stat">被動</div>
      ) : (
        <>
          {line('MP: ', String(base.mpCost), String(shown.mpCost))}
          {line('冷卻: ', `${base.cooldown / 1000}s`, `${shown.cooldown / 1000}s`)}
        </>
      )}
      {line('範圍: ', rangeText(base), rangeText(shown))}
    </>
  );
}
