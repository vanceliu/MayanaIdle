import { useTalentStore, uninstalledSlots } from '../stores/talentStore';
import { FUSE_INPUT_COUNT, type TalentSlotTier } from '../models/talent';

/**
 * 天賦合成分頁（`51-auto-talent.md` § 51.5.2、§ 51.10）。
 *
 * **這是系統唯一的合成。** 條件與動作一律內建（§ 51.4.1），
 * 沒有升級、定向兌換或降階 —— 那三條路徑隨鑲材一併廢除。
 *
 * 不需要 NPC、不限地點、不收金幣，且**必定成功**：純換算、產物確定。
 */
export function TalentFusion() {
  const slots = useTalentStore(s => s.slots);
  const fuseSlots = useTalentStore(s => s.fuseSlots);
  // 合成只吃完全沒安裝的，不會去拆別份配置（§ 51.5.2）
  const spare = uninstalledSlots(slots);

  return (
    <div className="talent-fusion">
      <section className="fusion-section">
        <h4 className="fusion-heading">
          天賦格
          <span className="fusion-sub">低階 ×2 → 高階 ×1・必定成功</span>
        </h4>
        <div className="fusion-slot-grid">
          {([1, 2, 3] as TalentSlotTier[]).map(tier => {
            const count = spare.filter(s => s.tier === tier).length;
            const can = count >= FUSE_INPUT_COUNT;
            return (
              <div key={tier} className={`fusion-slot-card${can ? '' : ' is-short'}`}>
                <div className="fusion-slot-line">
                  <span className="fusion-chip">T{tier}</span>
                  <span className="fusion-count">×{count}</span>
                  <span className="fusion-arrow">→</span>
                  <span className="fusion-chip is-out">T{tier + 1}</span>
                </div>
                <button className="fusion-go" disabled={!can} onClick={() => fuseSlots(tier)}>
                  合成
                </button>
              </div>
            );
          })}
        </div>
        <p className="fusion-note">
          只吃沒有安裝的天賦格 —— 裝在任何一份天賦配置上的都不會被吃掉。
        </p>
      </section>

      <section className="fusion-section">
        <h4 className="fusion-heading">
          條件與動作
          <span className="fusion-sub">全部內建，不必取得</span>
        </h4>
        <p className="fusion-note">
          條件與動作在天賦格內直接選，沒有掉落、合成或兌換。
          能寫幾條規則、每條掛幾個條件，只看你有幾個天賦格、階級多高。
        </p>
      </section>
    </div>
  );
}
