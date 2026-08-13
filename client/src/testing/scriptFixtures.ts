import { useGameStore } from '../stores/gameStore';
import type { CombatRule, PersistentRule, EmergencyRetreat } from '../models/scriptEngine';
import type { VillageRule } from '../models/villageScript';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../models/scriptTemplate';

/**
 * 測試用：把腳本塞進「使用中的 template」。
 *
 * 腳本的唯一真相是 `scriptTemplates`（引擎與面板都讀 template），
 * 測試不可直接 `setState({ combatRules })`。
 */
export function setActiveScripts(overrides: {
  combatRules?: CombatRule[];
  persistentRules?: PersistentRule[];
  villageRules?: VillageRule[];
  emergencyRetreat?: EmergencyRetreat;
}): void {
  useGameStore.setState({
    scriptTemplates: [{ ...createDefaultTemplate(), ...overrides }],
    activeTemplateId: DEFAULT_TEMPLATE_ID,
  });
}
