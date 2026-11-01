/**
 * 城鎮側的試驗場入口（`50-training-ground.md` § 50.2）。
 *
 * 進入不需要等級、不需要卷軸、不消耗任何資源 —— 它是工具不是內容。
 */
import { useGameStore } from '../../stores/gameStore';
import { useTownStore } from '../../stores/townStore';
import { useTrainingGroundStore } from '../../stores/trainingGroundStore';
import { getRegion } from '../../models/mapData';
import { TRAINING_GROUND_REGION_ID } from '../../models/trainingGround';

export function TrainingGroundEntrance() {
  const char = useGameStore(s => s.character);
  const navigateTo = useGameStore(s => s.navigateTo);
  const closeFacility = useTownStore(s => s.closeFacility);
  const setReturnRegion = useTrainingGroundStore(s => s.setReturnRegion);

  if (!char) return null;

  const target = getRegion(TRAINING_GROUND_REGION_ID);

  function enter() {
    if (!char || !target) return;
    // 先記下來源城鎮：離開時要回到這裡，而不是一律丟回薄暮村
    setReturnRegion(char.currentRegion);
    closeFacility();
    navigateTo({ zoneId: target.zoneId, regionId: target.id, floor: null });
  }

  return (
    <div className="training-entrance-panel">
      <p className="shop-greeting">「來打木樁試試身手吧。」</p>
      <div className="panel-scroll">
        <ul className="training-entrance-notes">
          <li>可自訂木樁，量測 DPS、命中率、傷害與 MP 消耗。</li>
          <li><strong>沒有任何獎勵</strong>。</li>
        </ul>
        <button className="inn-btn" onClick={enter} disabled={!target}>
          進入試驗場
        </button>
      </div>
    </div>
  );
}
