import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import type { EquipmentInstance } from '../../models/equipment';
import type { ClassName } from '../../models/character';
import {
  claimStarterGear,
  canClaimStarterGear,
  enhanceStarterGear,
  persistStarterEnhance,
  getStarterEnhanceCost,
  getStarterEnhanceMax,
  getStarterEnhanceState,
  getStarterTemplates,
} from '../../systems/starterNpc';
import { SLOT_NAMES, type EquipSlot } from '../../models/equipment';
import { CLASS_NAMES_ZH } from '../../models/character';
import { GameIcon } from '../GameIcon';
import { getEquipIcon } from '../../models/iconMap';
import { STARTER_TIPS } from '../../systems/starterTips';
import { db } from '../../db/database';

type NpcTab = 'talk' | 'claim' | 'enhance';

/** 防具用部位圖示、武器用類型圖示 —— 與背包／裝備欄同一套判定 */
function equipIcon(type: string, slot: EquipSlot): string {
  return getEquipIcon(type === 'armor' ? slot : type);
}


export function StarterNpc() {
  const char = useGameStore(s => s.character);
  const equippedGear = useGameStore(s => s.equippedGear);
  const inventory = useGameStore(s => s.inventory);
  const [tab, setTab] = useState<NpcTab>('talk');
  const [msg, setMsg] = useState<string | null>(null);
  const [openTips, setOpenTips] = useState<string[]>([]);

  function toggleTip(id: string) {
    setOpenTips(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  }

  if (!char) return null;

  const allOwned = [
    ...Object.values(equippedGear).filter(Boolean) as EquipmentInstance[],
    ...inventory,
  ];

  const starterGearOnHand = allOwned.filter(e => e.isStarterGear);
  const canClaim = canClaimStarterGear(char.level);
  // 用 template 而非只有名稱：領取清單要畫部位圖示，資料一律來自 seed
  const starterTemplates = getStarterTemplates(char.className as ClassName);
  const ownedNames = starterGearOnHand.map(e => e.name);
  const missingCount = starterTemplates.filter(t => !ownedNames.includes(t.name)).length;

  async function handleClaim() {
    if (!char) return;
    const result = await claimStarterGear(
      char.id!,
      char.className as ClassName,
      char.level,
      allOwned,
    );
    if (result.claimed.length === 0) {
      setMsg('你已經擁有所有新手裝備了。');
      return;
    }
    const inv = useGameStore.getState().inventory;
    useGameStore.setState({ inventory: [...inv, ...result.claimed] });
    useGameStore.getState().saveState();
    setMsg(`獲得了 ${result.claimed.map(e => e.name).join('、')}！`);
  }

  async function handleEnhance(item: EquipmentInstance) {
    if (!char) return;
    const cost = getStarterEnhanceCost();
    if (char.gold < cost) {
      setMsg('金幣不足！');
      return;
    }
    const state = getStarterEnhanceState(item);
    if (state !== 'enhanceable') {
      setMsg(state === 'unsupported' ? '此部位不適用強化系統。' : '此裝備已達強化上限。');
      return;
    }

    const enhanced = enhanceStarterGear(item);
    await persistStarterEnhance(enhanced);

    const newChar = { ...char, gold: char.gold - cost };
    await db.characters.update(char.id!, { gold: newChar.gold });

    const equip = useGameStore.getState().equippedGear;
    const inv = useGameStore.getState().inventory;

    const inEquipped = Object.entries(equip).find(([, v]) => v?.id === item.id);
    if (inEquipped) {
      useGameStore.setState({
        character: newChar,
        equippedGear: { ...equip, [inEquipped[0]]: enhanced },
      });
    } else {
      useGameStore.setState({
        character: newChar,
        inventory: inv.map(i => i.id === item.id ? enhanced : i),
      });
    }
    useGameStore.getState().saveState();
    setMsg(`${enhanced.name} 強化成功！(+${enhanced.enhancement})`);
  }

  /** 強化進度格：填滿的格數 = 目前強化等級，總格數 = 安定值 */
  function renderEnhanceTrack(current: number, max: number) {
    return (
      <span className="starter-track" aria-label={`強化 ${current} / ${max}`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`starter-track-cell${i < current ? ' filled' : ''}`} />
        ))}
      </span>
    );
  }

  function renderEnhanceRow(item: EquipmentInstance) {
    const state = getStarterEnhanceState(item);
    const max = getStarterEnhanceMax(item);
    const cost = getStarterEnhanceCost();
    const affordable = char!.gold >= cost;

    return (
      <div key={item.id} className={`shop-item starter-row is-${state}`}>
        <div className="shop-item-info">
          <span className="starter-row-name">
            <GameIcon name={equipIcon(item.type, item.slot)} size={18} />
            {item.name}
          </span>
          {/* 腰帶沒有強化軌道可畫（安定值 -1），只留說明 */}
          {state === 'unsupported' ? (
            <span className="starter-row-note">此部位不適用強化系統</span>
          ) : (
            <span className="starter-row-progress">
              {renderEnhanceTrack(item.enhancement, max)}
              <span className="starter-row-level">+{item.enhancement} / +{max}</span>
            </span>
          )}
        </div>
        <div className="shop-item-actions">
          {state === 'enhanceable' && (
            <button
              className="shop-action-btn"
              onClick={() => handleEnhance(item)}
              disabled={!affordable}
              title={affordable ? undefined : '金幣不足'}
            >
              強化 {cost.toLocaleString()}G
            </button>
          )}
          {state === 'maxed' && <span className="starter-badge is-done">已滿</span>}
          {state === 'unsupported' && <span className="starter-badge is-muted">不可強化</span>}
        </div>
      </div>
    );
  }

  function renderEnhanceList() {
    if (starterGearOnHand.length === 0) {
      return <p className="empty-text">你沒有任何新手裝備。</p>;
    }
    // 可強化的排在前面，玩家一開面板就看到還能動的目標
    const order: Record<string, number> = { enhanceable: 0, maxed: 1, unsupported: 2 };
    const sorted = [...starterGearOnHand].sort(
      (a, b) => order[getStarterEnhanceState(a)] - order[getStarterEnhanceState(b)],
    );
    return <div className="shop-items">{sorted.map(renderEnhanceRow)}</div>;
  }

  return (
    <div className="starter-npc-panel">
      <p className="shop-greeting">「歡迎來到薄暮村！我是新手指導員，讓我來幫助你開始冒險吧。」</p>
      <div className="shop-gold">持有金幣: {char.gold.toLocaleString()}G</div>

      <div className="shop-tabs">
        <button className={tab === 'talk' ? 'active' : ''} onClick={() => { setTab('talk'); setMsg(null); }}>對話</button>
        <button className={tab === 'claim' ? 'active' : ''} onClick={() => { setTab('claim'); setMsg(null); }}>領取裝備</button>
        <button className={tab === 'enhance' ? 'active' : ''} onClick={() => { setTab('enhance'); setMsg(null); }}>強化裝備</button>
      </div>

      {msg && <p className="starter-msg">{msg}</p>}

      {/* 只有分頁內容會捲動，金幣與分頁固定在上方 */}
      <div className="panel-scroll">
      {tab === 'talk' && (
        <div className="starter-talk">
          {/* 三句是同一段對白，收成一張說話卡，不要各自浮在頁面上 */}
          <div className="starter-dialogue">
            <p>「身為一名{CLASS_NAMES_ZH[char.className as ClassName]}，你需要合適的裝備才能踏上冒險之路。」</p>
            <p>「我可以提供你一套新手裝備，還能幫你強化它們。」</p>
            <p>「不過要注意，這些裝備是特製的，不能存入倉庫或販售，只能穿在身上或丟棄。」</p>
          </div>
          {!canClaim && <p className="starter-warning">「你的等級已超過 30，無法再領取新手裝備了。」</p>}

          {/* 前期知識：條列說明，預設收合，玩家自行點開需要的主題 */}
          <div className="starter-tips">
            <h4 className="starter-tips-title">冒險前的基本知識</h4>
            {STARTER_TIPS.map(section => {
              const open = openTips.includes(section.id);
              return (
                <div key={section.id} className={`starter-tip-section ${open ? 'open' : ''}`}>
                  <button
                    className="starter-tip-header"
                    aria-expanded={open}
                    onClick={() => toggleTip(section.id)}
                  >
                    <span className="starter-tip-arrow" aria-hidden="true">{open ? '▼' : '▶'}</span>
                    {section.title}
                  </button>
                  {open && (
                    <ul className="starter-tip-list">
                      {section.tips.map(tip => <li key={tip}>{tip}</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'claim' && (
        <div className="starter-claim">
          {!canClaim ? (
            <p className="starter-warning">等級超過 30，無法領取新手裝備。</p>
          ) : (
            <>
              <div className="starter-info-card">
                <p>可領取裝備（{CLASS_NAMES_ZH[char.className as ClassName]}套裝）</p>
                <p className="starter-note">
                  {missingCount === 0 ? '這一套你都拿齊了。' : `尚缺 ${missingCount} 件。`}
                </p>
              </div>
              <div className="shop-items">
                {starterTemplates.map(tpl => {
                  const owned = ownedNames.includes(tpl.name);
                  return (
                    <div key={tpl.name} className={`shop-item starter-row ${owned ? 'is-owned' : ''}`}>
                      <div className="shop-item-info">
                        <span className="starter-row-name">
                          <GameIcon name={equipIcon(tpl.type, tpl.slot)} size={18} />
                          {tpl.name}
                        </span>
                        <span className="starter-row-note">{SLOT_NAMES[tpl.slot]}</span>
                      </div>
                      <div className="shop-item-actions">
                        <span className={`starter-badge ${owned ? 'is-done' : 'is-missing'}`}>
                          {owned ? '已擁有' : '未擁有'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                className="starter-claim-btn"
                onClick={handleClaim}
                disabled={missingCount === 0}
              >
                {missingCount === 0 ? '已全部擁有' : `領取缺少的裝備（${missingCount} 件）`}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'enhance' && (
        <div className="starter-enhance">
          <div className="starter-info-card">
            <p><strong>{getStarterEnhanceCost().toLocaleString()}G</strong> / 次，不需要卷軸</p>
            <p className="starter-note">
              上限為安定值（武器 +6、防具 +4），安定值內<strong>必定成功</strong>，不會失敗消失。
            </p>
          </div>
          {renderEnhanceList()}
        </div>
      )}
      </div>
    </div>
  );
}
