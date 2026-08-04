import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp } from '../../stores/gameStore';

const INN_PRICES = {
  full: 50,
  hpOnly: 30,
  mpOnly: 20,
};

export function Inn() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  const set = useGameStore.setState;

  if (!char) return null;

  const effMaxHp = getEffectiveMaxHp(char, gear);
  const effMaxMp = getEffectiveMaxMp(char, gear);
  const hpFull = char.hp >= effMaxHp;
  const mpFull = char.mp >= effMaxMp;

  function restFull() {
    if (!char || char.gold < INN_PRICES.full) return;
    // § 24.10.4：休息同時解除所有角色 debuff
    const remainingEffects = useGameStore.getState().activeEffects.filter(
      e => !(e.type === 'debuff' && e.target === 'player')
    );
    set({
      character: { ...char, hp: effMaxHp, mp: effMaxMp, gold: char.gold - INN_PRICES.full },
      activeEffects: remainingEffects,
    });
    useGameStore.getState().saveState();
  }

  function restHp() {
    if (!char || char.gold < INN_PRICES.hpOnly || hpFull) return;
    set({
      character: { ...char, hp: effMaxHp, gold: char.gold - INN_PRICES.hpOnly },
    });
    useGameStore.getState().saveState();
  }

  function restMp() {
    if (!char || char.gold < INN_PRICES.mpOnly || mpFull) return;
    set({
      character: { ...char, mp: effMaxMp, gold: char.gold - INN_PRICES.mpOnly },
    });
    useGameStore.getState().saveState();
  }

  return (
    <div className="inn-panel">
      <p className="shop-greeting">「旅途辛苦了，要休息一下嗎？」</p>
      <div className="shop-gold">持有金幣: {char.gold}G</div>
      {/* 只有內容會捲動，問候語與金幣固定在上方 */}
      <div className="panel-scroll">
      <div className="inn-status">
        <span>HP: {char.hp}/{effMaxHp}</span>
        <span>MP: {char.mp}/{effMaxMp}</span>
      </div>
      <div className="inn-options">
        <button
          className="inn-btn"
          onClick={restFull}
          disabled={char.gold < INN_PRICES.full || (hpFull && mpFull)}
        >
          完全休息（HP + MP 全滿）— {INN_PRICES.full}G
        </button>
        <button
          className="inn-btn"
          onClick={restHp}
          disabled={char.gold < INN_PRICES.hpOnly || hpFull}
        >
          回復 HP — {INN_PRICES.hpOnly}G
        </button>
        <button
          className="inn-btn"
          onClick={restMp}
          disabled={char.gold < INN_PRICES.mpOnly || mpFull}
        >
          回復 MP — {INN_PRICES.mpOnly}G
        </button>
      </div>
      </div>
    </div>
  );
}
