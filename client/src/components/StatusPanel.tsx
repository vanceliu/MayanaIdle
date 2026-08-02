import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { CLASS_NAMES_ZH } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { getEffectiveAffixValue } from '../models/affix';

function getTotalDefense(gear: (EquipmentInstance | null)[], activeEffects: { type: string; target: string; startTime: number; duration: number; modifiers?: { stat: string; value: number }[] }[]): number {
  let rawTotal = 0;
  let defensePercent = 0;
  for (const g of gear) {
    if (!g) continue;
    if (g.defense) rawTotal += g.defense;
    if (g.enhancement && g.defense) rawTotal += g.enhancement;
    if (g.affixes) {
      for (const affix of g.affixes) {
        if (affix.type === 'defense') {
          defensePercent += getEffectiveAffixValue(affix, g.quality);
        }
      }
    }
  }
  const now = Date.now();
  for (const effect of activeEffects) {
    if (effect.type !== 'buff' || effect.target !== 'player') continue;
    if (now - effect.startTime >= effect.duration) continue;
    if (!effect.modifiers) continue;
    for (const mod of effect.modifiers) {
      if (mod.stat === 'defense') rawTotal += mod.value;
    }
  }
  return Math.floor(rawTotal * (1 + defensePercent / 100));
}

export function StatusPanel() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);

  if (!char) return null;

  const effMaxHp = getEffectiveMaxHp(char, gear);
  const effMaxMp = getEffectiveMaxMp(char, gear);
  const hpPercent = Math.floor((char.hp / effMaxHp) * 100);
  const mpPercent = Math.floor((char.mp / effMaxMp) * 100);
  const expPercent = Math.floor((char.exp / char.expToNext) * 100);

  const allGear = Object.values(gear).filter(Boolean) as EquipmentInstance[];

  const totalDef = getTotalDefense(allGear, activeEffects);

  return (
    <div className="status-panel">
      <div className="char-header">
        <span className="char-name">{char.name}</span>
        <span className="char-class">{CLASS_NAMES_ZH[char.className]}</span>
        <span className="char-level">Lv.{char.level}</span>
        <span className="defense-value">防禦: {totalDef}</span>
      </div>

      <div className="bars">
        <div className="bar hp-bar">
          <div className="bar-fill" style={{ width: `${hpPercent}%` }} />
          <span>HP {char.hp}/{effMaxHp}</span>
        </div>
        <div className="bar mp-bar">
          <div className="bar-fill" style={{ width: `${mpPercent}%` }} />
          <span>MP {char.mp}/{effMaxMp}</span>
        </div>
        <div className="bar exp-bar">
          <div className="bar-fill" style={{ width: `${expPercent}%` }} />
          <span>EXP {char.exp}/{char.expToNext}</span>
        </div>
      </div>
    </div>
  );
}
