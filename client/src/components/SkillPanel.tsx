import { useRef, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useDragStore, type DragItem, type DropTarget } from '../stores/dragStore';
import { useLongPress } from '../hooks/useLongPress';
import {
  QUICK_SLOT_COUNT, quickSlotLabel, toQuickSlotSkillEntry, isSameQuickSlotEntry,
} from '../models/quickSlot';
import { getSkillDisplayIcon } from '../models/iconMap';
import { GameIcon } from './GameIcon';
import { SKILL_CATALOG, WEAPON_TYPE_LABELS, type Skill, formatSkillRange, formatBuffDuration } from '../models/skill';
import { CLASS_SKILLS } from '../models/classSkills';
import { CLASS_MAGIC_RESTRICTIONS } from '../models/skillRestrictions';
import type { ClassName } from '../models/character';

const GRID_COLUMNS = 5;
const CLASS_MAGIC_SLOTS = GRID_COLUMNS;

/** 技能格顯示用的模板（未習得的格子沒有 `lastUsedAt`） */
type SkillTemplate = Omit<Skill, 'lastUsedAt'>;

/** 讓 CSS grid 的欄數跟著 TSX 的常數走，避免兩處不同步 */
function gridColumnsStyle(columns: number) {
  return { '--skill-cols': columns } as React.CSSProperties;
}

/** 職業魔法一律以 `CLASS_SKILLS` 為單一來源，依職業等級（1~5）對位到格子（§ 23.1） */
function classSkillByLevel(className: ClassName, classLevel: number) {
  return CLASS_SKILLS.find(d => d.className === className && d.classLevel === classLevel);
}

const ELEMENT_COLORS: Record<string, string> = {
  fire: '#EF4444',
  ice: '#60A5FA',
  wind: '#34D399',
  earth: '#D97706',
  light: '#FBBF24',
  dark: '#A78BFA',
  none: '#94A3B8',
};

interface SkillTooltipData {
  skill: SkillTemplate | null;
  name: string;
  level: number;
  learned: boolean;
  x: number;
  y: number;
  above: boolean;
}

/** 拖曳從點擊轉成拖曳的容忍距離（px），與背包同一個數字 */
const CLICK_SLOP = 6;

/** 技能格圖示邊長。格子 `min-height` 42px 還要塞技能名，再大就會擠掉文字 */
const SKILL_ICON_SIZE = 20;

export function SkillPanel() {
  const [tooltip, setTooltip] = useState<SkillTooltipData | null>(null);
  const skills = useGameStore(s => s.skills);
  const character = useGameStore(s => s.character);
  const quickSlots = useGameStore(s => s.quickSlots);
  const assignQuickSlot = useGameStore(s => s.assignQuickSlot);
  const [contextMenu, setContextMenu] = useState<{ skillId: string; x: number; y: number } | null>(null);
  const pressRef = useRef<{ skillId: string; name: string; x: number; y: number } | null>(null);

  /**
   * 長按＝右鍵（`47-mobile.md`）。手機沒有右鍵，不接這條路徑等於「技能設快捷鍵」
   * 在手機上完全做不到。hook 只能在頂層呼叫，所以「按住的是哪一格」從 ref 讀。
   */
  const longPress = useLongPress(point => {
    const press = pressRef.current;
    if (!press) return;
    setTooltip(null);
    setContextMenu({ skillId: press.skillId, x: point.clientX, y: point.clientY });
  });

  const learnedSkillIds = new Set(skills.map(s => s.id));

  function applyDrop(target: DropTarget | null, item: DragItem) {
    if (!target || target.kind !== 'quick-slot') return;
    if (item.payload.kind !== 'skill') return;
    const entry = toQuickSlotSkillEntry(item.payload.skillId, learnedSkillIds);
    if (entry) assignQuickSlot(target.index, entry);
  }

  /**
   * 已習得的技能格是快捷格的拖曳來源（§ 35.7.3）。
   *
   * 與背包共用 `dragStore` 的同一份契約：落點靠 `data-drop-kind` 命中，
   * 因此這裡不需要知道快捷格長什麼樣子。未習得的格子拿不到這組 handler，
   * 拖不動也開不了選單。
   */
  function skillCellHandlers(skillId: string, name: string) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        longPress.onPointerDown(e);
        pressRef.current = { skillId, name, x: e.clientX, y: e.clientY };
      },
      onPointerMove: (e: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press) return;
        longPress.onPointerMove(e);
        if (useDragStore.getState().item) {
          useDragStore.getState().move(e.clientX, e.clientY);
          return;
        }
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) <= CLICK_SLOP) return;
        setTooltip(null);
        /*
         * **必須 setPointerCapture**：指標一離開這一格，後續的 move 與 up 就會派給
         * 別的元素，拖曳會在半路斷掉且永遠收不到落點（與 BagPanel 同一個坑）。
         */
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        useDragStore.getState().begin(
          // 技能沒有背包格，`fromIndex` 一律 -1
          { fromIndex: -1, payload: { kind: 'skill', skillId: press.skillId, name: press.name }, label: press.name },
          e.clientX,
          e.clientY,
        );
      },
      onPointerUp: (e: React.PointerEvent) => {
        pressRef.current = null;
        longPress.onPointerUp(e);
        const dragging = useDragStore.getState().item;
        if (!dragging) return;
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
        useDragStore.getState().move(e.clientX, e.clientY);
        applyDrop(useDragStore.getState().drop(), dragging);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        pressRef.current = null;
        longPress.onPointerCancel(e);
        useDragStore.getState().cancel();
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        setTooltip(null);
        setContextMenu({ skillId, x: e.clientX, y: e.clientY });
      },
    };
  }

  if (!character) return null;

  const className = character.className;
  // 基礎魔法的可學上限依職業而異（§ 5.3）：騎士只到 1 級、盜賊 4 級、妖精 6 級，
  // 學不到的級數不畫出來 —— 畫了也永遠是暗的，只會誤導玩家。
  const restriction = CLASS_MAGIC_RESTRICTIONS[className];
  const basicMagicRows = restriction.maxLevel;
  const basicMagicSlots = restriction.maxSkills;

  const learnedBasicSkills = skills.filter(s => SKILL_CATALOG.some(c => c.id === s.id));
  const learnedClassSkills = skills.filter(
    s => CLASS_SKILLS.some(d => d.className === className && d.id === s.id),
  );

  /** 已習得與未習得的格子共用同一個 tooltip，差別只在 `learned` 與顯示的等級 */
  function handleMouseEnter(e: React.MouseEvent, skill: SkillTemplate, learned: boolean) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const tooltipHeight = 150;
    const above = rect.top > tooltipHeight + 8;
    const y = above ? rect.top - 8 : rect.bottom + 8;
    let x = rect.left;
    if (x + 160 > window.innerWidth) {
      x = rect.right - 160;
    }
    setTooltip({
      skill,
      name: skill.name,
      level: skill.level,
      learned,
      x,
      y,
      above,
    });
  }

  function handleMouseLeave() {
    setTooltip(null);
  }

  return (
    <div className="skill-panel">
      <div className="skill-section">
        <div className="skill-section-header">
          <span className="skill-section-title">基礎魔法</span>
          <span className="skill-section-meta">
            {learnedBasicSkills.length}/{basicMagicSlots}
          </span>
        </div>
        <div className="skill-grid-with-labels" style={gridColumnsStyle(GRID_COLUMNS)}>
          {Array.from({ length: basicMagicRows }).map((_, rowIdx) => {
            const level = rowIdx + 1;
            const catalogForLevel = SKILL_CATALOG.filter(c => c.level === level);
            return (
              <div key={`row-${rowIdx}`} className="skill-grid-row">
                <span className="skill-row-label">Lv{level}</span>
                {Array.from({ length: GRID_COLUMNS }).map((_, colIdx) => {
                  const catalogEntry = catalogForLevel[colIdx];
                  if (!catalogEntry) {
                    return <div key={`basic-empty-${rowIdx}-${colIdx}`} className="skill-cell empty" />;
                  }
                  // 格子一律全開：未習得顯示為暗色（locked），習得後才亮起（learned）
                  const learnedSkill = skills.find(s => s.id === catalogEntry.id);
                  const skill = learnedSkill ?? catalogEntry;
                  const element = catalogEntry.element || 'none';
                  return (
                    <div
                      key={catalogEntry.id}
                      className={`skill-cell ${learnedSkill ? 'learned' : 'locked'}`}
                      onMouseEnter={(e) => handleMouseEnter(e, skill, Boolean(learnedSkill))}
                      onMouseLeave={handleMouseLeave}
                      {...(learnedSkill ? skillCellHandlers(catalogEntry.id, skill.name) : {})}
                    >
                      <GameIcon
                        name={getSkillDisplayIcon(skill)}
                        size={SKILL_ICON_SIZE}
                        color={ELEMENT_COLORS[element]}
                      />
                      <span className="skill-cell-name">{skill.name}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="skill-section">
        <div className="skill-section-header">
          <span className="skill-section-title">職業魔法</span>
          <span className="skill-section-meta">
            {learnedClassSkills.length}/{CLASS_MAGIC_SLOTS}
          </span>
        </div>
        <div className="skill-grid-with-labels" style={gridColumnsStyle(CLASS_MAGIC_SLOTS)}>
          <div className="skill-grid-row">
            <span className="skill-row-label"></span>
            {Array.from({ length: CLASS_MAGIC_SLOTS }).map((_, idx) => {
              // 第 N 格固定對應職業魔法第 N 級，不隨已習得數量位移
              const def = classSkillByLevel(className, idx + 1);
              if (!def) {
                return <div key={`class-empty-${idx}`} className="skill-cell empty" />;
              }
              const learnedSkill = skills.find(s => s.id === def.id);
              const skill = learnedSkill ?? def.skill;
              return (
                <div
                  key={def.id}
                  className={`skill-cell ${learnedSkill ? 'learned' : 'locked'}`}
                  onMouseEnter={(e) => handleMouseEnter(e, skill, Boolean(learnedSkill))}
                  onMouseLeave={handleMouseLeave}
                  {...(learnedSkill ? skillCellHandlers(def.id, skill.name) : {})}
                >
                  <GameIcon
                    name={getSkillDisplayIcon(skill)}
                    size={SKILL_ICON_SIZE}
                    /* 職業魔法多半 element 為 none，統一走職業魔法的紫色 */
                    color={ELEMENT_COLORS[skill.element || 'none']}
                  />
                  <span className="skill-cell-name">{def.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip && tooltip.skill && (
        <div
          className={`skill-tooltip ${tooltip.above ? 'above' : 'below'}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="skill-tooltip-name">{tooltip.name}</div>
          <div className="skill-tooltip-level">等級 {tooltip.level}</div>
          {tooltip.skill.requiredWeaponType && (
            <div className="skill-tooltip-stat skill-tooltip-req">
              【需{WEAPON_TYPE_LABELS[tooltip.skill.requiredWeaponType] ?? tooltip.skill.requiredWeaponType}】
            </div>
          )}
          {tooltip.skill.type === 'attack' && (
            <div className="skill-tooltip-stat">
              威力: {tooltip.skill.power}{tooltip.skill.physicalSnapshot && ' + 物理傷害'}
            </div>
          )}
          {formatSkillRange(tooltip.skill) && (
            <div className="skill-tooltip-stat">射程: {formatSkillRange(tooltip.skill)}</div>
          )}
          {tooltip.skill.hits && (
            <div className="skill-tooltip-stat">{tooltip.skill.hits} 連擊（每擊獨立判定）</div>
          )}
          {tooltip.skill.description && (
            <div className="skill-tooltip-stat">效果: {tooltip.skill.description}</div>
          )}
          {tooltip.skill.applyDebuff && (
            <div className="skill-tooltip-stat">附加: {tooltip.skill.applyDebuff.name} ({tooltip.skill.applyDebuff.description}, {(tooltip.skill.applyDebuff.dotDuration ?? tooltip.skill.applyDebuff.duration ?? 0) / 1000}s)</div>
          )}
          {tooltip.skill.type === 'heal' && tooltip.skill.healAmount && (
            <div className="skill-tooltip-stat">回復: {tooltip.skill.healAmount}</div>
          )}
          {tooltip.skill.buffEffect && (
            <div className="skill-tooltip-stat">效果: {tooltip.skill.buffEffect}</div>
          )}
          {formatBuffDuration(tooltip.skill) && (
            <div className="skill-tooltip-stat">持續: {formatBuffDuration(tooltip.skill)}</div>
          )}
          <div className="skill-tooltip-stat">MP: {tooltip.skill.mpCost}</div>
          <div className="skill-tooltip-stat">冷卻: {tooltip.skill.cooldown / 1000}s</div>
          {tooltip.skill.target === 'aoe' && (
            <div className="skill-tooltip-stat">範圍: 半徑 {tooltip.skill.aoeRadius} 格{tooltip.skill.maxTargets ? ` / 最多 ${tooltip.skill.maxTargets} 隻` : '（無上限）'}</div>
          )}
          <div className={`skill-tooltip-status ${tooltip.learned ? 'learned' : 'locked'}`}>
            {tooltip.learned ? '已習得' : '未習得'}
          </div>
        </div>
      )}

      {/* § 35.7.3：右鍵／長按綁快捷鍵。版型與背包的選單共用同一組 class */}
      {contextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setContextMenu(null)} />
          <div className="bag-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <div className="context-menu-title">設為快捷鍵</div>
            {Array.from({ length: QUICK_SLOT_COUNT }, (_, idx) => idx).map(idx => (
              <button
                key={idx}
                className="context-menu-item"
                onClick={() => {
                  const entry = toQuickSlotSkillEntry(contextMenu.skillId, learnedSkillIds);
                  if (entry) assignQuickSlot(idx, entry);
                  setContextMenu(null);
                }}
              >
                快捷鍵 {quickSlotLabel(idx)}
                {isSameQuickSlotEntry(quickSlots[idx], { kind: 'skill', skillId: contextMenu.skillId }) && (
                  <span className="context-menu-active">●</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
