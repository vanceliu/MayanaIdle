/**
 * 星盤面板 demo（`star-panel.html`）：遊戲內入口、浮動視窗與技能說明的樣子。
 * 配點動作直接呼叫 `models/starChart.ts`，與遊戲 store 的判定相同。
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StarChartPanel } from '../src/components/StarChartPanel';
import { StarNodeSkillPreview } from '../src/components/StarNodeSkillPreview';
import { SkillTooltipBody } from '../src/components/SkillTooltipBody';
import { planStarChart, starRefundCostPerPoint, starStartNodeId } from '../src/models/starChart';
import { resolveSkill, starLevelSuffix } from '../src/models/skillStar';
import { instantiateFromTemplate } from '../src/models/skillTemplate';
import { CLASS_SKILLS } from '../src/models/classSkills';
import { PANEL_ICONS, PANEL_BUTTON_LABELS, type PanelKey } from '../src/stores/panelWindowStore';
import { CLASS_NAMES_ZH, type Character, type ClassName } from '../src/models/character';

const DOCK: PanelKey[] = ['stats', 'equipment', 'bag', 'skill'];
const DOCK_TAIL: PanelKey[] = ['quest', 'mail', 'script'];

type DemoChar = Pick<Character, 'className' | 'level' | 'starChart' | 'gold'>;

function DockButton({ icon, label, active, isNew, onClick }: { icon: string; label: string; active?: boolean; isNew?: boolean; onClick?: () => void }) {
  return (
    <button className={`panel-dock-btn${active ? ' active' : ''}${isNew ? ' is-new' : ''}`} title={label} aria-label={label} onClick={onClick}>
      <span className="panel-dock-icon" aria-hidden="true">{icon}</span>
      <span className="panel-dock-label">{label}</span>
    </button>
  );
}

/** demo 沒有裝備：物理段以基礎物理傷害 150 計（遊戲內依角色當下武器、屬性、buff 計算） */
const DEMO_BASE_PHYSICAL = 150;
const demoPhysicalOf = (scale: number) => Math.floor(DEMO_BASE_PHYSICAL * scale);

/** 技能說明：名稱加等級後綴（I 不顯示），與表列不同的數字標黃 */
function SkillTip({ id, char }: { id: string; char: DemoChar }) {
  const base = { ...instantiateFromTemplate(id)!, lastUsedAt: 0 };
  const shown = resolveSkill(base, [], char);
  return (
    <div className="skill-tooltip">
      <div className="skill-tooltip-name">{base.name}{starLevelSuffix(base, char)}</div>
      <div className="skill-tooltip-level">等級 {base.level}</div>
      <SkillTooltipBody base={base} shown={shown} healOf={p => p} physicalOf={demoPhysicalOf} />
    </div>
  );
}

function App() {
  const [char, setChar] = useState<DemoChar>({
    className: 'knight', level: 75, gold: 2_000_000,
    starChart: [starStartNodeId('knight'), 'knight-r480', 'knight-hub', 'knight-magic0-boost0', 'knight-magic0-level0', 'knight-magic2-boost0', 'knight-magic2-level0', 'knight-magic2-boost1', 'knight-magic2-level1'],
  });
  const [open, setOpen] = useState(true);
  const switchClass = (className: ClassName) =>
    setChar(c => ({ ...c, className, starChart: [starStartNodeId(className), `${className}-r480`, `${className}-hub`] }));

  // 與 store 的 `applyStarChart` 相同判定
  const apply = (nodeIds: string[]) => {
    const plan = planStarChart(char.starChart ?? [], nodeIds, char.className, char.level);
    const cost = 'error' in plan ? 0 : plan.refunded * starRefundCostPerPoint(char.level);
    if ('error' in plan || char.gold < cost) return false;
    setChar(c => ({ ...c, starChart: plan.allocated, gold: c.gold - cost }));
    return true;
  };

  return (
    <>
      <p className="demo-note">
        滑到職業技能節點（強化／等級 +1）時，tooltip 下方顯示「點下後」技能的樣子，比點之前變動的數字標黃。
        物理段的數字在 demo 以基礎物理傷害 {DEMO_BASE_PHYSICAL} 計，遊戲內依角色當下的武器、屬性、buff 計算。
        職業：{(['knight', 'elf', 'thief', 'elementalist', 'priest'] as const).map(c => (
          <button key={c} className={c === char.className ? 'btn-primary' : 'btn-secondary'} style={{ marginLeft: 6 }} onClick={() => switchClass(c)}>
            {CLASS_NAMES_ZH[c]}
          </button>
        ))}
      </p>
      <div className="demo-game">
        {open && (
          <div className="floating-window" style={{ width: 820 }}>
            <div className="floating-window-header">
              <span className="floating-window-title">星盤</span>
              <button className="floating-window-close" aria-label="關閉星盤" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="floating-window-body">
              <StarChartPanel
                character={char}
                onApply={apply}
                renderNodeDetail={(node, allocated) => <StarNodeSkillPreview node={node} classId={char.className} allocated={allocated} physicalOf={demoPhysicalOf} />}
              />
            </div>
          </div>
        )}
        <div className="panel-dock">
          {DOCK.map(k => <DockButton key={k} icon={PANEL_ICONS[k]} label={PANEL_BUTTON_LABELS[k]} />)}
          <DockButton icon="🌌" label="星盤" active={open} isNew onClick={() => setOpen(o => !o)} />
          {DOCK_TAIL.map(k => <DockButton key={k} icon={PANEL_ICONS[k]} label={PANEL_BUTTON_LABELS[k]} />)}
        </div>
      </div>

      <h2 className="demo-h">技能面板格子（右上角標等級，I 不標）</h2>
      <div className="skill-panel">
        <div className="demo-skill-cells">
          {CLASS_SKILLS.filter(d => d.className === char.className).map(d => {
            const suffix = starLevelSuffix(d.skill, char);
            return (
              <div key={d.id} className="skill-cell learned">
                <span className="skill-cell-name">{d.name}</span>
                {suffix && <span className="skill-cell-star">{suffix.slice(1, -1)}</span>}
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="demo-h">技能說明（技能面板 hover）</h2>
      <p className="demo-note">
        名稱後加目前等級（I 不顯示）；數值是套用等級與冷卻後的實際值，與表列不同的數字標黃。上方盤面的配點會即時反映在這裡。
      </p>
      <div className="demo-tips">
        {CLASS_SKILLS.filter(d => d.className === char.className).map(d => <SkillTip key={d.id} id={d.id} char={char} />)}
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
