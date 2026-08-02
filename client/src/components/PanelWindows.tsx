import { FloatingWindow } from './FloatingWindow';
import { CharacterStats } from './CharacterStats';
import { EquipmentPanel } from './EquipmentPanel';
import { BagPanel } from './BagPanel';
import { SkillPanel } from './SkillPanel';
import { QuestTrackerContent } from './QuestTracker';
import {
  usePanelWindowStore,
  PANEL_TITLES,
  PANEL_WIDTHS,
} from '../stores/panelWindowStore';

/**
 * 四個面板的浮動視窗容器（16-tech-frontend-architecture.md § 32.15）
 * 內容直接沿用原本的面板組件，行為（拖放 / 右鍵選單 / tooltip）不變。
 */
export function PanelWindows() {
  const open = usePanelWindowStore(s => s.open);

  return (
    <>
      {open.stats && (
        <FloatingWindow panelKey="stats" title={PANEL_TITLES.stats} width={PANEL_WIDTHS.stats}>
          <CharacterStats />
        </FloatingWindow>
      )}
      {open.equipment && (
        <FloatingWindow panelKey="equipment" title={PANEL_TITLES.equipment} width={PANEL_WIDTHS.equipment}>
          <EquipmentPanel />
        </FloatingWindow>
      )}
      {open.bag && (
        <FloatingWindow panelKey="bag" title={PANEL_TITLES.bag} width={PANEL_WIDTHS.bag}>
          <BagPanel />
        </FloatingWindow>
      )}
      {open.skill && (
        <FloatingWindow panelKey="skill" title={PANEL_TITLES.skill} width={PANEL_WIDTHS.skill}>
          <SkillPanel />
        </FloatingWindow>
      )}
      {open.quest && (
        <FloatingWindow
          panelKey="quest"
          title={PANEL_TITLES.quest}
          width={PANEL_WIDTHS.quest}
          className="is-translucent"
        >
          <QuestTrackerContent />
        </FloatingWindow>
      )}
    </>
  );
}
