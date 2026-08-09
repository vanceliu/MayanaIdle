import { useGameStore } from '../stores/gameStore';
import type { CombatRule, PersistentRule, EmergencyRetreat } from '../models/scriptEngine';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../models/scriptTemplate';

/**
 * 測試用：把腳本塞進「使用中的 template」。
 *
 * 腳本的唯一真相是 `scriptTemplates`，測試不能再直接 `setState({ combatRules })` ——
 * 那樣寫得出來也跑不到，因為引擎與面板讀的都是 template。
 */
export function setActiveScripts(overrides: {
  combatRules?: CombatRule[];
  persistentRules?: PersistentRule[];
  emergencyRetreat?: EmergencyRetreat;
}): void {
  useGameStore.setState({
    scriptTemplates: [{ ...createDefaultTemplate(), ...overrides }],
    activeTemplateId: DEFAULT_TEMPLATE_ID,
  });
}
