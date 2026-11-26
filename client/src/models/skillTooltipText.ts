/**
 * 技能 tooltip 的文字（`05-skill.md` § 5.5、`07-affix-ability.md` § 7S.7、`56-star-chart.md` § 56.5）。
 * 遊戲的技能面板與管理介面角色查詢共用；與 `base`、`references` 不同的數字標為 `changed`。
 */
import type { Skill } from './skill';
import { formatSkillRange, formatBuffDuration, formatDebuffDuration, formatSelfBuff } from './skill';
import { dotTags, skillTags, withBasicAttackElement, SKILL_TAG_LABELS, type ElementTag, type SkillTag } from './skillTags';

type SkillLike = Omit<Skill, 'lastUsedAt'>;

export interface TextPart {
  text: string;
  changed?: boolean;
}

const NUMBER = /(\d+(?:\.\d+)?)/;

function changedAgainst(reference: string, parts: string[]): (part: string, i: number) => boolean {
  const a = reference.split(NUMBER);
  const sameShape = a.length === parts.length && a.every((part, i) => i % 2 === 1 || part === parts[i]);
  const numbers = new Set(a.filter((_, i) => i % 2 === 1));
  return (part, i) => (sameShape ? part !== a[i] : !numbers.has(part));
}

/**
 * `value` 切成數字與非數字段，與 `base`、`references` 任一段不同的數字標 `changed`：
 * 結構相同逐位比對；結構不同時該段裡沒有的數值才標。
 */
export function changedNumberParts(base: string, value: string, references: readonly string[] = []): TextPart[] {
  const differing = [base, ...references].filter(r => r !== value);
  if (differing.length === 0) return [{ text: value }];
  const parts = value.split(NUMBER);
  const checks = differing.map(r => changedAgainst(r, parts));
  return parts
    .map((text, i) => (i % 2 === 1 && checks.some(changed => changed(text, i)) ? { text, changed: true } : { text }))
    .filter(p => p.text !== '');
}

/** 物理段數值（`systems/combat.ts` 的 `previewSkillPhysicalDamage()`）；沒有角色資料時為 undefined */
export type PhysicalDamageOf = (physicalScale: number, normalAttackFormula: boolean) => number;

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

function powerText(s: SkillLike, physicalOf: PhysicalDamageOf | undefined): string {
  const physical = physicalOf ? String(physicalOf(s.physicalScale ?? 1, false)) : '物理傷害';
  return `${s.power}${s.physicalSnapshot ? ` + ${physical}` : ''}`;
}

function hitsText(s: SkillLike, physicalOf: PhysicalDamageOf | undefined): string {
  return `${s.hits ?? 0} 連擊${physicalOf ? `，每箭約 ${physicalOf(s.physicalScale ?? 1, true)}` : ''}`;
}

export interface SkillTooltipLine {
  label: string;
  parts: TextPart[];
}

/**
 * tooltip 的數值列，順序同遊戲。`shown` 是套用星盤等級與職業池隨機技能後的技能；
 * `references` 是另外比對的技能（未點星盤節點時的樣子）。
 */
export function skillTooltipLines({ base, shown, references = [], healOf, physicalOf }: {
  base: SkillLike;
  shown: SkillLike;
  references?: readonly SkillLike[];
  /** 治癒量（`systems/combat.ts` 的 `calculateHealAmount()`），依技能攻擊力計算 */
  healOf: (power: number) => number;
  physicalOf?: PhysicalDamageOf;
}): SkillTooltipLine[] {
  const lines: SkillTooltipLine[] = [];
  const line = (label: string, text: (s: SkillLike) => string) => {
    const value = text(shown);
    if (value) lines.push({ label, parts: changedNumberParts(text(base), value, references.map(text)) });
  };
  if (shown.type === 'attack') line('威力: ', s => powerText(s, physicalOf));
  line('射程: ', formatSkillRange);
  if (shown.hits) line('', s => hitsText(s, physicalOf));
  line('效果: ', s => s.description ?? '');
  if (!shown.instantDotTicks) line('附加: ', debuffText);
  line('傷害加成: ', s => (s.abilityDamagePercent ? `+${s.abilityDamagePercent}%` : ''));
  line('自身增益: ', formatSelfBuff);
  if (shown.type === 'heal' && shown.power > 0) line('回復: ', s => String(healOf(s.power)));
  line('效果: ', s => s.buffEffect ?? '');
  line('持續: ', formatBuffDuration);
  if (shown.type === 'passive') {
    lines.push({ label: '', parts: [{ text: '被動' }] });
  } else {
    line('MP: ', s => String(s.mpCost));
    line('冷卻: ', s => `${s.cooldown / 1000}s`);
  }
  line('範圍: ', rangeText);
  return lines;
}

export interface SkillTagRow {
  /** 列首文字：持續傷害的名稱，例「流血」 */
  label?: string;
  tags: { tag: SkillTag; label: string; changed: boolean }[];
}

/** tooltip 的標籤：技能本身一列、每個持續傷害各一列；技能本身那列不在 `base` 裡的標籤標 `changed` */
export function skillTooltipTagRows(base: SkillLike, shown: SkillLike, basicAttackElement?: ElementTag): SkillTagRow[] {
  const tagsOf = (s: SkillLike) => withBasicAttackElement(skillTags(s), basicAttackElement);
  const tags = tagsOf(shown);
  const baseTags = tagsOf(base);
  const changed = baseTags.length !== tags.length || baseTags.some(t => !tags.includes(t));
  const row = (list: readonly SkillTag[], label?: string, compare?: readonly SkillTag[]): SkillTagRow => ({
    ...(label ? { label } : {}),
    tags: list.map(tag => ({ tag, label: SKILL_TAG_LABELS[tag], changed: !!compare && !compare.includes(tag) })),
  });
  return [
    row(tags, undefined, changed ? baseTags : undefined),
    ...[shown.applyDebuff, shown.onHitDebuff]
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map(d => row(dotTags(shown, d), d.name)),
  ].filter(r => r.tags.length > 0);
}
