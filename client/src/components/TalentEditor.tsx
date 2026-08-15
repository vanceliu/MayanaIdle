import { useState, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useTalentStore, availableSlots } from '../stores/talentStore';
import {
  TALENT_GROUPS,
  TALENT_GROUP_LABELS,
  TALENT_TYPE_LABELS,
  conditionSlotCount,
  isSlotInstalled,
  type TalentGroup,
  type TalentRuleDef,
  type TalentSlot,
  type TalentSlotEntry,
  type TalentType,
} from '../models/talent';
import { selectableRules } from '../db/seed/talentSeeds';
import { getTalentAffixIcon } from '../models/iconMap';
import { GameIcon } from './GameIcon';
import { useIsDragOver, useIsDragging, useDragStore, hitTestDropTarget } from '../stores/dragStore';
import { slotSkipReason, type SlotSkipReason } from '../systems/talentRules';
import { PersistentSettings } from './PersistentSettings';
import { useDismissOnOutside } from '../hooks/useDismissOnOutside';
import { getParamFields, type ParamField, type ParamSkillFilter } from '../models/talentParams';
import { getItemById } from '../models/items';
import type { Skill } from '../models/skill';
import { ruleLabel, ruleLabelOf } from '../models/talentLabels';

/** 天賦格編輯（`51-auto-talent.md` § 51.10） */

// 名稱解析在 model 層，Wiki 也在用（`models/talentLabels.ts`）
export { ruleLabel, ruleLabelOf };

/**
 * 技能選單的範圍（`talentParams.ts` 的 `filter`）。
 *
 * `byTalentType` 是共用條件（技能就緒）用的：戰鬥分頁列攻擊型、
 * 常駐分頁列 buff 與治癒（`03-combat.md` § 3.12／§ 3.13）。
 */
export function matchesSkillFilter(
  skill: Skill, filter: ParamSkillFilter, slotType: TalentType | null,
): boolean {
  switch (filter) {
    case 'attack': return skill.type === 'attack';
    case 'heal': return skill.type === 'heal';
    case 'buff': return skill.type === 'buff';
    case 'byTalentType':
      return slotType === 'combat' ? skill.type === 'attack' : skill.type !== 'attack';
  }
}

/** 條件／動作的圖示 */
export function RuleIcon({ def, size = 18 }: { def: TalentRuleDef; size?: number }) {
  return <GameIcon name={getTalentAffixIcon(def.ruleId, def.kind)} size={size} />;
}

/**
 * 參數編輯（`51-auto-talent.md` § 51.4.1）。
 * 欄位由 `models/talentParams.ts` 依 `ruleId` 宣告，**一律玩家自訂、隨時可改**。
 */
function ParamInput({
  field, slotId, slotIndex, entry, slotType,
}: {
  field: ParamField;
  slotId: number;
  slotIndex: number | null;
  entry: TalentSlotEntry;
  slotType: TalentType | null;
}) {
  const setEntryParams = useTalentStore(s => s.setEntryParams);
  const skills = useGameStore(s => s.skills);
  const bagItems = useGameStore(s => s.bagItems);
  const params = entry.params ?? {};

  function write(value: unknown) {
    void setEntryParams(slotId, slotIndex, { ...params, [field.key]: value });
  }

  if (field.kind === 'number') {
    return (
      <label className="talent-param">
        <span>{field.label}</span>
        <input
          type="number"
          value={(params[field.key] as number | undefined) ?? field.def ?? ''}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          onChange={e => write(e.target.value === '' ? undefined : Number(e.target.value))}
          onClick={e => e.stopPropagation()}
        />
        {field.suffix && <span className="talent-param-suffix">{field.suffix}</span>}
      </label>
    );
  }

  if (field.kind === 'boolean') {
    return (
      <label className="talent-param">
        <span>{field.label}</span>
        <input
          type="checkbox"
          checked={(params[field.key] as boolean | undefined) ?? field.def}
          onChange={e => write(e.target.checked)}
          onClick={e => e.stopPropagation()}
        />
      </label>
    );
  }

  if (field.kind === 'select') {
    return (
      <label className="talent-param">
        <span>{field.label}</span>
        <select
          value={String((params[field.key] as string | undefined) ?? field.def)}
          onChange={e => write(e.target.value === '' ? undefined : e.target.value)}
          onClick={e => e.stopPropagation()}
        >
          {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  }

  if (field.kind === 'skill') {
    // 只列**已學會**的：列沒學的等於讓玩家設一條永遠不成立的規則
    const usable = skills.filter(sk => matchesSkillFilter(sk, field.filter, slotType));
    return (
      <label className="talent-param">
        <span>{field.label}</span>
        <select
          value={(params[field.key] as string | undefined) ?? ''}
          onChange={e => write(e.target.value || undefined)}
          onClick={e => e.stopPropagation()}
        >
          <option value="">未選擇</option>
          {usable.map(sk => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
        </select>
      </label>
    );
  }

  // item：從背包現有的道具挑，存 id 不存名稱（§ 99.1 第 7 條）
  return (
    <label className="talent-param">
      <span>{field.label}</span>
      <select
        value={String((params[field.key] as number | undefined) ?? '')}
        onChange={e => write(e.target.value ? Number(e.target.value) : undefined)}
        onClick={e => e.stopPropagation()}
      >
        <option value="">未選擇</option>
        {bagItems.map(b => (
          <option key={b.itemId} value={b.itemId}>{getItemById(b.itemId)?.name ?? b.name}</option>
        ))}
      </select>
    </label>
  );
}

/** 依 `group` 分區的選單（§ 51.10）。分區順序照 `TALENT_GROUPS` */
function RuleMenu({
  type, kind, onPick,
}: { type: TalentType; kind: 'condition' | 'action'; onPick: (ruleId: string) => void }) {
  const defs = selectableRules(type, kind);
  const byGroup = new Map<TalentGroup, TalentRuleDef[]>();
  for (const d of defs) {
    const list = byGroup.get(d.group) ?? [];
    list.push(d);
    byGroup.set(d.group, list);
  }

  return (
    <ul className="talent-slot-menu">
      {defs.length === 0 && <li className="talent-slot-menu-empty">這個類型沒有可選項目</li>}
      {TALENT_GROUPS.filter(g => byGroup.has(g)).map(group => (
        <li key={group} className="talent-slot-menu-group">
          <span className="talent-slot-menu-group-label">{TALENT_GROUP_LABELS[group]}</span>
          <ul>
            {byGroup.get(group)!
              .map(d => ({ def: d, name: ruleLabelOf(d) }))
              .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
              .map(({ def, name }) => (
                <li key={def.ruleId}>
                  <button onClick={() => onPick(def.ruleId)}>
                    <RuleIcon def={def} size={16} />
                    {name}
                  </button>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/** 一個槽位。空的可點開選單，有東西的可清空 */
function Slot({
  slot, slotIndex, entry,
}: { slot: TalentSlot; slotIndex: number | null; entry: TalentSlotEntry | null }) {
  const [picking, setPicking] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useDismissOnOutside(wrapRef, picking, () => setPicking(false));
  const setEntry = useTalentStore(s => s.setEntry);
  // 放置目標以 DOM 屬性宣告自己（`stores/dragStore.ts`），不必在 store 註冊
  const dropProps = {
    'data-drop-kind': 'talent-slot',
    'data-drop-index': String(slot.id),
    'data-drop-sub': slotIndex === null ? 'action' : String(slotIndex),
  };
  const isOver = useIsDragOver('talent-slot', slot.id!, slotIndex);
  const dragging = useIsDragging();

  if (entry) {
    const def = selectableRules(slot.assignedType!, slotIndex === null ? 'action' : 'condition')
      .find(d => d.ruleId === entry.ruleId);
    const fields = getParamFields(entry.ruleId);
    return (
      <div
        className={`talent-slot is-filled${isOver ? ' drag-over' : ''}${dragging ? ' can-drop' : ''}`}
        {...dropProps}
      >
        {def && <RuleIcon def={def} />}
        <span className="talent-slot-name">{ruleLabel(entry.ruleId)}</span>
        {fields.map(f => (
          <ParamInput
            key={f.key}
            field={f}
            slotId={slot.id!}
            slotIndex={slotIndex}
            entry={entry}
            slotType={slot.assignedType}
          />
        ))}
        <button
          className="talent-slot-remove"
          onClick={() => setEntry(slot.id!, slotIndex, null)}
          title="清空（免費、無損）"
          aria-label="清空"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="talent-slot-wrap" ref={wrapRef}>
      <button
        className={`talent-slot is-empty${isOver ? ' drag-over' : ''}${dragging ? ' can-drop' : ''}`}
        onClick={() => setPicking(v => !v)}
        title="點一下從清單選"
        {...dropProps}
      >
        {slotIndex === null ? '＋ 動作' : '＋ 條件'}
      </button>
      {picking && slot.assignedType && (
        <RuleMenu
          type={slot.assignedType}
          kind={slotIndex === null ? 'action' : 'condition'}
          onPick={ruleId => { void setEntry(slot.id!, slotIndex, ruleId); setPicking(false); }}
        />
      )}
    </div>
  );
}

const SKIP_HINT: Record<SlotSkipReason, string> = {
  'no-action': '動作槽是空的，這一列不進判定',
  unresolved: '技能／道具還沒選定，這一列不進判定',
};

function SlotRow({ slot, order }: { slot: TalentSlot; order: number }) {
  const uninstallSlot = useTalentStore(s => s.uninstallSlot);
  const toggleSlot = useTalentStore(s => s.toggleSlot);
  const beginDrag = useDragStore(s => s.begin);
  const moveDrag = useDragStore(s => s.move);
  const endDrag = useDragStore(s => s.drop);
  const reorderSlot = useTalentStore(s => s.reorderSlot);
  const isOver = useIsDragOver('talent-row', order);
  // 沒進判定的列要看得出來。停用不掛 —— 勾選框已經表達了（§ 51.3.1）
  const skip = slot.enabled ? slotSkipReason(slot) : null;

  /** 拖把手才是拖曳來源：整列可拖的話，改參數時一動就會被當成拖曳 */
  function startDrag(e: React.PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag(
      { fromIndex: order, payload: { kind: 'talent-slot-item', slotId: slot.id!, name: '天賦格' }, label: '天賦格' },
      e.clientX, e.clientY,
    );
  }

  async function finishDrag(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    const item = useDragStore.getState().item;
    const target = hitTestDropTarget(e.clientX, e.clientY);
    endDrag();
    if (item?.payload.kind !== 'talent-slot-item') return;
    if (target?.kind !== 'talent-row') return;
    await reorderSlot(item.payload.slotId, target.index);
  }

  return (
    <li
      className={`talent-row${slot.enabled ? '' : ' is-disabled'}${isOver ? ' drag-over' : ''}`}
      data-drop-kind="talent-row"
      data-drop-index={String(order)}
    >
      {/* 順序決定判定優先權：由上往下取第一個成立的（§ 3.12） */}
      <span
        className="talent-row-handle"
        title="拖曳調整順序。判定由上往下，先成立的先執行"
        onPointerDown={startDrag}
        onPointerMove={e => moveDrag(e.clientX, e.clientY)}
        onPointerUp={finishDrag}
        onPointerCancel={() => endDrag()}
        onLostPointerCapture={() => endDrag()}
      >
        ⠿
      </span>
      <span className="talent-row-order">{order + 1}</span>
      {skip && (
        <span className="talent-row-skip" title={SKIP_HINT[skip]} aria-label={SKIP_HINT[skip]}>
          ⚠
        </span>
      )}
      <label className="talent-row-enable" title={slot.enabled ? '停用這一列' : '啟用這一列'}>
        <input type="checkbox" checked={slot.enabled} onChange={() => toggleSlot(slot.id!)} />
      </label>
      {/* 條件一行、動作一行，條件多時換行 */}
      <div className="talent-row-slots">
        <div className="talent-row-conds">
          {Array.from({ length: conditionSlotCount(slot.tier) }, (_, i) => (
            <Slot key={i} slot={slot} slotIndex={i} entry={slot.conditions[i] ?? null} />
          ))}
        </div>
        <div className="talent-row-act">
          <span className="talent-row-arrow">→</span>
          <Slot slot={slot} slotIndex={null} entry={slot.action} />
        </div>
      </div>
      <button
        className="talent-row-uninstall"
        onClick={() => uninstallSlot(slot.id!)}
        title="拆下天賦格。設定會原樣保留，裝回同類型即復原"
      >
        拆下
      </button>
    </li>
  );
}

export function TalentTypeEditor({ type }: { type: TalentType }) {
  const slots = useTalentStore(s => s.slots);
  const installSlot = useTalentStore(s => s.installSlot);
  const templateId = useGameStore(s => s.activeTemplateId);

  const mine = slots
    .filter(s => isSlotInstalled(s) && s.assignedType === type && s.templateId === templateId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const spare = availableSlots(slots, templateId);
  const tailOver = useIsDragOver('talent-row', mine.length);
  const installOver = useIsDragOver('talent-install', -1);
  const [adding, setAdding] = useState(false);
  const addRef = useRef<HTMLLIElement>(null);
  useDismissOnOutside(addRef, adding, () => setAdding(false));
  const dragging = useIsDragging();

  // 同 tier 的天賦格一模一樣，堆成一列帶數量
  const tierStacks = ([1, 2, 3, 4] as const)
    .map(tier => {
      const of = spare.filter(s => s.tier === tier);
      return { tier, count: of.length, id: of[0]?.id ?? -1 };
    })
    .filter(x => x.count > 0);

  return (
    <div
      className={`talent-editor${dragging ? ' is-dragging' : ''}`}
      data-testid={`talent-editor-${type}`}
      data-talent-type={type}
    >
      {mine.length === 0 && (
        <div className="talent-empty">這個類型還沒有安裝天賦格</div>
      )}
      <ul className="talent-list">
        {mine.map((slot, i) => <SlotRow key={slot.id} slot={slot} order={i} />)}
        {/* 拖到最後一列之後＝排到最尾端。沒有這格就排不到隊伍最後 */}
        <li
          className={`talent-row-tail${tailOver ? ' drag-over' : ''}`}
          data-drop-kind="talent-row"
          data-drop-index={String(mine.length)}
        />
        {/* 安裝鈕，同時是拖放落點。數量走角標 */}
        {spare.length > 0 && (
          <li className="talent-add-wrap" ref={addRef}>
            <button
              className={`talent-add${installOver ? ' drag-over' : ''}`}
              data-drop-kind="talent-install"
              data-drop-index="-1"
              onClick={() => setAdding(v => !v)}
              title={`安裝天賦格到「${TALENT_TYPE_LABELS[type]}」。也可以從背包拖過來`}
            >
              ＋
              <span className="talent-add-count">{spare.length}</span>
            </button>
            {adding && (
              /*
               * 讓玩家挑 tier：手上可能同時有 T1 與 T3，
               * 直接裝第一個會把好不容易合成的 T3 塞進不需要條件的那一列。
               */
              <ul className="talent-slot-menu">
                {tierStacks.map(({ tier, count, id }) => (
                  <li key={tier}>
                    <button onClick={() => { void installSlot(id, type, templateId); setAdding(false); }}>
                      <span className="talent-slot-tier">T{tier}</span>
                      {tier} 個條件槽
                      <span className="talent-add-count">×{count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )}
      </ul>
      {/* 緊急撤退與戰鬥後等待不是天賦規則，是常駐的門檻設定（§ 3.13） */}
      {type === 'persistent' && <PersistentSettings />}
    </div>
  );
}
