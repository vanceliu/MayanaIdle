/**
 * 管理介面角色查詢的天賦配置（`97-selfhosted-server.md` § 97.8、`03-combat.md` § 3.14、`51-auto-talent.md`）。
 * 每份配置列出常駐／戰鬥／補給天賦格（同遊戲分頁順序）與緊急撤退；條件與動作名稱同遊戲（`models/talentLabels.ts`）。
 */
import type { TalentSlot, TalentSlotEntry, TalentType } from '../../client/src/models/talent';
import { TALENT_TYPE_LABELS } from '../../client/src/models/talent';
import { ruleLabel } from '../../client/src/models/talentLabels';
import {
  AFFIX_TYPE_OPTIONS, EQUIP_TYPE_OPTIONS, POTION_BUFF_OPTIONS, getParamFields, visibleParamFields, type ParamField,
} from '../../client/src/models/talentParams';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID, type ScriptTemplate } from '../../client/src/models/scriptTemplate';
import { ALL_TOWN_SCROLLS } from '../../client/src/models/townScroll';
import { DEFAULT_AFTER_COMBAT_THRESHOLDS } from '../../client/src/models/scriptEngine';
import { getSkillTemplate } from '../../client/src/models/skillTemplate';
import { getItemById } from '../../client/src/models/items';
import { getCachedTemplates } from '../../client/src/systems/templateSync';

/** 遊戲天賦面板的分頁順序（§ 51.10） */
const TAB_ORDER: readonly TalentType[] = ['persistent', 'combat', 'supply'];

export interface TalentEntryView {
  name: string;
  /** 參數，例「30%」「方向 大於、數量 3個」 */
  params: string[];
}

export interface TalentSlotView {
  tier: number;
  enabled: boolean;
  /** 條件槽，空槽為 null */
  conditions: (TalentEntryView | null)[];
  action: TalentEntryView | null;
}

export interface TalentTemplateView {
  name: string;
  active: boolean;
  types: { type: string; slots: TalentSlotView[] }[];
  /** 緊急撤退，例「HP 低於 20% → 回城（任意卷軸）」；關閉為「關閉」 */
  retreat: string;
}

export interface TalentView {
  templates: TalentTemplateView[];
  /** 戰鬥後等待（不分配置，§ 3.13） */
  afterCombat: string[];
  /** 未安裝（還在背包）的天賦格數 */
  uninstalled: number;
}

export interface TalentPrefs {
  scriptTemplates?: ScriptTemplate[];
  activeTemplateId?: string;
  afterCombatHpThreshold?: number;
  afterCombatMpThreshold?: number;
  afterCombatHpResumeThreshold?: number;
  afterCombatMpResumeThreshold?: number;
}

function multiLabel(field: Extract<ParamField, { kind: 'multi' }>, value: string | number): string {
  if (field.source === 'affix') return AFFIX_TYPE_OPTIONS.find(o => o.value === value)?.label ?? String(value);
  if (field.source === 'equipType') return EQUIP_TYPE_OPTIONS.find(o => o.value === value)?.label ?? String(value);
  return getCachedTemplates().find(t => t.id === value)?.name ?? String(value);
}

function paramValue(field: ParamField, params: Record<string, unknown>): string {
  const raw = params[field.key];
  return (() => {
    switch (field.kind) {
      case 'number': {
        const n = (raw as number | undefined) ?? field.def;
        return n === null || n === undefined ? '未設' : `${n}${field.suffix ?? ''}`;
      }
      case 'boolean':
        return ((raw as boolean | undefined) ?? field.def) ? '是' : '否';
      case 'select': {
        const v = String((raw as string | undefined) ?? field.def);
        return field.options.find(o => o.value === v)?.label ?? v;
      }
      case 'skill': {
        if (typeof raw !== 'string' || !raw) return '未選擇';
        return getSkillTemplate(raw)?.name ?? POTION_BUFF_OPTIONS.find(o => o.value === raw)?.label ?? raw;
      }
      case 'item':
        return typeof raw === 'number' ? getItemById(raw)?.name ?? `#${raw}` : '未選擇';
      case 'multi': {
        const list = Array.isArray(raw) ? (raw as (string | number)[]) : [];
        return list.length ? list.map(v => multiLabel(field, v)).join('、') : '未選';
      }
    }
  })();
}

/** 只有一個參數時只列值，多個時加欄位名稱 */
function entryView(entry: TalentSlotEntry | null): TalentEntryView | null {
  if (!entry) return null;
  const params = entry.params ?? {};
  const fields = visibleParamFields(getParamFields(entry.ruleId), params);
  return {
    name: ruleLabel(entry.ruleId),
    params: fields.map(f => (fields.length === 1 ? paramValue(f, params) : `${f.label} ${paramValue(f, params)}`)),
  };
}

function retreatText(t: ScriptTemplate): string {
  const r = t.emergencyRetreat;
  if (!r.enabled) return '關閉';
  const town = r.scrollTownId ? ALL_TOWN_SCROLLS.find(s => s.townId === r.scrollTownId)?.townName ?? r.scrollTownId : '任意卷軸';
  return `HP 低於 ${r.hpThreshold}% → 回城（${town}）`;
}

export function buildTalentView(slots: TalentSlot[], prefs: TalentPrefs): TalentView {
  const templates = prefs.scriptTemplates?.length ? prefs.scriptTemplates : [createDefaultTemplate()];
  const activeId = prefs.activeTemplateId ?? DEFAULT_TEMPLATE_ID;
  const wait = { ...DEFAULT_AFTER_COMBAT_THRESHOLDS, ...prefs };
  return {
    templates: templates.map(t => ({
      name: t.name,
      active: t.id === activeId,
      types: TAB_ORDER.map(type => ({
        type: TALENT_TYPE_LABELS[type],
        slots: slots
          .filter(s => s.assignedType === type && s.templateId === t.id)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(s => ({ tier: s.tier, enabled: s.enabled, conditions: s.conditions.map(entryView), action: entryView(s.action) })),
      })),
      retreat: retreatText(t),
    })),
    afterCombat: [
      `HP ≤ ${wait.afterCombatHpThreshold}%、MP ≤ ${wait.afterCombatMpThreshold}% 時停下休息`,
      `HP ≥ ${wait.afterCombatHpResumeThreshold}%、MP ≥ ${wait.afterCombatMpResumeThreshold}% 時恢復行動`,
    ],
    uninstalled: slots.filter(s => s.assignedType === null).length,
  };
}
