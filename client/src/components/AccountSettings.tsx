import { useCallback, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { exportCharacterData, downloadExport, importCharacterData } from '../systems/characterTransfer';
import { BuildLabel } from './BuildLabel';

/**
 * 帳號與資料（`47-mobile.md`）。
 *
 * Wiki／匯出／匯入／登出原本是右下角常駐的一整排，但它們**一局裡大概按不到一次** ——
 * 與「開背包」這種每分鐘都在按的操作放在同一層，等於拿最貴的畫面位置去換最低頻的功能。
 * 全部收進設定視窗的「帳號」頁，右下只留一顆 ⚙。
 */
export function AccountSettings({ onClose }: { onClose: () => void }) {
  const logout = useGameStore(s => s.logout);
  const character = useGameStore(s => s.character);
  const selectCharacter = useGameStore(s => s.selectCharacter);
  const uploadOwnStats = useGameStore(s => s.uploadOwnStats);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    if (!character?.id) return;

    // § 19.9：匯出檔含該角色的排行榜寫入密鑰，而檔案的加密金鑰就寫在前端原始碼裡，
    // 等同明文。外流＝對方能覆寫你的排行榜資料，所以這件事必須講在下載之前。
    const confirmed = window.confirm(
      '匯出檔含有這個角色的身分憑證，等同密碼。\n\n' +
      '取得檔案的人可以覆寫你在排行榜上的紀錄，請勿分享或上傳到雲端硬碟、聊天室等地方。\n\n' +
      '確定要匯出嗎？'
    );
    if (!confirmed) return;

    try {
      // 先把統計推一次，讓密鑰在伺服端綁定好再讓檔案出門（§ 37.4.3）。
      // **刻意不檢查結果**：密鑰已經寫進本機與匯出檔，兩台裝置拿到的是同一把，
      // 誰先上傳誰綁定、另一台照樣相符。拿連線當匯出的門檻只會讓玩家在
      // 最需要備份的時候備份不了。
      await uploadOwnStats({ force: true });

      const json = await exportCharacterData(character.id);
      downloadExport(json, character.name);
    } catch (e) {
      alert(`匯出失敗: ${(e as Error).message}`);
    }
  }, [character, uploadOwnStats]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !character?.id) return;

    // § 19.9：匯入是「還原完整身分」，名稱與 uuid 都會被檔案取代
    const confirmed = window.confirm(
      '匯入將覆蓋當前角色的所有資料，包含名稱與排行榜身分。\n\n' +
      '這一格原本的角色會從排行榜上停止更新。確定繼續？'
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    try {
      const json = await file.text();
      await importCharacterData(json, character.id);
      await selectCharacter(character.id);
      alert('匯入成功！');
    } catch (err) {
      alert(`匯入失敗: ${(err as Error).message}`);
    }
    e.target.value = '';
  }, [character, selectCharacter]);

  return (
    <div className="settings-body">
      <div className="settings-row">
        <span className="settings-label">遊戲資料</span>
        <div className="settings-control settings-control-wrap">
          <button className="btn-transfer" onClick={handleExport}>匯出角色</button>
          <button className="btn-transfer" onClick={() => fileInputRef.current?.click()}>匯入角色</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".dat"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
        <p className="settings-hint">
          匯出檔含有這個角色的身分憑證，等同密碼，請勿分享（§ 19.9）。
          匯入會覆蓋目前這一格的角色。
        </p>
      </div>

      <div className="settings-row">
        <span className="settings-label">資料庫</span>
        <div className="settings-control settings-control-wrap">
          <a className="btn-wiki" href="/MayanaIdle/wiki" target="_blank" rel="noopener noreferrer">
            開啟 Wiki
          </a>
        </div>
        <p className="settings-hint">裝備、怪物、詞綴與掉落表的完整查詢。會開新分頁。</p>
      </div>

      <div className="settings-row">
        <span className="settings-label">登出</span>
        <div className="settings-control settings-control-wrap">
          {/* 關掉視窗再登出：登出會換掉整個畫面，留著開啟中的彈窗只會閃一下 */}
          <button className="btn-logout" onClick={() => { onClose(); logout(); }}>登出</button>
        </div>
        <p className="settings-hint">回到角色選擇畫面。存檔在本機，不會遺失。</p>
      </div>

      {/* 版本號：回報問題時第一個要問的資訊，放在最容易被截圖到的地方 */}
      <div className="settings-row settings-build">
        <span className="settings-label">版本</span>
        <BuildLabel />
      </div>
    </div>
  );
}
