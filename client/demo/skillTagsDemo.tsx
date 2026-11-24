/**
 * 技能標籤（`skill-tags.html`）：技能 tooltip 的標籤列與詞綴描述的標籤寫法。
 * 標籤由 `models/skillTags.ts` 推得，色塊由 `components/SkillTagList.tsx` 畫；這裡只切換武器元素。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CLASS_NAMES_ZH, type ClassName } from '../src/models/character';
import { instantiateFromTemplate } from '../src/models/skillTemplate';
import { SKILL_CATALOG, type Skill } from '../src/models/skill';
import { applyAbilityToSkill } from '../src/models/abilitySkill';
import { getAbilityDefinition, type Ability, type AbilityType } from '../src/models/ability';
import { AFFIX_DEFINITIONS } from '../src/models/affix';
import { ABILITY_DEFINITIONS } from '../src/models/ability';
import { ELEMENT_LABELS } from '../src/models/monster';
import type { ElementTag } from '../src/models/skillTags';
import { SkillTagText, SkillTooltipTags } from '../src/components/SkillTagList';
import { SkillTooltipBody, SkillTooltipHeader } from '../src/components/SkillTooltipBody';

interface Options {
  brand: ElementTag | '';
  fireArrow: boolean;
}

const CLASS_SKILLS: Record<ClassName, string[]> = {
  knight: ['shield-bash', 'rend', 'taunt', 'charge', 'blood-curse', 'vengeance', 'iron-shield'],
  elf: ['triple-shot', 'binding-arrow', 'leap-shot', 'arrow-rain', 'fire-arrow'],
  elementalist: ['mana-drain', 'element-storm', 'element-boost'],
  priest: ['holy-smite', 'holy-judgment', 'group-heal'],
  thief: ['deadly-strike', 'backstab', 'poison-mist', 'dodge-counter', 'envenom'],
};
const REWRITES: { id: string; ability: AbilityType; cls: ClassName }[] = [
  { id: 'blood-curse', ability: 'blood_slash', cls: 'knight' },
  { id: 'arrow-rain', ability: 'arrow_rain_boost', cls: 'elf' },
  { id: 'poison-mist', ability: 'poison_mist_boost', cls: 'thief' },
];
const BASIC_NAMES = ['風刃', '火球', '究極光裂術', '詛咒'];

/** 同 `getBasicAttackElement()`：刻印 → 火矢附魔 */
const basicElement = (o: Options): ElementTag | undefined => o.brand || (o.fireArrow ? 'fire' : undefined);

function TagTooltip({ base, shown, o, note }: { base: Skill; shown: Skill; o: Options; note?: string }) {
  return (
    <div className="skill-tooltip demo-skill-tooltip">
      {note && <div className="demo-tooltip-note">{note}</div>}
      <SkillTooltipHeader
        name={shown.name} skill={shown} level={shown.level} character={null}
        tags={<SkillTooltipTags base={base} shown={shown} basicAttackElement={basicElement(o)} />}
      />
      <SkillTooltipBody base={base} shown={shown} healOf={power => power * 2} />
      <div className="skill-tooltip-status learned">已習得</div>
    </div>
  );
}

const classSkill = (id: string) => instantiateFromTemplate(id)!;
const basicSkill = (name: string) => ({ ...SKILL_CATALOG.find(s => s.name === name)!, lastUsedAt: 0 }) as Skill;

const AFFIX_ROWS = [
  ABILITY_DEFINITIONS.find(d => d.type === 'skill_splash')!,
  ...(['attack_splash', 'skill_elemental', 'attack_lifesteal', 'skill_lifesteal'] as const).map(type => AFFIX_DEFINITIONS.find(d => d.type === type)!),
];

function Demo() {
  const [o, setO] = useState<Options>({ brand: '', fireArrow: false });
  return (
    <>
      <div className="demo-bar">
        <label>武器元素刻印
          <select value={o.brand} onChange={e => setO({ ...o, brand: e.target.value as ElementTag | '' })}>
            <option value="">無</option>
            {(['fire', 'ice', 'wind', 'earth', 'light', 'dark'] as const).map(el => <option key={el} value={el}>{ELEMENT_LABELS[el]}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={o.fireArrow} onChange={e => setO({ ...o, fireArrow: e.target.checked })} /> 火矢附魔中</label>
      </div>

      <h2 className="demo-section">隨機技能改寫（黃色＝改寫後新增的標籤）</h2>
      <div className="demo-grid">
        {REWRITES.map(r => {
          const base = classSkill(r.id);
          const ability = { type: r.ability, params: {} } as Ability;
          const shown = applyAbilityToSkill(base, [{ ability }], r.cls);
          return [
            <TagTooltip key={`${r.id}-base`} base={base} shown={base} o={o} note="原版" />,
            <TagTooltip key={`${r.id}-shown`} base={base} shown={shown} o={o} note={`帶 ${getAbilityDefinition(r.ability)!.name}`} />,
          ];
        })}
      </div>

      {(Object.keys(CLASS_SKILLS) as ClassName[]).map(cls => (
        <section key={cls}>
          <h2 className="demo-section">{CLASS_NAMES_ZH[cls]}</h2>
          <div className="demo-grid">
            {CLASS_SKILLS[cls].map(id => {
              const s = classSkill(id);
              return <TagTooltip key={id} base={s} shown={s} o={o} />;
            })}
          </div>
        </section>
      ))}

      <h2 className="demo-section">基礎魔法</h2>
      <div className="demo-grid">
        {BASIC_NAMES.map(name => {
          const s = basicSkill(name);
          return <TagTooltip key={name} base={s} shown={s} o={o} />;
        })}
      </div>

      <h2 className="demo-section">詞綴描述</h2>
      <table className="demo-affix-table">
        <tbody>
          {AFFIX_ROWS.map(d => (
            <tr key={d.type}><td>{d.name}</td><td><SkillTagText text={d.description} /></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
