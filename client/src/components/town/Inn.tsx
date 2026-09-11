import { useGameStore, getEffectiveMaxHp, getEffectiveMaxMp, INN_PRICES } from '../../stores/gameStore';

export function Inn() {
  const char = useGameStore(s => s.character);
  const gear = useGameStore(s => s.equippedGear);
  // 判定與扣款在 store（線上模式會轉成 RPC 交給 server），這裡只負責畫面
  const restAtInn = useGameStore(s => s.restAtInn);

  if (!char) return null;

  const effMaxHp = getEffectiveMaxHp(char, gear);
  const effMaxMp = getEffectiveMaxMp(char, gear);
  const hpFull = char.hp >= effMaxHp;
  const mpFull = char.mp >= effMaxMp;

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
          onClick={() => restAtInn('full')}
          disabled={char.gold < INN_PRICES.full || (hpFull && mpFull)}
        >
          完全休息（HP + MP 全滿）— {INN_PRICES.full}G
        </button>
        <button
          className="inn-btn"
          onClick={() => restAtInn('hp')}
          disabled={char.gold < INN_PRICES.hpOnly || hpFull}
        >
          回復 HP — {INN_PRICES.hpOnly}G
        </button>
        <button
          className="inn-btn"
          onClick={() => restAtInn('mp')}
          disabled={char.gold < INN_PRICES.mpOnly || mpFull}
        >
          回復 MP — {INN_PRICES.mpOnly}G
        </button>
      </div>
      </div>
    </div>
  );
}
