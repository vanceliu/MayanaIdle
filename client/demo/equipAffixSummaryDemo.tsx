/**
 * 裝備欄詞綴加總（`equip-affix-summary.html`）：直接掛正式的 `EquipmentPanel`（含詞綴加總），只提供假裝備。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EquipmentPanel } from '../src/components/EquipmentPanel';
import { useGameStore } from '../src/stores/gameStore';
import { EQUIPMENT_SEEDS } from '../src/db/seed/equipmentSeeds';
import { resolveEquipment, rollNewInstanceFields } from '../src/systems/templateSync';
import { generateAffixes, getAffixCategoryForSlot, getWeaponBaseDamage } from '../src/models/affix';
import { SLOT_ORDER, type EquipSlot, type EquipmentInstance, type EquipmentTemplate } from '../src/models/equipment';

// ── 假資料：整套高階裝，詞綴隨機（含 T7 獨有詞綴） ─────────────────────────
const templates = EQUIPMENT_SEEDS as EquipmentTemplate[];
const SEED_SLOT: Record<EquipSlot, string> = {
  rightHand: 'rightHand', leftHand: 'leftHand', helmet: 'helmet', chest: 'chest', shirt: 'shirt', cloak: 'cloak',
  belt: 'belt', gloves: 'gloves', boots: 'boots', necklace: 'necklace', ring1: 'ring1', ring2: 'ring1',
};

function pickTemplate(slot: EquipSlot): EquipmentTemplate | undefined {
  const pool = templates.filter(t => t.slot === SEED_SLOT[slot] && (t.tier ?? 0) >= 5 && t.acquireType !== 'starter'
    && (slot !== 'leftHand' || t.type === 'shield'));
  return pool[Math.floor(Math.random() * pool.length)];
}

let nextId = 1;
function rollGear(): Partial<Record<EquipSlot, EquipmentInstance>> {
  const gear: Partial<Record<EquipSlot, EquipmentInstance>> = {};
  for (const slot of SLOT_ORDER) {
    const t = pickTemplate(slot);
    if (!t) continue;
    gear[slot] = resolveEquipment({
      id: nextId++, templateId: t.id!, name: t.name, type: t.type, slot, isTwoHanded: t.isTwoHanded,
      quality: Math.floor(Math.random() * 21), enhancement: 0,
      ...rollNewInstanceFields(t),
      affixes: generateAffixes(getAffixCategoryForSlot(slot, t.type), 60, 4, true, { weaponBaseDamage: getWeaponBaseDamage(t) }),
      ownerId: 1, equipped: true,
    });
  }
  return gear;
}

const character = {
  id: 1, name: '我', className: 'knight', level: 60, gold: 0,
  baseAttributes: { STR: 99, AGI: 99, VIT: 99, SPI: 99, INT: 99, CHA: 99 },
  bonusAttributes: { STR: 0, AGI: 0, VIT: 0, SPI: 0, INT: 0, CHA: 0 },
};
useGameStore.setState({ character: character as never, equippedGear: rollGear(), activeEffects: [] } as never);

function App() {
  return (
    <div className="demo-grid">
      <section className="demo-card">
        <h2>兩欄條列＋可收合</h2>
        <p>預設收合；展開狀態存本機。</p>
        <EquipmentPanel />
      </section>
    </div>
  );
}

document.getElementById('reroll')!.addEventListener('click', () => useGameStore.setState({ equippedGear: rollGear() } as never));
document.getElementById('empty')!.addEventListener('click', () => useGameStore.setState({ equippedGear: {} } as never));

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
