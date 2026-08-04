import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../stores/gameStore';
import { CLASS_NAMES_ZH } from '../models/character';
import type { EquipmentInstance } from '../models/equipment';
import { getEffectiveDefense, getCombatBonuses } from '../systems/combat';
import type { ActiveEffect } from '../models/effect';
import { getWeightStatus } from '../systems/weight';


export function StatusPanel() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  const activeEffects = useGameStore(s => s.activeEffects);
  const bagItems = useGameStore(s => s.bagItems);

  if (!char) return null;

  const effMaxHp = getEffectiveMaxHp(char, gear);
  const effMaxMp = getEffectiveMaxMp(char, gear);
  const hpPercent = Math.floor((char.hp / effMaxHp) * 100);
  const mpPercent = Math.floor((char.mp / effMaxMp) * 100);
  const expPercent = Math.floor((char.exp / char.expToNext) * 100);

  const allGear = Object.values(gear).filter(Boolean) as EquipmentInstance[];

  // 防禦一律走 systems/combat 的 getEffectiveDefense —— 這裡原本自己算一份，
  // 漏掉詛咒的 -20%，與戰鬥實際採用的值不一致（`21-combat-formula.md` § 21.5）
  const defenseBonuses = getCombatBonuses(allGear, activeEffects as ActiveEffect[]);
  const totalDef = getEffectiveDefense(allGear, activeEffects as ActiveEffect[], defenseBonuses.defense);
  /**
   * 負重（`20-attributes.md` § 20.7）。超重會擋下攻擊與魔法，所以要常駐可見。
   *
   * 做成進度條是刻意的：**條快滿了＝該回村了**，這是玩家熟悉的讀法。
   * 再依比例變色，讓「還很空／快滿了／滿了」不必讀數字就分得出來。
   */
  const weight = getWeightStatus(char, allGear, bagItems);
  const weightPercent = Math.min(100, Math.floor((weight.carried / Math.max(1, weight.capacity)) * 100));
  const weightLevel = weight.overweight ? 'over'
    : weightPercent >= 90 ? 'critical'
      : weightPercent >= 70 ? 'warning'
        : 'normal';

  return (
    <div className="status-panel">
      <div className="char-header">
        <span className="char-name">{char.name}</span>
        <span className="char-class">{CLASS_NAMES_ZH[char.className]}</span>
        <span className="char-level">Lv.{char.level}</span>
      </div>

      {/* 四條由上往下堆疊；防禦是被動數值，跟負重同一行不另外佔一列（§ 34.3） */}
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
        <div className="bar-row">
          <div className={`bar weight-bar is-${weightLevel}`}>
            <div className="bar-fill" style={{ width: `${weightPercent}%` }} />
            <span>負重 {weight.carried}/{weight.capacity}{weight.overweight ? ' ⚠ 無法攻擊' : ''}</span>
          </div>
          <span className="defense-value">防禦: {totalDef}</span>
        </div>
      </div>
    </div>
  );
}
