import { useState } from 'react';
import {
  useGameStore,
  selectActiveTemplate,
  selectCombatRules,
  selectPersistentRules,
  selectVillageRules,
} from '../stores/gameStore';
import { usePanelWindowStore, panelButtonA11y } from '../stores/panelWindowStore';
import { useIsMobile } from '../hooks/useViewport';
import { PanelDockFace } from './PanelDockFace';
import { CombatScriptEditor } from './CombatScriptEditor';
import { PersistentScriptEditor } from './PersistentScriptEditor';
import { VillageScriptEditor } from './VillageScriptEditor';
import { isDeletableTemplate } from '../models/scriptTemplate';

type ScriptTab = 'combat' | 'persistent' | 'village';

/**
 * 自動腳本（16-tech-frontend-architecture.md § 32.16）
 *
 * 按鈕位於底部 `PanelDock` 最右側，與其他面板按鈕並列（額外帶指示點）；
 * 點擊後開啟可拖曳浮動視窗，與詳細狀態／裝備欄／背包／技能／任務共用同一套機制
 * （可拖曳、可多開、點擊置頂、無遮罩）。
 */
export function ScriptEditorButton() {
  const combatRules = useGameStore(selectCombatRules);
  const persistentRules = useGameStore(selectPersistentRules);
  const villageRules = useGameStore(selectVillageRules);
  const isOpen = usePanelWindowStore(s => s.open.script);
  const toggle = usePanelWindowStore(s => s.toggle);
  const isMobile = useIsMobile();

  const hasRules = combatRules.length > 0 || persistentRules.length > 0 || villageRules.length > 0;

  return (
    <button
      className={`panel-dock-btn script-panel-trigger ${isOpen ? 'active' : ''}`}
      aria-pressed={isOpen}
      onClick={() => toggle('script', isMobile)}
      {...panelButtonA11y('script')}
    >
      {/* 圖示與文字兩者都畫，由 CSS 決定顯示哪一個（`47-mobile.md`） */}
      <PanelDockFace panelKey="script" />
      {hasRules && <span className="script-badge" aria-hidden="true" />}
    </button>
  );
}

/**
 * Template 分頁列（`03-combat.md` § 3.14）
 *
 * 一個 template ＝ 戰鬥＋常駐＋村莊＋緊急撤退整包，切了立刻生效。
 * 使用中的分頁除了樣式，還帶 `aria-selected`，不能只靠顏色區分。
 */
function ScriptTemplateTabs() {
  const templates = useGameStore(s => s.scriptTemplates);
  const activeId = useGameStore(s => s.activeTemplateId);
  const active = useGameStore(selectActiveTemplate);
  const setActiveTemplate = useGameStore(s => s.setActiveTemplate);
  const addScriptTemplate = useGameStore(s => s.addScriptTemplate);
  const duplicateScriptTemplate = useGameStore(s => s.duplicateScriptTemplate);
  const renameScriptTemplate = useGameStore(s => s.renameScriptTemplate);
  const removeScriptTemplate = useGameStore(s => s.removeScriptTemplate);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  function startRename() {
    setRenaming(active.id);
    setDraftName(active.name);
  }

  function commitRename() {
    if (renaming) renameScriptTemplate(renaming, draftName);
    setRenaming(null);
  }

  return (
    <div className="template-bar">
      <div className="template-tabs" role="tablist" aria-label="腳本分頁">
        {templates.map(t => (
          renaming === t.id ? (
            <input
              key={t.id}
              className="template-rename-input"
              aria-label="分頁名稱"
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
            />
          ) : (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === activeId}
              className={`template-tab ${t.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveTemplate(t.id)}
              onDoubleClick={() => { setActiveTemplate(t.id); setRenaming(t.id); setDraftName(t.name); }}
            >
              {t.name}
              {t.id === activeId && <span className="template-active-dot" aria-label="使用中"> ●</span>}
            </button>
          )
        ))}
        <button className="template-add" aria-label="新增分頁" title="新增分頁" onClick={addScriptTemplate}>＋</button>
      </div>
      <div className="template-actions">
        <button aria-label="更名" title="更名" onClick={startRename}>✎</button>
        <button aria-label="複製分頁" title="複製分頁" onClick={() => duplicateScriptTemplate(active.id)}>⧉</button>
        <button
          aria-label="刪除分頁"
          title={isDeletableTemplate(active.id) ? '刪除分頁' : '預設分頁不可刪除'}
          disabled={!isDeletableTemplate(active.id)}
          onClick={() => removeScriptTemplate(active.id)}
        >✕</button>
      </div>
    </div>
  );
}

/** 腳本內容（由 `PanelWindows` 包在 FloatingWindow 內渲染） */
export function ScriptEditorContent() {
  const [tab, setTab] = useState<ScriptTab>('persistent');

  return (
    <>
      <ScriptTemplateTabs />
      <div className="script-tabs">
        <button
          className={`script-tab ${tab === 'persistent' ? 'active' : ''}`}
          onClick={() => setTab('persistent')}
        >
          常駐腳本
        </button>
        <button
          className={`script-tab ${tab === 'combat' ? 'active' : ''}`}
          onClick={() => setTab('combat')}
        >
          戰鬥腳本
        </button>
        <button
          className={`script-tab ${tab === 'village' ? 'active' : ''}`}
          onClick={() => setTab('village')}
        >
          村莊腳本
        </button>
      </div>
      {tab === 'combat' && <CombatScriptEditor />}
      {tab === 'persistent' && <PersistentScriptEditor />}
      {tab === 'village' && <VillageScriptEditor />}
    </>
  );
}
