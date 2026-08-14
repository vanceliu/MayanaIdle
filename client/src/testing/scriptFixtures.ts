import { useGameStore } from '../stores/gameStore';
import type { EmergencyRetreat } from '../models/scriptEngine';
import { createDefaultTemplate, DEFAULT_TEMPLATE_ID } from '../models/scriptTemplate';

/**
 * 測試用：設定「使用中的 template」。
 *
 * template 的唯一真相是 `scriptTemplates`，測試不可直接 `setState({ emergencyRetreat })`。
 * 規則本體在天賦格（`51-auto-talent.md`），要塞規則請用 talentStore。
 */
export function setActiveScripts(overrides: {
  emergencyRetreat?: EmergencyRetreat;
} = {}): void {
  useGameStore.setState({
    scriptTemplates: [{ ...createDefaultTemplate(), ...overrides }],
    activeTemplateId: DEFAULT_TEMPLATE_ID,
  });
}
