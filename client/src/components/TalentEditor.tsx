import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import {
  useTalentStore,
  canEquipAffix,
  availableAffixes,
  availableSlots,
} from '../stores/talentStore';
import {
  SKILL_POOL_KEYS,
  SKILL_POOL_LABELS,
  TALENT_TYPE_LABELS,
  type SkillPoolKey,
  type TalentAffixDef,
  conditionSlotCount,
  isSlotInstalled,
  type TalentAffixInstance,
  type TalentSlot,
  type TalentType,
} from '../models/talent';
import { getTalentAffixDef } from '../db/seed/talentSeeds';
import { getTalentAffixIcon, MATERIAL_TIER_COLORS } from '../models/iconMap';
import { GameIcon } from './GameIcon';
import { useIsDragOver, useIsDragging, useDragStore, hitTestDropTarget } from '../stores/dragStore';
import { BindConfirmModal } from './BindConfirmModal';
import { getParamFields, type ParamField } from '../models/talentParams';
import { getItemById } from '../models/items';
import { COMBAT_CONDITION_LABELS, COMBAT_ACTION_LABELS, PERSISTENT_CONDITION_LABELS, PERSISTENT_ACTION_LABELS } from '../models/scriptEngine';
import { VILLAGE_CONDITION_LABELS, VILLAGE_ACTION_LABELS } from '../models/villageScript';

/**
 * 天賦格編輯（`51-auto-talent.md` § 51.10）。
 *
 * 取代舊的三個腳本編輯器：規則不再是玩家自由新增的陣列，
 * 而是「有幾個天賦格、每格鑲了什麼」。
 */

/**
 * 鑲材顯示名稱。**標籤一律取自既有常數**，與 Wiki 共用同一份 ——
 * 這裡自己寫一份的話，面板改名 Wiki 不會跟著動（§ 43.4.12）。
 */
export function affixLabel(affix: TalentAffixInstance): string {
  const def = getTalentAffixDef(affix.definitionId);
  return def ? affixLabelOf(def) : '未知鑲材';
}

/** 由定義取名稱。信箱只有定義沒有實例，所以拆成兩支 */
export function affixLabelOf(def: TalentAffixDef): string {
  const maps: Record<string, string>[] = def.kind === 'condition'
    ? [COMBAT_CONDITION_LABELS, PERSISTENT_CONDITION_LABELS, VILLAGE_CONDITION_LABELS]
    : [COMBAT_ACTION_LABELS, PERSISTENT_ACTION_LABELS, VILLAGE_ACTION_LABELS];
  for (const m of maps) {
    if (def.ruleId in m) return m[def.ruleId];
  }
  return def.ruleId;
}

/**
 * 技能落不落在該系別內（§ 51.4.9 的 9 個子集）。
 * 元素看 `element`，型態看有沒有 AoE 參數 —— 兩個家族刻意重疊。
 */
function matchesSkillPool(skill: { element?: string; aoeRadius?: number; maxTargets?: number }, key: string): boolean {
  if (key === 'single') return !skill.aoeRadius;
  if (key === 'aoe') return !!skill.aoeRadius;
  return skill.element === key;
}

function tierTag(affix: TalentAffixInstance): string {
  return `T${getTalentAffixDef(affix.definitionId)?.tier ?? '?'}`;
}

/** 鑲材圖示。tier 用素材那套色階，與背包分頁一致 */
export function AffixIcon({ affix, size = 18 }: { affix: TalentAffixInstance; size?: number }) {
  const def = getTalentAffixDef(affix.definitionId);
  if (!def) return null;
  return (
    <GameIcon
      name={getTalentAffixIcon(def.ruleId, def.kind)}
      size={size}
      color={MATERIAL_TIER_COLORS[def.tier]}
    />
  );
}

/**
 * 參數編輯（`51-auto-talent.md` § 51.4.1「有序參數一律由玩家自訂」）。
 *
 * 沒有這個，規則就是「HP 低於 ??」—— 判定拿不到門檻，鑲了也不會觸發。
 * 欄位由 `models/talentParams.ts` 依 `ruleId` 宣告，這裡只負責畫。
 */
function ParamInput({ field, affix }: { field: ParamField; affix: TalentAffixInstance }) {
  const setAffixParams = useTalentStore(s => s.setAffixParams);
  const bindAffix = useTalentStore(s => s.bindAffix);
  const skills = useGameStore(s => s.skills);
  const bagItems = useGameStore(s => s.bagItems);
  const params = affix.params ?? {};
  /* 綁定不可更改（§ 51.4.1），所以要先確認再寫入 */
  const [binding, setBinding] = useState<{ label: string; target: string; value: string } | null>(null);

  function write(value: unknown) {
    void setAffixParams(affix.id!, { ...params, [field.key]: value });
  }

  function confirmBind() {
    if (binding) void bindAffix(affix.id!, binding.value);
    setBinding(null);
  }

  /** 綁定用的下拉：選了不直接寫入，先跳確認 */
  function BindSelect({ label, options }: { label: string; options: { value: string; name: string }[] }) {
    return (
      <>
        <label className="talent-param is-binding">
          <span>{label}</span>
          <select
            value=""
            onChange={e => {
              const opt = options.find(o => o.value === e.target.value);
              if (opt) setBinding({ label, target: opt.name, value: opt.value });
            }}
            onClick={e => e.stopPropagation()}
            title="選定後不可更改"
          >
            <option value="">選定（不可更改）</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
          </select>
        </label>
        {binding && (
          <BindConfirmModal
            label={binding.label}
            target={binding.target}
            onCancel={() => setBinding(null)}
            onConfirm={confirmBind}
          />
        )}
      </>
    );
  }

  if (field.kind === 'number') {
    return (
      <label className="talent-param">
        <span>{field.label}</span>
        <input
          type="number"
          value={(params[field.key] as number | undefined) ?? field.def}
          min={field.min}
          max={field.max}
          onChange={e => write(Number(e.target.value))}
          onClick={e => e.stopPropagation()}
        />
        {field.suffix && <span className="talent-param-suffix">{field.suffix}</span>}
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
    const usable = skills.filter(sk =>
      field.filter === 'attack' ? sk.type === 'attack' : sk.type === 'buff' || sk.type === 'heal');
    const def = getTalentAffixDef(affix.definitionId);

    /*
     * 指定型：**綁定後不可更改**（§ 51.4.1）。
     * 未綁定時挑一次就定死，之後只顯示不給改 —— 讓它像自選型一樣隨便換，
     * 「想放某一招就得刷到綁那一招的鑲材」這條 tier 軸就沒有意義了。
     */
    if (def?.form === 'fixed') {
      if (affix.boundParam) {
        const bound = skills.find(sk => sk.id === affix.boundParam);
        return (
          <span className="talent-param is-bound" title="指定型鑲材，綁定後不可更改">
            {bound?.name ?? affix.boundParam}
            <span className="talent-param-lock">🔒</span>
          </span>
        );
      }
      return (
        <BindSelect
          label={field.label}
          options={usable.map(sk => ({ value: sk.id, name: sk.name }))}
        />
      );
    }

    /* 池型：先綁一個系別，之後只能在該系別內自選 */
    let pooled = usable;
    if (def?.form === 'pool') {
      if (!affix.boundParam) {
        return (
          <BindSelect
            label="系別"
            options={SKILL_POOL_KEYS.map(k => ({ value: k, name: SKILL_POOL_LABELS[k] }))}
          />
        );
      }
      pooled = usable.filter(sk => matchesSkillPool(sk, affix.boundParam!));
    }

    return (
      <label className="talent-param">
        <span>{def?.form === 'pool' ? SKILL_POOL_LABELS[affix.boundParam as SkillPoolKey] : field.label}</span>
        <select
          value={(params[field.key] as string | undefined) ?? ''}
          onChange={e => write(e.target.value || undefined)}
          onClick={e => e.stopPropagation()}
        >
          <option value="">未選擇</option>
          {pooled.map(sk => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
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

/** 一個槽位。空的可點開選單，有東西的可卸下 */
function Slot({
  slot, slotIndex, occupant,
}: { slot: TalentSlot; slotIndex: number | null; occupant?: TalentAffixInstance }) {
  const [picking, setPicking] = useState(false);
  const affixes = useTalentStore(s => s.affixes);
  const slots = useTalentStore(s => s.slots);
  const equipAffix = useTalentStore(s => s.equipAffix);
  const unequipAffix = useTalentStore(s => s.unequipAffix);
  // 放置目標以 DOM 屬性宣告自己（`stores/dragStore.ts`），不必在 store 註冊
  const dropProps = {
    'data-drop-kind': 'talent-slot',
    'data-drop-index': String(slot.id),
    'data-drop-sub': slotIndex === null ? 'action' : String(slotIndex),
  };
  const isOver = useIsDragOver('talent-slot', slot.id!, slotIndex);
  const dragging = useIsDragging();

  // 只列出**已持有且這份配置沒用到**的（§ 51.10）。未取得的走 Wiki
  const options = availableAffixes(affixes, slots, slot.templateId ?? '')
    .filter(a => canEquipAffix(a, slot, slotIndex));

  if (occupant) {
    const def = getTalentAffixDef(occupant.definitionId);
    const fields = def ? getParamFields(def.ruleId) : [];
    return (
      <div
        className={`talent-slot is-filled${isOver ? ' drag-over' : ''}${dragging ? ' can-drop' : ''}`}
        {...dropProps}
      >
        <AffixIcon affix={occupant} />
        <span className="talent-slot-tier">{tierTag(occupant)}</span>
        <span className="talent-slot-name">{affixLabel(occupant)}</span>
        {fields.map(f => <ParamInput key={f.key} field={f} affix={occupant} />)}
        <button
          className="talent-slot-remove"
          onClick={() => unequipAffix(occupant.id!)}
          title="卸下（免費、無損）"
          aria-label="卸下"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="talent-slot-wrap">
      <button
        className={`talent-slot is-empty${isOver ? ' drag-over' : ''}${dragging ? ' can-drop' : ''}`}
        onClick={() => setPicking(v => !v)}
        title="點一下從清單選，或從背包拖鑲材過來"
        {...dropProps}
      >
        {slotIndex === null ? '＋ 實作' : '＋ 條件'}
      </button>
      {picking && (
        <ul className="talent-slot-menu">
          {options.length === 0 && <li className="talent-slot-menu-empty">沒有可鑲的鑲材</li>}
          {options.map(a => (
            <li key={a.id}>
              <button onClick={() => { equipAffix(a.id!, slot.id!, slotIndex); setPicking(false); }}>
                <AffixIcon affix={a} size={16} />
                <span className="talent-slot-tier">{tierTag(a)}</span>
                {affixLabel(a)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SlotRow({ slot, order }: { slot: TalentSlot; order: number }) {
  const affixes = useTalentStore(s => s.affixes);
  const uninstallSlot = useTalentStore(s => s.uninstallSlot);
  const toggleSlot = useTalentStore(s => s.toggleSlot);
  const beginDrag = useDragStore(s => s.begin);
  const moveDrag = useDragStore(s => s.move);
  const endDrag = useDragStore(s => s.drop);
  const reorderSlot = useTalentStore(s => s.reorderSlot);
  const isOver = useIsDragOver('talent-row', order);
  const inSlot = affixes.filter(a => a.slotId === slot.id);
  const action = inSlot.find(a => a.slotIndex === null);

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
      <label className="talent-row-enable" title={slot.enabled ? '停用這一列' : '啟用這一列'}>
        <input type="checkbox" checked={slot.enabled} onChange={() => toggleSlot(slot.id!)} />
      </label>
      {/*
        條件一行、實作一行。條件多的時候自己換行，不做橫向捲動 ——
        捲動要拖過去才看得到後面設了什麼，而規則本來就該一眼讀完。
      */}
      <div className="talent-row-slots">
        <div className="talent-row-conds">
          {Array.from({ length: conditionSlotCount(slot.tier) }, (_, i) => (
            <Slot
              key={i}
              slot={slot}
              slotIndex={i}
              occupant={inSlot.find(a => a.slotIndex === i)}
            />
          ))}
        </div>
        <div className="talent-row-act">
          <span className="talent-row-arrow">→</span>
          <Slot slot={slot} slotIndex={null} occupant={action} />
        </div>
      </div>
      <button
        className="talent-row-uninstall"
        onClick={() => uninstallSlot(slot.id!)}
        title="拆下天賦格。已鑲的鑲材會一併退回背包"
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
        {/*
          安裝＝清單末尾的一顆 `＋`，同時是拖放落點。
          數量走角標，不寫成一整句話 —— 那是每次打開都要重讀一遍的雜訊。
        */}
        {spare.length > 0 && (
          <li className="talent-add-wrap">
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
    </div>
  );
}
