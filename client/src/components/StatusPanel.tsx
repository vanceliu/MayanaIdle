import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { getRegion } from '../models/mapData';
import { CLASS_NAMES_ZH, getTotalAttributes, getEffectiveSTR, getEffectiveVIT } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { getItemWeight } from '../models/items';
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

function getCurrentWeight(gear: (EquipmentInstance | null)[]): number {
  return gear.reduce((sum, g) => sum + (g?.weight ?? 0), 0);
}

function getMaxWeight(char: { STR: number; VIT: number }, gear: (EquipmentInstance | null)[]): number {
  const baseCapacity = (char.STR + char.VIT) * 100;
  const equipBonus = gear.reduce((sum, g) => sum + (g?.bonusWeight ?? 0), 0);
  return baseCapacity + equipBonus;
}

export function StatusPanel() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  const bagItems = useGameStore(s => s.bagItems);
  const inventory = useGameStore(s => s.inventory);
  const activeEffects = useGameStore(s => s.activeEffects);

  if (!char) return null;

  const region = getRegion(char.currentRegion);
  const effMaxHp = getEffectiveMaxHp(char, gear);
  const effMaxMp = getEffectiveMaxMp(char, gear);
  const hpPercent = Math.floor((char.hp / effMaxHp) * 100);
  const mpPercent = Math.floor((char.mp / effMaxMp) * 100);
  const expPercent = Math.floor((char.exp / char.expToNext) * 100);
  const floorText = char.currentFloor != null ? ` ${char.currentFloor}F` : '';

  const allGear = Object.values(gear).filter(Boolean) as EquipmentInstance[];
  const attrs = getTotalAttributes(char);
  const effSTR = getEffectiveSTR(attrs.STR);
  const effVIT = getEffectiveVIT(attrs.VIT);

  const equippedWeight = getCurrentWeight(allGear);
  const bagWeight = bagItems.reduce((sum, item) => sum + getItemWeight(item.name) * item.amount, 0);
  const inventoryWeight = inventory.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  const currentWeight = equippedWeight + bagWeight + inventoryWeight;

  const maxWeight = getMaxWeight({ STR: effSTR, VIT: effVIT }, allGear);
  const weightPercent = maxWeight > 0 ? Math.min(100, Math.floor((currentWeight / maxWeight) * 100)) : 0;
  const isOverweight = currentWeight > maxWeight;

  const totalDef = getTotalDefense(allGear, activeEffects);

  return (
    <div className="status-panel">
      <div className="char-header">
        <span className="char-name">{char.name}</span>
        <span className="char-class">{CLASS_NAMES_ZH[char.className]}</span>
        <span className="char-level">Lv.{char.level}</span>
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
        <div className="weight-defense-row">
          <div className={`bar weight-bar ${isOverweight ? 'overweight' : ''}`}>
            <div className="bar-fill" style={{ width: `${weightPercent}%` }} />
            <span>{currentWeight}/{maxWeight} ({weightPercent}%)</span>
          </div>
          <span className="defense-value">防禦: {totalDef}</span>
        </div>
        <div className="bar exp-bar">
          <div className="bar-fill" style={{ width: `${expPercent}%` }} />
          <span>EXP {char.exp}/{char.expToNext}</span>
        </div>
      </div>

      <div className="area-info">
        <span>目前區域: {region?.name ?? char.currentRegion}{floorText}</span>
      </div>
    </div>
  );
}
