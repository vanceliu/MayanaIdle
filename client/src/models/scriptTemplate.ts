import type { EmergencyRetreat } from './scriptEngine';
import { DEFAULT_EMERGENCY_RETREAT } from './scriptEngine';

/**
 * 腳本 Template（`03-combat.md` § 3.14）
 *
 * 一個 template 是**整包**設定：天賦格配置＋緊急撤退。
 * 玩家切換情境（清怪／打王／練功）時一次到位。
 *
 * 規則本體存在天賦格（`51-auto-talent.md`），template 只留 id、名稱與緊急撤退 ——
 * 舊的 `combatRules`／`persistentRules`／`villageRules` 三個陣列已隨自動天賦改版廢除。
 */
export interface ScriptTemplate {
  id: string;
  name: string;
  emergencyRetreat: EmergencyRetreat;
}

/** 內建預設 template 的 id。這一份不可刪除，所以「至少留一個」自動成立 */
export const DEFAULT_TEMPLATE_ID = 'default';

export function isDeletableTemplate(id: string): boolean {
  return id !== DEFAULT_TEMPLATE_ID;
}

export function createDefaultTemplate(): ScriptTemplate {
  return {
    id: DEFAULT_TEMPLATE_ID,
    name: '預設',
    emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
  };
}

export function createScriptTemplate(id: string, name: string): ScriptTemplate {
  return {
    id,
    name,
    emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
  };
}

/** 依既有名稱給出不重複的新分頁名（配置 1、配置 2…） */
export function nextTemplateName(existing: ScriptTemplate[]): string {
  const taken = new Set(existing.map(t => t.name));
  for (let i = 1; ; i += 1) {
    const name = `配置 ${i}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * 讀檔防線。template 這層壞掉（不是陣列、缺 id／name）就整份回到只有預設一頁。
 * 舊存檔殘留的三個規則陣列在這裡被丟掉，不再寫回。
 */
export function normalizeScriptTemplates(value: unknown): ScriptTemplate[] {
  if (!Array.isArray(value) || value.length === 0) return [createDefaultTemplate()];

  const templates: ScriptTemplate[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return [createDefaultTemplate()];
    const t = raw as Partial<ScriptTemplate>;
    if (typeof t.id !== 'string' || typeof t.name !== 'string') return [createDefaultTemplate()];
    templates.push({
      id: t.id,
      name: t.name,
      emergencyRetreat: t.emergencyRetreat ?? DEFAULT_EMERGENCY_RETREAT,
    });
  }

  // 預設 template 不可刪除，所以任何情況下都必須在場
  if (!templates.some(t => t.id === DEFAULT_TEMPLATE_ID)) {
    templates.unshift(createDefaultTemplate());
  }
  return templates;
}

/** 找出使用中的 template；指向不存在的 id 時退回第一頁（不會是 undefined） */
export function resolveActiveTemplate(templates: ScriptTemplate[], activeId: string): ScriptTemplate {
  return templates.find(t => t.id === activeId) ?? templates[0];
}
