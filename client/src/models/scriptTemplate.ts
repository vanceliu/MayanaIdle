import type { CombatRule, PersistentRule, EmergencyRetreat } from './scriptEngine';
import type { VillageRule } from './villageScript';
import { DEFAULT_VILLAGE_SCRIPT, normalizeVillageRules } from './villageScript';
import {
  DEFAULT_COMBAT_SCRIPT,
  DEFAULT_PERSISTENT_SCRIPT,
  DEFAULT_EMERGENCY_RETREAT,
  normalizeCombatRules,
  normalizePersistentRules,
} from './scriptEngine';

/**
 * 腳本 Template（`03-combat.md` § 3.14）
 *
 * 一個 template 是**整包**設定：戰鬥腳本＋常駐腳本＋村莊腳本＋緊急撤退。
 * 玩家切換情境（清怪／打王／練功）時一次到位，不必分三處各切一遍。
 */
export interface ScriptTemplate {
  id: string;
  name: string;
  combatRules: CombatRule[];
  persistentRules: PersistentRule[];
  villageRules: VillageRule[];
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
    combatRules: DEFAULT_COMBAT_SCRIPT,
    persistentRules: DEFAULT_PERSISTENT_SCRIPT,
    villageRules: DEFAULT_VILLAGE_SCRIPT,
    emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
  };
}

/**
 * 新分頁用預設腳本開場，**不是空白** ——
 * 空腳本代表角色完全不出手（`41-arpg-combat.md`：引擎不會偷偷退回普通攻擊），
 * 新開一個分頁就站著發呆不會有人覺得是「照設定跑」。
 */
export function createScriptTemplate(id: string, name: string): ScriptTemplate {
  return {
    id,
    name,
    combatRules: DEFAULT_COMBAT_SCRIPT,
    persistentRules: DEFAULT_PERSISTENT_SCRIPT,
    villageRules: DEFAULT_VILLAGE_SCRIPT,
    emergencyRetreat: DEFAULT_EMERGENCY_RETREAT,
  };
}

/** 依既有名稱給出不重複的新分頁名（腳本 1、腳本 2…） */
export function nextTemplateName(existing: ScriptTemplate[]): string {
  const taken = new Set(existing.map(t => t.name));
  for (let i = 1; ; i += 1) {
    const name = `腳本 ${i}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * 讀檔防線。單一 template 內的規則沿用 `scriptEngine` 的「形狀不對就重置」，
 * template 這層本身壞掉（不是陣列、缺 id／name）則整份回到只有預設一頁。
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
      combatRules: normalizeCombatRules(t.combatRules),
      persistentRules: normalizePersistentRules(t.persistentRules),
      villageRules: normalizeVillageRules(t.villageRules),
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
